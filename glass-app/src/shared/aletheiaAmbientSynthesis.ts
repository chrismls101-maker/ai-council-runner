/**
 * Aletheia ambient multi-signal synthesis (B1.3 — Sensing Layer).
 *
 * Collects screen, clipboard, terminal, and app signals into one connected
 * picture for enrichment once conversation relevance is established.
 */

import type { TerminalContextBlock } from "./ipc.ts";
import type { ObservationMode } from "./aletheiaObservationSignals.ts";

export interface AmbientSynthesisInput {
  now?: number;
  activeApp?: string;
  previousApp?: string;
  screenDigest?: string;
  screenDigestFresh?: boolean;
  clipboardText?: string;
  terminalBlocks?: readonly TerminalContextBlock[];
  observationMode?: ObservationMode;
}

export interface AmbientSignalConnection {
  id: string;
  signals: string[];
  insight: string;
}

export interface AletheiaAmbientSynthesisSnapshot {
  updatedAt: number;
  connectedPicture: string | null;
  connections: AmbientSignalConnection[];
  enrichedContext: string | null;
  signalCount: number;
  ready: boolean;
}

const DEV_APPS = /\b(cursor|code|vscode|visual studio|xcode|terminal|iterm|warp|figma|slack)\b/i;

function normalize(text: string | undefined): string {
  return text?.trim().toLowerCase() ?? "";
}

function clip(text: string, max = 120): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function lastTerminalError(blocks: readonly TerminalContextBlock[] | undefined) {
  if (!blocks?.length) return null;
  for (let i = blocks.length - 1; i >= 0; i -= 1) {
    if (blocks[i]!.status === "error") return blocks[i]!;
  }
  return null;
}

function clipboardMatchesTerminalError(
  clipboardText: string | undefined,
  errorBlock: TerminalContextBlock | null,
): boolean {
  if (!clipboardText || !errorBlock) return false;
  const clipNorm = normalize(clipboardText);
  const output = normalize(errorBlock.output);
  if (!output) return false;

  const errorLines = output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 8);

  return errorLines.some((line) => clipNorm.includes(line.slice(0, 80)));
}

function buildConnectedPicture(
  input: AmbientSynthesisInput,
  connections: AmbientSignalConnection[],
): string | null {
  if (connections.length > 0) {
    return connections[0]!.insight;
  }

  const parts: string[] = [];
  if (input.screenDigestFresh && input.screenDigest) {
    parts.push(clip(input.screenDigest, 140));
  } else if (input.activeApp) {
    parts.push(`Working in ${input.activeApp}.`);
  }

  if (input.clipboardText && input.clipboardText.length > 0) {
    parts.push("Clipboard has recent text.");
  }

  if (parts.length === 0) return null;
  return parts.join(" ");
}

function countActiveSignals(input: AmbientSynthesisInput): number {
  let count = 0;
  if (input.activeApp) count += 1;
  if (input.screenDigestFresh && input.screenDigest) count += 1;
  if (input.clipboardText) count += 1;
  if (input.terminalBlocks && input.terminalBlocks.length > 0) count += 1;
  return count;
}

export function buildAletheiaAmbientSynthesis(
  input: AmbientSynthesisInput,
): AletheiaAmbientSynthesisSnapshot {
  const now = input.now ?? Date.now();
  const connections: AmbientSignalConnection[] = [];
  const terminalError = lastTerminalError(input.terminalBlocks);
  const appName = input.activeApp ?? "";
  const appNorm = normalize(appName);

  if (
    terminalError
    && clipboardMatchesTerminalError(input.clipboardText, terminalError)
  ) {
    connections.push({
      id: "terminal_clipboard_error",
      signals: ["terminal", "clipboard"],
      insight: `Your terminal shows a failed command and your clipboard matches that error text${appName ? ` while you are in ${appName}` : ""}.`,
    });
  } else if (terminalError && DEV_APPS.test(appNorm)) {
    connections.push({
      id: "terminal_dev_app",
      signals: ["terminal", "activeApp"],
      insight: `Your terminal has a recent error and you are in ${appName} — likely debugging the same issue.`,
    });
  }

  if (
    input.screenDigestFresh
    && input.screenDigest
    && appName
    && normalize(input.screenDigest).includes(appNorm)
  ) {
    connections.push({
      id: "screen_app_alignment",
      signals: ["screen", "activeApp"],
      insight: `Screen context aligns with ${appName}: ${clip(input.screenDigest, 100)}`,
    });
  } else if (
    input.previousApp
    && appName
    && input.previousApp !== appName
    && input.screenDigestFresh
  ) {
    connections.push({
      id: "app_switch",
      signals: ["activeApp", "screen"],
      insight: `You switched from ${input.previousApp} to ${appName} — screen context is updating.`,
    });
  }

  if (
    input.clipboardText
    && input.clipboardText.length > 20
    && terminalError
    && !clipboardMatchesTerminalError(input.clipboardText, terminalError)
  ) {
    connections.push({
      id: "clipboard_parallel_terminal",
      signals: ["clipboard", "terminal"],
      insight: "Clipboard text and terminal output are both active — you may be copying errors or commands between them.",
    });
  }

  const signalCount = countActiveSignals(input);
  const connectedPicture = buildConnectedPicture(input, connections);
  const ready = signalCount >= 2 || connections.length > 0;

  let enrichedContext: string | null = null;
  if (connectedPicture || connections.length > 0) {
    const lines = [
      "Ambient synthesis (local signals — use only when relevant; never as an unsolicited opener):",
    ];
    if (connectedPicture) lines.push(connectedPicture);
    for (const row of connections.slice(0, 3)) {
      lines.push(`- ${row.insight}`);
    }
    enrichedContext = lines.join("\n");
  }

  return {
    updatedAt: now,
    connectedPicture,
    connections,
    enrichedContext,
    signalCount,
    ready,
  };
}

export function ambientSynthesisForUserContext(
  snapshot: AletheiaAmbientSynthesisSnapshot | null | undefined,
  options: { confirmOnly?: boolean } = {},
): string | undefined {
  if (!snapshot) return undefined;

  if (options.confirmOnly) {
    if (!snapshot.connectedPicture && snapshot.connections.length === 0) {
      return undefined;
    }
    const confirmLines = [
      "Observed context for confirmation only:",
      snapshot.connectedPicture ?? snapshot.connections[0]?.insight ?? "",
    ].filter(Boolean);
    return confirmLines.join("\n");
  }

  return snapshot.enrichedContext?.trim() || undefined;
}

export function ambientSynthesisSnapshotsEqual(
  a: AletheiaAmbientSynthesisSnapshot | null | undefined,
  b: AletheiaAmbientSynthesisSnapshot | null | undefined,
): boolean {
  if (!a || !b) return false;
  if (a.connectedPicture !== b.connectedPicture) return false;
  if (a.connections.length !== b.connections.length) return false;
  for (let i = 0; i < a.connections.length; i += 1) {
    if (a.connections[i].id !== b.connections[i].id) return false;
    if (a.connections[i].insight !== b.connections[i].insight) return false;
  }
  return true;
}
