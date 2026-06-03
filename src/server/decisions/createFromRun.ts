import { generateDecisionTitle } from "../history/decisionTitle.js";
import type { RunHistoryEntry } from "../history/runHistory.js";
import { createDecisionRecord, getDecisionRecordByRunId } from "./decisionStore.js";
import { COUNCIL_DECISION_WORKFLOWS, type DecisionRecord } from "./types.js";

function extractRecommendedDecision(entry: RunHistoryEntry): string | undefined {
  const dq = entry.decisionQuality;
  if (dq?.recommendedAction?.trim()) return dq.recommendedAction.trim();
  const final = entry.outputs.finalJudge?.trim();
  if (!final) return undefined;
  const firstLine = final.split("\n").find((l) => l.trim().length > 0);
  return firstLine?.replace(/^#+\s*/, "").trim();
}

export async function createDraftDecisionRecordFromRun(
  entry: RunHistoryEntry,
): Promise<DecisionRecord | null> {
  if (entry.workflowId === "direct_answer") return null;
  if (!COUNCIL_DECISION_WORKFLOWS.has(entry.workflowId)) return null;
  if (entry.status !== "complete") return null;

  const existing = await getDecisionRecordByRunId(entry.runId);
  if (existing) return existing;

  const decisionTitle =
    entry.title ??
    generateDecisionTitle(
      entry.preset,
      entry.workflowId,
      entry.workflowName,
      entry.prompt,
    );

  const dq = entry.decisionQuality;

  return createDecisionRecord({
    runId: entry.runId,
    timestamp: entry.timestamp,
    projectName: entry.businessContext?.name?.trim() || undefined,
    workflowId: entry.workflowId,
    route: entry.routerDecision?.selectedWorkflow ?? entry.workflowId,
    decisionTitle,
    originalPrompt: entry.prompt,
    recommendedDecision: extractRecommendedDecision(entry),
    reason: dq?.whyThisScore?.trim() || entry.decisionObjective?.trim() || undefined,
    confidence: dq?.confidence,
    decisionScore: dq?.decisionScore,
    riskLevel: dq?.riskLevel,
    riskFlags: dq?.riskFlags ?? [],
    sourcesUsed: entry.researchSources ?? [],
    includedMemoryIds: entry.includedMemoryIds ?? [],
    costSummary: entry.costSummary ?? null,
    outcomeStatus: entry.outcome?.status ?? "not_started",
    actionTaken: entry.outcome?.actionTaken,
    expectedOutcome: entry.outcome?.expectedOutcome,
    actualOutcome: entry.outcome?.actualOutcome ?? entry.outcome?.notes,
    resultMetric: entry.outcome?.resultMetric,
    lessonsLearned: entry.outcome?.lessonsLearned,
    nextTimeRecommendation: entry.outcome?.nextTimeRecommendation,
  });
}
