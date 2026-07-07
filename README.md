# Hermes // Polymarket Copy Trading Research System

A paper-trading-only research system that scans the Polymarket leaderboard, scores wallets and
their trades, simulates copy trades with $5–$20 positions, tracks outcomes, evolves its own
scoring rules over time, and reports what it learned — all operated on a schedule by
[Hermes Agent](https://github.com/NousResearch/hermes-agent).

**This is not financial advice. Version one places no real trades, signs nothing, and never asks
for a private key.** See [SAFETY.md](./SAFETY.md) for the full safety rationale.

---

## What the bot does

1. Pulls the Polymarket leaderboard (top ~500 wallets).
2. Analyzes each wallet's last 30 days of trades and scores it on ROI, consistency, and
   copyability — penalizing wallets whose profit came from one lucky trade.
3. Tracks selected wallets and detects their new trades.
4. Scores each new trade (price movement since entry, spread, liquidity, time to resolution,
   category fit) and labels it `paper_copy`, `watchlist`, or `skip`.
5. Simulates copy trades ($5–$20 position size) for every `paper_copy` decision and updates their
   PnL hourly until the market resolves.
6. Compares the bot-filtered strategy against blindly copying every leaderboard wallet.
7. Automatically tunes its own rule thresholds based on what's been working, and logs every
   change with the reasoning and evidence behind it.
8. Generates an end-of-day report (optionally sent to Telegram).

## What the bot does not do

- It does not place real orders, on Polymarket or anywhere else.
- It does not sign transactions or hold/request private keys or seed phrases.
- It does not spend real money — every position is simulated (paper) at $5–$20.
- It does not fabricate data: if a live API call fails, the failure is surfaced as a real error,
  not papered over with fake numbers. Demo data is only ever used when you explicitly opt into
  `DATA_SOURCE_MODE=demo`, and it's tagged `source: "demo"` everywhere it appears.

---

## Tech stack

TypeScript · Next.js 14 (App Router) · React · Tailwind · SQLite (via Prisma) · Vercel-ready.

## Project layout

```
prisma/schema.prisma        All 12 data models from the spec (WalletProfile, DecisionJournal, ...)
src/lib/adapters/           Polymarket API adapter (+ demo data fallback), never places orders
src/lib/scoring/            Wallet scoring & trade scoring — pure functions, unit tested
src/lib/rules/              Default rule thresholds (v1)
src/lib/engine/             Scanner, profiler, monitor, decision engine, paper trading, rule
                             auto-updater, report generator — the operational loop
src/app/                    9 dashboard pages + JSON API routes backing them
scripts/                    CLI entry points for each `npm run` command below
tests/                      Vitest unit tests (scoring logic + safety checks)
```

## Dashboard pages

Overview · Wallet Rankings · Wallet Profile · Trade Signals · Paper Trades · Decision Journal ·
Performance · Rules · Reports — matching the spec 1:1.

---

## Setup

```bash
npm install
cp .env.example .env          # defaults are fine to start
npx prisma generate
npx prisma db push            # creates dev.db (SQLite) with all tables
npm run seed                  # runs the full pipeline once in demo mode so the dashboard has data
npm run dev                   # http://localhost:3000
```

> **A note on this build environment:** this repository was assembled in a sandboxed container
> with no network access to `binaries.prisma.sh` or `polymarket.com`, so `prisma generate` and a
> live data pull could not be executed or verified here. `npx tsc --noEmit` and `npx next build`
> were run successfully up through type-checking; the only failure in this sandbox was Prisma's
> engine binary download, which will succeed on a normal machine with internet access. Do the
> setup steps above on your own machine (or CI) before relying on this.

### Environment variables (all optional except `DATABASE_URL`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | SQLite file path, e.g. `file:./dev.db` |
| `DATA_SOURCE_MODE` | `live` (default) or `demo` |
| `POLYMARKET_GAMMA_API` / `POLYMARKET_DATA_API` / `POLYMARKET_CLOB_API` | Override if Polymarket's public API hosts change |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | Only needed if you want `report:daily` to push to Telegram |
| `CRON_SECRET` | Protects the optional `/api/cron` HTTP trigger (see below) |

No API key is required for read-only Polymarket market/leaderboard data. **There is no
environment variable for a private key anywhere in this app, on purpose.**

---

## Commands

```bash
npm run dev                 # local dashboard
npm run db:migrate          # create a versioned migration
npm run db:push             # push schema without a migration (fastest for local dev)
npm run seed                # demo-mode seed run of the full pipeline

npm run scan:leaderboard    # pull top 500 wallets
npm run scan:wallets        # score every wallet's last 30 days
npm run monitor:trades      # detect new trades from tracked/watched wallets
npm run score:trades        # score new trades -> paper_copy / watchlist / skip
npm run paper:update-pnl    # refresh open paper trades' PnL (run hourly)
npm run review:outcomes     # judge resolved paper trades as good/bad calls
npm run update:rules        # let the bot tune its own thresholds, with a logged reason
npm run report:daily        # generate (and optionally Telegram) the daily report

npm run test                # vitest — scoring logic + safety checks
```

## How Hermes Agent should operate it

[Hermes Agent](https://github.com/NousResearch/hermes-agent) is a general-purpose agent with its
own cron scheduler and messaging gateway (including Telegram). Point it at this project two ways:

**Option A — shell out to the CLI commands** on a cron schedule, e.g.:

```
*/15 * * * *  cd /path/to/repo && npm run monitor:trades && npm run score:trades
0 * * * *     cd /path/to/repo && npm run paper:update-pnl && npm run review:outcomes
0 6 * * *     cd /path/to/repo && npm run scan:leaderboard && npm run scan:wallets
0 0 * * *     cd /path/to/repo && npm run update:rules && npm run report:daily
```

**Option B — hit the deployed app's `/api/cron` route** (useful once this is deployed on Vercel,
where Hermes can't shell into the box directly):

```
curl -X POST "https://your-app.vercel.app/api/cron?step=full-loop" \
     -H "x-cron-secret: $CRON_SECRET"
```

Valid `step` values: `scan-leaderboard`, `scan-wallets`, `monitor-trades`, `score-trades`,
`paper-update-pnl`, `review-outcomes`, `update-rules`, `report-daily`, or `full-loop` (runs the
non-leaderboard steps back to back — leaderboard scans are cheap to run separately on their own
schedule).

Keep Telegram alerts minimal per the spec: one end-of-day report, plus only genuinely important
events (a very high-confidence paper trade, a major rule change, a significant wallet
upgrade/downgrade, a drawdown warning). This MVP sends the daily report only; wiring up the extra
alert types is a small addition to `reportGenerator.ts` / the cron route if you want Hermes to
push them too.

## How to deploy

**EC2 (recommended for this project):** see [`deploy/README.md`](./deploy/README.md) for a full
walkthrough — pushing this repo to GitHub, launching a t3.micro/t3.small instance, a deploy key
for private-repo access, and scripts (`deploy/setup-ec2.sh`, `deploy/redeploy.sh`) that install
Node/PM2/Nginx, build the app, and wire up the crontab for the operational loop. SQLite works
fine here since EC2's disk (unlike Vercel's) persists across restarts.

**Vercel (alternative):**
1. Push this repo to GitHub.
2. Import it into Vercel.
3. Set `DATABASE_URL` — note that Vercel's serverless filesystem is ephemeral, so **SQLite alone
   won't persist between deployments/cold starts in production.** For a real Vercel deployment,
   swap `provider = "sqlite"` in `prisma/schema.prisma` for a hosted Postgres (e.g. Vercel
   Postgres, Neon, Supabase) and update `DATABASE_URL` accordingly — the rest of the code is
   ORM-agnostic and needs no other changes.
4. Set `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` / `CRON_SECRET` if you want those features.
5. Set up Vercel Cron (or point Hermes Agent at `/api/cron`) for the schedule in
   `deploy/crontab.txt`.

## How to add it to Max HQ

The dashboard is a normal Next.js app — embed it in Max HQ as an iframe pointed at your deployed
URL, or link out to it directly. There's nothing Max-HQ-specific baked into the routing, so it
also runs standalone.

---

## How wallet scoring works

Each wallet's last 30 days of trades are scored on ROI, consistency (variance of per-trade
returns), copyability (trade size/frequency), category strengths, and resolved win rate. A
**one-hit-wonder penalty** kicks in when a single trade accounts for more than ~60% of a wallet's
total simulated profit — that's a sign of a lucky outlier, not a repeatable edge. Wallets need at
least 8 resolved trades before they're eligible for `track` status; below that, they're capped at
`watch` at best. See `src/lib/scoring/walletScoring.ts` and `tests/walletScoring.test.ts`.

