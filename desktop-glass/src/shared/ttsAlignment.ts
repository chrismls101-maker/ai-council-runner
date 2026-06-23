/**
 * ElevenLabs character alignment → speech segment timings (Phase 3).
 */

import type { GuidanceSpeechSegment } from "./companionGuidance.ts";

export interface CharacterAlignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

export interface SegmentTiming {
  segmentIndex: number;
  startSeconds: number;
  endSeconds: number;
}

export interface TimedTtsPayload {
  id: string;
  data: string;
  alignment?: CharacterAlignment;
  segmentTimings?: SegmentTiming[];
}

/** Build word-level start/end from character alignment. */
export function wordTimingsFromAlignment(
  alignment: CharacterAlignment,
): Array<{ word: string; start: number; end: number }> {
  const chars = alignment.characters;
  const starts = alignment.character_start_times_seconds;
  const ends = alignment.character_end_times_seconds;
  if (!chars.length) return [];

  const words: Array<{ word: string; start: number; end: number }> = [];
  let word = "";
  let wordStart = starts[0] ?? 0;
  let wordEnd = ends[0] ?? 0;

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i] ?? "";
    const start = starts[i] ?? wordEnd;
    const end = ends[i] ?? start;
    if (/\s/.test(ch) || i === chars.length - 1) {
      const tail = /\s/.test(ch) ? "" : ch;
      const finalWord = (word + tail).trim();
      if (finalWord) {
        words.push({ word: finalWord, start: wordStart, end });
      }
      word = "";
      wordStart = end;
    } else {
      if (!word) wordStart = start;
      word += ch;
      wordEnd = end;
    }
  }
  return words;
}

/**
 * Map guidance speech segments to audio clock using character alignment on the
 * concatenated speech string (segments joined with a single space).
 */
export function buildSegmentTimings(
  segments: GuidanceSpeechSegment[],
  alignment: CharacterAlignment,
): SegmentTiming[] {
  if (!segments.length) return [];
  const ordered = segments.slice().sort((a, b) => a.segmentIndex - b.segmentIndex);
  const fullText = ordered.map((s) => s.text).join(" ");
  const chars = alignment.characters.join("");
  if (!fullText.trim() || !chars.trim()) {
    return ordered.map((s, i) => ({
      segmentIndex: s.segmentIndex,
      startSeconds: i * 0.01,
      endSeconds: (i + 1) * 0.01,
    }));
  }

  let searchFrom = 0;
  const timings: SegmentTiming[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const seg = ordered[i]!;
    const needle = seg.text.trim();
    let charStart = fullText.indexOf(needle, searchFrom);
    if (charStart < 0) charStart = fullText.indexOf(needle);
    if (charStart < 0) {
      const prev = timings[timings.length - 1];
      timings.push({
        segmentIndex: seg.segmentIndex,
        startSeconds: prev?.endSeconds ?? 0,
        endSeconds: (prev?.endSeconds ?? 0) + 0.5,
      });
      continue;
    }
    const charEnd = charStart + needle.length - 1;
    searchFrom = charEnd + 1;
    const startSeconds = alignment.character_start_times_seconds[charStart] ?? 0;
    const endSeconds =
      alignment.character_end_times_seconds[charEnd] ??
      alignment.character_end_times_seconds[alignment.character_end_times_seconds.length - 1] ??
      startSeconds;
    timings.push({ segmentIndex: seg.segmentIndex, startSeconds, endSeconds });
  }
  return timings;
}

/** Active segment index for playback clock, or -1 before first segment. */
export function activeSegmentIndexAtTime(
  timings: SegmentTiming[],
  currentSeconds: number,
): number {
  if (!timings.length) return 0;
  for (let i = timings.length - 1; i >= 0; i--) {
    if (currentSeconds >= timings[i]!.startSeconds - 0.05) {
      return timings[i]!.segmentIndex;
    }
  }
  return timings[0]!.segmentIndex;
}
