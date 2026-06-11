/**
 * iivoAccountStore.ts — persist/load the IIVO account link to Electron userData.
 */

import { promises as fs } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import type { IivoAccountLink } from "../shared/iivoAccountLink.ts";

function accountFilePath(): string {
  return join(app.getPath("userData"), "iivo-account-link.json");
}

export async function loadIivoAccountLink(): Promise<IivoAccountLink | null> {
  try {
    const raw = await fs.readFile(accountFilePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<IivoAccountLink>;
    if (!parsed.sessionToken || !parsed.userId || !parsed.email) return null;
    return {
      sessionToken: parsed.sessionToken,
      userId: parsed.userId,
      email: parsed.email,
      name: parsed.name ?? null,
      linkedAt: parsed.linkedAt ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function persistIivoAccountLink(link: IivoAccountLink): Promise<void> {
  try {
    await fs.writeFile(accountFilePath(), JSON.stringify(link, null, 2), "utf8");
  } catch {
    // best-effort
  }
}

export async function clearIivoAccountLink(): Promise<void> {
  try {
    await fs.unlink(accountFilePath());
  } catch {
    // already gone
  }
}
