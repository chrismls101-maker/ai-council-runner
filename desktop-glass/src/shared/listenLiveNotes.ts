/**
 * Listen mode — structured live notes from moments and transcript chunks.
 *
 * Granola-style note-taking: organized sections, deduped, no action prompts.
 * Pure — no electron / fs.
 */

import { isDuplicateText } from "./sessionIntelligence.ts";
import { countDuplicateTranscriptLines } from "./transcriptDedupe.ts";
import type { GlassSessionEvent } from "./sessionTypes.ts";
import type { ListenMoment, ListenMomentType } from "./listenMomentTypes.ts";
import { isActionFirstListenCard } from "./listenInsightQuality.ts";
import type { ListenCheckpointSummary } from "./listenCheckpoint.ts";
import {
  dedupeMeaningNotes,
  formatMeaningNoteForDisplay,
  isTranscriptLikeNote,
  meaningKindToSection,
  meaningNoteFromMoment,
  meaningNoteFromStreamingSentence,
  pickLatestMatureInsight,
  type ListenMeaningNote,
} from "./listenMeaningNote.ts";

/** Default live-notes refresh interval (10–20s target). */
export const LIVE_NOTES_REFRESH_MS = 15_000;
export const LIVE_NOTES_REFRESH_MIN_MS = 10_000;
export const LIVE_NOTES_REFRESH_MAX_MS = 20_000;

export type LiveNoteSection =
  | "keyIdeas"
  | "quotes"
  | "concepts"
  | "warnings"
  | "frameworks"
  | "questions"
  | "actionIdeas"
  | "developing";

export type LiveNoteStatus = "developing" | "mature" | "uncertain";

export interface ListenLiveNoteEntry {
  id: string;
  section: LiveNoteSection;
  text: string;
  anchor?: string;
  status: LiveNoteStatus;
  momentType?: ListenMomentType;
  updatedAt: string;
  elapsedLabel?: string;
}

export interface ListenLiveNotesState {
  currentTopic?: string;
  entries: ListenLiveNoteEntry[];
  /** Structured meaning notes (interpretation-first). */
  meaningNotes?: ListenMeaningNote[];
  /** Latest mature insight for the lightbulb strip (one at a time). */
  latestInsight?: ListenMeaningNote;
  sections: Record<LiveNoteSection, string[]>;
  transcriptChunkCount: number;
  duplicateTranscriptCount: number;
  lastUpdatedAt?: string;
  /** Rolling transcript preview (not full spam). */
  rollingPreview?: string;
  lastRefreshMs?: number;
  nextRefreshMs?: number;
  developingCount?: number;
  checkpointCount?: number;
  listeningStatus?: "listening" | "building" | "idle";
  sourceLabel?: string;
  micStatus?: "off" | "on";
}

const SECTION_LABELS: Record<LiveNoteSection, string> = {
  keyIdeas: "Key ideas",
  quotes: "Important quotes",
  concepts: "Concepts explained",
  warnings: "Warnings / risks",
  frameworks: "Frameworks / tactics",
  questions: "Questions to revisit",
  actionIdeas: "Action ideas",
  developing: "Developing",
};

export function liveNoteSectionLabel(section: LiveNoteSection): string {
  return SECTION_LABELS[section];
}

const TYPE_TO_SECTION: Partial<Record<ListenMomentType, LiveNoteSection>> = {
  key_idea: "keyIdeas",
  claim: "keyIdeas",
  example: "keyIdeas",
  number_stat: "keyIdeas",
  quote: "quotes",
  confusing_concept: "concepts",
  warning: "warnings",
  framework: "frameworks",
  tactic: "frameworks",
  sales_tactic: "frameworks",
  business_opportunity: "frameworks",
  action_step: "actionIdeas",
  prompt_idea: "actionIdeas",
  implementation_idea: "actionIdeas",
  entity_mention: "keyIdeas",
};

const NOTE_STATUSES: ListenMoment["status"][] = [
  "developing",
  "ready",
  "saved_silently",
  "surfaced",
];

