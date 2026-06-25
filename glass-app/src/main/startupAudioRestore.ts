/**
 * Re-apply saved audio routing after boot so users don't repeat manual setup.
 */

import type { GlassUserSettings } from "../shared/glassSettings.ts";
import {
  applyPersistedAudioState,
  buildAudioPersistencePatch,
  type PersistedAudioStateTarget,
} from "../shared/audioStartupPersistence.ts";
import { broadcastTranscriptionControl } from "./glassOperations.ts";
import { setMacOutputDeviceByName } from "./macAudioOutput.ts";

export type { PersistedAudioStateTarget };
export { applyPersistedAudioState, buildAudioPersistencePatch };

export interface StartupAudioRestoreResult {
  restoredOutput: boolean;
  outputMessage?: string;
}

export async function restoreMacOutputFromSettings(
  settings: GlassUserSettings,
): Promise<StartupAudioRestoreResult> {
  if (process.platform !== "darwin" || !settings.savedMacOutputDeviceName?.trim()) {
    return { restoredOutput: false };
  }
  const result = await setMacOutputDeviceByName(settings.savedMacOutputDeviceName);
  return {
    restoredOutput: result.ok,
    outputMessage: result.message,
  };
}

export function broadcastStartupAudioRestore(): void {
  if (process.env.IIVO_GLASS_E2E === "1") return;
  broadcastTranscriptionControl({ type: "startup-audio-restore" });
}
