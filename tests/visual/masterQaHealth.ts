/**
 * Master QA environment health checks (API + app).
 */

import { API_BASE, APP_URL } from "./qaStepHelpers.js";
import type { MasterQaReport } from "./masterQaReport.js";

export interface VisionConfigResponse {
  enabled: boolean;
  configured: boolean;
  reason?: string;
}

/** Fetch /api/config/vision for state-aware Lens/vision QA. */
export async function fetchVisionConfig(): Promise<VisionConfigResponse> {
  try {
    const res = await fetch(`${API_BASE}/api/config/vision`, {
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      return (await res.json()) as VisionConfigResponse;
    }
  } catch {
    /* fall through */
  }
  return {
    enabled: false,
    configured: false,
    reason: "Could not reach vision config endpoint",
  };
}

export function isVisionEnabled(config: VisionConfigResponse): boolean {
  return config.enabled === true && config.configured === true;
}

export interface EnvironmentHealthResult {
  appOk: boolean;
  apiOk: boolean;
  vision: VisionConfigResponse;
  usageOk: boolean;
  contextOk: boolean;
  benchmarkOk: boolean;
  decisionsOk: boolean;
}

async function fetchOk(url: string, init?: RequestInit): Promise<boolean> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(8000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function checkEnvironmentHealth(): Promise<EnvironmentHealthResult> {
  const appOk = await fetchOk(APP_URL);
  const apiOk = await fetchOk(`${API_BASE}/api/health`);

  let vision: VisionConfigResponse = {
    enabled: false,
    configured: false,
    reason: "Could not reach vision config endpoint",
  };
  try {
    const res = await fetch(`${API_BASE}/api/config/vision`, {
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      vision = (await res.json()) as VisionConfigResponse;
    }
  } catch {
    /* keep default */
  }

  const usageOk = await fetchOk(`${API_BASE}/api/usage`);
  const contextOk = await fetchOk(`${API_BASE}/api/context`);
  const benchmarkOk = await fetchOk(`${API_BASE}/api/benchmarks/prompts`);
  const decisionsOk = await fetchOk(`${API_BASE}/api/decisions/stats`);

  return { appOk, apiOk, vision, usageOk, contextOk, benchmarkOk, decisionsOk };
}

export function recordEnvironmentHealth(
  report: MasterQaReport,
  health: EnvironmentHealthResult,
): void {
  report.visionEnabled = health.vision.enabled;
  report.visionConfigured = health.vision.configured;

  if (!health.appOk || !health.apiOk) {
    report.fail(
      "environment",
      "Environment",
      "Start IIVO first with npm run dev.",
      health,
    );
    return;
  }

  const details: Record<string, unknown> = {
    visionEnabled: health.vision.enabled,
    visionConfigured: health.vision.configured,
    usageOk: health.usageOk,
    contextOk: health.contextOk,
    benchmarkOk: health.benchmarkOk,
    decisionsOk: health.decisionsOk,
  };

  if (!health.usageOk || !health.contextOk) {
    report.fail("environment", "Environment", "Core APIs did not respond.", details);
    return;
  }

  report.pass("environment", "Environment", "App and API healthy", details);

  if (!health.benchmarkOk) {
    report.addNote("Benchmark API did not respond — Benchmark section may be limited.");
  }
  if (!health.decisionsOk) {
    report.addNote("Decision Learning API did not respond — Decision Learning section may be limited.");
  }
}

export function assertEnvironmentReady(health: EnvironmentHealthResult): void {
  if (!health.appOk || !health.apiOk) {
    throw new Error("Start IIVO first with npm run dev.");
  }
}
