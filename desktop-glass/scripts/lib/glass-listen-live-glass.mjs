/**
 * Launch or attach to IIVO Glass over CDP and automate Listen mode for live QA.
 *
 * Requires IIVO_GLASS_E2E=1 (CDP port 19222) — the harness sets this when launching.
 * Uses the REAL IIVO server (IIVO_GLASS_LIVE_E2E=1), not the E2E stub.
 */

import { execSync, spawn, spawnSync } from "node:child_process";
import { get as httpGet } from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pickPreferredVirtualAudioDevice } from "../../src/shared/virtualAudioCapture.ts";
import { isSystemAudioConnected } from "../../src/shared/systemAudioUi.ts";
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
    const ready = await new Promise((resolve) => {
      httpGet(`${url}/json/version`, (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      }).on("error", () => resolve(false));
    });
    if (ready) return;
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
  const relayElectronLog = (chunk) => {
    const text = chunk.toString();
    stderr += text;
    for (const line of text.split("\n")) {
      if (line.includes("[listenAiNotes]")) {
        console.log(`  [glass] ${line.trim()}`);
      }
    }
  };
  electronProcess.stderr?.on("data", relayElectronLog);
  electronProcess.stdout?.on("data", relayElectronLog);

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

async function pollUntil(fn, timeoutMs, intervalMs = 350) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const hit = await fn();
    if (hit) return hit;
    await sleep(intervalMs);
  }
  return null;
}

function findBlackHoleDevice(devices) {
  if (!devices?.length) return undefined;
  return pickPreferredVirtualAudioDevice(devices);
}

async function ensurePanelOpen(dock, panel) {
  await dock.locator('[data-testid="glass-dock-open-panel"]').click();
  await panel.waitForSelector('[data-testid="glass-panel"]', { timeout: 12_000 });
}

async function openSetupTab(panel) {
  await panel.locator('[data-testid="glass-panel-tab-setup"]').click();
  await panel.waitForSelector('[data-testid="glass-panel-setup"]', { timeout: 8_000 });
}

async function openCopilotTab(panel) {
  await panel.locator('[data-testid="glass-panel-tab-copilot"]').click();
  await panel.waitForSelector('[data-testid="glass-mode-panel"]', { timeout: 8_000 });
}

async function openAudioTab(panel) {
  await panel.locator('[data-testid="glass-panel-tab-audio"]').click();
  await panel.waitForSelector('[data-testid="glass-panel-audio-tab"]', { timeout: 8_000 });
}

function setupPermissionsLevel(rows) {
  const filtered = (rows ?? []).filter((row) => row.id !== "systemAudio");
  if (filtered.some((row) => row.severity === "error")) return "error";
  if (filtered.some((row) => row.severity === "warn")) return "warn";
  return "ok";
}

function isIivoGlassConnected(state) {
  if (!state.setupCheckSummary?.trim()) return false;
  if (!isSystemAudioConnected(state.systemAudioStatus)) return false;
  const rows = state.setupCapabilities ?? [];
  if (rows.length === 0) return false;
  const server = rows.find((row) => row.id === "server");
  if (server?.severity === "error") return false;
  return setupPermissionsLevel(rows) !== "error";
}

/** Click CONNECT IIVO GLASS on Setup — connects server, permissions, and system audio. */
async function connectIivoGlassViaSetup({ command, panel, log }) {
  log("  1/3 Connect IIVO Glass…");
  await openSetupTab(panel);

  let state = await readGlassState(command);
  if (isIivoGlassConnected(state)) {
    log("  Already connected (server + system audio)");
    return { ok: true, state };
  }

  await panel.locator('[data-testid="glass-run-setup-check"]').click();
  state = await pollUntil(async () => {
    const s = await readGlassState(command);
    return isIivoGlassConnected(s) ? s : null;
  }, 30_000);

  if (!state) {
    const last = await readGlassState(command);
    return {
      ok: false,
      category: "setup_failed",
      cause: last.setupCheckSummary ?? "Connect IIVO Glass did not finish.",
      fix: "Open Setup → CONNECT IIVO GLASS, grant permissions, confirm BlackHole routing.",
      state: last,
    };
  }

  log(`  Connected · system audio: ${state.systemAudioStatus}`);
  return { ok: true, state };
}

/**
 * Audio tab fallback when Connect did not bring system audio online.
 */
