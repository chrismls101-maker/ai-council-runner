import { useState } from "react";
import IivoWordmark from "./IivoWordmark";
import ChildArtifactEventCard from "./ChildArtifactEventCard";
import Collapsible from "./Collapsible";
import ArtifactRenderer from "./artifacts/ArtifactRenderer";
import ArtifactReferenceFallback from "./artifacts/ArtifactReferenceFallback";
import { useResolvedArtifact } from "../hooks/useResolvedArtifact";
import type { ArtifactSnapshot } from "../utils/artifactSnapshot";
import BuilderModeConfirm from "./builder/BuilderModeConfirm";
import { withIivoWordmark } from "../utils/brandText";
import DecisionQualitySummary from "./DecisionQualitySummary";
import MarkdownContent from "./MarkdownContent";
import TypewriterAnswer from "./TypewriterAnswer";
import MemoryContextBadge from "./MemoryContextBadge";
import TrackExecutionPanel from "./TrackExecutionPanel";
import SourceList from "./SourceList";
import SubmittedAttachments from "./SubmittedAttachments";
import SubmittedContextItems from "./SubmittedContextItems";
import SuggestedMemoryPanel from "./SuggestedMemoryPanel";
import { InlineStatusIcon, StatusTextLine } from "./ProcessingStatusIndicator";
import {
  AgentOutputsList,
  CouncilCostAndTrace,
  DirectAnswerDetails,
  DirectAnswerDetailsCollapsible,
  ErrorsList,
} from "./ConversationDetailSections";
import { collectSources } from "../utils/sourceDisplay";
import { resolveDecisionQuality } from "../utils/decisionQualityDisplay";
import { isEntitySearchIntent } from "../utils/researchIntent";
import {
  formatDuration,
  getChatAgentStatusLine,
  getCouncilBanner,
  getDirectAnswerStatus,
  getRouterCompleteLabel,
  resolveEffectiveWorkflowId,
} from "../utils/chatStatusLabels";
import {
  BENCHMARK_LOW_CONFIDENCE_MESSAGE,
  MEMORY_UNAVAILABLE_MESSAGE,
  NO_SOURCES_MESSAGE,
  PROVIDER_FAILURE_MESSAGE,
  ROUTER_UNCERTAINTY_MESSAGE,
  ROUTER_UNCERTAINTY_THRESHOLD,
} from "../constants/publicMessages";
import {
  AGENT_ORDER,
  BENCHMARK_CHECKS,
  formatTokens,
  formatUsd,
  type AgentCost,
  type AgentId,
  type AgentMeta,
  type AgentOutputs,
  type ResearchAgentMeta,
  type RouterDecision,
  type RunCostSummary,
  type CouncilExecutionTrace,
  type DecisionOutcome,
  type DecisionQuality,
  type IncludedMemorySummary,
  type SaveMemoryDraft,
  type WorkflowOption,
  type ConversationArtifactEvent,
  type ConversationTurn,
  type IivoArtifact,
  type ArtifactSection,
} from "../types";
import { promptRequestsMarkdown } from "../utils/cleanDisplayText";
import type { DecisionRecord } from "../types/decisionRecord";
import type { SuggestedMemoryItem } from "../utils/suggestedMemory";
import type { ComposerAttachment } from "../types/attachments";
import type { AttachedContextItem } from "../types/contextBridge";
import { resolveSubmittedAttachedContext } from "../types/contextBridge";

const DIRECT_ANSWER_ID = "direct_answer";

const COUNCIL_WORKFLOWS = new Set([
  "sales-attack",
  "product-decision",
  "market-research",
  "competitive-intelligence",
  "technical-audit",
]);

