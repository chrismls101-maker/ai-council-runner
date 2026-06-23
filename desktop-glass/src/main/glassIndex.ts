/**
 * Glass Coder — local semantic file index via Ollama embeddings + SQLite.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, promises as fsp } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import chokidar, { type FSWatcher } from "chokidar";
import { expandAgentPath } from "./agentCoderTools.ts";

const OLLAMA_BASE = "http://localhost:11434";
const EMBED_MODEL = "nomic-embed-text";
const MAX_FILE_BYTES = 200 * 1024;
const MAX_EMBED_CHARS = 8_000;
const INDEX_EMBED_TIMEOUT_MS = 60_000;
const SEARCH_EMBED_TIMEOUT_MS = 5_000;
const PULL_TIMEOUT_MS = 10 * 60 * 1000;
const MIN_COSINE_SCORE = 0.3;
const MAX_CONSECUTIVE_EMBED_FAILURES = 10;

const INDEXABLE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".swift",
  ".kt", ".java", ".c", ".cpp", ".h", ".css", ".md",
]);

const SKIP_DIR_NAMES = new Set([
  "node_modules", ".git", "dist", "build", ".glass-index", ".next",
  "coverage", "target", "__pycache__", ".venv", "venv",
]);

const watchers = new Map<string, FSWatcher>();
const dbCache = new Map<string, Database.Database>();
const projectLockTails = new Map<string, Promise<void>>();

export function cosineSim(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] ** 2;
    magB += b[i] ** 2;
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

function projectKey(projectRoot: string): string {
  return path.resolve(expandAgentPath(projectRoot));
}

async function withProjectLock<T>(projectRoot: string, fn: () => Promise<T>): Promise<T> {
  const key = projectKey(projectRoot);
  const previous = projectLockTails.get(key) ?? Promise.resolve();
  let unlock!: () => void;
  const gate = new Promise<void>((resolve) => {
    unlock = resolve;
  });
  projectLockTails.set(key, previous.then(() => gate));
  await previous;
  try {
    return await fn();
  } finally {
    unlock();
  }
}

function indexDir(projectRoot: string): string {
  return path.join(projectKey(projectRoot), ".glass-index");
}

function dbPath(projectRoot: string): string {
  return path.join(indexDir(projectRoot), "index.db");
}

function isIndexableFile(filePath: string): boolean {
  return INDEXABLE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

async function ensureGitignore(projectRoot: string): Promise<void> {
  const absRoot = projectKey(projectRoot);
  const gitignorePath = path.join(absRoot, ".gitignore");
  try {
    let content = "";
    try {
      content = await fsp.readFile(gitignorePath, "utf-8");
    } catch {
      /* new file */
    }
    if (content.includes(".glass-index")) return;
    const suffix = content.endsWith("\n") || content.length === 0 ? "" : "\n";
    await fsp.writeFile(gitignorePath, `${content}${suffix}.glass-index/\n`, "utf-8");
  } catch {
    /* best-effort */
  }
}

