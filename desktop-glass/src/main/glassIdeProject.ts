/**
 * Glass IDE — project file listing and read-only viewer (main process).
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { assertPathInProjectRoot, expandAgentPath } from "./agentCoderTools.ts";
import {
  GLASS_IDE_MAX_FILE_BYTES,
  GLASS_IDE_MAX_LIST_FILES,
  GLASS_IDE_SKIP_DIR_NAMES,
  languageFromRelativePath,
  type GlassIdeListProjectResponse,
  type GlassIdeProjectEntry,
  type GlassIdeReadProjectFileResponse,
  type GlassIdeWriteProjectFileResponse,
} from "../shared/glassIdeProject.ts";

function resolveProjectRoot(projectRoot: string): string {
  return path.resolve(expandAgentPath(projectRoot));
}

function shouldSkipEntry(name: string, isDirectory: boolean): boolean {
  if (name === ".DS_Store") return true;
  if (isDirectory && GLASS_IDE_SKIP_DIR_NAMES.has(name)) return true;
  if (!isDirectory && name.startsWith(".") && name !== ".env" && name !== ".gitignore") {
    return true;
  }
  return false;
}

async function walkProject(
  absDir: string,
  root: string,
  entries: GlassIdeProjectEntry[],
  depth: number,
): Promise<void> {
  if (depth > 14 || entries.length >= GLASS_IDE_MAX_LIST_FILES) return;

  let names: import("node:fs").Dirent[];
  try {
    names = await fs.readdir(absDir, { withFileTypes: true });
  } catch {
    return;
  }

  names.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  for (const ent of names) {
    if (entries.length >= GLASS_IDE_MAX_LIST_FILES) return;
    if (shouldSkipEntry(ent.name, ent.isDirectory())) continue;

    const absPath = path.join(absDir, ent.name);
    const relativePath = path.relative(root, absPath);
    if (!relativePath || relativePath.startsWith("..")) continue;

    entries.push({
      relativePath,
      name: ent.name,
      isDirectory: ent.isDirectory(),
    });

    if (ent.isDirectory()) {
      await walkProject(absPath, root, entries, depth + 1);
    }
  }
}

export async function listGlassIdeProjectFiles(
  projectRoot: string,
): Promise<GlassIdeListProjectResponse> {
  const trimmed = projectRoot.trim();
  if (!trimmed) return { ok: false, error: "Set a project folder first." };

  const root = resolveProjectRoot(trimmed);
  try {
    const stat = await fs.stat(root);
    if (!stat.isDirectory()) {
      return { ok: false, error: "Project folder is not a directory." };
    }
  } catch {
    return { ok: false, error: "Project folder not found." };
  }

  const entries: GlassIdeProjectEntry[] = [
    { relativePath: "", name: path.basename(root) || root, isDirectory: true },
  ];
  await walkProject(root, root, entries, 0);
  return { ok: true, entries };
}

export async function readGlassIdeProjectFile(
  projectRoot: string,
  relativePath: string,
): Promise<GlassIdeReadProjectFileResponse> {
  const trimmedRoot = projectRoot.trim();
  if (!trimmedRoot) return { ok: false, error: "Set a project folder first." };

  const rel = relativePath.trim().replace(/\\/g, "/");
  if (!rel) return { ok: false, error: "path is required" };

  const root = resolveProjectRoot(trimmedRoot);
  const absPath = path.resolve(root, rel);
  const outside = assertPathInProjectRoot(absPath, trimmedRoot);
  if (outside) return { ok: false, error: outside };

  try {
    const stat = await fs.stat(absPath);
    if (stat.isDirectory()) {
      return { ok: false, error: "Cannot open a directory in the viewer." };
    }
    if (stat.size > GLASS_IDE_MAX_FILE_BYTES) {
      const buf = Buffer.alloc(GLASS_IDE_MAX_FILE_BYTES);
      const fh = await fs.open(absPath, "r");
      try {
        await fh.read(buf, 0, GLASS_IDE_MAX_FILE_BYTES, 0);
      } finally {
        await fh.close();
      }
      if (buf.includes(0)) {
        return { ok: false, error: "Binary file — cannot display in viewer." };
      }
      return {
        ok: true,
        content: buf.toString("utf8"),
        relativePath: rel,
        language: languageFromRelativePath(rel),
        truncated: true,
      };
    }

    const buf = await fs.readFile(absPath);
    if (buf.includes(0)) {
      return { ok: false, error: "Binary file — cannot display in viewer." };
    }
    return {
      ok: true,
      content: buf.toString("utf8"),
      relativePath: rel,
      language: languageFromRelativePath(rel),
      truncated: false,
    };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message };
  }
}

export async function writeGlassIdeProjectFile(
  projectRoot: string,
  relativePath: string,
  content: string,
): Promise<GlassIdeWriteProjectFileResponse> {
  const trimmedRoot = projectRoot.trim();
  if (!trimmedRoot) return { ok: false, error: "Set a project folder first." };

  const rel = relativePath.trim().replace(/\\/g, "/");
  if (!rel) return { ok: false, error: "path is required" };

  const root = resolveProjectRoot(trimmedRoot);
  const absPath = path.resolve(root, rel);
  const outside = assertPathInProjectRoot(absPath, trimmedRoot);
  if (outside) return { ok: false, error: outside };

  const bytes = Buffer.byteLength(content, "utf8");
  if (bytes > GLASS_IDE_MAX_FILE_BYTES) {
    return { ok: false, error: `File exceeds ${GLASS_IDE_MAX_FILE_BYTES} byte limit.` };
  }

  try {
    const stat = await fs.stat(absPath);
    if (!stat.isFile()) {
      return { ok: false, error: "Cannot write — file does not exist yet." };
    }
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return { ok: false, error: "Cannot write — file does not exist yet." };
    }
    return { ok: false, error: err.message ?? String(e) };
  }

  const tmpPath = `${absPath}.glass-ide-tmp`;
  try {
    await fs.writeFile(tmpPath, content, "utf8");
    await fs.rename(tmpPath, absPath);
    return { ok: true, relativePath: rel };
  } catch (e: unknown) {
    await fs.unlink(tmpPath).catch(() => undefined);
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message };
  }
}