export interface ConversationViewProps {
  completedTurns?: ConversationTurn[];
  isPastTurn?: boolean;
  submittedPrompt: string | null;
  submittedAttachments?: ComposerAttachment[];
  submittedAttachedContext?: AttachedContextItem[];
  running: boolean;
  isArchivedView: boolean;
  onCopyFinalPlan: () => void;
  onRerun: () => void;
  outputs: AgentOutputs;
  agentMeta: Record<AgentId, AgentMeta>;
  agentLabels?: Record<AgentId, string>;
  agentCosts: Partial<Record<AgentId, AgentCost>>;
  costSummary: RunCostSummary | null;
  runStatus: string | null;
  workflowName: string | null;
  workflow: string;
  tokenMode: string;
  workflows: WorkflowOption[];
  routerDecision: RouterDecision | null;
  routerPending: boolean;
  errors: { agent: AgentId; message: string }[];
  researchSources?: string[];
  researchAgentMeta?: ResearchAgentMeta;
  benchmarkAnswer: string | null;
  benchmarkCost: AgentCost | null;
  benchmarkChecks: Record<string, boolean>;
  benchmarkNotes: string;
  onBenchmarkCheck: (label: string, checked: boolean) => void;
  onBenchmarkNotes: (v: string) => void;
  executionTrace: CouncilExecutionTrace | null;
  decisionObjective?: string | null;
  objectiveInferred?: boolean;
  decisionQuality?: DecisionQuality | null;
  outcome?: DecisionOutcome;
  decisionRecord?: DecisionRecord | null;
  runId?: string | null;
  onSaveOutcome?: (outcome: DecisionOutcome) => Promise<void>;
  onReviewDecision?: () => void;
  includedMemories?: IncludedMemorySummary[];
  memoryMode?: string;
  onOpenSaveMemory?: (draft: Partial<SaveMemoryDraft>) => void;
  suggestedMemories?: SuggestedMemoryItem[];
  onSaveSuggestedMemory?: (item: SuggestedMemoryItem) => void;
  onIgnoreSuggestedMemory?: (id: string) => void;
  memoryEnabled?: boolean;
  typewriterAnimate?: boolean;
  typewriterResetKey?: string;
  onTypewriterActiveChange?: (active: boolean) => void;
  onTypewriterProgress?: () => void;
  onRegisterTypewriterSkip?: (skip: (() => void) | null) => void;
  artifact?: IivoArtifact | null;
  artifactSnapshot?: ArtifactSnapshot;
  builderModeActive?: boolean;
  builderCanvasDismissed?: boolean;
  onBuilderModeContinue?: () => void;
  onBuilderModeKeepInChat?: () => void;
  onCopyFeedback?: (message: string) => void;
  onRegenerateSection?: (section: ArtifactSection) => void;
  onEditSection?: (section: ArtifactSection) => void;
  onOpenInBuilder?: (artifact?: import("../types/artifacts.js").IivoArtifact) => void;
  onOpenImageStudio?: (artifact?: import("../types/artifacts.js").IivoArtifact) => void;
  loadingSectionId?: string | null;
  artifactEvents?: ConversationArtifactEvent[];
  onOpenChildArtifact?: (artifact: import("../types/artifacts.js").IivoArtifact) => void;
  onOpenChildInBuilder?: (artifact: import("../types/artifacts.js").IivoArtifact) => void;
}

function AgentCostBlock({ cost }: { cost: AgentCost | undefined }) {
  if (!cost) return null;
  const requestFee = cost.requestFeeUsd ?? 0;
  return (
    <div className="cost-block">
      <div className="cost-row">
        <span className="cost-label">Token cost</span>
        <span className="cost-value">
          {cost.usageAvailable && cost.tokenCostUsd != null
            ? formatUsd(cost.tokenCostUsd)
            : "usage unavailable"}
        </span>
      </div>
      {requestFee > 0 && (
        <div className="cost-row">
          <span className="cost-label">Request fee</span>
          <span className="cost-value">{formatUsd(requestFee)}</span>
        </div>
      )}
      <div className="cost-row">
        <span className="cost-label">Est. total</span>
        <span className="cost-value cost-total-inline">
          {cost.estimatedCostUsd != null ? formatUsd(cost.estimatedCostUsd) : "—"}
        </span>
      </div>
      {cost.usageAvailable && (
        <div className="cost-row">
          <span className="cost-label">Tokens</span>
          <span className="cost-value cost-mono">
            {formatTokens(cost.inputTokens)} in · {formatTokens(cost.outputTokens)} out
          </span>
        </div>
      )}
      <div className="cost-row">
        <span className="cost-label">Model</span>
        <span className="cost-value cost-mono">
          {cost.provider} / {cost.model}
        </span>
      </div>
    </div>
  );
}

function routerWorkflowLabel(id: string, options: WorkflowOption[]): string {
  if (id === DIRECT_ANSWER_ID) return "Direct Answer";
  return options.find((w) => w.value === id)?.label ?? id;
}

function isDirectAnswerRoute(
  workflow: string,
  workflowName: string | null,
  routerDecision: RouterDecision | null,
): boolean {
  return (
    routerDecision?.selectedWorkflow === DIRECT_ANSWER_ID ||
    workflow === DIRECT_ANSWER_ID ||
    workflowName === "Direct Answer"
  );
}

function shouldShowAgentStatus(
  id: AgentId,
  meta: AgentMeta,
  outputs: AgentOutputs,
  isDirectAnswer: boolean,
): boolean {
  if (isDirectAnswer && id !== "strategy") return false;
  if (meta.status !== "pending") return true;
  return Boolean(outputs[id]);
}

