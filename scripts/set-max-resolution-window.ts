// One-off operator-driven rule change: cap how far in the future a market
// can resolve and still be eligible for paper_copy (default 24 hours).
//
// This does NOT touch the database directly — it goes through the same
// applyRuleChange() function the automatic rule updater uses, so this shows
// up in the Rules page's change history like any other rule change, just
// tagged as a manual/operator change rather than "hermes" automatic.
//
// Usage: npx tsx scripts/set-max-resolution-window.ts [hours]
//   e.g. npx tsx scripts/set-max-resolution-window.ts 24

import { applyRuleChange, getActiveRules } from "../src/lib/engine/ruleEngine";

async function main() {
  const hoursArg = process.argv[2];
  const hours = hoursArg ? Number(hoursArg) : 24;
  if (!Number.isFinite(hours) || hours <= 0) {
    console.error("Usage: npx tsx scripts/set-max-resolution-window.ts [hours]  (hours must be a positive number)");
    process.exit(1);
  }
  const maxSeconds = Math.round(hours * 3600);

  const current = await getActiveRules();
  console.log(`Current maxTimeToResolutionSeconds: ${current.maxTimeToResolutionSeconds ?? "(not set — would have broken the new gate!)"}`);

  const { rules } = await applyRuleChange({
    reason: `Operator requested a hard cap on how far out a market can resolve — only copy trades resolving within ${hours}h.`,
    evidenceSummary: "Manual change requested directly by the operator, not derived from outcome data.",
    mutate: (r) => ({ ...r, maxTimeToResolutionSeconds: maxSeconds }),
  });

  console.log(`Done. New maxTimeToResolutionSeconds: ${rules.maxTimeToResolutionSeconds} (${hours}h), rule version ${rules.version}.`);
}

main()
  .catch((err) => {
    console.error("Failed to update rules:", err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
