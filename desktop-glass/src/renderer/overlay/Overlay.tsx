import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ensureOverlayInteractive } from "../glassTextInteraction.ts";
import type { GlassState } from "../../shared/ipc.ts";
import type { OverlayMode } from "../../shared/glassWindowTypes.ts";
import type { GlassSessionInsight } from "../../shared/sessionTypes.ts";
import {
  isOverlayCardEventKind,
  overlayCardFromEvent,
} from "../../shared/overlayCards.ts";
import { send, useGlassState } from "../useGlassState.ts";
import { CopilotOverlay } from "./CopilotOverlay.tsx";
import { GlassNotificationHost } from "./GlassNotificationHost.tsx";
import { GlassUpdateOverlay } from "./GlassUpdateOverlay.tsx";
import { GlassOnboardingOverlay } from "./GlassOnboardingOverlay.tsx";
import { LiveTranslateCaptionsOverlay } from "./LiveTranslateCaptionsOverlay.tsx";
import { useGlassNotification } from "./useGlassNotification.ts";
import { overlayNotificationBottomPx } from "../../shared/glassLayoutMath.ts";
import { overlayFeedNotificationActive, overlayNoticeNotificationActive } from "../../shared/overlayPointerPolicy.ts";
import { isLiveTranslateActive } from "../../shared/liveTranslateState.ts";

const CARD_TTL_MS = 8_000;
const MAX_CARDS = 4;
/** Built-in primary display — locked; sits at dock edge (workArea bottom). */
const PRIMARY_FRAME_BOTTOM_INSET_PX = 10;
/** HDMI / external TV — same bottom alignment when Glass is on Display 2+. */
const EXTERNAL_FRAME_BOTTOM_INSET_PX = 10;

function overlayFrameBottomInsetPx(state: GlassState): number {
  const displays = state.connectedDisplays;
  if (!displays.length) return PRIMARY_FRAME_BOTTOM_INSET_PX;

  const target = state.glassSettings.displayTarget;
  const active =
    displays.find((d) =>
      target === "follow_mouse"
        ? d.cursorInside
        : typeof target === "number"
          ? d.id === target
          : d.isPrimary,
    ) ?? displays.find((d) => d.isPrimary);

  if (!active) return PRIMARY_FRAME_BOTTOM_INSET_PX;

  if (active.internal === false) {
    return EXTERNAL_FRAME_BOTTOM_INSET_PX;
  }

  return PRIMARY_FRAME_BOTTOM_INSET_PX;
}

