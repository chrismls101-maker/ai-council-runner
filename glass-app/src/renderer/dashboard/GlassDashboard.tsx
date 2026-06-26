import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Brain,
  GitBranch,
  History,
  LayoutGrid,
  MessageSquare,
  PlugZap,
  Settings,
  Shield,
} from "lucide-react";
import type {
  AgentRunRow,
  AgentRunStatus,
  AgentBusHealthSnapshot,
  GlassDashboardAgentEvent,
  GlassState,
  MessageRow,
  ModelCallRow,
  RetentionSummary,
  SessionRowWithMeta,
  SessionSpendSummary,
  UserContextRow,
} from "../../shared/ipc.ts";
import { formatCoderRunUsageUsd } from "../../shared/coderAgentModels.ts";
import { formatRelativeTime } from "../../shared/relativeTime.ts";
import { parseGlassDashboardNav } from "../../shared/glassDashboardNav.ts";
import { send } from "../useGlassState.ts";
import FounderTab from "../panel/FounderTab.tsx";
import { GlassHoverTooltip } from "../components/GlassHoverTooltip.tsx";
import { DashboardSetupView } from "./DashboardSetupView.tsx";
import { armDashboardOverlayPointer } from "../glassTextInteraction.ts";
import { SpendTrackerPanel } from "../builder/SpendTrackerPanel.tsx";
import "../styles/glass.css";

type ProviderDot = "ok" | "missing" | "unconfigured";
type CouncilRole = "strategy" | "critic" | "judge";
type StepStatus = "pending" | "active" | "done" | "failed";
type DashboardNav = "setup" | "overview" | "sessions" | "council" | "memory" | "ask" | "founder";

interface CouncilStepState {
  status: StepStatus;
  content: string;
}

interface CouncilRunState {
  runId: string;
  steps: Record<CouncilRole, CouncilStepState>;
}

const COUNCIL_ORDER: CouncilRole[] = ["strategy", "critic", "judge"];

const COUNCIL_LABELS: Record<CouncilRole, string> = {
  strategy: "Strategy",
  critic: "Critic",
  judge: "Judge",
};

function providerDotClass(dot: ProviderDot): string {
  if (dot === "ok") return "glass-dashboard__dot glass-dashboard__dot--ok";
  if (dot === "missing") return "glass-dashboard__dot glass-dashboard__dot--error";
  return "glass-dashboard__dot glass-dashboard__dot--muted";
}

function formatScreenContext(status: GlassState["screenContextStatus"]): string {
  if (!status || status.kind === "none") return "○ Context paused";
  if (status.kind === "looking") return `● ${status.label.replace(/^Screen:\s*/i, "")}`;
  if (status.kind === "captured" || status.kind === "ready") {
    const app = status.detail?.trim() || status.label.replace(/^Screen:\s*/i, "") || "Active";
    return `● ${app}`;
  }
  return `○ ${status.label}`;
}

function agentLabelFromEvent(event: GlassDashboardAgentEvent): string | null {
  const { type, payload } = event;
  if (type === "orchestrator.task.created") {
    const target = (payload as { targetAgentId?: string })?.targetAgentId;
    if (target === "council") return "⟳ Council · running";
    if (target) return `⟳ ${target} · running`;
  }
  if (type === "agent.writing.started") return "✍ Writing";
  if (type === "agent.research.started") return "⟳ Research · running";
  if (type === "agent.coder.started") return "⟳ Coder · running";
  if (type === "agent.writing.complete") return null;
  if (type === "agent.research.complete") return null;
  if (type === "agent.coder.complete") return null;
  if (type === "delivery.complete") return null;
  return null;
}

function emptyCouncilRun(): CouncilRunState {
  return {
    runId: "",
    steps: {
      strategy: { status: "pending", content: "" },
      critic: { status: "pending", content: "" },
      judge: { status: "pending", content: "" },
    },
  };
}

function agentRunStatusToStepStatus(status: AgentRunStatus): StepStatus {
  if (status === "complete") return "done";
  if (status === "running") return "active";
  if (status === "failed") return "failed";
  return "pending";
}

function councilStateFromAgentRuns(rows: AgentRunRow[]): CouncilRunState {
  const runId = rows[0]?.correlation_id ?? "";
  const steps = { ...emptyCouncilRun().steps };
  for (const role of COUNCIL_ORDER) {
    const row = rows.find((r) => r.agent_id === role);
    if (row) {
      steps[role] = {
        status: agentRunStatusToStepStatus(row.status),
        content: row.output ?? "",
      };
    }
  }
  return { runId, steps };
}

