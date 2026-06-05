/**
 * Persists Glass user settings to Electron userData.
 */

import { promises as fs } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import {
  DEFAULT_GLASS_USER_SETTINGS,
  parseChromeOrigin,
  parseDisplayTarget,
  parseAutoUploadCapturesToContext,
  parseMicAutoSendAfterSilence,
  parseBootSoundEnabled,
  parseDockOrientation,
  parseHotkeyPreset,
  parseSaveVisualAsksToSession,
  type GlassUserSettings,
} from "../shared/glassSettings.ts";

function settingsFilePath(): string {
  return join(app.getPath("userData"), "glass-settings.json");
}

export async function loadGlassUserSettings(): Promise<GlassUserSettings> {
  try {
    const raw = await fs.readFile(settingsFilePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<GlassUserSettings>;
    return {
      hotkeyPreset: parseHotkeyPreset(parsed.hotkeyPreset),
      displayTarget: parseDisplayTarget(
        typeof parsed.displayTarget === "number"
          ? String(parsed.displayTarget)
          : (parsed.displayTarget as string | undefined),
      ),
      chromeLayoutLocked: parsed.chromeLayoutLocked !== false,
      dockOrientation: parseDockOrientation(parsed.dockOrientation),
      dockCustomOrigin: parseChromeOrigin(parsed.dockCustomOrigin),
      commandBarCustomOrigin: parseChromeOrigin(parsed.commandBarCustomOrigin),
      bootSoundEnabled: parseBootSoundEnabled(parsed.bootSoundEnabled),
      saveVisualAsksToSession: parseSaveVisualAsksToSession(parsed.saveVisualAsksToSession),
      autoUploadCapturesToContext: parseAutoUploadCapturesToContext(
        parsed.autoUploadCapturesToContext,
      ),
      micAutoSendAfterSilence: parseMicAutoSendAfterSilence(parsed.micAutoSendAfterSilence),
      selectedVirtualAudioDeviceId:
        typeof parsed.selectedVirtualAudioDeviceId === "string" &&
        parsed.selectedVirtualAudioDeviceId.trim()
          ? parsed.selectedVirtualAudioDeviceId.trim()
          : undefined,
    };
  } catch {
    return { ...DEFAULT_GLASS_USER_SETTINGS };
  }
}

export async function persistGlassUserSettings(settings: GlassUserSettings): Promise<void> {
  try {
    await fs.writeFile(settingsFilePath(), JSON.stringify(settings, null, 2), "utf8");
  } catch {
    // best-effort
  }
}
