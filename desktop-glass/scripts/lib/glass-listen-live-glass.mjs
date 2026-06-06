/**
 * Launch or attach to IIVO Glass over CDP and automate Listen mode for live QA.
 *
 * Requires IIVO_GLASS_E2E=1 (CDP port 19222) — the harness sets this when launching.
 * Uses the REAL IIVO server (IIVO_GLASS_LIVE_E2E=1), not the E2E stub.
 */

import { execSync, spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pickPreferredVirtualAudioDevice } from "../../src/shared/virtualAudioCapture.ts";
import { chromium } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const GLASS_ROOT = path.resolve(__dirname, "../..");
export const GLASS_MAIN = path.join(GLASS_ROOT, "out/main/index.js");
export const GLASS_ELECTRON_BIN = path.join(
  GLASS_ROOT,
  "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
);
export const GLASS_CDP_PORT = 19222;
export const GLASS_CDP_URL = `http://127.0.0.1:${GLASS_CDP_PORT}`;
const CDP_STARTUP_TIMEOUT_MS = 45_000;

export function glassBuildNeeded() {
  return !existsSync(GLASS_MAIN) || !existsSync(GLASS_ELECTRON_BIN);
}

export function ensureGlassBuilt(log = console.log) {
  if (!existsSync(GLASS_ELECTRON_BIN)) {
    log("Installing Electron (first run)…");
    const install = spawnSync("npm", ["install"], { cwd: GLASS_ROOT, stdio: "inherit" });
    if (install.status !== 0) throw new Error("npm install failed in desktop-glass");
  }
  if (!existsSync(GLASS_MAIN)) {
    log("Building IIVO Glass (out/main missing)…");
    const build = spawnSync("npm", ["run", "build"], { cwd: GLASS_ROOT, stdio: "inherit" });
    if (build.status !== 0) throw new Error("glass build failed — run npm run glass:build");
  }
}

