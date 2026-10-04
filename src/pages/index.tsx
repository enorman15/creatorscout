/**
 * Landing page — a STATIC page.
 *
 * It lives at the top level of src/pages/ (not under (app)/), so it renders
 * with no DeepSpace providers: no auth session fetch, no records WebSocket.
 * That makes it cheap to serve and safe for logged-out / crawler traffic.
 *
 * Need live data or auth here? Move this file to src/pages/(app)/index.tsx
 * and it becomes a dynamic page. Conversely, any page you want to keep static
 * (marketing, docs, legal) belongs at this top level.
 *
 * Top-level pages are also prerendered to static HTML at build
 * (prerender.ts, via vite.config.ts) so crawlers read real content.
 * Keep them renderable without a browser: no window/document during render,
 * prose in HTML text, reveal animations in CSS keyframes rather than JS-driven
 * initial states. `<Seo>` comes first and reads src/seo.ts.
 */

import { Link } from 'react-router-dom'
import { Seo } from '../components/Seo'
import { APP_NAME } from '../constants'
import { seo } from '../seo'

export default function Landing() {
  return (
    <>
      <Seo {...seo} path="/" />
      <div data-testid="static-landing" className="min-h-screen bg-background text-foreground">
        <div className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-20">
          <p className="mb-6 text-sm font-medium tracking-wide text-primary">{APP_NAME}</p>
          <h1 className="max-w-3xl text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            Find the creators your audience already watches.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Type a topic. Creator Scout searches YouTube, TikTok, and Instagram, scores every creator
            against what you are promoting, and drafts a pitch that references their real posts.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Open the dashboard
            </Link>
            <span className="text-sm text-muted-foreground">Sign in with GitHub or Google.</span>
          </div>
          <ol className="mt-20 grid gap-6 border-t border-border pt-10 sm:grid-cols-3">
            {[
              ['Search', 'One topic, three platforms, searched in parallel by a background job.'],
              ['Score', 'Claude rates fit 0–100 against your brief, with a reason that cites their content.'],
              ['Pitch', 'Move creators through a pipeline and draft outreach you send yourself.'],
            ].map(([title, body], i) => (
              <li key={title}>
                <span className="text-xs tabular-nums text-muted-foreground">0{i + 1}</span>
                <h2 className="mt-2 font-medium">{title}</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </>
  )
}
