/**
 * Palette frequency store (Task #66).
 *
 * Persists a simple Record<itemId, useCount> to a JSON file in userData so the
 * ⌘⇧G palette can rank frequently-used commands higher. Best-effort: any I/O
 * failure degrades to an empty map rather than crashing the app.
 */

import { app } from "electron";
import { join } from "node:path";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import type { PaletteFrequencyMap } from "../shared/paletteTypes.ts";

function storePath(): string {
  return join(app.getPath("userData"), "palette-frequency.json");
}

export function loadPaletteFrequency(): PaletteFrequencyMap {
  try {
    const p = storePath();
    if (!existsSync(p)) return {};
    const parsed = JSON.parse(readFileSync(p, "utf-8")) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as PaletteFrequencyMap;
    }
    return {};
  } catch {
    return {};
  }
}

export function recordPaletteUse(itemId: string): void {
  if (!itemId) return;
  try {
    const map = loadPaletteFrequency();
    map[itemId] = (map[itemId] ?? 0) + 1;
    writeFileSync(storePath(), JSON.stringify(map, null, 2), "utf-8");
  } catch {
    // best-effort
  }
}