## How trade scoring works

Each new trade from a tracked/watched wallet is scored against a fresh market quote: how far has
the price moved since the wallet's own entry, how wide is the spread, how deep is the liquidity,
how much time is left before resolution, and how strong is the wallet's track record in that
market's category. A weighted combination produces a `copyScore`; three thresholds
(`minCopyScoreForPaperCopy`, `minCopyScoreForWatchlist`, and hard liquidity/spread/timing gates)
turn that into `paper_copy` / `watchlist` / `skip`. See `src/lib/scoring/tradeScoring.ts`.

## How paper trading works

Every `paper_copy` decision opens a `PaperTrade` with a simulated position between $5 and $20,
sized up toward $20 as confidence increases. `paper:update-pnl` refreshes `currentPrice` and
`unrealizedPnl` for every open position (intended to run hourly); a trade is marked `resolved`
once its market price settles near 0 or 1, and its final `realizedPnl` is locked in.

## How self-improvement works

`update:rules` looks at the last 100 reviewed outcomes and checks a few specific patterns: are
wide-spread copies underperforming? Is low liquidity correlating with bad calls? Are late entries
losing? Are any tracked wallets on a bad recent streak? When a pattern crosses a
statistical-significance-ish bar (at least 5 matching samples and a sub-40% good-decision rate),
it nudges the relevant threshold and calls `applyRuleChange`, which **always** creates a new
versioned `RuleSet` and a `RuleChange` row recording the reason, the evidence, and the exact
before/after values — nothing is mutated silently, and you can see the full history on the
**Rules** page.

