/**
 * Glass Companion — optional local UI parser adapter (Phase 4d / OmniParser Spike 2).
 *
 * When OmniParser weights are installed (or IIVO_COMPANION_OMNI_PARSER=1), merge som-* marks.
 * Vision marks remain the fallback when the sidecar is off or times out.
 */

import { existsSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import * as path from "node:path";
import type { UiMark } from "../shared/companionGuidance.ts";

const DEFAULT_SIDECAR_URL = "http://127.0.0.1:8765";
const PARSE_TIMEOUT_MS = Number(process.env.IIVO_OMNIPARSER_TIMEOUT_MS ?? 4000);
const HEALTH_TIMEOUT_MS = 500;
const SPAWN_HEALTH_WAIT_MS = Number(process.env.IIVO_OMNIPARSER_SPAWN_WAIT_MS ?? 45000);
/** OmniParser v2 uses low conf thresholds (~0.01); 0.15 balances noise vs recall. */
const DEFAULT_MIN_CONFIDENCE = Number(process.env.IIVO_OMNIPARSER_MIN_CONFIDENCE ?? 0.15);

let spawnAttempted = false;
let sidecarProcess: ChildProcess | null = null;

export function resolveOmniParserSidecarDir(): string | null {
  const candidates = [
    process.env.IIVO_OMNIPARSER_SIDECAR_DIR,
    path.resolve(process.cwd(), "omniparser-sidecar"),
    path.resolve(process.cwd(), "desktop-glass/omniparser-sidecar"),
  ].filter((dir): dir is string => typeof dir === "string" && dir.length > 0);

  // Packaged app: sidecar may ship adjacent to app resources (future) or in dev tree.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require("electron") as typeof import("electron");
    if (app?.getAppPath) {
      candidates.push(
        path.resolve(app.getAppPath(), "..", "..", "omniparser-sidecar"),
        path.resolve(app.getAppPath(), "omniparser-sidecar"),
      );
    }
  } catch {
    // electron not available (unit tests)
  }

  for (const dir of candidates) {
    if (existsSync(path.join(dir, "server.py"))) return dir;
  }
  return null;
}

export function omniParserWeightsPresent(): boolean {
  const dir = resolveOmniParserSidecarDir();
  if (!dir) return false;
  return existsSync(path.join(dir, "models", "icon_detect", "model.pt"));
}

export function isOmniParserEnabled(): boolean {
  if (process.env.IIVO_COMPANION_OMNI_PARSER === "0") return false;
  if (process.env.IIVO_COMPANION_OMNI_PARSER === "1") return true;
  return omniParserWeightsPresent();
}

/** Auto-spawn sidecar when OmniParser is enabled unless explicitly disabled. */
export function shouldAutoSpawnOmniParser(): boolean {
  if (!isOmniParserEnabled()) return false;
  return process.env.IIVO_OMNIPARSER_SPAWN !== "0";
}

export function omniParserSidecarUrl(): string {
  return process.env.IIVO_OMNIPARSER_URL ?? DEFAULT_SIDECAR_URL;
}

export function stripJpegDataUrl(imageDataUrl: string): string {
  const trimmed = imageDataUrl.trim();
  const comma = trimmed.indexOf(",");
  if (trimmed.startsWith("data:") && comma >= 0) {
    return trimmed.slice(comma + 1);
  }
  return trimmed;
}

