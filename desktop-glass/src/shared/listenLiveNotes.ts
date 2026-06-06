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

export type LiveNoteSection =
  | "keyIdeas"
  | "quotes"
  | "concepts"
  | "warnings"
  | "frameworks"
  | "questions"
  | "actionIdeas";

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
  sections: Record<LiveNoteSection, string[]>;
  transcriptChunkCount: number;
  duplicateTranscriptCount: number;
  lastUpdatedAt?: string;
}

const SECTION_LABELS: Record<LiveNoteSection, string> = {
  keyIdeas: "Key ideas",
  quotes: "Important quotes",
  concepts: "Concepts explained",
  warnings: "Warnings / risks",
  frameworks: "Frameworks / tactics",
  questions: "Questions to revisit",
  actionIdeas: "Action ideas (notes only)",
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
  const section = TYPE_TO_SECTION[moment.type];
  if (!section) return null;

  const text = momentNoteText(moment);
  if (!text) return null;

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

function buildSections(entries: ListenLiveNoteEntry[]): Record<LiveNoteSection, string[]> {
  const sections: Record<LiveNoteSection, string[]> = {
    keyIdeas: [],
    quotes: [],
    concepts: [],
    warnings: [],
    frameworks: [],
    questions: [],
    actionIdeas: [],
  };
  for (const entry of entries) {
    const prefix =
      entry.status === "developing"
        ? "(developing) "
        : entry.status === "uncertain"
          ? "(needs more context) "
          : "";
    const line = `${prefix}${entry.text}`;
    if (!sections[entry.section].some((existing) => isDuplicateText(existing, line))) {
      sections[entry.section].push(line);
    }
  }
  return sections;
}

export interface BuildListenLiveNotesInput {
  moments: ListenMoment[];
  transcriptChunks?: string[];
  listenStartedMs?: number;
  nowMs?: number;
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
  const { moments, transcriptChunks = [], listenStartedMs } = input;
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

  const deduped = dedupeEntries(entries);
  const currentTopic = pickCurrentTopic(activeMoments);

  const duplicateTranscriptCount = countDuplicateTranscriptLines(
    transcriptChunks.map((text) => ({ text })),
  );

  return {
    currentTopic,
    entries: deduped,
    sections: buildSections(deduped),
    transcriptChunkCount: transcriptChunks.length,
    duplicateTranscriptCount,
    lastUpdatedAt: deduped.length ? deduped[deduped.length - 1]!.updatedAt : undefined,
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
