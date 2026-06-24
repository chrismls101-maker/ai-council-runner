/**
 * Session Copilot — deterministic insight extraction engine.
 *
 * v1 is rule/keyword based (no LLM): it reuses the existing
 * `extractSessionIntelligence` classifier for the shared insight kinds and
 * layers copilot-specific detection (opportunity, cursor_prompt_candidate,
 * summary_note) on top, then dedupes and scores importance/confidence.
 *
 * Pure — no electron / fs. The interval loop in main calls this only when
 * `hasNewCopilotContext` is true (no new transcript/screen context → no run).
 */

import type { GlassSessionEvent } from "./sessionTypes.ts";
import {
  extractSessionIntelligence,
  isDuplicateText,
} from "./sessionIntelligence.ts";
import {
  type GlassCopilotImportance,
  type GlassCopilotInsight,
  type GlassCopilotInsightType,
} from "./copilotTypes.ts";

export interface CopilotExtractionInput {
  /** Transcript text accumulated since the last extraction run. */
  newTranscript: string;
  /** Session events created since the last run (transcript/screen/command). */
  newEvents: GlassSessionEvent[];
  /** Recent IIVO command-bar prompts. */
  recentCommands?: string[];
  /** Recent IIVO responses. */
  recentResponses?: string[];
  sourceApp?: string;
  sourceTitle?: string;
}

export interface CopilotEngineDeps {
  idFactory: () => string;
  clock: () => string;
}

const OPPORTUNITY_CUES = [
  "we could",
  "you could",
  "it'd be great",
  "it would be great",
  "opportunity",
  "what if we",
  "potential to",
  "this could let",
  "would let us",
  "we should consider",
  "imagine if",
  "big win",
];

const CURSOR_PROMPT_CUES = [
  "build a",
  "build the",
  "implement",
  "add a",
  "add an",
  "create a",
  "create an",
  "refactor",
  "write a function",
  "write a script",
  "fix the bug",
  "fix the error",
  "in cursor",
  "let's code",
  "lets code",
  "generate a",
  "scaffold",
  "wire up",
  "hook up",
];

const SCREEN_EVENT_KINDS = new Set(["screen_capture", "app_context"]);

function lower(text: string): string {
  return text.toLowerCase();
}

function includesAny(haystack: string, needles: string[]): boolean {
  const h = lower(haystack);
  return needles.some((n) => h.includes(n));
}

function shortTitle(text: string, max = 60): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\r/g, "\n")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const IMPORTANCE_CONFIDENCE: Record<GlassCopilotImportance, number> = {
  low: 0.4,
  medium: 0.6,
  high: 0.8,
};

/**
 * True when there is genuinely new transcript or screen context to process.
 * Prevents the interval loop from re-running on stale data.
 */
export function hasNewCopilotContext(input: CopilotExtractionInput): boolean {
  if (input.newTranscript.trim().length > 0) return true;
  return input.newEvents.some(
    (e) => e.kind === "transcript_note" || SCREEN_EVENT_KINDS.has(e.kind),
  );
}

interface RawCandidate {
  type: GlassCopilotInsightType;
  title: string;
  text: string;
  source: string;
  importance: GlassCopilotImportance;
  confidence: number;
  relatedEventIds: string[];
  suggestedAction?: string;
}

function suggestedActionFor(type: GlassCopilotInsightType): string | undefined {
  switch (type) {
    case "action":
      return "Save as action item";
    case "cursor_prompt_candidate":
      return "Turn into a Cursor prompt";
    case "risk":
      return "Diagnose or flag this risk";
    case "opportunity":
      return "Capture this opportunity";
    case "memory_candidate":
      return "Save to memory";
    case "question":
      return "Answer with IIVO";
    default:
      return undefined;
  }
}

/** Reuse the shared classifier for the overlapping insight kinds. */
function baseCandidates(input: CopilotExtractionInput): RawCandidate[] {
  const notes = (input.recentCommands ?? []).concat(input.recentResponses ?? []);
  const candidates = extractSessionIntelligence({
    transcript: input.newTranscript,
    notes,
    events: input.newEvents,
  });
  return candidates.map((c) => ({
    type: c.type as GlassCopilotInsightType,
    title: c.title,
    text: c.text,
    source: "transcript",
    importance: c.importance,
    confidence: IMPORTANCE_CONFIDENCE[c.importance],
    relatedEventIds: c.sourceEventIds,
    suggestedAction: suggestedActionFor(c.type as GlassCopilotInsightType),
  }));
}

