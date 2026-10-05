/**
 * Server actions. Both run RBAC-off with the caller's identity (see
 * src/server/action-routes.ts), so each one checks ownership itself.
 *
 *   startScout  validate input, enforce the daily cap, create the scout row,
 *               and enqueue the `scan` job. The cap lives here — not in the
 *               client — because every scan spends owner-billed credits.
 *   draftPitch  write a partnership pitch for one creator the caller owns.
 */

import { generateText } from 'ai'
import { createDeepSpaceAI, enqueueJob } from 'deepspace/worker'
import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { BANNED_PHRASES, cleanPitch, slopHits, toHashtags } from '../server/scan-utils'

export const DAILY_SCOUT_LIMIT = 5
const PLATFORMS = ['youtube', 'tiktok', 'instagram'] as const
const PITCH_MODEL = 'claude-sonnet-5'

const today = () => new Date().toISOString().slice(0, 10)

const startScout: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  const topic = String(params.topic ?? '').trim()
  const brief = String(params.brief ?? '').trim()
  const minFollowers = Math.max(0, Math.floor(Number(params.minFollowers) || 0))
  const platforms = Array.isArray(params.platforms)
    ? PLATFORMS.filter((p) => (params.platforms as unknown[]).includes(p))
    : []

  if (topic.length < 2 || topic.length > 80) return { success: false, error: 'Topic must be 2–80 characters.' }
  if (brief.length > 500) return { success: false, error: 'Brief must be 500 characters or fewer.' }
  if (platforms.length === 0) return { success: false, error: 'Pick at least one platform.' }

  const day = today()
  const existing = await tools.query('scouts', { where: { userId, day }, limit: DAILY_SCOUT_LIMIT + 1 })
  if (!existing.success) return existing
  const used = (existing.data as { records: unknown[] }).records.length
  if (used >= DAILY_SCOUT_LIMIT) {
    return { success: false, error: `Daily limit reached (${DAILY_SCOUT_LIMIT} scouts per day). Try again tomorrow.` }
  }

  const created = await tools.create('scouts', {
    userId,
    topic,
    brief,
    platforms,
    hashtags: toHashtags(params.hashtags),
    minFollowers,
    day,
    status: 'queued',
  })
  if (!created.success) return created
  const scoutId = (created.data as { recordId: string }).recordId

  const jobId = await enqueueJob(env.JOB_ROOMS, `app:${env.DEEPSPACE_APP_ID}`, 'scan', { scoutId, userId }, {
    maxAttempts: 2,
    enqueuedBy: userId,
  })
  await tools.update('scouts', scoutId, { jobId })

  return { success: true, data: { scoutId, jobId, remainingToday: DAILY_SCOUT_LIMIT - used - 1 } }
}

const draftPitch: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  const creatorId = String(params.creatorId ?? '')
  const sender = String(params.sender ?? '').trim().slice(0, 300)

  const got = await tools.get('creators', creatorId)
  if (!got.success) return got
  const creator = (got.data as { record: { data: Record<string, any> } }).record.data
  if (creator.userId !== userId) return { success: false, error: 'Not found.' }

  const scoutGot = await tools.get('scouts', String(creator.scoutId))
  const scout = scoutGot.success ? (scoutGot.data as { record: { data: Record<string, any> } }).record.data : {}

  const posts = (Array.isArray(creator.posts) ? creator.posts : [])
    .slice(0, 3)
    .map((p: { title: string; url: string }) => `- ${p.title} (${p.url})`)
    .join('\n')

  const system = [
    'You write a short creator-partnership DM that sounds like one specific person typed it, not a marketer or an AI.',
    'Rules:',
    '1. Open with something specific from one of their real posts, by its topic, in your own words. Never open with a greeting cliche.',
    '2. Say plainly what is being offered and why their audience fits, in one or two sentences.',
    '3. End with one direct question that is easy to answer.',
    '4. 60 to 110 words. Plain sentences. Contractions are fine.',
    '5. Never use em dashes or en dashes. Use commas or periods instead. No exclamation points, no emojis, no hashtags, no subject line, no sign-off block.',
    '6. No hype or filler words, for example: ' + BANNED_PHRASES.slice(0, 40).join(', ') + '.',
    '7. No "not just X, but Y" constructions and no lists of three adjectives.',
    '8. No placeholders like [Name]. If a detail is unknown, leave it out.',
    'Return only the message text.',
  ].join('\n')

  const prompt = [
    `Creator: ${creator.name} (@${creator.handle}) on ${creator.platform}`,
    creator.bio ? `Bio: ${creator.bio}` : '',
    `Their recent on-topic posts:\n${posts || '(none captured)'}`,
    `Topic: ${scout.topic ?? ''}`,
    `What we're promoting: ${scout.brief || '(not specified)'}`,
    sender ? `Sender: ${sender}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const ai = createDeepSpaceAI(env, 'anthropic')
  const write = async (extra = '') =>
    cleanPitch((await generateText({ model: ai(PITCH_MODEL), system, prompt: prompt + extra, maxOutputTokens: 600 })).text)

  // Rules in the prompt, a deterministic cleanup on every draft, and one
  // rewrite if any banned phrase still slipped through.
  let text = await write()
  const hits = slopHits(text)
  if (hits.length) {
    text = await write(`\n\nYour previous draft used these banned phrases: ${hits.join(', ')}. Rewrite it without them:\n${text}`)
  }

  const pitch = text
  const saved = await tools.update('creators', creatorId, { pitch })
  if (!saved.success) return saved
  return { success: true, data: { pitch } }
}

export const actions: Record<string, ActionHandler<Env>> = { startScout, draftPitch }
