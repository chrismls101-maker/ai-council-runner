/**
 * Ambient presence + live-UI surface rules for Aletheia computer operator.
 */

import type {
  AletheiaComputerOperatorSnapshot,
  ComputerOperatorEntrySurface,
  ComputerOperatorPhase,
} from "./aletheiaComputerOperatorLoop.ts";

/** Overlay edge glow + strip active indicator — operator loop is executing. */
export type ComputerOperatorGlowPhase = "running" | "paused";

export function resolveComputerOperatorGlowPhase(
  phase: ComputerOperatorPhase | undefined,
): ComputerOperatorGlowPhase | null {
  if (phase === "running") return "running";
  if (phase === "paused") return "paused";
  return null;
}

/** Command-bar toggle pulse while operator loop is executing (running or paused). */
export function isComputerOperatorStripActive(
  phase: ComputerOperatorPhase | undefined,
): boolean {
  return phase === "running" || phase === "paused";
}

export function computerOperatorOverlayRootClass(
  phase: ComputerOperatorPhase | undefined,
): string | false {
  const glow = resolveComputerOperatorGlowPhase(phase);
  if (glow === "running") return "overlay-root--computer-operator-running";
  if (glow === "paused") return "overlay-root--computer-operator-paused";
  return false;
}

/** Keep glow mounted through terminal phases so the fade-out animation can finish. */
export function shouldMountComputerOperatorOverlayGlow(
  phase: ComputerOperatorPhase | undefined,
): boolean {
  return (
    phase === "running"
    || phase === "paused"
    || phase === "complete"
    || phase === "failed"
  );
}

export function isComputerOperatorActivePhase(
  phase: ComputerOperatorPhase | undefined,
): boolean {
  return (
    phase === "awaiting_confirm"
    || phase === "awaiting_grant"
    || phase === "running"
    || phase === "paused"
  );
}

export function isComputerOperatorTerminalPhase(
  phase: ComputerOperatorPhase | undefined,
): boolean {
  return phase === "complete" || phase === "failed";
}

/** True when this UI surface should show live grant/audit (not read-only stub). */
export function isComputerOperatorLiveUiSurface(
  operator: AletheiaComputerOperatorSnapshot | undefined,
  surface: ComputerOperatorEntrySurface,
): boolean {
  if (!operator || !isComputerOperatorActivePhase(operator.phase)) return false;
  const origin = operator.entrySurface ?? "conversation";
  return origin === surface;
}

export function computerOperatorLiveSurfaceLabel(
  surface: ComputerOperatorEntrySurface | undefined,
): string {
  switch (surface) {
    case "conversation":
      return "the conversation";
    case "dashboard":
      return "this tab";
    default:
      return "the conversation";
  }
}

/** Where live UI lives when viewed from a non-originating surface (never "this tab"). */
export function computerOperatorLiveProgressLocation(
  surface: ComputerOperatorEntrySurface | undefined,
): string {
  if (surface === "dashboard") return "this tab";
  return "the conversation";
}
