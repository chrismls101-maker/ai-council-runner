/**
 * IIVO Glass user settings (hotkey + display target).
 */

import { DEFAULT_COPILOT_CONFIG, type GlassCopilotConfig } from "./copilotTypes.ts";
import { parseCopilotConfig } from "./copilotConfig.ts";
import { DEFAULT_DESIGN_STACK } from "./designToCode.ts";

export type GlassHotkeyPreset =
  | "cmd-shift-space"
  | "alt-space"
  | "cmd-alt-space"
  | "cmd-shift-i"
  | "cmd-alt-i"
  | "disabled";

export type GlassDisplayTarget = "primary" | "follow_mouse" | "all_displays" | number;

export type DockOrientation = "horizontal" | "vertical";

/** Top pill (legacy) or slim icon rail on the left edge. */
export type DockPlacement = "top" | "left-rail";

/** Subfolder name under Desktop when no custom agent output path is set. */
export const DEFAULT_AGENT_OUTPUT_FOLDER_NAME = "IIVO Research";

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
  /** Default chrome tier — left icon rail frees the right for panels. */
  dockPlacement: DockPlacement;
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
  /**
   * When enabled, Glass classifies clipboard text after each copy and proactively
   * diagnoses errors or reviews code snippets via AI. Default off (opt-in).
   */
  clipboardIntelligenceEnabled: boolean;
  /** Virtual audio input (e.g. BlackHole 2ch) for system-audio fallback. */
  selectedVirtualAudioDeviceId?: string;
  /** User completed Mac output + BlackHole routing setup (WIP audio restore). */
  audioRoutingConfigured?: boolean;
  /** Saved Mac speaker/output device name for startup restore. */
  savedMacOutputDeviceName?: string;
  /** Last transcription mode when system audio was connected (restored on launch). */
  persistedTranscriptionMode?: import("./audioCaptureTypes.ts").TranscriptionMode;
  /** Last system-audio status when the app quit (restored on launch). */
  persistedSystemAudioStatus?: import("./systemAudioTypes.ts").SystemAudioStatus;
  /** True when system audio was available at last quit — triggers startup restore. */
  systemAudioEnabledAtQuit?: boolean;
  /** Session Copilot mode + behavior. Default off (no auto extraction). */
  copilot: GlassCopilotConfig;
  /**
   * Override for the IIVO API server URL (e.g. self-hosted instance).
   * When set, takes precedence over IIVO_API_URL env var.
   */
  iivoApiUrl?: string;
  /**
   * Override for the IIVO web app URL (e.g. self-hosted instance).
   * When set, takes precedence over IIVO_WEB_URL env var.
   */
  iivoWebUrl?: string;
  /**
   * Target framework/stack for design-to-code generation (#163-F).
   * Used when no code file is open to infer stack from context.
   * Defaults to "react-tsx".
   */
  designStack?: import("./designToCode.ts").DesignStack;
  /** Sorting Hat placement — set during first-launch onboarding. */
  persona?: "developer" | "sales" | "operator" | "writer" | "general";
  /** UI + onboarding language chosen on post-boot picker. */
  uiLocale?: import("./glassLocale.ts").GlassUiLocale;
  /** True once the onboarding flow has been completed (or skipped). */
  onboardingComplete?: boolean;
  /**
   * Folder where Glass agents save markdown files.
   * Absolute path or `~/…` — defaults to Desktop/IIVO Research.
   */
  agentOutputFolder?: string;
  /**
   * Default workspace root for the Code Analyst agent (absolute or `~/…`).
   */
  agentCodeWorkspaceRoot?: string;
  /** Glass Coder side panel width in pixels. */
  coderPanelWidthPx?: number;
  /** Glass IDE file tree column width in pixels. */
  glassIdeTreeWidthPx?: number;
  /** Glass IDE AI stream column width in pixels. */
  glassIdeStreamWidthPx?: number;
  /** Glass IDE editor height ratio within center column (0.35–0.85). */
  glassIdeEditorSplitRatio?: number;
  /** Enable Ollama semantic codebase index for Glass Coder. */
  indexEnabled?: boolean;
  /** Auto-index project when Glass Coder workspace is set. */
  indexAutoOnOpen?: boolean;
  /** Screen-aware file detection when opening Glass Coder. */
  screenContextEnabled?: boolean;
  /** Voice commands can trigger Glass Coder. */
  voiceCoderEnabled?: boolean;
  /** Auto-run build verify after Glass Coder finishes. */
  coderAutoVerify?: boolean;
  /** Auto-run code review after verify passes. */
  coderAutoReview?: boolean;
  /** Glass IDE QA Mode — full pipeline after each Coder run (opt-in). */
  qaModeEnabled?: boolean;
  /** Auto-trigger Fix all when QA pipeline finds failures. */
  qaAutoFix?: boolean;
  /** Speak QA / verify pipeline progress via TTS (default on). */
  qaSpeakProgress?: boolean;
  /** Line-level ghost text completions in Glass IDE editor. */
  coderGhostTextEnabled?: boolean;
  /** Last Glass Coder task for “Continue” in IDE. */
  lastCoderSession?: {
    prompt: string;
    at: number;
  };
  /** Recently opened Coder project folders (absolute paths). */
  recentCoderProjects?: string[];
  /** Glass Coder agent model — Auto (default), Sonnet, Opus, etc. */
  coderAgentModel?: import("./coderAgentModels.ts").CoderAgentModelId;
  /** Glass Coder composer mode — Agent (edits) or Plan (read-only). */
  coderComposerMode?: import("./glassComposerMode.ts").GlassCoderComposerMode;
  /** Aletheia — first IDE error spoken hint already delivered. */
  glassIdeAletheiaFirstErrorHintShown?: boolean;
}

