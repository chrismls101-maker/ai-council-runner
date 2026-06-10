/**
 * Listen mode — AI-quality note refresh via IIVO server (GPT-5.5 background pass).
 *
 * Runs as a fire-and-forget background pass every ~35s after enough new
 * transcript has accumulated (≥ 300 chars delta). Produces interpretive notes
 * that are qualitatively better than local regex templates: GPT-5.5 can reason
 * about what the speaker is *really* arguing, not just pattern-match keywords.
 *
 * Falls back silently if the server is unavailable, the response is malformed,
 * or the transcript is too thin — local template notes keep showing.
 *
 * Data flow:
 *   refreshStreamingListenNotes (index.ts)
 *     └─► refreshListenNotesWithAI  (this file)
 *           └─► askIivoGlass → /api/glass/ask  (GPT-5.5)
 *                 └─► parseAiNotesResponse → ListenAiNote[]
 *                       └─► stored in listenAiNotes (index.ts module state)
 *                             └─► passed as aiNotes to buildListenLiveNotes
 *                                   └─► buildSections puts AI notes first
 */

import type { GlassConfig } from "../shared/config.ts";
import { askIivoGlass } from "./glassAskClient.ts";
import {
  getListenModePersonaCore,
  getListenModePersonaHardRules,
} from "../shared/listenModePersona.ts";
import type { ListenAiNote, LiveNoteSection } from "../shared/listenLiveNotes.ts";
import { buildSpeakerMappingBlock } from "../shared/speakerNameExtraction.ts";

export type { ListenAiNote };

// ─── Valid section names ────────────────────────────────────────────────────

const VALID_SECTIONS = new Set<string>([
  "keyIdeas",
  "frameworks",
  "concepts",
  "warnings",
  "actionIdeas",
  "questions",
]);

// ─── Result type ────────────────────────────────────────────────────────────

export interface ListenAiNotesResult {
  notes: ListenAiNote[];
  /** One-sentence description of the segment's topic, if the model provided it. */
  topicSummary?: string;
  /** Model string returned by the server (e.g. "gpt-5.5"). */
  model?: string;
}

// ─── Prompt builder ─────────────────────────────────────────────────────────

function buildRefreshPrompt(
  transcript: string,
  currentTopic: string | undefined,
  speakerNames: Readonly<Record<string, string>>,
): string {
  const topicHint = currentTopic
    ? `\nCurrent topic detected: "${currentTopic.slice(0, 120)}"`
    : "";

  const rules = getListenModePersonaHardRules()
    .map((r) => `- ${r}`)
    .join("\n");

  // Detect whether the transcript has speaker tags — present when Deepgram diarization is active.
  const hasSpeakerTags = /\[S\d+\]/.test(transcript);
  const mappingBlock = buildSpeakerMappingBlock(speakerNames);
  const speakerInstruction = hasSpeakerTags
    ? [
        "",
        "Speaker tags: the transcript contains [S0], [S1], etc. — these mark different speakers.",
        mappingBlock
          ? `${mappingBlock} — use these names when referencing speakers in notes.`
          : "Speaker names are not yet identified — use 'the host' for [S0] and 'the guest' for [S1] if attribution is needed.",
        "Focus notes on the guest/expert speaker (usually the one making claims and sharing insights),",
        "not the host's questions or filler phrases.",
        "If a note is idea-first and needs no attribution, skip the speaker name entirely.",
      ].join("\n")
    : "";

  return [
    getListenModePersonaCore(),
    "",
    "Hard rules:",
    rules,
    "",
    "Your task: generate structured live notes from the transcript segment below.",
    speakerInstruction,
    "",
    "Transcript (recent audio):",
    '"""',
    transcript.slice(-1200).trim(),
    '"""',
    topicHint,
    "",
    "Generate 2–4 notes. Prefer 2 excellent notes over 4 mediocre ones.",
    "",
    "CRITICAL — write notes as standalone insights, NOT as speaker attribution:",
    "  ✅ GOOD: \"Compounding interest works in reverse for debt — minimum payments can trap someone for decades.\"",
    "  ❌ BAD:  \"The speaker argues that compounding interest works in reverse for debt.\"",
    "  ✅ GOOD: \"Most businesses fail at distribution, not product — getting the product to market matters more than perfecting it.\"",
    "  ❌ BAD:  \"The speaker claims most businesses fail at distribution.\"",
    "",
    "Each note must:",
    "- State the idea directly — no 'the speaker', 'they', 'he said', 'she said', 'the presenter', or any attribution",
    "- Be a genuine interpretation — NOT a transcript copy",
    "- Be 1–2 complete sentences grounded in what was actually said",
    "- End with a complete thought — no trailing '...' or ellipsis",
    "- If transcript is too thin to write a complete insight, skip it rather than truncating",
    "- anchor: exact short phrase from the transcript (≤ 50 chars, strip any [SN] tag from anchor)",
    "- why: one sentence on why this matters to the listener (no attribution — state it directly)",
    "",
    "Return ONLY valid JSON — no markdown fences, no explanation:",
    '{"notes":[{"section":"keyIdeas|frameworks|concepts|warnings|actionIdeas|questions","note":"...","anchor":"...","why":"..."}],"topicSummary":"one sentence or null"}',
    "",
    'If transcript is too thin for meaningful notes, return: {"notes":[],"topicSummary":null}',
  ].join("\n");
}

