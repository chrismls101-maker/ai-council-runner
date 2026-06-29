import type { Pathway, PathwayStatus } from "./glassPathwaysTypes.ts";
import { pathwayStatusLabel as workflowStatusLabel } from "./glassPathwaysWorkflow.ts";
import { formatRelativeTime } from "./relativeTime.ts";

export const GLASS_PATHWAYS_MAX_SAVED = 12;

export function pathwayStatusLabel(status: PathwayStatus): string {
  return workflowStatusLabel(status);
}

/** Derive display status from stage/step progress. */
export function derivePathwayDisplayStatus(pathway: Pathway): PathwayStatus {
  if (
    pathway.status === "paused"
    || pathway.status === "privacy_handoff"
    || pathway.status === "operator_running"
    || pathway.status === "awaiting_approval"
    || pathway.status === "blocked"
    || pathway.status === "failed"
    || pathway.status === "cancelled"
  ) {
    return pathway.status;
  }

  const total = pathway.stages.length;
  if (total === 0) {
    return pathway.status === "completed" ? "completed" : pathway.status;
  }

  const completedCount = pathway.stages.filter((s) => s.status === "completed").length;
  if (completedCount === total) return "completed";

  if (
    pathway.stages.some((s) => s.status === "active")
    || completedCount > 0
    || pathway.status === "active"
    || pathway.currentStageId
  ) {
    return "active";
  }

  return pathway.status === "drafting" ? "drafting" : "ready";
}

export function pathwayProgressSummary(pathway: Pathway): string {
  const total = pathway.stages.length;
  if (total === 0) return "0 stages";
  const done = pathway.stages.filter((s) => s.status === "completed").length;
  const stepTotal = pathway.steps.length;
  const stepDone = pathway.steps.filter((s) => s.status === "completed").length;
  if (stepTotal > 0) {
    return `${done}/${total} stages · ${stepDone}/${stepTotal} steps`;
  }
  return `${done}/${total} complete`;
}

export function formatPathwayUpdatedAt(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  return formatRelativeTime(ms);
}

export function formatPathwayGenerateError(message: string): string {
  const lower = message.toLowerCase();
  if (
    lower.includes("no anthropic api key")
    || lower.includes("glassasknoanthropickey")
  ) {
    return "Add an Anthropic API key in Panel → Setup (or API Keys on the builder strip), then try again.";
  }
  if (lower.includes("parse pathway") || lower.includes("could not parse")) {
    return "Glass couldn't structure that pathway — try a clearer goal or generate again.";
  }
  if (lower.includes("empty response")) {
    return "The AI returned an empty response. Check your connection and try again.";
  }
  return message;
}

export function normalizePathwayStatus(pathway: Pathway): Pathway {
  const status = derivePathwayDisplayStatus(pathway);
  if (status === pathway.status) return pathway;
  return { ...pathway, status };
}