function sessionDisplayLabel(session: SessionRowWithMeta): string {
  const raw =
    session.title?.trim() ||
    session.first_message_preview?.trim() ||
    session.agent_type?.trim() ||
    "Session";
  return raw.length > 60 ? `${raw.slice(0, 60)}…` : raw;
}

function councilHasVisibleRun(run: CouncilRunState | null): boolean {
  if (!run) return false;
  if (run.runId) return true;
  return COUNCIL_ORDER.some((role) => run.steps[role].status !== "pending");
}

function applyCouncilEvent(
  prev: CouncilRunState | null,
  event: GlassDashboardAgentEvent,
): CouncilRunState | null {
  if (event.type === "orchestrator.task.created") {
    const target = (event.payload as { targetAgentId?: string })?.targetAgentId;
    if (target !== "council") return prev;
    return {
      runId: event.runId,
      steps: {
        strategy: { status: "active", content: "" },
        critic: { status: "pending", content: "" },
        judge: { status: "pending", content: "" },
      },
    };
  }

  if (event.type === "session.enriched") {
    const role = (event.payload as { role?: CouncilRole; content?: string })?.role;
    const content = (event.payload as { content?: string })?.content ?? "";
    if (!role || !COUNCIL_ORDER.includes(role)) return prev;

    const base = prev?.runId === event.runId ? prev : emptyCouncilRun();
    const next: CouncilRunState = {
      runId: event.runId || base.runId,
      steps: { ...base.steps },
    };

    const roleIdx = COUNCIL_ORDER.indexOf(role);
    for (let i = 0; i < COUNCIL_ORDER.length; i += 1) {
      const key = COUNCIL_ORDER[i]!;
      if (i < roleIdx) {
        next.steps[key] = { status: "done", content: base.steps[key].content };
      } else if (i === roleIdx) {
        next.steps[key] = { status: "done", content };
      } else if (i === roleIdx + 1) {
        next.steps[key] = { status: "active", content: base.steps[key].content };
      } else {
        next.steps[key] = { status: "pending", content: base.steps[key].content };
      }
    }
    return next;
  }

  if (event.type === "delivery.complete") {
    const agentId = (event.payload as { agentId?: string })?.agentId;
    if (agentId !== "council") return prev;
    const base = prev?.runId === event.runId ? prev : emptyCouncilRun();
    return {
      runId: event.runId || base.runId,
      steps: {
        strategy: { status: "done", content: base.steps.strategy.content },
        critic: { status: "done", content: base.steps.critic.content },
        judge: {
          status: "done",
          content:
            (event.payload as { judgeAnswer?: string })?.judgeAnswer ??
            base.steps.judge.content,
        },
      },
    };
  }

  return prev;
}

function councilMarker(step: CouncilStepState): string {
  if (step.status === "done") return "✓";
  if (step.status === "active") return "◉";
  if (step.status === "failed") return "✗";
  return "○";
}

type GlassDashboardProps = {
  visible?: boolean;
  onClose?: () => void;
};

