import { useState } from 'react'
import { useMutations, type RecordData } from 'deepspace'
import { ExternalLink, Copy, Sparkles } from 'lucide-react'
import { Button, Modal, useToast, cn } from '@/components/ui'
import { FitScore, PlatformBadge, STAGES, callAction, compact, pct, type Creator } from './shared'

export function CreatorPanel({ record, onClose }: { record: RecordData<Creator> | null; onClose: () => void }) {
  const toast = useToast()
  const { put, ready } = useMutations<Creator>('creators')
  const [drafting, setDrafting] = useState(false)
  if (!record) return null
  const c = record.data

  async function draft() {
    setDrafting(true)
    try {
      await callAction('draftPitch', { creatorId: record!.recordId })
    } catch (err) {
      toast.error('Could not draft pitch', err instanceof Error ? err.message : String(err))
    } finally {
      setDrafting(false)
    }
  }

  return (
    <Modal open onClose={onClose} size="lg">
      <Modal.Header>
        <div className="flex min-w-0 items-center gap-3">
          {c.avatarUrl ? (
            <img src={c.avatarUrl} alt="" referrerPolicy="no-referrer" className="size-10 shrink-0 rounded-full bg-muted object-cover" />
          ) : (
            <div className="size-10 shrink-0 rounded-full bg-muted" />
          )}
          <div className="min-w-0">
            <Modal.Title>{c.name || c.handle}</Modal.Title>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
              <PlatformBadge platform={c.platform} />
              {c.platform !== 'youtube' && <span>@{c.handle}</span>}
              {c.url && (
                <a href={c.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
                  Profile <ExternalLink className="size-3" />
                </a>
              )}
            </div>
          </div>
        </div>
      </Modal.Header>
      <Modal.Body>
        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-3">
            {[
              ['Fit', <FitScore key="f" score={c.fitScore} />],
              ['Followers', compact(c.followers)],
              ['Avg views', compact(c.avgViews)],
              ['Engagement', pct(c.engagement)],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg border border-border bg-card px-3 py-2.5">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
                <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
              </div>
            ))}
          </div>

          {c.fitReason && <p className="text-sm leading-relaxed text-foreground/90">{c.fitReason}</p>}
          {c.bio && <p className="text-sm text-muted-foreground">{c.bio}</p>}

          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Content we found</h3>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {(c.posts ?? []).map((p, i) => (
                <li key={i} className="flex items-center justify-between gap-4 px-3 py-2 text-sm">
                  <a href={p.url} target="_blank" rel="noreferrer" className="min-w-0 truncate hover:text-primary">
                    {p.title || '(untitled post)'}
                  </a>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {p.views ? `${compact(p.views)} views` : `${compact(p.likes)} interactions`}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Pipeline</h3>
            <div className="flex gap-2">
              {STAGES.map((s) => (
                <button
                  key={s.id}
                  disabled={!ready}
                  onClick={() => put(record.recordId, { stage: s.id })}
                  className={cn(
                    'rounded-full border px-3 py-1 text-sm transition-colors disabled:opacity-50',
                    c.stage === s.id ? 'border-primary bg-primary/10' : 'border-border text-muted-foreground hover:text-foreground',
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Partnership pitch</h3>
              {c.pitch && (
                <button
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => navigator.clipboard.writeText(c.pitch!).then(() => toast.success('Copied'))}
                >
                  <Copy className="size-3" /> Copy
                </button>
              )}
            </div>
            {c.pitch ? (
              <p className="whitespace-pre-wrap rounded-lg border border-border bg-card p-4 text-sm leading-relaxed">{c.pitch}</p>
            ) : (
              <p className="text-sm text-muted-foreground">Claude writes a short pitch that references their actual posts. You send it yourself.</p>
            )}
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="ghost" onClick={onClose}>Close</Button>
        <Button onClick={draft} loading={drafting} disabled={drafting}>
          <Sparkles /> {c.pitch ? 'Redraft pitch' : 'Draft pitch'}
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
