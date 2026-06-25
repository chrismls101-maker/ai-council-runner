import type { TranscriptionMode } from "./audioCaptureTypes.ts";
import type { GlassUserSettings } from "./glassSettings.ts";
import type { SystemAudioStatus } from "./systemAudioTypes.ts";

export interface PersistedAudioStateTarget {
  transcriptionMode: TranscriptionMode;
  systemAudioStatus: SystemAudioStatus;
}

export function buildAudioPersistencePatch(
  target: PersistedAudioStateTarget,
): Partial<GlassUserSettings> {
  const systemAudioEnabledAtQuit =
    target.transcriptionMode === "system_audio" && target.systemAudioStatus === "available";
  return {
    systemAudioEnabledAtQuit,
    persistedTranscriptionMode: target.transcriptionMode,
    persistedSystemAudioStatus: target.systemAudioStatus,
    audioRoutingConfigured: systemAudioEnabledAtQuit,
  };
}

export function applyPersistedAudioState(
  settings: Pick<
    GlassUserSettings,
    "systemAudioEnabledAtQuit" | "persistedTranscriptionMode" | "persistedSystemAudioStatus"
  >,
  target: PersistedAudioStateTarget,
): boolean {
  if (!settings.systemAudioEnabledAtQuit) return false;
  if (settings.persistedTranscriptionMode) {
    target.transcriptionMode = settings.persistedTranscriptionMode;
  }
  if (settings.persistedSystemAudioStatus === "available") {
    target.systemAudioStatus = "available";
    return true;
  }
  return false;
}
