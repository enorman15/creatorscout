/**
 * Creator Scout dashboard — every platform in one place.
 *
 * Data is live: `useQuery` subscribes to the caller's own `scouts` and
 * `creators` rows (RBAC 'own'), so creators appear the moment the scan job
 * writes them, and scan progress streams from the JobRoom via `useJobs`.
 */

import { useMemo, useState } from 'react'
import { useJobs, useMutations, useQuery, type RecordData } from 'deepspace'
import { Plus, LayoutList, Columns3 } from 'lucide-react'
import { Button, EmptyState, cn } from '@/components/ui'
import { SCOPE_ID } from '../../../constants'
import { CreatorPanel } from '../../../components/scout/CreatorPanel'
import { NewScoutDialog } from '../../../components/scout/NewScoutDialog'
import {
  FitScore,
  PLATFORM_LABEL,
  PlatformBadge,
  STAGES,
  compact,
  pct,
  type Creator,
  type Platform,
  type Scout,
  type Stage,
} from '../../../components/scout/shared'

type SortKey = 'fitScore' | 'followers' | 'avgViews' | 'engagement'
const DAILY_LIMIT = 5

export default function DashboardPage() {
  const { records: scouts } = useQuery<Scout>('scouts', { orderBy: 'createdAt', orderDir: 'desc' })
  const { records: creators, status } = useQuery<Creator>('creators')
  const [newOpen, setNewOpen] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [scoutFilter, setScoutFilter] = useState<string>('all')
  const [platform, setPlatform] = useState<Platform | 'all'>('all')
  const [sort, setSort] = useState<SortKey>('fitScore')
  const [view, setView] = useState<'table' | 'board'>('table')

  // The same creator can be found by more than one scout. Across all scouts
  // show them once: the newest row wins unless an older one has already been
  // moved through the pipeline (that stage/pitch is the work the user did).
  const unique = useMemo(() => {
    const m = new Map<string, RecordData<Creator>>()
    for (const r of creators.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      const key = `${r.data.platform}:${r.data.handle}`
      const prev = m.get(key)
      if (!prev || prev.data.stage === 'new' || r.data.stage !== 'new') m.set(key, r)
    }
    return [...m.values()]
  }, [creators])

  const visible = useMemo(() => {
    const rows = scoutFilter === 'all' ? unique : creators.filter((r) => r.data.scoutId === scoutFilter)
    return rows
      .filter((r) => platform === 'all' || r.data.platform === platform)
      .sort((a, b) => (Number(b.data[sort]) || 0) - (Number(a.data[sort]) || 0))
  }, [creators, unique, scoutFilter, platform, sort])

  const today = new Date().toISOString().slice(0, 10)
  const usedToday = scouts.filter((s) => s.data.day === today).length
  const shortlisted = unique.filter((c) => c.data.stage === 'shortlisted').length
  const contacted = unique.filter((c) => c.data.stage === 'contacted').length
  const scored = unique.filter((c) => c.data.fitScore != null)
  const avgFit = scored.length ? Math.round(scored.reduce((s, c) => s + (c.data.fitScore ?? 0), 0) / scored.length) : null
  const openRecord = creators.find((c) => c.recordId === openId) ?? null

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Creator Scout</h1>
          <p className="mt-1 text-sm text-muted-foreground">Find, score, and pitch creators across YouTube, TikTok, and Instagram.</p>
        </div>
        <Button onClick={() => setNewOpen(true)} disabled={usedToday >= DAILY_LIMIT}>
          <Plus /> New scout
        </Button>
      </header>

      <section className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Creators found" value={unique.length} />
        <Stat label="Shortlisted" value={shortlisted} />
        <Stat label="Contacted" value={contacted} />
        <Stat label="Avg fit" value={avgFit ?? '—'} />
        <Stat label="Scouts today" value={`${usedToday} / ${DAILY_LIMIT}`} />
      </section>

      <ScoutStrip scouts={scouts} selected={scoutFilter} onSelect={setScoutFilter} />

      <section className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 rounded-lg border border-border p-1">
            {(['all', 'youtube', 'tiktok', 'instagram'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPlatform(p)}
                className={cn('rounded-md px-3 py-1 text-sm', platform === p ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground')}
              >
                {p === 'all' ? 'All' : PLATFORM_LABEL[p]}
                <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">
                  {p === 'all' ? unique.length : unique.filter((c) => c.data.platform === p).length}
                </span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            {view === 'table' && (
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                Sort
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  className="rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
                >
                  <option value="fitScore">Fit score</option>
                  <option value="followers">Followers</option>
                  <option value="avgViews">Avg views</option>
                  <option value="engagement">Engagement</option>
                </select>
              </label>
            )}
            <div className="flex items-center rounded-lg border border-border p-1">
              <IconToggle active={view === 'table'} onClick={() => setView('table')} label="Table"><LayoutList className="size-4" /></IconToggle>
              <IconToggle active={view === 'board'} onClick={() => setView('board')} label="Pipeline"><Columns3 className="size-4" /></IconToggle>
            </div>
          </div>
        </div>

        <div className="mt-4">
          {status === 'loading' ? (
            <div className="py-20 text-center text-sm text-muted-foreground">Loading…</div>
          ) : creators.length === 0 ? (
            <EmptyState
              title="No creators yet"
              description="Start a scout with a topic and Creator Scout searches all three platforms, then scores every creator against your brief."
              action={{ label: 'New scout', onClick: () => setNewOpen(true) }}
            />
          ) : view === 'table' ? (
            <CreatorTable rows={visible} onOpen={setOpenId} />
          ) : (
            <PipelineBoard rows={visible} onOpen={setOpenId} />
          )}
        </div>
      </section>

      <NewScoutDialog open={newOpen} onClose={() => setNewOpen(false)} />
      <CreatorPanel record={openRecord} onClose={() => setOpenId(null)} />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  )
}

function IconToggle({ active, onClick, label, children }: { active: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn('rounded-md p-1.5', active ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground')}
    >
      {children}
    </button>
  )
}

/** Recent scouts with live job progress for the ones still running. */
function ScoutStrip({ scouts, selected, onSelect }: { scouts: RecordData<Scout>[]; selected: string; onSelect: (id: string) => void }) {
  const { getJob } = useJobs(SCOPE_ID)
  if (scouts.length === 0) return null
  return (
    <section className="mt-8">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Scouts</h2>
        {selected !== 'all' && (
          <button onClick={() => onSelect('all')} className="text-xs text-muted-foreground hover:text-foreground">Show all</button>
        )}
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {scouts.slice(0, 12).map((s) => {
          const running = ['queued', 'scanning', 'scoring'].includes(s.data.status)
          const job = s.data.jobId ? getJob(s.data.jobId) : undefined
          const total = Object.values(s.data.counts ?? {}).reduce((a, b) => a + (b ?? 0), 0)
          const warnings = Object.entries(s.data.warnings ?? {})
          return (
            <button
              key={s.recordId}
              data-testid="scout-card"
              onClick={() => onSelect(selected === s.recordId ? 'all' : s.recordId)}
              className={cn(
                'w-64 shrink-0 rounded-xl border bg-card px-4 py-3 text-left transition-colors',
                selected === s.recordId ? 'border-primary' : 'border-border hover:border-muted-foreground/40',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{s.data.topic}</span>
                <span className={cn('shrink-0 text-[11px]', s.data.status === 'failed' ? 'text-destructive' : running ? 'text-primary' : 'text-muted-foreground')}>
                  {s.data.status}
                </span>
              </div>
              {running ? (
                <div className="mt-3">
                  <div className="h-1 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full bg-primary transition-all duration-500" style={{ width: `${Math.round((job?.progress ?? 0.02) * 100)}%` }} />
                  </div>
                  <p className="mt-1.5 truncate text-xs text-muted-foreground">{job?.progressMessage ?? 'Waiting to start…'}</p>
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  {total} creators ·{' '}
                  {s.data.platforms.map((p) => `${PLATFORM_LABEL[p]} ${s.data.counts?.[p] ?? 0}`).join(' · ')}
                </p>
              )}
              {warnings.length > 0 && (
                <p className="mt-1 truncate text-xs text-amber-400" title={warnings.map(([p, w]) => `${p}: ${w}`).join('\n')}>
                  {warnings.map(([p]) => PLATFORM_LABEL[p as Platform]).join(', ')} failed: {warnings[0][1].slice(0, 80)}
                </p>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}

function CreatorTable({ rows, onOpen }: { rows: RecordData<Creator>[]; onOpen: (id: string) => void }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead className="bg-card text-left text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5 font-medium">Creator</th>
            <th className="px-4 py-2.5 font-medium">Fit</th>
            <th className="hidden px-4 py-2.5 font-medium md:table-cell">Why</th>
            <th className="px-4 py-2.5 text-right font-medium">Followers</th>
            <th className="px-4 py-2.5 text-right font-medium">Avg views</th>
            <th className="hidden px-4 py-2.5 text-right font-medium sm:table-cell">Engage</th>
            <th className="px-4 py-2.5 font-medium">Stage</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.recordId} onClick={() => onOpen(r.recordId)} className="cursor-pointer hover:bg-card/60">
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  {r.data.avatarUrl ? (
                    <img src={r.data.avatarUrl} alt="" referrerPolicy="no-referrer" loading="lazy" className="size-8 shrink-0 rounded-full bg-muted object-cover" />
                  ) : (
                    <div className="size-8 shrink-0 rounded-full bg-muted" />
                  )}
                  <div className="min-w-0">
                    <div className="truncate font-medium">{r.data.name || r.data.handle}</div>
                    <PlatformBadge platform={r.data.platform} className="mt-0.5" />
                  </div>
                </div>
              </td>
              <td className="px-4 py-3"><FitScore score={r.data.fitScore} /></td>
              <td className="hidden max-w-sm px-4 py-3 text-muted-foreground md:table-cell">
                <span className="line-clamp-2">{r.data.fitReason}</span>
              </td>
              <td className="px-4 py-3 text-right tabular-nums">{compact(r.data.followers)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{compact(r.data.avgViews)}</td>
              <td className="hidden px-4 py-3 text-right tabular-nums sm:table-cell">{pct(r.data.engagement)}</td>
              <td className="px-4 py-3 capitalize text-muted-foreground">{r.data.stage}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Drag a card between columns to change its stage. */
function PipelineBoard({ rows, onOpen }: { rows: RecordData<Creator>[]; onOpen: (id: string) => void }) {
  const { put, ready } = useMutations<Creator>('creators')
  const [over, setOver] = useState<Stage | null>(null)

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
      {STAGES.map((stage) => {
        const items = rows.filter((r) => r.data.stage === stage.id)
        return (
          <div
            key={stage.id}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(stage.id)
            }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => {
              e.preventDefault()
              setOver(null)
              const id = e.dataTransfer.getData('text/plain')
              if (id && ready) put(id, { stage: stage.id })
            }}
            className={cn('min-h-64 rounded-xl border bg-card/40 p-2', over === stage.id ? 'border-primary' : 'border-border')}
          >
            <div className="flex items-center justify-between px-2 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {stage.label}
              <span className="tabular-nums">{items.length}</span>
            </div>
            <div className="space-y-2">
              {items.map((r) => (
                <div
                  key={r.recordId}
                  draggable={ready}
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', r.recordId)}
                  onClick={() => onOpen(r.recordId)}
                  className="cursor-grab rounded-lg border border-border bg-card p-3 hover:border-muted-foreground/40 active:cursor-grabbing"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="truncate text-sm font-medium">{r.data.name || r.data.handle}</span>
                    <FitScore score={r.data.fitScore} />
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <PlatformBadge platform={r.data.platform} />
                    <span className="text-xs tabular-nums text-muted-foreground">{compact(r.data.followers ?? r.data.avgViews)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
