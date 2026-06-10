/**
 * Deterministic Lens IPC responses for Playwright E2E (no Chrome / display capture).
 */

import type { GlassLensCaptureResult, GlassLensScreenshotResult } from "../shared/glassLensContext.ts";

export const GLASS_LENS_E2E_CAPTURE: GlassLensCaptureResult = {
  url: "https://example.com/test-page",
  title: "Test Page Title",
  text: "Test page content about artificial intelligence and machine learning.",
};

export const GLASS_LENS_E2E_SCREENSHOT: GlassLensScreenshotResult = {
  screenshot:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
};

export function glassLensCaptureForE2e(): GlassLensCaptureResult {
  return { ...GLASS_LENS_E2E_CAPTURE };
}

export function glassLensScreenshotForE2e(): GlassLensScreenshotResult {
  return { ...GLASS_LENS_E2E_SCREENSHOT };
}
