/**
 * Deterministic, local session intelligence extraction for IIVO Glass.
 *
 * No LLM calls. Rule-based classification of sentences from the session's
 * transcript, manual notes, and event text into insight candidates, with
 * duplicate prevention against existing insights.
 */

import type {
  GlassInsightType,
  GlassSessionEvent,
  GlassSessionImportance,
  GlassSessionInsight,
} from "./sessionTypes.ts";

export interface IntelInput {
  transcript?: string;
  notes?: string[];
  events?: GlassSessionEvent[];
}

export interface InsightCandidate {
  type: GlassInsightType;
  title: string;
  text: string;
  importance: GlassSessionImportance;
  sourceEventIds: string[];
}

const HYPOTHESIS_CUES = ["could", "might", "maybe", "this means", "perhaps", "i think", "what if", "probably"];
const RISK_CUES = ["risk", "problem", "issue", "concern", "danger", "blocker", "fails", "broken", "vulnerab"];
const ACTION_CUES = ["next", "should", "need to", "needs to", "action", "do this", "let's", "todo", "to-do", "follow up", "follow-up", "must"];
const MEMORY_CUES = ["remember", "save this", "don't forget", "do not forget", "keep in mind", "note that", "important to remember"];
const IMPORTANT_CUES = ["important", "key", "critical", "the point is", "main idea", "takeaway"];

interface TextItem {
  text: string;
  eventId?: string;
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\r/g, "\n")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

function shortTitle(text: string, max = 60): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function wordSet(text: string): Set<string> {
  return new Set(normalize(text).split(" ").filter((w) => w.length > 2));
}

/** True when two texts overlap heavily (one contains the other, or Jaccard > 0.6). */
export function isDuplicateText(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  const sa = wordSet(a);
  const sb = wordSet(b);
  if (sa.size === 0 || sb.size === 0) return false;
  let inter = 0;
  for (const w of sa) if (sb.has(w)) inter += 1;
  const union = sa.size + sb.size - inter;
  return union > 0 && inter / union > 0.6;
}

function classify(sentence: string): { type: GlassInsightType; importance: GlassSessionImportance } | null {
  const lower = sentence.toLowerCase();
  const wordCount = sentence.split(/\s+/).length;
  if (wordCount < 3) return null;

  if (sentence.trim().endsWith("?")) return { type: "question", importance: "medium" };
  if (includesAny(lower, MEMORY_CUES)) return { type: "memory_candidate", importance: "high" };
  if (includesAny(lower, RISK_CUES)) return { type: "risk", importance: "high" };
  if (includesAny(lower, ACTION_CUES)) return { type: "action", importance: "high" };
  if (includesAny(lower, HYPOTHESIS_CUES)) return { type: "hypothesis", importance: "medium" };
  if (includesAny(lower, IMPORTANT_CUES)) return { type: "key_idea", importance: "high" };
  return null;
}

/** Count repeated meaningful terms to surface emergent key ideas. */
function repeatedTermKeyIdeas(items: TextItem[]): InsightCandidate[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const w of wordSet(item.text)) counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  const repeated = [...counts.entries()]
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([w]) => w);
  if (repeated.length === 0) return [];
  // Attach the first sentence that mentions the most-repeated term.
  const out: InsightCandidate[] = [];
  for (const term of repeated) {
    const hit = items.find((i) => wordSet(i.text).has(term));
    if (hit) {
      out.push({
        type: "key_idea",
        title: shortTitle(`Recurring theme: ${term}`),
        text: hit.text,
        importance: "medium",
        sourceEventIds: hit.eventId ? [hit.eventId] : [],
      });
    }
  }
  return out;
}

function gatherTextItems(input: IntelInput): TextItem[] {
  const items: TextItem[] = [];
  if (input.transcript) {
    for (const s of splitSentences(input.transcript)) items.push({ text: s });
  }
  for (const note of input.notes ?? []) {
    for (const s of splitSentences(note)) items.push({ text: s });
  }
  for (const ev of input.events ?? []) {
    const parts = [ev.title, ev.text].filter(Boolean).join(". ");
    for (const s of splitSentences(parts)) items.push({ text: s, eventId: ev.id });
  }
  return items;
}

/** Extract categorized insight candidates from session inputs (deduped internally). */
export function extractSessionIntelligence(input: IntelInput): InsightCandidate[] {
  const items = gatherTextItems(input);
  const candidates: InsightCandidate[] = [];

  for (const item of items) {
    const cls = classify(item.text);
    if (!cls) continue;
    candidates.push({
      type: cls.type,
      title: shortTitle(item.text),
      text: item.text,
      importance: cls.importance,
      sourceEventIds: item.eventId ? [item.eventId] : [],
    });
  }

  candidates.push(...repeatedTermKeyIdeas(items));

  // internal dedupe (same type + heavily overlapping text)
  const unique: InsightCandidate[] = [];
  for (const c of candidates) {
    if (!unique.some((u) => u.type === c.type && isDuplicateText(u.text, c.text))) {
      unique.push(c);
    }
  }
  return unique;
}

/** Filter candidates down to those not already present as insights. */
export function selectNewInsights(
  existing: GlassSessionInsight[],
  candidates: InsightCandidate[],
): InsightCandidate[] {
  return candidates.filter(
    (c) => !existing.some((e) => e.type === c.type && isDuplicateText(e.text, c.text)),
  );
}

export const INSIGHT_TYPE_LABELS: Record<GlassInsightType, string> = {
  key_idea: "Key Ideas",
  hypothesis: "Hypotheses",
  risk: "Risks",
  action: "Actions",
  question: "Questions",
  memory_candidate: "Memory Candidates",
};
