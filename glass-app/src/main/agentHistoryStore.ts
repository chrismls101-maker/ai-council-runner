/**
 * Persisted history of recent Glass Agent runs.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import type { AgentHistoryEntry } from "../shared/ipc.ts";

const MAX_ENTRIES = 20;

function storePath(): string {
  return join(app.getPath("userData"), "glass-agent-history.json");
}

function readAll(): AgentHistoryEntry[] {
  try {
    const p = storePath();
    if (!existsSync(p)) return [];
    const parsed = JSON.parse(readFileSync(p, "utf-8"));
    return Array.isArray(parsed) ? (parsed as AgentHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function writeAll(entries: AgentHistoryEntry[]): void {
  try {
    writeFileSync(storePath(), JSON.stringify(entries, null, 2), "utf-8");
  } catch {
    // best-effort
  }
}

export function loadAgentHistory(): AgentHistoryEntry[] {
  return readAll().slice(0, MAX_ENTRIES);
}

export function appendAgentHistory(entry: AgentHistoryEntry): AgentHistoryEntry[] {
  const next = [entry, ...readAll().filter((e) => e.runId !== entry.runId)].slice(0, MAX_ENTRIES);
  writeAll(next);
  return next;
}

export function updateAgentHistoryRun(
  runId: string,
  patch: Partial<Pick<AgentHistoryEntry, "status" | "finishedAt" | "savedFilePath" | "error" | "changedFiles">>,
): AgentHistoryEntry[] {
  const all = readAll();
  const idx = all.findIndex((e) => e.runId === runId);
  if (idx < 0) return all;
  all[idx] = { ...all[idx], ...patch };
  writeAll(all);
  return all.slice(0, MAX_ENTRIES);
}