export function GlassDashboard({ visible = true, onClose }: GlassDashboardProps): JSX.Element {
  const [glassState, setGlassState] = useState<GlassState | null>(null);
  const [anthropicDot, setAnthropicDot] = useState<ProviderDot>("missing");
  const [openAiDot, setOpenAiDot] = useState<ProviderDot>("unconfigured");
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [councilRun, setCouncilRun] = useState<CouncilRunState | null>(null);
  const [recentSessions, setRecentSessions] = useState<SessionRowWithMeta[]>([]);
  const [expandedStep, setExpandedStep] = useState<CouncilRole | null>(null);
  const [activeNav, setActiveNav] = useState<DashboardNav>("setup");
  const [invokeText, setInvokeText] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sessionMessages, setSessionMessages] = useState<MessageRow[]>([]);
  const [sessionSpend, setSessionSpend] = useState<SessionSpendSummary | null>(null);
  const [sessionCalls, setSessionCalls] = useState<ModelCallRow[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [userContext, setUserContext] = useState<UserContextRow[]>([]);
  const [retentionSummary, setRetentionSummary] = useState<RetentionSummary | null>(null);
  const [busHealth, setBusHealth] = useState<AgentBusHealthSnapshot | null>(null);

  useEffect(() => {
    void window.glass.getState().then(setGlassState);
    return window.glass.onState(setGlassState);
  }, []);

  useEffect(() => {
    if (!visible) return;
    document.body.classList.add("glass-body--workspace-active");
    armDashboardOverlayPointer();
    return () => {
      document.body.classList.remove("glass-body--workspace-active");
    };
  }, [visible]);

  useEffect(() => {
    if (!visible || !glassState?.glassDashboardNav) return;
    const nav = parseGlassDashboardNav(glassState.glassDashboardNav);
    if (nav) {
      setActiveNav(nav);
      send({ type: "clear-dashboard-nav" });
    }
  }, [visible, glassState?.glassDashboardNav]);

  useEffect(() => {
    void (async () => {
      const [anthropic, openai] = await Promise.all([
        window.glass.apiKeyGetMasked("anthropic"),
        window.glass.apiKeyGetMasked("openai"),
      ]);
      setAnthropicDot(anthropic.masked ? "ok" : "missing");
      setOpenAiDot(openai.masked ? "ok" : "unconfigured");
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      const [sessions, councilRows, contextRows, retention, bus] = await Promise.all([
        window.glass.getRecentSessions(),
        window.glass.getLastCouncilRun(),
        window.glass.getUserContext(),
        window.glass.getRetentionSummary(),
        window.glass.getAgentBusHealth(),
      ]);
      setRecentSessions(sessions);
      setUserContext(contextRows);
      setRetentionSummary(retention);
      setBusHealth(bus);
      if (councilRows && councilRows.length > 0) {
        setCouncilRun(councilStateFromAgentRuns(councilRows));
      }
    })();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void window.glass.getAgentBusHealth().then(setBusHealth);
    }, 10_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    return window.glass.onDashboardAgentEvent((event) => {
      const label = agentLabelFromEvent(event);
      if (label) setActiveAgent(label);
      if (
        event.type === "delivery.complete" ||
        event.type === "agent.research.complete" ||
        event.type === "agent.writing.complete" ||
        event.type === "agent.coder.complete"
      ) {
        setActiveAgent(null);
      }
      setCouncilRun((prev) => applyCouncilEvent(prev, event));
      if (event.type === "delivery.complete" || event.type === "session.enriched") {
        void window.glass.getRecentSessions().then(setRecentSessions);
      }
    });
  }, []);

  const screenLabel = useMemo(
    () => formatScreenContext(glassState?.screenContextStatus),
    [glassState?.screenContextStatus],
  );

  const submitInvoke = useCallback(
    (e: React.FormEvent): void => {
      e.preventDefault();
      const text = invokeText.trim();
      if (!text) return;
      window.glass.send({ type: "submit-command", text });
      setInvokeText("");
    },
    [invokeText],
  );

  const hasCouncilRun = councilHasVisibleRun(councilRun);
  const hasSessions = recentSessions.length > 0;
  const busDot: ProviderDot = !busHealth
    ? "unconfigured"
    : busHealth.staleSubscribers.length > 0
      ? "missing"
      : "ok";
  const busTitle = busHealth?.staleSubscribers.length
    ? `Agent bus degraded: ${busHealth.staleSubscribers.join(", ")}`
    : "Agent bus healthy";
  const isFounder = glassState?.iivoAccountLink?.role === "founder";

  const handleClose = useCallback((): void => {
    if (onClose) {
      onClose();
      return;
    }
    window.glass.closeDashboard();
  }, [onClose]);

  const clearSessionDetail = useCallback((): void => {
    setSelectedSessionId(null);
    setSessionMessages([]);
    setSessionSpend(null);
    setSessionCalls([]);
  }, []);

  const handleSelectSession = useCallback(async (sessionId: string): Promise<void> => {
    setSelectedSessionId(sessionId);
    setLoadingMessages(true);
    try {
      const [msgs, spend] = await Promise.all([
        window.glass.getSessionMessages(sessionId),
        window.glass.getSessionSpend(sessionId),
      ]);
      setSessionMessages(msgs);
      setSessionSpend(spend.summary);
      setSessionCalls(spend.calls);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  const handleDeleteContext = useCallback(async (key: string): Promise<void> => {
    await window.glass.deleteUserContextKey(key);
    setUserContext((prev) => prev.filter((row) => row.key !== key));
  }, []);

  const handleNavSelect = useCallback(
    (nav: DashboardNav): void => {
      setActiveNav(nav);
      if (nav !== "sessions") {
        clearSessionDetail();
      }
    },
    [clearSessionDetail],
  );

  function contextSourceClass(source: string): string {
    if (source === "onboarding" || source === "explicit") {
      return "glass-dashboard__context-source glass-dashboard__context-source--explicit";
    }
    return "glass-dashboard__context-source glass-dashboard__context-source--inferred";
  }

  const navItems: { id: DashboardNav; label: string; tooltip: string; icon: JSX.Element }[] = [
    {
      id: "setup",
      label: "Setup",
      tooltip: "Setup & connections",
      icon: <PlugZap size={20} strokeWidth={2} aria-hidden="true" />,
    },
    {
      id: "overview",
      label: "Overview",
      tooltip: "Overview & live activity",
      icon: <LayoutGrid size={20} strokeWidth={2} aria-hidden="true" />,
    },
    {
      id: "sessions",
      label: "Sessions",
      tooltip: "Session history",
      icon: <History size={20} strokeWidth={2} aria-hidden="true" />,
    },
    {
      id: "council",
      label: "Council",
      tooltip: "Council deliberation",
      icon: <GitBranch size={20} strokeWidth={2} aria-hidden="true" />,
    },
    {
      id: "memory",
      label: "Memory",
      tooltip: "What IIVO knows",
      icon: <Brain size={20} strokeWidth={2} aria-hidden="true" />,
    },
    {
      id: "ask",
      label: "Ask",
      tooltip: "Ask IIVO",
      icon: <MessageSquare size={20} strokeWidth={2} aria-hidden="true" />,
    },
  ];

  if (isFounder) {
    navItems.push({
      id: "founder",
      label: "Founder",
      tooltip: "Founder operations",
      icon: <Shield size={20} strokeWidth={2} aria-hidden="true" />,
    });
  }

  const renderCouncilRail = (): JSX.Element => {
    if (!hasCouncilRun) {
      return (
        <div className="glass-dashboard__empty glass-dashboard__empty--compact">
          <p>No council runs yet</p>
        </div>
      );
    }

    return (
      <ol className="glass-dashboard__council-rail">
        {COUNCIL_ORDER.map((role, index) => {
          const step = councilRun!.steps[role];
          const expanded = expandedStep === role;
          return (
            <li
              key={role}
              className={`glass-dashboard__council-step glass-dashboard__council-step--${step.status}`}
            >
              {index > 0 ? (
                <span className="glass-dashboard__council-line" aria-hidden="true" />
              ) : null}
              <button
                type="button"
                className="glass-dashboard__council-node"
                disabled={step.status !== "done" || !step.content}
                onClick={() => setExpandedStep((prev) => (prev === role ? null : role))}
              >
                <span className="glass-dashboard__council-marker" aria-hidden="true">
                  {councilMarker(step)}
                </span>
                <span className="glass-dashboard__council-name">{COUNCIL_LABELS[role]}</span>
              </button>
              {expanded && step.content ? (
                <pre className="glass-dashboard__council-output">{step.content}</pre>
              ) : null}
            </li>
          );
        })}
      </ol>
    );
  };

  const renderSessionList = (): JSX.Element => (
    <section className="glass-dashboard__sessions">
      <p className="glass-dashboard__section-label">Recent sessions</p>
      {hasSessions ? (
        <ul className="glass-dashboard__session-list" data-testid="glass-dashboard-session-list">
          {recentSessions.map((session) => (
            <li
              key={session.id}
              className="glass-dashboard__session-item glass-dashboard__session-item--clickable"
              data-testid="glass-dashboard-session-row"
              onClick={() => void handleSelectSession(session.id)}
            >
              <span className="glass-dashboard__session-time">
                {formatRelativeTime(session.updated_at)}
              </span>
              {session.agent_type ? (
                <span className="glass-dashboard__session-badge">{session.agent_type}</span>
              ) : null}
              <span className="glass-dashboard__session-title">{sessionDisplayLabel(session)}</span>
              {(session.spend_usd ?? 0) > 0 ? (
                <span className="glass-dashboard__session-spend-pill">
                  {formatCoderRunUsageUsd(session.spend_usd ?? 0)}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="glass-dashboard__empty" data-testid="glass-dashboard-sessions-empty">
          <span className="glass-dashboard__empty-icon" aria-hidden="true">
            ◌
          </span>
          <p>No sessions yet</p>
        </div>
      )}
    </section>
  );

  const renderSessionDetail = (): JSX.Element => (
    <section className="glass-dashboard__session-detail">
      <button type="button" className="glass-dashboard__back" onClick={clearSessionDetail}>
        ← Back
      </button>
      {sessionSpend && sessionSpend.callCount > 0 ? (
        <div
          className="glass-dashboard__session-spend"
          data-testid="glass-dashboard-session-spend"
        >
          <p className="glass-dashboard__section-label">Session spend</p>
          <p>
            {formatCoderRunUsageUsd(sessionSpend.totalUsd)} · {sessionSpend.callCount} model call
            {sessionSpend.callCount === 1 ? "" : "s"} ·{" "}
            {sessionSpend.inputTokens.toLocaleString()} in /{" "}
            {sessionSpend.outputTokens.toLocaleString()} out
          </p>
          {sessionCalls.length > 0 ? (
            <ul className="glass-dashboard__spend-calls">
              {sessionCalls.slice(0, 8).map((call) => (
                <li key={call.id}>
                  {call.source} · {call.model} · {formatCoderRunUsageUsd(call.estimated_usd)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {loadingMessages ? (
        <p className="glass-dashboard__loading">Loading…</p>
      ) : sessionMessages.length > 0 ? (
        <ul className="glass-dashboard__message-list">
          {sessionMessages.map((msg) => (
            <li
              key={msg.id}
              className={`glass-dashboard__message glass-dashboard__message--${msg.role}`}
            >
              <span className="glass-dashboard__message-role">{msg.role}</span>
              <p className="glass-dashboard__message-content">{msg.content}</p>
            </li>
          ))}
        </ul>
      ) : (
        <div className="glass-dashboard__empty glass-dashboard__empty--compact">
          <p>No messages in this session yet</p>
        </div>
      )}
    </section>
  );

  const renderMemoryTable = (): JSX.Element => (
    <section className="glass-dashboard__memory glass-dashboard__memory--view">
      <p className="glass-dashboard__section-label">What IIVO knows</p>
      {userContext.length > 0 ? (
        <ul className="glass-dashboard__context-list">
          {userContext.map((entry) => (
            <li key={entry.key} className="glass-dashboard__context-item">
              <span className="glass-dashboard__context-key">{entry.key.replace(/_/g, " ")}</span>
              <span className="glass-dashboard__context-value">{entry.value}</span>
              <span className={contextSourceClass(entry.source)}>{entry.source}</span>
              <button
                type="button"
                className="glass-dashboard__context-delete"
                aria-label={`Remove ${entry.key}`}
                onClick={() => void handleDeleteContext(entry.key)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="glass-dashboard__empty glass-dashboard__empty--compact">
          <p>Nothing learned yet</p>
        </div>
      )}
    </section>
  );

  const renderMainContent = (): JSX.Element => {
    if (activeNav === "setup") {
      if (!glassState) {
        return (
          <div className="glass-dashboard__empty glass-dashboard__empty--compact">
            <p>Loading setup status…</p>
          </div>
        );
      }
      return <DashboardSetupView state={glassState} />;
    }

    if (activeNav === "overview") {
      return (
        <>
          <div className="glass-dashboard__pulse" data-testid="glass-dashboard-pulse">
            <div className="glass-dashboard__pulse-left">
              <span className={providerDotClass(anthropicDot)} title="Anthropic" />
              <span className="glass-dashboard__provider-label">Anthropic</span>
              <span className={providerDotClass(openAiDot)} title="OpenAI" />
              <span className="glass-dashboard__provider-label glass-dashboard__provider-label--muted">
                OpenAI
              </span>
              <span className={providerDotClass(busDot)} title={busTitle} />
              <span className="glass-dashboard__provider-label glass-dashboard__provider-label--muted">
                Bus
              </span>
            </div>
            <div className="glass-dashboard__pulse-center">{screenLabel}</div>
            <div className="glass-dashboard__pulse-right">
              {activeAgent ? (
                <span className="glass-dashboard__agent-active">{activeAgent}</span>
              ) : null}
            </div>
          </div>

          {retentionSummary ? (
            <section
              className="glass-dashboard__retention"
              data-testid="glass-dashboard-retention"
            >
              <p className="glass-dashboard__section-label">Activity (7 days)</p>
              <ul className="glass-dashboard__retention-stats">
                <li>Sessions: {retentionSummary.sessionsLast7Days}</li>
                <li>Workflows / session: {retentionSummary.workflowsPerSession}</li>
                <li>
                  Autofix acceptance: {Math.round(retentionSummary.autofixAcceptanceRate * 100)}%
                </li>
                <li>
                  Build loop success: {Math.round(retentionSummary.buildLoopSuccessRate * 100)}%
                </li>
              </ul>
            </section>
          ) : null}

          <section
            className="glass-dashboard__spend-overview"
            data-testid="glass-dashboard-spend-overview"
          >
            <p className="glass-dashboard__section-label">AI Spend</p>
            <SpendTrackerPanel />
          </section>
        </>
      );
    }

    if (activeNav === "sessions") {
      return selectedSessionId ? renderSessionDetail() : renderSessionList();
    }

    if (activeNav === "council") {
      return (
        <section className="glass-dashboard__council-view">
          <p className="glass-dashboard__section-label">Council</p>
          {renderCouncilRail()}
        </section>
      );
    }

    if (activeNav === "memory") {
      return renderMemoryTable();
    }

    if (activeNav === "ask") {
      return (
        <section className="glass-dashboard__ask-view">
          <div className="glass-dashboard__ask-inner">
            <p className="glass-dashboard__section-label glass-dashboard__section-label--centered">
              Ask IIVO
            </p>
            <form className="glass-dashboard__invoke" onSubmit={submitInvoke}>
              <input
                type="text"
                className="glass-dashboard__invoke-input"
                placeholder="Ask IIVO anything…"
                value={invokeText}
                onChange={(e) => setInvokeText(e.target.value)}
                aria-label="Ask IIVO"
              />
              <button
                type="submit"
                className="glass-dashboard__invoke-send"
                disabled={!invokeText.trim()}
              >
                Send
              </button>
            </form>
          </div>
        </section>
      );
    }

    if (activeNav === "founder" && isFounder && glassState?.iivoAccountLink) {
      return (
        <section className="glass-dashboard__founder-view">
          <FounderTab state={glassState} link={glassState.iivoAccountLink} />
        </section>
      );
    }

    return <></>;
  };

  return (
    <div
      className={`glass-dashboard-shell${visible ? "" : " glass-dashboard-shell--hidden"}`}
      data-testid="glass-dashboard-shell"
    >
      <div className="glass-dashboard" data-testid="glass-dashboard">
        <header className="glass-dashboard__titlebar" data-testid="glass-dashboard-titlebar">
          <span className="glass-dashboard__title">Glass Dashboard</span>
          <div className="glass-dashboard__titlebar-actions">
            <GlassHoverTooltip label="Close dashboard" placement="bottom">
              <button
                type="button"
                className="glass-dashboard__close"
                aria-label="Close dashboard"
                onClick={handleClose}
              >
                ×
              </button>
            </GlassHoverTooltip>
          </div>
        </header>

        <div className="glass-dashboard__body">
          <nav className="glass-dashboard__nav" aria-label="Dashboard navigation">
            {navItems.map((item) => (
              <GlassHoverTooltip key={item.id} label={item.tooltip} placement="right">
                <button
                  type="button"
                  className={`glass-dashboard__nav-item${activeNav === item.id ? " glass-dashboard__nav-item--active" : ""}`}
                  aria-label={item.label}
                  aria-current={activeNav === item.id ? "page" : undefined}
                  onClick={() => handleNavSelect(item.id)}
                >
                  {item.icon}
                </button>
              </GlassHoverTooltip>
            ))}
            <div className="glass-dashboard__nav-footer">
              <GlassHoverTooltip label="Glass settings" placement="right">
                <button
                  type="button"
                  className="glass-dashboard__nav-item glass-dashboard__nav-item--settings"
                  aria-label="Glass settings"
                  data-testid="glass-dashboard-settings"
                  onClick={() => window.glass.openSettings()}
                >
                  <Settings size={20} strokeWidth={2} aria-hidden="true" />
                </button>
              </GlassHoverTooltip>
            </div>
          </nav>

          <main className="glass-dashboard__main">{renderMainContent()}</main>
        </div>
      </div>
    </div>
  );
}
