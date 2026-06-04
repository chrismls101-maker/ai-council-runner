/**
 * Glass layout preset names (shared — no Electron imports).
 */

export type GlassLayoutPreset =
  | "compact_dock"
  | "floating_dock"
  | "side_panel"
  | "full_glass_overlay"
  | "focus_mode";

export const GLASS_LAYOUT_PRESETS: GlassLayoutPreset[] = [
  "compact_dock",
  "floating_dock",
  "side_panel",
  "full_glass_overlay",
  "focus_mode",
];

export const DEFAULT_GLASS_LAYOUT_PRESET: GlassLayoutPreset = "compact_dock";

export function parseLayoutPreset(value: string | undefined): GlassLayoutPreset {
  const v = (value ?? DEFAULT_GLASS_LAYOUT_PRESET).trim().toLowerCase();
  if (GLASS_LAYOUT_PRESETS.includes(v as GlassLayoutPreset)) {
    return v as GlassLayoutPreset;
  }
  return DEFAULT_GLASS_LAYOUT_PRESET;
}
