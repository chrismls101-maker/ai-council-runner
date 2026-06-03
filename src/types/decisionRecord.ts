import type { OutcomeStatus, DecisionQuality } from "./decisionQuality";
import type { RunCostSummary } from "./index";

export interface DecisionRecord {
  id: string;
  runId: string;
  timestamp: string;
  projectName?: string;
  workflowId: string;
  route: string;
  decisionTitle: string;
  originalPrompt: string;
  recommendedDecision?: string;
  reason?: string;
  confidence?: string;
  decisionScore?: number;
  riskLevel?: string;
  riskFlags: string[];
  sourcesUsed: string[];
  includedMemoryIds: string[];
  costSummary?: RunCostSummary | null;
  actionTaken?: string;
  expectedOutcome?: string;
  actualOutcome?: string;
  outcomeStatus: OutcomeStatus;
  resultMetric?: string;
  lessonsLearned?: string;
  nextTimeRecommendation?: string;
  updatedAt: string;
}

export interface DecisionLearningStats {
  totalDecisions: number;
  outcomesLogged: number;
  workedCount: number;
  didNotWorkCount: number;
  needsRevisionCount: number;
  withoutOutcomes: number;
  topProjects: { name: string; count: number }[];
  recentLessons: { recordId: string; title: string; lesson: string; updatedAt: string }[];
}

export function buildClientLearningSummary(record: DecisionRecord): string {
  const hasData = Boolean(
    record.actionTaken?.trim() ||
      record.expectedOutcome?.trim() ||
      record.actualOutcome?.trim() ||
      record.resultMetric?.trim() ||
      record.lessonsLearned?.trim(),
  );

  if (record.outcomeStatus === "not_started" && !hasData) {
    return "Outcome not logged yet.";
  }

  const parts: string[] = [];
  const status = record.outcomeStatus;

  if (status === "worked") parts.push("Decision worked.");
  else if (status === "did_not_work") parts.push("Decision did not work as intended.");
  else if (status === "needs_revision") parts.push("Decision needs revision.");
  else if (status === "in_progress") parts.push("Decision is in progress.");
  else if (hasData) parts.push("Execution tracked; outcome still open.");

  if (record.actualOutcome?.trim()) {
    parts.push(record.actualOutcome.trim());
  } else if (record.resultMetric?.trim()) {
    parts.push(`Result: ${record.resultMetric.trim()}`);
  }

  if (record.lessonsLearned?.trim()) {
    const lesson = record.lessonsLearned.trim();
    if (status === "worked") parts.push(`Repeat what worked: ${lesson}`);
    else if (status === "did_not_work") parts.push(`Change next time: ${lesson}`);
    else if (status === "needs_revision") parts.push(`Revise approach: ${lesson}`);
    else parts.push(lesson);
  }

  if (record.nextTimeRecommendation?.trim()) {
    parts.push(record.nextTimeRecommendation.trim());
  }

  return parts.join(" ");
}

export function decisionQualityFromRecord(record: DecisionRecord): Partial<DecisionQuality> {
  return {
    recommendedAction: record.recommendedDecision,
    confidence: record.confidence as DecisionQuality["confidence"],
    decisionScore: record.decisionScore,
    whyThisScore: record.reason,
    riskLevel: record.riskLevel as DecisionQuality["riskLevel"],
    riskFlags: record.riskFlags,
  };
}
