/**
 * Main-process desktopCapturer enumeration probes (video-only, separate kinds).
 */

import { desktopCapturer, screen } from "electron";
import type {
  CaptureSourceProbeKind,
  CaptureSourceProbeResult,
  DesktopCaptureSourceType,
} from "../shared/captureSourceEnumeration.ts";
import { redactCaptureSources } from "../shared/captureSourceEnumeration.ts";

const THUMB_SIZE = { width: 64, height: 64 };

function e2eSimulateEnumerationFailure(kind: CaptureSourceProbeKind): string | null {
  if (process.env.IIVO_GLASS_E2E !== "1") return null;
  if (
    kind === "screen" ||
    kind === "screen_and_window" ||
    kind === "system_audio_screen"
  ) {
    if (process.env.IIVO_GLASS_E2E_SCREEN_ENUM_FAIL === "1") {
      return "Failed to get sources.";
    }
  }
  if (kind === "system_audio_screen" && process.env.IIVO_GLASS_E2E_SYSTEM_AUDIO_ENUM_FAIL === "1") {
    return "Failed to get sources.";
  }
  return null;
}

export async function probeDesktopCaptureSources(input: {
  kind: CaptureSourceProbeKind;
  types: DesktopCaptureSourceType[];
  displayId?: number;
}): Promise<CaptureSourceProbeResult> {
  const simulated = e2eSimulateEnumerationFailure(input.kind);
  if (simulated) {
    return {
      kind: input.kind,
      types: input.types,
      ok: false,
      sourceCount: 0,
      sources: [],
      selectedDisplayId: input.displayId,
      errorName: "Error",
      errorMessage: simulated,
    };
  }

  if (process.env.IIVO_GLASS_E2E === "1" && process.env.IIVO_GLASS_E2E_CAPTURE_FAIL !== "1") {
    const display =
      input.displayId != null
        ? screen.getAllDisplays().find((d) => d.id === input.displayId) ?? screen.getPrimaryDisplay()
        : screen.getPrimaryDisplay();
    return {
      kind: input.kind,
      types: input.types,
      ok: true,
      sourceCount: 1,
      sources: [{ id: "e2e-screen", name: "E2E Display", displayId: String(display.id) }],
      selectedDisplayId: display.id,
      matchedDisplayId: String(display.id),
      thumbnailEmpty: false,
    };
  }

  if (process.env.IIVO_GLASS_E2E_CAPTURE_FAIL === "1" && input.types.includes("screen")) {
    return {
      kind: input.kind,
      types: input.types,
      ok: true,
      sourceCount: 1,
      sources: [{ id: "e2e-screen", name: "E2E Display" }],
      selectedDisplayId: input.displayId,
      thumbnailEmpty: true,
    };
  }

  const display =
    input.displayId != null
      ? screen.getAllDisplays().find((d) => d.id === input.displayId) ?? screen.getPrimaryDisplay()
      : screen.getPrimaryDisplay();

  try {
    const sources = await desktopCapturer.getSources({
      types: input.types,
      thumbnailSize: THUMB_SIZE,
      fetchWindowIcons: false,
    });
    const redacted = redactCaptureSources(sources);
    let thumbnailEmpty: boolean | undefined;
    let matchedDisplayId: string | undefined;

    if (input.types.includes("screen") && sources.length > 0) {
      const targetId = String(display.id);
      const source = sources.find((s) => s.display_id === targetId) ?? sources[0];
      matchedDisplayId = source.display_id;
      thumbnailEmpty = source.thumbnail.isEmpty();
    }

    return {
      kind: input.kind,
      types: input.types,
      ok: true,
      sourceCount: sources.length,
      sources: redacted,
      selectedDisplayId: display.id,
      matchedDisplayId,
      thumbnailEmpty,
    };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return {
      kind: input.kind,
      types: input.types,
      ok: false,
      sourceCount: 0,
      sources: [],
      selectedDisplayId: display.id,
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
    };
  }
}
