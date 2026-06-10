/**
 * IIVO Glass user settings (hotkey + display target).
 */

import { DEFAULT_COPILOT_CONFIG, type GlassCopilotConfig } from "./copilotTypes.ts";
import { parseCopilotConfig } from "./copilotConfig.ts";

export type GlassHotkeyPreset =
  | "cmd-shift-space"
  | "alt-space"
  | "cmd-alt-space"
  | "cmd-shift-i"
  | "cmd-alt-i"
  | "disabled";

export type GlassDisplayTarget = "primary" | "follow_mouse" | "all_displays" | number;

export type DockOrientation = "horizontal" | "vertical";

export interface ChromeOrigin {
  x: number;
  y: number;
}

export interface GlassUserSettings {
  hotkeyPreset: GlassHotkeyPreset;
  displayTarget: GlassDisplayTarget;
  /** When true, dock and command bar stay at the saved/custom layout anchor. */
  chromeLayoutLocked: boolean;
  dockOrientation: DockOrientation;
  dockCustomOrigin: ChromeOrigin | null;
  commandBarCustomOrigin: ChromeOrigin | null;
  /** Premium startup cue on boot splash (off until cue is final). */
  bootSoundEnabled: boolean;
  /** Visual asks during a live session create a screen_capture on disk (default on). */
  saveVisualAsksToSession: boolean;
  /** Upload captures to IIVO Context Bridge without an explicit Open/Save (default off). */
  autoUploadCapturesToContext: boolean;
  /** After mic pause, auto-send command bar text to IIVO (default off). */
  micAutoSendAfterSilence: boolean;
  /** Virtual audio input (e.g. BlackHole 2ch) for system-audio fallback. */
  selectedVirtualAudioDeviceId?: string;
  /** User completed Mac output + BlackHole routing setup (WIP audio restore). */
  audioRoutingConfigured?: boolean;
  /** Saved Mac speaker/output device name for startup restore. */
  savedMacOutputDeviceName?: string;
  /** Session Copilot mode + behavior. Default off (no auto extraction). */
  copilot: GlassCopilotConfig;
}

export const DEFAULT_GLASS_USER_SETTINGS: GlassUserSettings = {
  hotkeyPreset: "cmd-shift-space",
  displayTarget: "primary",
  chromeLayoutLocked: true,
  dockOrientation: "horizontal",
  dockCustomOrigin: null,
  commandBarCustomOrigin: null,
  bootSoundEnabled: false,
  saveVisualAsksToSession: true,
  autoUploadCapturesToContext: false,
  micAutoSendAfterSilence: false,
  copilot: { ...DEFAULT_COPILOT_CONFIG },
};

export function parseCopilotSettings(value: unknown): GlassCopilotConfig {
  return parseCopilotConfig(value);
}

export function parseBootSoundEnabled(value: unknown): boolean {
  return value !== false;
}

export function parseSaveVisualAsksToSession(value: unknown): boolean {
  return value !== false;
}

export function parseAutoUploadCapturesToContext(value: unknown): boolean {
  return value === true;
}

export function parseMicAutoSendAfterSilence(value: unknown): boolean {
  return value === true;
}

export const GLASS_HOTKEY_PRESETS: Record<
  GlassHotkeyPreset,
  { label: string; accelerator: string | null }
> = {
  "cmd-shift-space": {
    label: "Cmd/Ctrl+Shift+Space",
    accelerator: "CommandOrControl+Shift+Space",
  },
  "alt-space": { label: "Alt+Space", accelerator: "Alt+Space" },
  "cmd-alt-space": {
    label: "Cmd/Ctrl+Alt+Space",
    accelerator: "CommandOrControl+Alt+Space",
  },
  "cmd-shift-i": {
    label: "Cmd/Ctrl+Shift+I",
    accelerator: "CommandOrControl+Shift+I",
  },
  "cmd-alt-i": {
    label: "Cmd/Ctrl+Alt+I",
    accelerator: "CommandOrControl+Alt+I",
  },
  disabled: { label: "Disabled", accelerator: null },
};

const VALID_HOTKEY_PRESETS = new Set<string>(Object.keys(GLASS_HOTKEY_PRESETS));

export function parseHotkeyPreset(value: string | undefined): GlassHotkeyPreset {
  if (value && VALID_HOTKEY_PRESETS.has(value)) {
    return value as GlassHotkeyPreset;
  }
  return "cmd-shift-space";
}

export function isValidHotkeyPreset(value: string): value is GlassHotkeyPreset {
  return VALID_HOTKEY_PRESETS.has(value);
}

export function parseDockOrientation(value: string | undefined): DockOrientation {
  return value === "vertical" ? "vertical" : "horizontal";
}

export function parseChromeOrigin(value: unknown): ChromeOrigin | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { x?: unknown; y?: unknown };
  if (typeof record.x !== "number" || typeof record.y !== "number") return null;
  if (!Number.isFinite(record.x) || !Number.isFinite(record.y)) return null;
  return { x: record.x, y: record.y };
}

export function parseDisplayTarget(value: string | undefined): GlassDisplayTarget {
  if (value === "follow_mouse") return "follow_mouse";
  if (value === "all_displays") return "all_displays";
  if (value === "primary" || value == null || value === "") return "primary";
  const id = Number(value);
  return Number.isFinite(id) ? id : "primary";
}

export function serializeDisplayTarget(target: GlassDisplayTarget): string {
  if (target === "primary" || target === "follow_mouse" || target === "all_displays") return target;
  return String(target);
}

export function formatDisplayTargetLabel(
  target: GlassDisplayTarget,
  displayIds: number[] = [],
): string {
  if (target === "primary") return "Primary Display";
  if (target === "follow_mouse") return "Follow Mouse";
  if (target === "all_displays") return "All Displays Overlay";
  const index = displayIds.indexOf(target);
  if (index >= 0) return `Display ${index + 1}`;
  return `Display id ${target}`;
}

export function hotkeyRegistrationMessage(
  preset: GlassHotkeyPreset,
  registered: boolean,
  accelerator: string | null,
): string {
  if (preset === "disabled") {
    return "Hotkey disabled — command bar still clickable";
  }
  if (registered && accelerator) {
    return `${GLASS_HOTKEY_PRESETS[preset].label} registered`;
  }
  return `Hotkey unavailable (${GLASS_HOTKEY_PRESETS[preset].label}) — command bar still clickable`;
}

/** Default panel tab — audio setup until routing is marked configured. */
export function resolveDefaultPanelTab(
  settings: Pick<GlassUserSettings, "audioRoutingConfigured">,
): import("./types.ts").PanelTab {
  return settings.audioRoutingConfigured ? "summary" : "audio";
}
