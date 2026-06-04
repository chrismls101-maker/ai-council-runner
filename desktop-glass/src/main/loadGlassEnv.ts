/**
 * Load repo-root `.env` into Glass main process (never renderer).
 * Does not override variables already set in the shell.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function resolveEnvFile(): string | null {
  const candidates = [
    path.resolve(process.cwd(), "../.env"),
    path.resolve(process.cwd(), ".env"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function loadGlassEnv(): void {
  const envPath = resolveEnvFile();
  if (!envPath) return;

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
    process.env[key] = value;
  }
}
