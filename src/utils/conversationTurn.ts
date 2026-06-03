import type { ComposerAttachment } from "../types/attachments";
import type { AttachedContextItem } from "../types/contextBridge";
import type { DecisionRecord } from "../types/decisionRecord";
import type {
  AgentCost,
  AgentId,
  AgentMeta,
  AgentOutputs,
  ConversationTurn,
  ConversationTurnStatus,
  CouncilExecutionTrace,
  DecisionOutcome,
  DecisionQuality,
  IncludedMemorySummary,
  ResearchAgentMeta,
  RouterDecision,
  RunCostSummary,
} from "../types";
import { safeSaveConversationThread } from "./safeSessionStorage.ts";

export const CONVERSATION_THREAD_STORAGE_KEY = "iivo-conversation-thread";

export interface ConversationTurnSnapshotInput {
  userPrompt: string | null;
  submittedAttachments: ComposerAttachment[];
  submittedContext?: AttachedContextItem[];
  runId: string | null;
  outputs: AgentOutputs;
  agentMeta: Record<AgentId, AgentMeta>;
  agentLabels?: Record<AgentId, string>;
  agentCosts: Partial<Record<AgentId, AgentCost>>;
  costSummary: RunCostSummary | null;
  runStatus: string | null;
  workflowName: string | null;
  workflow: string;
  tokenMode: string;
  routerDecision: RouterDecision | null;
  errors: { agent: AgentId; message: string }[];
  researchSources?: string[];
  researchAgentMeta?: ResearchAgentMeta;
  benchmarkAnswer: string | null;
  benchmarkCost: AgentCost | null;
  benchmarkChecks: Record<string, boolean>;
  benchmarkNotes: string;
  executionTrace: CouncilExecutionTrace | null;
  decisionObjective?: string | null;
  objectiveInferred?: boolean;
  decisionQuality?: DecisionQuality | null;
  outcome?: DecisionOutcome;
  decisionRecord?: DecisionRecord | null;
  includedMemories?: IncludedMemorySummary[];
  memoryMode?: string;
}

function resolveTurnStatus(runStatus: string | null): ConversationTurnStatus {
  if (runStatus === "error") return "failed";
  if (runStatus === "partial") return "partial";
  return "complete";
}

export function buildConversationTurnSnapshot(
  input: ConversationTurnSnapshotInput,
): ConversationTurn {
  return {
    id: input.runId ?? crypto.randomUUID(),
    submittedAt: new Date().toISOString(),
    userPrompt: input.userPrompt,
    submittedAttachments: input.submittedAttachments.map((item) => ({ ...item })),
    submittedContext: input.submittedContext?.map((item) => ({ ...item })),
    status: resolveTurnStatus(input.runStatus),
    runId: input.runId,
    outputs: { ...input.outputs },
    agentMeta: { ...input.agentMeta },
    agentLabels: input.agentLabels ? { ...input.agentLabels } : undefined,
    agentCosts: { ...input.agentCosts },
    costSummary: input.costSummary ? { ...input.costSummary } : null,
    runStatus: input.runStatus,
    workflowName: input.workflowName,
    workflow: input.workflow,
    tokenMode: input.tokenMode,
    routerDecision: input.routerDecision ? { ...input.routerDecision } : null,
    errors: input.errors.map((entry) => ({ ...entry })),
    researchSources: input.researchSources ? [...input.researchSources] : undefined,
    researchAgentMeta: input.researchAgentMeta
      ? { ...input.researchAgentMeta }
      : undefined,
    benchmarkAnswer: input.benchmarkAnswer,
    benchmarkCost: input.benchmarkCost ? { ...input.benchmarkCost } : null,
    benchmarkChecks: { ...input.benchmarkChecks },
    benchmarkNotes: input.benchmarkNotes,
    executionTrace: input.executionTrace ? { ...input.executionTrace } : null,
    decisionObjective: input.decisionObjective ?? null,
    objectiveInferred: input.objectiveInferred ?? false,
    decisionQuality: input.decisionQuality ?? null,
    outcome: input.outcome ? { ...input.outcome } : undefined,
    decisionRecord: input.decisionRecord ?? null,
    includedMemories: input.includedMemories ? [...input.includedMemories] : [],
    memoryMode: input.memoryMode,
  };
}

export function loadConversationThreadFromSession(): ConversationTurn[] {
  try {
    const raw = sessionStorage.getItem(CONVERSATION_THREAD_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ConversationTurn[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveConversationThreadToSession(
  turns: ConversationTurn[],
): import("./safeSessionStorage.js").SessionSaveResult {
  return safeSaveConversationThread(CONVERSATION_THREAD_STORAGE_KEY, turns);
}

export function clearConversationThreadSession(): void {
  try {
    sessionStorage.removeItem(CONVERSATION_THREAD_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