export default function ConversationView(props: ConversationViewProps) {
  const { completedTurns = [], ...activeProps } = props;
  const activeAnswerText =
    activeProps.outputs.finalJudge ||
    (activeProps.outputs.strategy && activeProps.workflow === "direct_answer"
      ? activeProps.outputs.strategy
      : "") ||
    "";

  return (
    <div className="conversation">
      {activeProps.isArchivedView && (
        <ArchivedDecisionBanner
          onReviewDecision={activeProps.onReviewDecision}
          onOpenSaveMemory={activeProps.onOpenSaveMemory}
          onRerun={activeProps.onRerun}
          answerText={activeAnswerText}
          runId={activeProps.runId}
        />
      )}

      {completedTurns.map((turn) => (
        <div
          key={turn.id}
          className="conversation-turn conversation-turn-past"
          data-testid="conversation-turn"
          data-run-id={turn.runId ?? undefined}
          data-status={turn.runStatus ?? undefined}
          data-workflow-id={turn.workflow ?? undefined}
        >
          <ConversationTurnContent
            {...mapCompletedTurnToProps(turn, activeProps)}
            isPastTurn
          />
        </div>
      ))}

      {(activeProps.submittedPrompt ||
        (activeProps.submittedAttachments?.length ?? 0) > 0 ||
        (activeProps.submittedAttachedContext?.length ?? 0) > 0) && (
        <div
          className="conversation-turn conversation-turn-active"
          data-testid="conversation-turn"
          data-run-id={activeProps.runId ?? undefined}
          data-status={activeProps.runStatus ?? undefined}
          data-workflow-id={activeProps.workflow ?? undefined}
        >
          <ConversationTurnContent {...activeProps} completedTurns={[]} />
        </div>
      )}
    </div>
  );
}

function mapCompletedTurnToProps(
  turn: ConversationTurn,
  shared: ConversationViewProps,
): ConversationViewProps {
  const isDirectAnswer = isDirectAnswerRoute(
    turn.workflow,
    turn.workflowName,
    turn.routerDecision,
  );
  const answerText =
    turn.outputs.finalJudge ||
    (isDirectAnswer ? turn.outputs.strategy : "") ||
    "";

  return {
    ...shared,
    completedTurns: [],
    isPastTurn: true,
    submittedPrompt: turn.userPrompt,
    submittedAttachments: turn.submittedAttachments,
    submittedAttachedContext: resolveSubmittedAttachedContext({
      submittedContext: turn.submittedContext,
      executionTrace: turn.executionTrace,
    }),
    running: false,
    outputs: turn.outputs,
    agentMeta: turn.agentMeta,
    agentLabels: turn.agentLabels,
    agentCosts: turn.agentCosts,
    costSummary: turn.costSummary,
    runStatus: turn.runStatus,
    workflowName: turn.workflowName,
    workflow: turn.workflow,
    tokenMode: turn.tokenMode,
    routerDecision: turn.routerDecision,
    routerPending: false,
    errors: turn.errors,
    researchSources: turn.researchSources,
    researchAgentMeta: turn.researchAgentMeta,
    benchmarkAnswer: turn.benchmarkAnswer,
    benchmarkCost: turn.benchmarkCost,
    benchmarkChecks: turn.benchmarkChecks,
    benchmarkNotes: turn.benchmarkNotes,
    executionTrace: turn.executionTrace,
    decisionObjective: turn.decisionObjective,
    objectiveInferred: turn.objectiveInferred,
    decisionQuality: turn.decisionQuality,
    outcome: turn.outcome,
    decisionRecord: turn.decisionRecord,
    runId: turn.runId,
    includedMemories: turn.includedMemories,
    memoryMode: turn.memoryMode,
    typewriterAnimate: false,
    typewriterResetKey: turn.id,
    onTypewriterActiveChange: undefined,
    onTypewriterProgress: undefined,
    onRegisterTypewriterSkip: undefined,
    artifact: turn.artifact ?? undefined,
    artifactSnapshot: turn.artifactSnapshot,
    artifactEvents: turn.artifactEvents,
    suggestedMemories: [],
    onCopyFinalPlan: () => {
      if (answerText) {
        void navigator.clipboard.writeText(answerText);
      }
    },
  };
}

function ArchivedDecisionBanner({
  onReviewDecision,
  onOpenSaveMemory,
  onRerun,
  answerText,
  runId,
}: {
  onReviewDecision?: () => void;
  onOpenSaveMemory?: (draft: Partial<SaveMemoryDraft>) => void;
  onRerun: () => void;
  answerText: string;
  runId?: string | null;
}) {
  return (
    <div className="archived-banner compact">
      <div>
        <span className="archived-label">Viewing archived decision</span>
      </div>
      <div className="archived-banner-actions">
        {onReviewDecision && (
          <button type="button" className="btn ghost small" onClick={onReviewDecision}>
            Review Decision
          </button>
        )}
        {onOpenSaveMemory && (
          <button
            type="button"
            className="btn ghost small"
            onClick={() =>
              onOpenSaveMemory({
                type: "decision",
                title: "Archived decision",
                content: answerText.slice(0, 1200),
                relatedRunId: runId ?? "",
              })
            }
          >
            Save to Memory
          </button>
        )}
        <button type="button" className="btn primary small" onClick={onRerun}>
          Re-run
        </button>
      </div>
    </div>
  );
}

