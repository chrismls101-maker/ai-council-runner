#!/usr/bin/env node
/**
 * Wait for the Vite dev server, then open the app in Cursor's embedded Simple Browser.
 * Falls back to the system default browser if Cursor is unavailable.
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";

const URL = process.env.DEV_PREVIEW_URL ?? "http://localhost:5173";
const MAX_WAIT_MS = 60_000;

async function waitForUrl(url) {
  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      /* server still starting */
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return false;
}

function activateCursor() {
  try {
    execFileSync("open", ["-a", "Cursor"], { stdio: "ignore" });
  } catch {
    /* Cursor not installed */
  }
}

function tryOpenCursorSimpleBrowser(url) {
  const vscodeUri = `vscode://vscode.simple-browser/show?url=${encodeURIComponent(url)}`;
  const cursorBins = [
    "/Applications/Cursor.app/Contents/Resources/app/bin/cursor",
    "/Applications/Cursor.app/Contents/MacOS/Cursor",
  ];

  activateCursor();

  for (const bin of cursorBins) {
    if (!existsSync(bin)) continue;
    try {
      spawn(
        bin,
        ["--reuse-window", "--open-url", vscodeUri],
        { detached: true, stdio: "ignore", cwd: process.cwd() },
      ).unref();
      return true;
    } catch {
      /* try next */
    }
  }

  try {
    execFileSync("open", ["-a", "Cursor", vscodeUri], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function openPreview(url) {
  if (tryOpenCursorSimpleBrowser(url)) {
    console.log(`[dev-preview] Opened ${url} in Cursor Simple Browser`);
    // Cursor sometimes needs a second nudge before the preview tab appears.
    setTimeout(() => {
      tryOpenCursorSimpleBrowser(url);
    }, 1200);
    return;
  }

  try {
    execFileSync("open", [url], { stdio: "ignore" });
    console.log(`[dev-preview] Opened ${url} in your default browser`);
  } catch {
    console.log(`[dev-preview] Dev server ready at ${url}`);
  }
}

const ready = await waitForUrl(URL);
if (!ready) {
  console.warn(`[dev-preview] Timed out waiting for ${URL}`);
  process.exit(0);
}

openPreview(URL);
