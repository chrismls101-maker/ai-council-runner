/**
 * IIVO Glass user settings (hotkey + display target).
 */

export type GlassHotkeyPreset =
  | "cmd-shift-space"
  | "alt-space"
  | "cmd-alt-space"
  | "disabled";

export type GlassDisplayTarget = "primary" | "follow_mouse" | number;

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
  disabled: { label: "Disabled", accelerator: null },
};

export function parseHotkeyPreset(value: string | undefined): GlassHotkeyPreset {
  if (value === "alt-space" || value === "cmd-alt-space" || value === "disabled") {
    return value;
  }
  return "cmd-shift-space";
}

export function parseDisplayTarget(value: string | undefined): GlassDisplayTarget {
  if (value === "follow_mouse") return "follow_mouse";
  if (value === "primary" || value == null || value === "") return "primary";
  const id = Number(value);
  return Number.isFinite(id) ? id : "primary";
}

export function serializeDisplayTarget(target: GlassDisplayTarget): string {
  if (target === "primary" || target === "follow_mouse") return target;
  return String(target);
}

export function formatDisplayTargetLabel(
  target: GlassDisplayTarget,
  displayIds: number[] = [],
): string {
  if (target === "primary") return "Primary Display";
  if (target === "follow_mouse") return "Follow Mouse Display";
  const index = displayIds.indexOf(target);
  if (index >= 0) return `Display ${index + 1} (id ${target})`;
  return `Display id ${target}`;
}
