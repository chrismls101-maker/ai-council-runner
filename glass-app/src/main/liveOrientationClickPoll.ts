/**
 * Glass Guide — click tracking for stuck detection.
 *
 * Uses the multi-subscriber CGEventTap monitor (glassTypingKeystrokeMonitor)
 * exclusively. The old fallback that invoked the Swift *compiler* (`swift -e`)
 * every 220ms burned hundreds of ms of CPU per tick and is intentionally gone —
 * when the event tap is unavailable (missing binary or Input Monitoring
 * permission), click-based stuck signals are simply off.
 */

import {
  clickMonitorAvailable,
  onTypingKeystrokeMonitorExit,
  subscribeClickMonitor,
} from "./glassTypingKeystrokeMonitor.ts";
import { recordOrientationClick } from "./liveOrientationStuckDetector.ts";
import { isOrientationSessionActive } from "./liveOrientationPresenter.ts";
import { isStuckDetectorHoverWatching } from "./liveOrientationStuckDetector.ts";

let clickUnsubscribe: (() => void) | null = null;
let monitorExitUnsubscribe: (() => void) | null = null;
let guideEnabled = false;

function clickWatchNeeded(): boolean {
  return guideEnabled && (
    isOrientationSessionActive() || isStuckDetectorHoverWatching()
  );
}

function syncClickListening(): void {
  if (!guideEnabled) {
    clickUnsubscribe?.();
    clickUnsubscribe = null;
    monitorExitUnsubscribe?.();
    monitorExitUnsubscribe = null;
    return;
  }

  if (clickMonitorAvailable() && !clickUnsubscribe) {
    clickUnsubscribe = subscribeClickMonitor("glass-guide", (x, y) => {
      if (!clickWatchNeeded()) return;
      recordOrientationClick(x, y);
    });
    if (!monitorExitUnsubscribe) {
      monitorExitUnsubscribe = onTypingKeystrokeMonitorExit(() => {
        syncClickListening();
      });
    }
  }
}

/** Enable Glass Guide click tracking (records only during session or hover watch). */
export function startOrientationClickPoll(): void {
  if (guideEnabled) return;
  guideEnabled = true;
  syncClickListening();
}

export function stopOrientationClickPoll(): void {
  guideEnabled = false;
  clickUnsubscribe?.();
  clickUnsubscribe = null;
  monitorExitUnsubscribe?.();
  monitorExitUnsubscribe = null;
}

/** Re-evaluate click listening (session active or hover watch changed). */
export function syncOrientationClickWatch(): void {
  if (!guideEnabled) return;
  syncClickListening();
}
