import type { CollectionSchema } from 'deepspace/schema'

export const PLATFORMS = ['youtube', 'tiktok', 'instagram'] as const
export const STAGES = ['new', 'shortlisted', 'contacted', 'passed'] as const

/**
 * creators — one row per creator found by a scout.
 *
 * Written by the `scan` job (as the scout's owner) and then worked by the
 * owner in the dashboard: pipeline `stage` and the drafted `pitch` are the
 * only fields the client edits.
 */
export const creatorsSchema: CollectionSchema = {
  name: 'creators',
  ownerField: 'userId',
  columns: [
    { name: 'userId', storage: 'text', interpretation: 'plain', userBound: true, immutable: true, required: true },
    { name: 'scoutId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'platform', storage: 'text', interpretation: { kind: 'select', options: [...PLATFORMS] }, required: true },
    { name: 'handle', storage: 'text', interpretation: 'plain', required: true },
    { name: 'name', storage: 'text', interpretation: 'plain' },
    { name: 'url', storage: 'text', interpretation: { kind: 'url' } },
    { name: 'avatarUrl', storage: 'text', interpretation: 'plain' },
    { name: 'bio', storage: 'text', interpretation: 'plain' },
    // Followers/fans. YouTube's catalog endpoints expose no subscriber count,
    // so YouTube rows leave this empty and lean on topic views instead.
    { name: 'followers', storage: 'number', interpretation: 'plain' },
    // Average views across the creator's on-topic posts we found.
    { name: 'avgViews', storage: 'number', interpretation: 'plain' },
    // (likes + comments) / views on those posts, 0..1.
    { name: 'engagement', storage: 'number', interpretation: 'plain' },
    // [{ title, url, views, likes }] — the evidence the score and pitch cite.
    { name: 'posts', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'fitScore', storage: 'number', interpretation: 'plain' },
    { name: 'fitReason', storage: 'text', interpretation: 'plain' },
    { name: 'stage', storage: 'text', interpretation: { kind: 'select', options: [...STAGES] }, default: 'new', required: true },
    { name: 'pitch', storage: 'text', interpretation: 'plain' },
  ],
  uniqueOn: ['scoutId', 'platform', 'handle'],
  permissions: {
    '*': { read: false, create: false, update: false, delete: false },
    viewer: { read: 'own', create: false, update: 'own', delete: 'own' },
    member: { read: 'own', create: false, update: 'own', delete: 'own' },
    admin: { read: true, create: false, update: true, delete: true },
  },
}
