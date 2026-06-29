import { useCallback, useState } from "react";
import { send } from "../useGlassState.ts";
import type { GlassNotificationView } from "../../shared/glassNotifications.ts";
import { FeedCard } from "./OverlayFeedCard.tsx";
import { ensureOverlayInteractive } from "../glassTextInteraction.ts";
import { copyToClipboard } from "../useCopyToClipboard.ts";

/** Copy the notification text to clipboard with a "paste into command bar" hint. */
function useCopyNotification(notification: GlassNotificationView | null): {
  copied: boolean;
  copy: () => void;
} {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    if (!notification) return;
    const label = notification.title ? `${notification.title}: ` : "";
    const text = `${label}${notification.message}\n\nPaste this into the Glass command bar to get help.`;
    void copyToClipboard(text).then((ok) => {
      if (!ok) return;
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [notification]);

  return { copied, copy };
}

export function GlassNotificationHost({
  notification,
  fading,
  enterInteractive,
  leaveInteractive,
  onChatHoverStart,
  onChatHoverEnd,
}: {
  notification: GlassNotificationView | null;
  fading?: boolean;
  enterInteractive: () => void;
  leaveInteractive: () => void;
  onChatHoverStart: () => void;
  onChatHoverEnd: () => void;
}): JSX.Element | null {
  if (!notification) return null;

  const handleEnter = (): void => {
    enterInteractive();
    onChatHoverStart();
    ensureOverlayInteractive();
    window.glass.setOverlayPointerOverNotification(true);
  };

  const handleLeave = (): void => {
    leaveInteractive();
    onChatHoverEnd();
    window.glass.setOverlayPointerOverNotification(false);
    window.glass?.setOverlayPointerOverBuilderStrip?.(false);
  };

  const handlePointerDownCapture = (): void => {
    handleEnter();
  };

  if (notification.source === "feed" && notification.feedItem) {
    return (
      <div
        className={`glass-notification-host${fading ? " glass-notification-host--fading" : ""} glass-notification-host--chat`}
        data-testid="glass-notification-host"
        onPointerEnter={handleEnter}
        onPointerLeave={handleLeave}
        onPointerDownCapture={handlePointerDownCapture}
      >
        <FeedCard
          item={notification.feedItem}
          userPrompt={notification.userPrompt}
        />
      </div>
    );
  }

  const dismissType = notification.isError ? "clear-last-error" : "clear-last-notice";
  const { copied, copy } = useCopyNotification(notification);

  /** Single-line pill layout only for short status lines — long text stacks above Dismiss. */
  const COMPACT_NOTICE_MAX_CHARS = 72;
  const compactNotice =
    !notification.title &&
    notification.source !== "toast" &&
    !notification.message.includes("\n") &&
    notification.message.length <= COMPACT_NOTICE_MAX_CHARS;

  return (
    <div
      className={`glass-notification-host${fading ? " glass-notification-host--fading" : ""}${
        compactNotice ? " glass-notification-host--compact" : ""
      }`}
      data-testid="glass-notification-host"
      onPointerEnter={handleEnter}
      onPointerLeave={handleLeave}
    >
      <div
        className={`glass-notification-host__card${
          notification.isError ? " glass-notification-host__card--error" : ""
        }${compactNotice ? " glass-notification-host__card--compact" : ""}`}
        role="status"
        aria-live="polite"
        onPointerDownCapture={handlePointerDownCapture}
      >
        {notification.title ? (
          <p className="glass-notification-host__title">{notification.title}</p>
        ) : null}
        <div
          className={
            compactNotice
              ? "glass-notification-host__inline"
              : "glass-notification-host__stack"
          }
        >
          <p className="glass-notification-host__message">{notification.message}</p>
          {notification.source !== "toast" ? (
            <div className="glass-notification-host__actions">
              <button
                type="button"
                className="glass-notification-host__copy"
                data-testid="glass-notification-copy"
                title={copied ? "Copied!" : "Copy — then paste into command bar for help"}
                aria-label={copied ? "Copied to clipboard" : "Copy error and ask Glass for help"}
                onPointerDown={ensureOverlayInteractive}
                onClick={copy}
              >
                {copied ? (
                  "Copied"
                ) : (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <rect x="4.5" y="1" width="7.5" height="9.5" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
                    <path d="M2 4.5H1.5A1.5 1.5 0 000 6v6.5A1.5 1.5 0 001.5 14H9a1.5 1.5 0 001.5-1.5V12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                  </svg>
                )}
              </button>
              <button
                type="button"
                className="gbtn gbtn--ghost glass-notification-host__dismiss"
                data-testid="glass-notification-dismiss"
                onPointerDown={ensureOverlayInteractive}
                onClick={() => send({ type: dismissType })}
              >
                Dismiss
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
