import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Boot splash runs only when splash.html is present (WIP integration complete).
 * Stable core ships without splash assets — avoid loading a missing page.
 */
export function isBootSplashBundlePresent(mainDir: string): boolean {
  if (process.env.IIVO_GLASS_BOOT_SPLASH === "0") return false;
  if (process.env.IIVO_GLASS_BOOT_SPLASH === "1") return true;
  return existsSync(join(mainDir, "../../splash.html"));
}
