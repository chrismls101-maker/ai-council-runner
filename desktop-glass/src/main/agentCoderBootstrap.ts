/**
 * Glass Coder Build 3 — lightweight project file index + editor context bootstrap.
 */

import path from "node:path";
import { constants, promises as fsp } from "node:fs";
import {
  formatCodeContext,
  parseFileNameFromTitle,
  readCodeContext,
  type CodeContext,
} from "./codeContextReader.ts";
import { expandAgentPath } from "./agentCoderTools.ts";
import type { AgentScreenContext } from "../shared/ipc.ts";
import { promptMentionsDetectedFile } from "../shared/agentProjectPaths.ts";

function formatScreenContextBootstrap(ctx: AgentScreenContext): string {
  const lines: string[] = [];
  if (ctx.editorName) lines.push(`Editor: ${ctx.editorName}`);
  if (ctx.detectedFilePath) lines.push(`Detected active file: ${ctx.detectedFilePath}`);
  if (ctx.visibleErrors?.length) {
    lines.push(`Visible errors: ${ctx.visibleErrors.join("; ")}`);
  }
  return lines.join("\n");
}

function shouldIncludeScreenContext(
  screenContext: AgentScreenContext | undefined,
  prompt?: string,
): boolean {
  if (!screenContext) return false;
  if (!formatScreenContextBootstrap(screenContext)) return false;
  if (prompt?.trim() && promptMentionsDetectedFile(prompt, screenContext.detectedFilePath)) {
    return false;
  }
  return true;
}

const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  "target",
  "__pycache__",
  ".venv",
  "venv",
  ".turbo",
  ".cache",
]);

const MAX_INDEX_FILES = 1_500;
const MAX_INDEX_DEPTH = 12;

export interface ProjectFileIndex {
  paths: string[];
  truncated: boolean;
  totalFound: number;
}

async function walkProjectFiles(
  absRoot: string,
  relDir = "",
  depth = 0,
  out: string[] = [],
): Promise<{ paths: string[]; totalFound: number }> {
  if (depth > MAX_INDEX_DEPTH || out.length >= MAX_INDEX_FILES) {
    return { paths: out, totalFound: out.length };
  }

  const absDir = relDir ? path.join(absRoot, relDir) : absRoot;
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fsp.readdir(absDir, { withFileTypes: true });
  } catch {
    return { paths: out, totalFound: out.length };
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));

  let totalFound = out.length;
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry.name)) continue;
      const nested = await walkProjectFiles(absRoot, relPath, depth + 1, out);
      out = nested.paths;
      totalFound = nested.totalFound;
      if (out.length >= MAX_INDEX_FILES) break;
      continue;
    }
    if (!entry.isFile()) continue;
    out.push(relPath);
    totalFound += 1;
    if (out.length >= MAX_INDEX_FILES) break;
  }

  return { paths: out, totalFound };
}

export async function buildProjectFileIndex(projectRoot: string): Promise<ProjectFileIndex> {
  const absRoot = path.resolve(expandAgentPath(projectRoot));
  const { paths, totalFound } = await walkProjectFiles(absRoot);
  return {
    paths,
    truncated: totalFound >= MAX_INDEX_FILES,
    totalFound,
  };
}

export function formatProjectFileIndex(index: ProjectFileIndex): string {
  const header = index.truncated
    ? `Project file index (showing first ${index.paths.length} files — use list_directory or search_files for more):`
    : `Project file index (${index.paths.length} files):`;
  return `${header}\n${index.paths.join("\n")}`;
}

function resolveBasenameInIndex(fileName: string, index: ProjectFileIndex, projectRoot: string): string | null {
  const matches = index.paths.filter(
    (rel) => rel === fileName || rel.endsWith(`/${fileName}`),
  );
  if (matches.length === 0) return null;
  matches.sort((a, b) => a.split("/").length - b.split("/").length);
  return path.join(path.resolve(expandAgentPath(projectRoot)), matches[0]);
}