function overlayRootClassName(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

function overlayLayoutStyle(state: GlassState): CSSProperties {
  const frameBottom = overlayFrameBottomInsetPx(state);
  return {
    "--overlay-frame-bottom": `${frameBottom}px`,
    "--overlay-notification-bottom": `${overlayNotificationBottomPx({
      commandBarOverlayClearancePx: state.commandBarOverlayClearancePx,
      commandBarStackHeightPx: state.commandBarStackHeightPx,
    })}px`,
  } as CSSProperties;
}

type FloatingCard = {
  id: string;
  title: string;
  body: string;
  kind: "event" | "insight";
};

function overlayCardFromInsight(insight: GlassSessionInsight): FloatingCard {
  return {
    id: insight.id,
    title: insight.title,
    body: insight.text,
    kind: "insight",
  };
}

function OverlayPassiveLayer({ overlayMode }: { overlayMode: OverlayMode }): JSX.Element {
  return (
    <>
      <div className="overlay-glass-sheet" aria-hidden="true" />
      <div className="overlay-glass-grid" aria-hidden="true" />
      <div className="overlay-glass-border" aria-hidden="true">
        <span className="overlay-glass-border__corner overlay-glass-border__corner--tl" />
        <span className="overlay-glass-border__corner overlay-glass-border__corner--tr" />
        <span className="overlay-glass-border__corner overlay-glass-border__corner--bl" />
        <span className="overlay-glass-border__corner overlay-glass-border__corner--br" />
      </div>
      <div className="overlay-glass-glow overlay-glass-glow--tl" aria-hidden="true" />
      <div className="overlay-glass-glow overlay-glass-glow--br" aria-hidden="true" />
      <div className="overlay-badge">
        <span className="overlay-badge__dot" aria-hidden="true" />
        IIVO Glass active
        {overlayMode === "insights" ? (
          <span className="overlay-badge__mode"> · insights</span>
        ) : null}
      </div>
    </>
  );
}

function ListenCountdownOverlay({ seconds }: { seconds: number }): JSX.Element {
  return (
    <div className="listen-countdown" data-testid="glass-listen-countdown" aria-live="assertive">
      <div className="listen-countdown__backdrop" aria-hidden="true" />
      <div className="listen-countdown__card">
        <span className="listen-countdown__number">{seconds}</span>
        <span className="listen-countdown__label">Listening starts…</span>
        <span className="listen-countdown__hint">Get ready — capture begins when the timer hits zero.</span>
      </div>
    </div>
  );
}

function OverlayStatus({ state }: { state: GlassState }): JSX.Element | null {
  const { privacy } = state;
  const activityChips = (
    <>
      {privacy.capturing ? (
        <span className="overlay-status__chip overlay-status__chip--capture">
          <span className="overlay-status__pulse" aria-hidden="true" />
          Capturing screen
        </span>
      ) : null}
      {privacy.status === "sending" ? (
        <span className="overlay-status__chip overlay-status__chip--send">Sending to IIVO</span>
      ) : null}
    </>
  );
  const hasActivity = privacy.capturing || privacy.status === "sending";

  if (!hasActivity) {
    return null;
  }

  return (
    <>
      {hasActivity ? (
        <div className="overlay-status overlay-status--activity" aria-live="polite">
          {activityChips}
        </div>
      ) : null}
    </>
  );
}

function useOverlayCards(state: GlassState, enabled: boolean): {
  cards: FloatingCard[];
  dismissCard: (id: string) => void;
} {
  const [cards, setCards] = useState<FloatingCard[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const seededRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const events = state.session?.events ?? [];
    const insights = state.session?.insights ?? [];

    if (!seededRef.current) {
      for (const event of events) seenRef.current.add(`event:${event.id}`);
      for (const insight of insights) seenRef.current.add(`insight:${insight.id}`);
      seededRef.current = true;
      return;
    }

    const nextCards: FloatingCard[] = [];

    for (const event of events) {
      const key = `event:${event.id}`;
      if (seenRef.current.has(key) || !isOverlayCardEventKind(event.kind)) continue;
      seenRef.current.add(key);
      nextCards.push({ ...overlayCardFromEvent(event), kind: "event" });
    }

    for (const insight of insights) {
      const key = `insight:${insight.id}`;
      if (seenRef.current.has(key)) continue;
      seenRef.current.add(key);
      nextCards.push(overlayCardFromInsight(insight));
    }

    if (nextCards.length === 0) return;

    setCards((current) => [...nextCards, ...current].slice(0, MAX_CARDS));
    for (const card of nextCards) {
      window.setTimeout(() => {
        setCards((current) => current.filter((item) => item.id !== card.id));
      }, CARD_TTL_MS);
    }
  }, [enabled, state.session?.events, state.session?.insights]);

  const dismissCard = (id: string): void => {
    setCards((current) => current.filter((item) => item.id !== id));
  };

  return { cards, dismissCard };
}

