/**
 * IIVO Glass — Q&A memory layer.
 *
 * Persists every ask+answer pair to a local JSONL file so answers survive
 * across sessions and are searchable by keyword.
 *
 * Storage location: <userData>/glass-memory.jsonl
 *   ~/Library/Application Support/IIVO Glass/glass-memory.jsonl
 *
 * Privacy contract:
 *   - Never stores screenshots or base64 image data
 *   - Stores only text: prompt, answer, active app, browser URL
 *   - Library lives entirely on-device — never sent to any server
 *   - User can delete the file to clear all memory
 */

import { join } from "node:path";
import { appendFile, readFile } from "node:fs";
import { app } from "electron";
import type { GlassMemoryEntry } from "../shared/ipc.ts";

// Re-export so callers can import from here too
export type { GlassMemoryEntry };

// ---------------------------------------------------------------------------
// Path helper
// ---------------------------------------------------------------------------

function getMemoryFilePath(): string {
  return join(app.getPath("userData"), "glass-memory.jsonl");
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

function serializeEntry(entry: GlassMemoryEntry): string {
  return JSON.stringify(entry);
}

function parseMemoryFile(content: string): GlassMemoryEntry[] {
  const entries: GlassMemoryEntry[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (isValidEntry(parsed)) {
        entries.push(parsed);
      }
    } catch {
      // Skip corrupt lines — partial crash recovery
    }
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isValidEntry(obj: unknown): obj is GlassMemoryEntry {
  if (!obj || typeof obj !== "object") return false;
  const r = obj as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.ts === "number" &&
    typeof r.prompt === "string" &&
    typeof r.answer === "string"
  );
}

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

let seq = 0;

function makeId(): string {
  seq += 1;
  return `${Date.now()}-${seq}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Append a new Q&A entry to the JSONL memory file.
 * Fire-and-forget style — rejects are silently swallowed so callers don't need to handle them.
 */
export async function saveMemoryEntry(
  entry: Omit<GlassMemoryEntry, "id" | "ts">,
): Promise<void> {
  const full: GlassMemoryEntry = {
    ...entry,
    id: makeId(),
    ts: Date.now(),
  };
  const line = serializeEntry(full) + "\n";
  const filePath = getMemoryFilePath();
  return new Promise<void>((resolve) => {
    appendFile(filePath, line, (err) => {
      if (err) {
        console.error("[glassMemory] failed to save entry:", err.message);
      }
      resolve();
    });
  });
}

/**
 * Simple keyword search over persisted memory entries.
 *
 * Returns entries where the prompt or answer contains ALL query words
 * (case-insensitive), newest first.
 *
 * @param query   Space-separated keywords.
 * @param limit   Maximum entries to return. Default 5.
 */
export async function searchMemory(
  query: string,
  limit = 5,
): Promise<GlassMemoryEntry[]> {
  const entries = await readAllEntries();
  const words = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0);

  if (words.length === 0) {
    return entries.slice().sort((a, b) => b.ts - a.ts).slice(0, limit);
  }

  const matches = entries.filter((e) => {
    const combined = `${e.prompt} ${e.answer}`.toLowerCase();
    return words.every((w) => combined.includes(w));
  });

  return matches.sort((a, b) => b.ts - a.ts).slice(0, limit);
}

/**
 * Return the N most recent memory entries, newest first.
 *
 * @param limit  Maximum entries to return. Default 10.
 */
export async function getRecentMemory(limit = 10): Promise<GlassMemoryEntry[]> {
  const entries = await readAllEntries();
  return entries.sort((a, b) => b.ts - a.ts).slice(0, limit);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function readAllEntries(): Promise<GlassMemoryEntry[]> {
  const filePath = getMemoryFilePath();
  return new Promise<GlassMemoryEntry[]>((resolve) => {
    readFile(filePath, "utf-8", (err, data) => {
      if (err) {
        // File doesn't exist yet — that's fine
        resolve([]);
        return;
      }
      resolve(parseMemoryFile(data));
    });
  });
}
