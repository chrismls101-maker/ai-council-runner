#!/usr/bin/env node
/**
 * Verify Sorting Hat TTS path over CDP — Glass must be running on :19222.
 */
import { chromium } from "@playwright/test";

const CDP_URL = "http://127.0.0.1:19222";

async function findOverlayPage(browser) {
  for (const context of browser.contexts()) {
    for (const page of context.pages()) {
      if (page.url().includes("overlay.html")) return page;
    }
  }
  return null;
}

async function main() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const overlay = await findOverlayPage(browser);
  if (!overlay) {
    console.error("FAIL: overlay.html not found");
    process.exit(1);
  }

  const logs = [];
  overlay.on("console", (msg) => {
    const t = msg.text();
    if (t.includes("SortingHat") || t.includes("TTS") || t.includes("ElevenLabs")) {
      logs.push(t);
    }
  });

  await overlay.evaluate(() => {
    window.glass.send({ type: "dev-open-onboarding" });
  });

  console.log("Opened Sorting Hat — waiting ~35s for substrate + first TTS line…");
  await new Promise((r) => setTimeout(r, 35_000));

  const hasMp3Playing = logs.some((l) => l.includes("ElevenLabs MP3 playing"));
  const hasRobot = logs.some((l) => l.includes("browser speech") || l.includes("speechSynthesis"));
  const hasSilent = logs.some((l) => l.includes("TTS skipped"));
  const hasPlayFail = logs.some((l) => l.includes("audio.play failed"));

  console.log("\n--- overlay console (TTS-related) ---");
  for (const l of logs) console.log(l);
  if (logs.length === 0) console.log("(none captured — check Glass main terminal for [Glass TTS] lines)");

  await browser.close();

  if (hasRobot) {
    console.error("\nFAIL: robot speechSynthesis fallback still fired");
    process.exit(1);
  }
  if (hasMp3Playing) {
    console.log("\nPASS: ElevenLabs MP3 playback started in overlay");
    process.exit(0);
  }
  if (hasSilent || hasPlayFail) {
    console.error("\nFAIL: TTS failed silently — check main process [Glass TTS] logs");
    process.exit(1);
  }
  console.warn("\nINCONCLUSIVE: no TTS console lines in overlay — verify [Glass TTS] in Glass terminal");
  process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
