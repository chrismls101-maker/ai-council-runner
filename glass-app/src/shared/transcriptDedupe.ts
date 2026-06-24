/**
 * Transcript chunk deduplication for Listen mode and STT pipeline.
 *
 * Pure — no electron / fs.
 */

import { isDuplicateText } from "./sessionIntelligence.ts";

export type TranscriptChunkSource = "system_audio" | "microphone" | "session" | "unknown";

export interface TranscriptChunkLike {
  text?: string;
  title?: string;
  tags?: string[];
  timestamp?: string;
  id?: string;
}

export function normalizeTranscriptText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function transcriptSourceFromTags(tags?: string[]): TranscriptChunkSource {
  if (tags?.includes("system_audio")) return "system_audio";
  if (tags?.includes("microphone")) return "microphone";
  return "unknown";
}

/** Stable dedupe key: source + normalized text + 30s time bucket. */
export function transcriptChunkKey(
  text: string,
  source: TranscriptChunkSource,
  timestampMs = Date.now(),
): string {
  const norm = normalizeTranscriptText(text).toLowerCase();
  const bucket = Math.floor(timestampMs / 30_000);
  return `${source}:${norm}:${bucket}`;
}

export function chunkText(chunk: TranscriptChunkLike): string {
  return normalizeTranscriptText(chunk.text ?? chunk.title ?? "");
}

/** True if this text duplicates a recent chunk from the same source. */
export function isDuplicateTranscriptChunk(
  text: string,
  source: TranscriptChunkSource,
  recent: TranscriptChunkLike[],
): boolean {
  const norm = normalizeTranscriptText(text);
  if (!norm) return true;
  for (const chunk of recent) {
    const prior = chunkText(chunk);
    if (!prior) continue;
    const priorSource = transcriptSourceFromTags(chunk.tags);
    if (priorSource !== source && priorSource !== "unknown" && source !== "unknown") continue;
    if (isDuplicateText(prior, norm)) return true;
  }
  return false;
}

/** Append transcript text only when it adds new content vs the tail. */
export function appendTranscriptDeduped(existing: string, newText: string): string {
  const chunk = normalizeTranscriptText(newText);
  if (!chunk) return existing.trim();
  const base = existing.trim();
  if (!base) return chunk;
  // Interim → final: longer utterance replaces shorter prefix.
  if (chunk.startsWith(base) || base.startsWith(chunk)) {
    return chunk.length >= base.length ? chunk : base;
  }
  const tail = base.slice(-Math.min(base.length, chunk.length + 40));
  if (isDuplicateText(tail, chunk) || base.endsWith(chunk)) return base;
  return `${base} ${chunk}`.trim();
}

/** Count consecutive duplicate transcript chunks (QA metric). */
export function countDuplicateTranscriptLines(chunks: TranscriptChunkLike[]): number {
  let dupes = 0;
  let prev = "";
  for (const chunk of chunks) {
    const text = chunkText(chunk);
    if (!text) continue;
    if (prev && isDuplicateText(prev, text)) dupes += 1;
    prev = text;
  }
  return dupes;
}

/** Collapse consecutive duplicate lines for transcript panel display. */
export function collapseDuplicateTranscriptLines(text: string): string {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const out: string[] = [];
  for (const line of lines) {
    const prev = out[out.length - 1];
    if (prev && isDuplicateText(prev, line)) continue;
    out.push(line);
  }
  return out.join("\n");
}

/** Dedupe session events for display — keeps first of near-identical transcript notes. */
export function dedupeTranscriptEventsForDisplay<T extends TranscriptChunkLike>(events: T[]): T[] {
  const out: T[] = [];
  for (const event of events) {
    const text = chunkText(event);
    if (!text) {
      out.push(event);
      continue;
    }
    const source = transcriptSourceFromTags(event.tags);
    if (isDuplicateTranscriptChunk(text, source, out)) continue;
    out.push(event);
  }
  return out;
}
