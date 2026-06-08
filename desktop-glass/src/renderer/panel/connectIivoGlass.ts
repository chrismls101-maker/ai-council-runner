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
  return permissionsSummaryFromSetup(rows).level !== "error";
}

/** Full Glass connect: device scan + setup check (includes system-audio connect). */
export async function connectIivoGlass(): Promise<void> {
  await reportVirtualAudioDevices();
  send({ type: "run-setup-check" });
}
