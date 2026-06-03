import { AGENT_MODEL_CONFIG } from "../config/models.js";
import type { RouterDecision } from "../agents/routerAgent.js";
import type { ExternalContextRunTrace } from "../contextBridge/types.js";
import type { VisionAnalysisTrace } from "../agents/runVisionAnswer.js";
import type { VisionMemoryGuardTrace } from "../memory/visionMemoryGuard.js";
import type { ResponsePlanTrace } from "../responseContracts/resolveResponsePlan.js";
import type { ArtifactTrace } from "../artifacts/artifactTypes.js";
import type { ExecutionModeTrace } from "../executionMode/executionModeTrace.js";
import {
  AGENT_ORDER,
  type AgentId,
  type AgentMeta,
  type AgentOutputs,
  type AgentStatus,
} from "../types/index.js";

export type { ExternalContextRunTrace };

export const AGENT_INPUT_DEPENDENCIES: Record<AgentId, string[]> = {
  strategy: ["originalPrompt"],
  critic: ["originalPrompt", "strategy"],
  research: ["originalPrompt", "strategy", "critic"],
  salesWriter: ["originalPrompt", "strategy", "critic", "research"],
  finalJudge: ["originalPrompt", "strategy", "critic", "research", "salesWriter"],
};

const PRIOR_AGENT_SLOTS: Record<AgentId, AgentId[]> = {
  strategy: [],
  critic: ["strategy"],
  research: ["strategy", "critic"],
  salesWriter: ["strategy", "critic", "research"],
  finalJudge: ["strategy", "critic", "research", "salesWriter"],
};

export interface AgentExecutionTraceEntry {
  agent: AgentId;
  agentName: string;
  provider: string;
  model: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  inputDependencies: string[];
  receivedPreviousOutputs: boolean;
  priorOutputNames: string[];
  outputLength: number;
  status: AgentStatus;
  warning?: string;
}

export interface CouncilExecutionTrace {
  mode: "council" | "direct_answer";
  agentCount: number;
  sequential: boolean;
  sequentialChainVerified?: boolean;
  sequentialChainLabel?: string;
  routerDecision?: RouterDecision;
  directAnswerReason?: string;
  warnings: string[];
  agents: AgentExecutionTraceEntry[];
  includedPastOutcomeIds?: string[];
  includedPastOutcomeCount?: number;
  externalContext?: ExternalContextRunTrace;
  visionAnalysis?: VisionAnalysisTrace;
  visionMemoryGuard?: VisionMemoryGuardTrace;
  responseContract?: ResponsePlanTrace;
  artifact?: ArtifactTrace;
  executionMode?: ExecutionModeTrace;
}

export interface DependencyCheck {
  receivedPreviousOutputs: boolean;
  priorOutputNames: string[];
  warnings: string[];
}

function formatMissingOutputWarning(
  agentName: string,
  missingLabels: string[],
): string {
  if (missingLabels.length === 0) return "";
  if (missingLabels.length === 1) {
    return `${agentName} ran without ${missingLabels[0]} output.`;
  }
  const copy = [...missingLabels];
  const last = copy.pop()!;
  return `${agentName} ran without ${copy.join(", ")} and ${last} output.`;
}

export function validateAgentDependencies(
  agentId: AgentId,
  outputs: AgentOutputs,
  labels: Record<AgentId, string>,
): DependencyCheck {
  const priorSlots = PRIOR_AGENT_SLOTS[agentId];
  const priorOutputNames: string[] = [];
  const missingLabels: string[] = [];

  for (const slot of priorSlots) {
    const label = labels[slot];
    if (outputs[slot]?.trim()) {
      priorOutputNames.push(label);
    } else {
      missingLabels.push(label);
    }
  }

  const receivedPreviousOutputs = missingLabels.length === 0;
  const agentName = labels[agentId];
  const warnings =
    receivedPreviousOutputs || agentId === "strategy"
      ? []
      : [formatMissingOutputWarning(agentName, missingLabels)];

  return { receivedPreviousOutputs, priorOutputNames, warnings };
}

export function buildSequentialChainLabel(
  labels: Record<AgentId, string>,
): string {
  return AGENT_ORDER.map((id) => labels[id]).join(" → ");
}

