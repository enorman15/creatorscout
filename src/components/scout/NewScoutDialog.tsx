import { useState } from 'react'
import { Button, Input, Label, Modal, Textarea, useToast, cn } from '@/components/ui'
import { PLATFORM_LABEL, callAction, type Platform } from './shared'

const ALL: Platform[] = ['youtube', 'tiktok', 'instagram']

export function NewScoutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const [topic, setTopic] = useState('')
  const [brief, setBrief] = useState('')
  const [hashtags, setHashtags] = useState('')
  const [minFollowers, setMinFollowers] = useState('1000')
  const [platforms, setPlatforms] = useState<Platform[]>(ALL)
  const [busy, setBusy] = useState(false)

  const toggle = (p: Platform) =>
    setPlatforms((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await callAction<{ remainingToday: number }>('startScout', {
        topic,
        brief,
        platforms,
        minFollowers: Number(minFollowers) || 0,
        hashtags: hashtags.split(/[\s,]+/).filter(Boolean),
      })
      toast.success('Scout started', `Searching ${platforms.map((p) => PLATFORM_LABEL[p]).join(', ')}. ${res.remainingToday} left today.`)
      setTopic('')
      setBrief('')
      setHashtags('')
      onClose()
    } catch (err) {
      toast.error('Could not start scout', err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="md">
      <form onSubmit={submit}>
        <Modal.Header>
          <Modal.Title>New scout</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="topic">Topic</Label>
              <Input id="topic" required minLength={2} maxLength={80} placeholder="AI coding agents" value={topic} onChange={(e) => setTopic(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brief">What are you promoting?</Label>
              <Textarea
                id="brief"
                maxLength={500}
                rows={3}
                placeholder="A developer SDK that lets coding agents ship full-stack apps. Looking for creators who build with Cursor or Claude Code on camera."
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Claude scores every creator against this.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Platforms</Label>
              <div className="flex gap-2">
                {ALL.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => toggle(p)}
                    aria-pressed={platforms.includes(p)}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-sm transition-colors',
                      platforms.includes(p) ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {PLATFORM_LABEL[p]}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="min">Min followers</Label>
                <Input id="min" type="number" min={0} value={minFollowers} onChange={(e) => setMinFollowers(e.target.value)} />
                <p className="text-xs text-muted-foreground">TikTok and Instagram only.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tags">Instagram hashtags</Label>
                <Input id="tags" placeholder="cursorai claudecode" value={hashtags} onChange={(e) => setHashtags(e.target.value)} />
                <p className="text-xs text-muted-foreground">Optional. Topic is used too.</p>
              </div>
            </div>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy} disabled={busy || platforms.length === 0 || topic.trim().length < 2}>
            Start scout
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  )
}
