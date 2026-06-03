import { MODELS } from "../config/models.js";
import { DIRECT_ANSWER_ID } from "../config/routes.js";
import { runBenchmarkBaseline } from "../agents/routerAgent.js";
import { runCouncilFull } from "../orchestrator/runCouncil.js";
import { buildAgentCost } from "../pricing/calculateCost.js";
import { appendAuditEvent } from "../audit/auditLog.js";
import { estimateBenchmarkLabCredits } from "../usage/creditRules.js";
import { checkCreditsAvailable, InsufficientCreditsError } from "../usage/usageGuards.js";
import { deductCredits } from "../usage/usageStore.js";
import type { AgentCost } from "../types/index.js";
import type { ProviderResult } from "../providers/types.js";
import { saveBenchmarkRun } from "./benchmarkStore.js";
import { resolveLibraryPrompt } from "./criteriaMatch.js";
import {
  buildBenchmarkNarrative,
  determineWinner,
  isBenchmarkAiJudgeEnabled,
  scoreBenchmarkPair,
} from "./scoreBenchmark.js";
import type {
  BenchmarkCreditEstimate,
  BenchmarkMode,
  BenchmarkRunRecord,
  CreateBenchmarkInput,
} from "./types.js";

const BASELINE_MODEL = MODELS.openai.gpt4o;
const BASELINE_CREDITS = 1;

function agentCostFromProvider(result: ProviderResult): AgentCost {
  return buildAgentCost(
    result.provider,
    result.model,
    result.usage.inputTokens,
    result.usage.outputTokens,
    result.usage.totalTokens,
    result.usage.usageAvailable,
    0,
  );
}

function extractIivoAnswer(result: {
  outputs: { finalJudge?: string; strategy?: string };
  workflowId?: string;
}): string {
  if (result.workflowId === DIRECT_ANSWER_ID) {
    return result.outputs.strategy?.trim() || result.outputs.finalJudge?.trim() || "";
  }
  return result.outputs.finalJudge?.trim() || result.outputs.strategy?.trim() || "";
}

export function estimateBenchmarkRun(input: CreateBenchmarkInput): BenchmarkCreditEstimate {
  return estimateBenchmarkLabCredits({
    workflowId: input.workflowId,
    tokenMode: input.tokenMode,
    prompt: input.prompt,
    aiJudgeEnabled: isBenchmarkAiJudgeEnabled(),
  });
}

