/**
 * Optional semantic session-type refinement (direct AI, not Council).
 *
 * Deterministic detection runs every tick; semantic classification runs only
 * when the user requests refine, or once before debrief when confidence is low.
 */

import type { GlassCopilotMode } from "./copilotTypes.ts";
import {
  SESSION_TYPE_LABELS,
  type GlassCopilotSessionType,
  type GlassCopilotSessionTypeSetting,
  type SessionTypeDetectionResult,
  type SessionTypeSignals,
} from "./copilotSessionType.ts";

/** Below this, deterministic detection may offer semantic refine. */
export const SEMANTIC_CONFIDENCE_THRESHOLD = 0.55;

const VALID_TYPES = new Set<GlassCopilotSessionType>([
  "video_learning",
  "meeting_call",
  "research",
  "coding_building",
  "business_strategy",
  "sales_review",
  "studying",
  "general_workflow",
]);

export interface SemanticSessionClassification {
  primaryType: GlassCopilotSessionType;
  secondaryType?: GlassCopilotSessionType;
  confidence: number;
  reason: string;
  suggestedReportTemplate: string;
  source: "semantic" | "deterministic";
}

export function hasEnoughSessionContext(signals: SessionTypeSignals): boolean {
  const transcriptLen = (signals.transcript ?? "").trim().length;
  const commandCount = signals.recentCommands?.length ?? 0;
  const titleLen = (signals.windowTitle ?? "").trim().length;
  return transcriptLen >= 40 || commandCount >= 2 || titleLen >= 8;
}

export function shouldOfferSemanticRefine(input: {
  setting: GlassCopilotSessionTypeSetting;
  detection: SessionTypeDetectionResult;
  mode: GlassCopilotMode;
  alreadyRefined: boolean;
  signals: SessionTypeSignals;
}): boolean {
  if (input.setting !== "auto" || input.alreadyRefined) return false;
  if (!hasEnoughSessionContext(input.signals)) return false;
  const lowConfidence = input.detection.confidence < SEMANTIC_CONFIDENCE_THRESHOLD;
  const mixed = input.detection.mixed;
  const coachingOrDiagnostic = input.mode === "coaching" || input.mode === "diagnostic";
  return lowConfidence || mixed || (coachingOrDiagnostic && input.detection.primaryType === "general_workflow");
}

export function canSemanticRefineOnDebrief(input: {
  setting: GlassCopilotSessionTypeSetting;
  detection: SessionTypeDetectionResult;
  alreadyRefined: boolean;
  signals: SessionTypeSignals;
}): boolean {
  if (input.setting !== "auto" || input.alreadyRefined) return false;
  if (!hasEnoughSessionContext(input.signals)) return false;
  return input.detection.confidence < SEMANTIC_CONFIDENCE_THRESHOLD || input.detection.mixed;
}

export function formatSessionTypeRefineLabel(detection: SessionTypeDetectionResult): string {
  if (detection.mixed && detection.secondaryType) {
    return `Auto-detected as ${SESSION_TYPE_LABELS[detection.primaryType]} + ${SESSION_TYPE_LABELS[detection.secondaryType]}. Refine?`;
  }
  return `Auto-detected as ${SESSION_TYPE_LABELS[detection.primaryType]}. Refine?`;
}

export function suggestedReportTemplate(
  primary: GlassCopilotSessionType,
  secondary?: GlassCopilotSessionType,
): string {
  if (secondary) {
    return `mixed:${primary}+${secondary}`;
  }
  return primary;
}

export function buildSemanticSessionTypePrompt(
  signals: SessionTypeSignals,
  detection: SessionTypeDetectionResult,
): string {
  return [
    "Classify this IIVO Glass work session. Use direct reasoning only — do NOT invoke Council.",
    "Reply with a single JSON object (no markdown fence) containing:",
    '{ "primaryType": "<type>", "secondaryType": "<type or null>", "confidence": 0.0-1.0, "reason": "...", "suggestedReportTemplate": "..." }',
    "",
    "Allowed primaryType / secondaryType values:",
    "video_learning, meeting_call, research, coding_building, business_strategy, sales_review, studying, general_workflow",
    "",
    `Deterministic guess: ${detection.primaryType}${detection.secondaryType ? ` + ${detection.secondaryType}` : ""} (confidence ${detection.confidence.toFixed(2)}, mixed=${detection.mixed})`,
    "",
    `App: ${signals.appName ?? "(unknown)"}`,
    `Window: ${signals.windowTitle ?? "(unknown)"}`,
    `Transcript excerpt: ${(signals.transcript ?? "").slice(-600) || "(none)"}`,
    `Recent commands: ${(signals.recentCommands ?? []).slice(-5).join(" | ") || "(none)"}`,
  ].join("\n");
}

function parseType(value: unknown): GlassCopilotSessionType | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_") as GlassCopilotSessionType;
  return VALID_TYPES.has(normalized) ? normalized : undefined;
}

/** Parse direct-AI JSON classification; null when unparseable. */
export function parseSemanticSessionTypeResponse(text: string): SemanticSessionClassification | null {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const raw = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const primaryType = parseType(raw.primaryType);
    if (!primaryType) return null;
    const secondaryRaw = raw.secondaryType;
    const secondaryType =
      secondaryRaw == null || secondaryRaw === "null" ? undefined : parseType(secondaryRaw);
    const confidence =
      typeof raw.confidence === "number"
        ? Math.min(1, Math.max(0, raw.confidence))
        : 0.7;
    const reason = typeof raw.reason === "string" ? raw.reason.trim() : "Semantic classification.";
    const reportTemplate =
      typeof raw.suggestedReportTemplate === "string" && raw.suggestedReportTemplate.trim()
        ? raw.suggestedReportTemplate.trim()
        : suggestedReportTemplate(primaryType, secondaryType);
    return {
      primaryType,
      secondaryType,
      confidence,
      reason,
      suggestedReportTemplate: reportTemplate,
      source: "semantic",
    };
  } catch {
    return null;
  }
}

/** Apply semantic result onto a detection snapshot for debrief steering. */
export function mergeSemanticIntoDetection(
  detection: SessionTypeDetectionResult,
  semantic: SemanticSessionClassification,
): SessionTypeDetectionResult {
  return {
    ...detection,
    type: semantic.primaryType,
    primaryType: semantic.primaryType,
    secondaryType: semantic.secondaryType,
    mixed: !!semantic.secondaryType,
    confidence: semantic.confidence,
    competingTypes: [
      { type: semantic.primaryType, score: semantic.confidence * 10 },
      ...(semantic.secondaryType
        ? [{ type: semantic.secondaryType, score: semantic.confidence * 8 }]
        : []),
    ],
  };
}
