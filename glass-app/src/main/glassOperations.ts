/**
 * Electron broadcast helpers for Glass operation control.
 */

import { IPC, type TranscriptionControlCommand } from "../shared/ipc.ts";
import {
  applyStopAllState,
  type GlassOperationDiagnostics,
} from "../shared/glassOperations.ts";
import type { PrivacyState } from "../shared/privacyState.ts";
import type { GlassSttState } from "../shared/sttTypes.ts";
import { broadcast, getWindows } from "./windows.ts";

/** Setup probes open mic/display capture — must run in one renderer only (panel). */
const PANEL_ONLY_TRANSCRIPTION_COMMANDS = new Set<TranscriptionControlCommand["type"]>([
  "probe-microphone",
  "probe-virtual-audio-devices",
  "connect-system-audio",
  "test-system-audio",
  "test-blackhole",
  "startup-audio-restore",
]);

export function broadcastTranscriptionControl(command: TranscriptionControlCommand): void {
  if (PANEL_ONLY_TRANSCRIPTION_COMMANDS.has(command.type)) {
    const windows = getWindows();
    const panel = windows?.panel;
    if (panel && !panel.isDestroyed()) {
      panel.webContents.send(IPC.transcriptionControl, command);
      return;
    }
  }
  broadcast(IPC.transcriptionControl, command);
}

export function stopAllActiveCaptureAndListening(opts: {
  privacy: PrivacyState;
  stt: GlassSttState;
  diagnostics: GlassOperationDiagnostics;
  transcriptionMode: string;
}): ReturnType<typeof applyStopAllState> {
  broadcastTranscriptionControl({ type: "stop" });
  return applyStopAllState(opts);
}
