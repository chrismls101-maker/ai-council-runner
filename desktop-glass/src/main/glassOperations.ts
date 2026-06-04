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
import { broadcast } from "./windows.ts";

export function broadcastTranscriptionControl(command: TranscriptionControlCommand): void {
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
