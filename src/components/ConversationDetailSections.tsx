import Collapsible from "./Collapsible";
import MarkdownContent from "./MarkdownContent";
import MemoryContextBadge from "./MemoryContextBadge";
import {
  AGENT_ORDER,
  AGENT_PROVIDERS,
  formatTokens,
  formatUsd,
  labelForAgent,
  type AgentCost,
  type AgentId,
  type AgentMeta,
  type AgentOutputs,
  type CouncilExecutionTrace,
  type IncludedMemorySummary,
  type RouterDecision,
  type RunCostSummary,
  type WorkflowOption,
} from "../types";
import { formatDuration } from "../utils/chatStatusLabels";
import type { ReactNode } from "react";
import {
  contextTypeLabel,
  formatRelevanceLabel,
  sourceConfidenceDetail,
  sourceConfidenceLabel,
  type ExternalContextRunTrace,
} from "../types/contextBridge";
import type { VisionAnalysisTrace } from "../types";

function routerWorkflowLabel(
  id: string,
  workflows: WorkflowOption[],
): string {
  if (id === "direct_answer") return "Direct Answer";
  return workflows.find((w) => w.value === id)?.label ?? id;
}

function agentDisplayName(
  id: AgentId,
  meta: AgentMeta,
  labels?: Record<AgentId, string>,
): string {
  return meta.displayName ?? labels?.[id] ?? id;
}

function formatExecutionTraceMode(mode: CouncilExecutionTrace["mode"]): string {
  return mode === "direct_answer" ? "Direct Answer" : "Council";
}

function formatExecutionTraceSequential(trace: CouncilExecutionTrace): string {
  if (trace.sequentialChainVerified) return "Verified";
  if (trace.sequential) return "Sequential";
  return "—";
}

interface RunCostSummaryBlockProps {
  summary: RunCostSummary;
}

function RunCostSummaryBlock({ summary }: RunCostSummaryBlockProps) {
  return (
    <div className="run-cost-summary compact-cost-summary">
      <div className="cost-row">
        <span>Total estimated</span>
        <strong>{formatUsd(summary.totalEstimatedCostUsd)}</strong>
      </div>
      <div className="cost-row muted">
        <span>Tokens</span>
        <span>{summary.totalTokens.toLocaleString()}</span>
      </div>
    </div>
  );
}

interface AgentCostBlockProps {
  cost?: AgentCost;
}

function AgentCostBlock({ cost }: AgentCostBlockProps) {
  if (!cost) return null;
  return (
    <div className="agent-cost-block compact">
      <span>
        {cost.provider} / {cost.model}
      </span>
      <span>{formatUsd(cost.estimatedCostUsd)}</span>
      {cost.usageAvailable && (
        <span className="muted">
          {formatTokens(cost.inputTokens)} in · {formatTokens(cost.outputTokens)} out
        </span>
      )}
    </div>
  );
}

