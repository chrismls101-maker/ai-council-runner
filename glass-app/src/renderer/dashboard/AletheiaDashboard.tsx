import { useCallback, useEffect, useMemo, useState } from "react";
import { Mic, MicOff, Shield, Sparkles } from "lucide-react";
import type { GlassCapabilityRow } from "../../shared/glassCapabilities.ts";
import type { GlassState, MessageRow, SessionRowWithMeta } from "../../shared/ipc.ts";
import { formatRelativeTime } from "../../shared/relativeTime.ts";
import { useGlassState } from "../useGlassState.ts";
import { dispatchAletheiaCommand } from "../../shared/aletheiaAuthority.ts";
import { ensureAletheiaDispatchRegistered } from "../aletheia/registerAletheiaDispatch.ts";
import { useGlassCompanion } from "../companion/GlassCompanionProvider.tsx";
import { GlassHoverTooltip } from "../components/GlassHoverTooltip.tsx";
import { armAletheiaDashboardOverlayPointer } from "../glassTextInteraction.ts";
import "./AletheiaDashboard.css";

type AletheiaDashboardProps = {
  visible?: boolean;
  onClose?: () => void;
};

const PRIVACY_DEFAULT_MS = 10 * 60 * 1000;

export function AletheiaDashboard({ visible = true, onClose }: AletheiaDashboardProps): JSX.Element {
  const glassState = useGlassState();
  const companion = useGlassCompanion();

  useEffect(() => {
    ensureAletheiaDispatchRegistered();
  }, []);

  useEffect(() => {
    if (!visible) return;
    document.body.classList.add("glass-body--workspace-active");
    armAletheiaDashboardOverlayPointer();
    return () => {
      document.body.classList.remove("glass-body--workspace-active");
    };
  }, [visible]);

  const companionActive = glassState.companionModeActive === true;
  const privacyActive = glassState.companionPrivacy?.active === true;
  const statusLabel = companion.active ? companion.statusLabel : "Aletheia · Off";

  const serverDegraded = useMemo(() => {
    const runtimeReason = glassState.iivoServerDegradedReason?.trim();
    const server = glassState.setupCapabilities?.find((row) => row.id === "server");
    const setupOffline = server?.severity === "error";
    if (!runtimeReason && !setupOffline) return null;
    return (
      runtimeReason ??
      server?.detail ??
      "IIVO server offline — live translate, server STT, memory vault, and AI notes are unavailable."
    );
  }, [glassState.iivoServerDegradedReason, glassState.setupCapabilities]);

  const handleClose = useCallback((): void => {
    if (onClose) {
      onClose();
      return;
    }
    window.glass.closeAletheiaDashboard();
  }, [onClose]);

  const handleActivate = useCallback((): void => {
    if (!companionActive) {
      dispatchAletheiaCommand("toggle-companion-mode");
    }
  }, [companionActive]);

  const handleDeactivate = useCallback((): void => {
    if (!companionActive) return;
    if (glassState.agentRun?.status === "running") {
      dispatchAletheiaCommand("stop-everything");
      return;
    }
    dispatchAletheiaCommand("toggle-companion-mode");
  }, [companionActive, glassState.agentRun?.status]);

  const handlePrivacyStart = useCallback((): void => {
    dispatchAletheiaCommand("companion-privacy-start", { durationMs: PRIVACY_DEFAULT_MS });
  }, []);

  const handlePrivacyEnd = useCallback((): void => {
    dispatchAletheiaCommand("companion-privacy-end");
  }, []);

  const handleOpenGlassSetup = useCallback((): void => {
    dispatchAletheiaCommand("open-glass-setup");
  }, []);

  const handleOpenGlassMemory = useCallback((): void => {
    dispatchAletheiaCommand("open-glass-memory");
  }, []);

  return (
    <div
      className={`aletheia-dashboard-shell${visible ? "" : " aletheia-dashboard-shell--hidden"}`}
      data-testid="aletheia-dashboard-shell"
    >
      <div className="aletheia-dashboard" data-testid="aletheia-dashboard">
        <header className="aletheia-dashboard__titlebar" data-testid="aletheia-dashboard-titlebar">
          <Sparkles className="aletheia-dashboard__title-icon" size={16} strokeWidth={2} aria-hidden="true" />
          <span className="aletheia-dashboard__title">Aletheia</span>
          <span
            className={`aletheia-dashboard__status-pill${companionActive ? " aletheia-dashboard__status-pill--live" : ""}${privacyActive ? " aletheia-dashboard__status-pill--privacy" : ""}`}
            data-testid="aletheia-dashboard-status"
          >
            {privacyActive ? "Aletheia · Privacy" : statusLabel}
          </span>
          <div className="aletheia-dashboard__titlebar-actions">
            <GlassHoverTooltip label="Close Aletheia dashboard" placement="bottom">
              <button
                type="button"
                className="aletheia-dashboard__close"
                aria-label="Close Aletheia dashboard"
                onClick={handleClose}
              >
                ×
              </button>
            </GlassHoverTooltip>
          </div>
        </header>

        <div className="aletheia-dashboard__body">
          {serverDegraded ? (
            <div className="aletheia-dashboard__degraded" data-testid="aletheia-dashboard-server-degraded">
              <p className="aletheia-dashboard__degraded-label">Server offline</p>
              <p className="aletheia-dashboard__degraded-detail">{serverDegraded}</p>
            </div>
          ) : null}

          <section className="aletheia-dashboard__hero" data-testid="aletheia-dashboard-hero">
            <p className="aletheia-dashboard__eyebrow">Aletheia control surface</p>
            <h2 className="aletheia-dashboard__headline">Presence, voice, and trust</h2>
            <p className="aletheia-dashboard__lede">
              Aletheia listens when you activate her and stays silent when you turn her off.
              Durable memory and system setup live in the Glass System dashboard.
            </p>
            <div className="aletheia-dashboard__hero-actions">
              {!companionActive ? (
                <button
                  type="button"
                  className="aletheia-dashboard__activate"
                  data-testid="aletheia-dashboard-activate"
                  onClick={handleActivate}
                >
                  <Mic size={14} strokeWidth={2} aria-hidden="true" />
                  Activate Aletheia
                </button>
              ) : (
                <button
                  type="button"
                  className="aletheia-dashboard__deactivate"
                  data-testid="aletheia-dashboard-deactivate"
                  onClick={handleDeactivate}
                >
                  <MicOff size={14} strokeWidth={2} aria-hidden="true" />
                  Deactivate Aletheia
                </button>
              )}
            </div>
          </section>

          <div className="aletheia-dashboard__grid">
            <PresencePanel
              companionActive={companionActive}
              privacyActive={privacyActive}
              speaking={companion.speaking}
              activeApp={glassState.activeApp}
              hasPresence={Boolean(glassState.companionPresence)}
              warmupPhase={glassState.companionWarmupPhase ?? "none"}
            />
            <PermissionsPanel
              capabilities={glassState.setupCapabilities ?? []}
              consentState={glassState.consentState}
              systemAudioStatus={glassState.systemAudioStatus}
              onOpenSetup={handleOpenGlassSetup}
            />
            <PrivacyPanel
              companionActive={companionActive}
              privacy={glassState.companionPrivacy}
              onStart={handlePrivacyStart}
              onEnd={handlePrivacyEnd}
            />
            <VoiceSessionPanel
              visible={visible}
              companionActive={companionActive}
              liveTranscript={companion.liveTranscript}
              lastPrompt={glassState.companionMemory?.lastPrompt}
              frontApp={glassState.companionMemory?.frontApp ?? glassState.activeApp}
            />
            <MemoryPanel onOpenGlassMemory={handleOpenGlassMemory} />
          </div>
        </div>
      </div>
    </div>
  );
}

