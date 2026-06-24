/**
 * Light cross-file intelligence — register project TS/JS files as Monaco extra libs.
 */

import * as monaco from "monaco-editor";
import type { GlassIdeProjectLibsResponse } from "../../shared/ipc.ts";

let extraLibDisposables: monaco.IDisposable[] = [];
let loadedProjectKey: string | null = null;

function clearExtraLibs(): void {
  for (const d of extraLibDisposables) d.dispose();
  extraLibDisposables = [];
}

function registerLib(content: string, uri: string, filePath: string): void {
  extraLibDisposables.push(
    monaco.languages.typescript.typescriptDefaults.addExtraLib(content, uri),
  );
  if (/\.jsx?$/i.test(filePath)) {
    extraLibDisposables.push(
      monaco.languages.typescript.javascriptDefaults.addExtraLib(content, uri),
    );
  }
}

export async function registerGlassIdeProjectLibs(
  projectRootLabel: string,
): Promise<GlassIdeProjectLibsResponse> {
  const key = projectRootLabel.trim();
  if (!key) {
    clearExtraLibs();
    loadedProjectKey = null;
    return { ok: false, error: "No project root" };
  }

  if (loadedProjectKey === key) {
    return { ok: true };
  }

  clearExtraLibs();
  loadedProjectKey = key;

  const res = await window.glass.glassIdeProjectLibs();
  if (!res.ok) {
    loadedProjectKey = null;
    return res;
  }

  for (const lib of res.libs ?? []) {
    if (!lib.content || !lib.uri) continue;
    registerLib(lib.content, lib.uri, lib.filePath);
  }

  return res;
}

export function resetGlassIdeProjectLibs(): void {
  clearExtraLibs();
  loadedProjectKey = null;
}
