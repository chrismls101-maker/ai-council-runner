import { v4 as uuidv4 } from "uuid";
import { runRouterAgent, runBenchmarkBaseline } from "../agents/routerAgent.js";
import { runDirectAnswerAgent } from "../agents/runDirectAnswer.js";
import { SUPPORT_REWRITE_INTENT } from "../agents/directAnswerHeuristic.js";
import { classifyPromptRoute } from "../agents/routingHeuristics.js";
import { promptExplicitlyReferencesDomain } from "../contextRelevance/globalContextGuard.js";
import { runWorkflowAgent } from "../agents/runWorkflowAgent.js";
import { DIRECT_ANSWER_ID, DIRECT_ANSWER_META } from "../config/routes.js";
import {
  defaultWorkflowForPreset,
  getAgentLabels,
  getWorkflow,
  normalizeWorkflowId,
  type WorkflowId,
} from "../config/workflows.js";
import {
  getMaxOutputTokens,
  normalizeTokenMode,
} from "../config/tokenModes.js";
import { saveRunHistory, type RunHistoryEntry } from "../history/runHistory.js";
import { createDraftDecisionRecordFromRun } from "../decisions/createFromRun.js";
import {
  formatOutcomeGuardTraceLines,
  formatRelevantPastOutcomesBlock,
} from "../decisions/relevantPastOutcomes.js";
import {
  buildAgentCost,
  buildRunCostSummary,
} from "../pricing/calculateCost.js";
import type { ProviderResult } from "../providers/types.js";
import {
  AGENT_ORDER,
  type AgentCost,
  type AgentId,
  type AgentMeta,
  type AgentOutputs,
  type CouncilRunResult,
  type ProgressEvent,
  type RunStatus,
} from "../types/index.js";
import { buildFullPrompt } from "../presets/index.js";
import {
  normalizeExternalContextPayload,
  prepareExternalContextForRun,
} from "../contextBridge/contextFormatter.js";
import { resolveScreenshotContextItems } from "../contextBridge/screenshotLoader.js";
import type { ExternalContextPayload } from "../contextBridge/types.js";
import { shouldUseVisionDirectAnswer } from "../agents/visionRouting.js";
import { runVisionAnswer } from "../agents/runVisionAnswer.js";
import { getImageVisionConfig } from "../config/vision.js";
import {
  buildConversationContextBlock,
  buildRouterPrompt,
  buildSlimDirectAnswerPrompt,
  logFollowUpResolution,
  resolveFollowUpSubject,
  resolveMemoryProjectHint,
  resolveRoutingPrompt,
  shouldForceDirectAnswerRoute,
  shouldOmitPresetContext,
  shouldStripMemoryForIivoIdentity,
  type ConversationContext,
} from "../conversation/followUpContext.js";
import { normalizeBusinessContext } from "../decisionQuality/formatContext.js";
import { inferDecisionObjective } from "../decisionQuality/inferObjective.js";
import {
  hasDecisionQualityContent,
  parseDecisionQuality,
} from "../decisionQuality/parseDecisionQuality.js";
import type { BusinessContext, DecisionQuality } from "../decisionQuality/types.js";
import {
  buildCouncilExecutionTrace,
  buildDirectAnswerExecutionTrace,
  createTraceEntry,
  type CouncilExecutionTrace,
} from "./executionTrace.js";
import { resolveMemoryContext } from "../memory/resolveMemories.js";
import type { VisionMemoryRunContext } from "../memory/visionMemoryGuard.js";
import type { MemoryMode } from "../memory/types.js";
import { appendAuditEvent } from "../audit/auditLog.js";
import {
  guardAndDeductCredits,
  finalizeRunCredits,
  markDirectAnswerFailedBeforeModel,
  markProviderCallsStarted,
} from "../usage/usageGuards.js";
import type { RunUsageSummary } from "../usage/types.js";
import { InsufficientCreditsError } from "../usage/types.js";
import {
  resolveResponsePlan,
  responsePlanToTrace,
} from "../responseContracts/resolveResponsePlan.js";
import { buildRunArtifact } from "../artifacts/buildRunArtifact.js";
import type { ArtifactTrace, IivoArtifact } from "../artifacts/artifactTypes.js";
import { shouldParseDecisionQuality } from "../responseContracts/councilCompression.js";
import { selectArtifactType } from "../artifacts/artifactSelector.js";
import {
  executionModeToTrace,
  resolveExecutionMode,
  type ExecutionMode,
} from "../executionMode/executionMode.js";
import { applyExecutionModeToRoute } from "../executionMode/applyExecutionMode.js";
import { LEGAL_PRIVACY_PROMPT } from "../executionMode/executionMode.js";
import type { ExecutionModeTrace } from "../executionMode/executionModeTrace.js";

