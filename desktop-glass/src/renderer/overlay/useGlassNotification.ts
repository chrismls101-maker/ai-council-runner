import { useEffect, useRef, useState } from "react";
import type { GlassState } from "../../shared/ipc.ts";
import type { GlassCommandFeedItem } from "../../shared/commandFeed.ts";
import { filterFeedToSingleListenCard } from "../../shared/listenCardState.ts";
import { isOverlayChatFeedKind } from "../../shared/commandFeed.ts";
import {
  pickGlassNotification,
  type GlassNotificationView,
} from "../../shared/glassNotifications.ts";
import { send } from "../useGlassState.ts";

const NON_CHAT_FEED_TTL_MS = 12_000;
const TOAST_TTL_MS = 5_000;
const CHAT_AUTO_DISMISS_MS = 17_000;
const CHAT_FADE_MS = 380;
const MAX_VISIBLE_FEED = 5;

type ToastTone = "info" | "success" | "capture" | "listen";

type QueuedToast = {
  id: string;
  message: string;
  tone: ToastTone;
};

function useVisibleCommandFeed(state: GlassState, enabled: boolean): GlassCommandFeedItem[] {
  const [aged, setAged] = useState<Set<string>>(new Set());
  const seenRef = useRef<Set<string>>(new Set());
  const seededRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const feed = state.commandFeed ?? [];

    if (!seededRef.current) {
      const preexisting = new Set<string>();
      for (const item of feed) {
        seenRef.current.add(item.id);
        if (!item.pinned) preexisting.add(item.id);
      }
      if (preexisting.size > 0) setAged((prev) => new Set([...prev, ...preexisting]));
      seededRef.current = true;
      return;
    }

    for (const item of feed) {
      if (seenRef.current.has(item.id)) continue;
      seenRef.current.add(item.id);
      if (item.pinned || isOverlayChatFeedKind(item.kind)) continue;
      const id = item.id;
      window.setTimeout(() => {
        setAged((prev) => new Set(prev).add(id));
      }, NON_CHAT_FEED_TTL_MS);
    }
  }, [enabled, state.commandFeed]);

  if (!enabled) return [];
  const visible = (state.commandFeed ?? [])
    .filter((item) => item.pinned || isOverlayChatFeedKind(item.kind) || !aged.has(item.id))
    .slice(-MAX_VISIBLE_FEED);
  return filterFeedToSingleListenCard(visible);
}

function useToastQueue(state: GlassState, enabled: boolean): QueuedToast | null {
  const [active, setActive] = useState<QueuedToast | null>(null);
  const activeRef = useRef<QueuedToast | null>(null);
  const queueRef = useRef<QueuedToast[]>([]);
  const seenMomentsRef = useRef<Set<string>>(new Set());
  const seededMomentsRef = useRef(false);
  const wasListeningRef = useRef(false);
  const wasCapturingRef = useRef(false);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const enqueue = (message: string, tone: ToastTone): void => {
    const toast: QueuedToast = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      message,
      tone,
    };
    if (!activeRef.current && queueRef.current.length === 0) {
      setActive(toast);
      return;
    }
    queueRef.current.push(toast);
  };

  useEffect(() => {
    if (!active) return;
    const id = active.id;
    const timer = window.setTimeout(() => {
      setActive((current) => (current?.id === id ? null : current));
    }, TOAST_TTL_MS);
    return () => window.clearTimeout(timer);
  }, [active]);

  useEffect(() => {
    if (active || queueRef.current.length === 0) return;
    const next = queueRef.current.shift() ?? null;
    if (next) setActive(next);
  }, [active]);

  useEffect(() => {
    if (!enabled) return;
    if (!seededMomentsRef.current) {
      for (const moment of state.moments) seenMomentsRef.current.add(moment.id);
      seededMomentsRef.current = true;
      return;
    }
    for (const moment of state.moments) {
      if (seenMomentsRef.current.has(moment.id)) continue;
      seenMomentsRef.current.add(moment.id);
      enqueue(`Saved moment: ${moment.note.slice(0, 80)}`, "success");
    }
  }, [enabled, state.moments]);

  useEffect(() => {
    if (!enabled) return;
    if (state.privacy.listening && !wasListeningRef.current) {
      enqueue("Listening started", "listen");
    }
    wasListeningRef.current = state.privacy.listening;
  }, [enabled, state.privacy.listening]);

  useEffect(() => {
    if (!enabled) return;
    if (state.privacy.capturing && !wasCapturingRef.current) {
      enqueue("Capturing screen…", "capture");
    }
    wasCapturingRef.current = state.privacy.capturing;
  }, [enabled, state.privacy.capturing]);

  return enabled ? active : null;
}

function useChatAutoDismiss(notification: GlassNotificationView | null): {
  fading: boolean;
  onChatHoverStart: () => void;
  onChatHoverEnd: () => void;
} {
  const [fading, setFading] = useState(false);
  const hoverRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const fadeTimerRef = useRef<number | null>(null);

  const clearTimers = (): void => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (fadeTimerRef.current != null) {
      window.clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
  };

  const scheduleDismiss = (): void => {
    clearTimers();
    setFading(false);
    const feed = notification?.feedItem;
    if (!feed || feed.pinned || !isOverlayChatFeedKind(feed.kind)) return;

    timerRef.current = window.setTimeout(() => {
      if (hoverRef.current) return;
      setFading(true);
      fadeTimerRef.current = window.setTimeout(() => {
        send({ type: "dismiss-overlay-chat" });
        setFading(false);
      }, CHAT_FADE_MS);
    }, CHAT_AUTO_DISMISS_MS);
  };

  useEffect(() => {
    scheduleDismiss();
    return clearTimers;
  }, [notification?.id, notification?.feedItem?.pinned, notification?.feedItem?.kind]);

  return {
    fading,
    onChatHoverStart: () => {
      hoverRef.current = true;
      clearTimers();
      setFading(false);
    },
    onChatHoverEnd: () => {
      hoverRef.current = false;
      scheduleDismiss();
    },
  };
}

export function useGlassNotification(
  state: GlassState,
  enabled: boolean,
): {
  notification: GlassNotificationView | null;
  fading: boolean;
  onChatHoverStart: () => void;
  onChatHoverEnd: () => void;
} {
  const visibleFeed = useVisibleCommandFeed(state, enabled);
  const activeToast = useToastQueue(state, enabled);

  const notification = pickGlassNotification({
    lastError: enabled ? state.lastError : undefined,
    lastNotice: enabled ? state.lastNotice : undefined,
    feedItems: visibleFeed,
    toastMessage: activeToast?.message,
    toastTone:
      activeToast?.tone === "success"
        ? "success"
        : activeToast?.tone === "capture"
          ? "capture"
          : activeToast?.tone === "listen"
            ? "listen"
            : undefined,
  });

  const { fading, onChatHoverStart, onChatHoverEnd } = useChatAutoDismiss(notification);

  useEffect(() => {
    const rendererOnly = Boolean(notification) && notification?.source === "toast";
    window.glass.setOverlayNotificationActive(rendererOnly);
    return () => window.glass.setOverlayNotificationActive(false);
  }, [notification]);

  return { notification, fading, onChatHoverStart, onChatHoverEnd };
}
