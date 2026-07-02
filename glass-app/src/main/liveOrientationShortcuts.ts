/**
 * Glass Guide — global keyboard shortcuts while orientation session is active.
 */

import { globalShortcut } from "electron";
import {
  isOrientationSessionActive,
  requestSkipAllOrientation,
  requestSkipOrientationRegion,
} from "./liveOrientationPresenter.ts";

/** Active only during orientation sessions — avoids ⌥] (types special chars in editors). */
export const ORIENTATION_SKIP_REGION_ACCEL = "Command+Alt+G";
export const ORIENTATION_SKIP_ALL_ACCEL = "Command+Alt+Escape";

let registered = false;

export function refreshOrientationGlobalShortcuts(enabled: boolean): void {
  unregisterOrientationGlobalShortcuts();
  if (!enabled || process.platform !== "darwin") return;

  const register = (accel: string, handler: () => void): void => {
    try {
      if (globalShortcut.isRegistered(accel)) globalShortcut.unregister(accel);
      globalShortcut.register(accel, () => {
        if (!isOrientationSessionActive()) return;
        handler();
      });
    } catch {
      /* another window may own the accelerator */
    }
  };

  register(ORIENTATION_SKIP_REGION_ACCEL, () => requestSkipOrientationRegion());
  register(ORIENTATION_SKIP_ALL_ACCEL, () => requestSkipAllOrientation());
  registered = true;
}

export function unregisterOrientationGlobalShortcuts(): void {
  if (!registered) return;
  for (const accel of [ORIENTATION_SKIP_REGION_ACCEL, ORIENTATION_SKIP_ALL_ACCEL]) {
    try {
      if (globalShortcut.isRegistered(accel)) globalShortcut.unregister(accel);
    } catch {
      /* ignore */
    }
  }
  registered = false;
}
