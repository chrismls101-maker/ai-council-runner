/**
 * Front window bounds via NSWorkspace/CGWindowList (macOS, no Accessibility).
 */

import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { screen } from "electron";
import { flipCgWindowBoundsToTopLeft } from "../shared/cgWindowCoordinates.ts";
import type { WindowBounds } from "../shared/windowContextTypes.ts";

const execFileAsync = promisify(execFile);

const SWIFT_SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../scripts/macos-front-window-bounds.swift",
);

export interface WorkspaceWindowSnapshot {
  appName?: string;
  bounds?: WindowBounds;
  boundsSource: "workspace";
}

function displaySnapshots() {
  return screen.getAllDisplays().map((d) => ({
    x: d.bounds.x,
    y: d.bounds.y,
    width: d.bounds.width,
    height: d.bounds.height,
  }));
}

export async function queryFrontWindowBoundsViaWorkspace(): Promise<WorkspaceWindowSnapshot | null> {
  if (process.platform !== "darwin") return null;
  if (process.env.IIVO_GLASS_E2E === "1") return null;

  try {
    const { stdout } = await execFileAsync("/usr/bin/swift", [SWIFT_SCRIPT], {
      timeout: 1500,
      maxBuffer: 64 * 1024,
    });
    const line = stdout.trim().split("\n").pop() ?? "";
    const parsed = JSON.parse(line) as {
      ok?: boolean;
      appName?: string;
      x?: number;
      y?: number;
      width?: number;
      height?: number;
    };
    if (!parsed.ok) return null;

    const snapshot: WorkspaceWindowSnapshot = {
      appName: parsed.appName?.trim() || undefined,
      boundsSource: "workspace",
    };

    if (
      parsed.x != null &&
      parsed.y != null &&
      parsed.width != null &&
      parsed.height != null &&
      parsed.width >= 48 &&
      parsed.height >= 48
    ) {
      snapshot.bounds = flipCgWindowBoundsToTopLeft(
        {
          x: parsed.x,
          y: parsed.y,
          width: parsed.width,
          height: parsed.height,
        },
        displaySnapshots(),
      );
    }

    return snapshot;
  } catch {
    return null;
  }
}