export function buildCouncilExecutionTrace(options: {
  routerDecision?: RouterDecision;
  entries: AgentExecutionTraceEntry[];
  warnings: string[];
  agentLabels: Record<AgentId, string>;
  includedPastOutcomeIds?: string[];
  externalContext?: ExternalContextRunTrace;
  responseContract?: ResponsePlanTrace;
  artifact?: ArtifactTrace;
  executionMode?: ExecutionModeTrace;
}): CouncilExecutionTrace {
  const {
    routerDecision,
    entries,
    warnings,
    agentLabels,
    includedPastOutcomeIds,
    externalContext,
    responseContract,
    artifact,
    executionMode,
  } = options;
  const allComplete =
    entries.length === AGENT_ORDER.length &&
    entries.every((e) => e.status === "complete");
  const allDependenciesMet = entries.every(
    (e) => e.receivedPreviousOutputs,
  );
  const sequentialChainVerified = allComplete && allDependenciesMet;

  return {
    mode: "council",
    agentCount: entries.length,
    sequential: true,
    sequentialChainVerified,
    sequentialChainLabel: sequentialChainVerified
      ? `Sequential chain verified: ${buildSequentialChainLabel(agentLabels)}`
      : undefined,
    routerDecision,
    warnings: [...new Set(warnings.filter(Boolean))],
    agents: entries,
    includedPastOutcomeIds:
      includedPastOutcomeIds && includedPastOutcomeIds.length > 0
        ? includedPastOutcomeIds
        : undefined,
    includedPastOutcomeCount: includedPastOutcomeIds?.length ?? 0,
    externalContext,
    responseContract,
    artifact,
    executionMode,
  };
}

export function buildDirectAnswerExecutionTrace(options: {
  routerDecision?: RouterDecision;
  meta: AgentMeta;
  outputLength: number;
  provider?: string;
  model?: string;
  reason?: string;
  externalContext?: ExternalContextRunTrace;
  visionAnalysis?: VisionAnalysisTrace;
  visionMemoryGuard?: VisionMemoryGuardTrace;
  responseContract?: ResponsePlanTrace;
  artifact?: ArtifactTrace;
  executionMode?: ExecutionModeTrace;
}): CouncilExecutionTrace {
  const {
    routerDecision,
    meta,
    outputLength,
    provider,
    model,
    reason,
    externalContext,
    visionAnalysis,
    visionMemoryGuard,
    responseContract,
    artifact,
    executionMode,
  } = options;
  const config = AGENT_MODEL_CONFIG.strategy;

  return {
    mode: "direct_answer",
    agentCount: 1,
    sequential: false,
    routerDecision,
    directAnswerReason:
      reason ??
      routerDecision?.reason ??
      "Simple prompt — no council required.",
    warnings: [],
    agents: [
      {
        agent: "strategy",
        agentName: meta.displayName ?? "IIVO",
        provider: provider ?? config.provider,
        model: model ?? config.model,
        startedAt: meta.startedAt ?? new Date().toISOString(),
        completedAt: meta.completedAt,
        durationMs: meta.durationMs,
        inputDependencies: ["originalPrompt"],
        receivedPreviousOutputs: false,
        priorOutputNames: [],
        outputLength,
        status: meta.status,
        warning: meta.error,
      },
    ],
    externalContext,
    visionAnalysis,
    visionMemoryGuard,
    responseContract,
    artifact,
    executionMode,
  };
}

export function createTraceEntry(
  agentId: AgentId,
  labels: Record<AgentId, string>,
  outputs: AgentOutputs,
  meta: AgentMeta,
  outputLength: number,
  provider?: string,
  model?: string,
): { entry: AgentExecutionTraceEntry; warnings: string[] } {
  const depCheck = validateAgentDependencies(agentId, outputs, labels);
  const config = AGENT_MODEL_CONFIG[agentId];

  return {
    entry: {
      agent: agentId,
      agentName: labels[agentId],
      provider: provider ?? config.provider,
      model: model ?? config.model,
      startedAt: meta.startedAt ?? new Date().toISOString(),
      completedAt: meta.completedAt,
      durationMs: meta.durationMs,
      inputDependencies: [...AGENT_INPUT_DEPENDENCIES[agentId]],
      receivedPreviousOutputs: depCheck.receivedPreviousOutputs,
      priorOutputNames: depCheck.priorOutputNames,
      outputLength,
      status: meta.status,
      warning: depCheck.warnings[0],
    },
    warnings: depCheck.warnings,
  };
}
