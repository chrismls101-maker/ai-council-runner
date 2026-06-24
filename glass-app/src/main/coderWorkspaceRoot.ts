/**
 * Apply Glass Coder workspace root — shared by folder picker and recent-project selection.
 */

import { promises as fsp } from "node:fs";
import path from "node:path";
import { touchRecentCoderProject } from "../shared/recentCoderProjects.ts";
import type { GlassUserSettings } from "../shared/glassSettings.ts";
import type { GlassIndexState } from "../shared/ipc.ts";
import {
  checkOllamaAvailable,
  getIndexFileCount,
  hasIndex,
  stopWatching,
} from "./glassIndex.ts";

export interface ApplyCoderWorkspaceRootInput {
  folder: string;
  settings: GlassUserSettings;
  prevRoot?: string;
  indexState: GlassIndexState;
  runProjectIndex: (folder: string) => void;
  onTerminalCd?: (folder: string) => void;
}

export interface ApplyCoderWorkspaceRootResult {
  settings: GlassUserSettings;
  indexState: GlassIndexState;
  ollamaAvailable: boolean;
  error?: string;
}

export async function applyCoderWorkspaceRoot(
  input: ApplyCoderWorkspaceRootInput,
): Promise<ApplyCoderWorkspaceRootResult> {
  const folder = input.folder.trim();
  if (!folder) {
    return { settings: input.settings, indexState: input.indexState, ollamaAvailable: false, error: "No folder" };
  }

  let resolved: string;
  try {
    const stat = await fsp.stat(folder);
    if (!stat.isDirectory()) {
      return {
        settings: input.settings,
        indexState: input.indexState,
        ollamaAvailable: false,
        error: "Not a folder",
      };
    }
    resolved = path.resolve(folder);
  } catch {
    return {
      settings: input.settings,
      indexState: input.indexState,
      ollamaAvailable: false,
      error: "Folder not found",
    };
  }

  const prevRoot = input.prevRoot?.trim();
  if (prevRoot && prevRoot !== resolved) {
    stopWatching(prevRoot);
  }

  const settings: GlassUserSettings = {
    ...input.settings,
    agentCodeWorkspaceRoot: resolved,
    recentCoderProjects: touchRecentCoderProject(input.settings.recentCoderProjects, resolved),
  };

  const indexState: GlassIndexState = {
    projectRoot: resolved,
    status: hasIndex(resolved) ? "ready" : "idle",
    fileCount: hasIndex(resolved) ? getIndexFileCount(resolved) : undefined,
  };

  const ollamaAvailable = await checkOllamaAvailable();

  input.onTerminalCd?.(resolved);

  if (
    settings.indexEnabled !== false
    && settings.indexAutoOnOpen !== false
    && !hasIndex(resolved)
    && indexState.status !== "indexing"
  ) {
    input.runProjectIndex(resolved);
  }

  return { settings, indexState, ollamaAvailable };
}
