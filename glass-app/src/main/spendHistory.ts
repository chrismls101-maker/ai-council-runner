/**
 * Spend history — persists one day-level summary per day to userData.
 *
 * Each time a SpendSnapshot arrives (from polling or manual refresh),
 * we upsert today's entry. Entries older than MAX_DAYS are pruned.
 *
 * File: <userData>/spend-history.json — array of SpendDaySummary, sorted
 * ascending by date so the most recent is last.
 */

import { app } from "electron";
import { join } from "node:path";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import type { SpendSnapshot, SpendDaySummary } from "../shared/ipc.ts";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MAX_DAYS = 365;

// ---------------------------------------------------------------------------
// File path
// ---------------------------------------------------------------------------

function historyPath(): string {
  return join(app.getPath("userData"), "spend-history.json");
}

// ---------------------------------------------------------------------------
// Read / write
// ---------------------------------------------------------------------------

function readHistory(): SpendDaySummary[] {
  try {
    const p = historyPath();
    if (!existsSync(p)) return [];
    const raw = readFileSync(p, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SpendDaySummary[]) : [];
  } catch {
    return [];
  }
}

function writeHistory(entries: SpendDaySummary[]): void {
  try {
    writeFileSync(historyPath(), JSON.stringify(entries, null, 2), "utf-8");
  } catch {
    // silently ignore write failures (read-only fs, permissions, etc.)
  }
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Log (upsert) a snapshot into today's history entry.
 * Extracts spend values from providers that returned "ok" status.
 */
export function logSpendSnapshot(snapshot: SpendSnapshot): void {
  const date = todayISO();

  const providerRows = snapshot.providers
    .filter((p) => p.status === "ok")
    .map((p) => {
      // Prefer todayUSD, fall back to monthUSD, then balanceUSD as a proxy
      const usd = p.todayUSD ?? p.monthUSD ?? p.balanceUSD ?? 0;
      return { service: p.service, displayName: p.displayName, usd };
    })
    .filter((p) => p.usd > 0);

  const totalUSD = providerRows.reduce((sum, p) => sum + p.usd, 0);

  // Only write if there's something to log
  if (providerRows.length === 0 && totalUSD === 0) return;

  const entries = readHistory();

  // Upsert today
  const existingIdx = entries.findIndex((e) => e.date === date);
  const newEntry: SpendDaySummary = { date, totalUSD, providers: providerRows };

  if (existingIdx >= 0) {
    entries[existingIdx] = newEntry;
  } else {
    entries.push(newEntry);
  }

  // Sort ascending
  entries.sort((a, b) => a.date.localeCompare(b.date));

  // Prune old entries
  const cutoff = daysAgoISO(MAX_DAYS);
  const pruned = entries.filter((e) => e.date >= cutoff);

  writeHistory(pruned);
}

/**
 * Return the last `days` entries (most recent last).
 * Fills gaps with zero-spend days so charts render cleanly.
 */
export function getSpendHistory(days = 90): SpendDaySummary[] {
  const entries = readHistory();
  const cutoff = daysAgoISO(days - 1);

  // Filter to requested window
  const inWindow = entries.filter((e) => e.date >= cutoff);

  // Build a map for O(1) lookup
  const byDate = new Map(inWindow.map((e) => [e.date, e]));

  // Fill every day in the window (gaps = $0)
  const result: SpendDaySummary[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = daysAgoISO(i);
    result.push(byDate.get(date) ?? { date, totalUSD: 0, providers: [] });
  }

  return result;
}

/**
 * Return the all-time total USD logged across all stored history.
 * Sums the highest daily total per calendar month to avoid double-counting
 * providers that report cumulative monthly spend (which we log each day).
 *
 * We store todayUSD where available (incremental), so we sum daily totals
 * directly. For providers that only expose monthUSD (cumulative), each day
 * we log the same number, so we take the MAX per month to avoid inflation.
 *
 * Simpler heuristic used here: sum all unique calendar-month MAX entries
 * across providers, per month. This isn't perfectly precise but avoids
 * inflating cumulative-only providers.
 */
export function getAllTimeTotal(): { totalUSD: number; since: string | null } {
  const entries = readHistory();
  if (entries.length === 0) return { totalUSD: 0, since: null };

  // Group by month → take max totalUSD per month as the month's spend
  // (this works because todayUSD providers add up daily; monthUSD providers
  // plateau at month-end — max is closer to truth than sum)
  const byMonth = new Map<string, number>();
  for (const e of entries) {
    const month = e.date.slice(0, 7); // "YYYY-MM"
    byMonth.set(month, Math.max(byMonth.get(month) ?? 0, e.totalUSD));
  }

  const totalUSD = Array.from(byMonth.values()).reduce((s, v) => s + v, 0);
  const since = entries[0]?.date ?? null;

  return { totalUSD, since };
}
