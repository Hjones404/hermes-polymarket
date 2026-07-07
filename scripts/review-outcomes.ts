import { reviewResolvedPaperTrades } from "../src/lib/engine/outcomeReviewer";

async function main() {
  console.log("[review:outcomes] Reviewing resolved paper trades...");
  const summary = await reviewResolvedPaperTrades();
  console.log(`[review:outcomes] reviewed=${summary.reviewed}`);
}

main().finally(() => process.exit(0));
