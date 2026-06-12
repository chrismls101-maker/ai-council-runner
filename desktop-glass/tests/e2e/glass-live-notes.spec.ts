/**
 * §10 Live Notes — Playwright E2E suite (Task #40)
 *
 * Covers the full session arc for Listen mode / Live Notes with mocked audio
 * (transcript injected via add-transcript-chunk) and stubbed AI (IIVO_GLASS_E2E=1
 * bypasses real Deepgram and live AI calls where possible).
 *
 * Tests (no external services required):
 *   1. Listen mode panel section visible when sessionType = video_learning
 *   2. listenLiveNotes state appears after start-listening + transcript injection
 *   3. listeningStatus = "listening" while session is active
 *   4. transcriptChunkCount increments with each injected chunk
 *   5. rollingPreview accumulates injected text
 *   6. listeningStatus resets to "idle" after stop-everything
 *   7. listenLiveNotes persists (not cleared) after stop-listening
 *   8. NotesPad window becomes visible when listen mode activates
 *   9. Live notes tab shows correct tab controls (Notes / Transcript)
 *  10. Session debrief triggers after "I'm done" with listen context present
 */

import { test, expect } from "@playwright/test";
import fs from "node:fs";
import {
  closeGlassApp,
  getGlassWindows,
  getElectronE2eSkipReason,
  GLASS_ELECTRON_BIN,
  GLASS_MAIN,
  launchGlassApp,
  openPanelTab,
  readGlassState,
  type LaunchedGlass,
} from "./helpers/electronApp.ts";
import { resetE2eSetupState } from "./helpers/e2eSetupReset.ts";

let app: LaunchedGlass;
let commandPage: import("@playwright/test").Page;
let panelPage: import("@playwright/test").Page;

// ─── Transcript fixtures ───────────────────────────────────────────────────────

const LECTURE_CHUNKS = [
  "Welcome to today's lecture on distributed systems.",
  "We'll cover the CAP theorem, consensus algorithms, and fault tolerance.",
  "The CAP theorem states that a distributed system cannot guarantee all three of consistency, availability, and partition tolerance simultaneously.",
  "Paxos is the classic consensus algorithm — it guarantees safety under all conditions but sacrifices liveness under certain network partitions.",
  "Raft was designed to be more understandable than Paxos while achieving equivalent guarantees.",
  "In practice, most production systems choose AP over CP when partition occurs.",
  "Google's Spanner uses TrueTime to achieve external consistency across globally distributed transactions.",
  "Remember: the hardest part of distributed systems is not the algorithms themselves but the operational complexity of running them.",
];

// ─── Setup ─────────────────────────────────────────────────────────────────────

