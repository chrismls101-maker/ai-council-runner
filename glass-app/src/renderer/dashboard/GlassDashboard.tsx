import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Settings } from "lucide-react";
import type {
  AgentRunRow,
  AgentRunStatus,
  GlassDashboardAgentEvent,
  GlassState,
  MessageRow,
  SessionRowWithMeta,
  UserContextRow,
} from "../../shared/ipc.ts";
import { formatRelativeTime } from "../../shared/relativeTime.ts";

type ProviderDot = "ok" | "missing" | "unconfigured";
type CouncilRole = "strategy" | "critic" | "judge";
type StepStatus = "pending" | "active" | "done" | "failed";

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
  const [councilPanelExpanded, setCouncilPanelExpanded] = useState(true);
  const [invokeText, setInvokeText] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sessionMessages, setSessionMessages] = useState<MessageRow[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [userContext, setUserContext] = useState<UserContextRow[]>([]);

  useEffect(() => {
    void window.glass.getState().then(setGlassState);
    return window.glass.onState(setGlassState);
  }, []);

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
      const [sessions, councilRows, contextRows] = await Promise.all([
        window.glass.getRecentSessions(),
        window.glass.getLastCouncilRun(),
        window.glass.getUserContext(),
      ]);
      setRecentSessions(sessions);
      setUserContext(contextRows);
      if (councilRows && councilRows.length > 0) {
        setCouncilRun(councilStateFromAgentRuns(councilRows));
      }
    })();
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

  const handleClose = useCallback((): void => {
    if (onClose) {
      onClose();
      return;
    }
    window.glass.closeDashboard();
  }, [onClose]);

  const handleSelectSession = useCallback(async (sessionId: string): Promise<void> => {
    setSelectedSessionId(sessionId);
    setLoadingMessages(true);
    try {
      const msgs = await window.glass.getSessionMessages(sessionId);
      setSessionMessages(msgs);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  const handleDeleteContext = useCallback(async (key: string): Promise<void> => {
    await window.glass.deleteUserContextKey(key);
    setUserContext((prev) => prev.filter((row) => row.key !== key));
  }, []);

  function contextSourceClass(source: string): string {
    if (source === "onboarding" || source === "explicit") {
      return "glass-dashboard__context-source glass-dashboard__context-source--explicit";
    }
    return "glass-dashboard__context-source glass-dashboard__context-source--inferred";
  }

  return (
    <div
      className={`glass-dashboard-shell${visible ? "" : " glass-dashboard-shell--hidden"}`}
      data-testid="glass-dashboard-shell"
    >
      <div className="glass-dashboard" data-testid="glass-dashboard">
      <header className="glass-dashboard__titlebar" data-testid="glass-dashboard-titlebar">
        <span className="glass-dashboard__title">Glass Dashboard</span>
        <div className="glass-dashboard__titlebar-actions">
          <button
            type="button"
            className="glass-dashboard__settings-btn"
            aria-label="Open Settings"
            onClick={() => window.glass.openSettings()}
          >
            <Settings size={22} strokeWidth={2} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="glass-dashboard__close"
            aria-label="Close dashboard"
            onClick={handleClose}
          >
            ×
          </button>
        </div>
      </header>

      <div className="glass-dashboard__pulse" data-testid="glass-dashboard-pulse">
        <div className="glass-dashboard__pulse-left">
          <span className={providerDotClass(anthropicDot)} title="Anthropic" />
          <span className="glass-dashboard__provider-label">Anthropic</span>
          <span className={providerDotClass(openAiDot)} title="OpenAI" />
          <span className="glass-dashboard__provider-label glass-dashboard__provider-label--muted">
            OpenAI
          </span>
        </div>
        <div className="glass-dashboard__pulse-center">{screenLabel}</div>
        <div className="glass-dashboard__pulse-right">
          {activeAgent ? <span className="glass-dashboard__agent-active">{activeAgent}</span> : null}
        </div>
      </div>

      <div
        className={`glass-dashboard__body${councilPanelExpanded ? "" : " glass-dashboard__body--council-collapsed"}`}
      >
        <main className="glass-dashboard__main">
          {selectedSessionId ? (
            <section className="glass-dashboard__session-detail">
              <button
                type="button"
                className="glass-dashboard__back"
                onClick={() => {
                  setSelectedSessionId(null);
                  setSessionMessages([]);
                }}
              >
                ← Back
              </button>
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
          ) : (
            <>
              <section className="glass-dashboard__suggestions">
                <p className="glass-dashboard__section-label">Suggestions</p>
                <div className="glass-dashboard__chips">
                  <span className="glass-dashboard__chip">Coming soon</span>
                  <span className="glass-dashboard__chip">Coming soon</span>
                </div>
              </section>

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
                        <span className="glass-dashboard__session-title">
                          {sessionDisplayLabel(session)}
                        </span>
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
            </>
          )}

          <form className="glass-dashboard__invoke" onSubmit={submitInvoke}>
            <input
              type="text"
              className="glass-dashboard__invoke-input"
              placeholder="Ask IIVO anything…"
              value={invokeText}
              onChange={(e) => setInvokeText(e.target.value)}
              aria-label="Ask IIVO"
            />
            <button type="submit" className="glass-dashboard__invoke-send" disabled={!invokeText.trim()}>
              Send
            </button>
          </form>
        </main>

        <aside
          className={`glass-dashboard__agents${councilPanelExpanded ? "" : " glass-dashboard__agents--collapsed"}`}
        >
          <div className="glass-dashboard__agents-header">
            <p
              className={`glass-dashboard__section-label${councilPanelExpanded ? "" : " glass-dashboard__section-label--rail"}`}
            >
              Council
            </p>
            <button
              type="button"
              className="glass-dashboard__agents-collapse"
              onClick={() => setCouncilPanelExpanded((v) => !v)}
              aria-expanded={councilPanelExpanded}
              aria-label={councilPanelExpanded ? "Collapse council panel" : "Expand council panel"}
              title={councilPanelExpanded ? "Collapse panel" : "Expand panel"}
            >
              {councilPanelExpanded ? (
                <ChevronRight size={15} strokeWidth={2} aria-hidden="true" />
              ) : (
                <ChevronLeft size={15} strokeWidth={2} aria-hidden="true" />
              )}
            </button>
          </div>

          {councilPanelExpanded ? (
            hasCouncilRun ? (
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
                        onClick={() =>
                          setExpandedStep((prev) => (prev === role ? null : role))
                        }
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
            ) : (
              <div className="glass-dashboard__empty glass-dashboard__empty--compact">
                <p>No council runs yet</p>
              </div>
            )
          ) : null}

          {councilPanelExpanded ? (
            <section className="glass-dashboard__memory">
              <p className="glass-dashboard__section-label">What IIVO knows</p>
              {userContext.length > 0 ? (
                <ul className="glass-dashboard__context-list">
                  {userContext.map((entry) => (
                    <li key={entry.key} className="glass-dashboard__context-item">
                      <span className="glass-dashboard__context-key">
                        {entry.key.replace(/_/g, " ")}
                      </span>
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
          ) : null}
        </aside>
      </div>
    </div>
    </div>
  );
}
