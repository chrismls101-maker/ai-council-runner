/**
 * Glass Companion — UI map, Guidance Plan, and presence resolution (pure, no Electron).
 *
 * SYNC: src/server/glass/glassCompanionGuidance.ts (prompt + server parse entry)
 */

/** 0–1 rectangle relative to capture width/height. */
export interface NormalizedRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type UiMarkSource = "som" | "ax" | "dom" | "vision";

export interface UiMark {
  id: string;
  bounds: NormalizedRect;
  label?: string;
  source: UiMarkSource;
}

export interface UiMap {
  captureId: string;
  width: number;
  height: number;
  marks: UiMark[];
}

export type ManifestationType =
  | "spotlight"
  | "glow"
  | "callout"
  | "arrow"
  | "trace"
  | "cursor"
  | "magnifier"
  | "sketch"
  | "path";

export interface GuidanceSpeechSegment {
  segmentIndex: number;
  text: string;
}

export interface GuidanceManifestation {
  type: ManifestationType;
  /** Optional for sketch-only manifestations. */
  targetMarkId?: string;
  enterAtSegment: number;
  exitAtSegment?: number;
  label?: string;
  /** sketch — SVG path d strings in normalized 0–1 viewport space. */
  sketchPaths?: string[];
  /** path — animated eye-movement between two marks. */
  pathFromMarkId?: string;
  pathToMarkId?: string;
}

export type GuidanceStepWaitFor = "speech_end" | "user_ack";
export type GuidanceStepTransition = "crossfade" | "clear" | "hold";

export interface GuidanceStep {
  stepIndex: number;
  speech: GuidanceSpeechSegment[];
  manifestations: GuidanceManifestation[];
  waitFor?: GuidanceStepWaitFor;
  transition?: GuidanceStepTransition;
}

export interface GuidancePlan {
  captureId: string;
  /** Phase 4b — multi-beat teaching script (overrides flat speech when present). */
  steps?: GuidanceStep[];
  speech: GuidanceSpeechSegment[];
  manifestations: GuidanceManifestation[];
  panel?: string;
}

export interface CompanionGuidancePayload {
  uiMap: UiMap;
  guidancePlan: GuidancePlan;
  /** Phase 4c — JPEG data URLs keyed by mark id for magnifier lens. */
  captureCrops?: Record<string, string>;
}

/** Pixel rect in overlay viewport space (top-left origin). */
export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const COMPANION_FENCE = /```companion\s*([\s\S]*?)```/i;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function normalizeRect(raw: unknown): NormalizedRect | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const x = clamp01(Number(r.x));
  const y = clamp01(Number(r.y));
  const w = clamp01(Number(r.w ?? r.width));
  const h = clamp01(Number(r.h ?? r.height));
  if (w <= 0 || h <= 0) return null;
  return { x, y, w: Math.min(w, 1 - x), h: Math.min(h, 1 - y) };
}

function parseUiMark(raw: unknown, index: number): UiMark | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  const id = typeof m.id === "string" && m.id.trim() ? m.id.trim() : `m${index + 1}`;
  const bounds = normalizeRect(m.bounds);
  if (!bounds) return null;
  const source =
    m.source === "ax" || m.source === "dom" || m.source === "vision" || m.source === "som"
      ? m.source
      : "vision";
  const label = typeof m.label === "string" ? m.label.trim() : undefined;
  return { id, bounds, label, source };
}

export function parseUiMap(raw: unknown, fallbackCaptureId: string): UiMap | null {
  if (!raw || typeof raw !== "object") return null;
  const map = raw as Record<string, unknown>;
  const captureId =
    typeof map.captureId === "string" && map.captureId.trim()
      ? map.captureId.trim()
      : fallbackCaptureId;
  const width = Math.max(1, Math.round(Number(map.width) || 1));
  const height = Math.max(1, Math.round(Number(map.height) || 1));
  const marksRaw = Array.isArray(map.marks) ? map.marks : [];
  const marks = marksRaw
    .map((m, i) => parseUiMark(m, i))
    .filter((m): m is UiMark => m != null);
  if (marks.length === 0) return null;
  return { captureId, width, height, marks };
}

