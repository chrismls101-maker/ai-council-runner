#!/usr/bin/env node
/**
 * Open Sorting Hat onboarding on a running dev Glass instance (CDP :19222).
 *
 * Usage (Glass must already be running):
 *   npm run glass:dev          # repo root — start Glass
 *   npm run glass:dev:onboarding # repo root — open Sorting Hat
 *
 *   cd desktop-glass && npm run dev
 *   cd desktop-glass && npm run dev:onboarding
 *
 * Fallback — paste in any Glass DevTools console:
 *   window.glass.send({ type: "dev-open-onboarding" })
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

async function findOverlayPage(browser) {
  for (const context of browser.contexts()) {
    for (const page of context.pages()) {
      if (page.url().includes("overlay.html")) {
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
      "  cd desktop-glass && npm run dev\n\n" +
      "Then open onboarding:\n" +
      "  npm run glass:dev:onboarding   # from repo root\n" +
      "  cd desktop-glass && npm run dev:onboarding\n\n" +
      "Note: npm run dev at repo root starts the web app, not Glass.\n\n" +
      "Fallback — DevTools console on any Glass window:\n" +
      "  window.glass.send({ type: \"dev-open-onboarding\" })",
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
    const overlay = await findOverlayPage(browser);
    if (!overlay) {
      console.error("Connected to Glass but overlay.html was not found.");
      process.exit(1);
    }

    await overlay.evaluate(() => {
      window.glass.send({ type: "dev-open-onboarding" });
    });

    console.log("Sorting Hat opened — 8s manifest delay before IIVO speaks.");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
