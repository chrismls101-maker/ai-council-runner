import { useEffect, useState } from "react";
import type { AletheiaComputerOperatorSnapshot } from "../../shared/aletheiaComputerOperatorLoop.ts";
import { resolveComputerOperatorGlowPhase } from "../../shared/aletheiaComputerOperatorPresence.ts";
import "./overlayComputerOperatorGlow.css";

type GlowDisplay = "running" | "paused" | "exit";

const EXIT_MS = 700;

interface OverlayComputerOperatorGlowProps {
  operator?: AletheiaComputerOperatorSnapshot;
}

/**
 * Screen-edge ambient glow while Aletheia is operating the user's computer.
 * Sits on the always-on-top Glass overlay — visible over any foreground app.
 */
export function OverlayComputerOperatorGlow({
  operator,
}: OverlayComputerOperatorGlowProps): JSX.Element | null {
  const live = resolveComputerOperatorGlowPhase(operator?.phase);
  const [display, setDisplay] = useState<GlowDisplay | null>(live);

  useEffect(() => {
    if (live) {
      setDisplay(live);
      return;
    }
    setDisplay((prev) => (prev === "running" || prev === "paused" ? "exit" : prev));
  }, [live, operator?.phase, operator?.updatedAt]);

  useEffect(() => {
    if (display !== "exit") return;
    const id = window.setTimeout(() => setDisplay(null), EXIT_MS);
    return () => window.clearTimeout(id);
  }, [display]);

  if (!display) return null;

  return (
    <div
      className={`overlay-computer-operator-glow overlay-computer-operator-glow--${display}`}
      data-testid="overlay-computer-operator-glow"
      data-glow={display}
      aria-hidden="true"
      role="presentation"
    />
  );
}
