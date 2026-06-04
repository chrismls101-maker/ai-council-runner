/**
 * IIVO Glass user settings (hotkey + display target).
 */

export type GlassHotkeyPreset =
  | "cmd-shift-space"
  | "alt-space"
  | "cmd-alt-space"
  | "cmd-shift-i"
  | "cmd-alt-i"
  | "disabled";

export type GlassDisplayTarget = "primary" | "follow_mouse" | "all_displays" | number;

export interface GlassUserSettings {
  hotkeyPreset: GlassHotkeyPreset;
  displayTarget: GlassDisplayTarget;
}

export const DEFAULT_GLASS_USER_SETTINGS: GlassUserSettings = {
  hotkeyPreset: "cmd-shift-space",
  displayTarget: "primary",
};

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
