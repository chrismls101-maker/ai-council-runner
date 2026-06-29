import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import {
  Camera,
  LayoutGrid,
  Lock,
  LockOpen,
  Play,
  Square,
  StickyNote,
  Terminal,
  X,
} from "lucide-react";
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
import { DOCK_LABELS, resolveChromeLockLabel, resolvePanelLabel } from "./dockLabels.ts";
import { GlassHoverTooltip } from "../components/GlassHoverTooltip.tsx";
import { ALETHEIA_CORE_STRIP } from "../../shared/builderStripVisibility.ts";
import { useGlassTerminalToggle } from "../useGlassTerminalToggle.ts";

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

function DockTip({
  label,
  rail,
  children,
}: {
  label: string;
  rail: boolean;
  children: ReactNode;
}): JSX.Element {
  return (
    <GlassHoverTooltip label={label} placement={rail ? "right" : "top"}>
      {children}
    </GlassHoverTooltip>
  );
}

export function Dock(): JSX.Element {
  const state = useGlassState();
  const tx = useTranscriptionContext();
  const dockRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const stackRef = useRef<HTMLDivElement>(null);

  const { terminalOpen, terminalActive, label: terminalLabel, toggle: handleTerminalToggle } =
    useGlassTerminalToggle();

  const chromeLocked = state.glassSettings.chromeLayoutLocked !== false;
  const toggleChromeLock = useChromeLockToggle();
  const rail = state.glassSettings.dockPlacement === "left-rail";
  const vertical = rail || state.glassSettings.dockOrientation === "vertical";
  useChromeWindowDrag(!chromeLocked, stackRef);

  useLayoutEffect(() => {
    document.documentElement.classList.add("glass-dock-window");
    document.body.classList.toggle("glass-body--dock-rail", rail);
    return () => {
      document.body.classList.remove("glass-body--dock-rail");
    };
  }, [rail]);

  const sessionStatus = state.session?.status ?? null;
  const sessionLive = sessionStatus === "active" || sessionStatus === "paused";
  const listening = state.privacy.listening || tx.status === "listening";
  const anythingActive = sessionLive || listening;

  const copilot = state.copilot;
  const activeMode = useMemo<GlassModeId | null>(
    () => deriveActiveMode(copilot.active, copilot.mode, copilot.config.sessionType),
    [copilot.active, copilot.mode, copilot.config.sessionType],
  );

  const colors = activeMode ? MODE_COLORS[activeMode] : null;

  const isAudioMode = activeMode === "listen" || activeMode === "meetings";
  const audioLive = isAudioMode && listening;
  const audioPaused = isAudioMode && !listening && sessionLive;

  const meetingIntel = activeMode === "meetings" ? state.meetingIntelligence : undefined;

  useDockResize(dockRef, stackRef, actionsRef, [
    sessionStatus,
    state.panelVisible,
    sessionLive,
    anythingActive,
    activeMode,
    listening,
    chromeLocked,
    vertical,
    rail,
    !!meetingIntel,
    meetingIntel?.classification?.subType,
    terminalActive,
  ], rail);

  const togglePanelTab = (tab: PanelTab = "session"): void => {
    // Capture stays open while switching sub-tabs — only Session toggles closed on repeat dock tap.
    if (state.panelVisible && state.panelTab === tab && tab !== "capture") {
      send({ type: "toggle-panel" });
      return;
    }
    send({ type: "set-tab", tab });
    if (!state.panelVisible) send({ type: "toggle-panel" });
  };

  const panelToggleLabel = resolvePanelLabel(
    state.panelVisible && state.panelTab === "session",
  );
  const notesToggleLabel =
    state.panelVisible && state.panelTab === "capture" ? "Close Panel" : "Live notes";

  const handleModePillClick = (): void => {
    if (audioLive) {
      send({ type: "pause" });
    } else if (audioPaused) {
      send({ type: "request-start-listening" });
    }
  };

  const handleEndSession = (): void => {
    send({ type: "session-end" });
    send({ type: "copilot-set-mode", mode: "off" });
  };

  const dockStyle = {
    "--dock-ring": colors?.ring ?? "rgba(255, 255, 255, 0.18)",
  } as React.CSSProperties;

  const modePillLabel = activeMode
    ? audioPaused
      ? `${GLASS_MODE_PRESETS[activeMode].label} — paused`
      : audioLive
        ? `${GLASS_MODE_PRESETS[activeMode].label} — tap to pause`
        : GLASS_MODE_PRESETS[activeMode].label
    : "";

  return (
    <div
      className={`dock dock--v3 dock--minimal${rail ? " dock--rail dock--vertical" : vertical ? " dock--vertical" : ""}${audioLive ? " dock--listening" : ""}${terminalOpen ? " dock--terminal-open" : ""}${!chromeLocked ? " dock--unlocked" : ""}`}
      ref={dockRef}
      style={dockStyle}
      data-testid="glass-dock"
    >
      <div
        className={`dock-stack${!chromeLocked ? " dock-stack--unlocked" : ""}`}
        ref={stackRef}
        title={chromeLocked ? undefined : "Layout unlocked — drag to move, then lock"}
      >
        <div className="dock__chrome">
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
            <DockTip label={panelToggleLabel} rail={rail}>
              <button
                type="button"
                className={`gbtn dock__cta${rail ? " dock__rail-btn" : ""}${state.panelVisible && state.panelTab === "session" ? " dock__rail-btn--active" : ""}`}
                data-testid="glass-dock-open-panel"
                onClick={() => togglePanelTab("session")}
              >
                {rail ? <LayoutGrid className="dock__rail-icon" aria-hidden="true" /> : "Open Panel"}
              </button>
            </DockTip>
          ) : (
            <>
              {activeMode && (
                <DockTip label={modePillLabel} rail={rail}>
                  <button
                    type="button"
                    className={`dock__mode-pill dock__mode-pill--${activeMode}${audioPaused ? " dock__mode-pill--paused" : ""}${rail ? " dock__rail-btn" : ""}`}
                    data-testid={`glass-dock-mode-pill-${activeMode}`}
                    style={
                      {
                        "--pill-bg": colors?.pill,
                        "--pill-border": colors?.ring,
                        "--pill-text": colors?.text,
                      } as React.CSSProperties
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
                </DockTip>
              )}

              {audioPaused && (
                <DockTip label={DOCK_LABELS["resume-session"]} rail={rail}>
                  <button
                    type="button"
                    className={`gbtn dock__btn-resume${rail ? " dock__rail-btn" : ""}`}
                    data-testid="glass-dock-resume-audio"
                    onClick={() => send({ type: "request-start-listening" })}
                  >
                    {rail ? <Play className="dock__rail-icon" aria-hidden="true" /> : "▷ Resume"}
                  </button>
                </DockTip>
              )}

              <DockTip label={DOCK_LABELS["end-session"]} rail={rail}>
                <button
                  type="button"
                  className={`gbtn dock__btn-end${rail ? " dock__rail-btn" : ""}`}
                  data-testid="glass-dock-end-session"
                  onClick={handleEndSession}
                >
                  {rail ? <Square className="dock__rail-icon" aria-hidden="true" /> : "■ End Session"}
                </button>
              </DockTip>
            </>
          )}

          <span className="dock__sep" aria-hidden="true" />

          {/* ── Zone 3: Tools ── */}
          {(sessionLive || activeMode) && (
            <DockTip label={panelToggleLabel} rail={rail}>
              <button
                type="button"
                className={`gbtn dock__btn-tool${rail ? " dock__rail-btn" : ""}${state.panelVisible && state.panelTab === "session" ? " dock__rail-btn--active" : ""}`}
                data-testid="glass-dock-open-panel"
                onClick={() => togglePanelTab("session")}
              >
                {rail ? <LayoutGrid className="dock__rail-icon" aria-hidden="true" /> : "Panel"}
              </button>
            </DockTip>
          )}

          {sessionLive && (
            <DockTip label={DOCK_LABELS.capture} rail={rail}>
              <button
                type="button"
                className={`gbtn dock__btn-tool${rail ? " dock__rail-btn" : ""}`}
                data-testid="glass-dock-capture"
                onClick={() => send({ type: "session-capture" })}
              >
                {rail ? <Camera className="dock__rail-icon" aria-hidden="true" /> : "📸"}
              </button>
            </DockTip>
          )}

          <DockTip label={notesToggleLabel} rail={rail}>
            <button
              type="button"
              className={`gbtn dock__btn-tool${rail ? " dock__rail-btn" : ""}${state.panelVisible && state.panelTab === "capture" ? " dock__rail-btn--active" : ""}`}
              data-testid="glass-dock-notes"
              onClick={() => togglePanelTab("capture")}
            >
              {rail ? <StickyNote className="dock__rail-icon" aria-hidden="true" /> : "📝"}
            </button>
          </DockTip>

          {!ALETHEIA_CORE_STRIP ? (
          <DockTip label={terminalLabel} rail={rail}>
            <button
              type="button"
              className={`gbtn dock__btn-tool glass-terminal-toggle${terminalOpen ? " glass-terminal-toggle--open" : ""}${rail ? " dock__rail-btn" : ""}`}
              data-testid="glass-dock-terminal-toggle"
              aria-label={terminalLabel}
              onClick={handleTerminalToggle}
            >
              <span
                className={`glass-terminal-toggle__dot${terminalActive ? " glass-terminal-toggle__dot--live" : ""}`}
                aria-hidden="true"
              />
              {rail ? <Terminal className="dock__rail-icon" aria-hidden="true" /> : ">_"}
            </button>
          </DockTip>
          ) : null}

          {anythingActive && (
            <DockTip label={DOCK_LABELS["stop-everything"]} rail={rail}>
              <button
                type="button"
                className={`gbtn dock__btn-stop${rail ? " dock__rail-btn" : ""}`}
                data-testid="glass-dock-stop-everything"
                onClick={() => {
                  send({ type: "stop-everything" });
                  send({ type: "copilot-set-mode", mode: "off" });
                }}
              >
                {rail ? <X className="dock__rail-icon" aria-hidden="true" /> : "✕"}
              </button>
            </DockTip>
          )}

          <span className="dock__sep dock__sep--lock" aria-hidden="true" />

          <DockTip label={resolveChromeLockLabel(chromeLocked)} rail={rail}>
            <button
              type="button"
              className={`gbtn dock__btn-tool dock__btn-chrome-lock${chromeLocked ? "" : " dock__btn-chrome-lock--unlocked"}${rail ? " dock__rail-btn" : ""}`}
              data-testid="glass-dock-chrome-lock"
              data-chrome-no-drag
              aria-label={resolveChromeLockLabel(chromeLocked)}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={toggleChromeLock}
            >
              {rail ? (
                chromeLocked ? (
                  <Lock className="dock__rail-icon" aria-hidden="true" />
                ) : (
                  <LockOpen className="dock__rail-icon" aria-hidden="true" />
                )
              ) : chromeLocked ? (
                "🔒"
              ) : (
                "🔓"
              )}
            </button>
          </DockTip>

        </div>

      {meetingIntel && (
        <button
          type="button"
          className="dock__meeting-strip"
          onClick={() => togglePanelTab("session")}
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
      </div>
    </div>
  );
}