export const DEFAULT_GLASS_CODER_INDEX_SETTINGS = {
  indexEnabled: true,
  indexAutoOnOpen: true,
  screenContextEnabled: true,
  voiceCoderEnabled: true,
  coderAutoVerify: true,
  coderAutoReview: true,
} as const;

export const DEFAULT_GLASS_USER_SETTINGS: GlassUserSettings = {
  hotkeyPreset: "cmd-shift-space",
  displayTarget: "primary",
  chromeLayoutLocked: true,
  dockOrientation: "horizontal",
  dockPlacement: "left-rail",
  dockCustomOrigin: null,
  commandBarCustomOrigin: null,
  bootSoundEnabled: false,
  saveVisualAsksToSession: true,
  autoUploadCapturesToContext: false,
  micAutoSendAfterSilence: false,
  clipboardIntelligenceEnabled: false,
  copilot: { ...DEFAULT_COPILOT_CONFIG },
  designStack: DEFAULT_DESIGN_STACK,
  onboardingComplete: false,
  ...DEFAULT_GLASS_CODER_INDEX_SETTINGS,
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

export function parseClipboardIntelligenceEnabled(value: unknown): boolean {
  return value === true;
}

const VALID_TRANSCRIPTION_MODES = new Set([
  "manual",
  "microphone_web_speech",
  "microphone_media_recorder",
  "system_audio",
]);

export function parsePersistedTranscriptionMode(
  value: unknown,
): import("./audioCaptureTypes.ts").TranscriptionMode | undefined {
  if (typeof value !== "string" || !VALID_TRANSCRIPTION_MODES.has(value)) return undefined;
  return value as import("./audioCaptureTypes.ts").TranscriptionMode;
}

const VALID_SYSTEM_AUDIO_STATUSES = new Set([
  "available",
  "requires_permission",
  "requires_virtual_device",
  "source_enumeration_failed",
  "not_tested",
  "unsupported",
  "error",
]);

export function parsePersistedSystemAudioStatus(
  value: unknown,
): import("./systemAudioTypes.ts").SystemAudioStatus | undefined {
  if (typeof value !== "string" || !VALID_SYSTEM_AUDIO_STATUSES.has(value)) return undefined;
  return value as import("./systemAudioTypes.ts").SystemAudioStatus;
}

export function parseSystemAudioEnabledAtQuit(value: unknown): boolean {
  return value === true;
}

/** Parse agent output folder — absolute path or ~/… only. */
export function parseAgentOutputFolder(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("~/") || trimmed === "~" || trimmed.startsWith("/")) return trimmed;
  return undefined;
}

export function parseBoolDefaultTrue(value: unknown): boolean {
  return value !== false;
}

export function parseBoolDefaultFalse(value: unknown): boolean {
  return value === true;
}

export function parseCoderPanelWidth(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const n = Math.round(value);
  if (n < 380 || n > 2400) return undefined;
  return n;
}

/**
 * Parse a saved server URL override. Returns undefined (use env default) when
 * the value is absent, empty, or not a plausible http(s) URL.
 */
export function parseGlassServerUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return undefined;
  if (!/^https?:\/\/.+/.test(trimmed)) return undefined;
  return trimmed;
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

export function parseDockPlacement(value: string | undefined): DockPlacement {
  if (value === "top") return "top";
  // Legacy saves used right-rail — migrate to left-rail.
  return "left-rail";
}

/** E2E runs against real userData — force current product chrome without persisting over dev settings. */
export function e2eChromeLayoutSettings(settings: GlassUserSettings): GlassUserSettings {
  return {
    ...settings,
    chromeLayoutLocked: true,
    dockPlacement: "left-rail",
    dockCustomOrigin: null,
    commandBarCustomOrigin: null,
  };
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
