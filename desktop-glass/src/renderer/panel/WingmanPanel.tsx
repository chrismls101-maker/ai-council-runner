/**
 * WingmanPanel — Hybrid design (Liquid Glass + Signal).
 *
 * State A — Inactive: goal input + Start button
 * State B — Active session: arc bar, vitals, spotlight, unified event feed,
 *            terminal toggle, inspect / end actions
 * State C — Report: arc bar recap, terminal events section, findings, not-verified
 *
 * Design principles:
 *   - Left + top edge glow in state color (error=red, healthy=green)
 *   - Signal arc bar: thin line + timestamp at right
 *   - Liquid Glass sections: glassy translucent backgrounds
 *   - Feed text is informative: "build error: TS2345", "inspect: null check missing"
 *   - Terminal toggle: opt-in, bottom of active panel
 *
 * No AI calls here — purely reflects WingmanState from IPC and fires commands.
 */

import { useState, useRef, useEffect } from "react";
import { send } from "../useGlassState.ts";
import type {
  WingmanState,
  WingmanInspection,
  WingmanReport,
  WingmanSession,
  TerminalEvent,
} from "../../shared/wingmanSession.ts";
import type { WingmanMemoryState, WingmanSessionRecord } from "../../shared/wingmanMemory.ts";
import { formatSessionAge, formatSessionDuration } from "../../shared/wingmanMemory.ts";

// ─── Props ────────────────────────────────────────────────────────────────────

