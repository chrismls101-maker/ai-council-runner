import { copyFile, mkdir, readdir, stat, unlink } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import type { GlassStorageFileRecord } from "../../shared/glassStorageFileTypes.ts";
import { glassStorageFilesDir } from "./glassStoragePaths.ts";

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function ensureGlassStorageFilesDir(userDataPath: string): Promise<string> {
  const dir = glassStorageFilesDir(userDataPath);
  await mkdir(dir, { recursive: true });
  return dir;
}

function safeBaseName(name: string): string {
  const base = basename(name).replace(/[^\w.\-()+ ]/g, "_").trim();
  return base.length > 0 ? base.slice(0, 200) : `file-${Date.now()}`;
}

async function uniqueDestPath(dir: string, fileName: string): Promise<string> {
  let candidate = join(dir, fileName);
  if (!(await pathExists(candidate))) return candidate;
  const ext = extname(fileName);
  const stem = ext ? fileName.slice(0, -ext.length) : fileName;
  let n = 2;
  while (n < 10_000) {
    const next = `${stem}-${n}${ext}`;
    candidate = join(dir, next);
    if (!(await pathExists(candidate))) return candidate;
    n += 1;
  }
  return join(dir, `${stem}-${Date.now()}${ext}`);
}

export async function listGlassStorageFiles(userDataPath: string): Promise<GlassStorageFileRecord[]> {
  const dir = await ensureGlassStorageFilesDir(userDataPath);
  const names = await readdir(dir);
  const records: GlassStorageFileRecord[] = [];
  for (const name of names) {
    if (name.startsWith(".")) continue;
    const full = join(dir, name);
    const info = await stat(full);
    if (!info.isFile()) continue;
    records.push({
      id: name,
      name,
      sizeBytes: info.size,
      uploadedAt: info.mtimeMs,
      relativePath: name,
    });
  }
  return records.sort((a, b) => b.uploadedAt - a.uploadedAt);
}

export async function importGlassStorageFiles(
  userDataPath: string,
  sourcePaths: readonly string[],
): Promise<GlassStorageFileRecord[]> {
  const dir = await ensureGlassStorageFilesDir(userDataPath);
  const imported: GlassStorageFileRecord[] = [];
  for (const sourcePath of sourcePaths) {
    if (typeof sourcePath !== "string" || !sourcePath.trim()) continue;
    const src = sourcePath.trim();
    const srcStat = await stat(src).catch(() => null);
    if (!srcStat?.isFile()) continue;
    const destPath = await uniqueDestPath(dir, safeBaseName(src));
    await copyFile(src, destPath);
    const info = await stat(destPath);
    const name = basename(destPath);
    imported.push({
      id: name,
      name,
      sizeBytes: info.size,
      uploadedAt: info.mtimeMs,
      relativePath: name,
    });
  }
  return imported;
}

export async function deleteGlassStorageFile(
  userDataPath: string,
  fileId: string,
): Promise<boolean> {
  const safe = safeBaseName(fileId);
  const full = join(await ensureGlassStorageFilesDir(userDataPath), safe);
  if (!(await pathExists(full))) return false;
  await unlink(full);
  return true;
}

export function glassStorageFileAbsolutePath(userDataPath: string, fileId: string): string {
  return join(glassStorageFilesDir(userDataPath), safeBaseName(fileId));
}
