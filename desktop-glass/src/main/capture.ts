/**
 * Manual screen capture using Electron's desktopCapturer. Captures a specific
 * display at native resolution and returns a PNG data URL. Only ever called in
 * response to an explicit user action (Capture Screen / Send to IIVO).
 *
 * macOS note: requires Screen Recording permission
 * (System Settings -> Privacy & Security -> Screen Recording).
 */

import { desktopCapturer, screen } from "electron";

/** 1×1 PNG for Electron E2E (no Screen Recording permission required). */
const E2E_STUB_IMAGE_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export interface CaptureResult {
  imageDataUrl: string;
  width: number;
  height: number;
  sourceName: string;
  displayId: number;
  displayLabel: string;
}

export async function captureDisplayById(
  displayId: number,
  displayLabel: string,
): Promise<CaptureResult> {
  if (process.env.IIVO_GLASS_E2E === "1") {
    return {
      imageDataUrl: E2E_STUB_IMAGE_DATA_URL,
      width: 1,
      height: 1,
      sourceName: "E2E Test Display",
      displayId,
      displayLabel,
    };
  }

  const display =
    screen.getAllDisplays().find((d) => d.id === displayId) ?? screen.getPrimaryDisplay();
  const scale = display.scaleFactor || 1;
  const width = Math.round(display.size.width * scale);
  const height = Math.round(display.size.height * scale);

  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width, height },
  });

  if (sources.length === 0) {
    throw new Error("No screen sources available for capture.");
  }

  const targetId = String(display.id);
  const source = sources.find((s) => s.display_id === targetId) ?? sources[0];

  const image = source.thumbnail;
  if (image.isEmpty()) {
    throw new Error(
      "Screen capture returned an empty image. On macOS, grant Screen Recording permission to IIVO Glass.",
    );
  }

  const size = image.getSize();
  return {
    imageDataUrl: image.toDataURL(),
    width: size.width,
    height: size.height,
    sourceName: source.name,
    displayId: display.id,
    displayLabel,
  };
}

/** @deprecated Use captureDisplayById with the active Glass display. */
export async function capturePrimaryScreen(): Promise<CaptureResult> {
  const primary = screen.getPrimaryDisplay();
  return captureDisplayById(primary.id, "Primary Display");
}
