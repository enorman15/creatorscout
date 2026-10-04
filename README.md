# Creator Scout

Find the creators your audience already watches. Type a topic, and Creator Scout searches YouTube, TikTok, and Instagram, scores every creator against what you are promoting, and drafts a partnership pitch that cites their real posts.

**Live:** https://creatorscout.app.space · Built on the [DeepSpace SDK](https://docs.deep.space)

## What it does

1. **New scout.** Topic, a one-line brief of what you are promoting, platforms, a follower floor, and optional Instagram hashtags.
2. **Background scan.** A durable job searches every platform, groups content by creator, and computes reach (followers, average views, engagement). Progress streams to the dashboard.
3. **AI fit score.** Claude rates each shortlisted creator 0–100 against the brief, with a one-sentence reason that cites their content.
4. **Dashboard.** One table across all three platforms (filter, sort), a drag-and-drop pipeline (New → Shortlisted → Contacted → Passed), and live stat tiles.
5. **Pitch.** Claude drafts a short outreach message that references one of the creator's actual posts. You send it yourself.

## How it is built

| Piece | DeepSpace primitive |
|---|---|
| Sign-in, per-user data | Auth + `RecordRoom` collections with `'own'` RBAC (`src/schemas/`) |
| Live dashboard | `useQuery` subscriptions; rows appear as the job writes them |
| Scan pipeline | `JobRoom` background job (`src/jobs.ts`) with `ctx.progress`, shown via `useJobs` |
| Daily cap + enqueue | Server action `startScout` (`src/actions/index.ts`) |
| Pitch drafting | Server action `draftPitch` with an ownership check |
| Third-party data | Integration proxy, owner-billed. No API keys in the app |

### Integrations

| Integration | Used for |
|---|---|
| `youtube/search-videos`, `youtube/get-video-details` | Topic videos, then view/like stats. One details call takes up to 50 comma-separated ids |
| `apify` → `clockworks/tiktok-scraper` | TikTok keyword search with author follower counts |
| `apify` → `apify/instagram-scraper` then `apify/instagram-profile-scraper` | Instagram top posts per hashtag, then profiles of the most-engaged posters. Instagram's account search only matches usernames, so content comes first |
| `anthropic` (via `createDeepSpaceAI`) | Batch fit scoring (Haiku 4.5) and pitch drafting (Sonnet 5) |

**Left out on purpose:** X/Twitter (`twitterapi` returned an upstream "credits not enough" error on every call while building), email sending (outreach stays in the user's own inbox), LinkedIn (the catalog endpoint is a scoped Google search, not creator data), and scheduled re-scans (useful, but not needed to prove the core path).

### Security and spend

- Every paid call is server-side: the `startScout` action enforces 5 scouts per user per day before it enqueues, and `AppJobRoom.authorizeWrite` rejects client-side enqueues, so the cap cannot be bypassed from the browser socket.
- Server actions run with RBAC off, so `draftPitch` loads the creator and checks `userId === caller` before writing.
- Apify runs carry a spend cap and a timeout. A platform that fails is recorded as a warning on the scout instead of failing the whole scan.

## Run it

```bash
npm install
npx deepspace auth login
npx deepspace dev start          # http://localhost:5173
npx vitest run                   # unit tests: scoring math, shortlist, hashtags, error text
npx deepspace test run e2e --grep "table, filters"   # UI on saved data (~$0.01)
npx deepspace test run e2e --grep "scout finds"      # full real scan (~$0.50, needs a credit balance above $4)
npx deepspace deploy
```

The e2e specs use DeepSpace test accounts (`npx deepspace test accounts create`). The full-scan spec also checks that a second user sees none of the first user's creators.

## Limits and next steps

- YouTube's catalog endpoints expose no subscriber count, so YouTube rows show topic views, not followers.
- Instagram hashtag pages return recent posts, not top posts, so results skew small. The follower floor and Claude's score filter most of that out.
- Apify holds $2 per run until it settles a few minutes later, so a low free-tier balance can block Instagram's second step. See `FRICTION.md`.
- Next: weekly re-scans with a "new this week" view, CSV export, and sending pitches through the user's Gmail via the Google integration.
