/**
 * Manual screen capture using Electron's desktopCapturer. Captures the primary
 * display at native resolution and returns a PNG data URL. Only ever called in
 * response to an explicit user action (Capture Screen / Send to IIVO).
 *
 * macOS note: requires Screen Recording permission
 * (System Settings -> Privacy & Security -> Screen Recording).
 */

import { desktopCapturer, screen } from "electron";

export interface CaptureResult {
  imageDataUrl: string;
  width: number;
  height: number;
  sourceName: string;
}

export async function capturePrimaryScreen(): Promise<CaptureResult> {
  const primary = screen.getPrimaryDisplay();
  const scale = primary.scaleFactor || 1;
  const width = Math.round(primary.size.width * scale);
  const height = Math.round(primary.size.height * scale);

  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width, height },
  });

  if (sources.length === 0) {
    throw new Error("No screen sources available for capture.");
  }

  // Prefer the source matching the primary display when ids are exposed.
  const primaryId = String(primary.id);
  const source =
    sources.find((s) => s.display_id === primaryId) ?? sources[0];

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
  };
}
