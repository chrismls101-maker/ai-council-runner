/**
 * Load `.env` files into Glass main process (never renderer).
 * Loads desktop-glass/.env first (highest priority), then repo-root .env as fallback.
 * Does not override variables already set in the shell or by an earlier file.
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
    // Skip empty placeholders so repo-root .env can supply the value.
    if (!value) continue;
    process.env[key] = value;
  }
}

export function loadGlassEnv(): void {
  // Load in priority order: desktop-glass/.env first, then repo root .env.
  // Earlier files win (shell env always wins over both).
  loadEnvFile(path.resolve(process.cwd(), ".env"));
  loadEnvFile(path.resolve(process.cwd(), "../.env"));
}
