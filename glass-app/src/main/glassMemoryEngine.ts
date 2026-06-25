/**
 * Glass memory engine — user profile, episodic memories, hydration for agents.
 */

import { randomUUID } from "crypto";
import type {
  ExtractedFact,
  HydratedContext,
  MemoryHit,
  MemoryInput,
} from "../shared/glassMemory.ts";
import { getDb, isVecExtensionLoaded } from "./glassDatabase.ts";
import { embed, embedPassage, ensureEmbedderReady, isEmbedderReady, vectorToBlob } from "./glassEmbedder.ts";
import { askAnthropicHaiku, GlassAskNoAnthropicKeyError } from "./glassAskAnthropic.ts";
import { resolveAnthropicApiKey } from "./anthropicKeyStore.ts";
import { buildLocalSessionSummary } from "./glassMemoryLocal.ts";
import { extractionDedupeKey } from "./glassMemoryPure.ts";
import { getSessionMessages, getSessionMeta } from "./sessionHistoryStore.ts";
import { getLatestCorrelationAgentRuns } from "./agentRunStore.ts";
import { logMemoryEnrichmentUsed } from "./glassRetentionEvents.ts";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type { ExtractedFact, HydratedContext, MemoryHit, MemoryInput } from "../shared/glassMemory.ts";

export const EXTRACTION_PROMPT = `Extract facts about THE USER ONLY from this session.
Return JSON array. Return [] if nothing qualifies.

Rules:
- Only extract durable facts about the user (preferences, role, goals, tools, constraints) — not transient task state.
- Each key MUST start with "user." and use snake_case segments (e.g. user.preferred_language, user.current_project).
- value MUST be a short plain string.
- confidence MUST be a number between 0 and 1.
- Do NOT extract secrets, API keys, passwords, or full file paths.
- Do NOT extract assistant opinions — user statements and implicit preferences only.
- Output ONLY valid JSON — no markdown fences, no commentary.`;

const SESSION_SUMMARY_SYSTEM = `Summarize this Glass session in 2-4 sentences for future memory retrieval.
Focus on what the user wanted, what was decided, and durable context. Plain text only.`;

