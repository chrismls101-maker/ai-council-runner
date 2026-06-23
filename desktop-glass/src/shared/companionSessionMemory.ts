/**
 * Glass Companion — session memory for multi-turn guidance (Phase 4a).
 *
 * Pure helpers — no Electron / DOM.
 */

import type {
  CompanionGuidancePayload,
  GuidancePlan,
  UiMap,
} from "./companionGuidance.ts";
import type { GlassAskLatestScreenshot } from "./glassAskTypes.ts";

/** Invalidate memory when capture is older than this (ms). */
export const COMPANION_MEMORY_TTL_MS = 30_000;

/** Reuse last screenshot without fresh capture when younger than this (ms). */
export const COMPANION_CAPTURE_REUSE_MAX_AGE_MS = 15_000;

export interface CompanionSessionMemory {
  lastPrompt: string;
  lastUiMap: UiMap;
  lastGuidancePlan: GuidancePlan;
  lastCaptureId: string;
  /** Unix ms when the capture was taken. */
  lastCaptureAt: number;
  activeMarkIds: string[];
  frontApp?: string;
  windowTitle?: string;
  /** Last screenshot payload sent to the server (for fast retarget). */
  lastScreenshot?: GlassAskLatestScreenshot;
  /** Inline image when screenshot object lacks imageDataUrl. */
  lastCaptureImageDataUrl?: string;
}

/** Serializable memory sent on ask requests (no inline image blobs). */
export type CompanionMemoryPayload = Omit<
  CompanionSessionMemory,
  "lastScreenshot" | "lastCaptureImageDataUrl"
>;

export interface CompanionMemoryContext {
  nowMs?: number;
  frontApp?: string;
  windowTitle?: string;
}

export function activeMarkIdsFromPlan(plan: GuidancePlan | null | undefined): string[] {
  if (!plan?.manifestations?.length) return [];
  const ids = new Set<string>();
  for (const m of plan.manifestations) {
    if (m.targetMarkId) ids.add(m.targetMarkId);
  }
  return [...ids];
}

export function isCompanionMemoryValid(
  memory: CompanionSessionMemory | null | undefined,
  ctx: CompanionMemoryContext = {},
): boolean {
  if (!memory?.lastUiMap || !memory.lastGuidancePlan) return false;
  const now = ctx.nowMs ?? Date.now();
  if (now - memory.lastCaptureAt > COMPANION_MEMORY_TTL_MS) return false;
  if (
    ctx.frontApp &&
    memory.frontApp &&
    ctx.frontApp.toLowerCase() !== memory.frontApp.toLowerCase()
  ) {
    return false;
  }
  if (
    ctx.windowTitle &&
    memory.windowTitle &&
    ctx.windowTitle !== memory.windowTitle
  ) {
    return false;
  }
  return true;
}

export function canReuseCompanionCapture(
  memory: CompanionSessionMemory | null | undefined,
  ctx: CompanionMemoryContext = {},
): boolean {
  if (!isCompanionMemoryValid(memory, ctx)) return false;
  const now = ctx.nowMs ?? Date.now();
  if (now - memory!.lastCaptureAt > COMPANION_CAPTURE_REUSE_MAX_AGE_MS) return false;
  return Boolean(memory!.lastScreenshot?.imageDataUrl || memory!.lastCaptureImageDataUrl);
}

export function buildCompanionSessionMemory(input: {
  prompt: string;
  presence: CompanionGuidancePayload;
  frontApp?: string;
  windowTitle?: string;
  screenshot?: GlassAskLatestScreenshot;
  imageDataUrl?: string;
  nowMs?: number;
}): CompanionSessionMemory {
  const { presence } = input;
  return {
    lastPrompt: input.prompt,
    lastUiMap: presence.uiMap,
    lastGuidancePlan: presence.guidancePlan,
    lastCaptureId: presence.uiMap.captureId,
    lastCaptureAt: input.nowMs ?? Date.now(),
    activeMarkIds: activeMarkIdsFromPlan(presence.guidancePlan),
    frontApp: input.frontApp,
    windowTitle: input.windowTitle,
    lastScreenshot: input.screenshot,
    lastCaptureImageDataUrl: input.imageDataUrl,
  };
}

export function companionMemoryForAsk(
  memory: CompanionSessionMemory,
): CompanionMemoryPayload {
  const { lastScreenshot: _s, lastCaptureImageDataUrl: _u, ...payload } = memory;
  return payload;
}

export function screenshotFromCompanionMemory(
  memory: CompanionSessionMemory,
): GlassAskLatestScreenshot | undefined {
  if (memory.lastScreenshot?.imageDataUrl) return memory.lastScreenshot;
  if (memory.lastCaptureImageDataUrl) {
    return {
      ...memory.lastScreenshot,
      imageDataUrl: memory.lastCaptureImageDataUrl,
      eventId: memory.lastScreenshot?.eventId ?? memory.lastCaptureId,
      capturedAt: memory.lastScreenshot?.capturedAt ?? new Date(memory.lastCaptureAt).toISOString(),
    };
  }
  return memory.lastScreenshot;
}