function PresencePanel({
  companionActive,
  privacyActive,
  speaking,
  activeApp,
  hasPresence,
  warmupPhase,
}: {
  companionActive: boolean;
  privacyActive: boolean;
  speaking: boolean;
  activeApp?: string;
  hasPresence: boolean;
  warmupPhase: "none" | "warming" | "ready";
}): JSX.Element {
  return (
    <section className="aletheia-dashboard__panel" data-testid="aletheia-dashboard-presence">
      <p className="aletheia-dashboard__panel-label">Presence</p>
      <ul className="aletheia-dashboard__stat-list">
        <li>
          <span className="aletheia-dashboard__stat-key">Session</span>
          <span className="aletheia-dashboard__stat-value">
            {companionActive ? "Active" : "Off"}
          </span>
        </li>
        <li>
          <span className="aletheia-dashboard__stat-key">Warmup</span>
          <span className="aletheia-dashboard__stat-value">
            {warmupPhase === "warming" ? "Warming" : warmupPhase === "ready" ? "Ready" : "—"}
          </span>
        </li>
        <li>
          <span className="aletheia-dashboard__stat-key">Speaking</span>
          <span className="aletheia-dashboard__stat-value">{speaking ? "Yes" : "No"}</span>
        </li>
        <li>
          <span className="aletheia-dashboard__stat-key">Privacy</span>
          <span className="aletheia-dashboard__stat-value">{privacyActive ? "On" : "Off"}</span>
        </li>
        <li>
          <span className="aletheia-dashboard__stat-key">Spatial guidance</span>
          <span className="aletheia-dashboard__stat-value">
            {hasPresence ? "Visible" : companionActive ? "Idle" : "—"}
          </span>
        </li>
        {activeApp ? (
          <li>
            <span className="aletheia-dashboard__stat-key">Front app</span>
            <span className="aletheia-dashboard__stat-value">{activeApp}</span>
          </li>
        ) : null}
      </ul>
    </section>
  );
}

