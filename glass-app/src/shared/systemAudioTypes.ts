/**
 * System audio capture status for IIVO Glass.
 * Never claims capture works when it does not.
 */

export type SystemAudioStatus =
  | "available"
  | "requires_permission"
  | "requires_virtual_device"
  | "source_enumeration_failed"
  | "not_tested"
  | "unsupported"
  | "error";

export const SYSTEM_AUDIO_STATUS_MESSAGES: Record<
  Exclude<SystemAudioStatus, "error">,
  string
> = {
  available: "System audio capture available.",
  requires_permission: "Grant Screen Recording / audio capture permission.",
  requires_virtual_device: "System audio capture requires a virtual audio device.",
  source_enumeration_failed: "System audio source enumeration failed.",
  not_tested: "System audio loopback not verified yet.",
  unsupported: "System audio capture is not supported in this build.",
};

export const SYSTEM_AUDIO_CAPTURE_ACTIVE_MESSAGE =
  "System audio capture active. Transcription provider not connected — paste transcript manually.";

export const SYSTEM_AUDIO_TRANSCRIPTION_UNAVAILABLE_MESSAGE =
  "Audio captured, transcription provider not connected.";

export function systemAudioStatusMessage(
  status: SystemAudioStatus,
  detail?: string,
): string {
  if (status === "error") {
    return detail?.trim() || "System audio capture failed.";
  }
  return SYSTEM_AUDIO_STATUS_MESSAGES[status];
}
