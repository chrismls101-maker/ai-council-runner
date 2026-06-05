/**
 * Open macOS System Settings for Glass permission onboarding.
 */

import { shell } from "electron";

export type GlassSystemSettingsTarget =
  | "screenRecording"
  | "microphone"
  | "privacy"
  | "audioMidi"
  | "sound";

const MACOS_URLS: Record<GlassSystemSettingsTarget, string[]> = {
  screenRecording: [
    "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
    "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_ScreenCapture",
  ],
  microphone: [
    "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
    "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_Microphone",
  ],
  privacy: [
    "x-apple.systempreferences:com.apple.preference.security",
    "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension",
  ],
  audioMidi: ["file:///System/Applications/Utilities/Audio%20MIDI%20Setup.app/"],
  sound: [
    "x-apple.systempreferences:com.apple.preference.sound",
    "x-apple.systempreferences:com.apple.Sound-Settings.extension",
  ],
};

export async function openGlassSystemSettings(
  target: GlassSystemSettingsTarget,
): Promise<{ ok: boolean; message: string }> {
  if (process.platform !== "darwin") {
    return {
      ok: false,
      message: "Open system privacy settings manually on this platform.",
    };
  }

  const urls = MACOS_URLS[target];
  for (const url of urls) {
    try {
      await shell.openExternal(url);
      if (target === "screenRecording" || target === "microphone") {
        return {
          ok: true,
          message:
            "Opened Privacy & Security. Select IIVO Glass, enable the permission, then quit and reopen Glass if needed.",
        };
      }
      if (target === "audioMidi") {
        return { ok: true, message: "Opened Audio MIDI Setup." };
      }
      if (target === "sound") {
        return { ok: true, message: "Opened Sound settings." };
      }
      return { ok: true, message: "Opened Privacy & Security." };
    } catch {
      continue;
    }
  }

  return {
    ok: false,
    message: "Could not open System Settings. Open Privacy & Security manually.",
  };
}
