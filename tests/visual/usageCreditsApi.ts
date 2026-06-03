/**
 * Usage & Credits API helpers for Visual QA — server-side assertions.
 */

import { expect } from "@playwright/test";
import { API_BASE } from "./qaStepHelpers.js";

export interface UsageEventRecord {
  id: string;
  timestamp: string;
  eventType: string;
  runId?: string;
  workflowId?: string;
  tokenMode?: string;
  credits?: number;
  balanceAfter?: number;
  metadata?: string;
}

export interface UsageSummary {
  planId: string;
  currentCredits: number;
  monthlyCredits: number;
  usedCreditsThisMonth: number;
  resetDate: string;
  recentUsage: UsageEventRecord[];
}

export interface CreditEstimateResult {
  estimatedCredits: number;
  breakdown: Array<{ label: string; credits: number }>;
  workflowId: string;
  tokenMode: string;
  benchmarkEnabled: boolean;
  currentCredits?: number;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${init?.method ?? "GET"} ${path} failed (${res.status}): ${body}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchUsageSummary(): Promise<UsageSummary> {
  return apiFetch<UsageSummary>("/api/usage");
}

export async function fetchUsageEvents(limit = 100): Promise<UsageEventRecord[]> {
  const data = await apiFetch<{ events: UsageEventRecord[] }>(
    `/api/usage/events?limit=${limit}`,
  );
  return data.events ?? [];
}

export async function resetLocalCredits(): Promise<UsageSummary> {
  await apiFetch("/api/usage/reset-local", { method: "POST" });
  return fetchUsageSummary();
}

export async function setLocalCredits(credits: number): Promise<UsageSummary> {
  await apiFetch("/api/usage/set-local-credits", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credits }),
  });
  return fetchUsageSummary();
}

export async function estimateCredits(input: {
  workflowId?: string;
  tokenMode?: string;
  benchmarkEnabled?: boolean;
  prompt?: string;
}): Promise<CreditEstimateResult> {
  return apiFetch<CreditEstimateResult>("/api/usage/estimate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function fetchHistoryRunCount(): Promise<number> {
  const data = await apiFetch<{ runs: unknown[] }>("/api/history");
  return data.runs?.length ?? 0;
}

export function expectCredits(summary: UsageSummary, expected: number): void {
  expect(summary.currentCredits, `currentCredits should be ${expected}`).toBe(expected);
}

export function hasEventType(events: UsageEventRecord[], eventType: string): boolean {
  return events.some((e) => e.eventType === eventType);
}

export function findEvents(
  events: UsageEventRecord[],
  predicate: (event: UsageEventRecord) => boolean,
): UsageEventRecord[] {
  return events.filter(predicate);
}

export function hasCreditDeductionForWorkflow(
  events: UsageEventRecord[],
  workflowId: string,
  credits: number,
): boolean {
  return events.some(
    (e) =>
      (e.eventType === "credits_deducted" || e.eventType === "credits_reserved") &&
      e.workflowId === workflowId &&
      e.credits === credits,
  );
}

export async function assertUsageResetToDefault(): Promise<UsageSummary> {
  const summary = await resetLocalCredits();
  expectCredits(summary, 100);
  expect(summary.monthlyCredits).toBe(100);
  return summary;
}
