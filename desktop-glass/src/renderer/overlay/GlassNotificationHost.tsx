import { send } from "../useGlassState.ts";
import type { GlassNotificationView } from "../../shared/glassNotifications.ts";
import { FeedCard } from "./OverlayFeedCard.tsx";
import { ensureOverlayInteractive } from "../glassTextInteraction.ts";

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
  };

  const handleLeave = (): void => {
    leaveInteractive();
    onChatHoverEnd();
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

  return (
    <div
      className={`glass-notification-host${fading ? " glass-notification-host--fading" : ""}`}
      data-testid="glass-notification-host"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <div
        className={`glass-notification-host__card${notification.isError ? " glass-notification-host__card--error" : ""}`}
        role="status"
        aria-live="polite"
      >
        {notification.title ? (
          <p className="glass-notification-host__title">{notification.title}</p>
        ) : null}
        <p className="glass-notification-host__message">{notification.message}</p>
        {notification.source !== "toast" ? (
          <button
            type="button"
            className="gbtn gbtn--ghost glass-notification-host__dismiss"
            data-testid="glass-notification-dismiss"
            onClick={() => send({ type: dismissType })}
          >
            Dismiss
          </button>
        ) : null}
      </div>
    </div>
  );
}
