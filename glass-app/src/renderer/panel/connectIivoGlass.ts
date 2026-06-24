import { send } from "../useGlassState.ts";
import {
  permissionsSummaryFromSetup,
  type GlassCapabilityRow,
} from "../../shared/glassCapabilities.ts";
import type { SystemAudioStatus } from "../../shared/systemAudioTypes.ts";
import { isSystemAudioConnected } from "../../shared/systemAudioUi.ts";
import { reportVirtualAudioDevices } from "./virtualAudioScan.ts";

export function isIivoGlassConnected(input: {
  setupCheckSummary?: string;
  setupCapabilities?: GlassCapabilityRow[];
  systemAudioStatus: SystemAudioStatus;
}): boolean {
  if (!input.setupCheckSummary?.trim()) return false;
  if (!isSystemAudioConnected(input.systemAudioStatus)) return false;
  const rows = input.setupCapabilities ?? [];
  if (rows.length === 0) return false;
  const server = rows.find((row) => row.id === "server");
  if (server?.severity === "error") return false;
  const screen = rows.find((row) => row.id === "screenRecording");
  const window = rows.find((row) => row.id === "windowCapture");
  if (screen?.status !== "ready" || window?.status !== "ready") return false;
  return permissionsSummaryFromSetup(rows).level !== "error";
}

/** Full Glass connect: device scan + setup check (includes system-audio connect). */
export async function connectIivoGlass(): Promise<void> {
  await reportVirtualAudioDevices();
  send({ type: "run-setup-check", forceCaptureProbe: true });
}

/** Human-readable reason the Connect button is not green yet. */
export function resolveConnectBlockerMessage(input: {
  setupCheckSummary?: string;
  setupCapabilities?: GlassCapabilityRow[];
  systemAudioStatus: SystemAudioStatus;
}): string | undefined {
  if (isIivoGlassConnected(input)) return undefined;

  const rows = input.setupCapabilities ?? [];
  const server = rows.find((row) => row.id === "server");
  if (server?.severity === "error") {
    return server.detail ?? "IIVO server unreachable — check IIVO_API_URL and network.";
  }

  const screen = rows.find((row) => row.id === "screenRecording");
  if (screen?.status !== "ready") {
    return (
      screen?.detail ??
      "Screen Recording permission needed — System Settings → Privacy & Security → Screen Recording → enable IIVO Glass, then quit and reopen."
    );
  }

  const windowRow = rows.find((row) => row.id === "windowCapture");
  if (windowRow?.status !== "ready") {
    return windowRow?.detail ?? "Window capture is not ready — run Setup Check again.";
  }

  if (!isSystemAudioConnected(input.systemAudioStatus)) {
    if (input.systemAudioStatus === "requires_virtual_device") {
      return "System audio needs BlackHole (Setup → install) or approve the macOS screen picker when Connect opens it.";
    }
    if (input.systemAudioStatus === "requires_permission") {
      return "System audio needs Screen Recording permission — grant it for IIVO Glass, then quit and reopen.";
    }
    if (input.systemAudioStatus === "not_tested") {
      return "System audio not verified yet — Connect again; if macOS shows a screen picker, choose your display with audio enabled.";
    }
    return "System audio not connected — Connect again and watch for a macOS screen or audio permission prompt.";
  }

  return input.setupCheckSummary?.trim() || undefined;
}
