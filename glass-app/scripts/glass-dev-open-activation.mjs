#!/usr/bin/env node
/**
 * Open the Anthropic key activation window on a running dev Glass instance (CDP :19222).
 *
 * Usage (Glass must already be running):
 *   npm run glass:dev              # repo root — start Glass
 *   npm run glass:dev:activation   # repo root — open activation screen
 *
 *   cd glass-app && npm run dev
 *   cd glass-app && npm run dev:activation
 *
 * Fallback — paste in any Glass DevTools console:
 *   window.glass.send({ type: "dev-open-activation" })
 */

import { get as httpGet } from "node:http";
import { chromium } from "@playwright/test";

const CDP_URL = "http://127.0.0.1:19222";
const CDP_WAIT_MS = 20_000;

function cdpReachable() {
  return new Promise((resolve) => {
    const req = httpGet(`${CDP_URL}/json/version`, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForCdp(timeoutMs = CDP_WAIT_MS) {
  const deadline = Date.now() + timeoutMs;
  process.stdout.write("Waiting for Glass on CDP :19222");
  while (Date.now() < deadline) {
    if (await cdpReachable()) {
      process.stdout.write("\n");
      return true;
    }
    process.stdout.write(".");
    await new Promise((r) => setTimeout(r, 400));
  }
  process.stdout.write("\n");
  return false;
}

async function findCommandPage(browser) {
  for (const context of browser.contexts()) {
    for (const page of context.pages()) {
      const url = page.url();
      if (url.includes("overlay.html") || url.includes("panel.html") || url.includes("dock.html")) {
        return page;
      }
    }
  }
  return null;
}

function printHelp() {
  console.error(
    "Could not connect to Glass on CDP port 19222.\n\n" +
      "Start Glass first (keep it running in another terminal):\n" +
      "  npm run glass:dev              # from repo root\n" +
      "  cd glass-app && npm run dev\n\n" +
      "Then open activation:\n" +
      "  npm run glass:dev:activation   # from repo root\n" +
      "  cd glass-app && npm run dev:activation\n\n" +
      "Fallback — DevTools console on any Glass window:\n" +
      '  window.glass.send({ type: "dev-open-activation" })',
  );
}

async function main() {
  if (!(await waitForCdp())) {
    printHelp();
    process.exit(1);
  }

  let browser;
  try {
    browser = await chromium.connectOverCDP(CDP_URL);
  } catch {
    printHelp();
    process.exit(1);
  }

  try {
    const page = await findCommandPage(browser);
    if (!page) {
      console.error("Connected to Glass but no renderer page was found.");
      process.exit(1);
    }

    await page.evaluate(() => {
      window.glass.send({ type: "dev-open-activation" });
    });

    console.log("Activation window opened — Connect your AI key setup screen.");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