interface SomMarkPayload {
  id?: unknown;
  label?: unknown;
  bounds?: {
    x?: unknown;
    y?: unknown;
    w?: unknown;
    h?: unknown;
  };
  confidence?: unknown;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function normalizeSomMark(raw: SomMarkPayload, index: number): UiMark | null {
  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : `som-${index + 1}`;
  const b = raw.bounds;
  if (!b || typeof b !== "object") return null;

  const x = Number(b.x);
  const y = Number(b.y);
  const w = Number(b.w);
  const h = Number(b.h);
  if (![x, y, w, h].every(Number.isFinite)) return null;
  if (w <= 0 || h <= 0) return null;

  const mark: UiMark = {
    id,
    bounds: { x: clamp01(x), y: clamp01(y), w: clamp01(w), h: clamp01(h) },
    source: "som",
  };
  if (typeof raw.label === "string" && raw.label.trim()) {
    mark.label = raw.label.trim();
  }
  return mark;
}

export function parseOmniParserResponse(body: unknown): UiMark[] {
  if (!body || typeof body !== "object") return [];
  const marksRaw = (body as { marks?: unknown }).marks;
  if (!Array.isArray(marksRaw)) return [];

  return marksRaw
    .map((raw, index) => normalizeSomMark(raw as SomMarkPayload, index))
    .filter((mark): mark is UiMark => mark != null);
}

function sidecarPortFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.port || (parsed.protocol === "https:" ? "443" : "80");
  } catch {
    return "8765";
  }
}

function resolveSidecarDir(): string | null {
  return resolveOmniParserSidecarDir();
}

