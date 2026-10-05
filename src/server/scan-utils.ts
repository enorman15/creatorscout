/**
 * Pure scan helpers — no network, no SDK imports — so they are unit-tested
 * directly (src/server/scan-utils.test.ts).
 */

export type Platform = 'youtube' | 'tiktok' | 'instagram'

export interface Post {
  title: string
  url: string
  views: number
  likes: number
}

export interface Candidate {
  platform: Platform
  handle: string
  name: string
  url: string
  avatarUrl?: string
  bio?: string
  followers?: number
  posts: Post[]
  /** Precomputed reach from the source (Instagram's actor returns medians,
   *  not per-post rows); when present it wins over the per-post math. */
  stats?: { avgViews: number; engagement: number }
}

export const MAX_PER_PLATFORM = 15

export function metrics(c: Candidate): { avgViews: number; engagement: number } {
  if (c.stats) return c.stats
  const withViews = c.posts.filter((p) => p.views > 0)
  const views = withViews.reduce((s, p) => s + p.views, 0)
  const likes = withViews.reduce((s, p) => s + p.likes, 0)
  return {
    avgViews: withViews.length ? Math.round(views / withViews.length) : 0,
    engagement: views > 0 ? Math.min(1, likes / views) : 0,
  }
}

/** Rough reach used only to pick which creators make the cut per platform. */
export function reach(c: Candidate): number {
  const m = metrics(c)
  return (c.followers ?? 0) + m.avgViews * 2 + c.posts.reduce((s, p) => s + p.likes, 0)
}

/**
 * Drop creators under the follower floor (YouTube has no follower count in
 * the catalog endpoints, and unknown counts are kept rather than guessed),
 * then keep the highest-reach MAX_PER_PLATFORM.
 */
export function shortlist(cands: Candidate[], minFollowers: number, max = MAX_PER_PLATFORM): Candidate[] {
  return cands
    .filter((c) => c.platform === 'youtube' || c.followers == null || c.followers >= minFollowers)
    .sort((a, b) => reach(b) - reach(a))
    .slice(0, max)
}

/**
 * Clean the user's Instagram hashtags ("#CursorAI", "claude-code" →
 * "cursorai", "claudecode"), dedupe, cap at three. The topic is NOT turned
 * into a hashtag: a made-up tag like "cursoraicoding" doesn't exist on
 * Instagram and made the whole Apify run fail in testing. With no tags, the
 * scan uses the actor's keyword search on the topic instead.
 */
export function toHashtags(extra: unknown): string[] {
  const clean = (s: string) => s.toLowerCase().replace(/^#/, '').replace(/[^a-z0-9_]/g, '')
  const tags = (Array.isArray(extra) ? extra.map((t) => clean(String(t))) : []).filter((t) => t.length >= 2)
  return [...new Set(tags)].slice(0, 3)
}

/**
 * Turn an integration failure into a sentence a user can act on. Raw text is
 * kept after the friendly part so the owner can still debug from the UI.
 */
export function friendlyError(raw: string): string {
  if (/insufficient_credits/i.test(raw)) {
    return 'Not enough DeepSpace credits for this platform. Apify places a $2 hold per run (refunded after), so the balance must stay above $2.'
  }
  if (/credits is not enough|402/i.test(raw)) return 'The data provider for this platform is out of credits upstream.'
  if (/did not finish in time|TIMED-OUT/i.test(raw)) return 'The scraper took too long and was stopped. Try again with a narrower topic.'
  return raw.slice(0, 300)
}

/** Tolerant JSON-array extraction from a model reply (prose or fences around it). */
export function parseJsonArray(text: string): any[] {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start < 0 || end <= start) return []
  try {
    const v = JSON.parse(text.slice(start, end + 1))
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
