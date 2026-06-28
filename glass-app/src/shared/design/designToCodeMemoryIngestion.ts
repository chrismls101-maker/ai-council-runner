/**
 * Phase 3 — selective Glass Memory ingestion for Design to Code.
 * Pure evaluation only; main process applies via storeMemory / upsertUserContext.
 */

import type { DesignStack, DesignToCodeAction } from "./designToCodeTypes.ts";
import { DESIGN_STACK_LABELS, DESIGN_TO_CODE_ACTION_LABELS } from "./designStackRegistry.ts";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const PREFERENCE_MIN_SAVES = 3;
const FAILURE_PATTERN_MIN = 2;
const REFINEMENT_WORKFLOW_MIN = 2;
const FIDELITY_PATTERN_MIN = 2;

export type DesignToCodeMemoryEvent =
  | "save_succeeded"
  | "save_failed"
  | "generation_failed"
  | "explicit_remember";

export type DesignToCodeProjectSnapshot = {
  stack?: DesignStack;
  action?: DesignToCodeAction;
  status: "ready" | "warning" | "failed";
  updatedAt: number;
  revisionCount?: number;
};

export type DesignToCodeMemoryDecision =
  | {
      kind: "episodic";
      summary: string;
      content: string;
      tag: string;
      importance: number;
      memoryType: "design_to_code_pattern" | "design_to_code_explicit";
    }
  | {
      kind: "preference";
      key: string;
      value: string;
      confidence: number;
    };

export function isExplicitDesignToCodeRememberText(text: string): boolean {
  const lower = text.trim().toLowerCase();
  if (!/\bremember\b/.test(lower)) return false;
  return (
    /\b(design to code|design-to-code)\b/.test(lower)
    || /\b(glass storage|saved project)\b/.test(lower)
    || (
      /\b(prefer|always use|default to)\b/.test(lower)
      && /\b(react|tailwind|vue|html|stack)\b/.test(lower)
    )
  );
}

function recentProjects(
  projects: readonly DesignToCodeProjectSnapshot[],
  now: number,
): DesignToCodeProjectSnapshot[] {
  return projects.filter((p) => now - p.updatedAt <= SEVEN_DAYS_MS);
}

function dominantStack(
  successes: DesignToCodeProjectSnapshot[],
): DesignStack | undefined {
  const counts = new Map<DesignStack, number>();
  for (const p of successes) {
    if (!p.stack) continue;
    counts.set(p.stack, (counts.get(p.stack) ?? 0) + 1);
  }
  let best: DesignStack | undefined;
  let bestCount = 0;
  for (const [stack, count] of counts) {
    if (count > bestCount) {
      best = stack;
      bestCount = count;
    }
  }
  if (!best || bestCount < PREFERENCE_MIN_SAVES) return undefined;
  return best;
}

function dominantAction(
  successes: DesignToCodeProjectSnapshot[],
): DesignToCodeAction | undefined {
  const counts = new Map<DesignToCodeAction, number>();
  for (const p of successes) {
    if (!p.action) continue;
    counts.set(p.action, (counts.get(p.action) ?? 0) + 1);
  }
  let best: DesignToCodeAction | undefined;
  let bestCount = 0;
  for (const [action, count] of counts) {
    if (count > bestCount) {
      best = action;
      bestCount = count;
    }
  }
  if (!best || bestCount < PREFERENCE_MIN_SAVES + 1) return undefined;
  return best;
}