async function fetchSidecarHealth(url: string): Promise<{
  ready: boolean;
  modelLoaded?: boolean;
  loading?: boolean;
  weightsPresent?: boolean;
  mode?: string;
} | null> {
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/health`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      ready?: unknown;
      modelLoaded?: unknown;
      loading?: unknown;
      weightsPresent?: unknown;
      mode?: unknown;
    };
    return {
      ready: body.ready === true,
      modelLoaded: body.modelLoaded === true,
      loading: body.loading === true,
      weightsPresent: body.weightsPresent === true,
      mode: typeof body.mode === "string" ? body.mode : undefined,
    };
  } catch {
    return null;
  }
}

async function checkSidecarHealth(url: string): Promise<boolean> {
  const health = await fetchSidecarHealth(url);
  return health?.ready === true;
}

function sidecarHealthIsWarm(
  health: NonNullable<Awaited<ReturnType<typeof fetchSidecarHealth>>>,
): boolean {
  return (
    health.modelLoaded === true ||
    health.mode === "yolo" ||
    health.mode === "yolo+caption"
  );
}

/** True when the sidecar is up and the detection model is loaded. */
export async function isOmniParserSidecarWarm(): Promise<boolean> {
  if (!isOmniParserEnabled()) return false;
  const health = await fetchSidecarHealth(omniParserSidecarUrl());
  if (!health?.ready) return false;
  return sidecarHealthIsWarm(health);
}

async function waitForSidecarModel(url: string, maxMs: number): Promise<boolean> {
  if (process.env.IIVO_OMNIPARSER_WAIT_MODEL === "0") return true;
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const health = await fetchSidecarHealth(url);
    if (!health?.ready) return false;
    if (health.modelLoaded) return true;
    if (health.mode === "yolo" || health.mode === "yolo+caption") return true;
    if (!health.weightsPresent && !health.loading) return true;
    await sleep(500);
  }
  const health = await fetchSidecarHealth(url);
  return health?.modelLoaded === true || health?.mode === "yolo" || health?.mode === "yolo+caption";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function trySpawnSidecar(url: string): Promise<boolean> {
  if (!shouldAutoSpawnOmniParser()) return false;
  if (spawnAttempted) return false;
  spawnAttempted = true;

  const sidecarDir = resolveSidecarDir();
  if (!sidecarDir) return false;

  const port = sidecarPortFromUrl(url);
  const host = process.env.IIVO_OMNIPARSER_HOST ?? "127.0.0.1";
  const startScript = path.join(sidecarDir, "start.sh");

  if (existsSync(startScript)) {
    sidecarProcess = spawn("bash", [startScript], {
      cwd: sidecarDir,
      stdio: "ignore",
      detached: false,
      env: {
        ...process.env,
        IIVO_OMNIPARSER_PORT: port,
        IIVO_OMNIPARSER_HOST: host,
      },
    });
  } else {
    const venvPython = path.join(sidecarDir, ".venv", "bin", "python");
    const pythonBin = existsSync(venvPython) ? venvPython : "python3";
    sidecarProcess = spawn(
      pythonBin,
      ["-m", "uvicorn", "server:app", "--host", host, "--port", port],
      {
        cwd: sidecarDir,
        stdio: "ignore",
        detached: false,
      },
    );
  }
  sidecarProcess.on("exit", () => {
    sidecarProcess = null;
    spawnAttempted = false;
  });

  const deadline = Date.now() + SPAWN_HEALTH_WAIT_MS;
  while (Date.now() < deadline) {
    if (await checkSidecarHealth(url)) {
      if (await waitForSidecarModel(url, Math.max(500, deadline - Date.now()))) {
        return true;
      }
    }
    await sleep(200);
  }
  return false;
}

export async function ensureOmniParserSidecar(): Promise<boolean> {
  const url = omniParserSidecarUrl();
  if (await checkSidecarHealth(url)) {
    return waitForSidecarModel(url, SPAWN_HEALTH_WAIT_MS);
  }
  const spawned = await trySpawnSidecar(url);
  if (!spawned) return false;
  return waitForSidecarModel(url, SPAWN_HEALTH_WAIT_MS);
}

/**
 * Fire-and-forget: start/warm the sidecar when Companion turns on.
 * Non-blocking — Companion works without it (AX/DOM/vision fallback).
 */
export function warmOmniParserSidecarOnCompanionToggle(): void {
  warmOmniParserSidecarWithCallbacks({});
}

export interface OmniParserWarmupCallbacks {
  onWarming?: () => void;
  onReady?: () => void;
}

/**
 * Warm the sidecar; invokes onWarming before load when cold, onReady after first cold warm.
 * Skips both callbacks when already warm.
 */
export function warmOmniParserSidecarWithCallbacks(callbacks: OmniParserWarmupCallbacks): void {
  if (!isOmniParserEnabled()) return;
  void (async () => {
    const alreadyWarm = await isOmniParserSidecarWarm();
    if (!alreadyWarm) callbacks.onWarming?.();
    await ensureOmniParserSidecar();
    if (!alreadyWarm) callbacks.onReady?.();
  })().catch(() => {
    // Sidecar optional; silent fallback to AX/DOM/vision.
  });
}

export async function tryOmniParserMarks(input: {
  imageDataUrl: string;
  captureWidth: number;
  captureHeight: number;
}): Promise<UiMark[]> {
  if (!isOmniParserEnabled()) return [];

  const ready = await ensureOmniParserSidecar();
  if (!ready) return [];

  const url = omniParserSidecarUrl();
  const jpeg = stripJpegDataUrl(input.imageDataUrl);
  if (!jpeg) return [];

  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/v1/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageBase64: jpeg,
        width: input.captureWidth,
        height: input.captureHeight,
        maxMarks: 24,
        minConfidence: DEFAULT_MIN_CONFIDENCE,
      }),
      signal: AbortSignal.timeout(PARSE_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const body = await res.json();
    return parseOmniParserResponse(body);
  } catch {
    return [];
  }
}

export function shouldTryOmniParser(axDomMarkCount: number, appName?: string): boolean {
  if (!isOmniParserEnabled()) return false;
  if (axDomMarkCount >= 3) return false;
  const app = appName?.toLowerCase() ?? "";
  if (app.includes("chrome") || app.includes("google chrome")) return false;
  return true;
}

export function resetOmniParserSidecarStateForTests(): void {
  spawnAttempted = false;
  sidecarProcess = null;
}

/** Supervisor restart — allows a fresh spawn after crash or health failure. */
export async function restartOmniParserSidecar(): Promise<boolean> {
  if (sidecarProcess) {
    try {
      sidecarProcess.kill("SIGTERM");
    } catch {
      /* best effort */
    }
    sidecarProcess = null;
  }
  spawnAttempted = false;
  return ensureOmniParserSidecar();
}
