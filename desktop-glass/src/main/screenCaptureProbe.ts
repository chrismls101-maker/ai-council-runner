/**
 * Single screen capture probe used by setup check, diagnostics, and visual ask preflight.
 */

import {
  deriveScreenCaptureStatusFromProbe,
} from "../shared/captureSourceEnumeration.ts";
import type { ScreenCaptureProbeSnapshot } from "../shared/screenCaptureProbe.ts";
import { probeDesktopCaptureSources } from "./captureSourceProbe.ts";

export async function runScreenCaptureProbe(displayId: number): Promise<ScreenCaptureProbeSnapshot> {
  const probe = await probeDesktopCaptureSources({
    kind: "screen",
    types: ["screen"],
    displayId,
  });
  const derived = deriveScreenCaptureStatusFromProbe(probe);
  return {
    displayId,
    probe,
    status: derived.status,
    detail: derived.detail,
    ready: derived.status === "ready",
  };
}
