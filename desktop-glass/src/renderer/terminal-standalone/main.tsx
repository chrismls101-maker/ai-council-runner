import { createRoot } from "react-dom/client";
import { useState, useEffect, useCallback } from "react";
import { GlassTerminalPanel } from "../dock/GlassTerminalPanel.tsx";
import { FirstRunSetup } from "./FirstRunSetup.tsx";
import "./FirstRunSetup.css";
import "../styles/glass.css";

/** Double-rAF ensures the browser has committed the closed clip-path before
 *  toggling --open, giving the CSS transition something to animate from. */
function beginReveal(setRevealed: (v: boolean) => void): () => void {
  setRevealed(false);
  const id = requestAnimationFrame(() => requestAnimationFrame(() => setRevealed(true)));
  return () => cancelAnimationFrame(id);
}

function TerminalWindowChrome({ children }: { children: JSX.Element }): JSX.Element {
  return (
    <>
      <div className="terminal-window-drag" aria-hidden="true" />
      {children}
    </>
  );
}

function TerminalApp(): JSX.Element {
  // null = still checking which screen to show
  const [setupDone, setSetupDone] = useState<boolean | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    window.glass
      .apiKeyList()
      .then((res) => {
        const hasAiKey = res.keys.some(
          (k) => {
            const service = k.service.toLowerCase();
            return (
              service.includes("anthropic") ||
              service.includes("claude") ||
              service.includes("ai")
            );
          },
        );
        setSetupDone(hasAiKey);
      })
      .catch(() => setSetupDone(true));
  }, []);

  // Trigger the center-spread reveal once the terminal is ready to show.
  const handleSetupComplete = useCallback((): void => {
    setSetupDone(true);
  }, []);

  useEffect(() => {
    if (setupDone === true) {
      return beginReveal(setRevealed);
    }
    return undefined;
  }, [setupDone]);

  if (setupDone === null) {
    return (
      <TerminalWindowChrome>
        <div className="frs-loading" />
      </TerminalWindowChrome>
    );
  }
  if (!setupDone) {
    return (
      <TerminalWindowChrome>
        <FirstRunSetup onComplete={handleSetupComplete} />
      </TerminalWindowChrome>
    );
  }

  return (
    <TerminalWindowChrome>
      <div className="terminal-root" style={{ background: "#0a0c12" }}>
        <div
          className={`dock-terminal-reveal${revealed ? " dock-terminal-reveal--open" : ""}`}
          data-testid="glass-terminal-reveal"
        >
          <div className="dock-terminal-reveal__inner">
            <GlassTerminalPanel />
          </div>
        </div>
      </div>
    </TerminalWindowChrome>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<TerminalApp />);
}
