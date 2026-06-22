import { useEffect, useRef } from "react";
import { formatOverlayPlainText } from "../../shared/overlayPlainText.ts";
import {
  ensureOverlayInteractive,
  handlePaletteListWheel,
  prepareGlassTextContextMenu,
  prepareGlassTextPointerDown,
} from "../glassTextInteraction.ts";
import { send, useGlassState } from "../useGlassState.ts";
import "./GlassDebriefPanel.css";

/**
 * Left-side session debrief panel — click-through outside the panel (like Powers
 * menu), OS-interactive only while the pointer is over the panel body.
 */
export function GlassDebriefPanel(): JSX.Element | null {
  const state = useGlassState();
  const debrief = state.copilot.debrief ?? null;
  const generatingDebrief = state.lastNotice === "Generating debrief…";
  const visible = generatingDebrief || !!debrief;
  const hoverRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      window.glass.setOverlayPointerOverDebriefPanel?.(false);
    }
    return () => {
      window.glass.setOverlayPointerOverDebriefPanel?.(false);
    };
  }, [visible]);

  useEffect(() => {
    if (!debrief) return;
    const timer = window.setTimeout(() => {
      if (hoverRef.current) return;
      send({ type: "copilot-dismiss-debrief" });
    }, 90_000);
    return () => window.clearTimeout(timer);
  }, [debrief?.sessionId]);

  const setPanelInteractive = (over: boolean): void => {
    hoverRef.current = over;
    window.glass.setOverlayPointerOverDebriefPanel?.(over);
    if (over) ensureOverlayInteractive();
  };

  if (!visible) return null;

  return (
    <div className="glass-debrief-panel-backdrop" data-testid="glass-debrief-panel">
      <aside
        className="glass-debrief-panel"
        onMouseEnter={() => setPanelInteractive(true)}
        onMouseLeave={() => setPanelInteractive(false)}
        onPointerDown={prepareGlassTextPointerDown}
      >
        <header className="glass-debrief-panel__header">
          <div>
            <div className="glass-debrief-panel__eyebrow">Session Debrief</div>
            <div className="glass-debrief-panel__title">
              {generatingDebrief && !debrief ? "Generating…" : "Your session summary"}
            </div>
          </div>
          {debrief ? (
            <button
              type="button"
              className="glass-debrief-panel__close"
              data-testid="glass-copilot-debrief-dismiss"
              aria-label="Dismiss debrief"
              onClick={() => send({ type: "copilot-dismiss-debrief" })}
            >
              ✕
            </button>
          ) : null}
        </header>

        {generatingDebrief && !debrief ? (
          <p className="glass-debrief-panel__loading" data-testid="glass-copilot-debrief-loading">
            Summarizing your session — this usually takes a few seconds.
          </p>
        ) : debrief ? (
          <>
            <div
              className="glass-debrief-panel__body"
              data-testid="glass-copilot-debrief"
              role="document"
              onWheel={handlePaletteListWheel}
              onContextMenu={prepareGlassTextContextMenu}
            >
              {formatOverlayPlainText(debrief.markdown)}
            </div>
            <div className="glass-debrief-panel__footer">
              <button
                type="button"
                className="gbtn gbtn--primary"
                onClick={() => send({ type: "copilot-open-debrief-in-iivo" })}
              >
                Open in IIVO
              </button>
              <button
                type="button"
                className="gbtn gbtn--ghost"
                onClick={() => send({ type: "copilot-dismiss-debrief" })}
              >
                Dismiss
              </button>
            </div>
          </>
        ) : null}
      </aside>
    </div>
  );
}
