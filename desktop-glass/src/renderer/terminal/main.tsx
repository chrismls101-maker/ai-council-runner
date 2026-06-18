import "../initSentry.ts";
import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { GlassTerminalPanel } from "../dock/GlassTerminalPanel.tsx";
import { useGlassState } from "../useGlassState.ts";
import "../styles/glass.css";

function beginReveal(setRevealed: (value: boolean) => void): () => void {
  setRevealed(false);
  const frame = requestAnimationFrame(() => {
    requestAnimationFrame(() => setRevealed(true));
  });
  return () => cancelAnimationFrame(frame);
}

function TerminalShell(): JSX.Element {
  const state = useGlassState();
  const open = state.glassDockTerminalOpen ?? false;
  const [panelMounted, setPanelMounted] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const runOpenReveal = useCallback((): void => {
    setPanelMounted(true);
    beginReveal(setRevealed);
  }, []);

  useEffect(() => window.glass.onTerminalWindowShown(runOpenReveal), [runOpenReveal]);

  useEffect(() => {
    if (open) {
      setPanelMounted(true);
      return beginReveal(setRevealed);
    }
    setRevealed(false);
    return undefined;
  }, [open]);

  return (
    <div className="terminal-root">
      <div
        className={`dock-terminal-reveal${revealed ? " dock-terminal-reveal--open" : ""}`}
        data-testid="glass-terminal-reveal"
      >
        <div className="dock-terminal-reveal__inner">
          {panelMounted ? <GlassTerminalPanel /> : null}
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TerminalShell />
  </StrictMode>,
);
