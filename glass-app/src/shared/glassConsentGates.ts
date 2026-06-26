/**
 * Pure consent gate helpers — architecture law enforcement.
 *
 * No mic, screen, or system-audio recording may activate without the
 * corresponding consent flag AND Terms acceptance (tosAck).
 */

export type GlassConsentSnapshot = {
  micAck?: boolean;
  screenAck?: boolean;
  recordingAck?: boolean;
  tosAck?: boolean;
};

export function hasTosConsent(consent: GlassConsentSnapshot | null | undefined): boolean {
  return consent?.tosAck === true;
}

/** Companion voice / microphone listening. */
export function canActivateMicRecording(consent: GlassConsentSnapshot | null | undefined): boolean {
  return hasTosConsent(consent) && consent?.micAck === true;
}

/** Screen capture / visual ask / Lens. */
export function canActivateScreenCapture(consent: GlassConsentSnapshot | null | undefined): boolean {
  return hasTosConsent(consent) && consent?.screenAck === true;
}

/** System audio / meeting capture modes. */
export function canActivateSystemAudioRecording(
  consent: GlassConsentSnapshot | null | undefined,
): boolean {
  return hasTosConsent(consent) && consent?.recordingAck === true;
}

/** Listen pipeline — mode selects which consent pair applies. */
export function canActivateListenCapture(
  consent: GlassConsentSnapshot | null | undefined,
  mode: string | undefined,
): boolean {
  if (mode === "system_audio") return canActivateSystemAudioRecording(consent);
  return canActivateMicRecording(consent);
}
