import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Boot splash runs when the packaged renderer entry exists.
 * Matches {@link loadRenderer} production path: out/renderer/splash.html.
 */
export function isBootSplashBundlePresent(mainDir: string): boolean {
  if (process.env.IIVO_GLASS_BOOT_SPLASH === "0") return false;
  if (process.env.IIVO_GLASS_BOOT_SPLASH === "1") return true;
  // Vite dev uses loadURL on macOS panel windows; hiding chrome behind splash prevents
  // compositor surfaces and did-finish-load never fires.
  if (process.env.ELECTRON_RENDERER_URL) return false;
  return existsSync(join(mainDir, "../renderer/splash.html"));
}
