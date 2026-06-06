/**
 * Listen Mode — meaning-based note model (interpretation over transcript copy).
 * Pure — no electron / fs.
 */

import { isDuplicateText } from "./sessionIntelligence.ts";
import type { ListenMoment, ListenMomentType } from "./listenMomentTypes.ts";
import { isActionFirstListenCard } from "./listenInsightQuality.ts";
import type { LiveNoteSection } from "./listenLiveNotes.ts";

export type ListenMeaningKind =
  | "key_idea"
  | "concept"
  | "interpretation"
  | "quote"
  | "warning"
  | "framework"
  | "question"
  | "action_idea"
  | "developing";

export type ListenMeaningConfidence = "low" | "medium" | "high";
export type ListenMeaningStatus = "developing" | "mature" | "saved";

export interface ListenMeaningNote {
  id: string;
  kind: ListenMeaningKind;
  title: string;
  note: string;
  meaning?: string;
  whyItMatters?: string;
  transcriptAnchor?: string;
  confidence: ListenMeaningConfidence;
  status: ListenMeaningStatus;
  createdAt: string;
  updatedAt: string;
}

const TRANSCRIPT_COPY_PATTERNS = [
  /^continued (his|her|their|the) (speech|talk|discussion)/i,
  /^said that\b/i,
  /^explained,? (that|how)\b/i,
  /^described (a|an|the)\b/i,
  /^mentioned (that|how)\b/i,
  /^carnegie explained/i,
  /^the speaker said/i,
  /^following:/i,
];

const QUOTED_TRANSCRIPT_RATIO = 0.55;

