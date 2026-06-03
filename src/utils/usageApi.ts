import type {
  CreditEstimateResponse,
  UsageSummaryResponse,
} from "../types/usage";

export async function fetchUsageSummary(): Promise<UsageSummaryResponse> {
  const res = await fetch("/api/usage");
  if (!res.ok) throw new Error("Failed to load usage");
  return res.json() as Promise<UsageSummaryResponse>;
}

export async function estimateRunCredits(input: {
  workflowId?: string;
  tokenMode?: string;
  benchmarkEnabled?: boolean;
  route?: string;
  prompt?: string;
  visionScreenshotAnalysis?: boolean;
}): Promise<CreditEstimateResponse> {
  const res = await fetch("/api/usage/estimate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error("Failed to estimate credits");
  return res.json() as Promise<CreditEstimateResponse>;
}

export async function resetLocalCredits(): Promise<UsageSummaryResponse> {
  const res = await fetch("/api/usage/reset-local", { method: "POST" });
  if (!res.ok) throw new Error("Failed to reset credits");
  return fetchUsageSummary();
}

export async function addLocalCredits(credits: number): Promise<UsageSummaryResponse> {
  const res = await fetch("/api/usage/add-local-credits", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credits }),
  });
  if (!res.ok) throw new Error("Failed to add credits");
  return fetchUsageSummary();
}

export async function exportUsageEvents(): Promise<{ exportedAt: string; events: unknown[] }> {
  const res = await fetch("/api/export/usage", { method: "POST" });
  if (!res.ok) throw new Error("Failed to export usage");
  return res.json();
}

export function formatCredits(n: number): string {
  return `${Math.round(n)} credit${Math.round(n) === 1 ? "" : "s"}`;
}

export function shouldConfirmCredits(input: {
  estimatedCredits: number;
  currentCredits: number;
  tokenMode?: string;
  benchmarkEnabled?: boolean;
  workflowId?: string;
}): boolean {
  if (input.workflowId === "direct_answer") return false;
  const remaining = input.currentCredits - input.estimatedCredits;
  return (
    input.estimatedCredits >= 7 ||
    input.tokenMode === "deep" ||
    Boolean(input.benchmarkEnabled) ||
    remaining < 20
  );
}

export function shouldWarnCredits(input: {
  estimatedCredits: number;
  currentCredits: number;
}): boolean {
  const remaining = input.currentCredits - input.estimatedCredits;
  return input.estimatedCredits >= 5 || remaining < 20;
}
