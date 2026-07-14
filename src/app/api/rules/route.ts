import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const active = await db.ruleSet.findFirst({ where: { active: true } });
  const changes = await db.ruleChange.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { oldRuleSet: true, newRuleSet: true },
  });

  return NextResponse.json({
    active: active ? { version: active.version, rules: JSON.parse(active.rulesJson), updatedAt: active.updatedAt } : null,
    changes: changes.map((c: any) => ({
      reason: c.reason,
      evidenceSummary: c.evidenceSummary,
      before: JSON.parse(c.beforeJson),
      after: JSON.parse(c.afterJson),
      fromVersion: c.oldRuleSet?.version ?? null,
      toVersion: c.newRuleSet.version,
      createdAt: c.createdAt,
    })),
  });
}

export const dynamic = "force-dynamic";