function openDb(projectRoot: string): Database.Database {
  const absRoot = projectKey(projectRoot);
  const cached = dbCache.get(absRoot);
  if (cached) return cached;

  const dir = indexDir(projectRoot);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    void ensureGitignore(projectRoot);
  }

  const db = new Database(dbPath(projectRoot));
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS file_index (
      path TEXT PRIMARY KEY,
      rel_path TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      embedding TEXT NOT NULL,
      indexed_at INTEGER NOT NULL
    );
  `);
  dbCache.set(absRoot, db);
  return db;
}

export function closeAllIndexDbs(): void {
  for (const db of dbCache.values()) {
    try {
      db.close();
    } catch {
      /* best-effort */
    }
  }
  dbCache.clear();
}

export async function checkOllamaAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(2_000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function ensureNomicEmbedModel(
  onProgress?: (status: string) => void,
): Promise<boolean> {
  try {
    const tagsRes = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(5_000) });
    if (!tagsRes.ok) return false;
    const tags = (await tagsRes.json()) as { models?: Array<{ name: string }> };
    const hasModel = tags.models?.some(
      (m) => m.name === EMBED_MODEL || m.name.startsWith(`${EMBED_MODEL}:`),
    );
    if (hasModel) return true;

    onProgress?.(`Pulling ${EMBED_MODEL}…`);
    const pullRes = await fetch(`${OLLAMA_BASE}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: EMBED_MODEL }),
      signal: AbortSignal.timeout(PULL_TIMEOUT_MS),
    });
    if (!pullRes.ok) return false;
    const reader = pullRes.body?.getReader();
    if (!reader) return false;
    const decoder = new TextDecoder();
    const pullDeadline = Date.now() + PULL_TIMEOUT_MS;
    while (Date.now() < pullDeadline) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      for (const line of chunk.split("\n").filter(Boolean)) {
        try {
          const parsed = JSON.parse(line) as { status?: string };
          if (parsed.status) onProgress?.(parsed.status);
        } catch {
          /* ndjson line */
        }
      }
    }
    if (Date.now() >= pullDeadline) return false;

    const verifyRes = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(5_000) });
    if (!verifyRes.ok) return false;
    const verify = (await verifyRes.json()) as { models?: Array<{ name: string }> };
    return verify.models?.some(
      (m) => m.name === EMBED_MODEL || m.name.startsWith(`${EMBED_MODEL}:`),
    ) ?? false;
  } catch (err) {
    console.warn("[glassIndex] ensureNomicEmbedModel failed:", err);
    return false;
  }
}

export async function embedText(
  text: string,
  timeoutMs = INDEX_EMBED_TIMEOUT_MS,
): Promise<number[] | null> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { embedding?: number[] };
    return json.embedding ?? null;
  } catch (err) {
    console.warn("[glassIndex] embedText failed:", err);
    return null;
  }
}

function contentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/** Reject files that are mostly non-text (binary masquerading as source). */
export function isMostlyTextContent(content: string): boolean {
  const sample = content.slice(0, 8_192);
  if (sample.length === 0) return false;
  let nonText = 0;
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    if (code === 9 || code === 10 || code === 13) continue;
    if (code < 32 || code === 0xfffd) nonText += 1;
  }
  return nonText / sample.length < 0.1;
}

async function walkIndexableFiles(
  absRoot: string,
  relDir = "",
  depth = 0,
  out: string[] = [],
  visitedRealDirs = new Set<string>(),
): Promise<string[]> {
  if (depth > 14 || out.length > 5_000) return out;
  const absDir = relDir ? path.join(absRoot, relDir) : absRoot;
  let realDir: string;
  try {
    realDir = await fsp.realpath(absDir);
  } catch {
    return out;
  }
  if (visitedRealDirs.has(realDir)) return out;
  visitedRealDirs.add(realDir);

  let entries: import("node:fs").Dirent[];
  try {
    entries = await fsp.readdir(absDir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
    const entryAbs = path.join(absDir, entry.name);

    if (entry.isSymbolicLink()) {
      try {
        const linkStat = await fsp.lstat(entryAbs);
        if (linkStat.isDirectory()) {
          await walkIndexableFiles(absRoot, relPath, depth + 1, out, visitedRealDirs);
        } else if (linkStat.isFile() && isIndexableFile(entry.name)) {
          const resolved = await fsp.realpath(entryAbs);
          if (resolved.startsWith(absRoot + path.sep) || resolved === absRoot) {
            out.push(relPath);
          }
        }
      } catch {
        /* broken symlink */
      }
      continue;
    }

    if (entry.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry.name)) continue;
      await walkIndexableFiles(absRoot, relPath, depth + 1, out, visitedRealDirs);
      continue;
    }
    if (!entry.isFile() || !isIndexableFile(entry.name)) continue;
    out.push(relPath);
  }
  return out;
}

async function readFileForIndex(absPath: string): Promise<string | null> {
  try {
    const stat = await fsp.stat(absPath);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return null;
    const raw = await fsp.readFile(absPath, "utf-8");
    const slice = raw.slice(0, MAX_EMBED_CHARS);
    if (!isMostlyTextContent(slice)) return null;
    return slice;
  } catch {
    return null;
  }
}

