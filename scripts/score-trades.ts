import { scoreUnscoredTrades } from "../src/lib/engine/decisionEngine";

async function main() {
  console.log("[score:trades] Scoring newly observed trades...");
  const summary = await scoreUnscoredTrades();
  console.log(
    `[score:trades] scored=${summary.scored} paper_copy=${summary.paperCopy} watchlist=${summary.watchlist} skip=${summary.skip}`
  );
  if (summary.errors.length) {
    console.log("[score:trades] Errors (real API/parse failures — not faked):");
    for (const e of summary.errors.slice(0, 10)) console.log(`  - ${e}`);
  }
}

main().finally(() => process.exit(0));
