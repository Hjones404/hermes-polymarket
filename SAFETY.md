# Safety

## Why version one is paper trading only

This system exists to find out whether a copy-trading strategy has real edge *before* any money
is at risk. Leaderboard rankings are easy to game or misread (see below), and a strategy that
looks good in hindsight can still fail the moment it has to act on live, moving prices. Paper
trading lets the wallet-scoring and trade-scoring logic prove itself against real market data
without the downside of being wrong.

## Why real execution is disabled

There is no code path anywhere in this project that places an order, signs a transaction, or
holds a key. `tests/safety.test.ts` scans the entire source tree for signing/order-placement
patterns and for wallet-signing library dependencies (`ethers`, `web3`, `viem`,
`@polymarket/clob-client`, etc.) and fails the build if any are found. This isn't a policy that
could be quietly relaxed later — it's an active test that has to be deliberately deleted to break.

## How autonomy could be added later

If paper trading demonstrates a real, resolved-trade edge over enough volume and time to be
statistically meaningful (not just a lucky streak — the same one-hit-wonder logic this bot
applies to leaderboard wallets should be applied to itself), a future version could add a
narrowly-scoped execution layer:

- A separate, explicitly-opt-in module, not a flag on this one.
- Read-only wallet connection for balance checks; a signing key held outside this app entirely
  (e.g. a hardware wallet or a dedicated signing service), never in this app's environment or
  database.
- Hard position-size and daily-loss caps enforced server-side, not just in the UI.
- A manual approval step for at least the first N live trades.

None of that exists today, and building it out isn't a small extension of this codebase — it's a
new trust boundary that deserves its own design and review.

## Risks of stale data

Prices move between when a wallet enters a trade and when this bot detects it, scores it, and
(on paper) copies it. `entryTimingScore` exists specifically to penalize trades where the price
has already moved a lot since the wallet's entry — but detection latency, API rate limits, or an
outage can still mean the bot is looking at a stale quote. If a live API call fails, the code
returns the real error rather than a fabricated quote (see `polymarketAdapter.ts`), so stale data
should surface as a visible error, not a silent wrong number.

## Risks of low liquidity

A wallet's edge can look real on paper while being impossible to actually follow, because their
position was one of the only meaningful trades in an illiquid market. `minLiquidityForCopy` and
the wallet-level copyability score exist to filter these out, but liquidity figures from a public
API can themselves be stale or approximate — treat "sufficient liquidity" as a filter that reduces
risk, not a guarantee of a clean fill.

## Risks of wide spreads

A wide bid/ask spread means the effective cost of entering (and later exiting) a position is
higher than the quoted mid-price suggests. `maxAllowedSpreadForCopy` filters trades with spreads
above a threshold, and the auto rule updater tightens that threshold further if wide-spread copies
are underperforming — but a spread can also widen suddenly after a decision is made and before a
paper (or, later, real) position would be opened.

## Risks of copy trading generally

Copying a wallet assumes their past behavior predicts their future behavior, and that their
incentives match yours. Neither is guaranteed: a wallet might be running a strategy that only
works at their size, hedging a position elsewhere that you can't see, or simply on a streak that's
about to end. The one-hit-wonder penalty, consistency score, and minimum resolved-trade count are
all attempts to filter for *repeatable* edge rather than a good story, but no scoring system can
fully rule out "got lucky."

## Why leaderboard wallets can be misleading

A leaderboard ranks total PnL or ROI, which rewards big, concentrated, or high-variance bets just
as much as consistent skill — sometimes more. A wallet at the top of the board may have gotten
there from one large correct bet rather than a repeatable edge. This is the entire reason the
one-hit-wonder penalty and minimum-resolved-trades threshold exist in `walletScoring.ts`: rank on
the leaderboard is a starting point for investigation, not a verdict.

## Why private keys should never be stored in this app

A private key or seed phrase is the entire authority over a wallet's funds. Storing one in an
application's environment variables, database, or logs — even one that "only reads" data most of
the time — creates a single point of failure: a misconfigured log line, a debug endpoint, a
dependency vulnerability, or a compromised deployment host would be enough to drain the wallet.
This app has no field, environment variable, or code path designed to accept one, and it should
stay that way even if a future version adds real execution (see "How autonomy could be added
later" above) — execution should be a separate, narrowly-scoped system with its own key handling,
not a permission added to this one.
