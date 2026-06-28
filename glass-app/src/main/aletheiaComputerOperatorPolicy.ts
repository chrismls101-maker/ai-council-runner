/**
 * LLM operator policy — one strict JSON action per step (vision + grounded state).
 */

import type { GlassConfig } from "../shared/config.ts";
import type { ComputerOperatorPlan } from "../shared/aletheiaConversationPlanner.ts";
import type { GroundedUiState } from "../shared/aletheiaGroundedUiState.ts";
import type { ComputerOperatorAuditRow, OperatorStepDecision } from "../shared/aletheiaComputerOperatorLoop.ts";
import type { OperatorAction, OperatorActionKind } from "../shared/aletheiaComputerOperatorTypes.ts";
import { ALL_OPERATOR_ACTION_KINDS } from "../shared/aletheiaComputerOperatorTypes.ts";
import { askIivoGlass } from "./glassAskClient.ts";
import { resolveAnthropicApiKey } from "./anthropicKeyStore.ts";

const OPERATOR_ACTION_KINDS = [...ALL_OPERATOR_ACTION_KINDS, "pause"] as const;
const OPERATOR_MODELS = ["claude-opus-4-5", "claude-sonnet-4-5"] as const;
const MIN_CONFIDENCE = 0.4;

export interface OperatorStepHistoryRow {
  step: number;
  actionKind: OperatorActionKind;
  belief?: string;
  intendedEffect?: string;
  narration: string;
  ok: boolean | null;
  verificationSummary?: string;
}

function pauseDecision(reason: string, belief = "Pausing operator."): OperatorStepDecision {
  return {
    currentBelief: belief,
    intendedNextEffect: "Stop and ask for guidance.",
    action: { kind: "pause", reason },
    confidence: 0,
    pauseReason: reason,
  };
}

function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] ?? text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

function formatCandidatesForPrompt(state: GroundedUiState): string {
  if (!state.candidates.length) return "No grounded targets detected.";
  return state.candidates
    .slice(0, 40)
    .map(
      (c) =>
        `- id=${c.id} source=${c.source} role=${c.role ?? "element"} label="${c.label}" confidence=${c.confidence.toFixed(2)} actionability=${c.actionability.toFixed(2)} bounds={x:${c.bounds.x.toFixed(3)},y:${c.bounds.y.toFixed(3)},w:${c.bounds.w.toFixed(3)},h:${c.bounds.h.toFixed(3)}}`,
    )
    .join("\n");
}

function formatStepHistory(history: OperatorStepHistoryRow[]): string {
  if (!history.length) return "No steps taken yet.";
  return history
    .map(
      (row) =>
        `Step ${row.step}: ${row.actionKind} — belief="${row.belief ?? ""}" effect="${row.intendedEffect ?? ""}" ok=${row.ok} verify="${row.verificationSummary ?? row.narration}"`,
    )
    .join("\n");
}

function sanitizeAction(
  raw: Record<string, unknown>,
  state: GroundedUiState,
): OperatorAction | null {
  const kind = String(raw.kind ?? "").trim() as OperatorActionKind;
  if (!OPERATOR_ACTION_KINDS.includes(kind)) return null;

  const action: OperatorAction = { kind };

  if (kind === "focus_app" || kind === "open_url") {
    const app = typeof raw.app === "string" ? raw.app.trim() : undefined;
    if (app) action.app = app;
  }
  if (kind === "click_target") {
    const targetId = typeof raw.targetId === "string" ? raw.targetId.trim() : undefined;
    if (!targetId || !state.candidates.some((c) => c.id === targetId)) return null;
    action.targetId = targetId;
  }
  if (kind === "type_text" && typeof raw.text === "string") action.text = raw.text;
  if (kind === "press_keys" && typeof raw.keys === "string") action.keys = raw.keys.trim();
  if (kind === "open_url" && typeof raw.url === "string") action.url = raw.url.trim();
  if (kind === "wait_for" && typeof raw.waitMs === "number") action.waitMs = raw.waitMs;
  if (kind === "pause" || kind === "done") {
    action.reason = typeof raw.reason === "string" ? raw.reason : undefined;
  }

  if (kind === "press_keys" && !action.keys?.trim()) return null;
  if (kind === "open_url" && !action.url?.trim()) return null;
  if (kind === "focus_app" && !action.app?.trim()) return null;
  if (kind === "click_target" && !action.targetId) return null;
  if (kind === "type_text" && !action.text?.trim()) return null;

  return action;
}

function parseModelDecision(
  answer: string,
  state: GroundedUiState,
): OperatorStepDecision | null {
  const parsed = extractJsonObject(answer);
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const actionRaw = obj.action;
  if (!actionRaw || typeof actionRaw !== "object") return null;
  const action = sanitizeAction(actionRaw as Record<string, unknown>, state);
  if (!action) return null;

  const confidence =
    typeof obj.confidence === "number" && Number.isFinite(obj.confidence)
      ? Math.min(1, Math.max(0, obj.confidence))
      : null;
  if (confidence == null) return null;

  return {
    currentBelief: String(obj.currentBelief ?? "").trim() || "Model selected next step.",
    intendedNextEffect: String(obj.intendedNextEffect ?? "").trim() || "Advance the task.",
    action,
    confidence,
    pauseReason:
      action.kind === "pause"
        ? String(obj.pauseReason ?? action.reason ?? "Paused.")
        : typeof obj.pauseReason === "string"
          ? obj.pauseReason
          : undefined,
  };
}

