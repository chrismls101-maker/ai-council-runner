/**
 * macOS permission probes for Aletheia control plane (P0.4).
 */

import { systemPreferences } from "electron";

export interface AletheiaOsPermissionProbe {
  accessibilityGranted: boolean | null;
  micMediaAccess: boolean | null;
  screenMediaAccess: boolean | null;
}

export function probeAletheiaOsPermissions(): AletheiaOsPermissionProbe {
  if (process.platform !== "darwin") {
    return {
      accessibilityGranted: null,
      micMediaAccess: null,
      screenMediaAccess: null,
    };
  }

  let accessibilityGranted: boolean | null = null;
  let micMediaAccess: boolean | null = null;
  let screenMediaAccess: boolean | null = null;

  try {
    accessibilityGranted = systemPreferences.isTrustedAccessibilityClient(false);
  } catch {
    accessibilityGranted = null;
  }

  try {
    micMediaAccess = systemPreferences.getMediaAccessStatus("microphone") === "granted";
  } catch {
    micMediaAccess = null;
  }

  try {
    screenMediaAccess = systemPreferences.getMediaAccessStatus("screen") === "granted";
  } catch {
    screenMediaAccess = null;
  }

  return { accessibilityGranted, micMediaAccess, screenMediaAccess };
}