function noteStatusForMoment(moment: ListenMoment): LiveNoteStatus {
  if (moment.isStillDeveloping || moment.status === "developing") return "developing";
  if (moment.confidence < LISTEN_UNCERTAIN_CONFIDENCE) return "uncertain";
  if (!moment.transcriptAnchors[0] || moment.transcriptAnchors[0].length < 24) return "uncertain";
  return "mature";
}

const LISTEN_UNCERTAIN_CONFIDENCE = 0.55;

function formatElapsedLabel(listenStartedMs: number | undefined, momentMs: number): string | undefined {
  if (listenStartedMs == null) return undefined;
  const elapsedSec = Math.max(0, Math.floor((momentMs - listenStartedMs) / 1000));
  if (elapsedSec < 60) return `${elapsedSec}s`;
  const min = Math.floor(elapsedSec / 60);
  const sec = elapsedSec % 60;
  return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
}

function momentNoteText(moment: ListenMoment): string {
  const thought = (moment.suggestedThought ?? moment.summary).trim();
  if (isActionFirstListenCard(thought)) {
    return moment.summary.trim() || thought;
  }
  return thought;
}

function momentToEntry(moment: ListenMoment, listenStartedMs?: number): ListenLiveNoteEntry | null {
  const meaning = meaningNoteFromMoment(moment);
  if (!meaning) {
    const section = TYPE_TO_SECTION[moment.type];
    if (!section) return null;
    const text = momentNoteText(moment);
    if (!text || isTranscriptLikeNote(text, moment.transcriptAnchors[0])) return null;
    const anchor = moment.transcriptAnchors[0]?.trim();
    const momentMs = Date.parse(moment.lastUpdatedAt) || Date.now();
    return {
      id: moment.id,
      section,
      text,
      anchor: anchor && anchor.length >= 12 ? anchor : undefined,
      status: noteStatusForMoment(moment),
      momentType: moment.type,
      updatedAt: moment.lastUpdatedAt,
      elapsedLabel: formatElapsedLabel(listenStartedMs, momentMs),
    };
  }

  const section = meaningKindToSection(meaning.kind);
  const momentMs = Date.parse(meaning.updatedAt) || Date.now();
  return {
    id: meaning.id,
    section,
    text: formatMeaningNoteForDisplay(meaning),
    anchor: meaning.transcriptAnchor,
    status: meaning.status === "developing" ? "developing" : "mature",
    momentType: moment.type,
    updatedAt: meaning.updatedAt,
    elapsedLabel: formatElapsedLabel(listenStartedMs, momentMs),
  };
}

function pickCurrentTopic(moments: ListenMoment[]): string | undefined {
  const topicTypes: ListenMomentType[] = ["key_idea", "claim", "framework"];
  for (let i = moments.length - 1; i >= 0; i--) {
    const m = moments[i]!;
    if (!topicTypes.includes(m.type)) continue;
    if (m.status === "stale" || m.status === "dismissed") continue;
    const text = (m.suggestedThought ?? m.summary).trim();
    if (text.length >= 16) return text.slice(0, 160);
  }
  return undefined;
}

function dedupeEntries(entries: ListenLiveNoteEntry[]): ListenLiveNoteEntry[] {
  const out: ListenLiveNoteEntry[] = [];
  for (const entry of entries) {
    const dup = out.some(
      (e) =>
        e.section === entry.section &&
        (isDuplicateText(e.text, entry.text) ||
          (entry.anchor && e.anchor && isDuplicateText(e.anchor, entry.anchor))),
    );
    if (!dup) out.push(entry);
  }
  return out;
}

function buildSections(
  entries: ListenLiveNoteEntry[],
  meaningNotes: ListenMeaningNote[] = [],
): Record<LiveNoteSection, string[]> {
  const sections: Record<LiveNoteSection, string[]> = {
    keyIdeas: [],
    quotes: [],
    concepts: [],
    warnings: [],
    frameworks: [],
    questions: [],
    actionIdeas: [],
    developing: [],
  };

  for (const mn of meaningNotes) {
    const section = meaningKindToSection(mn.kind);
    const line = formatMeaningNoteForDisplay(mn);
    if (sections[section].some((existing) => isDuplicateText(existing, line))) continue;
    sections[section].push(line);
  }

  for (const entry of entries) {
    const prefix =
      entry.status === "developing"
        ? "(developing) "
        : entry.status === "uncertain"
          ? "(needs more context) "
          : "";
    const line = `${prefix}${entry.text}`;
    const target =
      entry.status === "developing" && !sections.developing.length
        ? "developing"
        : entry.section;
    if (!sections[target].some((existing) => isDuplicateText(existing, line))) {
      sections[target].push(line);
    }
  }
  return sections;
}

