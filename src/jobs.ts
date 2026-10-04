/**
 * Background jobs — invoked by AppJobRoom (worker.ts).
 *
 * `scan` is the app's one job. It is enqueued by the `startScout` action and
 * runs a scout end to end:
 *
 *   1. fetch creators from each requested platform (in parallel)
 *   2. filter + shortlist per platform
 *   3. score the shortlist with Claude in one batch
 *   4. write `creators` rows and mark the scout done
 *
 * A platform that fails (an upstream outage, an actor timeout) is recorded in
 * `scout.warnings` instead of failing the whole scan — two good platforms are
 * still a useful result. Progress is broadcast over the JobRoom socket so the
 * dashboard shows a live bar.
 */

import type { Job, JobContext } from 'deepspace/worker'
import type { Env } from '../worker'
import {
  fetchInstagram,
  fetchTikTok,
  fetchYouTube,
  recordTool,
  scoreCreators,
  shortlist,
  type Candidate,
  type Platform,
} from './server/scan'
import { friendlyError } from './server/scan-utils'

interface ScanPayload {
  scoutId: string
  userId: string
}

interface Scout {
  topic: string
  brief?: string
  platforms: Platform[]
  hashtags?: string[]
  minFollowers?: number
}

export async function runJob(job: Job, ctx: JobContext, env: Env): Promise<unknown> {
  if (job.type !== 'scan') throw new Error(`Unknown job type: ${job.type}`)

  const { scoutId, userId } = job.payload as ScanPayload
  const setScout = (data: Record<string, unknown>) =>
    recordTool(env, userId, 'records.update', { collection: 'scouts', recordId: scoutId, data })

  const { record } = await recordTool<{ record: { data: Scout; createdBy: string } }>(env, userId, 'records.get', {
    collection: 'scouts',
    recordId: scoutId,
  })
  const scout = record.data
  // The payload's userId is trusted only because the action wrote it; still
  // refuse to act on a scout that belongs to someone else.
  if ((record.data as unknown as { userId: string }).userId !== userId) throw new Error('scout owner mismatch')

  // Retry safety: a previous attempt may have written some rows already.
  await recordTool(env, userId, 'records.deleteWhere', { collection: 'creators', where: { scoutId }, limit: 500 })

  await setScout({ status: 'scanning', error: null })
  ctx.progress(0.05, `Searching ${scout.platforms.join(', ')}…`)

  const warnings: Record<string, string> = {}
  const done = new Set<string>()
  const tick = (p: string) => {
    done.add(p)
    ctx.progress(0.05 + 0.6 * (done.size / scout.platforms.length), `Finished ${[...done].join(', ')}`)
  }

  const sources: Record<Platform, () => Promise<Candidate[]>> = {
    youtube: () => fetchYouTube(env, ctx, scout.topic),
    tiktok: () => fetchTikTok(env, ctx, scout.topic),
    instagram: () => fetchInstagram(env, ctx, scout.hashtags ?? []),
  }

  const runPlatform = async (p: Platform): Promise<Candidate[]> => {
    try {
      const found = await sources[p]()
      tick(p)
      return shortlist(found, scout.minFollowers ?? 0)
    } catch (err) {
      if (ctx.signal.aborted) throw err
      const raw = err instanceof Error ? err.message : String(err)
      console.warn(`[scan] ${p} failed for scout ${scoutId}: ${raw}`)
      warnings[p] = friendlyError(raw)
      tick(p)
      return []
    }
  }

  // YouTube runs alongside the Apify platforms, but TikTok and Instagram run
  // one after the other: each Apify run reserves its spend cap up front, and
  // two concurrent reservations were refused with insufficient_credits on a
  // free-tier balance during testing.
  const apifyChain = async () => {
    const out: Candidate[] = []
    for (const p of scout.platforms.filter((x) => x !== 'youtube')) out.push(...(await runPlatform(p)))
    return out
  }
  const results = await Promise.all([
    scout.platforms.includes('youtube') ? runPlatform('youtube') : Promise.resolve([]),
    apifyChain(),
  ])
  const candidates = results.flat()

  const counts: Record<string, number> = {}
  for (const p of scout.platforms) counts[p] = 0

  if (candidates.length === 0) {
    await setScout({ status: Object.keys(warnings).length ? 'failed' : 'done', counts, warnings, error: Object.keys(warnings).length ? 'Every platform failed — see warnings.' : null })
    ctx.progress(1, 'No creators found')
    return { creators: 0, warnings }
  }

  await setScout({ status: 'scoring' })
  ctx.progress(0.7, `Scoring ${candidates.length} creators with Claude…`)
  const scored = await scoreCreators(env, ctx, scout.topic, scout.brief ?? '', candidates)

  ctx.progress(0.9, 'Saving results…')
  for (const c of scored) {
    await recordTool(env, userId, 'records.create', {
      collection: 'creators',
      data: {
        userId,
        scoutId,
        platform: c.platform,
        handle: c.handle,
        name: c.name,
        url: c.url,
        avatarUrl: c.avatarUrl,
        bio: c.bio,
        followers: c.followers,
        avgViews: c.avgViews,
        engagement: c.engagement,
        posts: c.posts.slice(0, 5),
        fitScore: c.fitScore,
        fitReason: c.fitReason,
        stage: 'new',
      },
    })
    counts[c.platform] = (counts[c.platform] ?? 0) + 1
  }

  await setScout({ status: 'done', counts, warnings })
  ctx.progress(1, `Found ${scored.length} creators`)
  return { creators: scored.length, warnings }
}