async function enrichEditorContextInProject(
  ctx: CodeContext,
  projectRoot: string,
  index: ProjectFileIndex,
): Promise<CodeContext> {
  const absRoot = path.resolve(expandAgentPath(projectRoot));
  if (ctx.filePath?.startsWith(absRoot + path.sep) || ctx.filePath === absRoot) {
    return ctx;
  }

  const resolved = resolveBasenameInIndex(ctx.fileName, index, projectRoot);
  if (!resolved) return ctx;

  try {
    const raw = await fsp.readFile(resolved, "utf-8");
    const content = raw.length > 4_000
      ? raw.slice(0, 4_000) + `\n… [truncated — showing first 4000 chars of ${raw.length}]`
      : raw;
    const stat = await fsp.stat(resolved);
    return {
      ...ctx,
      filePath: resolved,
      content,
      fileSizeBytes: stat.size,
    };
  } catch {
    return { ...ctx, filePath: resolved };
  }
}

const GLASS_CONTEXT_MAX_CHARS = 12_000;

export async function readGlassContext(projectRoot: string): Promise<string | null> {
  const contextPath = path.join(path.resolve(expandAgentPath(projectRoot)), "GLASS_CONTEXT.md");
  try {
    await fsp.access(contextPath, constants.F_OK);
    const content = await fsp.readFile(contextPath, "utf-8");
    return content.length > GLASS_CONTEXT_MAX_CHARS
      ? `${content.slice(0, GLASS_CONTEXT_MAX_CHARS)}\n\n[...GLASS_CONTEXT.md truncated at 12K chars...]`
      : content;
  } catch {
    return null;
  }
}

export function formatSemanticPreSeedFiles(relPaths: string[]): string {
  if (relPaths.length === 0) return "";
  return [
    "Relevant files identified by semantic search (read these first):",
    ...relPaths.map((p) => `- ${p}`),
  ].join("\n");
}

export async function buildCoderBootstrapContext(opts: {
  projectRoot: string;
  appName?: string | null;
  windowTitle?: string | null;
  preSeedFiles?: string[];
  screenContext?: AgentScreenContext;
  includeFileWalk?: boolean;
  prompt?: string;
}): Promise<string | undefined> {
  const projectRoot = opts.projectRoot.trim();
  if (!projectRoot) return undefined;

  const parts: string[] = [];

  const glassContext = await readGlassContext(projectRoot);
  if (glassContext) {
    parts.push(
      "[GLASS_CONTEXT.md — Project memory. Read this before touching any file.]",
      glassContext,
      "---",
    );
  }

  if (shouldIncludeScreenContext(opts.screenContext, opts.prompt)) {
    const screenText = formatScreenContextBootstrap(opts.screenContext!);
    parts.push("--- Screen context ---");
    parts.push(screenText);
  }

  if (opts.preSeedFiles && opts.preSeedFiles.length > 0) {
    parts.push(formatSemanticPreSeedFiles(opts.preSeedFiles));
  } else if (opts.includeFileWalk !== false) {
    try {
      const index = await buildProjectFileIndex(projectRoot);
      if (index.paths.length > 0) {
        parts.push(formatProjectFileIndex(index));
      }
    } catch {
      /* best-effort */
    }
  }

  const appName = opts.appName?.trim();
  const windowTitle = opts.windowTitle?.trim();
  if (appName && windowTitle && parseFileNameFromTitle(windowTitle)) {
    try {
      const index = await buildProjectFileIndex(projectRoot);
      const ctx = await readCodeContext({
        appName,
        windowTitle,
        hintPaths: [projectRoot],
      });
      if (ctx) {
        const enriched = await enrichEditorContextInProject(ctx, projectRoot, index);
        parts.push("--- Editor context (frontmost app) ---");
        parts.push(formatCodeContext(enriched));
      }
    } catch {
      /* best-effort */
    }
  }

  return parts.length > 0 ? parts.join("\n\n") : undefined;
}
