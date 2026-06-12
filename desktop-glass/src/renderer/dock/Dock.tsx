import { useMemo, useRef } from "react";
import { ChromeRepositionOverlay } from "../ChromeRepositionOverlay.tsx";
import { send, useGlassState } from "../useGlassState.ts";
import { useChromeLockToggle } from "../useChromeLockToggle.ts";
import { useChromeWindowDrag } from "../useChromeWindowDrag.ts";
import { useDockResize } from "./useDockResize.ts";
import { useTranscriptionContext } from "../TranscriptionProvider.tsx";
import {
  GLASS_MODE_ICONS,
  GLASS_MODE_PRESETS,
  deriveActiveMode,
  type GlassModeId,
} from "../../shared/glassModePresets.ts";
import { MEETING_SUB_TYPE_LABELS } from "../../shared/meetingIntelligenceTypes.ts";
import type { PanelTab } from "../../shared/types.ts";

// ─── Mode colour tokens ───────────────────────────────────────────────────────
const MODE_COLORS: Record<
  GlassModeId,
  { led: string; ring: string; pill: string; text: string }
> = {
  listen:    { led: "rgba(65,224,163,0.85)",  ring: "rgba(65,224,163,0.7)",   pill: "rgba(65,224,163,0.10)",  text: "#41e0a3" },
  meetings:  { led: "rgba(177,143,255,0.85)", ring: "rgba(177,143,255,0.7)",  pill: "rgba(177,143,255,0.12)", text: "#b18fff" },
  wingman:   { led: "rgba(240,123,202,0.85)", ring: "rgba(240,123,202,0.7)",  pill: "rgba(240,123,202,0.10)", text: "#f07bca" },
  translate: { led: "rgba(56,225,255,0.85)",  ring: "rgba(56,225,255,0.7)",   pill: "rgba(56,225,255,0.10)",  text: "#38e1ff" },
};

