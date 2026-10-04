/**
 * Creator scan engine — the work behind the `scan` background job.
 *
 * One scan = one scout row. For each requested platform we pull public
 * content about the topic, group it by creator, and compute reach numbers.
 * Then Claude scores every creator against the user's brief in one batch,
 * and the results are written as `creators` rows owned by the scout's owner.
 *
 * Every outside call goes through the DeepSpace integration proxy
 * (owner-billed via APP_OWNER_JWT) — the app holds no third-party API keys.
 *
 * Platform sources (all verified with live calls before this was written):
 *   youtube    youtube/search-videos → youtube/get-video-details (batched ids)
 *   tiktok     apify clockworks/tiktok-scraper (keyword search)
 *   instagram  apify instagram-scraper (hashtag posts) → instagram-profile-scraper
 *              Instagram's account search only matches usernames, so we find
 *              the content first and then look up who made it.
 */

import { generateText } from 'ai'
import { apiWorkerFetch, createDeepSpaceAI } from 'deepspace/worker'
import type { JobContext } from 'deepspace/worker'
import type { Env } from '../../worker'

import { MAX_PER_PLATFORM, metrics, parseJsonArray, type Candidate, type Platform, type Post } from './scan-utils'

export type { Candidate, Platform, Post }
export { shortlist } from './scan-utils'

export interface ScoredCreator extends Candidate {
  avgViews: number
  engagement: number
  fitScore: number
  fitReason: string
}

const SCORE_MODEL = 'claude-haiku-4-5'
// Keep the Claude batch and the written rows bounded no matter what comes back.
// Apify bills per event; this is a ceiling the run can't exceed, not the
// expected cost (test runs cost $0.02–0.04). TikTok's actor refuses < $0.50.
const APIFY_MAX_CHARGE_USD = 0.5
const APIFY_POLL_MS = 5_000
const APIFY_POLL_ATTEMPTS = 48 // ~4 minutes

// ── plumbing ────────────────────────────────────────────────────────────────

/** Owner-billed integration call from worker context. */
export async function callIntegration<T>(env: Env, endpoint: string, params: unknown, signal?: AbortSignal): Promise<T> {
  if (!env.APP_OWNER_JWT) throw new Error('APP_OWNER_JWT not configured')
  const res = await apiWorkerFetch(env, `/api/integrations/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.APP_OWNER_JWT}` },
    body: JSON.stringify(params),
    signal,
  })
  const text = await res.text()
  const body = text ? JSON.parse(text) : {}
  if (!res.ok || !body.success) {
    const detail = body.details ? ` ${JSON.stringify(body.details)}` : ''
    throw new Error(`${endpoint}: ${body.error || body.message || `HTTP ${res.status}`}${body.code ? ` [${body.code}]` : ''}${detail}`)
  }
  return body.data as T
}

/**
 * Call the RecordRoom tools API as `userId`. X-App-Action turns per-record
 * RBAC off (same as server actions), so callers must only pass ids they
 * already own — the scan job only ever touches its own scout's rows.
 */
export async function recordTool<T = unknown>(env: Env, userId: string, tool: string, params: Record<string, unknown>): Promise<T> {
  const room = env.RECORD_ROOMS.get(env.RECORD_ROOMS.idFromName(`app:${env.DEEPSPACE_APP_ID}`))
  const res = await room.fetch(
    new Request('https://internal/api/tools/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': userId, 'X-App-Action': 'true' },
      body: JSON.stringify({ tool, params }),
    }),
  )
  const body = (await res.json()) as { success: boolean; data?: T; error?: string }
  if (!body.success) throw new Error(body.error || `RecordRoom ${tool} failed`)
  return body.data as T
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new Error('canceled'))
    })
  })

const num = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Start an Apify actor and poll until it finishes; returns dataset items. */
async function runApify(env: Env, ctx: JobContext, actorId: string, input: unknown, maxItems: number): Promise<any[]> {
  const started = await callIntegration<{ jobId: string }>(
    env,
    'apify/run-actor',
    { actorId, input, maxItems, maxTotalChargeUsd: APIFY_MAX_CHARGE_USD, timeout: 240 },
    ctx.signal,
  )
  for (let i = 0; i < APIFY_POLL_ATTEMPTS; i++) {
    await sleep(APIFY_POLL_MS, ctx.signal)
    const run = await callIntegration<{ status: string; statusMessage?: string; items?: any[] }>(
      env,
      'apify/get-run',
      { runId: started.jobId },
      ctx.signal,
    )
    if (run.status === 'SUCCEEDED') return run.items ?? []
    if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(run.status)) {
      throw new Error(`${actorId} ${run.status}${run.statusMessage ? `: ${run.statusMessage}` : ''}`)
    }
  }
  throw new Error(`${actorId} did not finish in time`)
}

// ── platforms ───────────────────────────────────────────────────────────────

export async function fetchYouTube(env: Env, ctx: JobContext, topic: string): Promise<Candidate[]> {
  const search = await callIntegration<{ videos: any[] }>(
    env,
    'youtube/search-videos',
    { q: topic, maxResults: 40, order: 'relevance' },
    ctx.signal,
  )
  const ids = search.videos.map((v) => v.id?.videoId).filter(Boolean) as string[]
  if (ids.length === 0) return []
  // One call returns statistics for every id (comma-separated, ≤50).
  const details = await callIntegration<{ videos: any[] }>(env, 'youtube/get-video-details', { id: ids.join(',') }, ctx.signal)

  const byChannel = new Map<string, Candidate>()
  for (const v of details.videos) {
    const channelId = v.snippet?.channelId
    if (!channelId) continue
    const c: Candidate = byChannel.get(channelId) ?? {
      platform: 'youtube' as const,
      handle: channelId,
      name: v.snippet.channelTitle ?? channelId,
      url: `https://www.youtube.com/channel/${channelId}`,
      avatarUrl: v.snippet.thumbnails?.default?.url,
      posts: [],
    }
    c.posts.push({
      title: v.snippet.title ?? '',
      url: `https://www.youtube.com/watch?v=${v.id}`,
      views: num(v.statistics?.viewCount),
      likes: num(v.statistics?.likeCount) + num(v.statistics?.commentCount),
    })
    byChannel.set(channelId, c)
  }
  return [...byChannel.values()]
}