interface WingmanPanelProps {
  wingman: WingmanState;
  wingmanMemory: WingmanMemoryState;
  detectedApp?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDurationMs(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "< 1 min";
  if (min === 1) return "1 min";
  return `${min} min`;
}

type SessionHealth = "error" | "healthy" | "neutral";

function getSessionHealth(session: WingmanSession): SessionHealth {
  if (session.terminalEvents.length === 0) return "neutral";
  // Last event determines health
  const last = session.terminalEvents[session.terminalEvents.length - 1];
  if (last.type === "build_success" || last.type === "test_pass") return "healthy";
  if (
    last.type === "build_error" ||
    last.type === "test_failure" ||
    last.type === "runtime_error"
  )
    return "error";
  return "neutral";
}

function countErrors(events: TerminalEvent[]): number {
  return events.filter(
    (e) =>
      e.type === "build_error" ||
      e.type === "test_failure" ||
      e.type === "runtime_error",
  ).length;
}

function lastSuccessLabel(events: TerminalEvent[]): string | null {
  const last = [...events]
    .reverse()
    .find((e) => e.type === "build_success" || e.type === "test_pass");
  if (!last) return null;
  // "9/9" from "tests pass: 9 passing" — extract count if present
  const m = last.snippet.match(/(\d+)/);
  return m ? `${m[1]} pass` : "pass";
}

type FeedPip = "red" | "green" | "purple" | "gray";

interface FeedEntry {
  key: string;
  pip: FeedPip;
  text: string;
  timestamp: number;
}

function buildFeedEntries(session: WingmanSession): FeedEntry[] {
  const entries: FeedEntry[] = [];

  // Terminal events (errors = red, successes = green)
  for (const e of session.terminalEvents) {
    const pip: FeedPip =
      e.type === "build_error" ||
      e.type === "test_failure" ||
      e.type === "runtime_error"
        ? "red"
        : "green";
    entries.push({ key: e.id, pip, text: e.label, timestamp: e.timestamp });
  }

  // Inspections (purple) — informative label
  for (const i of session.inspections) {
    const firstSentence = i.response.split(/[.!?]/)[0]?.trim() ?? "";
    const short =
      firstSentence.length > 70
        ? firstSentence.slice(0, 67) + "…"
        : firstSentence;
    entries.push({
      key: i.id,
      pip: "purple",
      text: `inspect: ${short}`,
      timestamp: i.timestamp,
    });
  }

  // User notes only (wingman auto-notes are terminal events, already in feed)
  for (const n of session.notes.filter((n) => n.source === "user")) {
    entries.push({
      key: n.id,
      pip: "gray",
      text: `note: ${n.content}`,
      timestamp: n.timestamp,
    });
  }

  return entries.sort((a, b) => a.timestamp - b.timestamp).slice(-5);
}

/** Compute arc fill width as a percentage (0–95) based on elapsed time. */
function arcFillPercent(session: WingmanSession): number {
  const elapsed = Date.now() - session.startedAt;
  // Treat 60 minutes as "full" — caps at 95% so there's always a visible unfilled edge
  return Math.min((elapsed / (60 * 60_000)) * 100, 95);
}

/** Position a terminal event dot on the arc (0–fillPercent). */
function arcDotLeft(
  eventTs: number,
  sessionStart: number,
  elapsedMs: number,
  fillPct: number,
): string {
  if (elapsedMs <= 0) return "0%";
  const fraction = (eventTs - sessionStart) / elapsedMs;
  return `${Math.min(Math.max(fraction * fillPct, 1), fillPct - 1)}%`;
}

function formatArcTime(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

// ─── Arc bar (shared between active + report) ─────────────────────────────────

interface ArcBarProps {
  session: WingmanSession;
  fillPct: number;
  arcTime: string;
  health: SessionHealth;
  /** If true, fill spans the whole line (report view replay). */
  fullReplay?: boolean;
}

function ArcBar({ session, fillPct, arcTime, health, fullReplay }: ArcBarProps): JSX.Element {
  const elapsedMs = (session.endedAt ?? Date.now()) - session.startedAt;
  const effectiveFill = fullReplay ? 100 : fillPct;
  const fillColor =
    health === "error"
      ? "rgba(226,75,74,0.85)"
      : health === "healthy"
        ? "rgba(123,186,58,0.85)"
        : "rgba(255,255,255,0.25)";

  return (
    <div className="wm-hb-arcrow" data-testid="wingman-arc-bar">
      <div className="wm-hb-arcline">
        <div
          className="wm-hb-arcfill"
          style={{ width: `${effectiveFill}%`, background: fillColor }}
        />
        {session.terminalEvents.map((e) => {
          const pip =
            e.type === "build_error" ||
            e.type === "test_failure" ||
            e.type === "runtime_error"
              ? "#e24b4a"
              : e.type === "build_success" || e.type === "test_pass"
                ? "#7bba3a"
                : "#7f77dd";
          return (
            <div
              key={e.id}
              className="wm-hb-dot"
              style={{
                background: pip,
                left: arcDotLeft(e.timestamp, session.startedAt, elapsedMs, effectiveFill),
              }}
              aria-hidden="true"
            />
          );
        })}
        {session.inspections.map((i) => (
          <div
            key={i.id}
            className="wm-hb-dot"
            style={{
              background: "#7f77dd",
              left: arcDotLeft(i.timestamp, session.startedAt, elapsedMs, effectiveFill),
            }}
            aria-hidden="true"
          />
        ))}
      </div>
      <span className="wm-hb-arctime">{arcTime}</span>
    </div>
  );
}

// ─── Past session card ────────────────────────────────────────────────────────

function PastSessionCard({ record }: { record: WingmanSessionRecord }): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const ageLabel = formatSessionAge(record);
  const durationLabel = formatSessionDuration(record.duration);
  const snippet = record.keyFindings[0] ?? record.summary.slice(0, 120);

  return (
    <div
      className="wingman-past-session"
      data-testid={`wingman-past-session-${record.id}`}
      role="button"
      tabIndex={0}
      onClick={() => setExpanded((x) => !x)}
      onKeyDown={(e) =>
        e.key === "Enter" || e.key === " " ? setExpanded((x) => !x) : undefined
      }
    >
      <div className="wingman-past-session__header">
        <span className="wingman-past-session__goal">{record.goal}</span>
        <span className="wingman-past-session__meta">
          {ageLabel} · {durationLabel}
        </span>
      </div>
      {!expanded && snippet && (
        <p className="wingman-past-session__snippet">{snippet}</p>
      )}
      {expanded && (
        <div className="wingman-past-session__detail">
          {record.summary && (
            <p className="wingman-past-session__summary">{record.summary}</p>
          )}
          {record.keyFindings.length > 0 && (
            <ul className="wingman-past-session__findings">
              {record.keyFindings.slice(0, 3).map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          )}
          {record.notVerified.length > 0 && (
            <p className="wingman-past-session__not-verified">
              Not verified: {record.notVerified.slice(0, 2).join("; ")}
            </p>
          )}
        </div>
      )}
      <span className="wingman-past-session__toggle" aria-hidden="true">
        {expanded ? "▲" : "▼"}
      </span>
    </div>
  );
}

// ─── Spotlight card (most recent noteworthy event) ────────────────────────────

function SpotlightCard({
  session,
  health,
  onInspect,
}: {
  session: WingmanSession;
  health: SessionHealth;
  onInspect: () => void;
}): JSX.Element | null {
  const lastTerminal =
    session.terminalEvents.length > 0
      ? session.terminalEvents[session.terminalEvents.length - 1]
      : null;
  const lastInspection = session.inspections.at(-1);

  if (health === "healthy" && lastTerminal) {
    return (
      <div className="wm-hb-spotlight wm-hb-spotlight--healthy">
        <div className="wm-hb-sh">
          <div className="wm-hb-pip wm-hb-pip--g" />
          <span className="wm-hb-stitle wm-hb-stitle--g">
            {lastTerminal.label}
          </span>
          <span className="wm-hb-stime">{formatArcTime(lastTerminal.timestamp)}</span>
        </div>
        <div className="wm-hb-sbody">
          Session looks healthy. Inspect to confirm what changed.
        </div>
      </div>
    );
  }

  if (health === "error" && lastTerminal) {
    return (
      <div className="wm-hb-spotlight wm-hb-spotlight--error" data-testid="wingman-terminal-spotlight">
        <div className="wm-hb-sh">
          <div className="wm-hb-pip wm-hb-pip--r" />
          <span className="wm-hb-stitle wm-hb-stitle--r">
            {lastTerminal.label.length > 50
              ? lastTerminal.label.slice(0, 47) + "…"
              : lastTerminal.label}
          </span>
          <span className="wm-hb-stime">{formatArcTime(lastTerminal.timestamp)}</span>
        </div>
        <div className="wm-hb-snip">{lastTerminal.snippet}</div>
        <div className="wm-hb-chips">
          <span
            className="wm-hb-chip wm-hb-chip--p"
            role="button"
            tabIndex={0}
            onClick={onInspect}
            onKeyDown={(e) => e.key === "Enter" && onInspect()}
          >
            Inspect screen
          </span>
        </div>
      </div>
    );
  }

  // Neutral — show last inspection if available
  if (lastInspection) {
    return (
      <div
        className="wm-hb-inspection-card"
        data-testid="wingman-last-inspection"
      >
        <div className="wm-hb-sh">
          <div className="wm-hb-pip wm-hb-pip--p" />
          <span className="wm-hb-stitle wm-hb-stitle--p">What I see</span>
          <span className="wm-hb-stime wm-hb-stime--confidence">
            {lastInspection.confidence}
          </span>
        </div>
        <p className="wm-hb-sbody">{lastInspection.response}</p>
        {lastInspection.scopeDriftWarning && (
          <p
            className="wm-hb-drift"
            data-testid="wingman-scope-drift-warning"
          >
            ⚠ {lastInspection.scopeDriftWarning}
          </p>
        )}
      </div>
    );
  }

  return null;
}

// ─── Report view ──────────────────────────────────────────────────────────────

function ReportView({
  report,
  session,
  memory,
  onNewSession,
}: {
  report: WingmanReport;
  session: WingmanSession | null;
  memory: WingmanMemoryState;
  onNewSession: () => void;
}): JSX.Element {
  const durationLabel = formatDurationMs(report.duration);

  useEffect(() => {
    send({ type: "wingman-search-sessions", query: report.goal });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pastSessions = memory.searchResults.slice(0, 3);
  const showPastSessions = pastSessions.length > 0 && memory.totalSessions > 1;

  const terminalEvents = report.terminalEvents ?? [];
  const errorEvents = terminalEvents.filter(
    (e) =>
      e.type === "build_error" ||
      e.type === "test_failure" ||
      e.type === "runtime_error",
  );
  const successEvents = terminalEvents.filter(
    (e) => e.type === "build_success" || e.type === "test_pass",
  );
  const reportHealth: SessionHealth =
    successEvents.length > 0 && errorEvents.length === 0
      ? "healthy"
      : errorEvents.length > 0 && successEvents.length > 0
        ? "healthy" // resolved
        : errorEvents.length > 0
          ? "error"
          : "neutral";

  // Build a pseudo-session for the arc bar replay
  const arcSession = session ?? {
    terminalEvents,
    inspections: [],
    id: "report",
    goal: report.goal,
    startedAt: Date.now() - report.duration,
    endedAt: Date.now(),
    appSnapshots: [],
    notes: [],
    loopWarning: false,
    terminalWatching: false,
  };

  return (
    <div className={`wm-hb-panel wm-hb-panel--${reportHealth}`} data-testid="wingman-report">

      {/* Arc bar replay */}
      <ArcBar
        session={arcSession}
        fillPct={100}
        arcTime={durationLabel}
        health={reportHealth}
        fullReplay
      />

      <div className="wm-hb-report-header">
        <div className="wm-hb-repstatus">
          <div
            className={`wm-hb-secdot wm-hb-secdot--${reportHealth === "error" ? "r" : "g"}`}
            aria-hidden="true"
          />
          <span className={`wm-hb-sectext wm-hb-sectext--${reportHealth === "error" ? "r" : "g"}`}>
            {reportHealth === "error" ? "Unresolved" : "Resolved"}
          </span>
        </div>
        <div className="wm-hb-reptitle" data-testid="wingman-report-title">
          Session report
        </div>
        <div className="wm-hb-repmeta" data-testid="wingman-report-meta">
          {durationLabel}
          {report.appsUsed.length > 0
            ? ` · ${report.appsUsed.slice(0, 3).join(", ")}`
            : ""}
        </div>
      </div>

      <div className="wm-hb-repbody">
        <div className="wm-hb-repgoal" data-testid="wingman-report-goal">
          {report.goal}
        </div>

        {/* What happened */}
        {report.summary && (
          <div className="wm-hb-rsec" data-testid="wingman-report-summary">
            <div className="wm-hb-rslbl">What happened</div>
            <div className="wm-hb-rsbody">{report.summary}</div>
          </div>
        )}

        {/* Terminal events */}
        {terminalEvents.length > 0 && (
          <div className="wm-hb-rsec" data-testid="wingman-report-terminal-events">
            <div className="wm-hb-rslbl">Terminal events</div>
            <div className="wm-hb-te-list">
              {terminalEvents.map((e) => {
                const isErr =
                  e.type === "build_error" ||
                  e.type === "test_failure" ||
                  e.type === "runtime_error";
                return (
                  <div key={e.id} className="wm-hb-te">
                    <div
                      className={`wm-hb-tepip ${isErr ? "wm-hb-tepip--r" : "wm-hb-tepip--g"}`}
                      aria-hidden="true"
                    />
                    <div className="wm-hb-tebody">
                      <div className="wm-hb-tetext">{e.label}</div>
                      {e.snippet !== e.label && (
                        <div className="wm-hb-tesnip">{e.snippet}</div>
                      )}
                    </div>
                    <span className="wm-hb-tetime">{formatArcTime(e.timestamp)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Key findings */}
        {report.keyFindings.length > 0 && (
          <div className="wm-hb-rsec" data-testid="wingman-report-findings">
            <div className="wm-hb-rslbl">Key findings</div>
            <div className="wm-hb-findings">
              {report.keyFindings.map((f, i) => (
                <div key={i} className="wm-hb-finding">
                  {f}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Could not verify */}
        {report.notVerified.length > 0 && (
          <div className="wm-hb-rsec" data-testid="wingman-report-not-verified">
            <div className="wm-hb-rslbl">Could not verify</div>
            <div className="wm-hb-uv">
              {report.notVerified.map((item, i) => (
                <div key={i} className="wm-hb-uvitem">
                  {item}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Warnings */}
        {report.warningsIssued.length > 0 && (
          <div className="wm-hb-rsec wm-hb-rsec--warn" data-testid="wingman-report-warnings">
            <div className="wm-hb-rslbl">Warnings</div>
            <div className="wm-hb-findings">
              {report.warningsIssued.map((w, i) => (
                <div key={i} className="wm-hb-finding">
                  {w}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Next steps */}
        {report.nextSteps.length > 0 && (
          <div className="wm-hb-rsec" data-testid="wingman-report-next-steps">
            <div className="wm-hb-rslbl">Next steps</div>
            <div className="wm-hb-findings">
              {report.nextSteps.map((step, i) => (
                <div key={i} className="wm-hb-finding">
                  {step}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Past similar sessions */}
        {showPastSessions && (
          <div
            className="wm-hb-rsec wingman-past-sessions"
            data-testid="wingman-past-sessions"
          >
            <div className="wm-hb-rslbl">Similar past sessions</div>
            {pastSessions.map((rec) => (
              <PastSessionCard key={rec.id} record={rec} />
            ))}
          </div>
        )}
        {memory.loading && (
          <div
            className="wingman-past-sessions__loading"
            data-testid="wingman-past-sessions-loading"
          >
            Looking up past sessions…
          </div>
        )}

        <button
          type="button"
          className="wm-hb-newbtn"
          data-testid="wingman-new-session-btn"
          onClick={onNewSession}
        >
          New session
        </button>
      </div>

      <div className="wm-hb-toggle">
        <span className="wm-hb-tlbl">Terminal watching</span>
        <span className="wm-hb-pill-off">Off next session</span>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function WingmanPanel({
  wingman,
  wingmanMemory,
  detectedApp,
}: WingmanPanelProps): JSX.Element {
  const [goalInput, setGoalInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [promptingInspect, setPromptingInspect] = useState(false);
  const goalInputRef = useRef<HTMLInputElement>(null);
  const noteInputRef = useRef<HTMLInputElement>(null);

  function resetLocalState(): void {
    setGoalInput("");
    setNoteInput("");
    setAddingNote(false);
    setCustomPrompt("");
    setPromptingInspect(false);
  }

  // ── State C: Report ──────────────────────────────────────────────────────────

  if (wingman.report && !wingman.active) {
    return (
      <ReportView
        report={wingman.report}
        session={wingman.session}
        memory={wingmanMemory}
        onNewSession={resetLocalState}
      />
    );
  }

  // ── State B: Active Session ──────────────────────────────────────────────────

  if (wingman.active && wingman.session) {
    const session = wingman.session;
    const health = getSessionHealth(session);
    const errorCount = countErrors(session.terminalEvents);
    const passLabel = lastSuccessLabel(session.terminalEvents);
    const durationMs = Date.now() - session.startedAt;
    const fillPct = arcFillPercent(session);
    const lastEvent =
      session.terminalEvents.length > 0
        ? session.terminalEvents[session.terminalEvents.length - 1]
        : null;
    const arcTime = lastEvent
      ? formatArcTime(lastEvent.timestamp)
      : formatArcTime(Date.now());
    const feedEntries = buildFeedEntries(session);

    function handleInspect(): void {
      if (promptingInspect) {
        const prompt = customPrompt.trim() || undefined;
        send({ type: "wingman-inspect", prompt });
        setCustomPrompt("");
        setPromptingInspect(false);
      } else {
        send({ type: "wingman-inspect" });
      }
    }

    function handleAddNote(): void {
      const content = noteInput.trim();
      if (!content) return;
      send({ type: "wingman-add-note", content });
      setNoteInput("");
      setAddingNote(false);
    }

    function handleNoteKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
      if (e.key === "Enter") handleAddNote();
      if (e.key === "Escape") {
        setNoteInput("");
        setAddingNote(false);
      }
    }

    function handlePromptKeyDown(
      e: React.KeyboardEvent<HTMLInputElement>,
    ): void {
      if (e.key === "Enter") handleInspect();
      if (e.key === "Escape") {
        setCustomPrompt("");
        setPromptingInspect(false);
      }
    }

    return (
      <div
        className={`wm-hb-panel wm-hb-panel--${health}`}
        data-testid="wingman-panel-active"
      >
        {/* Arc bar */}
        <ArcBar
          session={session}
          fillPct={fillPct}
          arcTime={arcTime}
          health={health}
        />

        {/* Vitals */}
        <div className="wm-hb-vitals" data-testid="wingman-active-header">
          <div className="wm-hb-vital">
            <div
              className={`wm-hb-vval ${errorCount > 0 ? "wm-hb-vval--r" : "wm-hb-vval--m"}`}
              data-testid="wingman-error-count"
            >
              {errorCount > 0 ? errorCount : "—"}
            </div>
            <div className="wm-hb-vlbl">Errors</div>
          </div>
          <div className="wm-hb-vital">
            <div
              className={`wm-hb-vval ${passLabel ? "wm-hb-vval--g" : "wm-hb-vval--m"}`}
              data-testid="wingman-pass-status"
            >
              {passLabel ?? "—"}
            </div>
            <div className="wm-hb-vlbl">Last pass</div>
          </div>
          <div className="wm-hb-vital">
            <div className="wm-hb-vval wm-hb-vval--m" data-testid="wingman-duration">
              {formatDurationMs(durationMs)}
            </div>
            <div className="wm-hb-vlbl">Duration</div>
          </div>
        </div>

        <div className="wm-hb-body">
          {/* Task goal */}
          <div className="wingman-panel__task" data-testid="wingman-task">
            <span className="wm-hb-task-lbl">Task</span>
            <span className="wm-hb-task-goal" data-testid="wingman-task-goal">
              {session.goal}
            </span>
          </div>

          {/* Loop warning */}
          {session.loopWarning && (
            <div className="wm-hb-loop" data-testid="wingman-loop-warning">
              <i className="ti ti-alert-triangle" aria-hidden="true" />
              {" Same error 3× — loop detected"}
            </div>
          )}

          {/* Spotlight */}
          <SpotlightCard
            session={session}
            health={health}
            onInspect={handleInspect}
          />

          {/* No inspection placeholder */}
          {session.inspections.length === 0 &&
            session.terminalEvents.length === 0 && (
              <div
                className="wm-hb-no-signal"
                data-testid="wingman-no-inspection"
              >
                Hit <strong>Inspect Screen</strong> to see what Wingman
                observes.
                {session.terminalWatching
                  ? " Terminal watching is on."
                  : " Enable terminal watching to auto-capture errors."}
              </div>
            )}

          {/* Unified event feed */}
          {feedEntries.length > 0 && (
            <div className="wm-hb-feed" data-testid="wingman-notes-list">
              {feedEntries.map((entry) => (
                <div
                  key={entry.key}
                  className="wm-hb-fi"
                  data-testid={`wingman-note-${entry.key}`}
                >
                  <div
                    className={`wm-hb-fpip wm-hb-fpip--${entry.pip}`}
                    aria-hidden="true"
                  />
                  <span className="wm-hb-ftext">{entry.text}</span>
                  <span className="wm-hb-ftime">
                    {formatArcTime(entry.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Inspect row */}
          {promptingInspect ? (
            <div className="wingman-panel__prompt-row" data-testid="wingman-prompt-row">
              <input
                type="text"
                className="wingman-input wingman-input--prompt"
                data-testid="wingman-prompt-input"
                placeholder="Ask something specific (or press Enter to inspect)"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.currentTarget.value)}
                onKeyDown={handlePromptKeyDown}
                autoFocus
              />
              <div className="wingman-panel__prompt-actions">
                <button
                  type="button"
                  className="wm-hb-btn-p"
                  data-testid="wingman-inspect-confirm-btn"
                  disabled={wingman.inspecting}
                  onClick={handleInspect}
                >
                  {wingman.inspecting ? "Inspecting…" : "Inspect"}
                </button>
                <button
                  type="button"
                  className="wm-hb-btn-g"
                  onClick={() => {
                    setCustomPrompt("");
                    setPromptingInspect(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="wm-hb-actions">
              <button
                type="button"
                className="wm-hb-btn-p"
                data-testid="wingman-inspect-btn"
                disabled={wingman.inspecting}
                onClick={() => setPromptingInspect(true)}
              >
                {wingman.inspecting ? "Inspecting…" : "Inspect screen"}
              </button>
              <button
                type="button"
                className="wm-hb-btn-g"
                data-testid="wingman-end-session-btn"
                onClick={() => send({ type: "wingman-end" })}
              >
                End
              </button>
            </div>
          )}

          {/* Add note inline */}
          {addingNote ? (
            <div className="wingman-panel__note-row" data-testid="wingman-note-row">
              <input
                ref={noteInputRef}
                type="text"
                className="wingman-input"
                data-testid="wingman-note-input"
                placeholder="Add a note…"
                value={noteInput}
                onChange={(e) => setNoteInput(e.currentTarget.value)}
                onKeyDown={handleNoteKeyDown}
                autoFocus
              />
              <div className="wingman-panel__note-actions">
                <button
                  type="button"
                  className="wm-hb-btn-p"
                  data-testid="wingman-note-save-btn"
                  onClick={handleAddNote}
                >
                  Save
                </button>
                <button
                  type="button"
                  className="wm-hb-btn-g"
                  onClick={() => {
                    setNoteInput("");
                    setAddingNote(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="wm-hb-add-note-btn"
              data-testid="wingman-add-note-btn"
              onClick={() => setAddingNote(true)}
            >
              + Add note
            </button>
          )}

          <div className="wm-hb-privacy" data-testid="wingman-privacy-note">
            App titles + terminal · Screenshot only on inspect
          </div>
        </div>

        {/* Terminal toggle */}
        <div className="wm-hb-toggle">
          <i className="ti ti-terminal-2" aria-hidden="true" />
          <span className="wm-hb-tlbl">Terminal watching</span>
          <button
            type="button"
            className={session.terminalWatching ? "wm-hb-pill-on" : "wm-hb-pill-off"}
            data-testid="wingman-terminal-toggle"
            onClick={() => send({ type: "wingman-terminal-toggle" })}
          >
            {session.terminalWatching ? "On" : "Off"}
          </button>
        </div>
      </div>
    );
  }

  // ── State A: Inactive ────────────────────────────────────────────────────────

  function handleStart(): void {
    const goal = goalInput.trim();
    if (!goal) {
      goalInputRef.current?.focus();
      return;
    }
    send({ type: "wingman-start", goal });
    setGoalInput("");
  }

  function handleGoalKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "Enter") handleStart();
  }

  return (
    <div
      className="wingman-panel wingman-panel--inactive"
      data-testid="wingman-panel-inactive"
    >
      <div className="wingman-panel__intro">
        <span className="wingman-panel__intro-title">Wingman</span>
        <span className="wingman-panel__intro-sub">Your active work companion</span>
      </div>

      <div className="wingman-panel__goal-section">
        <label className="wingman-panel__goal-label" htmlFor="wingman-goal-input">
          What are we working on?
        </label>
        <input
          ref={goalInputRef}
          id="wingman-goal-input"
          type="text"
          className="wingman-input wingman-input--goal"
          data-testid="wingman-goal-input"
          placeholder="e.g. debug failing auth test"
          value={goalInput}
          onChange={(e) => setGoalInput(e.currentTarget.value)}
          onKeyDown={handleGoalKeyDown}
          maxLength={200}
        />
      </div>

      {detectedApp && (
        <div
          className="wingman-panel__detected-app"
          data-testid="wingman-detected-app"
        >
          Looks like you&apos;re in: <strong>{detectedApp}</strong>
        </div>
      )}

      <button
        type="button"
        className="wingman-btn wingman-btn--start"
        data-testid="wingman-start-btn"
        disabled={!goalInput.trim()}
        onClick={handleStart}
      >
        Start Wingman
      </button>

      <div className="wingman-panel__privacy-footer" data-testid="wingman-privacy-footer">
        App titles tracked · Screenshots only when you inspect
      </div>
    </div>
  );
}
