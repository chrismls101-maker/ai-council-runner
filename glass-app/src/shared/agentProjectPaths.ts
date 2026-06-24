/**
 * Project-root path checks for Glass Coder (pure — safe in tests).
 */

import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AgentScreenContext } from "./ipc.ts";

export function expandTildePath(filePath: string): string {
  const trimmed = filePath.trim();
  if (trimmed.startsWith("~/")) {
    return path.join(os.homedir(), trimmed.slice(2));
  }
  return trimmed;
}

export function isPathInsideProject(absPath: string, projectRoot: string): boolean {
  const root = path.resolve(expandTildePath(projectRoot));
  const resolved = path.resolve(expandTildePath(absPath));
  return resolved.startsWith(root + path.sep) || resolved === root;
}

/** Resolve a project-relative or absolute path inside projectRoot; null if invalid or missing. */
export function resolveProjectFilePath(projectRoot: string, filePath: string): string | null {
  if (!projectRoot.trim() || !filePath.trim()) return null;
  const root = path.resolve(expandTildePath(projectRoot));
  const expanded = expandTildePath(filePath);
  const resolved = path.isAbsolute(expanded)
    ? path.resolve(expanded)
    : path.resolve(root, expanded);
  if (!isPathInsideProject(resolved, projectRoot) || !existsSync(resolved)) return null;
  return resolved;
}

export function filterExistingRelPaths(projectRoot: string, relPaths: string[]): string[] {
  const root = path.resolve(expandTildePath(projectRoot));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const rel of relPaths) {
    const trimmed = rel.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    const abs = path.resolve(root, trimmed);
    if (!isPathInsideProject(abs, projectRoot) || !existsSync(abs)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export function sanitizeAgentScreenContext(
  ctx: AgentScreenContext | undefined,
  projectRoot: string,
): AgentScreenContext | undefined {
  if (!ctx) return undefined;
  if (!projectRoot.trim()) return ctx;

  const filePath = ctx.detectedFilePath?.trim();
  if (!filePath) return ctx;

  const resolved = resolveProjectFilePath(projectRoot, filePath);
  if (!resolved) {
    return {
      ...ctx,
      detectedFilePath: undefined,
      confidence: "low",
    };
  }

  return { ...ctx, detectedFilePath: resolved };
}

/** True when the user prompt already names the detected file (skip duplicate screen block). */
export function promptMentionsDetectedFile(prompt: string, detectedFilePath?: string): boolean {
  const filePath = detectedFilePath?.trim();
  if (!filePath) return false;
  const haystack = prompt.toLowerCase();
  const base = path.basename(filePath).toLowerCase();
  if (base.length >= 3 && haystack.includes(base)) return true;
  const normalized = path.resolve(expandTildePath(filePath)).toLowerCase();
  return normalized.length >= 3 && haystack.includes(normalized);
}
