/**
 * Audio chunk timing and cost-control helpers (shared, testable).
 */

import {
  DEFAULT_CHUNK_MS,
  DEFAULT_AUTO_STOP_MS,
  LISTENING_COST_WARN_MS,
} from "./sttTypes.ts";

export {
  DEFAULT_CHUNK_MS,
  DEFAULT_AUTO_STOP_MS,
  LISTENING_COST_WARN_MS,
} from "./sttTypes.ts";

export function isChunkDurationValid(ms: number): boolean {
  return ms >= 15_000 && ms <= 30_000;
}

export function shouldWarnListeningCost(elapsedMs: number, warned: boolean): boolean {
  return !warned && elapsedMs >= LISTENING_COST_WARN_MS;
}

export function shouldAutoStopListening(
  elapsedMs: number,
  autoStopEnabled: boolean,
  autoStopMs = DEFAULT_AUTO_STOP_MS,
): boolean {
  return autoStopEnabled && elapsedMs >= autoStopMs;
}

export function formatListeningDuration(elapsedMs: number): string {
  const totalSec = Math.floor(elapsedMs / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
}

export function listeningCostWarningMessage(): string {
  return "You have been listening for 10 minutes. Transcription may incur cost.";
}

export function minChunkBytes(): number {
  return 512;
}