export interface BuildListenLiveNotesInput {
  moments: ListenMoment[];
  transcriptChunks?: string[];
  rollingTranscript?: string;
  listenStartedMs?: number;
  nowMs?: number;
  lastRefreshMs?: number;
  checkpoints?: ListenCheckpointSummary[];
  listeningStatus?: ListenLiveNotesState["listeningStatus"];
  duplicateFragmentCount?: number;
}

export function shouldRefreshStreamingLiveNotes(
  lastRefreshMs: number | undefined,
  nowMs: number,
  intervalMs = LIVE_NOTES_REFRESH_MS,
): boolean {
  if (lastRefreshMs == null) return true;
  return nowMs - lastRefreshMs >= intervalMs;
}

/** Adaptive refresh: faster when transcript is flowing, capped at 10–20s. */
export function computeLiveNotesRefreshInterval(newTranscriptChars: number): number {
  if (newTranscriptChars >= 400) return LIVE_NOTES_REFRESH_MIN_MS;
  if (newTranscriptChars >= 120) return LIVE_NOTES_REFRESH_MS;
  return LIVE_NOTES_REFRESH_MAX_MS;
}

function splitNoteSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 16);
}

/** Extract developing notes from recent rolling transcript (no action prompts). */
export function extractStreamingNoteCandidates(
  rollingText: string,
  existingEntries: ListenLiveNoteEntry[],
  listenStartedMs?: number,
  nowMs = Date.now(),
): ListenLiveNoteEntry[] {
  const window = rollingText.slice(-900).trim();
  if (window.length < 24) return [];

  const candidates: ListenLiveNoteEntry[] = [];
  for (const sentence of splitNoteSentences(window).slice(-4)) {
    if (sentence.length < 28) continue;

    const id = `stream-${hashNoteId(sentence)}`;
    const meaning = meaningNoteFromStreamingSentence(sentence, id, new Date(nowMs).toISOString());
    if (!meaning) continue;

    const merged = existingEntries.some(
      (e) => isDuplicateText(e.text, meaning.note) || (e.anchor && isDuplicateText(e.anchor, sentence)),
    );
    if (merged) continue;

    const section = meaningKindToSection(meaning.kind);
    candidates.push({
      id: meaning.id,
      section: meaningKindToSection(meaning.kind),
      text: formatMeaningNoteForDisplay(meaning),
      anchor: meaning.transcriptAnchor,
      status: meaning.status === "developing" ? "developing" : "mature",
      updatedAt: meaning.updatedAt,
      elapsedLabel: formatElapsedLabel(listenStartedMs, nowMs),
    });
  }
  return candidates;
}

