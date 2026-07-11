import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const decisions = await db.decisionJournal.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { observedTrade: true, outcomeReview: true },
  });

  return NextResponse.json(
    decisions.map((d: any) => ({
      id: d.id,
      walletAddress: d.walletAddress,
      marketQuestion: d.observedTrade.marketQuestion,
      marketCategory: d.observedTrade.marketCategory,
      outcome: d.observedTrade.outcome, // e.g. "Yes"/"No", "Up"/"Down", or a team/side name
      side: d.observedTrade.side, // buy | sell
      walletEntryPrice: d.observedTrade.walletEntryPrice,
      decision: d.decision,
      copyScore: d.copyScore,
      confidence: d.confidence,
      reasons: JSON.parse(d.reasonsJson),
      risks: JSON.parse(d.risksJson),
      breakdown: {
        walletQualityScore: d.walletQualityScore,
        roiScore: d.roiScore,
        consistencyScore: d.consistencyScore,
        copyabilityScore: d.copyabilityScore,
        categoryFitScore: d.categoryFitScore,
        entryTimingScore: d.entryTimingScore,
        spreadScore: d.spreadScore,
        liquidityScore: d.liquidityScore,
        thesisScore: d.thesisScore,
      },
      wasDecisionGood: d.outcomeReview?.wasDecisionGood ?? null,
      lessons: d.outcomeReview?.lessonsJson ? JSON.parse(d.outcomeReview.lessonsJson) : [],
      createdAt: d.createdAt,
    }))
  );
}

export const dynamic = "force-dynamic";