export function Dock(): JSX.Element {
  const state = useGlassState();
  const tx = useTranscriptionContext();
  const dockRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const stackRef = useRef<HTMLDivElement>(null);

  const chromeLocked = state.glassSettings.chromeLayoutLocked !== false;
  const toggleChromeLock = useChromeLockToggle(chromeLocked);
  const vertical = state.glassSettings.dockOrientation === "vertical";
  useChromeWindowDrag(!chromeLocked, stackRef);

  const sessionStatus = state.session?.status ?? null;
  const sessionLive = sessionStatus === "active" || sessionStatus === "paused";
  const hasSession = !!state.session;
  const listening = state.privacy.listening || tx.status === "listening";
  const anythingActive = sessionLive || listening;

  const copilot = state.copilot;
  const activeMode = useMemo<GlassModeId | null>(
    () => deriveActiveMode(copilot.active, copilot.mode, copilot.config.sessionType),
    [copilot.active, copilot.mode, copilot.config.sessionType],
  );

  const colors = activeMode ? MODE_COLORS[activeMode] : null;

  // Audio modes (listen / meetings) have a live/paused audio distinction.
  const isAudioMode = activeMode === "listen" || activeMode === "meetings";
  const audioLive = isAudioMode && listening;
  const audioPaused = isAudioMode && !listening && sessionLive;

  const meetingIntel = activeMode === "meetings" ? state.meetingIntelligence : undefined;

  useDockResize(dockRef, actionsRef, [
    sessionStatus,
    state.panelVisible,
    sessionLive,
    anythingActive,
    activeMode,
    listening,
    chromeLocked,
    vertical,
    !!meetingIntel,
    meetingIntel?.classification?.subType,
  ]);

  const openPanel = (tab: PanelTab = "copilot"): void => {
    send({ type: "set-tab", tab });
    if (!state.panelVisible) send({ type: "toggle-panel" });
  };

  const handleModePillClick = (): void => {
    if (audioLive) {
      send({ type: "pause" });
    } else if (audioPaused) {
      tx.startListening();
    }
  };

  const handleEndSession = (): void => {
    send({ type: "session-end" });
    send({ type: "copilot-set-mode", mode: "off" });
  };

  const dockStyle = {
    "--dock-ring": colors?.ring ?? "rgba(255,255,255,0.18)",
  } as React.CSSProperties;

  return (
    <div
      className={`dock dock--v3 dock--minimal${vertical ? " dock--vertical" : ""}${audioLive ? " dock--listening" : ""}${!chromeLocked ? " dock--unlocked" : ""}`}
      ref={dockRef}
      style={dockStyle}
      data-testid="glass-dock"
    >
      <div
        className={`dock-stack${!chromeLocked ? " dock-stack--unlocked" : ""}`}
        ref={stackRef}
        title={chromeLocked ? undefined : "Layout unlocked — drag to move, then lock in Panel › Setup"}
      >
        {!chromeLocked ? <ChromeRepositionOverlay /> : null}

        <div className="dock__actions" ref={actionsRef}>

          {/* ── Zone 1: Identity ── */}
          <div className="dock__logo-zone" data-testid="glass-dock-logo" title="IIVO Glass">
            <span
              className={`dock__ring${audioLive ? " dock__ring--audio" : sessionLive ? " dock__ring--session" : ""}`}
              aria-hidden="true"
            >
              <span className="dock__ring-inner">G</span>
              {(audioLive || sessionLive) && (
                <span
                  className={`dock__ring-dot${audioLive ? " dock__ring-dot--audio" : " dock__ring-dot--session"}`}
                />
              )}
            </span>
            {state.appIdentityReport?.runningMode === "dev" ? (
              <span className="dock__dev-badge" data-testid="glass-dock-dev-badge" title="Dev build">
                DEV
              </span>
            ) : null}
          </div>

          <span className="dock__sep" aria-hidden="true" />

          {/* ── Zone 2: Session transport ── */}
          {!sessionLive && !activeMode ? (
            /* IDLE — one CTA, opens mode picker */
            <button
              type="button"
              className="gbtn dock__cta"
              data-testid="glass-dock-open-panel"
              onClick={() => openPanel("copilot")}
            >
              Open Panel
            </button>
          ) : (
            <>
              {activeMode && (
                <button
                  type="button"
                  className={`dock__mode-pill dock__mode-pill--${activeMode}${audioPaused ? " dock__mode-pill--paused" : ""}`}
                  data-testid={`glass-dock-mode-pill-${activeMode}`}
                  style={
                    {
                      "--pill-bg": colors?.pill,
                      "--pill-border": colors?.ring,
                      "--pill-text": colors?.text,
                    } as React.CSSProperties
                  }
                  title={
                    audioLive ? "Tap to pause audio"
                    : audioPaused ? "Tap to resume audio"
                    : undefined
                  }
                  onClick={isAudioMode ? handleModePillClick : undefined}
                >
                  <span aria-hidden="true">{GLASS_MODE_ICONS[activeMode]}</span>
                  <span>{audioPaused ? "Paused" : GLASS_MODE_PRESETS[activeMode].label}</span>
                  {audioLive && (
                    <span
                      className="dock__live-dot"
                      aria-hidden="true"
                      style={{ background: colors?.text }}
                    />
                  )}
                </button>
              )}

              {audioPaused && (
                <button
                  type="button"
                  className="gbtn dock__btn-resume"
                  data-testid="glass-dock-resume-audio"
                  onClick={tx.startListening}
                >
                  ▷ Resume
                </button>
              )}

              <button
                type="button"
                className="gbtn dock__btn-end"
                data-testid="glass-dock-end-session"
                onClick={handleEndSession}
              >
                ■ End Session
              </button>
            </>
          )}

          <span className="dock__sep" aria-hidden="true" />

          {/* ── Zone 3: Tools ── */}

          {sessionLive && (
            <button
              type="button"
              className="gbtn dock__btn-tool"
              data-testid="glass-dock-capture"
              title="Save screen to session"
              onClick={() => send({ type: "session-capture" })}
            >
              📸
            </button>
          )}

          {/* Notes — quick-jump to live notes during a session; opens panel otherwise */}
          <button
            type="button"
            className="gbtn dock__btn-tool"
            data-testid="glass-dock-notes"
            title="Live notes"
            onClick={() => openPanel("live-notes")}
          >
            📝
          </button>

          {/* Emergency stop — only visible when something is running */}
          {anythingActive && (
            <button
              type="button"
              className="gbtn dock__btn-stop"
              data-testid="glass-dock-stop-everything"
              title="Stop everything"
              onClick={() => {
                send({ type: "stop-everything" });
                send({ type: "copilot-set-mode", mode: "off" });
              }}
            >
              ✕
            </button>
          )}

        </div>
      </div>

      {/* ── Meeting intel strip — second row, meetings mode only ── */}
      {meetingIntel && (
        <button
          type="button"
          className="dock__meeting-strip"
          onClick={() => openPanel("copilot")}
          title="Open Meeting Intelligence"
        >
          {meetingIntel.classification ? (
            <>
              <span className="dock__meeting-strip__type">
                {MEETING_SUB_TYPE_LABELS[meetingIntel.classification.subType]}
              </span>
              <span className="dock__meeting-strip__sep" aria-hidden="true">·</span>
              <span className="dock__meeting-strip__count">
                {meetingIntel.moments.length === 0
                  ? "Tracking…"
                  : `${meetingIntel.moments.length} moment${meetingIntel.moments.length !== 1 ? "s" : ""}`}
              </span>
            </>
          ) : (
            <span className="dock__meeting-strip__building">
              <span className="dock__meeting-strip__dot" aria-hidden="true" />
              Building context…
            </span>
          )}
          <span className="dock__meeting-strip__open" aria-hidden="true">›</span>
        </button>
      )}

      <span className="dock-led-rim ui-led-line" aria-hidden="true" />
    </div>
  );
}
