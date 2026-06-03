/**
 * API helpers for Visual QA — reads decision/history endpoints only.
 */

export const API_BASE = "http://localhost:3001";

export const SAVED_OUTCOME = {
  actionTaken: "Delayed SMS and focused on missed-call recovery.",
  expectedOutcome: "Get first 5 pilot customers faster by keeping the offer simple.",
  outcomeStatus: "in_progress" as const,
  actualOutcome: "Still testing.",
  resultMetric: "0 pilots yet.",
  lessonsLearned: "Need more outreach volume before deciding whether the offer needs SMS.",
};

export interface HistoryRunSummary {
  runId: string;
  timestamp: string;
  prompt: string;
  status: string;
  workflowId: string;
}

export interface DecisionRecordApi {
  id: string;
  runId: string;
  actionTaken?: string;
  expectedOutcome?: string;
  actualOutcome?: string;
  outcomeStatus: string;
  resultMetric?: string;
  lessonsLearned?: string;
  originalPrompt?: string;
  updatedAt: string;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API ${path} failed (${res.status}): ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export async function listHistoryRuns(): Promise<HistoryRunSummary[]> {
  const data = await apiFetch<{ runs: HistoryRunSummary[] }>("/api/history");
  return data.runs ?? [];
}

export async function findLatestRunByPromptSnippet(
  snippet: string,
): Promise<HistoryRunSummary> {
  const runs = await listHistoryRuns();
  const matches = runs
    .filter((r) => r.prompt.includes(snippet))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  if (matches.length === 0) {
    throw new Error(`No history run found containing: ${snippet.slice(0, 80)}…`);
  }
  return matches[0]!;
}

export async function waitForRunStatus(
  runId: string,
  expectedStatus: string,
  timeoutMs = 30_000,
): Promise<HistoryRunSummary> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const runs = await listHistoryRuns();
    const run = runs.find((r) => r.runId === runId);
    if (run?.status === expectedStatus) return run;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Run ${runId} did not reach status "${expectedStatus}" within ${timeoutMs}ms`);
}

export async function fetchDecisionRecordByRunId(
  runId: string,
): Promise<DecisionRecordApi> {
  return apiFetch<DecisionRecordApi>(`/api/decisions/by-run/${runId}`);
}

export function assertSavedOutcomeFields(record: DecisionRecordApi): void {
  const mismatches: string[] = [];

  const check = (field: keyof typeof SAVED_OUTCOME, actual: string | undefined) => {
    const expected = SAVED_OUTCOME[field];
    if (actual !== expected) {
      mismatches.push(`${field}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  };

  check("actionTaken", record.actionTaken);
  check("expectedOutcome", record.expectedOutcome);
  check("outcomeStatus", record.outcomeStatus);
  check("actualOutcome", record.actualOutcome);
  check("resultMetric", record.resultMetric);
  check("lessonsLearned", record.lessonsLearned);

  if (mismatches.length > 0) {
    throw new Error(`Decision record fields mismatch:\n${mismatches.join("\n")}`);
  }
}

export const SAVED_OUTCOME_SIGNALS: RegExp[] = [
  /delayed sms/i,
  /missed-call recovery/i,
  /still testing/i,
  /0 pilots yet/i,
  /outreach volume/i,
  /in progress/i,
];

export const CAUTION_SIGNALS: RegExp[] = [
  /not conclusive/i,
  /not enough evidence/i,
  /still testing/i,
  /in progress/i,
  /do not assume/i,
  /not proven/i,
];

export function countPatternMatches(text: string, patterns: RegExp[]): number {
  return patterns.filter((p) => p.test(text)).length;
}

export function assertPriorOutcomeReferencedInAnswer(answer: string): {
  savedCount: number;
  cautionCount: number;
} {
  const savedCount = countPatternMatches(answer, SAVED_OUTCOME_SIGNALS);
  const cautionCount = countPatternMatches(answer, CAUTION_SIGNALS);

  if (savedCount < 2) {
    throw new Error(
      `Expected ≥2 saved-outcome signals in follow-up answer (found ${savedCount}). ` +
        `Got: ${answer.slice(0, 500)}…`,
    );
  }
  if (cautionCount < 1) {
    throw new Error(
      `Expected ≥1 caution signal in follow-up answer (found ${cautionCount}). ` +
        `Got: ${answer.slice(0, 500)}…`,
    );
  }

  return { savedCount, cautionCount };
}
