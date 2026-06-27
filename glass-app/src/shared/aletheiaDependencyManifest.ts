/**
 * Aletheia dependency manifest + bootstrap snapshot (P0.5 Body).
 *
 * Single source of truth for local binaries, OS permissions, and API providers.
 * Pure logic — no Electron imports.
 */

export type DependencyId =
  | "blackhole"
  | "omniparser"
  | "pythonSidecar"
  | "ollama"
  | "switchAudioSource"
  | "nodePty"
  | "accessibility"
  | "screenRecording"
  | "anthropicApi"
  | "deepgramApi"
  | "elevenLabsApi"
  | "openAiFallback";

export type DependencyCategory = "local" | "permission" | "api";

export type DependencyStatus =
  | "ready"
  | "missing"
  | "optional_missing"
  | "degraded"
  | "installing"
  | "error"
  | "unknown";

export type DependencyInstallAction =
  | "install-system-audio"
  | "install-omniparser"
  | "open-glass-setup"
  | "open-system-settings"
  | "terminal-command"
  | "none";

export interface DependencyProbeInput {
  id: DependencyId;
  status: DependencyStatus;
  detail?: string;
  installAction?: DependencyInstallAction;
  terminalCommand?: string | null;
}

export interface DependencyRow {
  id: DependencyId;
  label: string;
  category: DependencyCategory;
  critical: boolean;
  status: DependencyStatus;
  detail: string;
  whyNeeded: string;
  withoutIt: string;
  withIt: string;
  installAction: DependencyInstallAction;
  terminalCommand: string | null;
}

export interface AletheiaDependencyManifestSnapshot {
  updatedAt: number;
  bootstrapComplete: boolean;
  missingCount: number;
  criticalMissingCount: number;
  summary: string;
  aletheiaNarration: string;
  dependencies: DependencyRow[];
}

const DEPENDENCY_META: Record<
  DependencyId,
  Pick<DependencyRow, "label" | "category" | "critical" | "whyNeeded" | "withoutIt" | "withIt" | "installAction">
> = {
  blackhole: {
    label: "BlackHole 2ch",
    category: "local",
    critical: false,
    whyNeeded: "Routes system audio into Glass for meeting and listen modes.",
    withoutIt: "Machine-audio capture stays unavailable — mic-only modes still work.",
    withIt: "System audio and loopback listen modes can run when configured.",
    installAction: "install-system-audio",
  },
  omniparser: {
    label: "OmniParser sidecar",
    category: "local",
    critical: false,
    whyNeeded: "Optional vision marks when Accessibility and DOM are sparse.",
    withoutIt: "Sparse native UIs rely on AX, DOM, and vision-only guidance.",
    withIt: "Set-of-Marks detection improves computer-use on hard surfaces.",
    installAction: "install-omniparser",
  },
  pythonSidecar: {
    label: "Python sidecar venv",
    category: "local",
    critical: false,
    whyNeeded: "OmniParser inference runs in an isolated Python environment.",
    withoutIt: "Sidecar cannot load models until the venv is created.",
    withIt: "OmniParser can warm and serve parse requests locally.",
    installAction: "terminal-command",
  },
  ollama: {
    label: "Ollama",
    category: "local",
    critical: false,
    whyNeeded: "Local embeddings power semantic code search in the IDE.",
    withoutIt: "Semantic search and local index features stay limited.",
    withIt: "Workspace semantic search and index rebuilds are available.",
    installAction: "terminal-command",
  },
  switchAudioSource: {
    label: "SwitchAudioSource CLI",
    category: "local",
    critical: false,
    whyNeeded: "Reads and switches macOS default output device from Glass.",
    withoutIt: "Output-device routing helpers may be unavailable.",
    withIt: "Audio output switching and diagnostics work from setup.",
    installAction: "terminal-command",
  },
  nodePty: {
    label: "Terminal (node-pty)",
    category: "local",
    critical: false,
    whyNeeded: "Built-in Glass terminal uses a native pseudo-terminal.",
    withoutIt: "Terminal panel may fail to spawn shells until rebuilt.",
    withIt: "Glass terminal tabs and PTY sessions work reliably.",
    installAction: "none",
  },
  accessibility: {
    label: "Accessibility",
    category: "permission",
    critical: false,
    whyNeeded: "Computer control and front-app awareness require macOS Accessibility.",
    withoutIt: "Aletheia can listen and advise but cannot automate native apps.",
    withIt: "Confirmed computer-use actions and app focus work after approval.",
    installAction: "open-system-settings",
  },
  screenRecording: {
    label: "Screen Recording",
    category: "permission",
    critical: false,
    whyNeeded: "Visual ask and screen context need display capture permission.",
    withoutIt: "She cannot read your screen or answer visual questions.",
    withIt: "Visual ask, Lens, and screen-aware guidance are available.",
    installAction: "open-system-settings",
  },
  anthropicApi: {
    label: "Anthropic API",
    category: "api",
    critical: true,
    whyNeeded: "Primary intelligence provider for Glass Ask and agents.",
    withoutIt: "Core AI features stay offline until a key is configured.",
    withIt: "Ask, agents, and Aletheia reasoning can run on Claude.",
    installAction: "open-glass-setup",
  },
  deepgramApi: {
    label: "Deepgram API",
    category: "api",
    critical: false,
    whyNeeded: "Streaming STT with speaker labels for companion and listen modes.",
    withoutIt: "Whisper fallback works — live diarization may be unavailable.",
    withIt: "Low-latency streaming transcription with speaker separation.",
    installAction: "open-glass-setup",
  },
  elevenLabsApi: {
    label: "ElevenLabs API",
    category: "api",
    critical: false,
    whyNeeded: "Aletheia speaks with the Matilda voice through ElevenLabs TTS.",
    withoutIt: "Aletheia can think and type but may not speak aloud.",
    withIt: "Voice presence, companion TTS, and timed speech work.",
    installAction: "open-glass-setup",
  },
  openAiFallback: {
    label: "OpenAI fallback",
    category: "api",
    critical: false,
    whyNeeded: "Backup transcription and vision when Deepgram or server paths fail.",
    withoutIt: "Some failover paths stay unavailable during outages.",
    withIt: "Whisper STT and OpenAI vision fallbacks can recover gracefully.",
    installAction: "open-glass-setup",
  },
};

