/**
 * IIVO Glass — Meeting Intelligence engine.
 *
 * Orchestrates the classification + extraction pipeline for a live meeting
 * session. Called on a ~15s timer whenever the active copilot mode is
 * "meetings" and a session is live.
 *
 * Design:
 *   1. Classification — fires once at MEETING_CLASSIFY_MIN_CHARS; a single
 *      reclassification attempt is allowed if the first result was low-confidence.
 *   2. Extraction — runs on the transcript *delta* since the last pass, using
 *      the schema for the current classification. Dedupes against existing moments.
 *
 * Pure — no electron / fs / AI calls. Shared across main + renderer + tests.
 * All non-determinism (clock, ID generation) is injectable for testability.
 */

import {
  classifyMeeting,
  applyMeetingTypeOverride,
  shouldReclassify,
} from "./meetingClassifier.ts";

import {
  getMeetingSchema,
  extractMomentsFromChunk,
  type ExtractedMomentRaw,
} from "./meetingExtractionSchemas.ts";

import {
  MEETING_CLASSIFY_MIN_CHARS,
  MEETING_EXTRACTION_INTERVAL_MS,
  MEETING_EXTRACTION_MIN_DELTA_CHARS,
  MEETING_INTELLIGENCE_INITIAL_STATE,
  type MeetingIntelligenceState,
  type MeetingMoment,
  type MeetingMomentType,
  type MeetingSubType,
} from "./meetingIntelligenceTypes.ts";

// ─── Public API ───────────────────────────────────────────────────────────────

export interface MeetingIntelligenceEngineInput {
  /** Full current transcript text. */
  transcript: string;
  /** Current Meeting Intelligence runtime state. */
  state: MeetingIntelligenceState;
  /** Frontmost app name — used as a classification signal. */
  appName?: string;
  /** Active window title — used as a classification signal. */
  windowTitle?: string;
  /** Current time in Unix ms (injectable for tests). */
  nowMs?: number;
  /**
   * ID factory for new MeetingMoment objects.
   * Defaults to a random short ID if not provided.
   */
  idFactory?: () => string;
  /**
   * Pre-extracted moments from the AI pass in the main process.
   * When provided, the engine skips its internal regex extraction and
   * uses these moments instead. Dedup logic still runs normally.
   * When absent or undefined, falls back to `extractMomentsFromChunk`.
   */
  extractionOverride?: ExtractedMomentRaw[];
}

/**
 * Run one pass of the Meeting Intelligence pipeline.
 *
 * Returns a new `MeetingIntelligenceState` with any updates applied.
 * Returns the same object reference (identity) when nothing changed, so
 * callers can use reference equality to skip unnecessary pushes.
 */
export function runMeetingIntelligencePass(
  input: MeetingIntelligenceEngineInput,
): MeetingIntelligenceState {
  const {
    transcript,
    appName,
    windowTitle,
    state,
  } = input;

  const nowMs = input.nowMs ?? Date.now();
  const idFactory = input.idFactory ?? defaultIdFactory;

  let next: MeetingIntelligenceState = state;
  let changed = false;

  // ── Step 1: Classification ──────────────────────────────────────────────────

  if (next.classification === null) {
    // First classification — only attempt if transcript is long enough
    if (transcript.length >= MEETING_CLASSIFY_MIN_CHARS) {
      const classification = classifyMeeting({ transcript, appName, windowTitle });
      if (classification) {
        next = {
          ...next,
          classification,
          transcriptLengthAtClassification: transcript.length,
        };
        changed = true;
      }
    }
  } else if (!next.classification.manualOverride) {
    // Reclassification check — one attempt only, if low confidence
    const shouldRetry = shouldReclassify(
      next.classification,
      next.transcriptLengthAtClassification ?? 0,
      transcript.length,
      next.reclassifyAttempted ?? false,
    );
    if (shouldRetry) {
      const reclassified = classifyMeeting({ transcript, appName, windowTitle });
      if (reclassified) {
        next = {
          ...next,
          classification: reclassified,
          reclassifyAttempted: true,
          transcriptLengthAtClassification: transcript.length,
        };
        changed = true;
      }
    }
  }

  // ── Step 2: Extraction ──────────────────────────────────────────────────────

  // Only extract when we have a classification
  if (next.classification !== null) {
    const lastExtractedLen = next.lastExtractionTranscriptLen ?? 0;
    const lastExtractedAt = next.lastExtractionAt ?? 0;
    const delta = transcript.slice(lastExtractedLen);

    const enoughDelta = delta.length >= MEETING_EXTRACTION_MIN_DELTA_CHARS;
    const enoughTime = (nowMs - lastExtractedAt) >= MEETING_EXTRACTION_INTERVAL_MS;

    if (enoughDelta && enoughTime) {
      const schema = getMeetingSchema(next.classification.subType);

      // Use AI-provided moments when available; fall back to regex otherwise.
      const rawMoments: ExtractedMomentRaw[] =
        input.extractionOverride ?? extractMomentsFromChunk(delta, schema);

      if (rawMoments.length > 0) {
        // Build full MeetingMoment objects with IDs + dedup against existing
        const existingKeys = new Set(
          next.moments.map((m) => momentDedupeKey(m.type, m.content)),
        );

        const newMoments: MeetingMoment[] = [];
        for (const raw of rawMoments) {
          const key = momentDedupeKey(raw.type, raw.content);
          if (!existingKeys.has(key)) {
            existingKeys.add(key);
            newMoments.push({
              id: idFactory(),
              type: raw.type,
              content: raw.content,
              detectedAt: nowMs,
              owner: raw.owner,
              deadline: raw.deadline,
            });
          }
        }

        if (newMoments.length > 0) {
          next = {
            ...next,
            moments: [...next.moments, ...newMoments],
            lastExtractionAt: nowMs,
            lastExtractionTranscriptLen: transcript.length,
          };
          changed = true;
        } else {
          // No new moments but we still advance the extraction cursor
          next = {
            ...next,
            lastExtractionAt: nowMs,
            lastExtractionTranscriptLen: transcript.length,
          };
          changed = true;
        }
      } else {
        // Nothing extracted — advance cursor to avoid re-scanning stale text
        next = {
          ...next,
          lastExtractionAt: nowMs,
          lastExtractionTranscriptLen: transcript.length,
        };
        changed = true;
      }
    }
  }

  return changed ? next : state;
}

