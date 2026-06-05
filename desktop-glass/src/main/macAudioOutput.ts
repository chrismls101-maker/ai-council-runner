/**
 * macOS default output device helpers (SwitchAudioSource CLI when available).
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access } from "node:fs/promises";
import { constants } from "node:fs";

const execFileAsync = promisify(execFile);

const SWITCH_AUDIO_CANDIDATES = [
  "/opt/homebrew/bin/SwitchAudioSource",
  "/usr/local/bin/SwitchAudioSource",
  "SwitchAudioSource",
];

export async function resolveSwitchAudioSourcePath(): Promise<string | null> {
  for (const candidate of SWITCH_AUDIO_CANDIDATES) {
    if (candidate === "SwitchAudioSource") {
      try {
        await execFileAsync("which", ["SwitchAudioSource"]);
        return "SwitchAudioSource";
      } catch {
        continue;
      }
    }
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

export async function getCurrentMacOutputDeviceName(): Promise<string | null> {
  if (process.platform !== "darwin") return null;
  const binary = await resolveSwitchAudioSourcePath();
  if (!binary) return null;
  try {
    const { stdout } = await execFileAsync(binary, ["-c", "-t", "output", "-f", "human"]);
    const name = stdout.trim();
    return name || null;
  } catch {
    return null;
  }
}

export async function setMacOutputDeviceByName(
  deviceName: string,
): Promise<{ ok: boolean; message: string }> {
  if (process.platform !== "darwin") {
    return { ok: false, message: "macOS output switching is only supported on darwin." };
  }
  const trimmed = deviceName.trim();
  if (!trimmed) {
    return { ok: false, message: "No saved output device name." };
  }
  const binary = await resolveSwitchAudioSourcePath();
  if (!binary) {
    return {
      ok: false,
      message:
        "Install switchaudio-osx (brew install switchaudio-osx) to auto-restore Mac sound output.",
    };
  }
  try {
    await execFileAsync(binary, ["-s", trimmed, "-t", "output"]);
    return { ok: true, message: `Mac sound output set to ${trimmed}.` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Could not set output to “${trimmed}”: ${message}` };
  }
}
