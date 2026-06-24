/**
 * Light project intelligence for Monaco — register project TS/JS files as extra libs
 * so cross-file go-to-definition and diagnostics work without a full LSP server.
 */

import { promises as fsp } from "node:fs";
import path from "node:path";
import { buildProjectFileIndex } from "./agentCoderBootstrap.ts";
import { expandAgentPath } from "./agentCoderTools.ts";

const CODE_EXT = /\.(tsx?|jsx?)$/i;
const MAX_LIBS = 120;
const MAX_FILE_BYTES = 48_000;

export interface GlassIdeProjectLib {
  /** Absolute path on disk */
  filePath: string;
  /** file:/// URI for Monaco */
  uri: string;
  content: string;
}

export interface GlassIdeProjectLibsResponse {
  ok: boolean;
  projectRoot?: string;
  libs?: GlassIdeProjectLib[];
  error?: string;
}

export async function loadGlassIdeProjectLibs(
  projectRoot: string,
): Promise<GlassIdeProjectLibsResponse> {
  const root = path.resolve(expandAgentPath(projectRoot.trim()));
  if (!root) return { ok: false, error: "No project root" };

  try {
    const index = await buildProjectFileIndex(root);
    const candidates = index.paths.filter((rel) => CODE_EXT.test(rel)).slice(0, MAX_LIBS);
    const libs: GlassIdeProjectLib[] = [];

    for (const rel of candidates) {
      const filePath = path.join(root, rel);
      try {
        const buf = await fsp.readFile(filePath);
        if (buf.byteLength > MAX_FILE_BYTES) continue;
        const content = buf.toString("utf8");
        const uri = `file://${filePath}`;
        libs.push({ filePath, uri, content });
      } catch {
        // skip unreadable
      }
    }

    return { ok: true, projectRoot: root, libs };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to load project libs",
    };
  }
}