type ProgressCallback = (event: ProgressEvent) => void;

const activeRuns = new Map<string, AbortController>();

export function stopRun(runId: string): boolean {
  const controller = activeRuns.get(runId);
  if (!controller) return false;
  controller.abort();
  return true;
}

function emptyOutputs(): AgentOutputs {
  return {
    strategy: "",
    critic: "",
    research: "",
    salesWriter: "",
    finalJudge: "",
  };
}

function initAgentMeta(labels: Record<AgentId, string>): Record<AgentId, AgentMeta> {
  return Object.fromEntries(
    AGENT_ORDER.map((id) => [
      id,
      { status: "pending" as const, displayName: labels[id] },
    ]),
  ) as Record<AgentId, AgentMeta>;
}

function costFromProviderResult(result: ProviderResult): AgentCost {
  return buildAgentCost(
    result.provider,
    result.model,
    result.usage.inputTokens,
    result.usage.outputTokens,
    result.usage.totalTokens,
    result.usage.usageAvailable,
    result.researchMeta?.searchRequestCount,
  );
}

function determineStatus(
  agentMeta: Record<AgentId, AgentMeta>,
  stopped: boolean,
): RunStatus {
  if (stopped) return "partial";
  const hasError = AGENT_ORDER.some((id) => agentMeta[id].status === "error");
  const allComplete = AGENT_ORDER.every(
    (id) => agentMeta[id].status === "complete",
  );
  if (allComplete) return "complete";
  if (hasError) return "partial";
  return "error";
}

function determineDirectAnswerStatus(
  agentMeta: Record<AgentId, AgentMeta>,
  stopped: boolean,
): RunStatus {
  if (stopped) return "partial";
  if (agentMeta.strategy.status === "complete") return "complete";
  if (agentMeta.strategy.status === "error") return "error";
  return "partial";
}

async function runAgentWithRetry(
  agentId: AgentId,
  fn: (signal: AbortSignal) => Promise<ProviderResult>,
  signal: AbortSignal,
  onProgress: ProgressCallback,
  runId: string,
  displayName: string,
): Promise<{
  output: string;
  meta: AgentMeta;
  cost: AgentCost | null;
  citations?: string[];
  researchAgentMeta?: CouncilRunResult["researchAgentMeta"];
}> {
  const startedAt = new Date().toISOString();
  onProgress({ type: "agent-start", runId, agent: agentId, startedAt });

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    if (signal.aborted) {
      throw new DOMException("Run stopped by user.", "AbortError");
    }
    try {
      const result = await fn(signal);
      const completedAt = new Date().toISOString();
      const durationMs =
        new Date(completedAt).getTime() - new Date(startedAt).getTime();
      const cost = costFromProviderResult(result);

      const meta: AgentMeta = {
        status: "complete",
        startedAt,
        completedAt,
        durationMs,
        displayName,
      };

      onProgress({
        type: "agent-complete",
        runId,
        agent: agentId,
        output: result.content,
        durationMs,
        startedAt,
        completedAt,
        cost,
        researchSources: result.citations,
        researchAgentMeta: result.researchMeta,
      });

      return {
        output: result.content,
        meta,
        cost,
        citations: result.citations,
        researchAgentMeta: result.researchMeta,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (signal.aborted) throw lastError;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 1500));
    }
  }

  const message =
    lastError?.message ?? `Unknown error running ${agentId} agent.`;
  const completedAt = new Date().toISOString();
  const durationMs =
    new Date(completedAt).getTime() - new Date(startedAt).getTime();

  const meta: AgentMeta = {
    status: "error",
    startedAt,
    completedAt,
    durationMs,
    error: message,
    displayName,
  };

  onProgress({
    type: "agent-error",
    runId,
    agent: agentId,
    error: message,
    durationMs,
    startedAt,
    completedAt,
  });

  return { output: "", meta, cost: null };
}

