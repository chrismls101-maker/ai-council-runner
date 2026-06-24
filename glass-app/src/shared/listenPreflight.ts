/**
 * Listen Mode preflight — PASS / BLOCKED / WARN before long endurance runs.
 */

import { runServerPreflight, type ServerPreflightResult } from "./listenLiveHarness.ts";
import {
  effectiveMaxListeningMinutes,
  formatEnduranceConfig,
  parseListenEnduranceCli,
  validateEnduranceConfig,
  type ListenEnduranceConfig,
} from "./listenEnduranceConfig.ts";
import { isListeningLimitEnabled } from "./listeningLimit.ts";

export type PreflightStatus = "PASS" | "BLOCKED" | "WARN";

export interface PreflightCheck {
  name: string;
  status: PreflightStatus;
  message: string;
}

export interface ListenPreflightResult {
  status: PreflightStatus;
  checks: PreflightCheck[];
  config: ListenEnduranceConfig;
  configSummary: string;
  serverPreflight?: ServerPreflightResult;
}

export interface ListenPreflightInput {
  apiUrl: string;
  argv?: string[];
  outDir?: string;
  sessionsPath?: string;
  /** Optional live state from Glass (when attach mode). */
  glassState?: {
    privacy?: { listening?: boolean; voiceMode?: boolean };
    stt?: { listeningElapsedMs?: number };
    transcriptionMode?: string;
    copilot?: { maxListeningMin?: number; mode?: string };
  } | null;
  duplicateListenProcess?: boolean;
}

function worstStatus(checks: PreflightCheck[]): PreflightStatus {
  if (checks.some((c) => c.status === "BLOCKED")) return "BLOCKED";
  if (checks.some((c) => c.status === "WARN")) return "WARN";
  return "PASS";
}

export async function runListenPreflight(input: ListenPreflightInput): Promise<ListenPreflightResult> {
  const config = parseListenEnduranceCli(input.argv ?? []);
  const validation = validateEnduranceConfig(config);
  const checks: PreflightCheck[] = [];
  const configSummary = formatEnduranceConfig(config);
  const effectiveLimit = effectiveMaxListeningMinutes(config);

  const serverPreflight = await runServerPreflight(input.apiUrl);
  if (serverPreflight.ok) {
    checks.push({ name: "server_online", status: "PASS", message: "IIVO server health OK." });
  } else {
    for (const f of serverPreflight.failures.filter((x) => x.category !== "vision_not_configured")) {
      checks.push({ name: f.category, status: "BLOCKED", message: `${f.cause} — ${f.fix}` });
    }
  }

  for (const w of serverPreflight.failures.filter((x) => x.category === "vision_not_configured")) {
    checks.push({ name: "vision", status: "WARN", message: w.cause });
  }

  if (validation.ok) {
    checks.push({ name: "endurance_config", status: "PASS", message: "Endurance config valid." });
  } else {
    for (const err of validation.errors) {
      checks.push({ name: "endurance_config", status: "BLOCKED", message: err });
    }
  }
  for (const w of validation.warnings) {
    checks.push({ name: "endurance_config_warn", status: "WARN", message: w });
  }

  const limitLabel = isListeningLimitEnabled(effectiveLimit) ? `${effectiveLimit} min` : "off (no limit)";
  checks.push({
    name: "listening_limit",
    status: "PASS",
    message: `Effective listening limit for this run: ${limitLabel}.`,
  });

  if (input.glassState?.privacy?.listening && (input.glassState.stt?.listeningElapsedMs ?? 0) > 0) {
    checks.push({
      name: "stale_listen_timer",
      status: "WARN",
      message: "Glass reports an active listen timer — Stop Everything recommended before overnight run.",
    });
  }

  if (input.glassState?.transcriptionMode?.includes("microphone")) {
    checks.push({
      name: "mic_mode",
      status: "BLOCKED",
      message: "Microphone capture is active — Listen endurance requires system audio only.",
    });
  } else {
    checks.push({
      name: "mic_off",
      status: "PASS",
      message: "Microphone capture not active.",
    });
  }

  if (input.glassState?.privacy?.voiceMode) {
    checks.push({
      name: "voice_mode",
      status: "BLOCKED",
      message: "Voice Mode is on — must be off for Listen endurance.",
    });
  } else {
    checks.push({ name: "voice_off", status: "PASS", message: "Voice Mode off." });
  }

  const copilotMode = input.glassState?.copilot?.mode;
  if (copilotMode === "off") {
    checks.push({
      name: "listen_mode",
      status: "WARN",
      message: "Copilot mode is off — harness will activate Listen before run.",
    });
  } else {
    checks.push({ name: "listen_mode", status: "PASS", message: `Copilot mode: ${copilotMode ?? "unknown"}.` });
  }

  if (input.duplicateListenProcess) {
    checks.push({
      name: "duplicate_process",
      status: "BLOCKED",
      message: "Another Listen live QA or Glass endurance process appears to be running.",
    });
  }

  const outDir = input.outDir ?? "/tmp/iivo-glass-listen-live";
  checks.push({
    name: "output_path",
    status: "PASS",
    message: `Results JSONL: ${outDir}/LISTEN_LIVE_RESULTS.jsonl`,
  });

  if (input.sessionsPath) {
    checks.push({
      name: "sessions_path",
      status: "PASS",
      message: `Sessions store: ${input.sessionsPath}`,
    });
  } else {
    checks.push({
      name: "sessions_path",
      status: "WARN",
      message: "Glass sessions file not found — live run will still work if Glass is running.",
    });
  }

  return {
    status: worstStatus(checks),
    checks,
    config,
    configSummary,
    serverPreflight,
  };
}

export function formatPreflightReport(result: ListenPreflightResult): string {
  const lines = [
    `# Listen Preflight — ${result.status}`,
    "",
    result.configSummary,
    "",
    "| Check | Status | Message |",
    "| --- | --- | --- |",
  ];
  for (const c of result.checks) {
    lines.push(`| ${c.name} | ${c.status} | ${c.message.replace(/\|/g, "/")} |`);
  }
  return lines.join("\n");
}