export function hasIndex(projectRoot: string): boolean {
  try {
    return existsSync(dbPath(projectRoot));
  } catch {
    return false;
  }
}

function writeIndexEntry(
  db: Database.Database,
  resolved: string,
  relPath: string,
  hash: string,
  embedding: number[],
): boolean {
  const upsert = db.prepare(`
    INSERT INTO file_index (path, rel_path, content_hash, embedding, indexed_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET
      rel_path = excluded.rel_path,
      content_hash = excluded.content_hash,
      embedding = excluded.embedding,
      indexed_at = excluded.indexed_at
  `);
  const write = db.transaction((
    absPath: string,
    rel: string,
    contentHash: string,
    embeddingJson: string,
    indexedAt: number,
  ) => {
    upsert.run(absPath, rel, contentHash, embeddingJson, indexedAt);
  });
  try {
    write(resolved, relPath, hash, JSON.stringify(embedding), Date.now());
    return true;
  } catch (err) {
    console.warn("[glassIndex] writeIndexEntry failed:", err);
    return false;
  }
}

async function indexFileUnlocked(projectRoot: string, filePath: string): Promise<boolean> {
  const absRoot = projectKey(projectRoot);
  const resolved = path.resolve(expandAgentPath(filePath));
  if (!resolved.startsWith(absRoot + path.sep) && resolved !== absRoot) return false;
  if (!isIndexableFile(resolved)) return false;

  const content = await readFileForIndex(resolved);
  if (content === null) return false;

  const hash = contentHash(content);
  const db = openDb(projectRoot);
  try {
    const existing = db.prepare("SELECT content_hash FROM file_index WHERE path = ?").get(resolved) as
      | { content_hash: string }
      | undefined;
    if (existing?.content_hash === hash) return true;
  } catch (err) {
    console.warn("[glassIndex] indexFile hash lookup failed:", err);
    return false;
  }

  const embedding = await embedText(content, INDEX_EMBED_TIMEOUT_MS);
  if (!embedding) return false;

  const relPath = path.relative(absRoot, resolved);
  return writeIndexEntry(db, resolved, relPath, hash, embedding);
}

export async function indexFile(projectRoot: string, filePath: string): Promise<boolean> {
  return withProjectLock(projectRoot, () => indexFileUnlocked(projectRoot, filePath));
}

export function removeFromIndex(projectRoot: string, filePath: string): void {
  try {
    const resolved = path.resolve(expandAgentPath(filePath));
    const db = openDb(projectRoot);
    db.prepare("DELETE FROM file_index WHERE path = ?").run(resolved);
  } catch {
    /* best-effort */
  }
}

export interface GlassIndexProgress {
  processed: number;
  indexed: number;
  total: number;
  phase?: "pulling" | "embedding";
  detail?: string;
}

async function indexProjectUnlocked(
  projectRoot: string,
  onProgress?: (progress: GlassIndexProgress) => void,
): Promise<{ fileCount: number; error?: string }> {
  const absRoot = projectKey(projectRoot);
  const ollamaOk = await checkOllamaAvailable();
  if (!ollamaOk) {
    return { fileCount: 0, error: "Ollama is not running" };
  }
  const modelOk = await ensureNomicEmbedModel((status) => {
    onProgress?.({ processed: 0, indexed: 0, total: 0, phase: "pulling", detail: status });
  });
  if (!modelOk) {
    return { fileCount: 0, error: `Could not load ${EMBED_MODEL}` };
  }

  const files = await walkIndexableFiles(absRoot);
  const total = files.length;
  let processed = 0;
  let indexed = 0;
  let consecutiveEmbedFailures = 0;
  let embedAttempts = 0;

  for (const rel of files) {
    if (!(await checkOllamaAvailable())) {
      return {
        fileCount: getIndexFileCount(projectRoot),
        error: "Ollama disconnected during indexing",
      };
    }

    const abs = path.join(absRoot, rel);
    const content = await readFileForIndex(abs);
    const ok = await indexFileUnlocked(projectRoot, abs);
    if (ok) {
      indexed += 1;
      consecutiveEmbedFailures = 0;
    } else if (content !== null) {
      embedAttempts += 1;
      consecutiveEmbedFailures += 1;
      if (consecutiveEmbedFailures >= MAX_CONSECUTIVE_EMBED_FAILURES) {
        return {
          fileCount: getIndexFileCount(projectRoot),
          error: "Ollama stopped embedding files during indexing",
        };
      }
    }

    processed += 1;
    onProgress?.({ processed, indexed, total, phase: "embedding" });
  }

  if (total > 0 && indexed === 0 && embedAttempts > 0) {
    return {
      fileCount: 0,
      error: "Could not embed any project files — is Ollama running?",
    };
  }

  return { fileCount: getIndexFileCount(projectRoot) };
}

