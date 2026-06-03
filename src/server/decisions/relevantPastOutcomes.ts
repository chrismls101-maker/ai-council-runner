import { listDecisionRecords } from "./decisionStore.js";
import {
  pastOutcomeBracket,
  pastOutcomeInterpretation,
} from "./learningSummary.js";
import type { DecisionRecord } from "./types.js";
import {
  shouldInjectContext,
  traceExclusionMessage,
  type ContextRelevanceResult,
} from "../contextRelevance/globalContextGuard.js";

const STOP_WORDS = new Set([
  "the", "a", "an", "for", "and", "or", "to", "in", "on", "at", "with",
  "my", "our", "i", "we", "should", "would", "could", "what", "when",
  "this", "that", "it", "is", "are", "of", "from", "now", "after",
]);

function keywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

function scoreRecord(
  record: DecisionRecord,
  prompt: string,
  workflowId?: string,
  projectName?: string,
): number {
  let score = 0;
  const promptKw = keywords(prompt);
  const titleKw = keywords(record.decisionTitle);
  const originalKw = keywords(record.originalPrompt);

  if (projectName && record.projectName?.trim().toLowerCase() === projectName.toLowerCase()) {
    score += 4;
  }

  if (workflowId && record.workflowId === workflowId) {
    score += 2;
  }

  for (const kw of promptKw) {
    if (titleKw.includes(kw) || originalKw.includes(kw)) score += 1;
    if (record.recommendedDecision?.toLowerCase().includes(kw)) score += 0.5;
    if (record.lessonsLearned?.toLowerCase().includes(kw)) score += 1;
  }

  if (record.outcomeStatus !== "not_started") score += 1;
  if (record.lessonsLearned?.trim()) score += 1;
  if (record.actionTaken?.trim()) score += 0.5;

  return score;
}

function outcomeGuardInput(
  record: DecisionRecord,
  prompt: string,
  options: { workflowId?: string; route?: string; currentRunId?: string },
): Parameters<typeof shouldInjectContext>[0] {
  const body = [
    record.decisionTitle,
    record.originalPrompt,
    record.recommendedDecision,
    record.actionTaken,
    record.actualOutcome,
    record.lessonsLearned,
    record.resultMetric,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    userPrompt: prompt,
    route: options.route,
    workflowId: options.workflowId ?? record.workflowId,
    contextType: "outcome",
    contextTitle: record.decisionTitle,
    contextBody: body,
    projectName: record.projectName,
    linkedRunId: record.runId,
    currentRunId: options.currentRunId,
  };
}

function outcomeHeadline(record: DecisionRecord): string {
  const project = record.projectName?.trim() || "Project";
  const strippedTitle = record.decisionTitle
    .replace(new RegExp(`^${project}\\s*[—–-]\\s*`, "i"), "")
    .trim();
  const title = strippedTitle || record.decisionTitle.trim() || "Decision";
  return `${project} / ${title}`;
}

/** Multi-line block with specific tracked fields for Final Judge context. */
export function buildPastOutcomeDetailBlock(record: DecisionRecord): string {
  const bracket = pastOutcomeBracket(record.outcomeStatus);
  const lines: string[] = [`[${bracket}] ${outcomeHeadline(record)}`];

  if (record.actionTaken?.trim()) {
    lines.push(`- Action taken: ${record.actionTaken.trim()}`);
  }
  if (record.actualOutcome?.trim()) {
    lines.push(`- Actual outcome: ${record.actualOutcome.trim()}`);
  }
  if (record.resultMetric?.trim()) {
    lines.push(`- Metric/result: ${record.resultMetric.trim()}`);
  }
  if (record.lessonsLearned?.trim()) {
    lines.push(`- Lessons learned: ${record.lessonsLearned.trim()}`);
  }
  lines.push(
    `- Interpretation: ${pastOutcomeInterpretation(record.outcomeStatus)}`,
  );

  return lines.join("\n");
}

/** @deprecated Use buildPastOutcomeDetailBlock — kept for one-line summaries. */
export function buildPastOutcomeLine(record: DecisionRecord): string {
  const detail =
    record.lessonsLearned?.trim() ||
    record.actualOutcome?.trim() ||
    record.resultMetric?.trim() ||
    record.actionTaken?.trim() ||
    "no outcome logged yet";
  const bracket = pastOutcomeBracket(record.outcomeStatus);
  return `[${bracket}] ${outcomeHeadline(record)} — ${detail}`.replace(/\s+/g, " ").trim();
}

export interface PastOutcomeGuardExclusion {
  recordId: string;
  title: string;
  guard: ContextRelevanceResult;
}

export async function findRelevantPastOutcomes(options: {
  prompt: string;
  workflowId?: string;
  projectName?: string;
  excludeRunId?: string;
  route?: string;
  limit?: number;
}): Promise<{ records: DecisionRecord[]; exclusions: PastOutcomeGuardExclusion[] }> {
  const { prompt, workflowId, projectName, excludeRunId, route, limit = 5 } = options;
  const records = await listDecisionRecords();
  const exclusions: PastOutcomeGuardExclusion[] = [];

  const scored = records
    .filter((r) => r.runId !== excludeRunId)
    .filter((r) => {
      if (r.outcomeStatus !== "not_started") return true;
      return Boolean(
        r.actionTaken?.trim() ||
          r.lessonsLearned?.trim() ||
          r.actualOutcome?.trim() ||
          r.resultMetric?.trim(),
      );
    })
    .map((r) => ({ record: r, score: scoreRecord(r, prompt, workflowId, projectName) }))
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score);

  const allowed: DecisionRecord[] = [];

  for (const { record } of scored) {
    if (allowed.length >= limit) break;

    const guard = shouldInjectContext(
      outcomeGuardInput(record, prompt, {
        workflowId,
        route,
        currentRunId: excludeRunId,
      }),
    );

    if (guard.allow) {
      allowed.push(record);
    } else {
      exclusions.push({
        recordId: record.id,
        title: record.decisionTitle,
        guard,
      });
    }
  }

  return { records: allowed, exclusions };
}

export interface RelevantPastOutcomesBlock {
  block: string;
  recordIds: string[];
  exclusions: PastOutcomeGuardExclusion[];
}

export async function formatRelevantPastOutcomesBlock(options: {
  prompt: string;
  workflowId?: string;
  projectName?: string;
  excludeRunId?: string;
  route?: string;
}): Promise<RelevantPastOutcomesBlock> {
  const { records, exclusions } = await findRelevantPastOutcomes(options);
  if (records.length === 0) {
    return { block: "", recordIds: [], exclusions };
  }

  const blocks = records.map(buildPastOutcomeDetailBlock);
  return {
    block: `Relevant Past Outcomes:\n${blocks.join("\n\n")}`,
    recordIds: records.map((r) => r.id),
    exclusions,
  };
}

export function formatOutcomeGuardTraceLines(exclusions: PastOutcomeGuardExclusion[]): string[] {
  return exclusions.map((ex) =>
    traceExclusionMessage("outcome", ex.guard, ex.title.slice(0, 60)),
  );
}
