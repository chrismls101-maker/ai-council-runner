/**
 * Single bottom-center Glass notification queue (shared presenter).
 */

import type { GlassCommandFeedItem } from "./commandFeed.ts";
import { pickOverlayChatFeedItem, resolveOverlayChatPrompt } from "./commandFeed.ts";

export type GlassNotificationSource = "error" | "notice" | "feed" | "toast";

export interface GlassNotificationView {
  id: string;
  source: GlassNotificationSource;
  message: string;
  title?: string;
  feedItem?: GlassCommandFeedItem;
  userPrompt?: string;
  isError: boolean;
}

export function pickGlassNotification(input: {
  lastError?: string;
  lastNotice?: string;
  feedItems: GlassCommandFeedItem[];
  toastMessage?: string;
  toastTone?: "success" | "capture" | "listen";
}): GlassNotificationView | null {
  const error = input.lastError?.trim();
  if (error) {
    return {
      id: "last-error",
      source: "error",
      message: error,
      title: "Error",
      isError: true,
    };
  }

  const feed = pickOverlayChatFeedItem(input.feedItems);
  if (feed) {
    return {
      id: `feed-${feed.id}`,
      source: "feed",
      message: feed.body,
      title: feed.title ?? feed.kind,
      feedItem: feed,
      userPrompt: resolveOverlayChatPrompt(feed, input.feedItems),
      isError: feed.kind === "error",
    };
  }

  const toast = input.toastMessage?.trim();
  if (toast) {
    return {
      id: `toast-${toast.slice(0, 24)}`,
      source: "toast",
      message: toast,
      isError: false,
    };
  }

  const notice = input.lastNotice?.trim();
  if (notice) {
    return {
      id: "last-notice",
      source: "notice",
      message: notice,
      title: notice.startsWith("Setup check:") ? "Setup check" : undefined,
      isError: false,
    };
  }

  return null;
}

export function shouldRaiseOverlayForNotifications(input: {
  lastError?: string;
  lastNotice?: string;
  commandFeedLength: number;
  rendererNotificationActive?: boolean;
}): boolean {
  return (
    Boolean(input.lastError?.trim()) ||
    Boolean(input.lastNotice?.trim()) ||
    input.commandFeedLength > 0 ||
    Boolean(input.rendererNotificationActive)
  );
}
