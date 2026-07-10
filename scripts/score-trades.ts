import { scoreUnscoredTrades } from "../src/lib/engine/decisionEngine";

async function main() {
  console.log("[score:trades] Scoring newly observed trades...");
  const summary = await scoreUnscoredTrades();
  console.log(
    `[score:trades] scored=${summary.scored} paper_copy=${summary.paperCopy} watchlist=${summary.watchlist} skip=${summary.skip} bankrollBlocked=${summary.bankrollBlocked} marketDataUnavailable=${summary.marketDataUnavailable}`
  );
  if (summary.errors.length) {
    console.log(`[score:trades] ${summary.errors.length} market lookup(s) failed and were marked skip (real API failures — not faked):`);
    for (const e of summary.errors.slice(0, 10)) console.log(`  - ${e}`);
    if (summary.errors.length > 10) console.log(`  ...and ${summary.errors.length - 10} more.`);
  }
}

main().finally(() => process.exit(0));
