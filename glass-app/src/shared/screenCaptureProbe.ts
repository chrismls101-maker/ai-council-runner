/**
 * Unified screen capture probe result (Setup, diagnostics, visual ask preflight).
 */

import type { CaptureSourceProbeResult } from "./captureSourceEnumeration.ts";
import type { ScreenCaptureProbeStatus } from "./captureSourceEnumeration.ts";

export interface ScreenCaptureProbeSnapshot {
  displayId: number;
  probe: CaptureSourceProbeResult;
  status: ScreenCaptureProbeStatus;
  detail?: string;
  ready: boolean;
}

export const DUPLICATE_APP_CAPTURE_FAILURE_MESSAGE =
  "Screen permission probe succeeded but capture failed. You may be running a different IIVO Glass.app than the one granted in System Settings (for example mac-arm64 vs mac-universal). Run Capture Diagnostics and grant Screen Recording to the exact app path shown.";

export function isScreenCaptureProbeReady(snapshot: ScreenCaptureProbeSnapshot): boolean {
  return snapshot.ready && snapshot.status === "ready";
}

export function formatScreenCaptureProbeDebug(snapshot: ScreenCaptureProbeSnapshot): string {
  const p = snapshot.probe;
  return [
    `preflightProbeResult=${snapshot.status}`,
    `thumbnailEmpty=${p.thumbnailEmpty ?? "n/a"}`,
    `sourceCount=${p.sourceCount}`,
    `displayId=${snapshot.displayId}`,
    p.errorMessage ? `probeError=${p.errorMessage}` : null,
  ]
    .filter(Boolean)
    .join("; ");
}
