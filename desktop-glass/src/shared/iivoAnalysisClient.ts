/**
 * Direct IIVO Council analysis client for Glass (POST /api/run-council).
 */

import type { GlassConfig } from "./config.ts";
import { withIivoApiAuthHeaders } from "./iivoApiAuth.ts";
import { buildSessionContextPayload, SESSION_ANALYSIS_PROMPT } from "./sessionPayload.ts";
import type { GlassSession } from "./sessionTypes.ts";

export interface GlassExternalContextItem {
  id: string;
  type: "pasted_text";
  title: string;
  contentText: string;
  savedToLibrary: false;
}

export interface GlassCouncilRunRequest {
  prompt: string;
  preset: "none";
  workflow: "auto";
  executionMode: "council";
  executionModeConfirmationAccepted: true;
  executionModeConfirmationShown: true;
  externalContext: { items: GlassExternalContextItem[] };
}

export interface GlassCouncilRunResponse {
  runId?: string;
  status?: string;
  outputs?: { finalJudge?: string; strategy?: string };
  benchmarkAnswer?: string;
  usage?: { creditsCharged?: number; estimatedCredits?: number };
  error?: string;
}

export interface GlassAnalysisResult {
  answer: string;
  runId?: string;
  status: string;
  creditsCharged?: number;
}

export interface CreditEstimate {
  estimatedCredits: number;
  currentCredits: number;
  remainingAfterRun?: number;
}

export function buildSessionAnalysisPrompt(): string {
  return SESSION_ANALYSIS_PROMPT;
}

export function buildCouncilRunRequest(session: GlassSession): GlassCouncilRunRequest {
  const { payload } = buildSessionContextPayload(session, { forCouncilAnalysis: true });
  return {
    prompt: SESSION_ANALYSIS_PROMPT,
    preset: "none",
    workflow: "auto",
    executionMode: "council",
    executionModeConfirmationAccepted: true,
    executionModeConfirmationShown: true,
    externalContext: {
      items: [
        {
          id: session.id,
          type: "pasted_text",
          title: payload.title,
          contentText: payload.contentText,
          savedToLibrary: false,
        },
      ],
    },
  };
}

export function extractCouncilAnswer(result: GlassCouncilRunResponse): string {
  const fromJudge = result.outputs?.finalJudge?.trim();
  if (fromJudge) return fromJudge;
  const fromBenchmark = result.benchmarkAnswer?.trim();
  if (fromBenchmark) return fromBenchmark;
  const fromStrategy = result.outputs?.strategy?.trim();
  if (fromStrategy) return fromStrategy;
  return "";
}

export function buildRunCouncilUrl(config: GlassConfig): string {
  return `${config.iivoApiUrl}/api/run-council`;
}

export function buildUsageEstimateUrl(config: GlassConfig): string {
  return `${config.iivoApiUrl}/api/usage/estimate`;
}

export async function estimateCouncilCredits(
  config: GlassConfig,
  prompt: string,
): Promise<CreditEstimate | null> {
  try {
    const res = await fetch(buildUsageEstimateUrl(config), {
      method: "POST",
      headers: withIivoApiAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        prompt,
        workflowId: "auto",
        executionMode: "council",
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as CreditEstimate & { estimatedCredits?: number };
    return {
      estimatedCredits: data.estimatedCredits ?? 0,
      currentCredits: data.currentCredits ?? 0,
      remainingAfterRun: data.remainingAfterRun,
    };
  } catch {
    return null;
  }
}

export async function runCouncilAnalysis(
  config: GlassConfig,
  request: GlassCouncilRunRequest,
): Promise<GlassAnalysisResult> {
  const res = await fetch(buildRunCouncilUrl(config), {
    method: "POST",
    headers: withIivoApiAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(request),
  });
  const body = (await res.json().catch(() => ({}))) as GlassCouncilRunResponse & {
    error?: string;
    message?: string;
  };
  if (!res.ok) {
    const detail = body.error ?? body.message ?? res.statusText;
    throw new Error(`IIVO analysis failed (${res.status}): ${detail}`);
  }
  const answer = extractCouncilAnswer(body);
  if (!answer) {
    throw new Error("IIVO analysis returned an empty answer.");
  }
  return {
    answer,
    runId: body.runId,
    status: body.status ?? "complete",
    creditsCharged: body.usage?.creditsCharged,
  };
}

/** Fallback: create context item for Open in IIVO after Analyze Now failure. */
export function buildAnalysisFailureNotice(error: string): string {
  return `${error} You can try Open in IIVO instead.`;
}
