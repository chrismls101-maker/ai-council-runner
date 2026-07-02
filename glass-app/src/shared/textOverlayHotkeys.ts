/**
 * Glass this hotkey accelerators — shared so tests avoid Electron imports.
 */

import type { GlassHotkeyPreset } from "./glassSettings.ts";

export const TEXT_OVERLAY_HOTKEY = "Alt+Space";
export const TEXT_OVERLAY_HOTKEY_FALLBACK = "Alt+Shift+Space";

export function textOverlayHotkeyAccelerators(
  hotkeyPreset: GlassHotkeyPreset | undefined,
): readonly string[] {
  if (hotkeyPreset === "alt-space") {
    return [TEXT_OVERLAY_HOTKEY_FALLBACK];
  }
  return [TEXT_OVERLAY_HOTKEY, TEXT_OVERLAY_HOTKEY_FALLBACK];
}