function killStaleCdp() {
  try {
    const out = execSync(`lsof -ti tcp:${GLASS_CDP_PORT}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    for (const pid of out.split("\n")) {
      const n = Number(pid);
      if (Number.isFinite(n) && n > 0) {
        try {
          process.kill(n, "SIGKILL");
        } catch {
          /* gone */
        }
      }
    }
  } catch {
    /* free */
  }
}

function cdpInUse() {
  try {
    return execSync(`lsof -ti tcp:${GLASS_CDP_PORT}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .trim().length > 0;
  } catch {
    return false;
  }
}

async function waitForCdp(url, electronProcess, timeoutMs = CDP_STARTUP_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (electronProcess?.exitCode != null) {
      throw new Error(`Glass exited before CDP ready (code ${electronProcess.exitCode})`);
    }
    try {
      const res = await fetch(`${url}/json/version`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`CDP not ready at ${url} within ${timeoutMs}ms`);
}

async function waitForPage(browser, htmlFile, timeoutMs = 25_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const ctx of browser.contexts()) {
      for (const page of ctx.pages()) {
        if (page.url().includes(htmlFile)) {
          await page.waitForLoadState("domcontentloaded").catch(() => undefined);
          return page;
        }
      }
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Window ${htmlFile} not found`);
}

export async function getGlassPages(browser) {
  const [command, dock, panel] = await Promise.all([
    waitForPage(browser, "command.html"),
    waitForPage(browser, "index.html"),
    waitForPage(browser, "panel.html"),
  ]);
  return { command, dock, panel };
}

export async function readGlassState(commandPage) {
  return commandPage.evaluate(async () => window.glass.getState());
}

export async function launchGlassForListenLive({ apiUrl, webUrl, log = console.log }) {
  ensureGlassBuilt(log);
  killStaleCdp();

  const env = {
    ...process.env,
    IIVO_GLASS_E2E: "1",
    IIVO_GLASS_LIVE_E2E: "1",
    IIVO_API_URL: apiUrl,
    IIVO_WEB_URL: webUrl,
  };
  delete env.ELECTRON_RUN_AS_NODE;

  log("Launching IIVO Glass (automation mode, real server)…");
  const electronProcess = spawn(GLASS_ELECTRON_BIN, [GLASS_MAIN], {
    cwd: GLASS_ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  electronProcess.stderr?.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  await waitForCdp(GLASS_CDP_URL, electronProcess);
  const browser = await chromium.connectOverCDP(GLASS_CDP_URL);
  const pages = await getGlassPages(browser);
  return { browser, electronProcess, pages, launched: true, stderr };
}

export async function attachGlassForListenLive({ log = console.log }) {
  if (!cdpInUse()) {
    throw new Error(
      "No Glass on CDP port 19222. Start with:\n" +
        "  IIVO_GLASS_E2E=1 IIVO_GLASS_LIVE_E2E=1 npm run glass:dev\n" +
        "Or omit --attach to let the harness launch Glass for you.",
    );
  }
  log("Attaching to IIVO Glass on CDP :19222…");
  await waitForCdp(GLASS_CDP_URL, null, 10_000);
  const browser = await chromium.connectOverCDP(GLASS_CDP_URL);
  const pages = await getGlassPages(browser);
  return { browser, electronProcess: null, pages, launched: false };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function findBlackHoleDevice(devices) {
  if (!devices?.length) return undefined;
  return pickPreferredVirtualAudioDevice(devices);
}

/**
 * Open panel Setup → System Audio, detect BlackHole, select it, and test signal.
 * Requires video/audio playing on the Mac during the test step.
 */
export async function configureSystemAudioForListen({ command, panel, log = console.log }) {
  log("  Configuring system audio (detect BlackHole → select → test)…");

  await panel.locator('[data-testid="glass-panel-tab-setup"]').click();
  await panel.waitForSelector('[data-testid="glass-panel-setup"]', { timeout: 10_000 });
  await panel.locator('[data-testid="glass-panel-setup"]').scrollIntoViewIfNeeded().catch(() => undefined);

  const toggle = panel.locator('[data-testid="glass-system-audio-configure-toggle"]');
  await toggle.click();
  await panel.waitForSelector('[data-testid="glass-system-audio-drawer"]', { timeout: 10_000 });

  async function detectDevices() {
    await panel.locator('[data-testid="glass-detect-audio-devices"]').click();
    await sleep(2500);
  }

  await detectDevices();

  let state = await readGlassState(command);
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const device = findBlackHoleDevice(state.virtualAudioDevices);
    if (device?.deviceId) break;
    await detectDevices();
    state = await readGlassState(command);
  }

  let device = findBlackHoleDevice(state.virtualAudioDevices);
  const savedId = state.selectedVirtualAudioDeviceId?.trim();

  if (!device && savedId) {
    device = state.virtualAudioDevices?.find((d) => d.deviceId === savedId);
    if (device) log(`  Using previously saved device: ${device.label}`);
  }

  if (!device?.deviceId) {
    const labels = (state.virtualAudioDevices ?? []).map((d) => d.label).join(", ") || "none";
    return {
      ok: false,
      category: "blackhole_no_signal",
      cause: `No BlackHole device found (detected: ${labels}).`,
      fix:
        "Install BlackHole 2ch, route Mac output through Multi-Output Device, then re-run. " +
        "Play audio before the test runs.",
      state,
    };
  }

  log(`  Selecting: ${device.label}`);
  await panel.locator('[data-testid="glass-system-audio-source-select"]').selectOption(device.deviceId);
  await sleep(800);

  log("  Testing system audio — keep your video playing with sound…");
  await panel.locator('[data-testid="glass-test-system-audio"]').click();
  await sleep(6000);
  state = await readGlassState(command);
  log(`  System audio status after test: ${state.systemAudioStatus ?? "unknown"}`);

  if (state.systemAudioStatus !== "available") {
    log("  Retrying system audio test once…");
    await panel.locator('[data-testid="glass-test-system-audio"]').click();
    await sleep(6000);
    state = await readGlassState(command);
    log(`  System audio status (retry): ${state.systemAudioStatus ?? "unknown"}`);
  }

  if (state.systemAudioStatus === "available") {
    return { ok: true, state, device };
  }

  if (state.systemAudioStatus === "requires_permission") {
    return {
      ok: false,
      category: "screen_capture_failed",
      cause: state.systemAudioDetail ?? "Screen/System Audio permission not granted to IIVO Glass.",
      fix:
        "Grant Screen Recording to IIVO Glass/Electron in System Settings → Privacy, then re-run. " +
        "For BlackHole-only capture, ensure BlackHole is selected above.",
      state,
    };
  }

  return {
    ok: false,
    category: "blackhole_no_signal",
    cause: state.systemAudioDetail ?? `System audio not ready (status: ${state.systemAudioStatus}).`,
    fix: "Confirm Multi-Output Device includes BlackHole and video is playing with sound during the test.",
    state,
  };
}

/**
 * Automate Listen mode: session + coaching + video_learning + system audio + Listen click.
 * Does NOT enable microphone or Voice mode.
 */
export async function automateListenMode({ command, dock, panel, log = console.log }) {
  log("Automating Listen mode (computer audio only, mic off)…");

  await command.evaluate(() => {
    window.glass.send({ type: "stop-everything" });
    window.glass.send({ type: "copilot-set-mode", mode: "off" });
    window.glass.send({ type: "session-end" });
  });
  await sleep(400);

  await dock.locator('[data-testid="glass-dock-open-panel"]').click();
  await panel.waitForSelector('[data-testid="glass-mode-panel"]', { timeout: 15_000 });

  const audioConfig = await configureSystemAudioForListen({ command, panel, log });
  if (!audioConfig.ok) {
    return audioConfig;
  }

  await panel.locator('[data-testid="glass-panel-tab-summary"]').click();
  await panel.waitForSelector('[data-testid="glass-mode-panel"]', { timeout: 10_000 });

  log("  Running setup check (virtual audio / STT probes)…");
  await command.evaluate(() => window.glass.send({ type: "run-setup-check" }));
  await sleep(3000);

  let state = await readGlassState(command);
  log(`  System audio status: ${state.systemAudioStatus ?? "unknown"}`);

  await panel.locator('[data-testid="glass-mode-card-listen"]').click();
  await sleep(2000);

  state = await readGlassState(command);

  if (!state.privacy?.listening) {
    log("  Starting system audio listening…");
    await command.evaluate(() => {
      window.glass.send({ type: "transcription-set-mode", mode: "system_audio" });
      window.glass.send({ type: "capture-media-context" });
      window.glass.send({ type: "request-start-listening" });
    });
    await sleep(3000);
    state = await readGlassState(command);
  }

  if (!state.privacy?.listening) {
    await command.evaluate(() => window.glass.send({ type: "start-listening" }));
    await command.evaluate(() => window.glass.send({ type: "request-start-listening" }));
    await sleep(2500);
    state = await readGlassState(command);
  }

  const micListening = state.transcriptionMode?.startsWith("microphone");
  if (micListening) {
    return {
      ok: false,
      category: "mic_accidentally_active",
      cause: "Transcription mode is microphone, not system_audio.",
      fix: "Listen mode must use computer audio only.",
      state,
    };
  }

  if (!state.privacy?.listening) {
    return {
      ok: false,
      category: "system_audio_not_selected",
      cause: `Listening did not start (systemAudio=${state.systemAudioStatus}, mode=${state.transcriptionMode}).`,
      fix: "BlackHole may be silent — play video with sound and re-run.",
      state,
    };
  }

  log("  Listen mode active · transcription: system_audio · mic off");
  return { ok: true, state };
}

export async function closeGlassSession({ browser, electronProcess, log = console.log }) {
  try {
    await browser?.close();
  } catch {
    /* ignore */
  }
  if (electronProcess && electronProcess.exitCode == null) {
    log("Closing IIVO Glass…");
    electronProcess.kill("SIGTERM");
    await sleep(500);
    if (electronProcess.exitCode == null) electronProcess.kill("SIGKILL");
  }
}

export function printSetupInstructions(log = console.log) {
  log("");
  log("══════════════════════════════════════════════════════════════");
  log("  IIVO Glass Live Listen — what you need running");
  log("══════════════════════════════════════════════════════════════");
  log("");
  log("  1. IIVO server (required) — in a separate terminal:");
  log("       npm run dev");
  log("     This serves API + STT at http://localhost:3001");
  log("");
  log("  2. You do NOT need a separate test server.");
  log("     This harness is the test — it calls your real server.");
  log("");
  log("  3. BlackHole routing Mac audio — harness auto-selects BlackHole in panel Setup.");
  log("");
  log("  4. Start YouTube/video BEFORE or during Step 1 (audio must play during BlackHole test).");
  log("     Vision is optional — window title + audio are enough.");
  log("");
  log("  AUTO MODE: harness launches Glass, selects BlackHole, clicks Listen.");
  log("  You do NOT need to open the app manually unless using --attach.");
  log("");
  log("══════════════════════════════════════════════════════════════");
  log("");
}
