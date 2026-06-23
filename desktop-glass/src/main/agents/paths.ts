import { join } from "node:path";
import { homedir } from "node:os";
import type { GlassUserSettings } from "../../shared/glassSettings.ts";
import { DEFAULT_AGENT_OUTPUT_FOLDER_NAME } from "../../shared/glassSettings.ts";

/** Expand a leading `~` to the user home directory. */
export function expandHomePath(path: string): string {
  const trimmed = path.trim();
  if (trimmed === "~") return homedir();
  if (trimmed.startsWith("~/")) return join(homedir(), trimmed.slice(2));
  return trimmed;
}

/** Resolve the folder where agents save markdown output. */
export function resolveAgentOutputFolder(settings: GlassUserSettings): string {
  const configured = settings.agentOutputFolder?.trim();
  if (configured) return expandHomePath(configured);
  return join(homedir(), "Desktop", DEFAULT_AGENT_OUTPUT_FOLDER_NAME);
}

/** Display path with ~ for UI labels. */
export function formatAgentOutputFolderForDisplay(folder: string): string {
  const home = homedir();
  if (folder.startsWith(home)) return folder.replace(home, "~");
  return folder;
}
