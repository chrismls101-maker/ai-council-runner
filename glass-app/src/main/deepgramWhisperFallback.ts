/**
 * When Deepgram streaming fails mid-session, fall back to OpenAI/server Whisper chunks
 * so the user never sits in silence.
 */

import type { GlassSttState } from "../shared/sttTypes.ts";
import {
  planDeepgramWhisperFallback,
  type DeepgramWhisperFallbackScope,
} from "../shared/deepgramWhisperFallbackPlan.ts";
import { broadcastTranscriptionControl } from "./glassOperations.ts";

export type { DeepgramWhisperFallbackScope } from "../shared/deepgramWhisperFallbackPlan.ts";

export interface DeepgramWhisperFallbackDeps {
  getStt: () => GlassSttState;
  setStt: (next: GlassSttState) => void;
  push: () => void;
  stopTranslateDeepgram: () => void;
  stopCompanionDeepgram: () => void;
}

let translateWhisperFallbackActive = false;

export function isTranslateWhisperFallbackActive(): boolean {
  return translateWhisperFallbackActive;
}

export function resetTranslateWhisperFallback(): void {
  translateWhisperFallbackActive = false;
}

export function activateDeepgramWhisperFallback(
  scope: DeepgramWhisperFallbackScope,
  reason: string,
  deps: DeepgramWhisperFallbackDeps,
): void {
  const plan = planDeepgramWhisperFallback(scope, deps.getStt(), translateWhisperFallbackActive);
  if (!plan) return;

  if (plan.stopTranslateDeepgram) deps.stopTranslateDeepgram();
  if (plan.stopCompanionDeepgram) deps.stopCompanionDeepgram();
  if (plan.nextStt !== deps.getStt()) deps.setStt(plan.nextStt);
  if (plan.activateTranslateFallback) translateWhisperFallbackActive = true;

  console.warn(`[deepgram:${scope}] ${reason} — falling back to Whisper chunks`);
  broadcastTranscriptionControl({ type: "deepgram-whisper-fallback", scope });
  deps.push();
}