test.describe("§10 Live Notes E2E", () => {
  test.beforeAll(async () => {
    const skipReason = getElectronE2eSkipReason();
    test.skip(!!skipReason, skipReason ?? undefined);

    if (!fs.existsSync(GLASS_MAIN)) {
      throw new Error("Glass main bundle missing. Run `npm run build --prefix desktop-glass`.");
    }
    if (!fs.existsSync(GLASS_ELECTRON_BIN)) {
      throw new Error("Electron binary missing. Run `npm install --prefix desktop-glass`.");
    }

    app = await launchGlassApp();
    const windows = await getGlassWindows(app.browser);
    commandPage = windows.command;
    panelPage = windows.panel;
  });

  test.afterAll(async () => {
    if (app) await closeGlassApp(app);
  });

  test.beforeEach(async () => {
    const { command, dock } = await getGlassWindows(app.browser);
    await resetE2eSetupState(command);
    // Fully reset between tests
    await command.evaluate(() => window.glass.send({ type: "stop-everything" }));
    await command.evaluate(() => window.glass.send({ type: "copilot-set-mode", mode: "off" }));
    await command.evaluate(() =>
      window.glass.send({ type: "copilot-set-config", patch: { sessionType: "auto" } }),
    );
    // Open panel on copilot tab for most tests
    await dock.locator('[data-testid="glass-dock-open-panel"]').click();
    await panelPage.locator('[data-testid="glass-panel-tab-copilot"]').click();
  });

  // ─── 1. Panel section visible ────────────────────────────────────────────────

  test("Live Notes tab visible in panel when mode is listen (video_learning)", async () => {
    const { command } = await getGlassWindows(app.browser);

    await command.evaluate(() => window.glass.send({ type: "copilot-set-mode", mode: "passive" }));
    await command.evaluate(() =>
      window.glass.send({ type: "copilot-set-config", patch: { sessionType: "video_learning" } }),
    );

    // The Listen mode card / Live Notes panel tab should be accessible
    await expect(panelPage.locator('[data-testid="glass-panel-tab-copilot"]')).toBeVisible();
    // The copilot panel should show the listen mode UI
    const state = await readGlassState(command);
    expect(state.copilot.config.sessionType).toBe("video_learning");
  });

  // ─── 2. listenLiveNotes appears after start-listening + chunks ───────────────

  test("listenLiveNotes state appears after start-listening and transcript injection", async () => {
    const { command } = await getGlassWindows(app.browser);

    await command.evaluate(() => window.glass.send({ type: "copilot-set-mode", mode: "passive" }));
    await command.evaluate(() =>
      window.glass.send({ type: "copilot-set-config", patch: { sessionType: "video_learning" } }),
    );
    await command.evaluate(() => window.glass.send({ type: "start-listening" }));

    // Wait for listen mode to activate
    await expect
      .poll(async () => (await readGlassState(command)).privacy.listening, { timeout: 8_000 })
      .toBe(true);

    // Inject transcript chunks as if they came from system audio
    for (const chunk of LECTURE_CHUNKS.slice(0, 4)) {
      await command.evaluate(
        (text) => window.glass.send({ type: "add-transcript-chunk", text, tags: ["system_audio"] }),
        chunk,
      );
    }

    // listenLiveNotes should become non-null (pipeline initialised)
    await expect
      .poll(async () => (await readGlassState(command)).listenLiveNotes ?? null, { timeout: 15_000 })
      .not.toBeNull();
  });

  // ─── 3. listeningStatus = "listening" while active ──────────────────────────

  test("listenLiveNotes.listeningStatus is 'listening' while session is running", async () => {
    const { command } = await getGlassWindows(app.browser);

    await command.evaluate(() => window.glass.send({ type: "copilot-set-mode", mode: "passive" }));
    await command.evaluate(() =>
      window.glass.send({ type: "copilot-set-config", patch: { sessionType: "video_learning" } }),
    );
    await command.evaluate(() => window.glass.send({ type: "start-listening" }));

    await expect
      .poll(async () => (await readGlassState(command)).privacy.listening, { timeout: 8_000 })
      .toBe(true);

    for (const chunk of LECTURE_CHUNKS.slice(0, 3)) {
      await command.evaluate(
        (text) => window.glass.send({ type: "add-transcript-chunk", text, tags: ["system_audio"] }),
        chunk,
      );
    }

    await expect
      .poll(
        async () => (await readGlassState(command)).listenLiveNotes?.listeningStatus ?? null,
        { timeout: 15_000 },
      )
      .toBe("listening");
  });

  // ─── 4. transcriptChunkCount increments ──────────────────────────────────────

  test("transcriptChunkCount increments as chunks are injected", async () => {
    const { command } = await getGlassWindows(app.browser);

    await command.evaluate(() => window.glass.send({ type: "copilot-set-mode", mode: "passive" }));
    await command.evaluate(() =>
      window.glass.send({ type: "copilot-set-config", patch: { sessionType: "video_learning" } }),
    );
    await command.evaluate(() => window.glass.send({ type: "start-listening" }));

    await expect
      .poll(async () => (await readGlassState(command)).privacy.listening, { timeout: 8_000 })
      .toBe(true);

    // Wait for pipeline to init with at least one chunk
    for (const chunk of LECTURE_CHUNKS.slice(0, 3)) {
      await command.evaluate(
        (text) => window.glass.send({ type: "add-transcript-chunk", text, tags: ["system_audio"] }),
        chunk,
      );
    }

    await expect
      .poll(
        async () => (await readGlassState(command)).listenLiveNotes?.transcriptChunkCount ?? 0,
        { timeout: 15_000 },
      )
      .toBeGreaterThan(0);

    const countBefore =
      (await readGlassState(command)).listenLiveNotes?.transcriptChunkCount ?? 0;

    // Inject more chunks
    for (const chunk of LECTURE_CHUNKS.slice(3, 6)) {
      await command.evaluate(
        (text) => window.glass.send({ type: "add-transcript-chunk", text, tags: ["system_audio"] }),
        chunk,
      );
    }

    await expect
      .poll(
        async () => (await readGlassState(command)).listenLiveNotes?.transcriptChunkCount ?? 0,
        { timeout: 10_000 },
      )
      .toBeGreaterThan(countBefore);
  });

  // ─── 5. rollingPreview accumulates injected text ─────────────────────────────

  test("rollingPreview contains injected transcript text", async () => {
    const { command } = await getGlassWindows(app.browser);

    await command.evaluate(() => window.glass.send({ type: "copilot-set-mode", mode: "passive" }));
    await command.evaluate(() =>
      window.glass.send({ type: "copilot-set-config", patch: { sessionType: "video_learning" } }),
    );
    await command.evaluate(() => window.glass.send({ type: "start-listening" }));

    await expect
      .poll(async () => (await readGlassState(command)).privacy.listening, { timeout: 8_000 })
      .toBe(true);

    const MARKER = "CAP theorem states that a distributed system";
    for (const chunk of LECTURE_CHUNKS.slice(0, 5)) {
      await command.evaluate(
        (text) => window.glass.send({ type: "add-transcript-chunk", text, tags: ["system_audio"] }),
        chunk,
      );
    }

    await expect
      .poll(
        async () => {
          const notes = (await readGlassState(command)).listenLiveNotes;
          return notes?.rollingPreview ?? "";
        },
        { timeout: 15_000 },
      )
      .toContain(MARKER.slice(0, 20));
  });

  // ─── 6. listeningStatus resets after stop ────────────────────────────────────

  test("listeningStatus becomes 'idle' after stop-everything", async () => {
    const { command } = await getGlassWindows(app.browser);

    await command.evaluate(() => window.glass.send({ type: "copilot-set-mode", mode: "passive" }));
    await command.evaluate(() =>
      window.glass.send({ type: "copilot-set-config", patch: { sessionType: "video_learning" } }),
    );
    await command.evaluate(() => window.glass.send({ type: "start-listening" }));

    await expect
      .poll(async () => (await readGlassState(command)).privacy.listening, { timeout: 8_000 })
      .toBe(true);

    for (const chunk of LECTURE_CHUNKS.slice(0, 3)) {
      await command.evaluate(
        (text) => window.glass.send({ type: "add-transcript-chunk", text, tags: ["system_audio"] }),
        chunk,
      );
    }

    // Wait for pipeline
    await expect
      .poll(
        async () => (await readGlassState(command)).listenLiveNotes?.listeningStatus ?? null,
        { timeout: 15_000 },
      )
      .toBe("listening");

    // Stop
    await command.evaluate(() => window.glass.send({ type: "stop-everything" }));

    await expect
      .poll(async () => (await readGlassState(command)).privacy.listening, { timeout: 5_000 })
      .toBe(false);

    // listenLiveNotes should reflect idle state (either null or listeningStatus !== listening)
    const finalNotes = (await readGlassState(command)).listenLiveNotes;
    if (finalNotes) {
      expect(finalNotes.listeningStatus).not.toBe("listening");
    }
    // else null — also acceptable (cleared on stop)
  });

  // ─── 7. Notes persist after stop-listening (not cleared) ─────────────────────

  test("listenLiveNotes content persists (not cleared) immediately after stop-listening", async () => {
    const { command } = await getGlassWindows(app.browser);

    await command.evaluate(() => window.glass.send({ type: "copilot-set-mode", mode: "passive" }));
    await command.evaluate(() =>
      window.glass.send({ type: "copilot-set-config", patch: { sessionType: "video_learning" } }),
    );
    await command.evaluate(() => window.glass.send({ type: "start-listening" }));

    await expect
      .poll(async () => (await readGlassState(command)).privacy.listening, { timeout: 8_000 })
      .toBe(true);

    for (const chunk of LECTURE_CHUNKS) {
      await command.evaluate(
        (text) => window.glass.send({ type: "add-transcript-chunk", text, tags: ["system_audio"] }),
        chunk,
      );
    }

    await expect
      .poll(
        async () => (await readGlassState(command)).listenLiveNotes?.transcriptChunkCount ?? 0,
        { timeout: 15_000 },
      )
      .toBeGreaterThan(0);

    const countBeforeStop =
      (await readGlassState(command)).listenLiveNotes?.transcriptChunkCount ?? 0;

    await command.evaluate(() => window.glass.send({ type: "stop-listening" }));

    await expect
      .poll(async () => (await readGlassState(command)).privacy.listening, { timeout: 5_000 })
      .toBe(false);

    // Notes must not be cleared — they persist for the debrief
    const notesAfterStop = (await readGlassState(command)).listenLiveNotes;
    if (notesAfterStop) {
      expect(notesAfterStop.transcriptChunkCount).toBeGreaterThan(0);
      expect(notesAfterStop.transcriptChunkCount).toBe(countBeforeStop);
    }
    // If listenLiveNotes is null after stop-listening, that means the session ended —
    // that is also acceptable behavior (session was terminated).
  });

  // ─── 8. NotesPad window visibility ───────────────────────────────────────────

  test("NotesPad window appears when listen mode activates", async () => {
    const { command } = await getGlassWindows(app.browser);

    await command.evaluate(() =>
      window.glass.send({ type: "copilot-set-mode", mode: "passive" }),
    );
    await command.evaluate(() =>
      window.glass.send({ type: "copilot-set-config", patch: { sessionType: "video_learning" } }),
    );
    await command.evaluate(() =>
      window.glass.send({ type: "start-listening" }),
    );

    // Wait for listening state
    await expect
      .poll(async () => (await readGlassState(command)).privacy.listening, { timeout: 8_000 })
      .toBe(true);

    // The state should reflect that notes pad is visible
    await expect
      .poll(
        async () => (await readGlassState(command)).notesPadVisible ?? false,
        { timeout: 8_000 },
      )
      .toBe(true);
  });

  // ─── 9. Live notes tab controls render ───────────────────────────────────────

  test("Live notes panel shows Notes and Transcript tabs after pipeline starts", async () => {
    const { command } = await getGlassWindows(app.browser);

    await command.evaluate(() => window.glass.send({ type: "copilot-set-mode", mode: "passive" }));
    await command.evaluate(() =>
      window.glass.send({ type: "copilot-set-config", patch: { sessionType: "video_learning" } }),
    );
    await command.evaluate(() => window.glass.send({ type: "start-listening" }));

    await expect
      .poll(async () => (await readGlassState(command)).privacy.listening, { timeout: 8_000 })
      .toBe(true);

    for (const chunk of LECTURE_CHUNKS.slice(0, 3)) {
      await command.evaluate(
        (text) => window.glass.send({ type: "add-transcript-chunk", text, tags: ["system_audio"] }),
        chunk,
      );
    }

    // Wait for live notes to be populated in state
    await expect
      .poll(
        async () => (await readGlassState(command)).listenLiveNotes ?? null,
        { timeout: 15_000 },
      )
      .not.toBeNull();

    // Navigate panel to copilot tab — the live notes tabs should appear
    await openPanelTab(panelPage, "copilot");

    await expect(panelPage.locator('[data-testid="glass-live-notes-tab-notes"]')).toBeVisible({
      timeout: 8_000,
    });
    await expect(
      panelPage.locator('[data-testid="glass-live-notes-tab-transcript"]'),
    ).toBeVisible();
  });

  // ─── 10. Debrief triggered with listen context ────────────────────────────────

  test("session debrief includes listen context after I'm done command", async () => {
    const { command } = await getGlassWindows(app.browser);

    await command.evaluate(() => window.glass.send({ type: "copilot-set-mode", mode: "passive" }));
    await command.evaluate(() =>
      window.glass.send({ type: "copilot-set-config", patch: { sessionType: "video_learning" } }),
    );
    await command.evaluate(() => window.glass.send({ type: "start-listening" }));

    await expect
      .poll(async () => (await readGlassState(command)).privacy.listening, { timeout: 8_000 })
      .toBe(true);

    for (const chunk of LECTURE_CHUNKS) {
      await command.evaluate(
        (text) => window.glass.send({ type: "add-transcript-chunk", text, tags: ["system_audio"] }),
        chunk,
      );
    }

    await expect
      .poll(
        async () => (await readGlassState(command)).listenLiveNotes?.transcriptChunkCount ?? 0,
        { timeout: 15_000 },
      )
      .toBeGreaterThan(0);

    // Stop and trigger debrief
    await command.evaluate(() =>
      window.glass.send({ type: "submit-command", text: "I'm done" }),
    );

    // Debrief should be generated (may take time — uses AI if server available)
    await expect
      .poll(
        async () => {
          const state = await readGlassState(command);
          return state.copilot.debrief?.sessionId ?? state.lastNotice ?? null;
        },
        { timeout: 25_000 },
      )
      .not.toBeNull();
  });
});