// ─── Response parser ─────────────────────────────────────────────────────────

function parseAiNotesResponse(raw: string, model?: string): ListenAiNotesResult {
  // Strip markdown code fences if the model wraps its output anyway.
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Try to extract a JSON object from anywhere in the response (last resort).
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return { notes: [], topicSummary: undefined };
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return { notes: [], topicSummary: undefined };
    }
  }

  if (!parsed || typeof parsed !== "object") return { notes: [], topicSummary: undefined };
  const obj = parsed as Record<string, unknown>;
  const rawNotes = Array.isArray(obj.notes) ? obj.notes : [];

  const topicSummary =
    typeof obj.topicSummary === "string" && obj.topicSummary.length > 4
      ? obj.topicSummary.slice(0, 160)
      : undefined;

  const notes: ListenAiNote[] = [];
  const nowMs = Date.now();

  for (const rawNote of rawNotes) {
    if (!rawNote || typeof rawNote !== "object") continue;
    const n = rawNote as Record<string, unknown>;

    const section: LiveNoteSection =
      typeof n.section === "string" && VALID_SECTIONS.has(n.section)
        ? (n.section as LiveNoteSection)
        : "keyIdeas";

    const noteRaw = typeof n.note === "string"
      ? n.note.trim()
          // Strip trailing ellipsis — the model sometimes trails off when transcript is thin.
          .replace(/\.{2,}\s*$/, "")
          .replace(/…\s*$/, "")
          .trim()
          .slice(0, 300)
      : "";
    const note = noteRaw;
    if (!note || note.length < 16) continue;
    // Skip notes that end mid-sentence without a period — likely a truncated model response.
    if (note.length >= 60 && !/[.!?)"»]$/.test(note)) continue;

    // Skip notes that are too close to raw transcript copy patterns.
    if (/^(the speaker said|they mentioned|he said|she said)/i.test(note)) continue;

    const anchor =
      typeof n.anchor === "string" && n.anchor.trim().length >= 8
        ? n.anchor.trim().slice(0, 50)
        : undefined;

    const why =
      typeof n.why === "string" && n.why.trim().length >= 10
        ? n.why.trim().slice(0, 160)
        : undefined;

    notes.push({
      id: `ai-${nowMs}-${Math.random().toString(36).slice(2, 8)}`,
      section,
      note,
      anchor,
      why,
      generatedAt: new Date(nowMs).toISOString(),
      model,
    });
  }

  return { notes, topicSummary, model };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Call the IIVO server (GPT-5.5) with recent transcript and return AI-quality notes.
 *
 * Returns `{ notes: [], topicSummary: undefined }` on any failure — callers
 * should treat an empty result as "keep showing local notes" and NOT log errors.
 */
export async function refreshListenNotesWithAI(
  config: GlassConfig,
  transcript: string,
  currentTopic: string | undefined,
  speakerNames: Readonly<Record<string, string>> = {},
): Promise<ListenAiNotesResult> {
  const trimmed = transcript.trim();
  // Require at least 80 chars — fewer means the transcript is too thin for meaningful interpretation.
  if (trimmed.length < 80) return { notes: [], topicSummary: undefined };

  const prompt = buildRefreshPrompt(trimmed, currentTopic, speakerNames);

  try {
    const response = await askIivoGlass(config, { prompt, responseStyle: "full" });
    const raw = response.answer?.trim() ?? "";
    if (!raw) {
      console.warn(
        `[listenAiNotes] AI pass empty answer (transcript len: ${trimmed.length})`,
      );
      return { notes: [], topicSummary: undefined };
    }
    const parsed = parseAiNotesResponse(raw, response.model ?? response.modelUsed);
    if (parsed.notes.length === 0 && raw.includes('"notes"')) {
      console.warn(
        `[listenAiNotes] AI response had notes key but parse yielded 0 (answer len: ${raw.length})`,
      );
    }
    return parsed;
  } catch (err) {
    console.warn(
      `[listenAiNotes] AI refresh failed (transcript len: ${trimmed.length}):`,
      err instanceof Error ? err.message : String(err),
    );
    return { notes: [], topicSummary: undefined };
  }
}