function parseSpeechSegment(raw: unknown, index: number): GuidanceSpeechSegment | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  const text = typeof s.text === "string" ? s.text.trim() : "";
  if (!text) return null;
  const segmentIndex =
    typeof s.segmentIndex === "number" && Number.isFinite(s.segmentIndex)
      ? Math.max(0, Math.floor(s.segmentIndex))
      : index;
  return { segmentIndex, text };
}

function parseManifestation(raw: unknown): GuidanceManifestation | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  const type = m.type;
  const validTypes: ManifestationType[] = [
    "spotlight",
    "glow",
    "callout",
    "arrow",
    "trace",
    "cursor",
    "magnifier",
    "sketch",
    "path",
  ];
  if (typeof type !== "string" || !validTypes.includes(type as ManifestationType)) return null;
  const targetMarkId = typeof m.targetMarkId === "string" ? m.targetMarkId.trim() : undefined;
  const pathFromMarkId = typeof m.pathFromMarkId === "string" ? m.pathFromMarkId.trim() : undefined;
  const pathToMarkId = typeof m.pathToMarkId === "string" ? m.pathToMarkId.trim() : undefined;
  const sketchPathsRaw = Array.isArray(m.sketchPaths) ? m.sketchPaths : [];
  const sketchPaths = sketchPathsRaw
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    .map((p) => p.trim());
  if (type === "sketch" && sketchPaths.length === 0) return null;
  if (type === "path" && (!pathFromMarkId || !pathToMarkId)) return null;
  if (type !== "sketch" && type !== "path" && !targetMarkId) return null;
  const enterAtSegment =
    typeof m.enterAtSegment === "number" && Number.isFinite(m.enterAtSegment)
      ? Math.max(0, Math.floor(m.enterAtSegment))
      : 0;
  const exitAtSegment =
    typeof m.exitAtSegment === "number" && Number.isFinite(m.exitAtSegment)
      ? Math.max(enterAtSegment, Math.floor(m.exitAtSegment))
      : undefined;
  const label = typeof m.label === "string" ? m.label.trim() : undefined;
  return {
    type: type as ManifestationType,
    targetMarkId,
    enterAtSegment,
    exitAtSegment,
    label,
    sketchPaths: sketchPaths.length ? sketchPaths : undefined,
    pathFromMarkId,
    pathToMarkId,
  };
}

function parseGuidanceStep(raw: unknown, index: number): GuidanceStep | null {
  if (!raw || typeof raw !== "object") return null;
  const step = raw as Record<string, unknown>;
  const stepIndex =
    typeof step.stepIndex === "number" && Number.isFinite(step.stepIndex)
      ? Math.max(0, Math.floor(step.stepIndex))
      : index;
  const speechRaw = Array.isArray(step.speech) ? step.speech : [];
  const speech = speechRaw
    .map((s, i) => parseSpeechSegment(s, i))
    .filter((s): s is GuidanceSpeechSegment => s != null);
  const manifestationsRaw = Array.isArray(step.manifestations) ? step.manifestations : [];
  const manifestations = manifestationsRaw
    .map(parseManifestation)
    .filter((m): m is GuidanceManifestation => m != null);
  if (speech.length === 0 && manifestations.length === 0) return null;
  const waitFor = step.waitFor === "user_ack" ? "user_ack" : "speech_end";
  const transition =
    step.transition === "crossfade" || step.transition === "clear" || step.transition === "hold"
      ? step.transition
      : "crossfade";
  return { stepIndex, speech, manifestations, waitFor, transition };
}