export function Overlay(): JSX.Element {
  const state = useGlassState();
  const onboardingOpen = state.onboardingOpen;

  const overlayMode = state.windows?.overlayMode ?? state.config.overlayMode ?? "passive";
  const overlayContentVisible =
    (state.windows?.overlayVisible ?? state.config.overlayEnabled) && overlayMode !== "hidden";
  const notificationEnabled = !onboardingOpen;
  const translateFocusActive = isLiveTranslateActive(state.liveTranslate);
  const { notification, fading, onChatHoverStart, onChatHoverEnd } = useGlassNotification(
    state,
    notificationEnabled,
    { suppressTransientNotifications: translateFocusActive },
  );
  const notificationVisible = Boolean(notification);
  const updateVisible =
    state.appUpdate.phase === "available" ||
    state.appUpdate.phase === "downloading" ||
    state.appUpdate.phase === "installing";
  const countdownVisible =
    state.listenCountdownSeconds != null && state.listenCountdownSeconds > 0;
  const { cards, dismissCard } = useOverlayCards(state, overlayContentVisible);
  const feedNotificationActive = overlayFeedNotificationActive(notification);
  const noticeNotificationActive = overlayNoticeNotificationActive(notification);

  const enterInteractive = (): void => {
    ensureOverlayInteractive();
  };

  const leaveInteractive = (): void => {
    // mousemove tracking restores click-through when the pointer leaves interactive UI
  };

  const translateCaptionsVisible = Boolean(
    state.liveTranslate?.active &&
      state.liveTranslate.config.enabled &&
      state.liveTranslate.captionsVisible &&
      state.liveTranslate.captions.current &&
      state.liveTranslate.config.captionPosition !== "panel",
  );

  if (onboardingOpen) {
    return (
      <div className="overlay-root overlay-root--onboarding" data-testid="glass-overlay-root">
        <GlassOnboardingOverlay />
      </div>
    );
  }

  if (
    !overlayContentVisible &&
    !updateVisible &&
    !countdownVisible &&
    !translateCaptionsVisible &&
    !notificationVisible
  ) {
    return <div className="overlay-root overlay-root--hidden" />;
  }

  if (!overlayContentVisible && !countdownVisible && !updateVisible && translateCaptionsVisible) {
    return (
      <div
        className={overlayRootClassName(
          "overlay-root",
          "overlay-root--captions-only",
          translateFocusActive && "overlay-root--translate-active",
        )}
        data-testid="glass-overlay-root"
      >
        {state.liveTranslate ? (
          <LiveTranslateCaptionsOverlay
            runtime={state.liveTranslate}
            enterInteractive={enterInteractive}
            leaveInteractive={leaveInteractive}
          />
        ) : null}
      </div>
    );
  }

  if (!overlayContentVisible && !countdownVisible && updateVisible) {
    return (
      <div className="overlay-root overlay-root--update-only" data-testid="glass-overlay-root">
        <GlassUpdateOverlay
          appUpdate={state.appUpdate}
          enterInteractive={enterInteractive}
          leaveInteractive={leaveInteractive}
        />
      </div>
    );
  }

  if (!overlayContentVisible && countdownVisible && !updateVisible) {
    return (
      <div className="overlay-root overlay-root--countdown-only" data-testid="glass-overlay-root">
        <ListenCountdownOverlay seconds={state.listenCountdownSeconds!} />
      </div>
    );
  }

  if (
    !overlayContentVisible &&
    notificationVisible &&
    !updateVisible &&
    !countdownVisible &&
    !translateCaptionsVisible
  ) {
    return (
      <div
        className="overlay-root overlay-root--notice-only"
        data-testid="glass-overlay-root"
        style={overlayLayoutStyle(state)}
      >
        <GlassNotificationHost
          notification={notification}
          fading={fading}
          enterInteractive={enterInteractive}
          leaveInteractive={leaveInteractive}
          onChatHoverStart={onChatHoverStart}
          onChatHoverEnd={onChatHoverEnd}
        />
      </div>
    );
  }

  const showInsights = overlayContentVisible && overlayMode === "insights";

  return (
    <div
      className={overlayRootClassName(
        "overlay-root",
        translateFocusActive && "overlay-root--translate-active",
      )}
      data-testid="glass-overlay-root"
      style={overlayLayoutStyle(state)}
    >
      <OverlayPassiveLayer overlayMode={overlayMode} />
      <OverlayStatus state={state} />

      <GlassNotificationHost
        notification={notification}
        fading={fading}
        enterInteractive={enterInteractive}
        leaveInteractive={leaveInteractive}
        onChatHoverStart={onChatHoverStart}
        onChatHoverEnd={onChatHoverEnd}
      />

      {countdownVisible ? (
        <ListenCountdownOverlay seconds={state.listenCountdownSeconds!} />
      ) : null}

      <CopilotOverlay
        state={state}
        enterInteractive={enterInteractive}
        leaveInteractive={leaveInteractive}
      />

      {updateVisible ? (
        <GlassUpdateOverlay
          appUpdate={state.appUpdate}
          enterInteractive={enterInteractive}
          leaveInteractive={leaveInteractive}
        />
      ) : null}

      {showInsights && cards.length > 0 ? (
        <div className="overlay-cards">
          {cards.map((card) => (
            <article
              key={`${card.kind}:${card.id}`}
              className="overlay-card"
              onMouseEnter={enterInteractive}
              onMouseLeave={leaveInteractive}
            >
              <div className="overlay-card__eyebrow">
                {card.kind === "insight" ? "Insight" : "Session"}
              </div>
              <div className="overlay-card__title">{card.title}</div>
              <p className="overlay-card__body">{card.body}</p>
              <div className="overlay-card__actions">
                <button
                  type="button"
                  className="gbtn gbtn--primary"
                  onClick={() => {
                    send({ type: "set-tab", tab: card.kind === "insight" ? "insights" : "session" });
                    if (!state.panelVisible) send({ type: "toggle-panel" });
                  }}
                >
                  Open Panel
                </button>
                <button
                  type="button"
                  className="gbtn gbtn--ghost"
                  onClick={() => dismissCard(card.id)}
                >
                  Dismiss
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {state.liveTranslate?.active && state.liveTranslate.captionsVisible ? (
        <LiveTranslateCaptionsOverlay
          runtime={state.liveTranslate}
          enterInteractive={enterInteractive}
          leaveInteractive={leaveInteractive}
        />
      ) : null}
    </div>
  );
}