export async function fetchTikTok(env: Env, ctx: JobContext, topic: string): Promise<Candidate[]> {
  const items = await runApify(
    env,
    ctx,
    'clockworks/tiktok-scraper',
    { searchQueries: [topic], resultsPerPage: 40 },
    40,
  )
  const byAuthor = new Map<string, Candidate>()
  for (const it of items) {
    const a = it.authorMeta ?? {}
    const handle = String(a.name ?? '').trim()
    if (!handle) continue
    const c: Candidate = byAuthor.get(handle) ?? {
      platform: 'tiktok' as const,
      handle,
      name: a.nickName || handle,
      url: `https://www.tiktok.com/@${handle}`,
      avatarUrl: a.avatar,
      bio: a.signature,
      followers: num(a.fans),
      posts: [],
    }
    c.posts.push({
      title: String(it.text ?? '').slice(0, 140),
      url: it.webVideoUrl ?? c.url,
      views: num(it.playCount),
      likes: num(it.diggCount) + num(it.commentCount),
    })
    byAuthor.set(handle, c)
  }
  return [...byAuthor.values()]
}

export async function fetchInstagram(env: Env, ctx: JobContext, hashtags: string[]): Promise<Candidate[]> {
  const tags = hashtags.slice(0, 3)
  if (tags.length === 0) return []
  const posts = await runApify(
    env,
    ctx,
    'apify/instagram-scraper',
    {
      directUrls: tags.map((t) => `https://www.instagram.com/explore/tags/${encodeURIComponent(t)}/`),
      resultsType: 'posts',
      resultsLimit: 20,
    },
    60,
  )

  const byOwner = new Map<string, { posts: Post[]; score: number }>()
  for (const p of posts) {
    const owner = String(p.ownerUsername ?? '').trim()
    if (!owner) continue
    const likes = num(p.likesCount) + num(p.commentsCount)
    const entry = byOwner.get(owner) ?? { posts: [], score: 0 }
    entry.posts.push({
      title: String(p.caption ?? '').slice(0, 140),
      url: p.url ?? `https://www.instagram.com/${owner}/`,
      views: num(p.videoViewCount ?? p.videoPlayCount),
      likes,
    })
    entry.score += likes
    byOwner.set(owner, entry)
  }
  // Only look up profiles for the most-engaged posters (profile lookups cost).
  const top = [...byOwner.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, MAX_PER_PLATFORM)
  if (top.length === 0) return []

  const profiles = await runApify(
    env,
    ctx,
    'apify/instagram-profile-scraper',
    { usernames: top.map(([u]) => u) },
    top.length,
  )
  const profileBy = new Map(profiles.map((p) => [String(p.username), p]))

  return top.map(([handle, entry]) => {
    const p = profileBy.get(handle) ?? {}
    return {
      platform: 'instagram' as const,
      handle,
      name: p.fullName || handle,
      url: `https://www.instagram.com/${handle}/`,
      avatarUrl: p.profilePicUrl,
      bio: p.biography,
      followers: p.followersCount != null ? num(p.followersCount) : undefined,
      posts: entry.posts,
    }
  })
}

// ── metrics + scoring ───────────────────────────────────────────────────────

/**
 * One Claude call scores every shortlisted creator 0–100 against the brief.
 * Creators the model skips get a neutral score rather than being dropped, so
 * a partial response never loses scraped data.
 */
export async function scoreCreators(
  env: Env,
  ctx: JobContext,
  topic: string,
  brief: string,
  cands: Candidate[],
): Promise<ScoredCreator[]> {
  const rows = cands.map((c, i) => {
    const m = metrics(c)
    return {
      id: i,
      platform: c.platform,
      name: c.name,
      handle: c.handle,
      followers: c.followers ?? null,
      avgViews: m.avgViews,
      engagement: Number(m.engagement.toFixed(3)),
      bio: (c.bio ?? '').slice(0, 200),
      posts: c.posts.slice(0, 3).map((p) => p.title.slice(0, 100)),
    }
  })

  const ai = createDeepSpaceAI(env, 'anthropic')
  const { text } = await generateText({
    model: ai(SCORE_MODEL),
    system: [
      'You score social media creators as partnership candidates for a brand.',
      'Score 0-100 on fit: how directly their recent content matches the topic and brief,',
      'whether their audience is the people the brief wants to reach, and real engagement',
      '(not just size). Off-topic, spammy, or referral-link-only accounts score under 20.',
      'Reply with ONLY a JSON array: [{"id": number, "score": number, "reason": string}].',
      'Each reason is one specific sentence citing their actual content.',
    ].join(' '),
    prompt: `Topic: ${topic}\nBrief: ${brief || '(none given)'}\n\nCreators:\n${JSON.stringify(rows)}`,
    maxOutputTokens: 4000,
    abortSignal: ctx.signal,
  })

  const byId = new Map(parseJsonArray(text).map((r) => [Number(r.id), r]))
  return cands.map((c, i) => {
    const r = byId.get(i)
    return {
      ...c,
      ...metrics(c),
      fitScore: r ? Math.max(0, Math.min(100, Math.round(num(r.score)))) : 50,
      fitReason: r?.reason ? String(r.reason) : 'Not scored — the model returned no rating for this creator.',
    }
  })
}