export async function indexProject(
  projectRoot: string,
  onProgress?: (progress: GlassIndexProgress) => void,
): Promise<{ fileCount: number; error?: string }> {
  return withProjectLock(projectRoot, () => indexProjectUnlocked(projectRoot, onProgress));
}

export async function reindexProject(
  projectRoot: string,
  onProgress?: (progress: GlassIndexProgress) => void,
): Promise<{ fileCount: number; error?: string }> {
  return withProjectLock(projectRoot, async () => {
    try {
      const db = openDb(projectRoot);
      db.exec("DELETE FROM file_index");
    } catch {
      /* fresh */
    }
    return indexProjectUnlocked(projectRoot, onProgress);
  });
}

export async function searchIndex(
  projectRoot: string,
  query: string,
  topN = 12,
): Promise<Array<{ path: string; relPath: string; score: number }>> {
  const trimmed = query.trim();
  if (!trimmed || !hasIndex(projectRoot)) return [];

  const ollamaOk = await checkOllamaAvailable();
  if (!ollamaOk) return [];

  const queryEmbedding = await embedText(trimmed, SEARCH_EMBED_TIMEOUT_MS);
  if (!queryEmbedding) return [];

  try {
    const db = openDb(projectRoot);
    const rows = db.prepare("SELECT path, rel_path, embedding FROM file_index").all() as Array<{
      path: string;
      rel_path: string;
      embedding: string;
    }>;

    if (rows.length === 0) return [];

    const scored = rows
      .map((row) => {
        let embedding: number[];
        try {
          embedding = JSON.parse(row.embedding) as number[];
        } catch {
          return null;
        }
        const score = cosineSim(queryEmbedding, embedding);
        if (score < MIN_COSINE_SCORE) return null;
        if (!existsSync(row.path)) return null;
        return {
          path: row.path,
          relPath: row.rel_path,
          score,
        };
      })
      .filter((r): r is { path: string; relPath: string; score: number } => r !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, topN);

    return scored;
  } catch (err) {
    console.warn("[glassIndex] searchIndex failed:", err);
    return [];
  }
}

export function getIndexFileCount(projectRoot: string): number {
  try {
    if (!hasIndex(projectRoot)) return 0;
    const db = openDb(projectRoot);
    const row = db.prepare("SELECT COUNT(*) AS c FROM file_index").get() as { c: number };
    return row.c ?? 0;
  } catch {
    return 0;
  }
}

export function startWatching(
  projectRoot: string,
  onFileChanged: (changedPath: string) => void,
): void {
  const absRoot = projectKey(projectRoot);
  if (watchers.has(absRoot)) return;

  const watcher = chokidar.watch(absRoot, {
    ignored: [
      /node_modules/,
      /\.git/,
      /dist\//,
      /build\//,
      /\.glass-index/,
      /\.(png|jpg|jpeg|gif|ico|woff|woff2|ttf|eot|svg|mp4|mp3|wav)$/,
    ],
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 800,
      pollInterval: 100,
    },
  });

  watcher
    .on("change", onFileChanged)
    .on("add", onFileChanged)
    .on("unlink", (p) => removeFromIndex(projectRoot, p));

  watchers.set(absRoot, watcher);
}

export function stopWatching(projectRoot: string): void {
  const absRoot = projectKey(projectRoot);
  watchers.get(absRoot)?.close();
  watchers.delete(absRoot);
}

export function stopAllWatchers(): void {
  for (const w of watchers.values()) w.close();
  watchers.clear();
}
