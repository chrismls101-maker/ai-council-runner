import { useRef, useState } from "react";
import type { OverlayMode } from "../../shared/glassWindowTypes.ts";
import { OVERLAY_MODES } from "../../shared/glassWindowTypes.ts";
import { send, useGlassState } from "../useGlassState.ts";
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
  const [menuOpen, setMenuOpen] = useState(false);
  const sessionStatus = state.session?.status ?? null;
  const sessionLive = sessionStatus === "active" || sessionStatus === "paused";
  const hasSession = !!state.session;
  const overlayMode = state.windows?.overlayMode ?? state.config.overlayMode ?? "passive";
  const overlayVisible = state.windows?.overlayVisible ?? state.config.overlayEnabled;

  useDockResize(dockRef, [
    sessionStatus,
    state.panelVisible,
    sessionLive,
    menuOpen,
    overlayVisible,
    overlayMode,
  ]);

  const openPanelTab = (tab: "summary" | "session" | "insights"): void => {
    send({ type: "set-tab", tab });
    if (!state.panelVisible) send({ type: "toggle-panel" });
  };

  return (
    <div className="dock dock--minimal" ref={dockRef}>
      <div className="dock__drag" title="Drag to reposition">
        <span className="dock__logo" aria-hidden="true" />
        <span className="dock__title">Glass</span>
      </div>

      <div className="dock__actions">
        {!sessionLive ? (
          <button
            type="button"
            className="gbtn gbtn--primary"
            onClick={() => send({ type: "session-start" })}
            title="Start a work session"
          >
            Start Session
          </button>
        ) : (
          <>
            {sessionStatus === "active" ? (
              <button type="button" className="gbtn" onClick={() => send({ type: "session-pause" })}>
                Pause
              </button>
            ) : (
              <button type="button" className="gbtn" onClick={() => send({ type: "session-resume" })}>
                Resume
              </button>
            )}
            <button type="button" className="gbtn gbtn--danger" onClick={() => send({ type: "session-end" })}>
              End
            </button>
          </>
        )}

        <button
          type="button"
          className="gbtn"
          onClick={() => send(sessionLive ? { type: "session-capture" } : { type: "send-screenshot" })}
        >
          Capture
        </button>

        <button
          type="button"
          className="gbtn"
          onClick={() => openPanelTab("session")}
          title="Open session controls including Start Listening"
        >
          Listen
        </button>

        <button type="button" className="gbtn" onClick={() => send({ type: "save-moment" })}>
          Save Moment
        </button>

        <button
          type="button"
          className="gbtn gbtn--panel"
          onClick={() => send({ type: "toggle-panel" })}
        >
          {state.panelVisible ? "Close Panel" : "Open Panel"}
        </button>

        <button type="button" className="gbtn" onClick={() => send({ type: "ask-iivo" })}>
          Ask IIVO
        </button>

        <button
          type="button"
          className="gbtn gbtn--danger"
          onClick={() => send({ type: "stop" })}
          title="Stop listening, capture, and sending"
        >
          Stop Everything
        </button>

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
              send({ type: "toggle-overlay" });
              setMenuOpen(false);
            }}
          >
            {overlayVisible ? "Hide Overlay" : "Show Overlay"}
          </button>
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
