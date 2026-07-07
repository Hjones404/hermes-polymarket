import { autoUpdateRules } from "../src/lib/engine/ruleAutoUpdater";

async function main() {
  console.log("[update:rules] Checking whether rule thresholds should evolve...");
  const summary = await autoUpdateRules();
  console.log(`[update:rules] changesMade=${summary.changesMade}`);
  for (const d of summary.details) console.log(`  - ${d}`);
}

main().finally(() => process.exit(0));
