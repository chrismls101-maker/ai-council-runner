import type { GlassUserSettings } from "./glassSettings.ts";
import { DEFAULT_AGENT_OUTPUT_FOLDER_NAME } from "./glassSettings.ts";

/** Human-readable output folder label for the Agent Panel footer. */
export function displayAgentOutputFolder(
  settings: Pick<GlassUserSettings, "agentOutputFolder">,
): string {
  const configured = settings.agentOutputFolder?.trim();
  if (configured) return configured;
  return `~/Desktop/${DEFAULT_AGENT_OUTPUT_FOLDER_NAME}`;
}
