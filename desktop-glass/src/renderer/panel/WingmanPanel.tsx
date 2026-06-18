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
  GitDiffSummary,
  AgentCallSummary,
} from "../../shared/wingmanSession.ts";
import { shortRef } from "../../shared/gitDiff.ts";
import { shortModelName, formatCallTime } from "../../shared/agentProxy.ts";
import { statusLabel, statusToken, verificationSummaryLine } from "../../shared/verificationEngine.ts";
import type { VerificationReport } from "../../shared/verificationEngine.ts";
import type { WingmanMemoryState, WingmanSessionRecord } from "../../shared/wingmanMemory.ts";
import { formatSessionAge, formatSessionDuration } from "../../shared/wingmanMemory.ts";
import type { AgentProxyState } from "../../shared/ipc.ts";
import { AgentProxyConsentModal } from "./AgentProxyConsentModal.tsx";
import { CopyButton } from "../components/CopyButton.tsx";
import {
  reviewDecisionLabel,
  reviewDecisionToken,
  checkRollupLabel,
  checkRollupToken,
} from "../../shared/githubTypes.ts";
import type { GitHubPRContext } from "../../shared/githubTypes.ts";

// ─── Props ────────────────────────────────────────────────────────────────────

interface WingmanPanelProps {
  wingman: WingmanState;
  wingmanMemory: WingmanMemoryState;
  agentProxy: AgentProxyState;
  githubPATConfigured: boolean;
  githubTokenInvalid: boolean;
  terminalWidgetVisible: boolean;
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

// ─── GitHub PAT section ───────────────────────────────────────────────────────

function GitHubPATSection({
  configured,
  tokenInvalid,
}: {
  configured: boolean;
  tokenInvalid: boolean;
}): JSX.Element {
  const [isEditing, setIsEditing] = useState(tokenInvalid);
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  // Tracks whether the user dismissed the invalid-token form manually.
  // Allows them to close the form without being forced to update immediately.
  const [dismissedInvalid, setDismissedInvalid] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevConfigured = useRef(configured);

  // Pre-open form when token becomes invalid; reset dismissal if it becomes invalid again
  useEffect(() => {
    if (tokenInvalid) {
      setIsEditing(true);
      setDismissedInvalid(false);
    }
  }, [tokenInvalid]);

  // Detect successful save: configured flipped true while we were saving
  useEffect(() => {
    const prev = prevConfigured.current;
    prevConfigured.current = configured;
    if (!prev && configured && saving) {
      setSaving(false);
      setSavedFeedback(true);
      setIsEditing(false);
      setToken("");
      setShowToken(false);
      setValidationError("");
      const t = setTimeout(() => setSavedFeedback(false), 2500);
      return () => clearTimeout(t);
    }
  }, [configured]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-focus input when form opens
  useEffect(() => {
    if (isEditing) {
      const t = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [isEditing]);

  function handleSave(): void {
    const trimmed = token.trim();
    if (trimmed.length < 10) {
      setValidationError("Token is too short — paste the full PAT from GitHub");
      return;
    }
    if (
      !trimmed.startsWith("github_pat_") &&
      !trimmed.startsWith("ghp_") &&
      !trimmed.startsWith("gho_")
    ) {
      setValidationError("Expected github_pat_…, ghp_…, or gho_… format");
      return;
    }
    setValidationError("");
    setSaving(true);
    send({ type: "wingman-github-pat-save", token: trimmed });
  }

  function handleCancel(): void {
    setIsEditing(false);
    setToken("");
    setValidationError("");
    setShowToken(false);
    setSaving(false);
    setConfirmRemove(false);
    // If dismissing while token is still invalid, track that so the warn
    // banner renders a re-open affordance rather than "re-enter below".
    if (tokenInvalid) setDismissedInvalid(true);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") handleCancel();
  }

  const showConnected = configured && !tokenInvalid && !isEditing;
  const showNudge = !configured && !tokenInvalid && !isEditing;
  const showForm = isEditing;

  return (
    <div className="wm-hb-rsec wm-hb-gh" data-testid="wingman-github-pat-section">

      {/* Header row — label + live status pill */}
      <div className="wm-hb-gh-header">
        <div className="wm-hb-gh-label">GitHub</div>
        {(showConnected || savedFeedback) && (
          <div
            className={`wm-hb-gh-status ${savedFeedback ? "wm-hb-gh-status--saved" : "wm-hb-gh-status--ok"}`}
            data-testid={savedFeedback ? "wingman-github-pat-status-saved" : "wingman-github-pat-status-connected"}
          >
            <span className="wm-hb-gh-status-dot" />
            {savedFeedback ? "Saved" : "Connected"}
          </div>
        )}
        {tokenInvalid && (
          <div className="wm-hb-gh-status wm-hb-gh-status--warn" data-testid="wingman-github-pat-status-invalid">
            <span className="wm-hb-gh-status-dot" />
            Token rejected
          </div>
        )}
      </div>

      {/* Connected state */}
      {showConnected && (
        <div className="wm-hb-gh-connected-body">
          <span className="wm-hb-gh-meta-hint">
            Encrypted · macOS Keychain · No open PR on this branch
          </span>
          <div className="wm-hb-gh-connected-actions">
            <button
              type="button"
              className="wm-hb-gh-btn-secondary"
              data-testid="wingman-github-pat-update-btn"
              onClick={() => { setIsEditing(true); setConfirmRemove(false); }}
            >
              Update token
            </button>
            {confirmRemove ? (
              <>
                <span className="wm-hb-gh-confirm-text">Remove PAT?</span>
                <button
                  type="button"
                  className="wm-hb-gh-btn-danger"
                  data-testid="wingman-github-pat-confirm-remove-btn"
                  onClick={() => {
                    send({ type: "wingman-github-pat-clear" });
                    setConfirmRemove(false);
                  }}
                >
                  Yes, remove
                </button>
                <button
                  type="button"
                  className="wm-hb-gh-btn-ghost"
                  data-testid="wingman-github-pat-cancel-remove-btn"
                  onClick={() => setConfirmRemove(false)}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                className="wm-hb-gh-btn-remove"
                data-testid="wingman-github-pat-remove-btn"
                onClick={() => setConfirmRemove(true)}
              >
                Remove
              </button>
            )}
          </div>
        </div>
      )}

      {/* Nudge state — not yet configured */}
      {showNudge && (
        <div className="wm-hb-gh-nudge-body">
          <p className="wm-hb-gh-desc">
            Connect a GitHub PAT to see PR status and CI results in session reports.
          </p>
          <button
            type="button"
            className="wm-hb-gh-btn-connect"
            data-testid="wingman-github-pat-connect-btn"
            onClick={() => setIsEditing(true)}
          >
            Connect GitHub
          </button>
        </div>
      )}

      {/* Token-invalid warning banner */}
      {tokenInvalid && (
        <div className="wm-hb-gh-warn-banner" role="alert" data-testid="wingman-github-pat-warn-banner">
          {dismissedInvalid ? (
            <>
              Token was rejected (401).{" "}
              <button
                type="button"
                className="wm-hb-gh-inline-reopen"
                data-testid="wingman-github-pat-inline-reopen-btn"
                onClick={() => { setDismissedInvalid(false); setIsEditing(true); }}
              >
                Update token
              </button>
            </>
          ) : (
            "Token rejected (401) — please re-enter your PAT below."
          )}
        </div>
      )}

      {/* Edit form */}
      {showForm && (
        <div className="wm-hb-gh-form">
          {!tokenInvalid && (
            <p className="wm-hb-gh-desc">
              Fine-grained PAT with read-only access to Pull requests and Checks.{" "}
              <span className="wm-hb-gh-url-hint">github.com/settings/tokens</span>
            </p>
          )}

          {/* Password input + show/hide toggle */}
          <div className="wm-hb-gh-input-row">
            <input
              ref={inputRef}
              type={showToken ? "text" : "password"}
              className="wingman-input wm-hb-gh-input"
              placeholder="github_pat_… or ghp_…"
              value={token}
              onChange={(e) => {
                setToken(e.currentTarget.value);
                if (validationError) setValidationError("");
              }}
              onKeyDown={handleKeyDown}
              disabled={saving}
              autoComplete="off"
              spellCheck={false}
              data-testid="wingman-github-pat-input"
            />
            <button
              type="button"
              className="wm-hb-gh-showhide"
              onClick={() => setShowToken((s) => !s)}
              disabled={saving}
              aria-label={showToken ? "Hide token" : "Show token"}
            >
              {showToken ? "Hide" : "Show"}
            </button>
          </div>

          {/* Validation error */}
          {validationError && (
            <div className="wm-hb-gh-error" role="alert">
              {validationError}
            </div>
          )}

          {/* Security assurance */}
          <div className="wm-hb-gh-security-hint">
            <span className="wm-hb-gh-lock-icon" aria-hidden="true" />
            Encrypted on this device · Never leaves your machine
          </div>

          {/* Action buttons */}
          <div className="wm-hb-gh-actions">
            <button
              type="button"
              className="wm-hb-gh-btn-ghost"
              data-testid="wingman-github-pat-cancel-btn"
              onClick={handleCancel}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              className="wm-hb-gh-btn-save"
              onClick={handleSave}
              disabled={saving || token.trim().length === 0}
              data-testid="wingman-github-pat-save-btn"
            >
              {saving ? "Saving…" : "Save token"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── GitHub PR section ────────────────────────────────────────────────────────

function PRSection({ ctx }: { ctx: GitHubPRContext }): JSX.Element {
  const { pr, checks } = ctx;
  const reviewToken = reviewDecisionToken(pr.reviewDecision);
  const checkToken = checkRollupToken(checks.status);

  return (
    <div className="wm-hb-rsec" data-testid="wingman-report-github-pr">
      <div className="wm-hb-rslbl">
        Pull Request
        {pr.isDraft && <span className="wm-hb-pr-draft-badge">Draft</span>}
      </div>
      <div className="wm-hb-pr-title">
        <span className="wm-hb-pr-num">#{pr.number}</span>
        {pr.title}
      </div>
      <div className="wm-hb-pr-badges">
        <span
          className={`wm-hb-pr-badge wm-hb-pr-badge--review wm-hb-pr-badge--${reviewToken}`}
          data-testid="wingman-pr-review-badge"
        >
          {reviewDecisionLabel(pr.reviewDecision)}
        </span>
        <span
          className={`wm-hb-pr-badge wm-hb-pr-badge--ci wm-hb-pr-badge--${checkToken}`}
          data-testid="wingman-pr-ci-badge"
        >
          {checkRollupLabel(checks)}
        </span>
      </div>
      {pr.bodySnippet && (
        <div className="wm-hb-pr-body">{pr.bodySnippet}</div>
      )}
      {checks.failingNames.length > 0 && (
        <div className="wm-hb-pr-failing-checks">
          Failing: {checks.failingNames.join(", ")}
        </div>
      )}
      <div className="wm-hb-pr-meta">
        {pr.headBranch} → {pr.baseBranch} · by {pr.author}
      </div>
    </div>
  );
}

// ─── Verification section ─────────────────────────────────────────────────────

function VerificationSection({ vr }: { vr: VerificationReport }): JSX.Element {
  const summaryLine = verificationSummaryLine(vr);
  const shown = vr.results.filter((r) => r.status !== "skipped");

  return (
    <div className="wm-hb-rsec" data-testid="wingman-report-verification">
      <div className="wm-hb-rslbl">
        Verification
        {vr.contradictedCount > 0 && (
          <span className="wm-hb-verify-alert" aria-label="contradictions found">!</span>
        )}
      </div>
      <div className="wm-hb-verify-summary">{summaryLine}</div>
      <div className="wm-hb-verify-list">
        {shown.map((result) => (
          <div
            key={result.id}
            className={`wm-hb-verify-row wm-hb-verify-row--${statusToken(result.status)}`}
            data-testid={`wingman-verify-${result.claimType}`}
          >
            <span className="wm-hb-verify-badge">
              {statusLabel(result.status)}
            </span>
            <div className="wm-hb-verify-body">
              <div className="wm-hb-verify-claim">{result.claim}</div>
              {result.evidence && result.status !== "skipped" && (
                <div className="wm-hb-verify-evidence">{result.evidence}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Report view ──────────────────────────────────────────────────────────────

function ReportView({
  report,
  session,
  memory,
  githubPATConfigured,
  githubTokenInvalid,
  onNewSession,
}: {
  report: WingmanReport;
  session: WingmanSession | null;
  memory: WingmanMemoryState;
  githubPATConfigured: boolean;
  githubTokenInvalid: boolean;
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
    agentCalls: [],
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

        {/* Code changes from git diff */}
        {report.gitDiff && (
          <div className="wm-hb-rsec" data-testid="wingman-report-git-diff">
            <div className="wm-hb-rslbl">Code changes</div>

            {report.gitDiff.filesChanged.length === 0 ? (
              <div className="wm-hb-diff-empty">No code changes detected during this session.</div>
            ) : (
              <>
                {/* Scope badge */}
                <div
                  className={`wm-hb-diff-scope wm-hb-diff-scope--${report.gitDiff.scopeHint}`}
                  data-testid="wingman-report-diff-scope"
                >
                  <span className="wm-hb-diff-scope-dot" aria-hidden="true" />
                  <span className="wm-hb-diff-scope-label">
                    {report.gitDiff.scopeHint === "on-track"
                      ? "On track"
                      : report.gitDiff.scopeHint === "possible-drift"
                        ? "Possible drift"
                        : report.gitDiff.scopeHint === "significant-drift"
                          ? "Scope drift"
                          : "Unknown"}
                  </span>
                  <span className="wm-hb-diff-scope-note">{report.gitDiff.scopeNote}</span>
                </div>

                {/* Stat line */}
                <div className="wm-hb-diff-stats" data-testid="wingman-report-diff-stats">
                  <span className="wm-hb-diff-stat-files">
                    {report.gitDiff.filesChanged.length}{" "}
                    {report.gitDiff.filesChanged.length === 1 ? "file" : "files"}
                  </span>
                  <span className="wm-hb-diff-stat-ins">
                    +{report.gitDiff.totalInsertions}
                  </span>
                  <span className="wm-hb-diff-stat-del">
                    −{report.gitDiff.totalDeletions}
                  </span>
                  <span className="wm-hb-diff-stat-ref">
                    from {shortRef(report.gitDiff.baseRef)}
                  </span>
                </div>

                {/* Top directories */}
                {report.gitDiff.topDirectories.length > 0 && (
                  <div className="wm-hb-diff-dirs" data-testid="wingman-report-diff-dirs">
                    {report.gitDiff.topDirectories.map((dir) => (
                      <span key={dir} className="wm-hb-diff-dir-chip">{dir}</span>
                    ))}
                  </div>
                )}

                {/* File list */}
                <div className="wm-hb-diff-files" data-testid="wingman-report-diff-files">
                  {report.gitDiff.filesChanged.slice(0, 20).map((f) => (
                    <div
                      key={f.path}
                      className={`wm-hb-diff-file wm-hb-diff-file--${f.status}`}
                    >
                      <span className="wm-hb-diff-file-status" aria-hidden="true">
                        {f.status === "added"
                          ? "A"
                          : f.status === "deleted"
                            ? "D"
                            : f.status === "renamed"
                              ? "R"
                              : "M"}
                      </span>
                      <span className="wm-hb-diff-file-path">{f.path}</span>
                      {f.isBinary ? (
                        <span className="wm-hb-diff-binary">binary</span>
                      ) : (
                        <span className="wm-hb-diff-file-counts">
                          <span className="wm-hb-diff-ins">+{f.insertions}</span>
                          <span className="wm-hb-diff-del">−{f.deletions}</span>
                        </span>
                      )}
                    </div>
                  ))}
                  {report.gitDiff.filesChanged.length > 20 && (
                    <div className="wm-hb-diff-more">
                      … and {report.gitDiff.filesChanged.length - 20} more files
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Agent activity */}
        {report.agentCalls && report.agentCalls.length > 0 && (
          <div className="wm-hb-rsec" data-testid="wingman-report-agent-calls">
            <div className="wm-hb-rslbl">Agent activity</div>
            <div className="wm-hb-agent-list">
              {report.agentCalls.slice(0, 10).map((call) => (
                <div key={call.id} className="wm-hb-agent-call">
                  <div className="wm-hb-agent-call-header">
                    <span className="wm-hb-agent-model">{shortModelName(call.model)}</span>
                    {call.hasToolUse && call.toolNames.length > 0 && (
                      <span className="wm-hb-agent-tools">
                        {call.toolNames.slice(0, 3).join(", ")}
                        {call.toolNames.length > 3 ? `… +${call.toolNames.length - 3}` : ""}
                      </span>
                    )}
                    <span className="wm-hb-agent-time">{formatCallTime(call.timestamp)}</span>
                  </div>
                  <div className="wm-hb-agent-asked">{call.userMessageSnippet}</div>
                  {call.responseSnippet && call.responseSnippet !== call.userMessageSnippet && (
                    <div className="wm-hb-agent-response">{call.responseSnippet}</div>
                  )}
                </div>
              ))}
              {report.agentCalls.length > 10 && (
                <div className="wm-hb-agent-more">
                  … and {report.agentCalls.length - 10} more calls
                </div>
              )}
            </div>
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

        {/* GitHub PR context — shown when a PR was found */}
        {report.githubPR && !githubTokenInvalid && (
          <PRSection ctx={report.githubPR} />
        )}
        {/* GitHub PAT management — shown when no PR found (covers nudge, connected/no-PR, invalid) */}
        {(!report.githubPR || githubTokenInvalid) && (
          <GitHubPATSection
            configured={githubPATConfigured}
            tokenInvalid={githubTokenInvalid}
          />
        )}

        {/* Verification results */}
        {report.verificationResults && report.verificationResults.results.length > 0 && (
          <VerificationSection vr={report.verificationResults} />
        )}

        {/* Could not verify */}
        {report.notVerified.length > 0 && (
          <div className="wm-hb-rsec" data-testid="wingman-report-not-verified">
            <div className="wm-hb-rslbl">Could not verify</div>
            <ul className="wm-hb-uv">
              {report.notVerified.map((item, i) => (
                <li key={i} className="wm-hb-uvitem">
                  {item}
                </li>
              ))}
            </ul>
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
  agentProxy,
  githubPATConfigured,
  githubTokenInvalid,
  terminalWidgetVisible,
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
    // Clear the report from main-process state so the panel transitions to inactive.
    send({ type: "wingman-new-session" });
  }

  // ── Consent modal (overlay — shown before proxy starts) ──────────────────────

  if (agentProxy.showConsentModal) {
    return (
      <AgentProxyConsentModal
        port={agentProxy.port}
        onEnable={() => {
          send({ type: "wingman-agent-proxy-consent-grant" });
          send({ type: "wingman-agent-proxy-enable" });
        }}
        onDismiss={() => send({ type: "wingman-agent-proxy-disable" })}
      />
    );
  }

  // ── State C: Report ──────────────────────────────────────────────────────────

  if (wingman.report && !wingman.active) {
    return (
      <ReportView
        report={wingman.report}
        session={wingman.session}
        memory={wingmanMemory}
        githubPATConfigured={githubPATConfigured}
        githubTokenInvalid={githubTokenInvalid}
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
          <button
            type="button"
            className={terminalWidgetVisible ? "wm-hb-terminal-btn wm-hb-terminal-btn--active" : "wm-hb-terminal-btn"}
            data-testid="wingman-terminal-widget-btn"
            title={terminalWidgetVisible ? "Hide terminal overlay" : "Show terminal overlay"}
            onClick={() => send({ type: "terminal-widget-toggle" })}
          >
            <i className="ti ti-layout-bottombar" aria-hidden="true" />
            Terminal
          </button>
        </div>

        {/* Agent proxy toggle */}
        <div className="wm-hb-toggle">
          <i className="ti ti-api" aria-hidden="true" />
          <span className="wm-hb-tlbl">Agent interception</span>
          {agentProxy.running && (
            <CopyButton
              className="wm-hb-proxy-copy"
              data-testid="wingman-agent-proxy-copy-env"
              text={`ANTHROPIC_BASE_URL=http://localhost:${agentProxy.port}`}
            >
              Copy env
            </CopyButton>
          )}
          <button
            type="button"
            className={agentProxy.running ? "wm-hb-pill-on" : "wm-hb-pill-off"}
            data-testid="wingman-agent-proxy-toggle"
            onClick={() =>
              send({
                type: agentProxy.running
                  ? "wingman-agent-proxy-disable"
                  : "wingman-agent-proxy-enable",
              })
            }
          >
            {agentProxy.running ? "On" : "Off"}
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
