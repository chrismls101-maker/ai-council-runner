import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { GlassState } from "../../shared/ipc.ts";
import type { OverlayMode } from "../../shared/glassWindowTypes.ts";
import type { GlassSessionInsight } from "../../shared/sessionTypes.ts";
import type { GlassCommandFeedItem } from "../../shared/commandFeed.ts";
import {
  isOverlayCardEventKind,
  overlayCardFromEvent,
} from "../../shared/overlayCards.ts";
import { send, useGlassState } from "../useGlassState.ts";
import { CopilotOverlay } from "./CopilotOverlay.tsx";

const CARD_TTL_MS = 8_000;
const FEED_CARD_TTL_MS = 12_000;
const TOAST_TTL_MS = 5_000;
const MAX_CARDS = 4;
const MAX_FEED_CARDS = 5;
const MAX_TOASTS = 3;
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

type FloatingCard = {
  id: string;
  title: string;
  body: string;
  kind: "event" | "insight";
};

type Toast = {
  id: string;
  message: string;
  tone: "info" | "success" | "capture" | "listen";
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

function OverlayStatus({ state }: { state: GlassState }): JSX.Element | null {
  const sessionStatus = state.session?.status;
  const sessionLive = sessionStatus === "active" || sessionStatus === "paused";
  const { privacy } = state;
  const showPulse =
    sessionLive || privacy.listening || privacy.capturing || privacy.status === "sending";

  if (!showPulse && privacy.status === "idle") {
    return null;
  }

  return (
    <div className="overlay-status" aria-live="polite">
      {sessionLive ? (
        <span
          className={`overlay-status__chip overlay-status__chip--session overlay-status__chip--${sessionStatus}`}
        >
          <span className="overlay-status__pulse" aria-hidden="true" />
          Session {sessionStatus === "active" ? "active" : "paused"}
        </span>
      ) : null}
      {privacy.listening ? (
        <span className="overlay-status__chip overlay-status__chip--listen">
          <span className="overlay-status__pulse" aria-hidden="true" />
          Listening
        </span>
      ) : null}
      {privacy.capturing ? (
        <span className="overlay-status__chip overlay-status__chip--capture">
          <span className="overlay-status__pulse" aria-hidden="true" />
          Capturing screen
        </span>
      ) : null}
      {privacy.status === "sending" ? (
        <span className="overlay-status__chip overlay-status__chip--send">Sending to IIVO</span>
      ) : null}
    </div>
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

/**
 * Surfaces command-bar responses (and other feed items) as floating glass cards.
 * Items auto-fade after a TTL unless pinned. Always active while the overlay is
 * visible — the command bar is the primary surface, not the insights panel.
 */
function useCommandFeedCards(state: GlassState, enabled: boolean): GlassCommandFeedItem[] {
  const [aged, setAged] = useState<Set<string>>(new Set());
  const seenRef = useRef<Set<string>>(new Set());
  const seededRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const feed = state.commandFeed ?? [];

    if (!seededRef.current) {
      // Don't replay history on overlay load; age pre-existing items immediately.
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
      const id = item.id;
      window.setTimeout(() => {
        setAged((prev) => new Set(prev).add(id));
      }, FEED_CARD_TTL_MS);
    }
  }, [enabled, state.commandFeed]);

  if (!enabled) return [];
  return (state.commandFeed ?? [])
    .filter((item) => item.pinned || !aged.has(item.id))
    .slice(-MAX_FEED_CARDS);
}

function useOverlayToasts(state: GlassState, enabled: boolean): Toast[] {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seenNoticeRef = useRef<string | undefined>();
  const seenMomentsRef = useRef<Set<string>>(new Set());
  const seededMomentsRef = useRef(false);

  const pushToast = (message: string, tone: Toast["tone"]): void => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((current) => [{ id, message, tone }, ...current].slice(0, MAX_TOASTS));
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, TOAST_TTL_MS);
  };

  useEffect(() => {
    if (!enabled) return;
    if (state.lastNotice && state.lastNotice !== seenNoticeRef.current) {
      seenNoticeRef.current = state.lastNotice;
      pushToast(state.lastNotice, "info");
    }
  }, [enabled, state.lastNotice]);

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
      pushToast(`Saved moment: ${moment.note.slice(0, 80)}`, "success");
    }
  }, [enabled, state.moments]);

  const wasListeningRef = useRef(false);
  const wasCapturingRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (state.privacy.listening && !wasListeningRef.current) {
      pushToast("Listening started", "listen");
    }
    wasListeningRef.current = state.privacy.listening;
  }, [enabled, state.privacy.listening]);

  useEffect(() => {
    if (!enabled) return;
    if (state.privacy.capturing && !wasCapturingRef.current) {
      pushToast("Capturing screen…", "capture");
    }
    wasCapturingRef.current = state.privacy.capturing;
  }, [enabled, state.privacy.capturing]);

  return toasts;
}

async function copyFeedText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* clipboard may be unavailable */
  }
}

function VisualAskRetentionHint(): JSX.Element | null {
  const state = useGlassState();
  const retention = state.visualAskRetention;
  if (!retention?.usedForAnswer) return null;
  return (
    <p className="overlay-feed-card__retention" data-testid="glass-visual-ask-retention">
      {retention.label}
      {retention.detail ? ` · ${retention.detail}` : ""}
    </p>
  );
}

