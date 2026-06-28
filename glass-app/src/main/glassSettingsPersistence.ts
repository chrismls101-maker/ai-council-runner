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
  parseDockPlacement,
  parseHotkeyPreset,
  parseSaveVisualAsksToSession,
  parseCopilotSettings,
  parseGlassServerUrl,
  parseAgentOutputFolder,
  parseCoderPanelWidth,
  parseBoolDefaultTrue,
  parseBoolDefaultFalse,
  parsePersistedTranscriptionMode,
  parsePersistedSystemAudioStatus,
  parseSystemAudioEnabledAtQuit,
  type GlassUserSettings,
} from "../shared/glassSettings.ts";
import { parseRecentCoderProjects } from "../shared/recentCoderProjects.ts";
import { parseCoderAgentModelId } from "../shared/coderAgentModels.ts";
import {
  DEFAULT_DESIGN_STACK,
  DESIGN_STACK_LABELS,
  type DesignStack,
} from "../shared/designToCode.ts";
import { parseUiLocaleSetting } from "../shared/glassLocale.ts";

// Derived from DESIGN_STACK_LABELS so it stays in sync automatically when new stacks are added.
const VALID_DESIGN_STACKS = new Set<DesignStack>(
  Object.keys(DESIGN_STACK_LABELS) as DesignStack[],
);

function parseDesignStack(v: unknown): DesignStack {
  return VALID_DESIGN_STACKS.has(v as DesignStack) ? (v as DesignStack) : DEFAULT_DESIGN_STACK;
}

function settingsFilePath(): string {
  return join(app.getPath("userData"), "glass-settings.json");
}

/** Bump when default dock placement changes — clears saved dock origin once. */
const DOCK_LAYOUT_VERSION = 5;

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
      dockPlacement: parseDockPlacement(parsed.dockPlacement),
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
      audioRoutingConfigured: parsed.audioRoutingConfigured === true,
      savedMacOutputDeviceName:
        typeof parsed.savedMacOutputDeviceName === "string" &&
        parsed.savedMacOutputDeviceName.trim()
          ? parsed.savedMacOutputDeviceName.trim()
          : undefined,
      persistedTranscriptionMode: parsePersistedTranscriptionMode(parsed.persistedTranscriptionMode),
      persistedSystemAudioStatus: parsePersistedSystemAudioStatus(parsed.persistedSystemAudioStatus),
      systemAudioEnabledAtQuit: parseSystemAudioEnabledAtQuit(parsed.systemAudioEnabledAtQuit),
      copilot: parseCopilotSettings(parsed.copilot),
      iivoApiUrl: parseGlassServerUrl(parsed.iivoApiUrl),
      iivoWebUrl: parseGlassServerUrl(parsed.iivoWebUrl),
      designStack: parseDesignStack(parsed.designStack),
      persona: (["developer", "sales", "operator", "writer", "general"] as const).includes(
        parsed.persona as "developer" | "sales" | "operator" | "writer" | "general",
      )
        ? (parsed.persona as "developer" | "sales" | "operator" | "writer" | "general")
        : undefined,
      onboardingComplete: parsed.onboardingComplete === true,
      uiLocale: parseUiLocaleSetting(parsed.uiLocale),
      agentOutputFolder: parseAgentOutputFolder(parsed.agentOutputFolder),
      agentCodeWorkspaceRoot: parseAgentOutputFolder(parsed.agentCodeWorkspaceRoot),
      coderPanelWidthPx: parseCoderPanelWidth(parsed.coderPanelWidthPx),
      indexEnabled: parseBoolDefaultTrue(parsed.indexEnabled),
      indexAutoOnOpen: parseBoolDefaultTrue(parsed.indexAutoOnOpen),
      screenContextEnabled: parseBoolDefaultTrue(parsed.screenContextEnabled),
      voiceCoderEnabled: parseBoolDefaultTrue(parsed.voiceCoderEnabled),
      coderAutoVerify: parseBoolDefaultTrue(parsed.coderAutoVerify),
      coderAutoReview: parseBoolDefaultTrue(parsed.coderAutoReview),
      qaModeEnabled: parseBoolDefaultFalse(parsed.qaModeEnabled),
      qaAutoFix: parseBoolDefaultFalse(parsed.qaAutoFix),
      qaSpeakProgress: parseBoolDefaultTrue(parsed.qaSpeakProgress),
      coderGhostTextEnabled: parseBoolDefaultFalse(parsed.coderGhostTextEnabled),
      recentCoderProjects: parseRecentCoderProjects(parsed.recentCoderProjects),
      coderAgentModel: parseCoderAgentModelId(parsed.coderAgentModel),
      lastCoderSession:
        parsed.lastCoderSession
        && typeof parsed.lastCoderSession === "object"
        && typeof (parsed.lastCoderSession as { prompt?: unknown }).prompt === "string"
        && typeof (parsed.lastCoderSession as { at?: unknown }).at === "number"
          ? {
              prompt: (parsed.lastCoderSession as { prompt: string }).prompt,
              at: (parsed.lastCoderSession as { at: number }).at,
            }
          : undefined,
      glassIdeTreeWidthPx: parsed.glassIdeTreeWidthPx,
      glassIdeStreamWidthPx: parsed.glassIdeStreamWidthPx,
      glassIdeEditorSplitRatio: parsed.glassIdeEditorSplitRatio,
      glassIdeAletheiaFirstErrorHintShown: parsed.glassIdeAletheiaFirstErrorHintShown === true,
      latestDesignToCodeProjectId:
        typeof parsed.latestDesignToCodeProjectId === "string"
        && parsed.latestDesignToCodeProjectId.trim()
          ? parsed.latestDesignToCodeProjectId.trim()
          : undefined,
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
      const migrated = {
        ...settings,
        dockPlacement: parseDockPlacement(settings.dockPlacement),
        dockCustomOrigin: null,
      };
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