export function evaluateDesignToCodeMemoryIngestion(input: {
  event: DesignToCodeMemoryEvent;
  stack: DesignStack;
  action: DesignToCodeAction;
  error?: string;
  projects: readonly DesignToCodeProjectSnapshot[];
  recentGenerationFailureNotes?: number;
  explicitRememberText?: string;
  now?: number;
}): DesignToCodeMemoryDecision[] {
  const now = input.now ?? Date.now();
  const decisions: DesignToCodeMemoryDecision[] = [];

  if (input.explicitRememberText?.trim()) {
    const text = input.explicitRememberText.trim();
    if (isExplicitDesignToCodeRememberText(text)) {
      decisions.push({
        kind: "episodic",
        summary: `User asked to remember: ${text.slice(0, 160)}`,
        content: text.slice(0, 800),
        tag: `d2c:explicit:${hashTag(text)}`,
        importance: 0.85,
        memoryType: "design_to_code_explicit",
      });
    }
  }

  if (input.event === "explicit_remember") {
    return decisions;
  }

  const recent = recentProjects(input.projects, now);
  const stackLabel = DESIGN_STACK_LABELS[input.stack];
  const actionLabel = DESIGN_TO_CODE_ACTION_LABELS[input.action];

  const saveFailures = recent.filter(
    (p) => p.status === "failed" && p.stack === input.stack,
  );
  const saveFailureCount =
    saveFailures.length + (input.event === "save_failed" ? 1 : 0);

  if (input.event === "save_failed" && saveFailureCount >= FAILURE_PATTERN_MIN) {
    decisions.push({
      kind: "episodic",
      summary: `Design to Code save failures recurring for ${stackLabel} (${saveFailureCount} in 7 days).`,
      content: [
        `Stack: ${stackLabel}`,
        `Action: ${actionLabel}`,
        input.error ? `Latest error: ${input.error}` : "",
        "Pattern: generated output but Glass Storage save failed more than once.",
      ].filter(Boolean).join("\n"),
      tag: `d2c:failure:save:${input.stack}`,
      importance: 0.72,
      memoryType: "design_to_code_pattern",
    });
  }

  const genFailures =
    (input.recentGenerationFailureNotes ?? 0)
    + (input.event === "generation_failed" ? 1 : 0);

  if (input.event === "generation_failed" && genFailures >= FAILURE_PATTERN_MIN) {
    decisions.push({
      kind: "episodic",
      summary: `Design to Code generation failures recurring (${genFailures} in 7 days).`,
      content: [
        `Stack: ${stackLabel}`,
        `Action: ${actionLabel}`,
        input.error ? `Latest error: ${input.error}` : "",
        "Pattern: capture-to-code pipeline failed before a saveable result.",
      ].filter(Boolean).join("\n"),
      tag: "d2c:failure:generation",
      importance: 0.7,
      memoryType: "design_to_code_pattern",
    });
  }

  const fidelityWarnings = recent.filter(
    (p) => p.status === "warning" && p.stack === input.stack,
  );
  if (fidelityWarnings.length >= FIDELITY_PATTERN_MIN) {
    decisions.push({
      kind: "episodic",
      summary: `Design to Code often needs fidelity review on ${stackLabel}.`,
      content: `User's ${stackLabel} Design to Code runs frequently produce verifier warnings (${fidelityWarnings.length} recent). They may care about pixel-perfect match.`,
      tag: `d2c:fidelity:${input.stack}`,
      importance: 0.62,
      memoryType: "design_to_code_pattern",
    });
  }

  const refinedProjects = recent.filter((p) => (p.revisionCount ?? 0) > 0);
  if (refinedProjects.length >= REFINEMENT_WORKFLOW_MIN) {
    decisions.push({
      kind: "episodic",
      summary: "User iterates on Design to Code output via refinements.",
      content: "Recurring workflow: capture → generate → refine → re-save. Prefer continuity over new projects when refining.",
      tag: "d2c:workflow:refine",
      importance: 0.58,
      memoryType: "design_to_code_pattern",
    });
  }

  const successes = recent.filter((p) => p.status === "ready" || p.status === "warning");
  const preferredStack = dominantStack(successes);
  if (preferredStack && input.event === "save_succeeded") {
    decisions.push({
      kind: "preference",
      key: "user.design_to_code_preferred_stack",
      value: DESIGN_STACK_LABELS[preferredStack],
      confidence: 0.86,
    });
  }

  const preferredAction = dominantAction(successes);
  if (preferredAction && input.event === "save_succeeded") {
    decisions.push({
      kind: "preference",
      key: "user.design_to_code_preferred_action",
      value: DESIGN_TO_CODE_ACTION_LABELS[preferredAction],
      confidence: 0.82,
    });
  }

  return decisions;
}

/** Stable short tag suffix for explicit remember dedupe. */
function hashTag(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (h * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36).slice(0, 10);
}
