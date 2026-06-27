/**
 * Aletheia session notes (B4.2) — decisions, rationales, and compounding memory.
 *
 * Distinct from the execution audit trail and from Glass Memory admin.
 */

import { randomUUID } from "node:crypto";

export type AletheiaNoteCategory =
  | "decision"
  | "observation"
  | "research"
  | "preference"
  | "general";

export type AletheiaNoteSource =
  | "user"
  | "advice"
  | "action"
  | "research"
  | "loop"
  | "assistant";

export interface AletheiaNote {
  id: string;
  body: string;
  rationale?: string;
  category: AletheiaNoteCategory;
  source: AletheiaNoteSource;
  sessionId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AletheiaNotesSnapshot {
  notes: AletheiaNote[];
  updatedAt: number;
}

export interface AppendAletheiaNoteInput {
  body: string;
  rationale?: string;
  category?: AletheiaNoteCategory;
  source?: AletheiaNoteSource;
  sessionId?: string;
  now?: number;
}

export function emptyAletheiaNotesSnapshot(now = Date.now()): AletheiaNotesSnapshot {
  return { notes: [], updatedAt: now };
}

export function buildAletheiaNotesSnapshot(
  notes: AletheiaNote[],
  now = Date.now(),
): AletheiaNotesSnapshot {
  return {
    notes: [...notes].sort((a, b) => b.updatedAt - a.updatedAt),
    updatedAt: now,
  };
}

export function createAletheiaNote(input: AppendAletheiaNoteInput): AletheiaNote {
  const now = input.now ?? Date.now();
  const body = input.body.trim();
  return {
    id: randomUUID(),
    body,
    rationale: input.rationale?.trim() || undefined,
    category: input.category ?? "general",
    source: input.source ?? "assistant",
    sessionId: input.sessionId,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateAletheiaNoteBody(
  note: AletheiaNote,
  body: string,
  now = Date.now(),
): AletheiaNote {
  return {
    ...note,
    body: body.trim(),
    updatedAt: now,
  };
}

function noteSearchText(note: AletheiaNote): string {
  return `${note.body} ${note.rationale ?? ""}`.toLowerCase();
}

function promptKeywords(prompt: string): string[] {
  return prompt
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/^[^\p{L}\p{N}-]+|[^\p{L}\p{N}-]+$/gu, ""))
    .filter((word) => word.length > 2);
}

export function selectRelevantAletheiaNotes(
  notes: readonly AletheiaNote[],
  prompt: string,
  limit = 5,
): AletheiaNote[] {
  const trimmed = prompt.trim();
  if (!trimmed || notes.length === 0) return [];

  const words = promptKeywords(trimmed);
  if (words.length === 0) return [];

  const scored = notes.map((note) => {
    const haystack = noteSearchText(note);
    let keywordScore = 0;
    for (const word of words) {
      if (haystack.includes(word)) keywordScore += 2;
    }
    let score = keywordScore;
    const ageDays = (Date.now() - note.updatedAt) / (24 * 60 * 60 * 1000);
    score += Math.max(0, 3 - ageDays * 0.15);
    if (note.category === "decision") score += 0.5;
    return { note, score, keywordScore };
  });

  return scored
    .filter((row) => row.keywordScore > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((row) => row.note);
}

export function formatAletheiaNotesContext(notes: readonly AletheiaNote[]): string | undefined {
  if (notes.length === 0) return undefined;

  const lines = notes.map((note) => {
    const date = new Date(note.updatedAt).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
    const rationale = note.rationale ? ` Reason: ${note.rationale}` : "";
    return `- [${date}] ${note.body}${rationale}`;
  });

  return [
    "Aletheia notes — prior decisions and context Aletheia chose to remember:",
    ...lines,
    "Reference these naturally when relevant; do not read the list aloud unless asked.",
  ].join("\n");
}

export function formatAletheiaNoteForDisplay(note: AletheiaNote): string {
  const date = new Date(note.updatedAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  if (note.rationale) {
    return `${date} — ${note.body} (${note.rationale})`;
  }
  return `${date} — ${note.body}`;
}

export function categoryLabel(category: AletheiaNoteCategory): string {
  return category.replace(/_/g, " ");
}