async function ensureSystemAudioViaAudioTab({ command, panel, log }) {
  log("  2/3 Verify system audio…");

  let state = await readGlassState(command);
  if (isSystemAudioConnected(state.systemAudioStatus)) {
    log("  System audio online");
    return { ok: true, state };
  }

  log("  Audio not connected — Audio tab fallback…");
  await openAudioTab(panel);

  async function detectDevices() {
    await Promise.all([
      panel.locator('[data-testid="glass-detect-audio-devices"]').click(),
      command.evaluate(() => window.glass.send({ type: "probe-virtual-audio-devices" })),
    ]);
    await sleep(900);
  }

  await detectDevices();
  state = await pollUntil(async () => {
    const s = await readGlassState(command);
    return findBlackHoleDevice(s.virtualAudioDevices) ? s : null;
  }, 12_000);
  state = state ?? (await readGlassState(command));

  let device = findBlackHoleDevice(state.virtualAudioDevices);
  const savedId = state.selectedVirtualAudioDeviceId?.trim();
  if (!device && savedId) {
    device = state.virtualAudioDevices?.find((d) => d.deviceId === savedId);
  }

  if (!device?.deviceId) {
    await detectDevices();
    state = await readGlassState(command);
    device = findBlackHoleDevice(state.virtualAudioDevices);
  }

  if (!device?.deviceId) {
    const labels = (state.virtualAudioDevices ?? []).map((d) => d.label).join(", ") || "none";
    return {
      ok: false,
      category: "blackhole_no_signal",
      cause: `No BlackHole device found (detected: ${labels}).`,
      fix:
        "Install BlackHole 2ch, route Mac output through Multi-Output Device, then re-run. " +
        "Press play on your video while the harness runs.",
      state,
    };
  }

  if (state.selectedVirtualAudioDeviceId !== device.deviceId) {
    log(`  Selecting: ${device.label}`);
    await panel.locator('[data-testid="glass-system-audio-source-select"]').selectOption(device.deviceId);
    await sleep(400);
  }

  if (!isSystemAudioConnected(state.systemAudioStatus)) {
    log("  Connecting system audio…");
    await Promise.all([
      panel.locator('[data-testid="glass-connect-system-audio"]').click(),
      command.evaluate(() => window.glass.send({ type: "connect-system-audio" })),
    ]);
    await sleep(800);
  }

  state = await readGlassState(command);
  if (!isSystemAudioConnected(state.systemAudioStatus)) {
    log("  Testing signal — press play on your video if it is paused…");
    await Promise.all([
      panel.locator('[data-testid="glass-test-system-audio-bar"]').click(),
      command.evaluate(() => window.glass.send({ type: "test-system-audio" })),
    ]);
    state = await pollUntil(async () => {
      const s = await readGlassState(command);
      return isSystemAudioConnected(s.systemAudioStatus) ? s : null;
    }, 10_000);
  }

  state = state ?? (await readGlassState(command));
  if (isSystemAudioConnected(state.systemAudioStatus)) {
    log(`  System audio online (${device.label})`);
    return { ok: true, state, device };
  }

  if (state.systemAudioStatus === "requires_permission") {
    return {
      ok: false,
      category: "screen_capture_failed",
      cause: state.systemAudioDetail ?? "Screen/System Audio permission not granted to IIVO Glass.",
      fix:
        "Grant Screen Recording to IIVO Glass/Electron in System Settings → Privacy, then re-run.",
      state,
    };
  }

  return {
    ok: false,
    category: "blackhole_no_signal",
    cause: state.systemAudioDetail ?? `System audio not ready (status: ${state.systemAudioStatus}).`,
    fix: "Press play on your video, confirm Multi-Output Device includes BlackHole, then re-run.",
    state,
  };
}

/**
 * Open system audio drawer, select BlackHole, test signal.
 * Skips long waits when already configured.
 */
