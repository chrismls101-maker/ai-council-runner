/**
 * Aletheia dependency probes — gather install state from Glass Body (P0.5).
 */

import { existsSync, statSync } from "node:fs";
import * as path from "node:path";
import { createRequire } from "node:module";
import type { DependencyProbeInput } from "../shared/aletheiaDependencyManifest.ts";
import { probeAletheiaOsPermissions } from "./aletheiaPermissionProbe.ts";
import { isBlackHoleInstalled } from "./blackHoleInstaller.ts";
import { resolveSwitchAudioSourcePath } from "./macAudioOutput.ts";
import {
  buildOmniParserInstallTerminalCommand,
  getOmniParserInstallState,
} from "./omniParserInstall.ts";
import { resolveOmniParserSidecarDir } from "./companionOmniParser.ts";
import { resolveAnthropicApiKey } from "./anthropicKeyStore.ts";
import { glassElevenLabsConfig } from "./glassElevenLabsTts.ts";

const nodeRequire = createRequire(import.meta.url);

const OLLAMA_INSTALL_COMMAND =
  'brew install ollama || echo "\\nHomebrew not found. Visit https://ollama.com/download to install Ollama for macOS."';

const SWITCH_AUDIO_INSTALL_COMMAND = "brew install switchaudio-osx";

export interface AletheiaDependencyProbeContext {
  screenCaptureReady: boolean;
  screenCaptureDetail?: string;
  ollamaAvailable: boolean;
  blackHoleInstallStatus?: string;
  serverReachable?: boolean;
}

export function probeNodePtyReady(): boolean {
  if (process.platform === "win32") return true;
  try {
    const ptyRoot = path.dirname(nodeRequire.resolve("node-pty/package.json"));
    const candidates = [
      path.join(ptyRoot, "prebuilds", `${process.platform}-${process.arch}`, "spawn-helper"),
      path.join(ptyRoot, "build", "Release", "spawn-helper"),
    ];
    for (const helper of candidates) {
      if (!existsSync(helper)) continue;
      const mode = statSync(helper).mode;
      if ((mode & 0o111) !== 0) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function probePythonSidecarVenv(): boolean {
  const sidecarDir = resolveOmniParserSidecarDir();
  if (!sidecarDir) return false;
  return existsSync(path.join(sidecarDir, ".venv", "bin", "python"));
}

export async function probeAletheiaDependencies(
  ctx: AletheiaDependencyProbeContext,
): Promise<DependencyProbeInput[]> {
  const os = probeAletheiaOsPermissions();
  const omni = getOmniParserInstallState();
  const blackHoleReady = await isBlackHoleInstalled().catch(() => false);
  const switchAudioReady = Boolean(await resolveSwitchAudioSourcePath().catch(() => null));
  const nodePtyReady = probeNodePtyReady();
  const pythonVenvReady = probePythonSidecarVenv();
  const anthropicReady = Boolean(resolveAnthropicApiKey()?.trim()) || ctx.serverReachable === true;
  const deepgramReady = Boolean(process.env.DEEPGRAM_API_KEY?.trim());
  const elevenLabsReady = Boolean(glassElevenLabsConfig().apiKey?.trim());
  const openAiReady = Boolean(
    process.env.IIVO_GLASS_OPENAI_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim(),
  );

  const blackHoleInstalling =
    ctx.blackHoleInstallStatus === "downloading" ||
    ctx.blackHoleInstallStatus === "installing" ||
    ctx.blackHoleInstallStatus === "configuring";

  return [
    {
      id: "blackhole",
      status: blackHoleInstalling
        ? "installing"
        : blackHoleReady
          ? "ready"
          : "optional_missing",
      detail: blackHoleInstalling
        ? "Installing BlackHole…"
        : blackHoleReady
          ? "BlackHole 2ch detected."
          : "Not installed — use Install system audio in Glass Setup.",
      installAction: "install-system-audio",
    },
    {
      id: "omniparser",
      status: !omni.sidecarPresent
        ? "optional_missing"
        : omni.weightsPresent
          ? "ready"
          : "optional_missing",
      detail: !omni.sidecarPresent
        ? "Sidecar bundle not found in this build."
        : omni.weightsPresent
          ? "Weights installed."
          : "Install model weights from Glass Installations.",
      installAction: "install-omniparser",
    },
    {
      id: "pythonSidecar",
      status: !omni.sidecarPresent
        ? "optional_missing"
        : pythonVenvReady
          ? "ready"
          : "optional_missing",
      detail: pythonVenvReady ? "Sidecar venv ready." : "Run OmniParser install to create .venv.",
      installAction: "terminal-command",
      terminalCommand: buildOmniParserInstallTerminalCommand(),
    },
    {
      id: "ollama",
      status: ctx.ollamaAvailable ? "ready" : "optional_missing",
      detail: ctx.ollamaAvailable ? "Ollama responding." : "Not running — optional for semantic search.",
      installAction: "terminal-command",
      terminalCommand: OLLAMA_INSTALL_COMMAND,
    },
    {
      id: "switchAudioSource",
      status: switchAudioReady ? "ready" : "optional_missing",
      detail: switchAudioReady
        ? "SwitchAudioSource CLI found."
        : "Install via Homebrew: brew install switchaudio-osx",
      installAction: "terminal-command",
      terminalCommand: SWITCH_AUDIO_INSTALL_COMMAND,
    },
    {
      id: "nodePty",
      status: nodePtyReady ? "ready" : "degraded",
      detail: nodePtyReady
        ? "PTY spawn-helper executable."
        : "spawn-helper missing or not executable — rebuild node-pty.",
    },
    {
      id: "accessibility",
      status:
        os.accessibilityGranted === true
          ? "ready"
          : os.accessibilityGranted === false
            ? "missing"
            : "unknown",
      detail:
        os.accessibilityGranted === true
          ? "Accessibility granted."
          : "Grant Accessibility in System Settings → Privacy & Security.",
      installAction: "open-system-settings",
    },
    {
      id: "screenRecording",
      status: ctx.screenCaptureReady
        ? "ready"
        : os.screenMediaAccess === false
          ? "missing"
          : "degraded",
      detail: ctx.screenCaptureReady
        ? "Screen capture probe ready."
        : ctx.screenCaptureDetail?.trim() || "Screen Recording permission or probe not ready.",
      installAction: "open-system-settings",
    },
    {
      id: "anthropicApi",
      status: anthropicReady ? "ready" : "missing",
      detail: anthropicReady
        ? ctx.serverReachable && !resolveAnthropicApiKey()?.trim()
          ? "Using IIVO server for Anthropic routing."
          : "Anthropic key configured."
        : "Add Anthropic API key in Glass Setup → API Keys.",
      installAction: "open-glass-setup",
    },
    {
      id: "deepgramApi",
      status: deepgramReady ? "ready" : "optional_missing",
      detail: deepgramReady
        ? "Deepgram key configured."
        : "Optional — Whisper fallback available when OpenAI key is set.",
      installAction: "open-glass-setup",
    },
    {
      id: "elevenLabsApi",
      status: elevenLabsReady ? "ready" : "optional_missing",
      detail: elevenLabsReady
        ? "ElevenLabs key configured."
        : "Aletheia voice unavailable until ElevenLabs key is added.",
      installAction: "open-glass-setup",
    },
    {
      id: "openAiFallback",
      status: openAiReady ? "ready" : "optional_missing",
      detail: openAiReady
        ? "OpenAI fallback key configured."
        : "Optional — enables Whisper STT and vision failover.",
      installAction: "open-glass-setup",
    },
  ];
}
