/**
 * Live Glass setup + runtime state for Aletheia companion asks (pure).
 */

import type { AletheiaDependencyManifestSnapshot } from "./aletheiaDependencyManifest.ts";
import type { GlassCapabilityId, GlassCapabilityRow } from "./glassCapabilities.ts";
import type { OmniParserInstallState } from "./omniParserInstall.ts";

const CAPABILITY_LABELS: Record<GlassCapabilityId, string> = {
  screenRecording: "Screen Recording",
  windowCapture: "Window capture",
  microphone: "Microphone",
  systemAudio: "System audio (loopback)",
  vision: "Vision API",
  stt: "Speech-to-text",
  server: "IIVO server",
};

export interface AletheiaRuntimeSetupInput {
  setupCapabilities: GlassCapabilityRow[];
  dependencyManifest?: AletheiaDependencyManifestSnapshot;
  workspaceRoot?: string | null;
  ollamaAvailable?: boolean;
  omniParserInstall?: OmniParserInstallState | null;
  indexStatus?: string | null;
  indexFileCount?: number;
  companionModeActive?: boolean;
  companionPrivacyActive?: boolean;
  hearingMachineAudio?: boolean;
  glassIdeActive?: boolean;
  coderWorkspaceActive?: boolean;
  researchExplorerActive?: boolean;
  writingStudioActive?: boolean;
  codeAnalystExplorerActive?: boolean;
  glassStorageProjectsActive?: boolean;
  glassSpacesActive?: boolean;
  glassDashboardActive?: boolean;
  aletheiaDashboardActive?: boolean;
  computerOperatorActive?: boolean;
  hotkeyPreset?: string | null;
  onboardingComplete?: boolean;
  persona?: string | null;
}

function capabilityLine(row: GlassCapabilityRow): string {
  const name = CAPABILITY_LABELS[row.id] ?? row.id;
  const detail = row.detail?.trim();
  return detail
    ? `- ${name}: ${row.label} (${row.status}) — ${detail}`
    : `- ${name}: ${row.label} (${row.status})`;
}

function dependencyLines(manifest: AletheiaDependencyManifestSnapshot): string[] {
  const lines = [
    `Bootstrap: ${manifest.bootstrapComplete ? "ready" : "incomplete"} — ${manifest.summary}`,
  ];
  for (const dep of manifest.dependencies) {
    if (dep.status === "ready") continue;
    const detail = dep.detail?.trim();
    lines.push(
      detail
        ? `- ${dep.label}: ${dep.status} — ${detail}`
        : `- ${dep.label}: ${dep.status}`,
    );
  }
  return lines;
}

/** Compact live setup block appended to companion user context. */
export function formatAletheiaRuntimeSetupContext(input: AletheiaRuntimeSetupInput): string {
  const lines: string[] = [
    "## Current Glass setup on this device (live — authoritative for this user)",
    "",
    "When asked what is set up, what works, or what you can do right now, use this block.",
    "Do not claim permissions or installs that show missing, error, or not ready below.",
    "",
  ];

  if (input.dependencyManifest) {
    lines.push("Dependencies:", ...dependencyLines(input.dependencyManifest), "");
  }

  if (input.setupCapabilities.length > 0) {
    lines.push("Permissions & services:", ...input.setupCapabilities.map(capabilityLine), "");
  }

  const workspace = input.workspaceRoot?.trim();
  lines.push("Workspace & search:");
  lines.push(
    workspace
      ? `- Coder workspace: ${workspace}`
      : "- Coder workspace: not chosen (Glass Coder will prompt for a folder)",
  );
  lines.push(`- Ollama (semantic index): ${input.ollamaAvailable ? "reachable" : "not running or not installed"}`);
  if (input.indexStatus) {
    const count =
      input.indexFileCount != null ? ` · ${input.indexFileCount} files` : "";
    lines.push(`- Code index: ${input.indexStatus}${count}`);
  }

  const omni = input.omniParserInstall;
  if (omni) {
    lines.push(
      `- OmniParser: ${omni.statusLabel}${omni.enabled ? " (enabled for guidance)" : ""}`,
    );
  }

  lines.push("", "Companion session:");
  lines.push(`- Aletheia toggle: ${input.companionModeActive ? "on" : "off"}`);
  if (input.companionPrivacyActive) {
    lines.push("- Privacy mode: active (silent until timer or user resumes)");
  }
  lines.push(
    `- Machine audio hearing: ${input.hearingMachineAudio ? "active (+ audio on strip)" : "not active — mic only unless loopback configured"}`,
  );

  const activeSurfaces: string[] = [];
  if (input.glassIdeActive) activeSurfaces.push("Glass IDE");
  if (input.coderWorkspaceActive && !input.glassIdeActive) activeSurfaces.push("Coder workspace");
  if (input.researchExplorerActive) activeSurfaces.push("Research Explorer");
  if (input.writingStudioActive) activeSurfaces.push("Writing Studio");
  if (input.codeAnalystExplorerActive) activeSurfaces.push("Code Analyst");
  if (input.glassStorageProjectsActive) activeSurfaces.push("Storage Projects");
  if (input.glassSpacesActive) activeSurfaces.push("Spaces — Glass Pathways");
  if (input.glassDashboardActive) activeSurfaces.push("Glass Dashboard");
  if (input.aletheiaDashboardActive) activeSurfaces.push("Aletheia Dashboard");
  if (input.computerOperatorActive) activeSurfaces.push("Computer Operator");
  lines.push(
    "",
    "Open surfaces:",
    activeSurfaces.length > 0 ? `- ${activeSurfaces.join(", ")}` : "- none (dock + command bar only)",
  );

  if (input.hotkeyPreset && input.hotkeyPreset !== "disabled") {
    lines.push(`- Hotkey preset: ${input.hotkeyPreset}`);
  } else if (input.hotkeyPreset === "disabled") {
    lines.push("- Global hotkeys: disabled (command bar still clickable)");
  }

  if (input.onboardingComplete === false) {
    lines.push("- Onboarding: incomplete (Sorting Hat / language may still be pending)");
  }
  if (input.persona) {
    lines.push(`- Persona: ${input.persona}`);
  }

  return lines.join("\n");
}