export async function configureSystemAudioForListen({ command, panel, log = console.log }) {
  log("  2/3 Configure system audio…");

  let state = await readGlassState(command);
  const savedDevice = findBlackHoleDevice(state.virtualAudioDevices) ??
    state.virtualAudioDevices?.find((d) => d.deviceId === state.selectedVirtualAudioDeviceId);

  if (state.systemAudioStatus === "available" && savedDevice?.deviceId) {
    log(`  Already online: ${savedDevice.label}`);
    return { ok: true, state, device: savedDevice, skipped: true };
  }

  await openSetupTab(panel);

  const toggle = panel.locator('[data-testid="glass-system-audio-configure-toggle"]');
  const drawer = panel.locator('[data-testid="glass-system-audio-drawer"]');
  if (!(await drawer.isVisible().catch(() => false))) {
    await toggle.click();
    await drawer.waitFor({ state: "visible", timeout: 6_000 });
  }

  async function detectDevices() {
    await Promise.all([
      panel.locator('[data-testid="glass-detect-audio-devices"]').click(),
      command.evaluate(() => window.glass.send({ type: "probe-virtual-audio-devices" })),
    ]);
    await sleep(900);
  }

  await detectDevices();
  state = await pollUntil(async () => {
    const s = await readGlassState(command);
    return findBlackHoleDevice(s.virtualAudioDevices) ? s : null;
  }, 12_000);

  if (!state) state = await readGlassState(command);

  let device = findBlackHoleDevice(state.virtualAudioDevices);
  const savedId = state.selectedVirtualAudioDeviceId?.trim();
  if (!device && savedId) {
    device = state.virtualAudioDevices?.find((d) => d.deviceId === savedId);
    if (device) log(`  Using saved device: ${device.label}`);
  }

  if (!device?.deviceId) {
    await detectDevices();
    state = await readGlassState(command);
    device = findBlackHoleDevice(state.virtualAudioDevices);
  }

  if (!device?.deviceId) {
    const labels = (state.virtualAudioDevices ?? []).map((d) => d.label).join(", ") || "none";
    return {
      ok: false,
      category: "blackhole_no_signal",
      cause: `No BlackHole device found (detected: ${labels}).`,
      fix:
        "Install BlackHole 2ch, route Mac output through Multi-Output Device, then re-run. " +
        "Press play on your video while the harness runs.",
      state,
    };
  }

  if (state.selectedVirtualAudioDeviceId !== device.deviceId) {
    log(`  Selecting: ${device.label}`);
    await panel.locator('[data-testid="glass-system-audio-source-select"]').selectOption(device.deviceId);
    await sleep(400);
  }

  if (state.systemAudioStatus === "available") {
    log(`  System audio online (${device.label})`);
    return { ok: true, state, device };
  }

  log("  Testing signal — press play on your video if it is paused…");
  await Promise.all([
    panel.locator('[data-testid="glass-test-system-audio"]').click(),
    command.evaluate(() => window.glass.send({ type: "test-system-audio" })),
  ]);

  state = await pollUntil(async () => {
    const s = await readGlassState(command);
    return s.systemAudioStatus === "available" ? s : null;
  }, 8_000);

  if (!state) {
    await panel.locator('[data-testid="glass-test-system-audio"]').click();
    state = await pollUntil(async () => {
      const s = await readGlassState(command);
      return s.systemAudioStatus === "available" ? s : null;
    }, 6_000);
  }

  state = state ?? (await readGlassState(command));
  log(`  System audio status: ${state.systemAudioStatus ?? "unknown"}`);

  if (state.systemAudioStatus === "available") {
    return { ok: true, state, device };
  }

  if (state.systemAudioStatus === "requires_permission") {
    return {
      ok: false,
      category: "screen_capture_failed",
      cause: state.systemAudioDetail ?? "Screen/System Audio permission not granted to IIVO Glass.",
      fix:
        "Grant Screen Recording to IIVO Glass/Electron in System Settings → Privacy, then re-run.",
      state,
    };
  }

  return {
    ok: false,
    category: "blackhole_no_signal",
    cause: state.systemAudioDetail ?? `System audio not ready (status: ${state.systemAudioStatus}).`,
    fix: "Press play on your video, confirm Multi-Output Device includes BlackHole, then re-run.",
    state,
  };
}

async function clickListenMode({ command, panel, log }) {
  log("  3/3 Listen mode (immediate capture)…");
  await openCopilotTab(panel);
  const listenCard = panel.locator('[data-testid="glass-mode-card-listen"]');
  await listenCard.waitFor({ state: "visible", timeout: 8_000 });
  await listenCard.click({ force: true });

  const configureBtn = panel.locator('[data-testid="glass-configure-audio"]');
  if (await configureBtn.isVisible({ timeout: 1200 }).catch(() => false)) {
    log("  Listen prompted for audio setup — configuring…");
    await configureBtn.click();
    const audio = await ensureSystemAudioViaAudioTab({ command, panel, log });
    if (!audio.ok) return audio;
    await openCopilotTab(panel);
    await listenCard.click({ force: true });
  }

  await command.evaluate(() => {
    window.glass.send({ type: "transcription-set-mode", mode: "system_audio" });
  });

  // Panel click usually starts listening; if renderer state lags, arm capture once.
  await sleep(2_000);
  const afterClick = await readGlassState(command);
  if (!afterClick.privacy?.listening) {
    log("  … arming system_audio listen capture");
    await command.evaluate(() => {
      window.glass.send({ type: "transcription-set-mode", mode: "system_audio" });
      window.glass.send({ type: "request-start-listening" });
    });
  }

  return { ok: true };
}

