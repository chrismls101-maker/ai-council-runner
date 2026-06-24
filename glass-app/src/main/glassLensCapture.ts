/**
 * IIVO Lens — capture active Chrome tab URL/title/text; display screenshot via IPC.
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { WebContents } from "electron";
import type { GlassLensCaptureResult, GlassLensScreenshotResult } from "../shared/glassLensContext.ts";
import { captureDisplayById } from "./capture.ts";
import { resolveCaptureDisplay } from "./displayRegistry.ts";
import { optimizeVisualAskImage } from "./visualImageOptimizer.ts";
import type { GlassUserSettings } from "../shared/glassSettings.ts";
import {
  hideGlassWindowsForCapture,
  restoreGlassWindowsAfterCapture,
} from "./windows.ts";

const CAPTURE_HIDE_SETTLE_MS = 150;

export type GlassLensScreenshotCaptureControl = {
  hideForCapture: (excludeWebContents?: WebContents) => Promise<void>;
  restoreAfterCapture: () => Promise<void>;
};

const execAsync = promisify(exec);

export async function captureGlassLensPage(
  displayTarget: GlassUserSettings["displayTarget"],
): Promise<GlassLensCaptureResult> {
  try {
    const { stdout: url } = await execAsync(
      `osascript -e 'tell application "Google Chrome" to get URL of active tab of front window'`,
    );
    const trimmedUrl = url.trim();
    const { stdout: title } = await execAsync(
      `osascript -e 'tell application "Google Chrome" to get title of active tab of front window'`,
    );

    let text = "";
    if (trimmedUrl.startsWith("http://") || trimmedUrl.startsWith("https://")) {
      const response = await fetch(trimmedUrl, { signal: AbortSignal.timeout(8000) });
      const html = await response.text();
      text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 5000);
    }

    return {
      url: trimmedUrl,
      text,
      title: title.trim(),
    };
  } catch (e) {
    return { url: "", text: "", title: "", error: String(e) };
  }
}

export async function captureGlassLensScreenshot(
  displayTarget: GlassUserSettings["displayTarget"],
  captureControl?: GlassLensScreenshotCaptureControl,
): Promise<GlassLensScreenshotResult> {
  const hideForCapture =
    captureControl?.hideForCapture ??
    (async (excludeWebContents?: WebContents) => {
      hideGlassWindowsForCapture(excludeWebContents);
    });
  const restoreAfterCapture =
    captureControl?.restoreAfterCapture ??
    (async () => {
      restoreGlassWindowsAfterCapture();
    });

  try {
    await hideForCapture();
    await new Promise((resolve) => setTimeout(resolve, CAPTURE_HIDE_SETTLE_MS));
    const captureTarget = resolveCaptureDisplay(displayTarget);
    const capture = await captureDisplayById(captureTarget.id, captureTarget.label);
    const optimized = optimizeVisualAskImage(capture.imageDataUrl, { width: 0, height: 0 }, {
      preset: "text",
      displayId: captureTarget.id,
    });
    return { screenshot: optimized.imageDataUrl };
  } catch (e) {
    return { error: String(e) };
  } finally {
    await restoreAfterCapture();
  }
}
