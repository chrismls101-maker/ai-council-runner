import { useState } from "react";
import type { GlassCommandFeedItem } from "../../shared/commandFeed.ts";
import { isOverlayChatFeedKind } from "../../shared/commandFeed.ts";
import { send, useGlassState } from "../useGlassState.ts";
import { RememberThisButton } from "./RememberThisButton.tsx";
import {
  ensureOverlayInteractive,
  prepareGlassTextContextMenu,
  prepareGlassTextPointerDown,
} from "../glassTextInteraction.ts";

async function copyFeedText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* clipboard may be unavailable */
  }
}

export function FeedCard({
  item,
  userPrompt,
}: {
  item: GlassCommandFeedItem;
  userPrompt?: string;
  enterInteractive?: () => void;
  leaveInteractive?: () => void;
}): JSX.Element {
  const state = useGlassState();
  const [expanded, setExpanded] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const isListenInsight = Boolean(item.listenMomentId);
  const isLooking = item.kind === "looking";
  const isThinking = item.kind === "thinking";
  const isResponse = item.kind === "response";
  const isError = item.kind === "error";
  const isChat = isOverlayChatFeedKind(item.kind);
  const prompt = userPrompt?.trim();
  const showMergedChat = isChat && Boolean(prompt);

  const displayBody =
    isResponse || isError
      ? (item.fullBody ?? item.body)
      : expanded && item.fullBody
        ? item.fullBody
        : item.body;
  const canExpand =
    !isResponse &&
    !isError &&
    (isListenInsight
      ? Boolean(item.fullBody)
      : Boolean(item.fullBody && item.fullBody !== item.body));
  const bodyOverflows = canExpand && !expanded;

  if (showMergedChat) {
    const isPending = isThinking || isLooking;
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
      className={`glass-chat-reply glass-answer-shell overlay-feed-card overlay-feed-card--${item.kind}${item.pinned ? " overlay-feed-card--pinned" : ""}${isPending ? " glass-chat-reply--pending" : ""}${isError ? " glass-chat-reply--error" : ""}`}
      onPointerDownCapture={ensureOverlayInteractive}
    >
        <span className="glass-answer-shell__sheen" aria-hidden="true" />
        <div
          className="glass-answer-shell__content glass-chat-reply__content"
          onContextMenu={prepareGlassTextContextMenu}
          onPointerDownCapture={prepareGlassTextPointerDown}
        >
          <p className="glass-chat-reply__prompt glass-selectable-text">{prompt}</p>
          <div className="glass-chat-reply__scroll">
            <p
              className={`glass-chat-reply__answer glass-selectable-text${isPending ? " glass-chat-reply__answer--pending" : ""}${isError ? " glass-chat-reply__answer--error" : ""}`}
            >
              {displayBody}
            </p>
          </div>
          {!isPending ? (
            <div
              className="overlay-feed-card__actions glass-chat-reply__actions"
              onPointerDownCapture={ensureOverlayInteractive}
            >
              {(isResponse || isError) && item.body ? (
                <button
                  type="button"
                  className="gbtn gbtn--ghost"
                  data-testid="glass-overlay-copy"
                  onClick={() => void copyFeedText(item.fullBody ?? item.body)}
                >
                  Copy
                </button>
              ) : null}
              {!isListenInsight ? (
                <>
                  <button
                    type="button"
                    className="gbtn gbtn--ghost"
                    onClick={() => send({ type: "pin-command-feed-item", id: item.id, pinned: !item.pinned })}
                  >
                    {item.pinned ? "Unpin" : "Pin"}
                  </button>
                  {isResponse ? (
                    <>
                      <RememberThisButton
                        content={item.fullBody ?? item.body}
                        prompt={prompt}
                        runId={item.runId}
                      />
                      <button
                        type="button"
                        className="gbtn gbtn--ghost"
                        data-testid="glass-overlay-save-moment"
                        onClick={() => send({ type: "save-feed-moment", id: item.id })}
                      >
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
                    <button
                      type="button"
                      className="gbtn gbtn--primary"
                      onClick={() => send({ type: "open-feed-in-iivo", id: item.id })}
                    >
                      Open in IIVO
                    </button>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}
        </div>
        <span className="glass-answer-shell__led ui-led-line" aria-hidden="true" />
      </article>
    );
  }

  return (
    <article
      data-testid="glass-overlay-card"
      className={`overlay-feed-card overlay-feed-card--${item.kind}${item.pinned ? " overlay-feed-card--pinned" : ""}${isListenInsight ? " overlay-feed-card--listen" : ""}${expanded ? " overlay-feed-card--expanded" : ""}`}
    >
      <div className="overlay-feed-card__eyebrow">
        <span className="overlay-feed-card__dot" aria-hidden="true" />
        {item.title}
      </div>
      <div
        className={`overlay-feed-card__body-wrap${bodyOverflows ? " overlay-feed-card__body-wrap--fade" : ""}`}
      >
        <p
          className="overlay-feed-card__body glass-selectable-text"
          onContextMenu={prepareGlassTextContextMenu}
          onPointerDownCapture={prepareGlassTextPointerDown}
        >
          {displayBody}
        </p>
        {isResponse ? (
          <RememberThisButton
            content={item.fullBody ?? item.body}
            prompt={prompt}
            runId={item.runId}
          />
        ) : null}
        {bodyOverflows ? (
          <span className="overlay-feed-card__more-hint" aria-hidden="true">
            More…
          </span>
        ) : null}
      </div>
      {!isThinking && !isLooking ? (
        <div className="overlay-feed-card__actions">
          {canExpand ? (
            <button
              type="button"
              className="gbtn gbtn--ghost"
              data-testid="glass-overlay-feed-expand"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "Collapse" : "Expand"}
            </button>
          ) : null}
          {isListenInsight && !showActions ? (
            <button
              type="button"
              className="gbtn gbtn--ghost"
              data-testid="glass-overlay-listen-more-actions"
              onClick={() => setShowActions(true)}
            >
              More actions
            </button>
          ) : null}
          {isListenInsight && showActions ? (
            <>
              <button
                type="button"
                className="gbtn gbtn--ghost"
                onClick={() => send({ type: "save-feed-moment", id: item.id })}
              >
                Save
              </button>
              <button
                type="button"
                className="gbtn gbtn--ghost"
                data-testid="glass-overlay-open-iivo"
                onClick={() => send({ type: "open-feed-in-iivo", id: item.id })}
              >
                Turn into action
              </button>
              <button type="button" className="gbtn gbtn--ghost" onClick={() => setShowActions(false)}>
                Dismiss actions
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
