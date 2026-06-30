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
  stopListenDeepgram: () => void;
}

let translateWhisperFallbackActive = false;
let listenWhisperFallbackActive = false;
let meetingsWhisperFallbackActive = false;
let watchWhisperFallbackActive = false;

export function isTranslateWhisperFallbackActive(): boolean {
  return translateWhisperFallbackActive;
}

export function isListenWhisperFallbackActive(): boolean {
  return listenWhisperFallbackActive;
}

export function isMeetingsWhisperFallbackActive(): boolean {
  return meetingsWhisperFallbackActive;
}

export function resetTranslateWhisperFallback(): void {
  translateWhisperFallbackActive = false;
}

export function resetListenWhisperFallback(): void {
  listenWhisperFallbackActive = false;
}

export function resetMeetingsWhisperFallback(): void {
  meetingsWhisperFallbackActive = false;
}

export function resetWatchWhisperFallback(): void {
  watchWhisperFallbackActive = false;
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
  if (plan.stopListenDeepgram) deps.stopListenDeepgram();
  if (plan.nextStt !== deps.getStt()) deps.setStt(plan.nextStt);
  if (plan.activateTranslateFallback) translateWhisperFallbackActive = true;
  if (plan.activateListenFallback) listenWhisperFallbackActive = true;
  if (plan.activateMeetingsFallback) meetingsWhisperFallbackActive = true;
  if (plan.activateWatchFallback) watchWhisperFallbackActive = true;

  console.warn(`[deepgram:${scope}] ${reason} — falling back to Whisper chunks`);
  broadcastTranscriptionControl({ type: "deepgram-whisper-fallback", scope });
  deps.push();
}