function wordOverlap(a: string, b: string): number {
  const aw = new Set(a.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  const bw = b.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  if (!aw.size || !bw.length) return 0;
  let hit = 0;
  for (const w of bw) if (aw.has(w)) hit++;
  return hit / bw.length;
}

/** Reject notes that are mostly copied transcript wording. */
export function isTranscriptLikeNote(note: string, anchor?: string): boolean {
  const text = note.replace(/\s+/g, " ").trim();
  if (!text) return true;
  if (
    /^(Developing idea|Concept:|Framework:|What the speaker|The speaker is|Key idea:|Interpretation:|This matters because|This connects to)/i.test(
      text,
    )
  ) {
    return false;
  }
  if (TRANSCRIPT_COPY_PATTERNS.some((re) => re.test(text))) return true;
  if (anchor && anchor.length >= 20) {
    const overlap = wordOverlap(text, anchor);
    if (overlap >= QUOTED_TRANSCRIPT_RATIO && text.length <= anchor.length * 1.35) return true;
    if (text.includes(anchor.slice(0, Math.min(48, anchor.length)))) return true;
  }
  const quoted = (text.match(/"[^"]{24,}"/g) ?? []).join("");
  if (quoted.length > text.length * 0.5) return true;
  return false;
}

const TYPE_TO_KIND: Partial<Record<ListenMomentType, ListenMeaningKind>> = {
  key_idea: "key_idea",
  claim: "key_idea",
  example: "key_idea",
  number_stat: "key_idea",
  quote: "quote",
  confusing_concept: "concept",
  warning: "warning",
  framework: "framework",
  tactic: "framework",
  sales_tactic: "framework",
  business_opportunity: "framework",
  action_step: "action_idea",
  prompt_idea: "action_idea",
  implementation_idea: "action_idea",
  entity_mention: "key_idea",
};

const KIND_TO_SECTION: Record<ListenMeaningKind, LiveNoteSection | "developing"> = {
  key_idea: "keyIdeas",
  concept: "concepts",
  interpretation: "keyIdeas",
  quote: "quotes",
  warning: "warnings",
  framework: "frameworks",
  question: "questions",
  action_idea: "actionIdeas",
  developing: "developing",
};

export function meaningKindToSection(kind: ListenMeaningKind): LiveNoteSection | "developing" {
  return KIND_TO_SECTION[kind];
}

function confidenceForMoment(moment: ListenMoment): ListenMeaningConfidence {
  if (moment.isStillDeveloping || moment.status === "developing") return "low";
  if (moment.confidence >= 0.75) return "high";
  if (moment.confidence >= 0.55) return "medium";
  return "low";
}

function statusForMoment(moment: ListenMoment): ListenMeaningStatus {
  if (moment.isStillDeveloping || moment.status === "developing") return "developing";
  if (moment.status === "saved_silently" || moment.status === "surfaced") return "saved";
  return "mature";
}

function titleForKind(kind: ListenMeaningKind, developing: boolean): string {
  if (developing) return "Developing idea";
  switch (kind) {
    case "concept":
      return "Concept";
    case "framework":
      return "Framework";
    case "quote":
      return "Quote / paraphrase";
    case "warning":
      return "Warning";
    case "action_idea":
      return "Action idea";
    case "question":
      return "Question";
    case "interpretation":
      return "Interpretation";
    default:
      return "Key idea";
  }
}

/** Build interpretation-style note text from a moment (not raw transcript). */
export function buildInterpretationFromMoment(moment: ListenMoment): {
  note: string;
  meaning?: string;
  whyItMatters?: string;
} {
  const thought = (moment.suggestedThought ?? moment.summary).trim();
  const why = moment.reasonSelected?.trim();
  const anchor = moment.transcriptAnchors[0]?.trim();

  if (thought && !isTranscriptLikeNote(thought, anchor)) {
    return {
      note: thought,
      meaning: why && why.length >= 24 ? why : undefined,
      whyItMatters: why,
    };
  }

  const excerpt = anchor ? anchor.slice(0, 100) : moment.summary.slice(0, 100);
  const kind = TYPE_TO_KIND[moment.type] ?? "interpretation";
  const developing = moment.isStillDeveloping || moment.status === "developing";

  if (kind === "concept" || moment.type === "confusing_concept") {
    return {
      note: developing
        ? `The speaker is building toward a concept around “${excerpt.slice(0, 60)}…”. Wait for the full principle before treating it as settled.`
        : `Concept: The speaker is explaining how “${excerpt.slice(0, 72)}…” fits together — the practical point is how the pieces connect.`,
      whyItMatters: why ?? "Understanding this concept unlocks the rest of the segment.",
    };
  }

  if (kind === "framework") {
    return {
      note: `Framework: The speaker is laying out a structured approach — ${excerpt.slice(0, 90)}.`,
      whyItMatters: why ?? "Frameworks are easier to reuse when captured while the explanation is fresh.",
    };
  }

  if (developing) {
    return {
      note: `Developing idea: The speaker is building toward a point about ${excerpt.slice(0, 80)}. More context needed before summarizing.`,
      whyItMatters: why,
    };
  }

  return {
    note: `What the speaker is really saying: ${excerpt.charAt(0).toLowerCase()}${excerpt.slice(1, 120)}${excerpt.length > 120 ? "…" : ""}. The important part is how this connects to the larger argument.`,
    whyItMatters: why ?? "This stood out as a high-signal idea in the recent audio.",
  };
}

export function meaningNoteFromMoment(moment: ListenMoment): ListenMeaningNote | null {
  const kind = TYPE_TO_KIND[moment.type];
  if (!kind && !moment.suggestedThought && !moment.summary) return null;
  if (kind === "action_idea" && (moment.isStillDeveloping || moment.status === "developing")) {
    return null;
  }

  const resolvedKind = kind ?? "interpretation";
  const developing = moment.isStillDeveloping || moment.status === "developing";
  const { note, meaning, whyItMatters } = buildInterpretationFromMoment(moment);
  if (!note || isTranscriptLikeNote(note, moment.transcriptAnchors[0])) return null;
  if (isActionFirstListenCard(note) && resolvedKind !== "action_idea") return null;

  const anchor = moment.transcriptAnchors[0]?.trim();
  const shortAnchor =
    anchor && anchor.length >= 12 && anchor.length <= 120 ? anchor : undefined;

  return {
    id: moment.id,
    kind: developing ? "developing" : resolvedKind,
    title: titleForKind(resolvedKind, developing),
    note,
    meaning,
    whyItMatters,
    transcriptAnchor: shortAnchor,
    confidence: confidenceForMoment(moment),
    status: statusForMoment(moment),
    createdAt: moment.firstSeenAt ?? moment.lastUpdatedAt,
    updatedAt: moment.lastUpdatedAt,
  };
}

export function meaningNoteFromStreamingSentence(
  sentence: string,
  id: string,
  nowIso: string,
): ListenMeaningNote | null {
  const trimmed = sentence.replace(/\s+/g, " ").trim();
  if (trimmed.length < 28 || isTranscriptLikeNote(trimmed)) return null;
  if (isActionFirstListenCard(trimmed)) return null;

  const mature = trimmed.length >= 72 && /[.!?]$/.test(trimmed);
  const kind: ListenMeaningKind = mature ? "key_idea" : "developing";

  const note = mature
    ? `The speaker is arguing that ${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)}`
    : `Developing idea: The speaker is building toward a point about ${trimmed.slice(0, 100)}${trimmed.length > 100 ? "…" : ""}. Wait for the full principle.`;

  if (isTranscriptLikeNote(note, trimmed)) return null;

  return {
    id,
    kind,
    title: titleForKind(kind, !mature),
    note,
    whyItMatters: mature
      ? "This is a clear enough fragment to capture as a takeaway."
      : "Still gathering context from the audio.",
    transcriptAnchor: trimmed.slice(0, 80),
    confidence: mature ? "medium" : "low",
    status: mature ? "mature" : "developing",
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export function formatMeaningNoteForDisplay(note: ListenMeaningNote): string {
  const prefix =
    note.status === "developing"
      ? "Developing: "
      : note.kind === "concept"
        ? "Concept: "
        : note.kind === "framework"
          ? "Framework: "
          : "";
  return `${prefix}${note.note}`;
}

export function pickLatestMatureInsight(notes: ListenMeaningNote[]): ListenMeaningNote | undefined {
  for (let i = notes.length - 1; i >= 0; i--) {
    const n = notes[i]!;
    if (n.status === "developing" || n.confidence === "low") continue;
    if (n.kind === "action_idea") continue;
    if (isTranscriptLikeNote(n.note, n.transcriptAnchor)) continue;
    if (!n.whyItMatters && n.confidence !== "high") continue;
    return n;
  }
  return undefined;
}

export function dedupeMeaningNotes(notes: ListenMeaningNote[]): ListenMeaningNote[] {
  const out: ListenMeaningNote[] = [];
  for (const note of notes) {
    const dup = out.some(
      (e) =>
        e.kind === note.kind &&
        (isDuplicateText(e.note, note.note) ||
          (note.transcriptAnchor &&
            e.transcriptAnchor &&
            isDuplicateText(e.transcriptAnchor, note.transcriptAnchor))),
    );
    if (!dup) out.push(note);
  }
  return out;
}

export function countTranscriptLikeNotes(notes: ListenMeaningNote[]): number {
  return notes.filter((n) => isTranscriptLikeNote(n.note, n.transcriptAnchor)).length;
}