export function ExternalContextTraceSection({
  externalContext,
}: {
  externalContext?: ExternalContextRunTrace;
}) {
  if (!externalContext || externalContext.itemCount === 0) {
    return (
      <div className="execution-trace-external-context" data-testid="external-context-trace">
        <strong>Context used in this run</strong>
        <p className="muted">External context: none.</p>
      </div>
    );
  }

  return (
    <div className="execution-trace-external-context" data-testid="external-context-trace">
      <strong>Context used in this run</strong>
      <p className="muted">
        {externalContext.itemCount} item{externalContext.itemCount === 1 ? "" : "s"} ·{" "}
        {externalContext.totalCharsSent.toLocaleString()} chars sent
        {externalContext.truncated ? " · truncated" : ""}
      </p>
      {externalContext.truncationNote && (
        <p className="context-truncation-warning">{externalContext.truncationNote}</p>
      )}
      <ul className="external-context-trace-list">
        {externalContext.items.map((item) => (
          <li key={item.id} data-testid="external-context-trace-item">
            <strong>{item.title}</strong>
            <div className="external-context-trace-meta muted">
              <span>Type: {contextTypeLabel(item.type)}</span>
              <span>Source: {sourceConfidenceLabel(item.sourceConfidence)}</span>
              <span>Relevance: {formatRelevanceLabel(item.relevance)}</span>
              <span>Truncated: {item.truncated ? "yes" : "no"}</span>
              <span>{item.savedToLibrary ? "Saved in library" : "Temporary attachment"}</span>
            </div>
            <p className="muted external-context-trace-confidence">
              Confidence: {sourceConfidenceDetail(item.sourceConfidence)}
            </p>
            {item.sourceUrl && (
              <p className="external-context-trace-url muted">URL: {item.sourceUrl}</p>
            )}
            {item.truncated && (
              <p className="muted">
                Length: sent {item.sentLength.toLocaleString()} / original{" "}
                {item.originalLength.toLocaleString()}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function VisionMemoryGuardTraceSection({
  visionMemoryGuard,
}: {
  visionMemoryGuard?: import("../types").VisionMemoryGuardTrace;
}) {
  if (!visionMemoryGuard?.applied) return null;

  return (
    <div className="execution-trace-vision-memory" data-testid="vision-memory-guard-trace">
      <strong>Screenshot memory guard</strong>
      <p className="muted" data-testid="vision-memory-guard-note">
        {visionMemoryGuard.note}
      </p>
      <p className="muted">
        Candidates: {visionMemoryGuard.candidateCount} · Included:{" "}
        {visionMemoryGuard.includedCount} · Excluded: {visionMemoryGuard.excludedCount}
      </p>
    </div>
  );
}

export function VisionAnalysisTraceSection({
  visionAnalysis,
}: {
  visionAnalysis?: VisionAnalysisTrace;
}) {
  if (!visionAnalysis) return null;

  return (
    <div className="execution-trace-vision" data-testid="vision-analysis-trace">
      <strong>Screenshot vision analysis</strong>
      <p className="muted" data-testid="vision-analysis-analyzed">
        Screenshot analyzed visually: {visionAnalysis.screenshotAnalyzedVisually ? "yes" : "no"}
      </p>
      {visionAnalysis.visionProvider && (
        <p className="muted">
          Vision provider/model: {visionAnalysis.visionProvider}
          {visionAnalysis.visionModel ? ` / ${visionAnalysis.visionModel}` : ""}
        </p>
      )}
      {visionAnalysis.screenshotTitle && (
        <p className="muted">Screenshot: {visionAnalysis.screenshotTitle}</p>
      )}
      {visionAnalysis.sourceUrl && <p className="muted">Source URL: {visionAnalysis.sourceUrl}</p>}
      {visionAnalysis.imageSizeBytes != null && (
        <p className="muted">
          Image size: {(visionAnalysis.imageSizeBytes / 1024).toFixed(1)} KB
          {visionAnalysis.imageMimeType ? ` (${visionAnalysis.imageMimeType})` : ""}
        </p>
      )}
      {visionAnalysis.error && (
        <p className="context-truncation-warning">{visionAnalysis.error}</p>
      )}
    </div>
  );
}

export interface ExecutionTraceSectionProps {
  executionTrace: CouncilExecutionTrace;
  workflows: WorkflowOption[];
  /** When false, external context block is omitted (shown elsewhere). */
  includeExternalContext?: boolean;
}

export function ExecutionTraceSection({
  executionTrace,
  workflows,
  includeExternalContext = true,
}: ExecutionTraceSectionProps) {
  return (
    <div className="execution-trace execution-trace-compact">
      <div className="execution-trace-summary">
        <span className="inline-badge">
          Mode: {formatExecutionTraceMode(executionTrace.mode)}
        </span>
        <span className="inline-badge">Agents: {executionTrace.agentCount}</span>
        <span className="inline-badge">
          Sequential: {formatExecutionTraceSequential(executionTrace)}
        </span>
      </div>

      {executionTrace.mode === "direct_answer" && (
        <p className="execution-trace-note muted">
          {executionTrace.directAnswerReason ??
            "Simple prompt — one model, no council."}
        </p>
      )}

      {executionTrace.executionMode && (
        <div className="execution-trace-router" data-testid="execution-mode-trace">
          <strong>Execution Mode</strong>
          <div className="execution-trace-router-meta">
            <span>
              Selected:{" "}
              {executionTrace.executionMode.selectedExecutionMode === "auto"
                ? "Auto"
                : executionTrace.executionMode.selectedExecutionMode === "quick"
                  ? "Quick Mode"
                  : executionTrace.executionMode.selectedExecutionMode === "council"
                    ? "Council Mode"
                    : executionTrace.executionMode.selectedExecutionMode}
            </span>
            <span>
              Effective:{" "}
              {executionTrace.executionMode.effectiveExecutionMode === "quick"
                ? "Quick"
                : executionTrace.executionMode.effectiveExecutionMode === "council"
                  ? "Council"
                  : executionTrace.executionMode.effectiveExecutionMode === "vision"
                    ? "Vision"
                    : "Research"}
            </span>
            {executionTrace.executionMode.confirmationShown != null && (
              <span>
                Confirmation shown: {executionTrace.executionMode.confirmationShown ? "yes" : "no"}
              </span>
            )}
            {executionTrace.executionMode.confirmationAccepted != null && (
              <span>
                Confirmation accepted:{" "}
                {executionTrace.executionMode.confirmationAccepted ? "yes" : "no"}
              </span>
            )}
          </div>
          <p className="muted">{executionTrace.executionMode.modeDecisionReason}</p>
        </div>
      )}

      {executionTrace.responseContract && (
        <div className="execution-trace-router">
          <strong>Response contract</strong>
          <div className="execution-trace-router-meta">
            <span>Task intent: {executionTrace.responseContract.taskIntent}</span>
            <span>Contract: {executionTrace.responseContract.responseContract}</span>
            <span>Route lane: {executionTrace.responseContract.routeLane}</span>
            {executionTrace.responseContract.targetLatencySeconds != null && (
              <span>Target: ~{executionTrace.responseContract.targetLatencySeconds}s</span>
            )}
          </div>
          <p className="muted">{executionTrace.responseContract.laneReason}</p>
        </div>
      )}

      {executionTrace.routerDecision && (
        <div className="execution-trace-router">
          <strong>Auto Router</strong>
          <div className="execution-trace-router-meta">
            <span>
              Selected:{" "}
              {routerWorkflowLabel(
                executionTrace.routerDecision.selectedWorkflow,
                workflows,
              )}
            </span>
            <span>Confidence: {executionTrace.routerDecision.confidence}%</span>
          </div>
          <p className="muted">{executionTrace.routerDecision.reason}</p>
        </div>
      )}

      {executionTrace.warnings.length > 0 && (
        <ul className="execution-trace-warnings">
          {executionTrace.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}

      {includeExternalContext && (
        <ExternalContextTraceSection externalContext={executionTrace.externalContext} />
      )}

      <VisionAnalysisTraceSection visionAnalysis={executionTrace.visionAnalysis} />
      <VisionMemoryGuardTraceSection visionMemoryGuard={executionTrace.visionMemoryGuard} />

      <div className="execution-trace-entries">
        {executionTrace.agents.map((entry) => (
          <div key={entry.agent} className="execution-trace-entry">
            <div className="execution-trace-entry-header">
              <strong>{entry.agentName}</strong>
              <span className={`status-tag status-${entry.status}`}>{entry.status}</span>
            </div>
            <div className="execution-trace-meta">
              <span>
                {entry.provider} / {entry.model}
              </span>
              {entry.durationMs != null && <span>{formatDuration(entry.durationMs)}</span>}
              <span>{entry.outputLength.toLocaleString()} chars out</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export interface TimelineSectionProps {
  isDirectAnswer: boolean;
  routerPending: boolean;
  routerDecision: RouterDecision | null;
  agentMeta: Record<AgentId, AgentMeta>;
  agentLabels?: Record<AgentId, string>;
  outputs: AgentOutputs;
  workflows: WorkflowOption[];
  executionTrace?: CouncilExecutionTrace | null;
}

export function TimelineSection({
  isDirectAnswer,
  routerPending,
  routerDecision,
  agentMeta,
  agentLabels,
  outputs,
  workflows,
  executionTrace,
}: TimelineSectionProps) {
  return (
    <>
      {executionTrace?.sequentialChainLabel && (
        <div className="sequential-verified-banner">{executionTrace.sequentialChainLabel}</div>
      )}
      <div className="timeline compact-timeline">
        {(routerDecision || routerPending) && (
          <div className="timeline-item">
            <div className="timeline-track">
              <div
                className={`timeline-dot status-${routerPending ? "running" : "complete"}`}
              />
              <div className="timeline-line done" />
            </div>
            <div className="timeline-content">
              <div className="timeline-header">
                <span className="agent-name">Auto Router</span>
                <span
                  className={`status-tag status-${routerPending ? "running" : "complete"}`}
                >
                  {routerPending ? "running" : "complete"}
                </span>
              </div>
              <div className="timeline-meta">
                {routerDecision && (
                  <span>
                    {routerWorkflowLabel(routerDecision.selectedWorkflow, workflows)}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
        {AGENT_ORDER.map((id, idx) => {
          if (isDirectAnswer && id !== "strategy") return null;
          const meta = agentMeta[id];
          if (meta.status === "pending" && !outputs[id]) return null;
          return (
            <div key={id} className="timeline-item">
              <div className="timeline-track">
                <div className={`timeline-dot status-${meta.status}`} />
                {idx < AGENT_ORDER.length - 1 && (
                  <div
                    className={`timeline-line ${meta.status === "complete" ? "done" : ""}`}
                  />
                )}
              </div>
              <div className="timeline-content">
                <div className="timeline-header">
                  <span className="agent-name">
                    {agentDisplayName(id, meta, agentLabels)}
                  </span>
                  <span className={`status-tag status-${meta.status}`}>{meta.status}</span>
                </div>
                <div className="timeline-meta">
                  <span>{formatDuration(meta.durationMs) || "—"}</span>
                  <span>{AGENT_PROVIDERS[id]}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

export interface DirectAnswerDetailsProps {
  decisionObjective?: string | null;
  objectiveInferred?: boolean;
  includedMemories: IncludedMemorySummary[];
  memoryEnabled: boolean;
  memoryMode?: string;
  routerDecision: RouterDecision | null;
  costSummary: RunCostSummary | null;
  agentCosts: Partial<Record<AgentId, AgentCost>>;
  agentMeta: Record<AgentId, AgentMeta>;
  executionTrace: CouncilExecutionTrace | null;
  workflows: WorkflowOption[];
}

export function DirectAnswerDetails({
  decisionObjective,
  objectiveInferred,
  includedMemories,
  memoryEnabled,
  memoryMode,
  routerDecision,
  costSummary,
  agentCosts,
  agentMeta,
  executionTrace,
  workflows,
}: DirectAnswerDetailsProps) {
  const strategyTrace = executionTrace?.agents.find((a) => a.agent === "strategy");
  const hasExternalContext =
    Boolean(executionTrace?.externalContext) &&
    (executionTrace?.externalContext?.itemCount ?? 0) > 0;

  return (
    <div className="direct-answer-details">
      <MemoryContextBadge
        memories={includedMemories}
        memoryMode={memoryEnabled ? memoryMode : "off"}
        compact
        hideWhenEmpty
      />
      {decisionObjective && (
        <div className="details-section">
          <span className="details-label">Objective</span>
          <p>{decisionObjective}</p>
          {objectiveInferred && (
            <span className="inline-badge muted-badge">inferred</span>
          )}
        </div>
      )}
      {(strategyTrace || agentCosts.strategy) && (
        <div className="details-section">
          <span className="details-label">Model</span>
          <p className="details-meta">
            {strategyTrace
              ? `${strategyTrace.provider} / ${strategyTrace.model}`
              : AGENT_PROVIDERS.strategy}
            {agentMeta.strategy.durationMs != null && (
              <> · {formatDuration(agentMeta.strategy.durationMs)}</>
            )}
          </p>
        </div>
      )}
      {routerDecision && (
        <div className="details-section">
          <span className="details-label">Route</span>
          <p className="details-meta">
            Direct Answer · {routerDecision.confidence}% confidence
          </p>
          {routerDecision.reason && (
            <p className="muted details-reason">{routerDecision.reason}</p>
          )}
        </div>
      )}
      {costSummary && (
        <div className="details-section">
          <span className="details-label">Cost</span>
          <RunCostSummaryBlock summary={costSummary} />
          {agentCosts.strategy && <AgentCostBlock cost={agentCosts.strategy} />}
        </div>
      )}
      {hasExternalContext && executionTrace?.externalContext && (
        <div className="details-section">
          <ExternalContextTraceSection externalContext={executionTrace.externalContext} />
        </div>
      )}
      {executionTrace?.visionAnalysis && (
        <div className="details-section">
          <VisionAnalysisTraceSection visionAnalysis={executionTrace.visionAnalysis} />
        </div>
      )}
      {executionTrace?.visionMemoryGuard && (
        <div className="details-section">
          <VisionMemoryGuardTraceSection visionMemoryGuard={executionTrace.visionMemoryGuard} />
        </div>
      )}
      {executionTrace && (
        <div className="details-section">
          <span className="details-label">Processing</span>
          <ExecutionTraceSection
            executionTrace={executionTrace}
            workflows={workflows}
            includeExternalContext={!hasExternalContext}
          />
        </div>
      )}
    </div>
  );
}

export interface CouncilCostAndTraceProps {
  costSummary: RunCostSummary | null;
  agentCosts: Partial<Record<AgentId, AgentCost>>;
  agentMeta: Record<AgentId, AgentMeta>;
  agentLabels?: Record<AgentId, string>;
  executionTrace: CouncilExecutionTrace | null;
  routerPending: boolean;
  routerDecision: RouterDecision | null;
  outputs: AgentOutputs;
  workflows: WorkflowOption[];
}

export function CouncilCostAndTrace({
  costSummary,
  agentCosts,
  agentMeta,
  agentLabels,
  executionTrace,
  routerPending,
  routerDecision,
  outputs,
  workflows,
}: CouncilCostAndTraceProps) {
  return (
    <div className="cost-trace-panel">
      {costSummary && (
        <>
          {executionTrace?.sequentialChainLabel && (
            <div className="sequential-verified-banner">
              {executionTrace.sequentialChainLabel}
            </div>
          )}
          <RunCostSummaryBlock summary={costSummary} />
          {AGENT_ORDER.map((id) =>
            agentCosts[id] ? (
              <div key={id} className="agent-cost-item">
                <strong>{agentDisplayName(id, agentMeta[id], agentLabels)}</strong>
                <AgentCostBlock cost={agentCosts[id]} />
              </div>
            ) : null,
          )}
        </>
      )}
      <TimelineSection
        isDirectAnswer={false}
        routerPending={routerPending}
        routerDecision={routerDecision}
        agentMeta={agentMeta}
        agentLabels={agentLabels}
        outputs={outputs}
        workflows={workflows}
        executionTrace={executionTrace}
      />
      {executionTrace && (
        <ExecutionTraceSection executionTrace={executionTrace} workflows={workflows} />
      )}
    </div>
  );
}

export function AgentOutputsList({
  outputs,
  agentMeta,
  agentLabels,
  isDirectAnswer,
}: {
  outputs: AgentOutputs;
  agentMeta: Record<AgentId, AgentMeta>;
  agentLabels?: Record<AgentId, string>;
  isDirectAnswer: boolean;
}) {
  return (
    <div className="agent-outputs-list">
      {AGENT_ORDER.map((id) => {
        if (isDirectAnswer && id !== "strategy") return null;
        const output = outputs[id];
        const meta = agentMeta[id];
        if (!output && meta.status !== "error") return null;
        return (
          <div key={id} className="agent-output-item">
            <div className="agent-output-header">
              <strong>{agentDisplayName(id, meta, agentLabels)}</strong>
              <span className="panel-tag">{AGENT_PROVIDERS[id]}</span>
            </div>
            {meta.status === "error" && !output ? (
              <div className="output-error">{meta.error}</div>
            ) : (
              <MarkdownContent content={output || "—"} compact />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ErrorsList({
  errors,
  agentMeta,
  agentLabels,
}: {
  errors: { agent: AgentId; message: string }[];
  agentMeta: Record<AgentId, AgentMeta>;
  agentLabels?: Record<AgentId, string>;
}) {
  if (errors.length > 0) {
    return (
      <ul className="errors-list">
        {errors.map((e, i) => (
          <li key={i}>
            <strong>{labelForAgent(e.agent, agentLabels)}:</strong> {e.message}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="errors-list">
      {AGENT_ORDER.filter((id) => agentMeta[id].status === "error").map((id) => (
        <li key={id}>
          <strong>{agentDisplayName(id, agentMeta[id], agentLabels)}:</strong>{" "}
          {agentMeta[id].error}
        </li>
      ))}
    </ul>
  );
}

export function DirectAnswerDetailsCollapsible({
  children,
  defaultOpen = false,
}: {
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <div className="response-details-wrap" data-testid="response-details">
      <Collapsible title="Details" testId="direct-answer-details" defaultOpen={defaultOpen}>
        {children}
      </Collapsible>
    </div>
  );
}
