import type { BusinessContext, DecisionOutcome, DecisionQuality } from "./decisionQuality.js";
import type { MemoryType } from "./memory";
import type { ExternalContextRunTrace } from "./contextBridge";

export type AgentId =
  | "strategy"
  | "critic"
  | "research"
  | "salesWriter"
  | "finalJudge";

export type AgentStatus = "pending" | "running" | "complete" | "error";
export type RunStatus = "complete" | "partial" | "error";
export type TokenMode = "small" | "standard" | "deep";

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
  requestFeeUsd?: number;
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
  totalRequestFeesUsd?: number;
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

export interface RouterDecision {
  selectedWorkflow: string;
  reason: string;
  confidence: number;
}

export type {
  BusinessContext,
  DecisionOutcome,
  DecisionQuality,
  OutcomeStatus,
} from "./decisionQuality.js";

export {
  EMPTY_BUSINESS_CONTEXT,
  OUTCOME_STATUS_LABELS,
  businessContextLabel,
  hasBusinessContext,
} from "./decisionQuality.js";

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

export interface ResponsePlanTrace {
  taskIntent: string;
  responseContract: string;
  routeLane: string;
  preferredRoute: string;
  targetLatencySeconds?: number;
  intentReason: string;
  laneReason: string;
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
  executionMode?: import("./executionMode.js").ExecutionModeTrace;
}

export interface VisionMemoryGuardTrace {
  applied: boolean;
  candidateCount: number;
  includedCount: number;
  excludedCount: number;
  note: string;
}

export interface VisionAnalysisTrace {
  screenshotAnalyzedVisually: boolean;
  visionConfigured: boolean;
  visionEnabled: boolean;
  visionProvider?: string;
  visionModel?: string;
  screenshotTitle?: string;
  sourceUrl?: string;
  imageSizeBytes?: number;
  imageMimeType?: string;
  captureType?: string;
  error?: string;
}

export interface CouncilRunResult {
  runId: string;
  status: RunStatus;
  outputs: AgentOutputs;
  errors: AgentError[];
  agentMeta?: Record<AgentId, AgentMeta>;
  agentCosts?: Partial<Record<AgentId, AgentCost>>;
  costSummary?: RunCostSummary;
  tokenMode?: TokenMode;
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
  memoryMode?: import("./memory").MemoryMode;
  includedMemoryIds?: string[];
  includedMemories?: IncludedMemorySummary[];
  decisionRecord?: import("./decisionRecord.js").DecisionRecord;
  includedPastOutcomeIds?: string[];
  includedPastOutcomeCount?: number;
  usage?: import("./usage.js").RunUsageSummary;
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

export interface IncludedMemorySummary {
  id: string;
  type: MemoryType;
  title: string;
  projectName?: string;
}

export type { Memory, MemoryMode, MemoryType, SaveMemoryDraft } from "./memory";
export {
  MEMORY_MODE_OPTIONS,
  MEMORY_TYPE_LABELS,
  contextLabelFromMemories,
  memoryDisplayTitle,
  memoryPreview,
} from "./memory";

export interface RunHistorySummary {
  runId: string;
  timestamp: string;
  title?: string;
  workflowId: string;
  workflowName: string;
  preset?: string;
  prompt?: string;
  promptPreview: string;
  status: string;
  tokenMode?: TokenMode;
  totalEstimatedCostUsd: number | null;
  sourceCount?: number;
  benchmarkEnabled?: boolean;
  hasFinalPlan?: boolean;
  hasResearchOutput?: boolean;
  finalPlanPreview?: string;
  confidence?: string;
  riskLevel?: string;
  decisionScore?: number;
  outcomeStatus?: string;
}

export interface WorkflowOption {
  value: string;
  label: string;
  purpose: string;
}

export type ConversationTurnStatus = "running" | "complete" | "partial" | "failed";

export interface ConversationTurn {
  id: string;
  submittedAt: string;
  userPrompt: string | null;
  submittedAttachments: import("./attachments").ComposerAttachment[];
  submittedContext?: import("./contextBridge").AttachedContextItem[];
  status: ConversationTurnStatus;
  runId?: string | null;
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
  errors: AgentError[];
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
  decisionRecord?: import("./decisionRecord.js").DecisionRecord | null;
  includedMemories?: IncludedMemorySummary[];
  memoryMode?: import("./memory").MemoryMode | string;
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

export const AGENT_PROVIDERS: Record<AgentId, string> = {
  strategy: "OpenAI",
  critic: "Claude",
  research: "Perplexity",
  salesWriter: "Claude",
  finalJudge: "OpenAI",
};

export const PRESET_OPTIONS = [
  {
    value: "none",
    label: "No preset",
    description: "Neutral mode — no project preset injected.",
  },
  {
    value: "ai-front-desk-sales-test",
    label: "AI Front Desk Sales Test",
    description: "Sales-attack preset for AI front desk missed-call recovery outreach.",
  },
];

export const TOKEN_MODE_OPTIONS: {
  value: TokenMode;
  label: string;
  hint: string;
}[] = [
  { value: "small", label: "Quick", hint: "cheapest test run" },
  { value: "standard", label: "Standard", hint: "normal decision run" },
  { value: "deep", label: "Deep", hint: "long research/prospecting run" },
];

export function tokenModeLabel(mode: TokenMode): string {
  return TOKEN_MODE_OPTIONS.find((o) => o.value === mode)?.label ?? mode;
}

export function tokenModeHint(mode: TokenMode): string {
  return TOKEN_MODE_OPTIONS.find((o) => o.value === mode)?.hint ?? "";
}

export const BENCHMARK_CHECKS = [
  "More actionable?",
  "Better researched?",
  "Better risk detection?",
  "Better final decision?",
  "More useful next steps?",
  "Time saved vs manual copy/paste?",
] as const;

export function formatUsd(amount: number | null | undefined): string {
  if (amount == null) return "usage unavailable";
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}

export function formatTokens(count: number | null | undefined): string {
  if (count == null) return "—";
  return count.toLocaleString();
}

export function labelForAgent(
  id: AgentId,
  labels?: Record<AgentId, string>,
): string {
  return labels?.[id] ?? AGENT_LABELS[id];
}