function FeedCard({
  item,
  enterInteractive,
  leaveInteractive,
}: {
  item: GlassCommandFeedItem;
  enterInteractive: () => void;
  leaveInteractive: () => void;
}): JSX.Element {
  const state = useGlassState();
  const [expanded, setExpanded] = useState(false);
  const isLooking = item.kind === "looking";
  const isThinking = item.kind === "thinking";
  const isResponse = item.kind === "response";
  const isError = item.kind === "error";
  const displayBody =
    expanded && item.fullBody ? item.fullBody : item.body;
  const canExpand = Boolean(item.fullBody && item.fullBody !== item.body);

  return (
    <article
      data-testid={
        isLooking
          ? "glass-overlay-looking-card"
          : isThinking
            ? "glass-overlay-thinking-card"
            : isResponse
              ? "glass-overlay-response-card"
              : "glass-overlay-card"
      }
      className={`overlay-feed-card overlay-feed-card--${item.kind}${item.pinned ? " overlay-feed-card--pinned" : ""}`}
      onMouseEnter={enterInteractive}
      onMouseLeave={leaveInteractive}
    >
      <div className="overlay-feed-card__eyebrow">
        <span className="overlay-feed-card__dot" aria-hidden="true" />
        {item.title}
      </div>
      <div className="overlay-feed-card__body-wrap">
        <p className="overlay-feed-card__body">{displayBody}</p>
      </div>
      {isResponse ? <VisualAskRetentionHint /> : null}
      {!isThinking && !isLooking ? (
        <div className="overlay-feed-card__actions">
          {(isResponse || isError) && item.body ? (
            <button type="button" className="gbtn gbtn--ghost" onClick={() => void copyFeedText(item.fullBody ?? item.body)}>
              Copy
            </button>
          ) : null}
          <button
            type="button"
            className="gbtn gbtn--ghost"
            onClick={() => send({ type: "pin-command-feed-item", id: item.id, pinned: !item.pinned })}
          >
            {item.pinned ? "Unpin" : "Pin"}
          </button>
          {isResponse ? (
            <>
              <button type="button" className="gbtn gbtn--ghost" onClick={() => send({ type: "save-feed-moment", id: item.id })}>
                Save Moment
              </button>
              {state.visualAskRetention?.kind === "not_saved" && state.session ? (
                <button
                  type="button"
                  className="gbtn gbtn--ghost"
                  data-testid="glass-save-visual-capture"
                  onClick={() => send({ type: "save-last-visual-capture" })}
                >
                  Save screen
                </button>
              ) : null}
              <button
                type="button"
                data-testid="glass-overlay-open-iivo"
                className="gbtn gbtn--primary"
                onClick={() => send({ type: "open-feed-in-iivo", id: item.id })}
              >
                Open in IIVO
              </button>
            </>
          ) : null}
          {isError ? (
            <button type="button" className="gbtn gbtn--primary" onClick={() => send({ type: "open-feed-in-iivo", id: item.id })}>
              Open in IIVO
            </button>
          ) : null}
          {canExpand ? (
            <button type="button" className="gbtn gbtn--ghost" onClick={() => setExpanded((v) => !v)}>
              {expanded ? "Collapse" : "Expand"}
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function Overlay(): JSX.Element {
  const state = useGlassState();
  const overlayMode = state.windows?.overlayMode ?? state.config.overlayMode ?? "passive";
  const overlayVisible = state.windows?.overlayVisible ?? state.config.overlayEnabled;
  const showInsights = overlayVisible && overlayMode === "insights";
  const { cards, dismissCard } = useOverlayCards(state, showInsights);
  const feedCards = useCommandFeedCards(state, overlayVisible);
  const toasts = useOverlayToasts(state, showInsights);
  const interactiveCountRef = useRef(0);

  useEffect(() => {
    window.glass.setIgnoreMouse(true);
  }, []);

  const enterInteractive = (): void => {
    interactiveCountRef.current += 1;
    window.glass.setIgnoreMouse(false);
  };

  const leaveInteractive = (): void => {
    interactiveCountRef.current = Math.max(0, interactiveCountRef.current - 1);
    if (interactiveCountRef.current === 0) {
      window.glass.setIgnoreMouse(true);
    }
  };

  if (!overlayVisible) {
    return <div className="overlay-root overlay-root--hidden" />;
  }

  return (
    <div
      className="overlay-root"
      data-testid="glass-overlay-root"
      style={
        {
          "--overlay-frame-bottom": `${overlayFrameBottomInsetPx(state)}px`,
        } as CSSProperties
      }
    >
      <OverlayPassiveLayer overlayMode={overlayMode} />
      <OverlayStatus state={state} />

      <CopilotOverlay
        state={state}
        enterInteractive={enterInteractive}
        leaveInteractive={leaveInteractive}
      />

      {feedCards.length > 0 ? (
        <div className="overlay-feed">
          {feedCards.map((item) => (
            <FeedCard key={item.id} item={item} enterInteractive={enterInteractive} leaveInteractive={leaveInteractive} />
          ))}
        </div>
      ) : null}

      {showInsights && toasts.length > 0 ? (
        <div className="overlay-toasts">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`overlay-toast overlay-toast--${toast.tone}`}
              onMouseEnter={enterInteractive}
              onMouseLeave={leaveInteractive}
            >
              {toast.message}
            </div>
          ))}
        </div>
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
    </div>
  );
}