## How to interpret the dashboard

- **Overview** answers "are we profitable, which wallets matter, what did we learn" at a glance.
- **Wallet Rankings → Wallet Profile**: drill from the leaderboard into any individual wallet's
  history and copyability notes.
- **Trade Signals**: every new trade the bot has seen and how it scored it, with reasons/risks.
- **Paper Trades**: the actual simulated positions and their live PnL.
- **Decision Journal**: click any row to expand the full score breakdown and, once resolved,
  whether it was judged a good or bad call and what was learned.
- **Performance**: bot-filtered vs. blind-copy benchmark, category/wallet PnL breakdowns.
- **Rules**: the current thresholds and the full audit trail of automatic changes.
- **Reports**: the end-of-day (and eventually weekly) summaries.

---

## Known simplifications (read before trusting the numbers)

This is a working MVP built to the spec, not a production trading research desk. A few things are
intentionally simplified and called out here rather than hidden:

- **Polymarket endpoint paths** in `src/lib/adapters/polymarketAdapter.ts` have been verified
  against [docs.polymarket.com](https://docs.polymarket.com) (leaderboard, trades, market lookup,
  order book) — not just guessed. A few real API quirks worth knowing:
  - The leaderboard endpoint (`/v1/leaderboard`) caps `limit` at 50 per call, so pulling 500
    wallets means 10 paginated calls (handled automatically).
  - The trades endpoint (`/trades`) does **not** include category or resolved/won status — this
    adapter derives both by batch-looking-up each trade's market via
    `/markets?condition_ids=...` on the Gamma API and comparing the trade's chosen outcome against
    the market's settled `outcomePrices`.
  - `marketId` is treated as the market's `conditionId` throughout this app (that's what both the
    trades endpoint and the Gamma market lookup key on).
  - This still could not be executed end-to-end from the sandboxed environment that assembled
    this repo (no network egress to polymarket.com there) — the endpoint shapes are correct per
    docs, but you should still watch the first few live runs closely (`npm run scan:leaderboard`,
    `npm run scan:wallets`) to catch any drift between the docs and actual responses. The adapter
    is written to fail loudly (real error, no fake data) if something doesn't match, so you'll
    know quickly rather than silently getting garbage.
- **Blind-copy benchmark** (Performance page) rescales the bot's own paper PnL by position size
  rather than running a fully independent blind simulation with its own price history. It's a
  reasonable directional estimate, not an exact backtest.
- **Missed winners / avoided losers** tracking is partial in this MVP — watchlist/skip decisions
  are counted, but a full "what would have happened" simulation for every skipped trade isn't
  wired up yet (it would need ongoing price snapshots for markets the bot chose not to enter).
- **Weekly reports** aren't generated yet — only daily. The `DailyReport` model and
  `report:daily` script are the foundation; a `report:weekly` script that aggregates 7 days of
  `DailyReport` rows is a natural next addition.
- **Extra Telegram alerts** (high-confidence trade, major rule change, wallet
  upgrade/downgrade, drawdown warning) aren't wired up beyond the daily report — see the Hermes
  operator section above for where to add them.

## Tests

```bash
npm run test
```

Covers: wallet scoring (one-hit-wonder penalty, consistency, copyability, status thresholds),
trade scoring (paper_copy/watchlist/skip thresholds, position sizing), and safety (no
signing/order-placement code anywhere in the source tree, no wallet-signing libraries in
`package.json`, no secret-shaped values in `.env.example`). Engine-level tests that touch the
database (paper trade creation, hourly PnL updates, rule versioning, benchmark comparison) are
scaffolded structurally in `src/lib/engine/*` but need `prisma generate` + a local SQLite file to
run against real data — see the setup note above.
