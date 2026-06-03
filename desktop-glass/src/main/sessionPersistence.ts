/**
 * Persists Glass sessions to the Electron userData directory
 * (glass-sessions.json). Inline screenshot data URLs are stripped before
 * writing so the file stays small; the timeline event itself is preserved.
 */

import { promises as fs } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import { GlassSessionStore } from "../shared/sessionStore.ts";

function sessionsFilePath(): string {
  return join(app.getPath("userData"), "glass-sessions.json");
}

export async function loadSessions(): Promise<GlassSessionStore> {
  try {
    const raw = await fs.readFile(sessionsFilePath(), "utf8");
    return GlassSessionStore.hydrate(raw);
  } catch {
    return new GlassSessionStore();
  }
}

export async function persistSessions(store: GlassSessionStore): Promise<void> {
  try {
    // Strip large inline screenshots from the serialized form.
    const parsed = JSON.parse(store.serialize()) as {
      sessions: { events: { screenshotDataUrl?: string }[] }[];
    };
    for (const session of parsed.sessions) {
      for (const event of session.events) {
        if (event.screenshotDataUrl) delete event.screenshotDataUrl;
      }
    }
    await fs.writeFile(sessionsFilePath(), JSON.stringify(parsed), "utf8");
  } catch {
    // best-effort persistence; never crash over a write failure
  }
}