/**
 * Returns true when the engine would run an extraction pass — i.e., there is
 * a classification and enough new transcript delta.
 *
 * Used by the main process to decide whether to fire the (async) AI extraction
 * call before invoking `runMeetingIntelligencePass` with an `extractionOverride`.
 */
export function shouldRunExtractionPass(
  state: MeetingIntelligenceState,
  transcriptLen: number,
  nowMs: number,
): boolean {
  if (!state.classification) return false;
  const lastLen = state.lastExtractionTranscriptLen ?? 0;
  const lastAt  = state.lastExtractionAt ?? 0;
  const enoughDelta = transcriptLen - lastLen >= MEETING_EXTRACTION_MIN_DELTA_CHARS;
  const enoughTime  = (nowMs - lastAt) >= MEETING_EXTRACTION_INTERVAL_MS;
  return enoughDelta && enoughTime;
}

/**
 * Apply a user override from the "Change type" control in the panel.
 * Wraps `applyMeetingTypeOverride` and resets extraction so the new schema
 * is applied to the full transcript on the next pass.
 */
export function applyMeetingTypeOverrideInEngine(
  state: MeetingIntelligenceState,
  subType: MeetingSubType,
): MeetingIntelligenceState {
  const overridden = applyMeetingTypeOverride(state.classification, subType);
  return {
    ...state,
    classification: overridden,
    // Clear moments — old moments were classified under the previous schema
    // and may contain wrong types for the new schema. Next extraction pass
    // re-processes the full transcript with the correct schema.
    moments: [],
    // Reset extraction cursor so the new schema re-processes from scratch
    lastExtractionAt: undefined,
    lastExtractionTranscriptLen: 0,
  };
}

/**
 * Return a fresh initial state — call this when a new meeting session starts.
 */
export function resetMeetingIntelligenceState(): MeetingIntelligenceState {
  return { ...MEETING_INTELLIGENCE_INITIAL_STATE };
}

/**
 * Remove a moment by ID. Returns the same object reference if the ID is not
 * found (so the caller can use reference equality to detect no-ops).
 */
export function deleteMeetingMoment(
  state: MeetingIntelligenceState,
  id: string,
): MeetingIntelligenceState {
  const idx = state.moments.findIndex((m) => m.id === id);
  if (idx === -1) return state; // no-op — same reference
  return {
    ...state,
    moments: state.moments.filter((m) => m.id !== id),
  };
}

/**
 * Manually add a moment. The moment is appended at the end of the list with
 * `detectedAt = now` and `manualOverride = true` so the debrief can distinguish
 * user-added moments from engine-extracted ones.
 */
export function addMeetingMoment(
  state: MeetingIntelligenceState,
  momentType: MeetingMomentType,
  content: string,
): MeetingIntelligenceState {
  const trimmed = content.trim();
  if (!trimmed) return state; // ignore empty
  const newMoment: MeetingMoment = {
    id: defaultIdFactory(),
    type: momentType,
    content: trimmed,
    detectedAt: Date.now(),
    manualOverride: true,
  };
  return {
    ...state,
    moments: [...state.moments, newMoment],
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function momentDedupeKey(type: string, content: string): string {
  return `${type}:${content.toLowerCase().slice(0, 80)}`;
}

let _idCounter = 0;

function defaultIdFactory(): string {
  _idCounter = (_idCounter + 1) % 1_000_000;
  return `mm-${Date.now()}-${_idCounter.toString(36)}`;
}