export async function createBenchmarkRun(
  input: CreateBenchmarkInput,
): Promise<BenchmarkRunRecord> {
  const prompt = input.prompt?.trim();
  if (!prompt) {
    throw new Error("prompt is required");
  }

  const libraryPrompt = resolveLibraryPrompt(input.promptLibraryId, prompt);
  const successCriteria = libraryPrompt?.successCriteria;
  const estimateWorkflow =
    libraryPrompt?.suggestedWorkflowId && libraryPrompt.suggestedWorkflowId !== "auto"
      ? libraryPrompt.suggestedWorkflowId
      : input.workflowId;

  const benchmarkMode: BenchmarkMode = input.benchmarkMode ?? "single_model_vs_iivo";
  const estimate = estimateBenchmarkRun({ ...input, workflowId: estimateWorkflow });
  const creditCheck = await checkCreditsAvailable(estimate.totalCredits);
  if (!creditCheck.ok) {
    throw new InsufficientCreditsError(estimate.totalCredits, creditCheck.currentCredits);
  }

  void appendAuditEvent({
    eventType: "benchmark_started",
    metadata: `${benchmarkMode} · est ${estimate.totalCredits} credits`,
  });

  try {
    await deductCredits({
      credits: BASELINE_CREDITS,
      metadata: "Benchmark Lab baseline",
    });
    await deductCredits({
      credits: estimate.benchmarkOverheadCredits,
      metadata: "Benchmark Lab overhead",
    });
    if (estimate.judgeCredits > 0) {
      await deductCredits({
        credits: estimate.judgeCredits,
        metadata: "Benchmark Lab AI judge",
      });
    }

    const baseline = await runBenchmarkBaseline(prompt);
    const baselineAnswer = baseline.content.trim();
    const baselineCost = agentCostFromProvider(baseline.cost);

    const iivoWorkflow =
      benchmarkMode === "direct_answer_vs_council"
        ? input.workflowId && input.workflowId !== "auto"
          ? input.workflowId
          : "product-decision"
        : input.workflowId ?? "auto";

    const iivoResult = await runCouncilFull({
      prompt,
      preset: input.preset ?? "none",
      tokenMode: input.tokenMode,
      workflowInput: iivoWorkflow,
      benchmark: false,
      memoryMode: input.memoryMode as import("../memory/types.js").MemoryMode | undefined,
      selectedMemoryIds: input.selectedMemoryIds,
    });

    const iivoAnswer = extractIivoAnswer(iivoResult);
    const iivoCost = iivoResult.costSummary
      ? ({
          provider: "mixed",
          model: "iivo-run",
          inputTokens: iivoResult.costSummary.totalInputTokens,
          outputTokens: iivoResult.costSummary.totalOutputTokens,
          totalTokens: iivoResult.costSummary.totalTokens,
          tokenCostUsd: iivoResult.costSummary.totalTokenCostUsd,
          requestFeeUsd: iivoResult.costSummary.totalRequestFeesUsd,
          estimatedCostUsd: iivoResult.costSummary.totalEstimatedCostUsd,
          usageAvailable: iivoResult.costSummary.usageUnavailableAgents.length === 0,
        } as AgentCost)
      : null;

    const baselineCostUsd = baselineCost.estimatedCostUsd ?? null;
    const iivoCostUsd = iivoResult.costSummary?.totalEstimatedCostUsd ?? null;
    const costDifferenceUsd =
      baselineCostUsd != null && iivoCostUsd != null
        ? Math.round((iivoCostUsd - baselineCostUsd) * 1_000_000) / 1_000_000
        : null;

    const scoresResult = scoreBenchmarkPair({
      prompt,
      baselineAnswer,
      iivoAnswer,
      baselineCostUsd,
      iivoCostUsd,
      iivoHasSources: Boolean(iivoResult.researchSources?.length),
      iivoHasMemory: Boolean(iivoResult.includedMemories?.length),
      successCriteria,
      expectedTerms: libraryPrompt?.expectedTerms,
      forbiddenTerms: libraryPrompt?.forbiddenTerms,
      requiredContextTerms: libraryPrompt?.requiredContextTerms,
      requireProductContextMin: libraryPrompt?.requireProductContextMin,
      detectUnsupportedLocation: libraryPrompt?.detectUnsupportedLocation,
      promptCategory: libraryPrompt?.category,
    });
    const scores = scoresResult.scores;
    const criteriaEvaluation = scoresResult.criteriaEvaluation;
    const scoringMeta = scoresResult.scoringMeta;

    const { winner, scoreDifference, scoreDifferencePercent } = determineWinner({
      scores,
      scoringMeta,
      baselineCostUsd,
      iivoCostUsd,
    });

    const narrative = buildBenchmarkNarrative({
      winner,
      scores,
      scoringMeta,
      iivoWorkflowId: iivoResult.workflowId ?? iivoWorkflow,
      benchmarkMode,
      costDifferenceUsd,
      scoreDifferencePercent,
      successCriteria,
      criteriaEvaluation,
    });

    const iivoCredits = iivoResult.usage?.creditsCharged ?? estimate.iivoCredits;

    const record = await saveBenchmarkRun({
      prompt,
      promptLibraryId: libraryPrompt?.id ?? input.promptLibraryId,
      promptTitle: libraryPrompt?.title,
      expectedBestRoute: libraryPrompt?.expectedBestRoute,
      successCriteria,
      benchmarkMode,
      baselineModel: BASELINE_MODEL,
      baselineAnswer,
      iivoWorkflowId: iivoResult.workflowId ?? iivoWorkflow,
      iivoAnswer,
      iivoRunId: iivoResult.runId,
      baselineCost,
      iivoCost,
      baselineCredits: BASELINE_CREDITS,
      iivoCredits,
      benchmarkOverheadCredits: estimate.benchmarkOverheadCredits + estimate.judgeCredits,
      totalCredits: BASELINE_CREDITS + estimate.benchmarkOverheadCredits + estimate.judgeCredits + iivoCredits,
      scores,
      criteriaEvaluation,
      scoringMeta,
      winner,
      scoreDifference,
      scoreDifferencePercent,
      costDifferenceUsd,
      summary: narrative.summary,
      whyWinner: narrative.whyWinner,
      iivoImprovements: narrative.iivoImprovements,
      iivoNotWorthExtra: narrative.iivoNotWorthExtra,
      routerNote: narrative.routerNote,
    });

    void appendAuditEvent({
      eventType: "benchmark_completed",
      runId: iivoResult.runId,
      metadata: `${record.id} · ${winner}`,
    });

    return record;
  } catch (err) {
    void appendAuditEvent({
      eventType: "benchmark_failed",
      metadata: err instanceof Error ? err.message : "Benchmark failed",
    });
    throw err;
  }
}
