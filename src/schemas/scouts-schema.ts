import type { CollectionSchema } from 'deepspace/schema'

/**
 * scouts — one row per creator search ("find creators for <topic>").
 *
 * Lifecycle: queued → scanning → scoring → done | failed
 * Rows are created by the `startScout` server action (never directly by the
 * client) so the daily cap is enforced server-side before any paid call runs.
 * The `scan` background job advances `status` and fills in `counts`.
 */
export const scoutsSchema: CollectionSchema = {
  name: 'scouts',
  ownerField: 'userId',
  columns: [
    { name: 'userId', storage: 'text', interpretation: 'plain', userBound: true, immutable: true, required: true },
    { name: 'topic', storage: 'text', interpretation: 'plain', required: true },
    // What the user is promoting — Claude scores fit against this.
    { name: 'brief', storage: 'text', interpretation: 'plain' },
    { name: 'platforms', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'hashtags', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'minFollowers', storage: 'number', interpretation: 'plain', default: 0 },
    // YYYY-MM-DD (UTC) — lets the daily cap be one equality query.
    { name: 'day', storage: 'text', interpretation: 'plain', required: true },
    {
      name: 'status',
      storage: 'text',
      interpretation: { kind: 'select', options: ['queued', 'scanning', 'scoring', 'done', 'failed'] },
      default: 'queued',
      required: true,
    },
    { name: 'jobId', storage: 'text', interpretation: 'plain' },
    // { youtube: n, tiktok: n, instagram: n } — creators kept per platform.
    { name: 'counts', storage: 'text', interpretation: { kind: 'json' } },
    // Per-platform failures that didn't sink the whole scan.
    { name: 'warnings', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'error', storage: 'text', interpretation: 'plain' },
    // Set by the `removeScout` action. Removed scouts are hidden but kept, so
    // they still count toward the daily cap (deleting can't buy more scans).
    { name: 'archived', storage: 'number', interpretation: { kind: 'boolean' }, default: 0 },
  ],
  permissions: {
    '*': { read: false, create: false, update: false, delete: false },
    // No client deletes: a deleted scout would stop counting toward the daily
    // cap. Users remove scouts through the `removeScout` action (soft delete).
    viewer: { read: 'own', create: false, update: false, delete: false },
    member: { read: 'own', create: false, update: false, delete: false },
    admin: { read: true, create: false, update: true, delete: true },
  },
}