function statusDetail(status: DependencyStatus, fallback: string): string {
  if (fallback.trim()) return fallback.trim();
  switch (status) {
    case "ready":
      return "Ready";
    case "missing":
      return "Missing";
    case "optional_missing":
      return "Optional — not installed";
    case "degraded":
      return "Degraded";
    case "installing":
      return "Installing…";
    case "error":
      return "Error";
    default:
      return "Unknown";
  }
}

export function buildAletheiaDependencyManifest(
  probes: DependencyProbeInput[],
  now = Date.now(),
): AletheiaDependencyManifestSnapshot {
  const dependencies: DependencyRow[] = probes.map((probe) => {
    const meta = DEPENDENCY_META[probe.id];
    return {
      id: probe.id,
      label: meta.label,
      category: meta.category,
      critical: meta.critical,
      status: probe.status,
      detail: statusDetail(probe.status, probe.detail ?? ""),
      whyNeeded: meta.whyNeeded,
      withoutIt: meta.withoutIt,
      withIt: meta.withIt,
      installAction: probe.installAction ?? meta.installAction,
      terminalCommand: probe.terminalCommand ?? null,
    };
  });

  const missing = dependencies.filter((d) => d.status === "missing" || d.status === "error");
  const criticalMissing = dependencies.filter(
    (d) => d.critical && (d.status === "missing" || d.status === "error"),
  );
  const optionalMissing = dependencies.filter((d) => d.status === "optional_missing");

  const bootstrapComplete = criticalMissing.length === 0;
  const missingCount = missing.length + optionalMissing.length;

  let summary: string;
  if (bootstrapComplete && optionalMissing.length === 0) {
    summary = "All dependencies ready — Aletheia can run at full capability.";
  } else if (bootstrapComplete) {
    summary = `Core dependencies ready. ${optionalMissing.length} optional item(s) still missing.`;
  } else {
    summary = `${criticalMissing.length} required item(s) missing before Aletheia can run fully.`;
  }

  const aletheiaNarration = formatAletheiaBootstrapNarration({
    bootstrapComplete,
    criticalMissing,
    optionalMissing,
  });

  return {
    updatedAt: now,
    bootstrapComplete,
    missingCount,
    criticalMissingCount: criticalMissing.length,
    summary,
    aletheiaNarration,
    dependencies,
  };
}

export function formatAletheiaBootstrapNarration(input: {
  bootstrapComplete: boolean;
  criticalMissing: DependencyRow[];
  optionalMissing: DependencyRow[];
}): string {
  if (input.bootstrapComplete && input.optionalMissing.length === 0) {
    return "Everything I need is online. You can activate me whenever you are ready.";
  }
  if (input.bootstrapComplete) {
    const names = input.optionalMissing.map((d) => d.label.toLowerCase()).join(", ");
    return `I can run now. Optional pieces are still missing (${names}) — I will tell you what each one unlocks.`;
  }
  const primary = input.criticalMissing[0];
  if (!primary) {
    return "Some dependencies still need attention before I can run at full capability.";
  }
  const more =
    input.criticalMissing.length > 1
      ? ` ${input.criticalMissing.length - 1} more required item(s) also need setup.`
      : "";
  return `${primary.label} is required. ${primary.withoutIt}${more}`;
}

export function dependencyManifestBlocksAletheia(
  snapshot: AletheiaDependencyManifestSnapshot | undefined,
): string | null {
  if (!snapshot) {
    return "Dependency check still running — wait a moment and try again.";
  }
  if (snapshot.bootstrapComplete) return null;
  return snapshot.aletheiaNarration;
}

/** Returns true when bootstrap snapshot unchanged — skip redundant IPC push. */
export function dependencyManifestSnapshotsEqual(
  previous: AletheiaDependencyManifestSnapshot | undefined,
  current: AletheiaDependencyManifestSnapshot,
): boolean {
  if (!previous) return false;
  if (
    previous.bootstrapComplete !== current.bootstrapComplete
    || previous.summary !== current.summary
    || previous.missingCount !== current.missingCount
  ) {
    return false;
  }
  if (previous.dependencies.length !== current.dependencies.length) return false;
  return previous.dependencies.every((row, index) => {
    const next = current.dependencies[index];
    if (!next || row.id !== next.id) return false;
    return row.status === next.status && row.detail === next.detail;
  });
}

export function listMissingDependencies(
  snapshot: AletheiaDependencyManifestSnapshot,
): DependencyRow[] {
  return snapshot.dependencies.filter(
    (d) => d.status === "missing" || d.status === "error" || d.status === "optional_missing",
  );
}
