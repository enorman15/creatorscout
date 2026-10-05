import { describe, expect, it } from 'vitest'
import { cleanPitch, friendlyError, metrics, parseJsonArray, shortlist, slopHits, toHashtags, type Candidate } from './scan-utils'

const creator = (over: Partial<Candidate>): Candidate => ({
  platform: 'tiktok',
  handle: 'h',
  name: 'n',
  url: 'u',
  posts: [],
  ...over,
})

describe('metrics', () => {
  it('averages views and computes engagement over posts that have views', () => {
    const m = metrics(
      creator({
        posts: [
          { title: 'a', url: '', views: 1000, likes: 100 },
          { title: 'b', url: '', views: 3000, likes: 100 },
          { title: 'image post, no views', url: '', views: 0, likes: 999 },
        ],
      }),
    )
    expect(m.avgViews).toBe(2000)
    expect(m.engagement).toBeCloseTo(200 / 4000)
  })

  it('uses source-provided stats when present (Instagram medians)', () => {
    expect(metrics(creator({ stats: { avgViews: 1341, engagement: 0.005 } }))).toEqual({ avgViews: 1341, engagement: 0.005 })
  })

  it('returns zeros when nothing has views', () => {
    expect(metrics(creator({ posts: [{ title: 'x', url: '', views: 0, likes: 5 }] }))).toEqual({ avgViews: 0, engagement: 0 })
  })
})

describe('shortlist', () => {
  it('drops creators under the follower floor but keeps YouTube and unknown counts', () => {
    const out = shortlist(
      [
        creator({ handle: 'small', followers: 50 }),
        creator({ handle: 'big', followers: 5000 }),
        creator({ handle: 'unknown', followers: undefined }),
        creator({ handle: 'yt', platform: 'youtube', followers: undefined }),
      ],
      1000,
    )
    expect(out.map((c) => c.handle).sort()).toEqual(['big', 'unknown', 'yt'])
  })

  it('caps the list and keeps the highest reach first', () => {
    const many = Array.from({ length: 30 }, (_, i) => creator({ handle: `c${i}`, followers: i * 100 }))
    const out = shortlist(many, 0, 5)
    expect(out).toHaveLength(5)
    expect(out[0].handle).toBe('c29')
  })
})

describe('toHashtags', () => {
  it('cleans user tags, dedupes, and caps at three', () => {
    expect(toHashtags(['#CursorAI', 'claude-code', 'cursorai', 'x', 'vibecoding', 'agents'])).toEqual(['cursorai', 'claudecode', 'vibecoding'])
  })

  it('never invents a tag from the topic, and ignores a non-array', () => {
    expect(toHashtags([])).toEqual([])
    expect(toHashtags('nope')).toEqual([])
  })
})

describe('friendlyError', () => {
  it('explains the Apify credit hold', () => {
    expect(friendlyError('apify/run-actor: insufficient_credits')).toMatch(/\$2 hold/)
  })

  it('passes unknown errors through, bounded', () => {
    expect(friendlyError('x'.repeat(500))).toHaveLength(300)
  })
})

describe('parseJsonArray', () => {
  it('pulls the array out of surrounding prose', () => {
    expect(parseJsonArray('Here you go:\n[{"id":0,"score":80}]\nThanks')).toEqual([{ id: 0, score: 80 }])
  })

  it('returns [] for malformed output instead of throwing', () => {
    expect(parseJsonArray('[{"id": 0,')).toEqual([])
  })
})

describe('cleanPitch', () => {
  it('removes em and en dashes, exclamation points, and a subject line', () => {
    expect(cleanPitch('Subject: Hi\n\nYour Cursor video — the one on agents — was sharp! Worth a chat?')).toBe(
      'Your Cursor video, the one on agents, was sharp. Worth a chat?',
    )
    expect(cleanPitch('Short – sweet.')).toBe('Short, sweet.')
  })

  it('normalizes quotes and whitespace and strips wrapping quotes', () => {
    expect(cleanPitch('"It’s  a  “real” test"')).toBe('It\'s a "real" test')
  })
})

describe('slopHits', () => {
  it('flags banned phrases regardless of case or curly apostrophes', () => {
    expect(slopHits('I Came Across your video and I’d love to Reach out.')).toEqual(
      expect.arrayContaining(['i came across', "i'd love to", 'reach out']),
    )
  })

  it('does not flag substrings inside other words', () => {
    expect(slopHits('We harnessed nothing; the dashboard is plain.')).toEqual([])
  })
})