export function parseGuidancePlan(raw: unknown, fallbackCaptureId: string): GuidancePlan | null {
  if (!raw || typeof raw !== "object") return null;
  const plan = raw as Record<string, unknown>;
  const captureId =
    typeof plan.captureId === "string" && plan.captureId.trim()
      ? plan.captureId.trim()
      : fallbackCaptureId;
  const speechRaw = Array.isArray(plan.speech) ? plan.speech : [];
  const speech = speechRaw
    .map((s, i) => parseSpeechSegment(s, i))
    .filter((s): s is GuidanceSpeechSegment => s != null);
  const manifestationsRaw = Array.isArray(plan.manifestations) ? plan.manifestations : [];
  const manifestations = manifestationsRaw
    .map(parseManifestation)
    .filter((m): m is GuidanceManifestation => m != null);
  const stepsRaw = Array.isArray(plan.steps) ? plan.steps : [];
  const steps = stepsRaw
    .map((s, i) => parseGuidanceStep(s, i))
    .filter((s): s is GuidanceStep => s != null);
  if (speech.length === 0 && manifestations.length === 0 && steps.length === 0) return null;
  const panel = typeof plan.panel === "string" ? plan.panel.trim() : undefined;
  return {
    captureId,
    speech,
    manifestations,
    steps: steps.length ? steps : undefined,
    panel,
  };
}

export function parseCompanionGuidancePayload(
  raw: unknown,
  fallbackCaptureId: string,
): CompanionGuidancePayload | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;
  const uiMap = parseUiMap(body.uiMap, fallbackCaptureId);
  const guidancePlan = parseGuidancePlan(body.guidancePlan, fallbackCaptureId);
  if (!uiMap || !guidancePlan) return null;
  return { uiMap, guidancePlan };
}

/** Extract ```companion JSON``` block from a vision model answer. */
export function extractCompanionFence(rawAnswer: string): CompanionGuidancePayload | null {
  const match = rawAnswer.match(COMPANION_FENCE);
  if (!match?.[1]) return null;
  try {
    const parsed = JSON.parse(match[1].trim()) as unknown;
    return parseCompanionGuidancePayload(parsed, `capture-${Date.now()}`);
  } catch {
    return null;
  }
}

/** Remove companion fence from spoken/display text. */
export function stripCompanionFence(rawAnswer: string): string {
  return rawAnswer.replace(COMPANION_FENCE, "").trim();
}

export function findUiMark(uiMap: UiMap, markId: string): UiMark | undefined {
  const id = markId.trim();
  return uiMap.marks.find((m) => m.id === id);
}

export function resolveMarkToScreenRect(
  mark: UiMark,
  viewport: { width: number; height: number },
): ScreenRect {
  return {
    left: mark.bounds.x * viewport.width,
    top: mark.bounds.y * viewport.height,
    width: mark.bounds.w * viewport.width,
    height: mark.bounds.h * viewport.height,
  };
}

/** Speech text for Companion TTS — prefers guidance plan segments or script steps. */
export function companionSpeechFromGuidance(plan: GuidancePlan | null | undefined): string {
  if (!plan) return "";
  if (plan.steps?.length) {
    return plan.steps
      .slice()
      .sort((a, b) => a.stepIndex - b.stepIndex)
      .map((step) =>
        step.speech
          .slice()
          .sort((a, b) => a.segmentIndex - b.segmentIndex)
          .map((s) => s.text)
          .join(" "),
      )
      .filter(Boolean)
      .join(" ");
  }
  if (!plan.speech?.length) return "";
  return plan.speech
    .slice()
    .sort((a, b) => a.segmentIndex - b.segmentIndex)
    .map((s) => s.text)
    .join(" ");
}

/** Manifestations active for a given speech segment index (Phase 2/3 lifecycle). */
export function manifestationsForSegment(
  plan: GuidancePlan,
  segmentIndex: number,
): GuidanceManifestation[] {
  return plan.manifestations.filter((m) => {
    const exit = m.exitAtSegment ?? Number.POSITIVE_INFINITY;
    return m.enterAtSegment <= segmentIndex && segmentIndex <= exit;
  });
}

/** Phase 2 default: show everything that enters at segment 0 (or first script step). */
export function initialManifestations(plan: GuidancePlan): GuidanceManifestation[] {
  if (plan.steps?.length) {
    const first = plan.steps.slice().sort((a, b) => a.stepIndex - b.stepIndex)[0];
    if (first) {
      const seg = first.speech[0]?.segmentIndex ?? 0;
      return first.manifestations.filter((m) => {
        const exit = m.exitAtSegment ?? Number.POSITIVE_INFINITY;
        return m.enterAtSegment <= seg && seg <= exit;
      });
    }
  }
  return manifestationsForSegment(plan, 0);
}
