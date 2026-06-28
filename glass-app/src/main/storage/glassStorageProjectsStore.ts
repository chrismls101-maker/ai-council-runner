import { promises as fs } from "node:fs";
import { dirname } from "node:path";
import type { GlassProjectRecord } from "../../shared/glassStorageProjectTypes.ts";
import { glassStorageProjectsIndexPath } from "./glassStoragePaths.ts";

function parseRecords(raw: unknown): GlassProjectRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is GlassProjectRecord => {
    if (!item || typeof item !== "object") return false;
    const r = item as GlassProjectRecord;
    return typeof r.id === "string" && r.kind === "design-to-code";
  });
}

export async function loadGlassStorageProjectsIndex(
  userDataPath: string,
): Promise<GlassProjectRecord[]> {
  const path = glassStorageProjectsIndexPath(userDataPath);
  try {
    const raw = await fs.readFile(path, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return parseRecords(parsed).sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export async function saveGlassStorageProjectsIndex(
  userDataPath: string,
  records: GlassProjectRecord[],
): Promise<void> {
  const path = glassStorageProjectsIndexPath(userDataPath);
  await fs.mkdir(dirname(path), { recursive: true });
  await fs.writeFile(path, JSON.stringify(records, null, 2), "utf8");
}

export async function upsertGlassStorageProject(
  userDataPath: string,
  record: GlassProjectRecord,
): Promise<GlassProjectRecord[]> {
  const existing = await loadGlassStorageProjectsIndex(userDataPath);
  const idx = existing.findIndex((r) => r.id === record.id);
  const next = [...existing];
  if (idx >= 0) {
    next[idx] = record;
  } else {
    next.unshift(record);
  }
  next.sort((a, b) => b.updatedAt - a.updatedAt);
  await saveGlassStorageProjectsIndex(userDataPath, next);
  return next;
}

export async function readGlassStorageThumbDataUrl(
  thumbPath: string | undefined,
): Promise<string | null> {
  if (!thumbPath) return null;
  try {
    const buf = await fs.readFile(thumbPath);
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}
