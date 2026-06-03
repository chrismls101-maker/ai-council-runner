import { OUTCOME_STATUS_LABELS } from "../decisionQuality/types.js";
import type { DecisionRecord } from "./types.js";

function hasExecutionData(record: DecisionRecord): boolean {
  return Boolean(
    record.actionTaken?.trim() ||
      record.expectedOutcome?.trim() ||
      record.actualOutcome?.trim() ||
      record.resultMetric?.trim() ||
      record.lessonsLearned?.trim(),
  );
}

/** Deterministic learning summary — no model call. */
export function buildLearningSummary(record: DecisionRecord): string {
  if (record.outcomeStatus === "not_started" && !hasExecutionData(record)) {
    return "Outcome not logged yet.";
  }

  const parts: string[] = [];
  const status = record.outcomeStatus;

  if (status === "worked") {
    parts.push("Decision worked.");
  } else if (status === "did_not_work") {
    parts.push("Decision did not work as intended.");
  } else if (status === "needs_revision") {
    parts.push("Decision needs revision.");
  } else if (status === "in_progress") {
    parts.push("Decision is in progress.");
  } else if (hasExecutionData(record)) {
    parts.push("Execution tracked; outcome still open.");
  }

  if (record.actionTaken?.trim()) {
    parts.push(`Action: ${record.actionTaken.trim()}`);
  }

  if (record.actualOutcome?.trim()) {
    parts.push(record.actualOutcome.trim());
  } else if (record.resultMetric?.trim()) {
    parts.push(`Result: ${record.resultMetric.trim()}`);
  }

  if (record.lessonsLearned?.trim()) {
    const lesson = record.lessonsLearned.trim();
    if (status === "worked") {
      parts.push(`Repeat what worked: ${lesson}`);
    } else if (status === "did_not_work") {
      parts.push(`Change next time: ${lesson}`);
    } else if (status === "needs_revision") {
      parts.push(`Revise approach: ${lesson}`);
    } else {
      parts.push(lesson);
    }
  }

  if (record.nextTimeRecommendation?.trim()) {
    parts.push(record.nextTimeRecommendation.trim());
  } else if (status === "worked" && record.lessonsLearned?.trim()) {
    parts.push("Consider repeating this approach with the same angle.");
  } else if (status === "did_not_work" && record.lessonsLearned?.trim()) {
    parts.push("Do not repeat the same approach without changes.");
  }

  if (parts.length === 1 && parts[0] === "Outcome not logged yet.") {
    return parts[0];
  }

  return parts.join(" ");
}

export function outcomeStatusLabel(status: DecisionRecord["outcomeStatus"]): string {
  return OUTCOME_STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

export function pastOutcomeBracket(status: DecisionRecord["outcomeStatus"]): string {
  switch (status) {
    case "worked":
      return "Worked";
    case "did_not_work":
      return "Did not work";
    case "needs_revision":
      return "Needs revision";
    case "in_progress":
      return "In progress";
    default:
      return "Not started";
  }
}

/** Deterministic guidance for Final Judge when referencing a tracked outcome. */
export function pastOutcomeInterpretation(
  status: DecisionRecord["outcomeStatus"],
): string {
  switch (status) {
    case "worked":
      return "Can be treated as positive evidence.";
    case "did_not_work":
      return "Avoid repeating this approach without revision.";
    case "needs_revision":
      return "Revise the approach before repeating.";
    case "in_progress":
      return "This is not conclusive evidence yet. Treat as in-progress, not worked.";
    default:
      return "Outcome not finalized — do not use as proof.";
  }
}