function PermissionsPanel({
  capabilities,
  consentState,
  systemAudioStatus,
  onOpenSetup,
}: {
  capabilities: GlassCapabilityRow[];
  consentState?: GlassState["consentState"];
  systemAudioStatus?: string;
  onOpenSetup: () => void;
}): JSX.Element {
  const mic = capabilities.find((row) => row.id === "microphone");
  const screen = capabilities.find((row) => row.id === "screenRecording");
  const audio = capabilities.find((row) => row.id === "systemAudio");

  return (
    <section className="aletheia-dashboard__panel" data-testid="aletheia-dashboard-permissions">
      <p className="aletheia-dashboard__panel-label">Permissions &amp; hearing</p>
      <ul className="aletheia-dashboard__stat-list">
        <PermissionRow label="Microphone" row={mic} fallback={mic ? undefined : "Not checked"} />
        <PermissionRow label="Screen capture" row={screen} fallback={screen ? undefined : "Not checked"} />
        <PermissionRow
          label="Machine audio"
          row={audio}
          fallback={
            systemAudioStatus === "available"
              ? "Available"
              : systemAudioStatus ?? "Not configured"
          }
        />
        <ConsentRow label="Mic consent" ack={consentState?.micAck === true} />
        <ConsentRow label="Screen consent" ack={consentState?.screenAck === true} />
        <ConsentRow label="Recording consent" ack={consentState?.recordingAck === true} />
        <ConsentRow label="Terms accepted" ack={consentState?.tosAck === true} />
      </ul>
      <button
        type="button"
        className="aletheia-dashboard__link-btn"
        data-testid="aletheia-dashboard-open-setup"
        onClick={onOpenSetup}
      >
        Open Glass System setup →
      </button>
    </section>
  );
}