export interface RunCouncilOptions {
  prompt: string;
  preset: string;
  tokenMode?: unknown;
  workflowInput?: string;
  executionMode?: ExecutionMode;
  executionModeConfirmationAccepted?: boolean;
  executionModeConfirmationShown?: boolean;
  inBuilderWorkspace?: boolean;
  benchmark?: boolean;
  decisionObjective?: string;
  businessContext?: Partial<BusinessContext>;
  memoryMode?: MemoryMode;
  selectedMemoryIds?: string[];
  conversationContext?: ConversationContext;
  externalContext?: ExternalContextPayload;
  onProgress?: ProgressCallback;
}

export async function runCouncil(
  prompt: string,
  preset: string,
  tokenModeInput?: unknown,
  onProgress?: ProgressCallback,
  workflowInput?: string,
  benchmark?: boolean,
): Promise<CouncilRunResult> {
  return runCouncilFull({
    prompt,
    preset,
    tokenMode: tokenModeInput,
    workflowInput,
    benchmark,
    onProgress,
  });
}

export async function runCouncilFull(
  options: RunCouncilOptions,
): Promise<CouncilRunResult> {
  const {
    prompt,
    preset,
    tokenMode: tokenModeInput,
    workflowInput,
    executionMode: executionModeInput = "auto",
    executionModeConfirmationAccepted,
    executionModeConfirmationShown,
    inBuilderWorkspace = false,
    benchmark = false,
    decisionObjective: decisionObjectiveInput,
    businessContext: businessContextInput,
    memoryMode = "auto",
    selectedMemoryIds,
    conversationContext,
    externalContext: externalContextInput,
    onProgress,
  } = options;

  const businessContext = normalizeBusinessContext(businessContextInput);
  const routingPrompt = resolveRoutingPrompt(prompt, conversationContext);
  const responsePlan = resolveResponsePlan(routingPrompt);
  const artifactSelection = selectArtifactType({
    taskIntent: responsePlan.intent,
    responseContract: responsePlan.contract,
    prompt: routingPrompt,
  });

  const normalizedExternal = normalizeExternalContextPayload(externalContextInput);
  const preparedExternal = normalizedExternal
    ? prepareExternalContextForRun(routingPrompt, normalizedExternal.items)
    : null;
  const externalContextBlock = preparedExternal?.block;
  const externalRouterHint = preparedExternal?.routerHint;
  const externalContextTrace = preparedExternal?.trace;

  const screenshotContextItems = normalizedExternal
    ? await resolveScreenshotContextItems(normalizedExternal.items)
    : [];
  const wantsVisionAnalysis = shouldUseVisionDirectAnswer(
    routingPrompt,
    screenshotContextItems,
  );
  const visionConfig = getImageVisionConfig();
  const useVisionDirectAnswer =
    wantsVisionAnalysis && screenshotContextItems.length > 0 && visionConfig.configured;

  const executionModeDecision = resolveExecutionMode({
    userSelectedMode: executionModeInput,
    taskIntent: responsePlan.intent,
    responseContract: responsePlan.contract,
    artifactSelection: {
      type: artifactSelection.type,
      renderMode: artifactSelection.renderMode,
    },
    prompt: routingPrompt,
    wantsVision: useVisionDirectAnswer,
    wantsResearch: responsePlan.lane.lane === "research",
    confirmationAccepted: executionModeConfirmationAccepted,
    inBuilderWorkspace,
  });

  let executionModeTrace: ExecutionModeTrace = executionModeToTrace(
    executionModeDecision,
    {
      confirmationShown: executionModeConfirmationShown,
      confirmationAccepted: executionModeConfirmationAccepted,
    },
  );

  const buildVisionMemoryRunContext = (
    promptText: string,
    projectHint?: string,
  ): VisionMemoryRunContext | null => {
    if (!wantsVisionAnalysis || screenshotContextItems.length === 0) return null;
    const primary = screenshotContextItems[0]!;
    return {
      prompt: promptText,
      screenshotTitle: primary.pageTitle ?? primary.title,
      sourceUrl: primary.sourceUrl,
      contextTags: primary.tags,
      projectNameHint: projectHint,
    };
  };

  const decisionObjective =
    decisionObjectiveInput?.trim() || inferDecisionObjective(routingPrompt);
  const objectiveWasInferred = !decisionObjectiveInput?.trim();

  let omitPreset = false;
  const projectNameHint = resolveMemoryProjectHint({
    prompt,
    preset,
    businessContextName: businessContext?.name,
    conversationContext,
    omitPreset: false,
  });

  const memoryContextInitial = await resolveMemoryContext({
    memoryMode,
    selectedMemoryIds,
    prompt: routingPrompt,
    preset,
    workflowId: workflowInput,
    projectName: projectNameHint,
    includePresetInKeywords: true,
    visionRun: buildVisionMemoryRunContext(routingPrompt, projectNameHint),
  });

  const tokenMode = normalizeTokenMode(tokenModeInput);
  const runId = uuidv4();
  const controller = new AbortController();
  activeRuns.set(runId, controller);

  const emit: ProgressCallback = (event) => onProgress?.(event);
  emit({ type: "run-start", runId });
  void appendAuditEvent({
    eventType: "run_started",
    runId,
    metadata: `workflow=${workflowInput ?? "auto"}`,
  });

  const basePromptOptions = {
    decisionObjective,
    businessContext,
  };

  const conversationBlock = buildConversationContextBlock(prompt, conversationContext);

  let memoryContext = memoryContextInitial;

  const fullPromptInitial = buildFullPrompt(preset, prompt, {
    ...basePromptOptions,
    memoryBlock: memoryContext.memoryBlock,
    conversationBlock,
    externalContextBlock,
  });

  let fullPrompt = fullPromptInitial;

  const entitySearchPrompt = buildFullPrompt(preset, prompt, {
    ...basePromptOptions,
    conversationBlock,
    externalContextBlock,
  });
  let workflowId: WorkflowId =
    workflowInput && workflowInput !== "auto"
      ? normalizeWorkflowId(workflowInput)
      : defaultWorkflowForPreset(preset);
  let routeId: string = workflowId;

  let routerDecision: CouncilRunResult["routerDecision"];

  const forceDirectAnswer = shouldForceDirectAnswerRoute(prompt, conversationContext);

  if (workflowInput === "auto") {
    routerDecision = await runRouterAgent(
      buildRouterPrompt(prompt, conversationContext, externalRouterHint),
      controller.signal,
      { effectivePrompt: routingPrompt },
    );
    routeId = routerDecision.selectedWorkflow;
    const heuristicOverride = classifyPromptRoute(routingPrompt);
    if (
      heuristicOverride?.selectedWorkflow === DIRECT_ANSWER_ID &&
      routeId !== DIRECT_ANSWER_ID
    ) {
      routeId = DIRECT_ANSWER_ID;
      routerDecision = {
        selectedWorkflow: DIRECT_ANSWER_ID,
        reason: heuristicOverride.reason,
        confidence: heuristicOverride.confidence,
      };
    }
    if (
      responsePlan.lane.lane === "fast_direct" &&
      routeId !== DIRECT_ANSWER_ID &&
      !useVisionDirectAnswer
    ) {
      routeId = DIRECT_ANSWER_ID;
      routerDecision = {
        selectedWorkflow: DIRECT_ANSWER_ID,
        reason: responsePlan.lane.reason,
        confidence: 95,
      };
    } else if (
      executionModeDecision.effectiveMode === "council" &&
      responsePlan.lane.preferredRoute === "product-decision" &&
      routeId !== "product-decision" &&
      responsePlan.intent.intent === "decision"
    ) {
      routeId = "product-decision";
      workflowId = "product-decision";
      routerDecision = {
        selectedWorkflow: "product-decision",
        reason: responsePlan.lane.reason,
        confidence: 90,
      };
    }
    if (useVisionDirectAnswer) {
      routeId = DIRECT_ANSWER_ID;
      routerDecision = {
        selectedWorkflow: DIRECT_ANSWER_ID,
        reason: "Screenshot visual analysis — vision direct answer.",
        confidence: 95,
      };
    } else if (routeId !== DIRECT_ANSWER_ID) {
      workflowId = routeId as WorkflowId;
    }
    emit({ type: "router-complete", runId, routerDecision });
  } else if (forceDirectAnswer || useVisionDirectAnswer) {
    routeId = DIRECT_ANSWER_ID;
    routerDecision = {
      selectedWorkflow: DIRECT_ANSWER_ID,
      reason: "IIVO identity follow-up — direct answer.",
      confidence: 95,
    };
    emit({ type: "router-complete", runId, routerDecision });
  }

  const appliedRoute = applyExecutionModeToRoute({
    decision: executionModeDecision,
    routeId,
    routerDecision,
    useVisionDirectAnswer,
    preferredCouncilRoute:
      responsePlan.lane.preferredRoute === "sales-attack" ||
      responsePlan.lane.preferredRoute === "product-decision"
        ? responsePlan.lane.preferredRoute
        : undefined,
  });
  routeId = appliedRoute.routeId;
  routerDecision = appliedRoute.routerDecision ?? routerDecision;
  if (routeId !== DIRECT_ANSWER_ID) {
    workflowId = routeId as WorkflowId;
  }

  if (
    executionModeDecision.effectiveMode === "quick" &&
    SUPPORT_REWRITE_INTENT.test(routingPrompt)
  ) {
    routeId = DIRECT_ANSWER_ID;
    routerDecision = {
      selectedWorkflow: DIRECT_ANSWER_ID,
      reason: `Execution Mode: Quick — ${executionModeDecision.reason}`,
      confidence: 95,
    };
  }

  if (LEGAL_PRIVACY_PROMPT.test(routingPrompt)) {
    routeId = DIRECT_ANSWER_ID;
    routerDecision = {
      selectedWorkflow: DIRECT_ANSWER_ID,
      reason: "Legal/privacy advisory — Quick direct answer (never Sales Attack).",
      confidence: 96,
    };
  }

  const isDirectAnswer = routeId === DIRECT_ANSWER_ID;
  omitPreset = shouldOmitPresetContext({
    prompt,
    preset,
    isDirectAnswer,
    conversationContext,
  });

  const domainContextBlocked =
    preset === "none" && !promptExplicitlyReferencesDomain(routingPrompt);

  const stripMemory =
    shouldStripMemoryForIivoIdentity({
      prompt,
      conversationContext,
      omitPreset,
    }) ||
    (isDirectAnswer && SUPPORT_REWRITE_INTENT.test(prompt)) ||
    domainContextBlocked;

  logFollowUpResolution({
    currentPrompt: prompt,
    conversationContext,
    resolvedPrompt: routingPrompt,
    topic: resolveFollowUpSubject(prompt, conversationContext),
    omitPreset,
    memoryMode,
    presetExcluded: omitPreset,
    routeId,
  });

  const effectiveProjectHint = resolveMemoryProjectHint({
    prompt,
    preset,
    businessContextName: businessContext?.name,
    conversationContext,
    omitPreset,
  });

  if (
    omitPreset ||
    stripMemory ||
    effectiveProjectHint !== projectNameHint ||
    routingPrompt !== prompt
  ) {
    memoryContext = await resolveMemoryContext({
      memoryMode,
      selectedMemoryIds,
      prompt: routingPrompt,
      preset,
      workflowId: workflowInput,
      projectName: effectiveProjectHint,
      includePresetInKeywords: !omitPreset,
      visionRun: buildVisionMemoryRunContext(routingPrompt, effectiveProjectHint),
    });
  }

  const memoryBlockForPrompt = stripMemory ? undefined : memoryContext.memoryBlock;

  fullPrompt = buildFullPrompt(preset, prompt, {
    ...basePromptOptions,
    memoryBlock: memoryBlockForPrompt,
    conversationBlock,
    externalContextBlock,
    omitPreset,
  });
  const workflow = isDirectAnswer ? null : getWorkflow(workflowId);
  const agentLabels = isDirectAnswer
    ? ({
        strategy: "IIVO",
        critic: "Critic",
        research: "Research Scout",
        salesWriter: "Sales Writer",
        finalJudge: "Final Judge",
      } as Record<AgentId, string>)
    : getAgentLabels(workflowId);
  const workflowName = isDirectAnswer ? DIRECT_ANSWER_META.name : workflow!.name;

  const traceWarnings: string[] = [];
  if (preparedExternal?.truncationNote) {
    traceWarnings.push(preparedExternal.truncationNote);
  }

  let includedPastOutcomeIds: string[] = [];

  const skipPastOutcomes =
    domainContextBlocked &&
    !/\b(last time|prior outcome|past outcome|what did i decide|outcome last time)\b/i.test(
      routingPrompt,
    );

  if (!isDirectAnswer && memoryMode !== "off" && !skipPastOutcomes) {
    const pastOutcomes = await formatRelevantPastOutcomesBlock({
      prompt: routingPrompt,
      workflowId: routeId,
      projectName: effectiveProjectHint,
      excludeRunId: runId,
      route: routeId,
    });
    includedPastOutcomeIds = pastOutcomes.recordIds;
    for (const line of formatOutcomeGuardTraceLines(pastOutcomes.exclusions)) {
      traceWarnings.push(line);
    }
    if (pastOutcomes.recordIds.length > 0) {
      traceWarnings.push(
        `Past outcome included: matched explicit project/domain/outcome reference (${pastOutcomes.recordIds.length} record(s)).`,
      );
    }
    const combinedContext = [memoryContext.memoryBlock, pastOutcomes.block]
      .filter(Boolean)
      .join("\n\n");
    fullPrompt = buildFullPrompt(preset, prompt, {
      ...basePromptOptions,
      memoryBlock: combinedContext || undefined,
      conversationBlock,
      externalContextBlock,
      omitPreset,
    });
  } else if (!isDirectAnswer && memoryMode === "off") {
    /* no past outcomes when memory off */
  } else if (isDirectAnswer) {
    traceWarnings.push("Past outcome excluded: direct answer route — not injected.");
  } else if (skipPastOutcomes) {
    traceWarnings.push(
      "Past outcome excluded: unrelated domain — not relevant to current prompt.",
    );
  }

  let benchmarkAnswer: string | undefined;
  let benchmarkCost: AgentCost | undefined;

  if (benchmark) {
    try {
      const baseline = await runBenchmarkBaseline(fullPrompt, controller.signal);
      benchmarkAnswer = baseline.content;
      benchmarkCost = costFromProviderResult(baseline.cost);
      emit({
        type: "benchmark-complete",
        runId,
        benchmarkAnswer,
        benchmarkCost,
      });
    } catch {
      /* benchmark failure must not break council run */
    }
  }

  const outputs = emptyOutputs();
  const agentMeta = initAgentMeta(agentLabels);
  const agentCosts: Partial<Record<AgentId, AgentCost>> = {};
  const errors: CouncilRunResult["errors"] = [];
  let researchSources: string[] | undefined;
  let researchAgentMeta: CouncilRunResult["researchAgentMeta"];
  let stopped = false;
  let executionTrace: CouncilExecutionTrace | undefined;
  const traceEntries: CouncilExecutionTrace["agents"] = [];
  let decisionQuality: DecisionQuality | undefined;
  let decisionRecord: CouncilRunResult["decisionRecord"];
  let runUsage: RunUsageSummary | undefined;

  let runArtifact: IivoArtifact | undefined;
  let runArtifactTrace: ArtifactTrace | undefined;
  const responseContractTrace = responsePlanToTrace(responsePlan);

  const buildResult = async (status: RunStatus): Promise<CouncilRunResult> => {
    const costSummary = buildRunCostSummary(agentCosts);
    const answerForArtifact =
      outputs.finalJudge?.trim() || outputs.strategy?.trim() || "";
    if (!runArtifact && answerForArtifact) {
      const built = await buildRunArtifact(routingPrompt, answerForArtifact, responsePlan);
      runArtifact = built.artifact ?? undefined;
      runArtifactTrace = built.trace ?? undefined;
    }
    return {
      runId,
      status,
      outputs,
      errors,
      agentMeta,
      agentCosts,
      costSummary,
      tokenMode,
      workflowId: routeId,
      workflowName,
      agentLabels,
      routerDecision,
      benchmarkEnabled: benchmark,
      benchmarkAnswer,
      benchmarkCost,
      researchSources,
      researchAgentMeta,
      executionTrace,
      decisionObjective,
      objectiveInferred: objectiveWasInferred,
      businessContext,
      decisionQuality,
      memoryMode,
      includedMemoryIds: memoryContext.includedMemoryIds,
      includedMemories: memoryContext.includedMemories,
      decisionRecord,
      includedPastOutcomeIds:
        includedPastOutcomeIds.length > 0 ? includedPastOutcomeIds : undefined,
      includedPastOutcomeCount: includedPastOutcomeIds.length,
      usage: runUsage,
      artifact: runArtifact,
    };
  };

  const emitComplete = async (status: RunStatus) => {
    let finalResult = await buildResult(status);

    if (executionTrace && runArtifactTrace) {
      executionTrace = { ...executionTrace, artifact: runArtifactTrace };
      finalResult = { ...finalResult, executionTrace };
    }

    const usageFinal = await finalizeRunCredits({
      runId,
      status:
        status === "complete"
          ? "complete"
          : status === "error"
            ? "error"
            : "partial",
      routeId,
      tokenMode,
      estimatedProviderCostUsd:
        finalResult.costSummary?.totalEstimatedCostUsd ?? null,
    });
    if (usageFinal) {
      runUsage = usageFinal;
      finalResult = { ...finalResult, usage: usageFinal };
    }

    void appendAuditEvent({
      eventType: status === "error" ? "run_failed" : "run_completed",
      runId,
      metadata: `${routeId} · ${status}`,
    });

    const historyEntry: RunHistoryEntry = {
      ...finalResult,
      timestamp: new Date().toISOString(),
      prompt,
      preset,
      workflowId: routeId,
      workflowName,
    };
    try {
      await saveRunHistory(historyEntry);
    } catch {
      /* history save must not break run */
    }

    if (!isDirectAnswer && status === "complete") {
      try {
        const draft = await createDraftDecisionRecordFromRun(historyEntry);
        if (draft) {
          decisionRecord = draft;
          finalResult = { ...finalResult, decisionRecord: draft };
          void appendAuditEvent({
            eventType: "decision_record_created",
            runId,
            metadata: draft.id,
          });
        }
      } catch {
        /* decision record must not break run */
      }
    }

    emit({ type: "run-complete", runId, result: finalResult });
    return finalResult;
  };

  try {
    runUsage = await guardAndDeductCredits({
      runId,
      workflowId: workflowInput,
      routeId,
      tokenMode,
      benchmarkEnabled: benchmark,
      prompt: routingPrompt,
      visionScreenshotAnalysis: useVisionDirectAnswer,
    });

    if (isDirectAnswer) {
      const directPrompt =
        omitPreset && stripMemory
          ? buildSlimDirectAnswerPrompt({
              routingPrompt,
              conversationBlock,
              externalContextBlock,
            })
          : fullPrompt;

      markProviderCallsStarted(runId);

      if (useVisionDirectAnswer) {
        const visionResult = await runVisionAnswer({
          prompt: routingPrompt,
          contextItem: screenshotContextItems[0]!,
          tokenMode,
          signal: controller.signal,
        });

        outputs.strategy = visionResult.output;
        outputs.finalJudge = visionResult.output;
        agentMeta.strategy = visionResult.meta;
        if (visionResult.cost) agentCosts.strategy = visionResult.cost;

        if (visionResult.meta.status === "error") {
          if (!visionResult.output?.trim()) {
            markDirectAnswerFailedBeforeModel(runId);
          }
          errors.push({
            agent: "strategy",
            message: visionResult.meta.error ?? "Vision analysis failed.",
          });
        }

        executionTrace = buildDirectAnswerExecutionTrace({
          routerDecision,
          meta: visionResult.meta,
          outputLength: visionResult.output.length,
          provider: visionResult.cost?.provider,
          model: visionResult.cost?.model,
          reason:
            routerDecision?.reason ??
            "Screenshot attached — analyzing visible content with image-capable model.",
          externalContext: externalContextTrace,
          visionAnalysis: visionResult.visionTrace,
          visionMemoryGuard: memoryContext.visionMemoryGuard,
          responseContract: responseContractTrace,
          executionMode: executionModeTrace,
        });

        return emitComplete(determineDirectAnswerStatus(agentMeta, stopped));
      }

      const directResult = await runDirectAnswerAgent(
        directPrompt,
        tokenMode,
        controller.signal,
        emit,
        runId,
        { identityPrompt: routingPrompt, responsePlan },
      );

      outputs.strategy = directResult.output;
      outputs.finalJudge = directResult.output;
      agentMeta.strategy = directResult.meta;
      if (directResult.cost) agentCosts.strategy = directResult.cost;

      if (directResult.meta.status === "error") {
        if (!directResult.output?.trim()) {
          markDirectAnswerFailedBeforeModel(runId);
        }
        errors.push({
          agent: "strategy",
          message: directResult.meta.error ?? "Direct answer failed.",
        });
      }

      executionTrace = buildDirectAnswerExecutionTrace({
        routerDecision,
        meta: directResult.meta,
        outputLength: directResult.output.length,
        provider: directResult.cost?.provider,
        model: directResult.cost?.model,
        reason: routerDecision?.reason,
        externalContext: externalContextTrace,
        responseContract: responseContractTrace,
        executionMode: executionModeTrace,
      });

      return emitComplete(determineDirectAnswerStatus(agentMeta, stopped));
    }

    // Full council: agents run strictly in sequence (await per agent).
    markProviderCallsStarted(runId);
    // Each agent receives outputs accumulated from all prior agents via runWorkflowAgent.
    for (const agentId of AGENT_ORDER) {
      if (controller.signal.aborted) {
        stopped = true;
        throw new DOMException("Run stopped by user.", "AbortError");
      }

      const agentResult = await runAgentWithRetry(
        agentId,
        (signal) =>
          runWorkflowAgent(
            agentId,
            workflow!,
            fullPrompt,
            outputs,
            getMaxOutputTokens(agentId, tokenMode),
            researchSources,
            signal,
            entitySearchPrompt,
            responsePlan,
          ),
        controller.signal,
        emit,
        runId,
        agentLabels[agentId],
      );

      const { entry, warnings } = createTraceEntry(
        agentId,
        agentLabels,
        outputs,
        agentResult.meta,
        agentResult.output.length,
        agentResult.cost?.provider,
        agentResult.cost?.model,
      );
      traceEntries.push(entry);
      traceWarnings.push(...warnings);

      outputs[agentId] = agentResult.output;
      agentMeta[agentId] = agentResult.meta;
      if (agentResult.cost) agentCosts[agentId] = agentResult.cost;
      if (agentResult.citations?.length) {
        researchSources = agentResult.citations;
      }
      if (agentResult.researchAgentMeta) {
        researchAgentMeta = agentResult.researchAgentMeta;
      }

      if (agentResult.meta.status === "error") {
        errors.push({ agent: agentId, message: agentResult.meta.error! });
        executionTrace = buildCouncilExecutionTrace({
          routerDecision,
          entries: traceEntries,
          warnings: traceWarnings,
          agentLabels,
          includedPastOutcomeIds,
          externalContext: externalContextTrace,
          responseContract: responseContractTrace,
          executionMode: executionModeTrace,
        });
        if (agentId === "strategy") {
          return emitComplete(determineStatus(agentMeta, stopped));
        }
      }
    }

    executionTrace = buildCouncilExecutionTrace({
      routerDecision,
      entries: traceEntries,
      warnings: traceWarnings,
      agentLabels,
      includedPastOutcomeIds,
      externalContext: externalContextTrace,
      responseContract: responseContractTrace,
      executionMode: executionModeTrace,
    });

    if (
      outputs.finalJudge?.trim() &&
      shouldParseDecisionQuality(responsePlan.lane.lane, responsePlan.contract)
    ) {
      const parsed = parseDecisionQuality(outputs.finalJudge);
      if (hasDecisionQualityContent(parsed)) {
        decisionQuality = parsed;
      }
    }

    return emitComplete(determineStatus(agentMeta, stopped));
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      throw err;
    }
    if (err instanceof DOMException && err.name === "AbortError") {
      stopped = true;
      emit({ type: "run-stopped", runId });
    }
    if (!executionTrace && traceEntries.length > 0) {
      executionTrace = buildCouncilExecutionTrace({
        routerDecision,
        entries: traceEntries,
        warnings: traceWarnings,
        agentLabels,
        includedPastOutcomeIds,
        externalContext: externalContextTrace,
      });
    }
    return emitComplete(determineStatus(agentMeta, stopped));
  } finally {
    activeRuns.delete(runId);
  }
}

export function validateApiKeys(): string[] {
  const missing: string[] = [];
  if (!process.env.OPENAI_API_KEY?.trim()) missing.push("OPENAI_API_KEY");
  if (!process.env.ANTHROPIC_API_KEY?.trim()) missing.push("ANTHROPIC_API_KEY");
  if (!process.env.PERPLEXITY_API_KEY?.trim())
    missing.push("PERPLEXITY_API_KEY");
  return missing;
}
