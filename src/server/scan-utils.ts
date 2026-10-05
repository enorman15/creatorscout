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

// ── pitch hygiene ───────────────────────────────────────────────────────────

/**
 * Phrases that make outreach read as machine-written. Shared with the
 * resume checker's list, plus outreach clichés. Matched case-insensitively
 * on word boundaries.
 */
export const BANNED_PHRASES = [
  // generic AI/corporate tells
  'leverage', 'leveraged', 'leveraging', 'utilize', 'synergy', 'seamless', 'seamlessly', 'robust',
  'cutting-edge', 'cutting edge', 'game-changer', 'game changer', 'game-changing', 'unlock', 'unlocking',
  'empower', 'elevate', 'holistic', 'ecosystem', 'innovative', 'transformative', 'revolutionize',
  'revolutionary', 'world-class', 'best-in-class', 'delve', 'dive into', 'deep dive', 'tapestry',
  'testament', 'resonate', 'resonates', 'at the intersection of', 'navigate the', 'landscape',
  'in today\'s', 'fast-paced', 'supercharge', 'next level', 'next-level', 'harness',
  // outreach clichés
  'i hope this finds you well', 'hope you\'re doing well', 'hope you are doing well', 'i came across',
  'came across your', 'i stumbled upon', 'big fan', 'huge fan', 'love your content', 'i\'d love to',
  'i would love to', 'excited to', 'thrilled', 'reach out', 'reaching out', 'touch base', 'circle back',
  'quick question', 'no pressure', 'just wanted to', 'perfect fit', 'amazing', 'incredible', 'awesome',
  'mutually beneficial', 'win-win', 'collaboration opportunity', 'partnership opportunity',
]

/** Banned phrases present in `text` (lowercased, deduped). */
export function slopHits(text: string): string[] {
  const low = text.toLowerCase().replace(/[’‘]/g, "'")
  return BANNED_PHRASES.filter((p) => {
    const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`).test(low)
  })
}

/**
 * Deterministic cleanup that runs on every pitch, whatever the model did:
 * no em/en dashes, no exclamation points, no "Subject:" line, no wrapping
 * quotes, straight apostrophes, single spaces.
 */
export function cleanPitch(text: string): string {
  return text
    .replace(/^\s*subject:.*\n+/i, '')
    .replace(/\s*[—–]\s*/g, ', ') // em/en dash used as punctuation → comma
    .replace(/,\s*,/g, ',')
    .replace(/,(\s*[.?])/g, '$1')
    .replace(/!+/g, '.')
    .replace(/[“”]/g, '"')
    .replace(/[’‘]/g, "'")
    .replace(/…/g, '...')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .replace(/^"([\s\S]*)"$/, '$1')
    .trim()
}