export async function waitForNotesPadVisible({ browser, command, log, timeoutMs = 45_000 }) {
  log("  Waiting for IIVO Notes pad on screen…");
  const ready = await pollUntil(async () => {
    for (const ctx of browser.contexts()) {
      for (const page of ctx.pages()) {
        if (!page.url().includes("notes.html")) continue;
        const pad = page.locator('[data-testid="glass-notes-pad"]');
        if (await pad.isVisible().catch(() => false)) {
          return page;
        }
      }
    }
    const s = await readGlassState(command);
    if (s.privacy?.listening && s.listenLiveNotes) return true;
    return null;
  }, timeoutMs, 400);

  if (ready) {
    log("  ✓ IIVO Notes pad visible — ready for video");
    return true;
  }
  log("  ⚠ Notes pad not visible yet — opening video anyway");
  return false;
}

async function waitForListeningActive({ command, log }) {
  const state = await pollUntil(async () => {
    const s = await readGlassState(command);
    const elapsed = s.stt?.listeningElapsedMs ?? 0;
    if (s.privacy?.listening && elapsed >= 200 && s.transcriptionMode === "system_audio") {
      return s;
    }
    return null;
  }, 60_000, 500);

  if (!state) {
    const last = await readGlassState(command);
    const lastErr = last.stt?.lastError ?? last.lastError ?? "";
    if (lastErr) log(`  STT/status: ${lastErr}`);
  }
  return state;
}

/**
 * Fast automate: Connect IIVO Glass → audio backup → Copilot Listen → listening.
 * Open YouTube separately (before calling this) so you can press play during audio test.
 */
export async function automateListenMode({ command, dock, panel, endurance, log = console.log }) {
  log("Automating Listen mode (Connect → audio → Listen)…");

  const maxListeningMin = endurance?.maxListeningMinutes ?? 0;
  const attention = endurance?.attention ?? "balanced";

  await command.evaluate(
    ({ maxListeningMin, attention }) => {
      window.glass.send({ type: "stop-everything" });
      window.glass.send({ type: "copilot-set-mode", mode: "off" });
      window.glass.send({
        type: "copilot-set-config",
        patch: {
          maxListeningMin,
          listenAttentionLevel: attention,
        },
      });
    },
    { maxListeningMin, attention },
  );
  await sleep(150);

  await ensurePanelOpen(dock, panel);

  const connectResult = await connectIivoGlassViaSetup({ command, panel, log });
  if (!connectResult.ok) return connectResult;

  const audioConfig = await ensureSystemAudioViaAudioTab({ command, panel, log });
  if (!audioConfig.ok) return audioConfig;

  const listenClick = await clickListenMode({ command, panel, log });
  if (!listenClick.ok) return listenClick;

  const state = await waitForListeningActive({ command, log });
  if (!state) {
    const last = await readGlassState(command);
    return {
      ok: false,
      category: "system_audio_not_selected",
      cause: `Listening did not start (listening=${last.privacy?.listening}, elapsed=${last.stt?.listeningElapsedMs ?? 0}ms, systemAudio=${last.systemAudioStatus}).`,
      fix: "Press play on your video, confirm BlackHole routing, then re-run.",
      state: last,
    };
  }

  if (state.transcriptionMode?.startsWith("microphone")) {
    return {
      ok: false,
      category: "mic_accidentally_active",
      cause: "Transcription mode is microphone, not system_audio.",
      fix: "Listen mode must use computer audio only.",
      state,
    };
  }

  log("  Listen mode active · system_audio · mic off");
  return { ok: true, state };
}

/** Re-connect audio and re-arm Listen when transcript stalls during a long run. */
export async function attemptListenRecovery({ command, dock, panel, endurance, log = console.log }) {
  log("  [auto-fix] Transcript stalled — reconnecting audio and Listen…");
  await ensurePanelOpen(dock, panel);
  const audio = await ensureSystemAudioViaAudioTab({ command, panel, log });
  if (!audio.ok) return audio;
  const listen = await clickListenMode({ command, panel, log });
  if (!listen.ok) return listen;
  const state = await waitForListeningActive({ command, log });
  if (!state) {
    const last = await readGlassState(command);
    return {
      ok: false,
      category: "recovery_failed",
      cause: "Listen did not restart after auto-fix.",
      fix: "Check BlackHole routing and press play on the video.",
      state: last,
    };
  }
  log("  [auto-fix] Listen recovered");
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
  log("");
  log("  2. Harness opens YouTube immediately — press play while Glass configures.");
  log("");
  log("  3. BlackHole routing Mac audio — harness clicks Setup → Connect, Audio fallback, Copilot Listen.");
  log("");
  log("  AUTO MODE: Connect IIVO Glass, verify audio, Listen card, then capture.");
  log("");
  log("══════════════════════════════════════════════════════════════");
  log("");
}
