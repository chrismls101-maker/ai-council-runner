/** Minimum transcript length before running build-topic detection. */
export const EXTRACT_DETECT_MIN_CHARS = 200;

/** Wait for this much new transcript (chars) before re-running detection. */
export const EXTRACT_DETECT_MIN_NEW_CHARS = 120;

/** Debounce detection after transcript stops growing (ms). */
export const EXTRACT_DETECT_DEBOUNCE_MS = 15_000;

export type ExtractBuildCardPhase = "hidden" | "listening" | "detected";

export interface ExtractDetectScheduleInput {
  active: boolean;
  transcriptLength: number;
  lastDetectAt: number;
  lastDetectTranscriptLength: number;
  nowMs: number;
}

/** Parse stage-1 model output into a label or null. */
export function parseExtractDetectLabel(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.toLowerCase() === "null") return null;
  return trimmed.replace(/^["']|["']$/g, "");
}

export function shouldRunExtractDetect(input: ExtractDetectScheduleInput): boolean {
  if (!input.active) return false;
  if (input.transcriptLength < EXTRACT_DETECT_MIN_CHARS) return false;

  const firstCross =
    input.lastDetectTranscriptLength < EXTRACT_DETECT_MIN_CHARS &&
    input.transcriptLength >= EXTRACT_DETECT_MIN_CHARS;
  if (firstCross) return true;

  const newChars = input.transcriptLength - input.lastDetectTranscriptLength;
  if (newChars < EXTRACT_DETECT_MIN_NEW_CHARS) return false;

  return input.nowMs - input.lastDetectAt >= EXTRACT_DETECT_DEBOUNCE_MS;
}

export function extractBuildCardPhase(input: {
  active: boolean;
  detectedLabel: string | null;
}): ExtractBuildCardPhase {
  if (!input.active) return "hidden";
  if (input.detectedLabel?.trim()) return "detected";
  return "listening";
}
