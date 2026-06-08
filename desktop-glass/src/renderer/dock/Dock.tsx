import { useRef, useState } from "react";
import type { OverlayMode } from "../../shared/glassWindowTypes.ts";
import { OVERLAY_MODES } from "../../shared/glassWindowTypes.ts";
import { ChromeRepositionOverlay } from "../ChromeRepositionOverlay.tsx";
import { send, useGlassState } from "../useGlassState.ts";
import { useChromeLockToggle } from "../useChromeLockToggle.ts";
import { useChromeWindowDrag } from "../useChromeWindowDrag.ts";
import { useDockResize } from "./useDockResize.ts";

const OVERLAY_MODE_LABELS: Record<OverlayMode, string> = {
  passive: "Passive overlay",
  insights: "Insights overlay",
  hidden: "Overlay hidden",
};

function nextOverlayMode(current: OverlayMode): OverlayMode {
  const idx = OVERLAY_MODES.indexOf(current);
  return OVERLAY_MODES[(idx + 1) % OVERLAY_MODES.length] ?? "passive";
}

export function Dock(): JSX.Element {
  const state = useGlassState();
  const dockRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const dragHandleRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const sessionStatus = state.session?.status ?? null;
  const sessionLive = sessionStatus === "active" || sessionStatus === "paused";
  const hasSession = !!state.session;
  const listening = state.privacy.listening;
  const overlayMode = state.windows?.overlayMode ?? state.config.overlayMode ?? "passive";
  const overlayVisible = state.windows?.overlayVisible ?? state.config.overlayEnabled;
  const chromeLocked = state.glassSettings.chromeLayoutLocked !== false;
  const toggleChromeLock = useChromeLockToggle(chromeLocked);
  useChromeWindowDrag(!chromeLocked, chromeLocked ? dragHandleRef : dockRef);
  const vertical = state.glassSettings.dockOrientation === "vertical";

  useDockResize(dockRef, actionsRef, [
    sessionStatus,
    state.panelVisible,
    sessionLive,
    menuOpen,
    overlayVisible,
    overlayMode,
    listening,
    chromeLocked,
    vertical,
  ]);

  const openPanelTab = (
    tab: "summary" | "copilot" | "setup" | "audio" | "session" | "context" | "insights" | "diagnostics",
  ): void => {
    send({ type: "set-tab", tab });
    if (!state.panelVisible) send({ type: "toggle-panel" });
  };

  return (
    <div
      className={`dock dock--minimal${vertical ? " dock--vertical" : ""}${!chromeLocked ? " dock--unlocked" : ""}`}
      ref={dockRef}
      data-testid="glass-dock"
      title={chromeLocked ? undefined : "Layout unlocked — hold and drag to move, then lock when done"}
    >
      {!chromeLocked ? <ChromeRepositionOverlay /> : null}

      <div className="dock__actions" ref={actionsRef}>
        {/* 1 — Identity + session transport (most used) */}
        <div className="dock__head">
          <div
            className="dock__drag"
            ref={dragHandleRef}
            title={chromeLocked ? "Drag to reposition" : "Hold & drag to move dock"}
          >
            <span className="dock__logo" aria-hidden="true" />
            <span className="dock__title">Glass</span>
            {state.appIdentityReport?.runningMode === "dev" ? (
              <span className="dock__dev-badge" data-testid="glass-dock-dev-badge" title="Dev build — hot reload active">
                DEV
              </span>
            ) : null}
          </div>

          {!sessionLive ? (
            <button
              type="button"
              className="gbtn gbtn--primary"
              data-testid="glass-dock-start-session"
              onClick={() => send({ type: "session-start" })}
              title="Start a work session"
            >
              Start Session
            </button>
          ) : (
            <>
              {sessionStatus === "active" ? (
                <button
                  type="button"
                  className="gbtn"
                  data-testid="glass-dock-pause"
                  title="Pause session"
                  onClick={() => send({ type: "session-pause" })}
                >
                  Pause
                </button>
              ) : (
                <button
                  type="button"
                  className="gbtn"
                  data-testid="glass-dock-resume"
                  title="Resume session"
                  onClick={() => send({ type: "session-resume" })}
                >
                  Resume
                </button>
              )}
              <button
                type="button"
                className="gbtn"
                title="End session"
                onClick={() => send({ type: "session-end" })}
              >
                End
              </button>
            </>
          )}
        </div>

        {/* 2 — Panel (modes, translate setup, settings) */}
        <button
          type="button"
          data-testid="glass-dock-open-panel"
          className="gbtn gbtn--panel"
          title="Open Glass panel"
          onClick={() => send({ type: "toggle-panel" })}
        >
          {state.panelVisible ? "Close Panel" : "Open Panel"}
        </button>

        {/* 3 — Emergency stop */}
        <button
          type="button"
          data-testid="glass-dock-stop-everything"
          className="gbtn gbtn--danger"
          onClick={() => send({ type: "stop-everything" })}
          title="Stop listening, capture, and translation"
        >
          Stop Everything
        </button>

        {/* 4 — Active listening control */}
        {listening ? (
          <button
            type="button"
            className="gbtn gbtn--danger"
            title="Stop listening"
            onClick={() => send({ type: "pause" })}
          >
            Stop Listening
          </button>
        ) : null}

        {/* 5 — Capture */}
        <button
          type="button"
          data-testid="glass-dock-capture"
          className="gbtn"
          title="Capture screen"
          onClick={() =>
            send(sessionLive ? { type: "session-capture" } : { type: "capture-screen-only" })
          }
        >
          Capture
        </button>

        {/* 6 — Overlay visibility */}
        <button
          type="button"
          className="gbtn"
          onClick={() => send({ type: "toggle-overlay" })}
          title="Toggle the full-screen glass overlay"
        >
          {overlayVisible ? "Hide Overlay" : "Show Overlay"}
        </button>

        {/* 7 — Layout chrome */}
        <div className="dock__chrome">
          <button
            type="button"
            data-testid="glass-dock-chrome-lock"
            className={`gbtn gbtn--ghost gbtn--icon chrome-lock${chromeLocked ? " chrome-lock--locked" : " chrome-lock--unlocked"}`}
            title={chromeLocked ? "Unlock layout" : "Lock layout"}
            aria-label={chromeLocked ? "Unlock layout" : "Lock layout"}
            onClick={toggleChromeLock}
          >
            {chromeLocked ? "🔒" : "🔓"}
          </button>
          <button
            type="button"
            data-testid="glass-dock-orientation"
            className="gbtn gbtn--ghost gbtn--icon chrome-rotate"
            title={vertical ? "Switch to horizontal dock" : "Switch to vertical dock"}
            aria-label={vertical ? "Switch to horizontal dock" : "Switch to vertical dock"}
            onClick={() =>
              send({
                type: "set-dock-orientation",
                orientation: vertical ? "horizontal" : "vertical",
              })
            }
          >
            ↻
          </button>
        </div>

        {/* 8 — Overflow */}
        <button
          type="button"
          className={`gbtn gbtn--ghost gbtn--icon dock-menu__trigger${menuOpen ? " dock-menu__trigger--open" : ""}`}
          aria-expanded={menuOpen}
          title="More actions"
          onClick={() => setMenuOpen((open) => !open)}
        >
          ⋯
        </button>
      </div>

      {menuOpen ? (
        <div className="dock__row dock__row--menu" role="menu">
          <button
            type="button"
            className="gbtn dock-menu__item"
            onClick={() => {
              send({ type: "set-overlay-mode", mode: nextOverlayMode(overlayMode) });
              setMenuOpen(false);
            }}
          >
            Overlay mode: {OVERLAY_MODE_LABELS[overlayMode]}
          </button>
          {hasSession ? (
            <button
              type="button"
              className="gbtn dock-menu__item"
              onClick={() => {
                send({ type: "session-analyze-now" });
                openPanelTab("summary");
                setMenuOpen(false);
              }}
            >
              Analyze Now
            </button>
          ) : null}
          <button
            type="button"
            className="gbtn dock-menu__item"
            onClick={() => {
              send(hasSession ? { type: "session-send" } : { type: "send-transcript" });
              setMenuOpen(false);
            }}
          >
            {hasSession ? "Send Session" : "Send to IIVO"}
          </button>
          <button
            type="button"
            className="gbtn dock-menu__item"
            onClick={() => {
              send({ type: "open-chat" });
              setMenuOpen(false);
            }}
          >
            Open in IIVO
          </button>
        </div>
      ) : null}
    </div>
  );
}