function PermissionRow({
  label,
  row,
  fallback,
}: {
  label: string;
  row?: GlassCapabilityRow;
  fallback?: string;
}): JSX.Element {
  const value = row?.label ?? fallback ?? "Unknown";
  const ok = row?.severity === "ok";
  return (
    <li>
      <span className="aletheia-dashboard__stat-key">{label}</span>
      <span
        className={`aletheia-dashboard__stat-value${ok ? " aletheia-dashboard__stat-value--ok" : row?.severity === "error" ? " aletheia-dashboard__stat-value--error" : ""}`}
      >
        {value}
      </span>
    </li>
  );
}

function PrivacyPanel({
  companionActive,
  privacy,
  onStart,
  onEnd,
}: {
  companionActive: boolean;
  privacy?: { active: boolean; resumeAt: number; durationMs: number };
  onStart: () => void;
  onEnd: () => void;
}): JSX.Element {
  const resumeLabel = privacy?.active
    ? new Date(privacy.resumeAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : null;

  return (
    <section className="aletheia-dashboard__panel" data-testid="aletheia-dashboard-privacy">
      <p className="aletheia-dashboard__panel-label">
        <Shield size={12} strokeWidth={2} aria-hidden="true" /> Privacy
      </p>
      {privacy?.active ? (
        <p className="aletheia-dashboard__panel-copy" data-testid="aletheia-dashboard-privacy-active">
          Aletheia is silent until {resumeLabel}. She still listens for your resume phrase.
        </p>
      ) : (
        <p className="aletheia-dashboard__panel-copy">
          Pause Aletheia for 10 minutes — useful when others are in the room.
        </p>
      )}
      <div className="aletheia-dashboard__panel-actions">
        <button
          type="button"
          className="aletheia-dashboard__secondary-btn"
          data-testid="aletheia-dashboard-privacy-start"
          disabled={!companionActive || privacy?.active === true}
          onClick={onStart}
        >
          Start privacy
        </button>
        <button
          type="button"
          className="aletheia-dashboard__secondary-btn"
          data-testid="aletheia-dashboard-privacy-end"
          disabled={!privacy?.active}
          onClick={onEnd}
        >
          End privacy
        </button>
      </div>
    </section>
  );
}

function ConsentRow({ label, ack }: { label: string; ack: boolean }): JSX.Element {
  return (
    <li>
      <span className="aletheia-dashboard__stat-key">{label}</span>
      <span
        className={`aletheia-dashboard__stat-value${ack ? " aletheia-dashboard__stat-value--ok" : ""}`}
        data-testid={`aletheia-dashboard-consent-${label.toLowerCase().replace(/\s+/g, "-")}`}
      >
        {ack ? "Acknowledged" : "Required"}
      </span>
    </li>
  );
}

function VoiceSessionPanel({
  visible,
  companionActive,
  liveTranscript,
  lastPrompt,
  frontApp,
}: {
  visible: boolean;
  companionActive: boolean;
  liveTranscript: string;
  lastPrompt?: string;
  frontApp?: string;
}): JSX.Element {
  const [recentSessions, setRecentSessions] = useState<SessionRowWithMeta[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sessionMessages, setSessionMessages] = useState<MessageRow[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const snippet = liveTranscript.trim() || lastPrompt?.trim();

  useEffect(() => {
    if (!visible) return;
    void window.glass
      .getAletheiaRecentSessions()
      .then(setRecentSessions)
      .catch(() => setRecentSessions([]));
  }, [visible, companionActive]);

  useEffect(() => {
    if (!visible || !selectedSessionId) {
      setSessionMessages([]);
      return;
    }
    setMessagesLoading(true);
    void window.glass
      .getAletheiaSessionMessages(selectedSessionId)
      .then((messages) => {
        setSessionMessages(messages);
      })
      .catch(() => {
        setSessionMessages([]);
      })
      .finally(() => {
        setMessagesLoading(false);
      });
  }, [visible, selectedSessionId]);

  const handleSelectSession = useCallback((sessionId: string): void => {
    setSelectedSessionId((current) => (current === sessionId ? null : sessionId));
  }, []);

  return (
    <section className="aletheia-dashboard__panel" data-testid="aletheia-dashboard-sessions">
      <p className="aletheia-dashboard__panel-label">Voice session</p>
      {!companionActive ? (
        <p className="aletheia-dashboard__panel-copy">Activate Aletheia to start a voice session.</p>
      ) : snippet ? (
        <blockquote className="aletheia-dashboard__quote" data-testid="aletheia-dashboard-session-snippet">
          {snippet.length > 220 ? `${snippet.slice(0, 220)}…` : snippet}
        </blockquote>
      ) : (
        <p className="aletheia-dashboard__panel-copy">Listening — speak when ready.</p>
      )}
      {frontApp ? (
        <p className="aletheia-dashboard__panel-meta">Context: {frontApp}</p>
      ) : null}
      {recentSessions.length > 0 ? (
        <ul className="aletheia-dashboard__session-list" data-testid="aletheia-dashboard-session-list">
          {recentSessions.slice(0, 5).map((session) => {
            const label =
              session.title?.trim() ||
              session.first_message_preview?.trim() ||
              session.agent_type?.trim() ||
              "Session";
            const selected = selectedSessionId === session.id;
            return (
              <li key={session.id}>
                <button
                  type="button"
                  className={`aletheia-dashboard__session-row${selected ? " aletheia-dashboard__session-row--selected" : ""}`}
                  data-testid="aletheia-dashboard-session-row"
                  aria-expanded={selected}
                  onClick={() => handleSelectSession(session.id)}
                >
                  <span className="aletheia-dashboard__session-time">
                    {formatRelativeTime(session.updated_at)}
                  </span>
                  <span className="aletheia-dashboard__session-title">{label}</span>
                </button>
                {selected ? (
                  <SessionMessageDetail messages={sessionMessages} loading={messagesLoading} />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="aletheia-dashboard__panel-footnote" data-testid="aletheia-dashboard-sessions-empty">
          No prior sessions on this device yet.
        </p>
      )}
    </section>
  );
}

function SessionMessageDetail({
  messages,
  loading,
}: {
  messages: MessageRow[];
  loading: boolean;
}): JSX.Element {
  if (loading) {
    return (
      <p className="aletheia-dashboard__panel-footnote" data-testid="aletheia-dashboard-session-messages-loading">
        Loading session recap…
      </p>
    );
  }
  if (messages.length === 0) {
    return (
      <p className="aletheia-dashboard__panel-footnote" data-testid="aletheia-dashboard-session-messages-empty">
        No messages recorded for this session.
      </p>
    );
  }
  return (
    <ul className="aletheia-dashboard__message-list" data-testid="aletheia-dashboard-session-messages">
      {messages.slice(0, 12).map((message) => {
        const text = message.content.trim();
        const preview = text.length > 180 ? `${text.slice(0, 180)}…` : text;
        return (
          <li key={message.id} className="aletheia-dashboard__message-row">
            <span className="aletheia-dashboard__message-role">{message.role}</span>
            <span className="aletheia-dashboard__message-text">{preview || "—"}</span>
          </li>
        );
      })}
    </ul>
  );
}

function MemoryPanel({ onOpenGlassMemory }: { onOpenGlassMemory: () => void }): JSX.Element {
  return (
    <section className="aletheia-dashboard__panel" data-testid="aletheia-dashboard-memory">
      <p className="aletheia-dashboard__panel-label">Memory</p>
      <p className="aletheia-dashboard__panel-copy">
        Aletheia keeps short-lived session routing while active. Durable memory — what Glass remembers
        across sessions — is managed in the Glass System dashboard.
      </p>
      <button
        type="button"
        className="aletheia-dashboard__link-btn"
        data-testid="aletheia-dashboard-open-memory"
        onClick={onOpenGlassMemory}
      >
        Open Glass System → Memory
      </button>
    </section>
  );
}
