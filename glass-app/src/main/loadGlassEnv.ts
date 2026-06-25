/**
 * Load `.env` files into Glass main process (never renderer).
 * Shell env always wins. Later files do not override earlier non-empty values.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function loadEnvFile(envPath: string): void {
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key || process.env[key] != null) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!value) continue;
    process.env[key] = value;
  }
}

export function loadGlassEnv(): void {
  loadEnvFile(path.resolve(process.cwd(), "glass-app/.env"));
  loadEnvFile(path.resolve(process.cwd(), ".env"));
  loadEnvFile(path.resolve(process.cwd(), "../.env"));
}

/** Optional overrides in userData — useful for packaged builds without rebuild. */
export function loadGlassEnvUserData(userDataPath: string): void {
  loadEnvFile(path.join(userDataPath, ".env"));
}
