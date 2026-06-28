import { promises as fs } from "node:fs";
import { join, relative } from "node:path";
import type {
  DesignToCodeSessionManifest,
  GlassProjectDetail,
  GlassProjectFileEntry,
  GlassProjectFileKind,
  GlassProjectRecord,
  GlassProjectRevisionEntry,
} from "../../shared/glassStorageProjectTypes.ts";
import { loadGlassStorageProjectsIndex, readGlassStorageThumbDataUrl } from "./glassStorageProjectsStore.ts";

const MAX_PRIMARY_CHARS = 120_000;
const MAX_NOTES_CHARS = 32_000;

function classifyFile(relativePath: string): GlassProjectFileKind {
  const base = relativePath.split("/").pop() ?? relativePath;
  if (relativePath.startsWith("revisions/")) return "revision";
  if (relativePath.startsWith("assets/")) return "asset";
  if (base === "capture.png") return "capture";
  if (base === "thumb.png") return "thumb";
  if (base === "session.json") return "manifest";
  if (base === "notes.md") return "notes";
  if (base === "screen-spec.json") return "spec";
  if (/^result\.(tsx|ts|jsx|js|vue|svelte|html|md|css)$/i.test(base)) return "primary";
  return "asset";
}

async function readTextIfExists(path: string, maxChars: number): Promise<string | null> {
  try {
    const raw = await fs.readFile(path, "utf8");
    return raw.length > maxChars ? `${raw.slice(0, maxChars)}\n…(truncated)` : raw;
  } catch {
    return null;
  }
}

async function listProjectFiles(rootPath: string): Promise<GlassProjectFileEntry[]> {
  const out: GlassProjectFileEntry[] = [];

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = join(dir, ent.name);
      if (ent.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!ent.isFile()) continue;
      const rel = relative(rootPath, full).replace(/\\/g, "/");
      let sizeBytes: number | undefined;
      try {
        sizeBytes = (await fs.stat(full)).size;
      } catch {
        /* ignore */
      }
      out.push({
        name: ent.name,
        relativePath: rel,
        kind: classifyFile(rel),
        sizeBytes,
      });
    }
  }

  await walk(rootPath);
  return out.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function parseRevisionTimestamp(fileName: string): number {
  const m = /^(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})_/.exec(fileName);
  if (!m) return 0;
  const iso = `${m[1]}T${m[2]}:${m[3]}:${m[4]}Z`;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

function parseRevisionEntries(files: GlassProjectFileEntry[]): GlassProjectRevisionEntry[] {
  return files
    .filter((f) => f.kind === "revision")
    .map((f) => ({
      label: f.name,
      relativePath: f.relativePath,
      savedAt: parseRevisionTimestamp(f.name),
    }))
    .sort((a, b) => b.savedAt - a.savedAt);
}

export async function loadGlassStorageProjectDetail(
  userDataPath: string,
  projectId: string,
): Promise<GlassProjectDetail | null> {
  const records = await loadGlassStorageProjectsIndex(userDataPath);
  const record = records.find((r) => r.id === projectId);
  if (!record?.rootPath) return null;

  const rootPath = record.rootPath;
  const files = await listProjectFiles(rootPath);
  const revisions = parseRevisionEntries(files);

  let manifest: DesignToCodeSessionManifest | null = null;
  const manifestPath = record.manifestPath ?? join(rootPath, "session.json");
  try {
    const raw = await fs.readFile(manifestPath, "utf8");
    manifest = JSON.parse(raw) as DesignToCodeSessionManifest;
  } catch {
    manifest = null;
  }

  const primaryFile = files.find((f) => f.kind === "primary");
  const primaryPath =
    record.primaryFilePath
    ?? (primaryFile ? join(rootPath, primaryFile.relativePath) : null);

  let primaryFileName = "result.txt";
  let primaryContent = "";
  if (primaryPath) {
    primaryFileName = primaryPath.split(/[/\\]/).pop() ?? primaryFileName;
    primaryContent = (await readTextIfExists(primaryPath, MAX_PRIMARY_CHARS)) ?? "";
  }

  const notesMarkdown = await readTextIfExists(join(rootPath, "notes.md"), MAX_NOTES_CHARS);
  const previewDataUrl = await readGlassStorageThumbDataUrl(
    record.previewThumbPath ?? join(rootPath, "thumb.png"),
  );

  const hydrated: GlassProjectRecord = {
    ...record,
    revisionCount: revisions.length,
  };

  return {
    record: hydrated,
    previewDataUrl,
    primaryFileName,
    primaryContent,
    notesMarkdown,
    manifest,
    files,
    revisions,
  };
}