function ConversationTurnContent(props: ConversationViewProps) {
  const {
    submittedPrompt,
    submittedAttachments = [],
    submittedAttachedContext = [],
    running,
    isArchivedView,
    isPastTurn = false,
    executionTrace,
    onCopyFinalPlan,
    outputs,
    agentMeta,
    agentLabels,
    agentCosts,
    costSummary,
    runStatus,
    workflowName,
    workflow,
    tokenMode,
    workflows,
    routerDecision,
    routerPending,
    errors,
    researchSources,
    researchAgentMeta,
    benchmarkAnswer,
    benchmarkCost,
    benchmarkChecks,
    benchmarkNotes,
    onBenchmarkCheck,
    onBenchmarkNotes,
    decisionObjective,
    objectiveInferred,
    decisionQuality,
    outcome,
    decisionRecord,
    runId,
    onSaveOutcome,
    includedMemories = [],
    memoryMode,
    onOpenSaveMemory,
    suggestedMemories = [],
    onSaveSuggestedMemory,
    onIgnoreSuggestedMemory,
    memoryEnabled = true,
    typewriterAnimate = true,
    typewriterResetKey = runId ?? submittedPrompt ?? "run",
    onTypewriterActiveChange,
    onTypewriterProgress,
    onRegisterTypewriterSkip,
    artifact: artifactProp,
    artifactSnapshot,
    builderModeActive = false,
    builderCanvasDismissed = false,
    onBuilderModeContinue,
    onBuilderModeKeepInChat,
    onCopyFeedback,
    onRegenerateSection,
    onEditSection,
    onOpenInBuilder,
    onOpenImageStudio,
    loadingSectionId,
    artifactEvents = [],
    onOpenChildArtifact,
    onOpenChildInBuilder,
  } = props;

  const [showRawAnswer, setShowRawAnswer] = useState(false);
  const { artifact, loading: artifactLoading, missing: artifactMissing } =
    useResolvedArtifact(artifactProp, artifactSnapshot);
  const preserveMarkdown = promptRequestsMarkdown(submittedPrompt);

  const isDirectAnswer = isDirectAnswerRoute(workflow, workflowName, routerDecision);
  const effectiveWorkflowId = resolveEffectiveWorkflowId(
    workflow,
    routerDecision?.selectedWorkflow,
    isDirectAnswer,
  );
  const isCouncilRun =
    !isDirectAnswer && COUNCIL_WORKFLOWS.has(effectiveWorkflowId);
  const answerText =
    outputs.finalJudge ||
    (isDirectAnswer ? outputs.strategy : "") ||
    "";
  const hasAnswer = Boolean(answerText);
  const displayedAttachedContext = resolveSubmittedAttachedContext({
    submittedContext: submittedAttachedContext,
    executionTrace,
  });
  const hasConversation = Boolean(
    submittedPrompt ||
      submittedAttachments.length > 0 ||
      displayedAttachedContext.length > 0,
  );
  const sourceEntries = collectSources({
    researchOutput: outputs.research,
    researchSources,
    researchAgentMeta,
  });
  const sourceCount = sourceEntries.length;
  const hasAgentErrors = AGENT_ORDER.some((id) => agentMeta[id]?.status === "error");
  const hasErrors = errors.length > 0 || hasAgentErrors;
  const workflowLabel =
    workflowName ??
    (routerDecision
      ? routerWorkflowLabel(routerDecision.selectedWorkflow, workflows)
      : null) ??
    workflows.find((w) => w.value === workflow)?.label ??
    workflow;
  const entitySearchLikely =
    researchAgentMeta?.mode === "entity_search" ||
    (Boolean(submittedPrompt) && isEntitySearchIntent(submittedPrompt ?? ""));
  const showArtifact =
    artifactLoading ||
    artifactMissing ||
    (Boolean(artifact) &&
      artifact!.type !== "plain_answer" &&
      artifact!.sections.length > 0);
  const showCanvasConfirm =
    showArtifact &&
    artifact!.renderMode === "canvas" &&
    !builderModeActive &&
    !builderCanvasDismissed &&
    !running &&
    !isPastTurn;
  const showActionPlanTitle =
    !showArtifact &&
    !isDirectAnswer &&
    COUNCIL_WORKFLOWS.has(routerDecision?.selectedWorkflow ?? workflow) &&
    hasAnswer;
  const directAnswerStatus = getDirectAnswerStatus(
    agentMeta.strategy.status,
    running,
  );
  const showStatusThread =
    hasConversation &&
    (routerPending ||
      routerDecision ||
      isDirectAnswer ||
      AGENT_ORDER.some((id) =>
        shouldShowAgentStatus(id, agentMeta[id], outputs, isDirectAnswer),
      ));
  const directAnswerComplete = isDirectAnswer && !running && hasAnswer;
  const showCouncilStatusThread = showStatusThread && !isDirectAnswer;
  const showDirectAnswerStatusThread =
    isDirectAnswer &&
    !directAnswerComplete &&
    hasConversation &&
    (routerPending || running || directAnswerStatus !== "pending");
  const showCouncilBanner =
    isCouncilRun &&
    !routerPending &&
    (running || hasAnswer || AGENT_ORDER.some((id) => agentMeta[id]?.status !== "pending"));
  const showAssistantBlock =
    hasConversation && (hasAnswer || (!running && (runStatus || costSummary)));
  const resolvedQuality = resolveDecisionQuality(
    decisionQuality ?? undefined,
    outputs.finalJudge,
  );
  const showQualitySummary =
    !isDirectAnswer && resolvedQuality && hasAnswer;
  const showExecutionPanel =
    !isDirectAnswer && Boolean(runId && onSaveOutcome && !running);

  return (
    <>
      {(submittedPrompt ||
        submittedAttachments.length > 0 ||
        displayedAttachedContext.length > 0) && (
        <div className="message message-user">
          <div className="message-label">You</div>
          {displayedAttachedContext.length > 0 && (
            <SubmittedContextItems items={displayedAttachedContext} />
          )}
          {submittedAttachments.length > 0 && (
            <SubmittedAttachments attachments={submittedAttachments} />
          )}
          {submittedPrompt && <div className="message-body">{submittedPrompt}</div>}
        </div>
      )}

      {showCouncilStatusThread && (
        <div className="message message-status">
          <div className="message-label">
            <IivoWordmark />
          </div>
          <div className="inline-status-list">
            {(routerPending || routerDecision) && (
              <div className="router-status-block" data-testid="router-status">
                <div
                  className={`inline-status status-row status-${routerPending ? "running" : "complete"}${routerPending ? " is-active running" : " complete"}`}
                >
                  <InlineStatusIcon status={routerPending ? "running" : "complete"} />
                  <StatusTextLine
                    running={routerPending}
                    text={
                      routerPending
                        ? "Choosing the best processing path…"
                        : getRouterCompleteLabel(
                            routerWorkflowLabel(
                              routerDecision!.selectedWorkflow,
                              workflows,
                            ),
                            routerDecision!.confidence,
                          )
                    }
                  />
                </div>
                {!routerPending && routerDecision?.reason && (
                  <p className="router-reason-line muted">{routerDecision.reason}</p>
                )}
                {!routerPending &&
                  routerDecision &&
                  routerDecision.confidence < ROUTER_UNCERTAINTY_THRESHOLD && (
                    <p className="router-uncertainty-note muted" data-testid="router-uncertainty-note">
                      {withIivoWordmark(ROUTER_UNCERTAINTY_MESSAGE, "router-uncertainty")}
                    </p>
                  )}
              </div>
            )}
            {showCouncilBanner && (
              <div
                className={`inline-status status-row status-${running && !hasAnswer ? "running" : "complete"}${running && !hasAnswer ? " is-active running" : " complete"}`}
                data-testid="workflow-status"
              >
                <InlineStatusIcon status={running && !hasAnswer ? "running" : "complete"} />
                <StatusTextLine
                  running={running && !hasAnswer}
                  text={getCouncilBanner(workflowLabel)}
                />
              </div>
            )}
            {!isDirectAnswer &&
              AGENT_ORDER.map((id) => {
              const meta = agentMeta[id];
              if (!shouldShowAgentStatus(id, meta, outputs, isDirectAnswer)) {
                return null;
              }
              const isActive = meta.status === "running";
              return (
                <div
                  key={id}
                  className={`inline-status status-row status-${meta.status}${isActive ? " is-active running" : meta.status === "error" ? " error" : meta.status === "complete" ? " complete" : ""}`}
                >
                  <InlineStatusIcon status={meta.status} />
                  <StatusTextLine
                    running={isActive}
                    text={getChatAgentStatusLine({
                      workflowId: effectiveWorkflowId,
                      agentId: id,
                      status: meta.status,
                      isDirectAnswer: false,
                      entitySearchActive: entitySearchLikely,
                    })}
                  />
                  {meta.durationMs != null && meta.status === "complete" && (
                    <span className="inline-status-time">
                      · {formatDuration(meta.durationMs)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showDirectAnswerStatusThread && (
        <div className="message message-status message-status-minimal">
          <div className="message-label">
            <IivoWordmark />
          </div>
          <div className="inline-status-list">
            {routerPending && (
              <div className="inline-status status-row status-running is-active running">
                <InlineStatusIcon status="running" />
                <StatusTextLine
                  running
                  text="Choosing the best processing path…"
                />
              </div>
            )}
            {!routerPending && (running || directAnswerStatus === "running") && (
              <div className="inline-status status-row status-running is-active running">
                <InlineStatusIcon status="running" />
                <StatusTextLine
                  running
                  text={
                    <>
                      <IivoWordmark /> thinking
                    </>
                  }
                />
              </div>
            )}
          </div>
        </div>
      )}

      <BuilderModeConfirm
        open={showCanvasConfirm}
        onContinue={() => onBuilderModeContinue?.()}
        onKeepInChat={() => onBuilderModeKeepInChat?.()}
      />

      {showAssistantBlock && (
        <div
          className={`message message-assistant${isDirectAnswer ? " direct-answer-turn" : " council-turn"}`}
        >
          <div className="message-label">
            <IivoWordmark />
          </div>
          {isDirectAnswer && directAnswerComplete && (
            <div className="direct-answer-meta-lines">
              {routerDecision && (
                <p className="direct-answer-route-line" data-testid="router-status">
                  {withIivoWordmark("IIVO routed this as Direct Answer", "direct-route")} ·{" "}
                  {routerDecision.confidence}% confidence
                </p>
              )}
              <p className="direct-answer-completed-line">
                {withIivoWordmark("IIVO answered", "direct-answered")}
                {agentMeta.strategy.durationMs != null &&
                  ` · ${formatDuration(agentMeta.strategy.durationMs)}`}
              </p>
            </div>
          )}
          {!isDirectAnswer && (
            <MemoryContextBadge
              memories={includedMemories}
              memoryMode={memoryEnabled ? memoryMode : "off"}
              compact
            />
          )}
          {isDirectAnswer && includedMemories.length > 0 && (
            <MemoryContextBadge
              memories={includedMemories}
              memoryMode={memoryEnabled ? memoryMode : "off"}
              compact
              subtle
            />
          )}
          {!memoryEnabled && isDirectAnswer && (
            <p className="memory-disabled-note muted" data-testid="memory-unavailable-note">
              {MEMORY_UNAVAILABLE_MESSAGE}
            </p>
          )}
          {memoryEnabled && includedMemories.length === 0 && hasAnswer && isDirectAnswer && (
            <p className="memory-unavailable-note muted" data-testid="memory-unavailable-note">
              {MEMORY_UNAVAILABLE_MESSAGE}
            </p>
          )}
          {showActionPlanTitle && (
            <div className="assistant-title">Final Action Plan</div>
          )}
          {!isDirectAnswer && decisionObjective && (
            <div className="decision-objective-line">
              <span className="dq-label">Objective</span>
              <span>{decisionObjective}</span>
              {objectiveInferred && (
                <span className="inline-badge muted-badge">inferred</span>
              )}
            </div>
          )}
          {showQualitySummary && resolvedQuality && (
            <DecisionQualitySummary quality={resolvedQuality} />
          )}
          {showQualitySummary && resolvedQuality && onOpenSaveMemory && (
            <button
              type="button"
              className="btn ghost small save-memory-inline"
              onClick={() =>
                onOpenSaveMemory({
                  type: "decision",
                  decision: resolvedQuality.recommendedAction,
                  reason: resolvedQuality.whyThisScore || resolvedQuality.nextAction24h,
                  content: resolvedQuality.recommendedAction,
                  title: resolvedQuality.recommendedAction?.slice(0, 80),
                  relatedRunId: runId ?? "",
                })
              }
            >
              Save to Memory
            </button>
          )}
          {hasAnswer ? (
            <div
              className={`assistant-answer-card${isDirectAnswer ? " direct-answer-card" : " council-answer-card"}${showArtifact ? " artifact-answer-card" : ""}`}
            >
              <div data-testid="final-answer" className="final-answer-display">
                {artifactLoading ? (
                  <ArtifactReferenceFallback state="loading" />
                ) : artifactMissing ? (
                  <ArtifactReferenceFallback
                    state="missing"
                    onShowRawAnswer={() => setShowRawAnswer(true)}
                  />
                ) : showArtifact && artifact ? (
                  <ArtifactRenderer
                    artifact={artifact}
                    onFeedback={onCopyFeedback}
                    compact={artifact.renderMode === "canvas" && builderCanvasDismissed}
                    onRegenerateSection={onRegenerateSection}
                    onEditSection={onEditSection}
                    onOpenInBuilder={
                      artifact && artifact.type !== "plain_answer" && onOpenInBuilder
                        ? () => onOpenInBuilder(artifact)
                        : undefined
                    }
                    onGenerateVisual={
                      artifact && onOpenImageStudio
                        ? () => onOpenImageStudio(artifact)
                        : undefined
                    }
                    loadingSectionId={loadingSectionId}
                  />
                ) : (
                  <TypewriterAnswer
                    content={answerText}
                    animate={typewriterAnimate && !isPastTurn}
                    resetKey={typewriterResetKey}
                    sanitizeDisplay={!preserveMarkdown}
                    className={`message-body assistant-body${isDirectAnswer ? " direct-answer-body" : ""}`}
                    onTypingChange={onTypewriterActiveChange}
                    onRevealProgress={onTypewriterProgress}
                    onRegisterSkip={onRegisterTypewriterSkip}
                  />
                )}
              </div>
              {showArtifact && (
                <button
                  type="button"
                  className="btn ghost small show-raw-answer-btn"
                  onClick={() => setShowRawAnswer((v) => !v)}
                >
                  {showRawAnswer ? "Hide raw answer" : "Show raw answer"}
                </button>
              )}
              {showArtifact && showRawAnswer && (
                <div className="raw-answer-fallback muted">
                  <TypewriterAnswer
                    content={answerText}
                    animate={false}
                    resetKey={`${typewriterResetKey}-raw`}
                    sanitizeDisplay={false}
                    className="message-body assistant-body raw-answer-body"
                  />
                </div>
              )}
              {artifactEvents.length > 0 && (
                <div className="artifact-events-list" data-testid="artifact-events-list">
                  {artifactEvents.map((event) => (
                    <ChildArtifactEventCard
                      key={event.id}
                      event={event}
                      parentTitle={artifact?.title}
                      onOpen={onOpenChildArtifact}
                      onOpenInBuilder={onOpenChildInBuilder}
                      onCopy={(text) => onCopyFeedback?.(text)}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="message-body assistant-body muted">
              {withIivoWordmark("IIVO finished without a complete answer.", "incomplete")}
            </div>
          )}
          {hasErrors && (
            <div className="inline-warning" data-testid="run-error-banner">
              {errors.some((e) => /provider|api|request failed|HTTP/i.test(e.message))
                ? PROVIDER_FAILURE_MESSAGE
                : isDirectAnswer
                  ? "Some agents failed. Open Details below for more."
                  : "Some agents failed. Open Errors below for details."}
            </div>
          )}
          <div
            className={`detail-accordions${isDirectAnswer ? " direct-answer-accordions" : " council-accordions"}`}
          >
            {isDirectAnswer ? (
              <DirectAnswerDetailsCollapsible>
                <DirectAnswerDetails
                  decisionObjective={decisionObjective}
                  objectiveInferred={objectiveInferred}
                  includedMemories={includedMemories}
                  memoryEnabled={memoryEnabled}
                  memoryMode={memoryMode}
                  routerDecision={routerDecision}
                  costSummary={costSummary}
                  agentCosts={agentCosts}
                  agentMeta={agentMeta}
                  executionTrace={executionTrace}
                  workflows={workflows}
                />
                {hasErrors && (
                  <ErrorsList errors={errors} agentMeta={agentMeta} agentLabels={agentLabels} />
                )}
              </DirectAnswerDetailsCollapsible>
            ) : (
              <>
                {showQualitySummary && resolvedQuality && (
                  <Collapsible title="Decision Quality">
                    <div className="decision-quality-detail">
                      {resolvedQuality.whyThisScore && (
                        <p><strong>Why this score:</strong> {resolvedQuality.whyThisScore}</p>
                      )}
                      {resolvedQuality.mainRisk && (
                        <p><strong>Main risk:</strong> {resolvedQuality.mainRisk}</p>
                      )}
                      {resolvedQuality.missingInformation && (
                        <p><strong>Missing information:</strong> {resolvedQuality.missingInformation}</p>
                      )}
                      {resolvedQuality.nextAction24h && (
                        <p><strong>Next action within 24 hours:</strong> {resolvedQuality.nextAction24h}</p>
                      )}
                      {resolvedQuality.whatWouldChangeDecision && (
                        <p><strong>What would change the decision:</strong> {resolvedQuality.whatWouldChangeDecision}</p>
                      )}
                      {resolvedQuality.nextMove && (
                        <div className="next-move-detail">
                          <strong>Next Move</strong>
                          {resolvedQuality.nextMove.doThisFirst && (
                            <p>Do this first: {resolvedQuality.nextMove.doThisFirst}</p>
                          )}
                          {resolvedQuality.nextMove.timeEstimate && (
                            <p>Time estimate: {resolvedQuality.nextMove.timeEstimate}</p>
                          )}
                          {resolvedQuality.nextMove.expectedResult && (
                            <p>Expected result: {resolvedQuality.nextMove.expectedResult}</p>
                          )}
                          {resolvedQuality.nextMove.ifItFails && (
                            <p>If it fails: {resolvedQuality.nextMove.ifItFails}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </Collapsible>
                )}

                {resolvedQuality && resolvedQuality.riskFlags.length > 0 && (
                  <Collapsible
                    title="Risk Flags"
                    badge={String(resolvedQuality.riskFlags.length)}
                    warning
                  >
                    <ul className="risk-flags-list">
                      {resolvedQuality.riskFlags.map((flag, i) => (
                        <li key={i}>{flag}</li>
                      ))}
                    </ul>
                  </Collapsible>
                )}

                {showExecutionPanel && (
                  <Collapsible title="Track Execution" testId="track-execution" defaultOpen={isArchivedView}>
                    <TrackExecutionPanel
                      runId={runId ?? null}
                      outcome={outcome}
                      decisionRecord={decisionRecord}
                      onSave={onSaveOutcome!}
                    />
                  </Collapsible>
                )}

                {(sourceCount > 0 || researchAgentMeta || outputs.research) && (
                  <Collapsible
                    title="Sources"
                    badge={sourceCount > 0 ? String(sourceCount) : undefined}
                  >
                    {sourceCount === 0 && (researchAgentMeta || outputs.research) && (
                      <p className="no-sources-note muted" data-testid="no-sources-note">
                        {withIivoWordmark(NO_SOURCES_MESSAGE, "no-sources-note")}
                      </p>
                    )}
                    <SourceList
                      researchSources={researchSources}
                      researchOutput={outputs.research}
                      researchAgentMeta={researchAgentMeta}
                    />
                    {onOpenSaveMemory && sourceEntries.slice(0, 3).map((entry, i) => (
                      <button
                        key={entry.id ?? i}
                        type="button"
                        className="btn ghost small save-memory-inline"
                        onClick={() =>
                          onOpenSaveMemory({
                            type: "evidence",
                            title: entry.title || entry.businessName || `Source ${i + 1}`,
                            content: entry.url || entry.title || entry.businessName || "",
                            sourceUrl: entry.url,
                            relatedRunId: runId ?? "",
                          })
                        }
                      >
                        Save source to Memory
                      </button>
                    ))}
                  </Collapsible>
                )}

                <Collapsible
                  title="Agent Outputs"
                  badge={`${AGENT_ORDER.filter((id) => outputs[id]).length}`}
                  warning={hasAgentErrors}
                >
                  <AgentOutputsList
                    outputs={outputs}
                    agentMeta={agentMeta}
                    agentLabels={agentLabels}
                    isDirectAnswer={false}
                  />
                </Collapsible>

                {(costSummary || executionTrace) && (
                  <Collapsible title="Cost & Trace" testId="cost-trace">
                    <CouncilCostAndTrace
                      costSummary={costSummary}
                      agentCosts={agentCosts}
                      agentMeta={agentMeta}
                      agentLabels={agentLabels}
                      executionTrace={executionTrace}
                      routerPending={routerPending}
                      routerDecision={routerDecision}
                      outputs={outputs}
                      workflows={workflows}
                    />
                  </Collapsible>
                )}

                {benchmarkAnswer && (
                  <Collapsible
                    title="Benchmark"
                    badge={withIivoWordmark("Single model vs IIVO", "benchmark-badge")}
                  >
                    <p className="benchmark-honesty-note muted" data-testid="benchmark-honesty-note">
                      {BENCHMARK_LOW_CONFIDENCE_MESSAGE}
                    </p>
                    <div className="benchmark-compare">
                      <div>
                        <h4>Single Model (OpenAI)</h4>
                        <AgentCostBlock cost={benchmarkCost ?? undefined} />
                        <MarkdownContent content={benchmarkAnswer} compact />
                      </div>
                    </div>
                    {!isArchivedView && !isPastTurn && (
                      <div className="benchmark-checklist">
                        {BENCHMARK_CHECKS.map((label) => (
                          <label key={label} className="check-item">
                            <input
                              type="checkbox"
                              checked={benchmarkChecks[label] ?? false}
                              onChange={(e) => onBenchmarkCheck(label, e.target.checked)}
                            />
                            {label}
                          </label>
                        ))}
                        <textarea
                          className="benchmark-notes"
                          placeholder="Comparison notes…"
                          value={benchmarkNotes}
                          onChange={(e) => onBenchmarkNotes(e.target.value)}
                          rows={2}
                        />
                      </div>
                    )}
                  </Collapsible>
                )}

                {hasErrors && (
                  <Collapsible
                    title="Errors"
                    badge={String(Math.max(errors.length, hasAgentErrors ? 1 : 0))}
                    warning
                    defaultOpen={hasErrors && !hasAnswer}
                  >
                    <ErrorsList errors={errors} agentMeta={agentMeta} agentLabels={agentLabels} />
                  </Collapsible>
                )}
              </>
            )}

            {hasAnswer && (
              <div className="assistant-actions">
                <button type="button" className="btn ghost small" onClick={onCopyFinalPlan}>
                  Copy answer
                </button>
                {onOpenSaveMemory && (
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={() =>
                      onOpenSaveMemory({
                        type: "project_fact",
                        title: "Answer from IIVO run",
                        content: answerText.slice(0, 1200),
                        relatedRunId: runId ?? "",
                      })
                    }
                  >
                    Save to Memory
                  </button>
                )}
                {!running && runStatus && (
                  <span
                    data-testid="run-status"
                    data-status={runStatus}
                    aria-hidden="true"
                    hidden
                  />
                )}
                {runStatus && runStatus !== "complete" && (
                  <span className={`run-badge status-${runStatus}`}>
                    {runStatus.toUpperCase()}
                  </span>
                )}
                {!isDirectAnswer && (
                  <>
                    <span className="inline-badge muted-badge">{workflowLabel}</span>
                    <span className="inline-badge muted-badge">{tokenMode}</span>
                    {costSummary && (
                      <span className="inline-badge muted-badge">
                        {formatUsd(costSummary.totalEstimatedCostUsd)}
                      </span>
                    )}
                  </>
                )}
              </div>
            )}

            {!running &&
              !isPastTurn &&
              !isDirectAnswer &&
              suggestedMemories.length > 0 &&
              onSaveSuggestedMemory &&
              onIgnoreSuggestedMemory && (
                <SuggestedMemoryPanel
                  suggestions={suggestedMemories}
                  onSave={onSaveSuggestedMemory}
                  onIgnore={onIgnoreSuggestedMemory}
                />
              )}
          </div>
        </div>
      )}
    </>
  );
}
