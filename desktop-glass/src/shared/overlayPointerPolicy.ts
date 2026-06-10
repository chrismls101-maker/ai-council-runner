/**
 * Overlay pointer policy — feed chat cards use hover-to-interact so the fullscreen
 * overlay stays click-through and does not block the dock / command bar.
 */

import type { GlassNotificationView } from "./glassNotifications.ts";

export function overlayFeedNotificationActive(
  notification: GlassNotificationView | null,
): boolean {
  return notification?.source === "feed";
}

/** Transient status lines (e.g. "Stopped") — click-through except on the pill. */
export function overlayNoticeNotificationActive(
  notification: GlassNotificationView | null,
): boolean {
  return notification?.source === "notice";
}

/** Modal-style notifications (update, copilot prompt) capture the overlay. */
export function overlayRequiresAlwaysInteractive(input: {
  updateOnly: boolean;
  copilotPrompt: boolean;
  passiveNoticeOnly: boolean;
}): boolean {
  void input.passiveNoticeOnly;
  return input.updateOnly || input.copilotPrompt;
}

export function overlayShouldEnableClickThrough(input: {
  overlayContentVisible: boolean;
  feedNotificationActive: boolean;
  noticeNotificationActive?: boolean;
  interactiveCount: number;
  alwaysInteractive: boolean;
  translateFocusActive?: boolean;
}): boolean {
  if (input.alwaysInteractive) return false;
  if (input.translateFocusActive) {
    return input.interactiveCount === 0;
  }
  if (input.noticeNotificationActive && input.interactiveCount === 0) return true;
  if (input.feedNotificationActive && input.interactiveCount === 0) return true;
  if (!input.overlayContentVisible && !input.feedNotificationActive) return true;
  if (input.overlayContentVisible && input.interactiveCount === 0) return true;
  return false;
}

export function nextOverlayInteractiveCount(current: number, delta: 1 | -1): number {
  if (delta === 1) return current + 1;
  return Math.max(0, current - 1);
}
