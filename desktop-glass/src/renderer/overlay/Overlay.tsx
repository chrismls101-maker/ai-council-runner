import { useEffect, useRef, useState } from "react";
import type { GlassState } from "../../shared/ipc.ts";
import type { OverlayMode } from "../../shared/glassWindowTypes.ts";
import type { GlassSessionInsight } from "../../shared/sessionTypes.ts";
import {
  isOverlayCardEventKind,
  overlayCardFromEvent,
} from "../../shared/overlayCards.ts";
import { send, useGlassState } from "../useGlassState.ts";

const CARD_TTL_MS = 8_000;
const TOAST_TTL_MS = 5_000;
const MAX_CARDS = 4;
const MAX_TOASTS = 3;

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

export function Overlay(): JSX.Element {
  const state = useGlassState();
  const overlayMode = state.windows?.overlayMode ?? state.config.overlayMode ?? "passive";
  const overlayVisible = state.windows?.overlayVisible ?? state.config.overlayEnabled;
  const showInsights = overlayVisible && overlayMode === "insights";
  const { cards, dismissCard } = useOverlayCards(state, showInsights);
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
    <div className="overlay-root">
      <OverlayPassiveLayer overlayMode={overlayMode} />
      <OverlayStatus state={state} />

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
