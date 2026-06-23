/**
 * OmniParser sidecar — install paths and status for Glass main.
 */

import { existsSync } from "node:fs";
import * as path from "node:path";
import type { OmniParserInstallState } from "../shared/omniParserInstall.ts";
import { isOmniParserEnabled, resolveOmniParserSidecarDir } from "./companionOmniParser.ts";

export function omniParserWeightsPath(sidecarDir: string): string {
  return path.join(sidecarDir, "models", "icon_detect", "model.pt");
}

export function getOmniParserInstallState(): OmniParserInstallState {
  const sidecarPath = resolveOmniParserSidecarDir();
  const sidecarPresent = sidecarPath != null;
  const weightsPresent =
    sidecarPath != null && existsSync(omniParserWeightsPath(sidecarPath));
  const enabled = isOmniParserEnabled();

  let statusLabel: OmniParserInstallState["statusLabel"] = "unavailable";
  if (!sidecarPresent) {
    statusLabel = "unavailable";
  } else if (weightsPresent) {
    statusLabel = "ready";
  } else {
    statusLabel = "not_installed";
  }

  return {
    weightsPresent,
    sidecarPresent,
    enabled,
    statusLabel,
    sidecarPath,
  };
}

/** Shell command run in Glass terminal — user presses Enter to confirm. */
export function buildOmniParserInstallTerminalCommand(): string | null {
  const sidecarPath = resolveOmniParserSidecarDir();
  if (!sidecarPath) return null;
  const script = path.join(sidecarPath, "install-with-confirm.sh");
  if (!existsSync(script)) return null;
  return `cd ${shellQuote(sidecarPath)} && bash ${shellQuote(script)}`;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
