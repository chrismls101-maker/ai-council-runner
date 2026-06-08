import type { RouterDecision } from "../agents/routerAgent.js";
import type { CouncilExecutionTrace } from "../orchestrator/executionTrace.js";
import type {
  BusinessContext,
  DecisionOutcome,
  DecisionQuality,
} from "../decisionQuality/types.js";
import type { MemoryMode } from "../memory/types.js";
import type { MemoryType } from "../memory/types.js";

export interface IncludedMemorySummary {
  id: string;
  type: MemoryType;
  title: string;
  projectName?: string;
}

export type AgentId =
  | "strategy"
  | "critic"
  | "research"
  | "salesWriter"
  | "finalJudge";

export type AgentStatus = "pending" | "running" | "complete" | "error";

export type RunStatus = "complete" | "partial" | "error";

export interface AgentOutputs {
  strategy: string;
  critic: string;
  research: string;
  salesWriter: string;
  finalJudge: string;
}

export interface AgentError {
  agent: AgentId;
  message: string;
}

export interface PricingUsed {
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  source: string;
  asOf: string;
  requestFeeUsd?: number;
  requestFeeLabel?: string;
  searchContextSize?: "low" | "medium" | "high";
}

export interface AgentCost {
  provider: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  tokenCostUsd: number | null;
  requestFeeUsd: number;
  estimatedCostUsd: number | null;
  pricingUsed: PricingUsed | null;
  usageAvailable: boolean;
  searchRequestCount?: number;
}

export interface ResearchAgentMeta {
  mode: string;
  provider: string;
  searchRequestCount?: number;
  searchRequestFeeUsd?: number;
}

export interface RunCostSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalTokenCostUsd: number | null;
  totalRequestFeesUsd: number;
  totalEstimatedCostUsd: number | null;
  usageUnavailableAgents: AgentId[];
  warning?: string;
}

export interface AgentMeta {
  status: AgentStatus;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  error?: string;
  displayName?: string;
}

export interface CouncilRunResult {
  runId: string;
  status: RunStatus;
  outputs: AgentOutputs;
  errors: AgentError[];
  agentMeta?: Record<AgentId, AgentMeta>;
  agentCosts?: Partial<Record<AgentId, AgentCost>>;
  costSummary?: RunCostSummary;
  tokenMode?: "small" | "standard" | "deep";
  workflowId?: string;
  workflowName?: string;
  agentLabels?: Record<AgentId, string>;
  routerDecision?: RouterDecision;
  benchmarkEnabled?: boolean;
  benchmarkAnswer?: string;
  benchmarkCost?: AgentCost;
  researchSources?: string[];
  researchAgentMeta?: ResearchAgentMeta;
  executionTrace?: CouncilExecutionTrace;
  decisionObjective?: string;
  objectiveInferred?: boolean;
  businessContext?: BusinessContext;
  decisionQuality?: DecisionQuality;
  outcome?: DecisionOutcome;
  memoryMode?: MemoryMode;
  includedMemoryIds?: string[];
  includedMemories?: IncludedMemorySummary[];
  decisionRecord?: import("../decisions/types.js").DecisionRecord;
  includedPastOutcomeIds?: string[];
  includedPastOutcomeCount?: number;
  usage?: import("../usage/types.js").RunUsageSummary;
}

export interface ProgressEvent {
  type:
    | "run-start"
    | "router-complete"
    | "benchmark-complete"
    | "agent-start"
    | "agent-complete"
    | "agent-error"
    | "run-complete"
    | "run-stopped";
  runId: string;
  agent?: AgentId;
  displayName?: string;
  output?: string;
  error?: string;
  durationMs?: number;
  startedAt?: string;
  completedAt?: string;
  cost?: AgentCost;
  routerDecision?: RouterDecision;
  benchmarkAnswer?: string;
  benchmarkCost?: AgentCost;
  researchSources?: string[];
  researchAgentMeta?: ResearchAgentMeta;
  result?: CouncilRunResult;
}

export interface RunCouncilRequest {
  prompt: string;
  preset: string;
  tokenMode?: "small" | "standard" | "deep";
  workflow?: string;
  executionMode?: "auto" | "quick" | "council";
  executionModeConfirmationAccepted?: boolean;
  executionModeConfirmationShown?: boolean;
  benchmark?: boolean;
  decisionObjective?: string;
  businessContext?: Partial<BusinessContext>;
  userProfile?: Partial<import("../userProfile/types.js").GlassUserProfile>;
  memoryMode?: MemoryMode;
  selectedMemoryIds?: string[];
  conversationContext?: {
    previousUserPrompt?: string;
    previousAssistantAnswer?: string;
  };
  externalContext?: import("../contextBridge/types.js").ExternalContextPayload;
}

export const AGENT_ORDER: AgentId[] = [
  "strategy",
  "critic",
  "research",
  "salesWriter",
  "finalJudge",
];

export const AGENT_LABELS: Record<AgentId, string> = {
  strategy: "Strategy",
  critic: "Critic",
  research: "Research",
  salesWriter: "Sales Writer",
  finalJudge: "Final Judge",
};

export const CRITICAL_AGENTS: AgentId[] = ["strategy"];
