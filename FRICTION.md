# DeepSpace friction log

Things a new developer hit while building Creator Scout. These are the onboarding moments a docs page or CLI message could save someone, each with what happened and a suggested fix.

## 1. `twitterapi` integration is down upstream
Every `twitterapi/*` call returned `twitterapi.io API error 402: "Credits is not enough. Please recharge"`. The platform's own provider account is out of credits. Billing was released, so it cost nothing, but the integration is unusable and nothing in `integrations list` says so.
**Fix:** a health or status flag per integration in `integrations list`, plus an alert on upstream 402s.

## 2. Apify holds $2.00 per run, regardless of `maxTotalChargeUsd`
Each `apify/run-actor` reserves exactly $2.00 and refunds the unused part a few minutes after the run ends. The usage log shows `+2.0` and later `-1.996`. On the free tier's $5, only one hold fits at a time once a few dollars are spent. Two concurrent runs, or two back-to-back runs before the first hold settles, fail with a bare `insufficient_credits` and no `details`.
**Fix:** document the hold amount and settle timing on the `apify/run-actor` info page, and include `details.availableCredits` and the required hold in the error.

## 3. Metered endpoints show no price
`integrations info` prints `baseCost: null` for `per_actual_cost` endpoints (Apify, twitterapi, Anthropic). The only way to learn a price is to spend.
**Fix:** show a typical or last-observed cost, or link the provider's pricing.

## 4. Scaffolding inside an existing git repo
Running `npm create deepspace` inside a folder that is already a git repo (mine held a Remotion project) does not `git init` the new app. The first `deploy` then refuses with `dirty_worktree` and lists the parent repo's files.
**Fix:** have the scaffolder detect a parent repo and either init a nested repo or warn.

## 5. The source authority latches silently on first deploy
My first deploy, made just to claim the name, had no GitHub remote, so it permanently set the app's source to DeepSpace. The docs explain this well, but the scaffold's next-steps output and the first deploy don't mention it.
**Fix:** one line at first deploy: "This claims DeepSpace as the source of truth for this app, permanently."

## 6. A third-party Apify actor fails silently on a bad input
`memo23/instagram-influencer-search` returned `FAILED` with no `statusMessage` when one of three hashtags didn't exist on Instagram. Two real tags worked; adding the invented one failed the whole run. I found it by reproducing the exact input from the CLI.
**Fix:** surface the actor's run log (or its last error line) through `apify/get-run` so failures can be diagnosed without guessing.

## Things that worked well
- The `integrations invoke` CLI made de-risking every data source possible before writing any app code.
- Refusals carry stable codes and real messages. The rename warning even told me which two places still held the old name.
- `deepspace/testing` multi-user fixtures made the privacy check (a second user can't see the first user's data) a few lines of code.
- An undocumented win: `youtube/get-video-details` accepts comma-separated ids, so one call covers a whole search page.