/** Copilot-specific detection layered on top of base candidates. */
function copilotSpecificCandidates(input: CopilotExtractionInput): RawCandidate[] {
  const out: RawCandidate[] = [];
  const transcriptSentences = splitSentences(input.newTranscript);
  const commandSentences = (input.recentCommands ?? []).flatMap(splitSentences);
  const allSentences = transcriptSentences.concat(commandSentences);

  for (const sentence of allSentences) {
    const words = sentence.split(/\s+/).length;
    if (words < 3) continue;

    if (includesAny(sentence, OPPORTUNITY_CUES)) {
      out.push({
        type: "opportunity",
        title: shortTitle(sentence),
        text: sentence,
        source: "transcript",
        importance: "high",
        confidence: 0.7,
        relatedEventIds: [],
        suggestedAction: suggestedActionFor("opportunity"),
      });
      continue;
    }
    if (includesAny(sentence, CURSOR_PROMPT_CUES)) {
      out.push({
        type: "cursor_prompt_candidate",
        title: shortTitle(sentence),
        text: sentence,
        source: "transcript",
        importance: "high",
        confidence: 0.72,
        relatedEventIds: [],
        suggestedAction: suggestedActionFor("cursor_prompt_candidate"),
      });
    }
  }

  // One low-importance rolling summary note per run (gist of new context).
  const summaryBasis =
    transcriptSentences[0] ??
    input.newEvents.find((e) => (e.text ?? e.title).trim())?.text ??
    "";
  if (summaryBasis.trim()) {
    out.push({
      type: "summary_note",
      title: shortTitle(`Noted: ${summaryBasis}`),
      text: summaryBasis.trim(),
      source: input.sourceTitle ? `app:${input.sourceTitle}` : "transcript",
      importance: "low",
      confidence: 0.5,
      relatedEventIds: [],
    });
  }

  return out;
}

function dedupeRaw(candidates: RawCandidate[]): RawCandidate[] {
  const unique: RawCandidate[] = [];
  for (const c of candidates) {
    if (!unique.some((u) => u.type === c.type && isDuplicateText(u.text, c.text))) {
      unique.push(c);
    }
  }
  return unique;
}

/**
 * Extract copilot insights from *new* context. Returns fully-formed insights
 * with `userDecision: "pending"`. Does NOT dedupe against existing session
 * insights — use `dedupeCopilotInsights` for that.
 */
export function extractCopilotInsights(
  input: CopilotExtractionInput,
  deps: CopilotEngineDeps,
): GlassCopilotInsight[] {
  if (!hasNewCopilotContext(input)) return [];
  const raw = dedupeRaw([...baseCandidates(input), ...copilotSpecificCandidates(input)]);
  return raw.map((c) => ({
    id: deps.idFactory(),
    type: c.type,
    title: c.title,
    text: c.text,
    source: c.source,
    confidence: c.confidence,
    importance: c.importance,
    createdAt: deps.clock(),
    relatedEventIds: c.relatedEventIds,
    suggestedAction: c.suggestedAction,
    userDecision: "pending" as const,
  }));
}

/** Drop candidates that duplicate an existing insight (same type, similar text). */
export function dedupeCopilotInsights(
  existing: GlassCopilotInsight[],
  candidates: GlassCopilotInsight[],
): GlassCopilotInsight[] {
  const accepted: GlassCopilotInsight[] = [];
  for (const candidate of candidates) {
    const dupOfExisting = existing.some(
      (e) => e.type === candidate.type && isDuplicateText(e.text, candidate.text),
    );
    const dupOfAccepted = accepted.some(
      (a) => a.type === candidate.type && isDuplicateText(a.text, candidate.text),
    );
    if (!dupOfExisting && !dupOfAccepted) accepted.push(candidate);
  }
  return accepted;
}
