/**
 * Glass Companion — main-process session memory store (Phase 4a).
 */

import type { CompanionGuidancePayload } from "../shared/companionGuidance.ts";
import type { GlassAskLatestScreenshot } from "../shared/glassAskTypes.ts";
import {
  buildCompanionSessionMemory,
  type CompanionSessionMemory,
} from "../shared/companionSessionMemory.ts";

export function updateCompanionSessionMemory(
  current: CompanionSessionMemory | null,
  input: {
    prompt: string;
    presence: CompanionGuidancePayload | null;
    frontApp?: string;
    windowTitle?: string;
    screenshot?: GlassAskLatestScreenshot;
    imageDataUrl?: string;
  },
): CompanionSessionMemory | null {
  if (!input.presence) return current;
  return buildCompanionSessionMemory({
    prompt: input.prompt,
    presence: input.presence,
    frontApp: input.frontApp,
    windowTitle: input.windowTitle,
    screenshot: input.screenshot,
    imageDataUrl: input.imageDataUrl,
  });
}

export function clearCompanionSessionMemory(): null {
  return null;
}
