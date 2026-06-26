/**
 * Derives whether power-user strip tabs (API Keys, Spend) should be visible.
 *
 * Logic:
 * - If minimalPublic is false (default), power tabs always show.
 * - If minimalPublic is true, power tabs are hidden — UNLESS glassDevMode is
 *   true (founder/dev override).
 *
 * The flag glass.strip.minimalPublic only gates the strip shortcut.
 * The API Keys capability itself is always accessible via Glass System → Setup.
 */
export function showPowerUserTabs({
  minimalPublic,
  glassDevMode,
}: {
  minimalPublic: boolean;
  glassDevMode: boolean;
}): boolean {
  return !minimalPublic || glassDevMode;
}