function buildOperatorPrompt(input: {
  plan: ComputerOperatorPlan;
  state: GroundedUiState;
  step: number;
  clickedTargetIds: string[];
  failedTargetIds: string[];
  readSummary?: string;
  lastError?: string;
  stepHistory: OperatorStepHistoryRow[];
}): string {
  const stepsRemaining = input.plan.stepBudget - input.step;
  return [
    "You are Aletheia computer operator on macOS.",
    "Return ONLY one JSON object. No markdown outside JSON.",
    "",
    `Goal: ${input.plan.goal}`,
    `Scope: ${input.plan.scope}`,
    `Allowed action kinds: ${input.plan.allowedActions.join(", ")}, done, pause`,
    `Success criteria: ${input.plan.successCriteria.join("; ")}`,
    `Step ${input.step + 1} of ${input.plan.stepBudget} (${stepsRemaining} remaining)`,
    `Front app: ${input.state.activeApp ?? "unknown"}`,
    `Window title: ${input.state.windowTitle ?? "unknown"}`,
    input.readSummary ? `Prior read summary: ${input.readSummary.slice(0, 500)}` : "",
    input.lastError ? `Last step error: ${input.lastError}` : "",
    input.clickedTargetIds.length ? `Already clicked: ${input.clickedTargetIds.join(", ")}` : "",
    input.failedTargetIds.length ? `Failed targets (do not retry): ${input.failedTargetIds.join(", ")}` : "",
    "",
    "Step history:",
    formatStepHistory(input.stepHistory),
    "",
    "Grounded UI candidates:",
    formatCandidatesForPrompt(input.state),
    "",
    "Schema:",
    `{ "currentBelief": string, "intendedNextEffect": string, "confidence": number, "action": { "kind": "focus_app|click_target|type_text|press_keys|scroll|read_region|wait_for|open_url|done|pause", "targetId"?: string, "app"?: string, "text"?: string, "keys"?: string, "url"?: string, "waitMs"?: number, "reason"?: string }, "pauseReason"?: string }`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function auditRowsToStepHistory(audit: ComputerOperatorAuditRow[]): OperatorStepHistoryRow[] {
  return audit.map((row) => ({
    step: row.step,
    actionKind: row.action.kind,
    belief: row.belief,
    intendedEffect: row.intendedEffect,
    narration: row.narration,
    ok: row.ok,
    verificationSummary: row.verificationSummary,
  }));
}

/** Choose exactly one next operator action using vision + grounded state. */
export async function resolveOperatorStepDecision(
  config: GlassConfig,
  input: {
    plan: ComputerOperatorPlan;
    state: GroundedUiState;
    screenshotDataUrl?: string;
    step: number;
    clickedTargetIds: string[];
    failedTargetIds: string[];
    readSummary?: string;
    lastError?: string;
    stepHistory: OperatorStepHistoryRow[];
  },
  signal?: AbortSignal,
): Promise<OperatorStepDecision> {
  if (!resolveAnthropicApiKey()) {
    return pauseDecision("Anthropic API key required for computer operator.");
  }
  if (signal?.aborted) {
    return pauseDecision("Computer operator cancelled.");
  }

  const prompt = buildOperatorPrompt(input);
  const screenshot = input.screenshotDataUrl?.trim();
  let lastLowConfidence: OperatorStepDecision | null = null;

  for (const model of OPERATOR_MODELS) {
    try {
      const response = await askIivoGlass(
        config,
        {
          prompt,
          visualIntent: true,
          responseStyle: "full",
          modelPurpose: "semantic",
          anthropicModel: model,
          modelCallSource: "other",
          latestScreenshot: screenshot
            ? {
                imageDataUrl: screenshot,
                label: "Computer operator step",
                capturedAt: new Date().toISOString(),
              }
            : undefined,
        },
        signal,
      );

      const parsed = parseModelDecision(response.answer?.trim() ?? "", input.state);
      if (!parsed) {
        continue;
      }
      if (parsed.confidence < MIN_CONFIDENCE) {
        lastLowConfidence = parsed;
        continue;
      }
      if (parsed.action.kind === "pause") {
        return {
          ...parsed,
          pauseReason: parsed.pauseReason ?? parsed.action.reason ?? "Paused by operator model.",
        };
      }
      return parsed;
    } catch (err) {
      if (signal?.aborted) {
        return pauseDecision("Computer operator cancelled.");
      }
      const message = err instanceof Error ? err.message : String(err);
      if (model === OPERATOR_MODELS[OPERATOR_MODELS.length - 1]) {
        return pauseDecision(`Model error: ${message}`);
      }
    }
  }

  if (lastLowConfidence) {
    return pauseDecision(
      `Low confidence (${lastLowConfidence.confidence.toFixed(2)}). ${lastLowConfidence.currentBelief}`,
      lastLowConfidence.currentBelief,
    );
  }

  return pauseDecision("invalid model output");
}
