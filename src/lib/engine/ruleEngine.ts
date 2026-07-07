import { db } from "../db";
import { DEFAULT_RULES, type Rules } from "../rules/defaultRules";

export async function getActiveRules(): Promise<Rules> {
  const active = await db.ruleSet.findFirst({ where: { active: true }, orderBy: { version: "desc" } });
  if (!active) {
    const created = await db.ruleSet.create({
      data: { version: 1, active: true, rulesJson: JSON.stringify(DEFAULT_RULES) },
    });
    return JSON.parse(created.rulesJson);
  }
  return JSON.parse(active.rulesJson);
}

export interface ProposedRuleChange {
  reason: string;
  evidenceSummary: string;
  mutate: (rules: Rules) => Rules;
}

/**
 * Applies a rule change autonomously (no human approval required, per spec),
 * but always creates a new versioned RuleSet and a RuleChange row recording
 * why, the before/after values, and the evidence used. Never mutates a
 * RuleSet in place.
 */
export async function applyRuleChange(change: ProposedRuleChange) {
  const current = await db.ruleSet.findFirst({ where: { active: true }, orderBy: { version: "desc" } });
  const currentRules: Rules = current ? JSON.parse(current.rulesJson) : DEFAULT_RULES;
  const nextRules = change.mutate(structuredClone(currentRules));
  nextRules.version = (current?.version ?? 0) + 1;

  const newRuleSet = await db.$transaction(async (tx: any) => {
    if (current) {
      await tx.ruleSet.update({ where: { id: current.id }, data: { active: false } });
    }
    const created = await tx.ruleSet.create({
      data: { version: nextRules.version, active: true, rulesJson: JSON.stringify(nextRules) },
    });
    await tx.ruleChange.create({
      data: {
        oldRuleSetId: current?.id,
        newRuleSetId: created.id,
        changedBy: "hermes",
        reason: change.reason,
        evidenceSummary: change.evidenceSummary,
        beforeJson: current ? current.rulesJson : JSON.stringify(DEFAULT_RULES),
        afterJson: created.rulesJson,
      },
    });
    return created;
  });

  return { ruleSet: newRuleSet, rules: nextRules };
}
