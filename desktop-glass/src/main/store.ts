/**
 * Persists the saved-moments store to the Electron userData directory.
 */

import { promises as fs } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import { SavedMomentsStore } from "../shared/savedMoments.ts";

function momentsFilePath(): string {
  return join(app.getPath("userData"), "glass-moments.json");
}

export async function loadMoments(): Promise<SavedMomentsStore> {
  try {
    const raw = await fs.readFile(momentsFilePath(), "utf8");
    return SavedMomentsStore.deserialize(raw);
  } catch {
    return new SavedMomentsStore();
  }
}

export async function persistMoments(store: SavedMomentsStore): Promise<void> {
  try {
    await fs.writeFile(momentsFilePath(), store.serialize(), "utf8");
  } catch {
    // Persistence is best-effort; never crash the app over a write failure.
  }
}