function hashNoteId(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

/** Promote developing entries to key ideas when anchor is mature. */
function promoteMatureStreamingEntries(entries: ListenLiveNoteEntry[]): ListenLiveNoteEntry[] {
  return entries.map((e) => {
    if (e.status !== "developing") return e;
    const anchor = e.anchor ?? e.text;
    if (anchor.length >= 72 && /[.!?]$/.test(anchor)) {
      return {
        ...e,
        status: "mature" as const,
        section: "keyIdeas" as const,
        text: anchor.replace(/^Following:\s*/i, ""),
      };
    }
    return e;
  });
}

/** System-audio transcript chunks from session events (raw, deduped for display separately). */
export function listenTranscriptChunksFromEvents(events: GlassSessionEvent[]): string[] {
  const chunks: string[] = [];
  for (const event of events) {
    if (!event.tags?.includes("system_audio")) continue;
    const text = (event.text ?? event.title ?? "").trim();
    if (!text) continue;
    if (chunks.some((c) => isDuplicateText(c, text))) continue;
    chunks.push(text);
  }
  return chunks;
}

/** Build structured live notes from listen moments and transcript chunks. */
export function buildListenLiveNotes(input: BuildListenLiveNotesInput): ListenLiveNotesState {
  const {
    moments,
    transcriptChunks = [],
    rollingTranscript = "",
    listenStartedMs,
    lastRefreshMs,
    checkpoints = [],
  } = input;
  const nowMs = input.nowMs ?? Date.now();

  const activeMoments = moments.filter((m) => NOTE_STATUSES.includes(m.status) || m.status === "pending");

  const entries: ListenLiveNoteEntry[] = [];
  for (const moment of activeMoments) {
    if (moment.type === "action_step" || moment.type === "prompt_idea") {
      if (noteStatusForMoment(moment) !== "mature") continue;
    }
    const entry = momentToEntry(moment, listenStartedMs);
    if (entry) entries.push(entry);
  }

  for (const moment of activeMoments) {
    const q = moment.suggestedQuestion?.trim();
    if (!q) continue;
    entries.push({
      id: `${moment.id}-q`,
      section: "questions",
      text: q,
      status: noteStatusForMoment(moment),
      updatedAt: moment.lastUpdatedAt,
      elapsedLabel: formatElapsedLabel(listenStartedMs, Date.parse(moment.lastUpdatedAt) || nowMs),
    });
  }

  const meaningNotes: ListenMeaningNote[] = [];
  for (const moment of activeMoments) {
    const mn = meaningNoteFromMoment(moment);
    if (mn) meaningNotes.push(mn);
  }
  for (const sentence of splitNoteSentences(rollingTranscript.slice(-900)).slice(-4)) {
    const id = `stream-${hashNoteId(sentence)}`;
    const mn = meaningNoteFromStreamingSentence(sentence, id, new Date(nowMs).toISOString());
    if (mn) meaningNotes.push(mn);
  }
  const dedupedMeaning = dedupeMeaningNotes(meaningNotes);

  const momentEntries = dedupeEntries(entries);
  const streamCandidates = extractStreamingNoteCandidates(
    rollingTranscript,
    momentEntries,
    listenStartedMs,
    nowMs,
  );
  const deduped = dedupeEntries([...promoteMatureStreamingEntries(momentEntries), ...streamCandidates]);
  const latestInsight = pickLatestMatureInsight(dedupedMeaning);
  const topicFallback = rollingTranscript.slice(-160).trim();
  const currentTopic =
    pickCurrentTopic(activeMoments) ??
    checkpoints[checkpoints.length - 1]?.topicSummary ??
    (topicFallback || undefined);

  const duplicateTranscriptCount =
    (input.duplicateFragmentCount ?? 0) +
    countDuplicateTranscriptLines(transcriptChunks.map((text) => ({ text })));

  const developingCount = deduped.filter((e) => e.status === "developing" || e.status === "uncertain").length;

  return {
    currentTopic: currentTopic?.slice(0, 160),
    entries: deduped,
    meaningNotes: dedupedMeaning,
    latestInsight,
    sections: buildSections(deduped, dedupedMeaning),
    transcriptChunkCount: transcriptChunks.length,
    duplicateTranscriptCount,
    lastUpdatedAt: deduped.length ? deduped[deduped.length - 1]!.updatedAt : new Date(nowMs).toISOString(),
    rollingPreview: rollingTranscript.slice(-280).trim() || undefined,
    lastRefreshMs: lastRefreshMs ?? nowMs,
    nextRefreshMs: (lastRefreshMs ?? nowMs) + LIVE_NOTES_REFRESH_MS,
    developingCount,
    checkpointCount: checkpoints.length,
    listeningStatus: input.listeningStatus ?? "listening",
    sourceLabel: "System Audio",
    micStatus: "off",
  };
}

/** Note for thin/unclear transcript fragment — saved silently, not an action prompt. */
export function unclearTranscriptNote(text: string): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length < 24) {
    return "Audio fragment captured, but not enough context yet.";
  }
  return `Note: "${trimmed.slice(0, 80)}${trimmed.length > 80 ? "…" : ""}" — needs more context before summarizing.`;
}
