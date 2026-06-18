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
  parseClipboardIntelligenceEnabled,
  parseBootSoundEnabled,
  parseDockOrientation,
  parseHotkeyPreset,
  parseSaveVisualAsksToSession,
  parseCopilotSettings,
  parseGlassServerUrl,
  type GlassUserSettings,
} from "../shared/glassSettings.ts";

function settingsFilePath(): string {
  return join(app.getPath("userData"), "glass-settings.json");
}

/** Bump when default dock placement changes — clears saved dock origin once. */
const DOCK_LAYOUT_VERSION = 3;

function buildSettingsFromParsed(parsed: Partial<GlassUserSettings>): GlassUserSettings {
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
      clipboardIntelligenceEnabled: parseClipboardIntelligenceEnabled(
        parsed.clipboardIntelligenceEnabled,
      ),
      selectedVirtualAudioDeviceId:
        typeof parsed.selectedVirtualAudioDeviceId === "string" &&
        parsed.selectedVirtualAudioDeviceId.trim()
          ? parsed.selectedVirtualAudioDeviceId.trim()
          : undefined,
      copilot: parseCopilotSettings(parsed.copilot),
      iivoApiUrl: parseGlassServerUrl(parsed.iivoApiUrl),
      iivoWebUrl: parseGlassServerUrl(parsed.iivoWebUrl),
    };
}

export async function loadGlassUserSettings(): Promise<GlassUserSettings> {
  try {
    const raw = await fs.readFile(settingsFilePath(), "utf8");
    const file = JSON.parse(raw) as Partial<GlassUserSettings> & { dockLayoutVersion?: number };
    const dockLayoutVersion =
      typeof file.dockLayoutVersion === "number" ? file.dockLayoutVersion : 1;
    const settings = buildSettingsFromParsed(file);
    if (dockLayoutVersion < DOCK_LAYOUT_VERSION) {
      const migrated = { ...settings, dockCustomOrigin: null };
      await persistGlassUserSettings(migrated);
      return migrated;
    }
    return settings;
  } catch {
    return { ...DEFAULT_GLASS_USER_SETTINGS };
  }
}

export async function persistGlassUserSettings(settings: GlassUserSettings): Promise<void> {
  try {
    await fs.writeFile(
      settingsFilePath(),
      JSON.stringify({ ...settings, dockLayoutVersion: DOCK_LAYOUT_VERSION }, null, 2),
      "utf8",
    );
  } catch {
    // best-effort
  }
}
