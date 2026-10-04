import { getAuthToken } from 'deepspace'
import { cn } from '@/lib/utils'

export type Platform = 'youtube' | 'tiktok' | 'instagram'
export type Stage = 'new' | 'shortlisted' | 'contacted' | 'passed'

export interface Post {
  title: string
  url: string
  views: number
  likes: number
}

export interface Creator {
  userId: string
  scoutId: string
  platform: Platform
  handle: string
  name?: string
  url?: string
  avatarUrl?: string
  bio?: string
  followers?: number | null
  avgViews?: number
  engagement?: number
  posts?: Post[]
  fitScore?: number
  fitReason?: string
  stage: Stage
  pitch?: string
}

export interface Scout {
  userId: string
  topic: string
  brief?: string
  platforms: Platform[]
  hashtags?: string[]
  minFollowers?: number
  day: string
  status: 'queued' | 'scanning' | 'scoring' | 'done' | 'failed'
  jobId?: string
  counts?: Partial<Record<Platform, number>>
  warnings?: Partial<Record<Platform, string>>
  error?: string
}

export const PLATFORM_LABEL: Record<Platform, string> = {
  youtube: 'YouTube',
  tiktok: 'TikTok',
  instagram: 'Instagram',
}

export const STAGES: { id: Stage; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'shortlisted', label: 'Shortlisted' },
  { id: 'contacted', label: 'Contacted' },
  { id: 'passed', label: 'Passed' },
]

const PLATFORM_STYLE: Record<Platform, string> = {
  youtube: 'bg-[#ff3b30]/12 text-[#ff6b61] ring-[#ff3b30]/25',
  tiktok: 'bg-[#25f4ee]/10 text-[#5ff7f2] ring-[#25f4ee]/25',
  instagram: 'bg-[#e1306c]/12 text-[#f06292] ring-[#e1306c]/25',
}

export function PlatformBadge({ platform, className }: { platform: Platform; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
        PLATFORM_STYLE[platform],
        className,
      )}
    >
      {PLATFORM_LABEL[platform]}
    </span>
  )
}

export function compact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n === 0) return '—'
  return Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

export function pct(n: number | undefined): string {
  if (!n) return '—'
  return `${(n * 100).toFixed(n < 0.1 ? 1 : 0)}%`
}

/** Fit score chip: lime for strong fits, muted for weak ones. */
export function FitScore({ score }: { score?: number }) {
  if (score == null) return <span className="text-muted-foreground">—</span>
  const tone =
    score >= 75 ? 'bg-primary text-primary-foreground' : score >= 50 ? 'bg-secondary text-foreground' : 'bg-transparent text-muted-foreground ring-1 ring-inset ring-border'
  return (
    <span className={cn('inline-flex h-6 min-w-9 items-center justify-center rounded-md px-1.5 text-xs font-semibold tabular-nums', tone)}>
      {score}
    </span>
  )
}

/** POST /api/actions/:name with the caller's JWT (docs: server actions). */
export async function callAction<T>(name: string, params: Record<string, unknown>): Promise<T> {
  const res = await fetch(`/api/actions/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getAuthToken()}` },
    body: JSON.stringify(params),
  })
  const body = (await res.json().catch(() => ({}))) as { success?: boolean; data?: T; error?: string }
  if (!res.ok || !body.success) throw new Error(body.error || `Request failed (${res.status})`)
  return body.data as T
}