function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function formatContextKey(key: string): string {
  const human = key
    .replace(/^user\./, "")
    .replace(/_/g, " ")
    .replace(/\./g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return human || key;
}

export function buildUserProfile(): string {
  const db = getDb();
  if (!db) return "";
  try {
    const rows = db
      .prepare(
        "SELECT key, value FROM user_context ORDER BY updated_at DESC",
      )
      .all() as Array<{ key: string; value: string }>;
    if (!rows.length) return "";
    return rows.map((row) => `- ${formatContextKey(row.key)}: ${row.value}`).join("\n");
  } catch (err) {
    console.error("[memory] buildUserProfile:", err);
    return "";
  }
}

function similarityFromDistance(distance: number): number {
  return 1 / (1 + Math.max(0, distance));
}

function recencyPenalty(createdAt: number): number {
  const days = (Date.now() - createdAt) / MS_PER_DAY;
  return days / 90;
}

function compositeScore(distance: number, createdAt: number): number {
  return distance * 0.7 + recencyPenalty(createdAt) * 0.3;
}

export async function storeMemory(input: MemoryInput): Promise<void> {
  const db = getDb();
  if (!db) return;
  const summary = (input.summary ?? input.content).trim();
  if (!summary) return;

  await ensureEmbedderReady(60_000);

  try {
    if (isEmbedderReady()) {
      const embedding = await embedPassage(summary);
      const now = Date.now();
      db.prepare(
        `INSERT INTO memories (
          id, session_id, agent_id, content, summary, embedding, memory_type,
          importance, created_at, provider, tags
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        randomUUID(),
        input.sessionId ?? null,
        input.agentId ?? null,
        input.content,
        summary,
        vectorToBlob(embedding),
        input.memoryType,
        input.importance ?? 0.5,
        now,
        input.provider ?? null,
        input.tags ?? null,
      );
      return;
    }

    queuePendingMemory(input, summary);
  } catch (err) {
    console.error("[memory] storeMemory:", err);
    try {
      queuePendingMemory(input, summary);
    } catch (queueErr) {
      console.error("[memory] queuePendingMemory:", queueErr);
    }
  }
}

function queuePendingMemory(input: MemoryInput, summary: string): void {
  const db = getDb();
  if (!db) return;
  const now = Date.now();
  db.prepare(
    `INSERT INTO memory_pending (
      id, session_id, agent_id, content, summary, memory_type,
      importance, created_at, provider, tags
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    input.sessionId ?? null,
    input.agentId ?? null,
    input.content,
    summary,
    input.memoryType,
    input.importance ?? 0.5,
    now,
    input.provider ?? null,
    input.tags ?? null,
  );
  console.warn("[memory] embedder unavailable — queued summary for later embedding");
}

export function hasAnthropicKeyForMemory(): boolean {
  return Boolean(resolveAnthropicApiKey());
}

function queuePendingExtraction(opts: {
  sessionId: string;
  correlationId?: string;
  transcript: string;
  dedupeTag: string;
}): void {
  const db = getDb();
  if (!db) return;
  try {
    db.prepare(
      `INSERT OR IGNORE INTO extraction_pending (
        id, session_id, correlation_id, transcript, dedupe_tag, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      opts.sessionId,
      opts.correlationId ?? null,
      opts.transcript,
      opts.dedupeTag,
      Date.now(),
    );
  } catch (err) {
    console.error("[memory] queuePendingExtraction:", err);
  }
}

function upsertSessionMemoryRow(opts: {
  sessionId: string;
  transcript: string;
  summary: string;
  dedupeTag: string;
  provider: string;
}): Promise<void> {
  return storeMemory({
    sessionId: opts.sessionId,
    agentId: "memory-engine",
    content: opts.transcript.slice(0, 4000),
    summary: opts.summary,
    memoryType: "session_summary",
    importance: 0.5,
    tags: opts.dedupeTag,
    provider: opts.provider,
  });
}

async function summarizeTranscript(transcript: string): Promise<{ summary: string; provider: string }> {
  if (!hasAnthropicKeyForMemory()) {
    return { summary: buildLocalSessionSummary(transcript), provider: "local" };
  }
  try {
    const summary = await askAnthropicHaiku(SESSION_SUMMARY_SYSTEM, transcript.slice(0, 8000));
    if (summary.trim()) {
      return { summary: summary.trim(), provider: "haiku" };
    }
  } catch (err) {
    if (!(err instanceof GlassAskNoAnthropicKeyError)) {
      console.error("[memory] summarizeTranscript:", err);
    }
  }
  return { summary: buildLocalSessionSummary(transcript), provider: "local" };
}

async function applySessionExtraction(opts: {
  sessionId: string;
  correlationId?: string;
  transcript: string;
  dedupeTag: string;
  force?: boolean;
}): Promise<void> {
  const { sessionId, correlationId, transcript, dedupeTag, force } = opts;
  const db = getDb();
  if (!db) return;

  const existing = db
    .prepare("SELECT provider FROM memories WHERE tags = ? LIMIT 1")
    .get(dedupeTag) as { provider: string | null } | undefined;

  if (!force && existing?.provider === "haiku") {
    return;
  }
  if (!force && !existing && hasRecentMemoryWithTag(dedupeTag, Date.now() - 2 * 60 * 1000)) {
    return;
  }

  await ensureEmbedderReady(90_000);

  const { summary, provider } = await summarizeTranscript(transcript);
  if (!summary.trim()) return;

  if (!(existing?.provider === "haiku" && provider === "local")) {
    db.prepare("DELETE FROM memories WHERE tags = ?").run(dedupeTag);
    await upsertSessionMemoryRow({ sessionId, transcript, summary, dedupeTag, provider });
  }

  if (hasAnthropicKeyForMemory()) {
    const facts = await extractUserFacts(transcript);
    for (const fact of facts) {
      if (fact.confidence >= 0.8) {
        upsertUserContext(fact);
      }
    }
    await confirmMemories(transcript);
    db.prepare("DELETE FROM extraction_pending WHERE dedupe_tag = ?").run(dedupeTag);
  } else {
    queuePendingExtraction({ sessionId, correlationId, transcript, dedupeTag });
  }
}

export async function flushPendingExtractions(): Promise<void> {
  if (!hasAnthropicKeyForMemory()) return;
  const db = getDb();
  if (!db) return;

  try {
    const rows = db
      .prepare(
        `SELECT id, session_id, correlation_id, transcript, dedupe_tag
         FROM extraction_pending ORDER BY created_at ASC LIMIT 20`,
      )
      .all() as Array<{
        id: string;
        session_id: string;
        correlation_id: string | null;
        transcript: string;
        dedupe_tag: string;
      }>;

    for (const row of rows) {
      try {
        await applySessionExtraction({
          sessionId: row.session_id,
          correlationId: row.correlation_id ?? undefined,
          transcript: row.transcript,
          dedupeTag: row.dedupe_tag,
          force: true,
        });
      } catch (err) {
        console.error("[memory] flushPendingExtractions row:", err);
      }
    }
  } catch (err) {
    console.error("[memory] flushPendingExtractions:", err);
  }
}

/** Run after embedder init and/or Anthropic key connect. */
export async function notifyMemoryServicesReady(): Promise<void> {
  await ensureEmbedderReady(90_000);
  await flushPendingMemories();
  await flushPendingExtractions();
}

export function hasRecentMemoryWithTag(tag: string, sinceMs: number): boolean {
  const db = getDb();
  if (!db || !tag.trim()) return false;
  try {
    const row = db
      .prepare("SELECT 1 FROM memories WHERE tags = ? AND created_at >= ? LIMIT 1")
      .get(tag, sinceMs);
    return Boolean(row);
  } catch {
    return false;
  }
}

export async function flushPendingMemories(): Promise<void> {
  const db = getDb();
  if (!db || !isEmbedderReady()) return;
  try {
    const rows = db
      .prepare(
        `SELECT id, session_id, agent_id, content, summary, memory_type,
                importance, created_at, provider, tags
         FROM memory_pending ORDER BY created_at ASC LIMIT 50`,
      )
      .all() as Array<{
        id: string;
        session_id: string | null;
        agent_id: string | null;
        content: string;
        summary: string;
        memory_type: string;
        importance: number;
        created_at: number;
        provider: string | null;
        tags: string | null;
      }>;

    for (const row of rows) {
      try {
        const embedding = await embedPassage(row.summary);
        db.prepare(
          `INSERT INTO memories (
            id, session_id, agent_id, content, summary, embedding, memory_type,
            importance, created_at, provider, tags
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          randomUUID(),
          row.session_id,
          row.agent_id,
          row.content,
          row.summary,
          vectorToBlob(embedding),
          row.memory_type,
          row.importance,
          row.created_at,
          row.provider,
          row.tags,
        );
        db.prepare("DELETE FROM memory_pending WHERE id = ?").run(row.id);
      } catch (err) {
        console.error("[memory] flushPendingMemories row:", err);
      }
    }
  } catch (err) {
    console.error("[memory] flushPendingMemories:", err);
  }
}

async function vectorSearch(queryVector: Float32Array, limit: number): Promise<MemoryHit[]> {
  const db = getDb();
  if (!db || !isVecExtensionLoaded()) return [];
  try {
    const blob = vectorToBlob(queryVector);
    const rows = db
      .prepare(
        `SELECT m.id, m.summary, m.content, m.memory_type, m.created_at, v.distance
         FROM memories_vec v
         INNER JOIN memories m ON m.rowid = v.rowid
         WHERE v.embedding MATCH ?
         ORDER BY v.distance
         LIMIT ?`,
      )
      .all(blob, limit) as Array<{
        id: string;
        summary: string;
        content: string;
        memory_type: string;
        created_at: number;
        distance: number;
      }>;

    return rows.map((row) => ({
      id: row.id,
      summary: row.summary,
      content: row.content,
      memoryType: row.memory_type,
      createdAt: row.created_at,
      distance: row.distance,
      score: compositeScore(row.distance, row.created_at),
    }));
  } catch (err) {
    console.error("[memory] vectorSearch:", err);
    return [];
  }
}

function escapeFtsQuery(query: string): string {
  const terms = query
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 1)
    .slice(0, 8)
    .map((t) => `"${t.replace(/"/g, "")}"`);
  return terms.join(" OR ") || query.replace(/"/g, "");
}

async function ftsSearch(query: string, limit: number): Promise<MemoryHit[]> {
  const db = getDb();
  if (!db) return [];
  const ftsQuery = escapeFtsQuery(query);
  if (!ftsQuery.trim()) return [];
  try {
    const rows = db
      .prepare(
        `SELECT m.id, m.summary, m.content, m.memory_type, m.created_at
         FROM memories_fts f
         INNER JOIN memories m ON m.rowid = f.rowid
         WHERE memories_fts MATCH ?
         LIMIT ?`,
      )
      .all(ftsQuery, limit) as Array<{
        id: string;
        summary: string;
        content: string;
        memory_type: string;
        created_at: number;
      }>;

    return rows.map((row, index) => ({
      id: row.id,
      summary: row.summary,
      content: row.content,
      memoryType: row.memory_type,
      createdAt: row.created_at,
      score: 0.5 + index * 0.01,
    }));
  } catch (err) {
    console.error("[memory] ftsSearch:", err);
    return [];
  }
}

function touchMemories(ids: string[]): void {
  const db = getDb();
  if (!db || !ids.length) return;
  const now = Date.now();
  const stmt = db.prepare(
    "UPDATE memories SET accessed_at = ?, access_count = access_count + 1 WHERE id = ?",
  );
  for (const id of ids) {
    stmt.run(now, id);
  }
}

export async function hydrateContext(
  query: string,
  _agentType: string,
  maxTokens = 800,
): Promise<HydratedContext> {
  const userProfile = buildUserProfile();
  const profileTokens = approxTokens(userProfile);
  let budget = Math.max(0, maxTokens - profileTokens);

  const empty: HydratedContext = {
    userProfile,
    relevantMemories: "",
    tokenCount: profileTokens,
  };

  if (!query.trim()) {
    return empty;
  }

  if (!isEmbedderReady()) {
    await ensureEmbedderReady(15_000);
  }
  if (!isEmbedderReady()) {
    return empty;
  }

  try {
    const queryVector = await embed(query);
    const [vectorHits, ftsHits] = await Promise.all([
      vectorSearch(queryVector, 8),
      ftsSearch(query, 5),
    ]);

    const byId = new Map<string, MemoryHit>();
    for (const hit of [...vectorHits, ...ftsHits]) {
      const existing = byId.get(hit.id);
      if (!existing || hit.score < existing.score) {
        byId.set(hit.id, hit);
      }
    }

    const sorted = [...byId.values()].sort((a, b) => a.score - b.score);
    const selected: MemoryHit[] = [];
    const selectedSummaries: string[] = [];

    for (const hit of sorted) {
      const line = hit.summary.trim();
      if (!line) continue;
      const lineTokens = approxTokens(line);
      if (lineTokens > budget) continue;
      selected.push(hit);
      selectedSummaries.push(line);
      budget -= lineTokens;
      if (budget <= 0) break;
    }

    if (selected.length) {
      touchMemories(selected.map((h) => h.id));
      logMemoryEnrichmentUsed(undefined, { memoryCount: selected.length });
    }

    const relevantMemories = selectedSummaries.join("\n\n");
    return {
      userProfile,
      relevantMemories,
      tokenCount: profileTokens + approxTokens(relevantMemories),
    };
  } catch (err) {
    console.error("[memory] hydrateContext:", err);
    return empty;
  }
}

export async function extractUserFacts(transcript: string): Promise<ExtractedFact[]> {
  if (!transcript.trim()) return [];
  try {
    const raw = await askAnthropicHaiku(
      EXTRACTION_PROMPT,
      transcript.slice(0, 12_000),
    );
    const jsonText = raw.trim().replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    const parsed = JSON.parse(jsonText) as unknown;
    if (!Array.isArray(parsed)) return [];
    const facts: ExtractedFact[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const key = typeof row.key === "string" ? row.key.trim() : "";
      const value = typeof row.value === "string" ? row.value.trim() : "";
      const confidence = typeof row.confidence === "number" ? row.confidence : NaN;
      if (!key.startsWith("user.") || !value || Number.isNaN(confidence)) continue;
      facts.push({ key, value, confidence });
    }
    return facts;
  } catch (err) {
    console.error("[memory] extractUserFacts:", err);
    return [];
  }
}

export function upsertUserContext(fact: ExtractedFact): void {
  const db = getDb();
  if (!db) return;
  const now = Date.now();
  try {
    const existing = db
      .prepare("SELECT confidence FROM user_context WHERE key = ?")
      .get(fact.key) as { confidence: number } | undefined;
    if (existing && existing.confidence > fact.confidence) return;

    db.prepare(
      `INSERT INTO user_context (key, value, source, confidence, created_at, updated_at, memory_type)
       VALUES (?, ?, 'inferred', ?, ?, ?, 'fact')
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         source = excluded.source,
         confidence = excluded.confidence,
         updated_at = excluded.updated_at,
         memory_type = excluded.memory_type`,
    ).run(fact.key, fact.value, fact.confidence, now, now);
  } catch (err) {
    console.error("[memory] upsertUserContext:", err);
  }
}

/** Build a transcript from messages, falling back to agent_runs + session title. */
export function buildSessionTranscript(sessionId: string): string {
  const meta = getSessionMeta(sessionId);
  const messages = getSessionMessages(sessionId);
  const preferAgentRuns = meta?.agentType === "council";

  if (!preferAgentRuns && messages.length) {
    return messages
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join("\n")
      .slice(0, 20_000);
  }

  const lines: string[] = [];
  if (meta?.title?.trim()) {
    lines.push(`user: ${meta.title.trim()}`);
  }

  const runs = getLatestCorrelationAgentRuns(sessionId);
  for (const run of runs) {
    const output = run.output?.trim();
    if (output) {
      lines.push(`${run.agent_id}: ${output}`);
    }
  }

  if (lines.length) {
    return lines.join("\n").slice(0, 20_000);
  }

  if (messages.length) {
    return messages
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join("\n")
      .slice(0, 20_000);
  }

  return "";
}

export async function confirmMemories(newTranscript: string): Promise<void> {
  const db = getDb();
  if (!db || !isEmbedderReady()) return;
  const snippet = newTranscript.slice(0, 1000);
  if (!snippet.trim()) return;
  try {
    const vector = await embed(snippet);
    const hits = await vectorSearch(vector, 5);
    const stmt = db.prepare(
      `UPDATE memories
       SET confirmed_count = confirmed_count + 1,
           importance = MIN(1.0, importance + 0.05)
       WHERE id = ?`,
    );
    for (const hit of hits) {
      const distance = hit.distance ?? hit.score;
      const similarity = similarityFromDistance(distance);
      if (similarity > 0.85) {
        stmt.run(hit.id);
      }
    }
  } catch (err) {
    console.error("[memory] confirmMemories:", err);
  }
}

export async function runPostSessionExtraction(
  sessionId: string,
  correlationId?: string,
): Promise<void> {
  if (!sessionId.trim()) return;

  const dedupeTag = extractionDedupeKey(sessionId, correlationId);
  const transcript = buildSessionTranscript(sessionId);
  if (!transcript.trim()) return;

  try {
    await applySessionExtraction({
      sessionId,
      correlationId,
      transcript,
      dedupeTag,
    });
  } catch (err) {
    console.error("[memory] runPostSessionExtraction:", err);
  }
}

export function pruneStaleMemories(): void {
  const db = getDb();
  if (!db) return;
  const cutoff = Date.now() - NINETY_DAYS_MS;
  try {
    db.prepare(
      `DELETE FROM memories
       WHERE confirmed_count < 2
         AND importance < 0.4
         AND created_at < ?
         AND memory_type != 'user_fact'`,
    ).run(cutoff);
    db.exec("VACUUM");
  } catch (err) {
    console.error("[memory] pruneStaleMemories:", err);
  }
}
