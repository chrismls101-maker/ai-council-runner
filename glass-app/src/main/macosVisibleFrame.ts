/**
 * NSScreen.visibleFrame — macOS Dock autohide updates this even when Electron workArea is stale.
 */

import { execFile, execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { LayoutRect } from "../shared/glassLayoutMath.ts";

const execFileAsync = promisify(execFile);

const SWIFT_SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../scripts/macos-visible-frame.swift",
);

type VisibleFrameJson = {
  ok?: boolean;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

function parseVisibleFrameJson(stdout: string): LayoutRect | null {
  const line = stdout.trim().split("\n").pop() ?? "";
  if (!line) return null;
  const parsed = JSON.parse(line) as VisibleFrameJson;
  if (
    !parsed.ok ||
    parsed.x == null ||
    parsed.y == null ||
    parsed.width == null ||
    parsed.height == null ||
    parsed.width <= 0 ||
    parsed.height <= 0
  ) {
    return null;
  }
  return {
    x: parsed.x,
    y: parsed.y,
    width: parsed.width,
    height: parsed.height,
  };
}

function swiftArgsForBounds(bounds: LayoutRect): string[] {
  return [
    SWIFT_SCRIPT,
    String(bounds.x),
    String(bounds.y),
    String(bounds.width),
    String(bounds.height),
  ];
}

export function readMacVisibleWorkAreaSync(bounds: LayoutRect): LayoutRect | null {
  if (process.platform !== "darwin") return null;
  if (process.env.IIVO_GLASS_E2E === "1") return null;
  try {
    const stdout = execFileSync("/usr/bin/swift", swiftArgsForBounds(bounds), {
      timeout: 1500,
      maxBuffer: 16 * 1024,
      encoding: "utf8",
    });
    return parseVisibleFrameJson(stdout);
  } catch {
    return null;
  }
}

export async function readMacVisibleWorkArea(bounds: LayoutRect): Promise<LayoutRect | null> {
  if (process.platform !== "darwin") return null;
  if (process.env.IIVO_GLASS_E2E === "1") return null;
  try {
    const { stdout } = await execFileAsync("/usr/bin/swift", swiftArgsForBounds(bounds), {
      timeout: 1500,
      maxBuffer: 16 * 1024,
    });
    return parseVisibleFrameJson(stdout);
  } catch {
    return null;
  }
}

export function workAreaLayoutKey(workArea: LayoutRect): string {
  return `${workArea.x},${workArea.y},${workArea.width},${workArea.height}`;
}
