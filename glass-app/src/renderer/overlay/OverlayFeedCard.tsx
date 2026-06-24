import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { GlassCommandFeedItem } from "../../shared/commandFeed.ts";
import { isOverlayChatFeedKind } from "../../shared/commandFeed.ts";
import { extractFirstCodeBlock, hasCodeBlock } from "../../shared/markdownCode.ts";
import type { DiffLine } from "../../shared/diff.ts";
import { send, useGlassState } from "../useGlassState.ts";
import { RememberThisButton } from "./RememberThisButton.tsx";
import { GlassMarkdown } from "../components/GlassMarkdown.tsx";
import { CopyButton } from "../components/CopyButton.tsx";
import {
  ensureOverlayInteractive,
  prepareGlassTextContextMenu,
  prepareGlassTextPointerDown,
} from "../glassTextInteraction.ts";
import {
  DESIGN_TO_CODE_ACTION_LABELS,
  DEFAULT_DESIGN_STACK,
  DESIGN_STACK_LABELS,
  DESIGN_STACK_EXTENSIONS,
  getActionLabel,
} from "../../shared/designToCode.ts";
import type { DesignToCodeAction, DesignStack } from "../../shared/designToCode.ts";

export function ShellOutputCard({
  id,
}: {
  id: string;
}): JSX.Element | null {
  const state = useGlassState();
  const entry = state.shellOutputs?.[id];
  if (!entry) return null;

  const isRunning = entry.status === "running";
  const isError = entry.status === "error";

  return (
    <article className={`overlay-shell-card${isRunning ? " overlay-shell-card--running" : ""}${isError ? " overlay-shell-card--error" : ""}`}>
      <div className="overlay-shell-card__header">
        <span className={`overlay-shell-card__pulse${isRunning ? " overlay-shell-card__pulse--active" : ""}`} aria-hidden="true" />
        <span className="overlay-shell-card__cmd">{entry.command}</span>
        {!isRunning ? (
          <button
            type="button"
            className="overlay-feed-card__dismiss-x"
            aria-label="Dismiss"
            onClick={() => send({ type: "remove-command-feed-item", id })}
          >×</button>
        ) : null}
      </div>
      <pre className="overlay-shell-card__output">{entry.output || (isRunning ? "running…" : "")}</pre>
      {!isRunning && entry.exitCode !== undefined ? (
        <div className={`overlay-shell-card__exit-badge${entry.exitCode === 0 ? " overlay-shell-card__exit-badge--ok" : " overlay-shell-card__exit-badge--err"}`}>
          {entry.exitCode === 0 ? "✓ exit 0" : `✗ exit ${entry.exitCode}`}
        </div>
      ) : null}
    </article>
  );
}

// ── DiffView ─────────────────────────────────────────────────────────────────

function DiffView({ lines }: { lines: DiffLine[] }): JSX.Element {
  return (
    <pre className="glass-diff__body">
      {lines.map((line, i) => {
        if (line.collapsed !== undefined) {
          return (
            <div key={i} className="glass-diff__line glass-diff__line--sentinel">
              ⋯ {line.collapsed} unchanged {line.collapsed === 1 ? "line" : "lines"}
            </div>
          );
        }
        const cls =
          line.op === "add"
            ? "glass-diff__line glass-diff__line--add"
            : line.op === "remove"
              ? "glass-diff__line glass-diff__line--remove"
              : "glass-diff__line glass-diff__line--equal";
        const prefix = line.op === "add" ? "+" : line.op === "remove" ? "−" : " ";
        return (
          <div key={i} className={cls}>
            <span className="glass-diff__gutter">{prefix}</span>
            <span className="glass-diff__text">{line.text}</span>
          </div>
        );
      })}
    </pre>
  );
}

// ── DesignCaptureCard (#163) ──────────────────────────────────────────────────

const DESIGN_ACTIONS: DesignToCodeAction[] = ["react", "html", "describe", "match-codebase"];

function DesignCaptureCard({ item }: { item: GlassCommandFeedItem }): JSX.Element {
  const state = useGlassState();
  const capture = state.designCaptures?.[item.id];
  const phase = capture?.phase ?? "ready";
  const statusLine = capture?.statusLine;
  const detectedFile = capture?.detectedFile;

  const isWorking = phase === "reading" || phase === "generating" || phase === "permission";

  return (
    <article
      className="overlay-design-card glass-answer-shell"
      data-testid="glass-design-capture-card"
      onPointerDownCapture={ensureOverlayInteractive}
    >
      <span className="glass-answer-shell__sheen" aria-hidden="true" />
      <button
        type="button"
        className="overlay-feed-card__dismiss-x"
        aria-label="Dismiss"
        title="Dismiss"
        onPointerDown={ensureOverlayInteractive}
        onClick={() => send({ type: "remove-command-feed-item", id: item.id })}
      >
        ×
      </button>

      <div className="overlay-design-card__inner">
        {/* Header */}
        <div className="overlay-design-card__header">
          <span className="overlay-design-card__icon" aria-hidden="true">✦</span>
          <span className="overlay-design-card__title">Design to Code</span>
          {detectedFile ? (
            <span className="overlay-design-card__file">{detectedFile.fileName}</span>
          ) : null}
        </div>

        {/* Screenshot thumbnail */}
        {item.designImageDataUrl ? (
          <div className="overlay-design-card__thumb-wrap">
            <img
              className="overlay-design-card__thumb"
              src={item.designImageDataUrl}
              alt="Captured screen"
            />
          </div>
        ) : null}

        {/* Permission prompt (match-codebase wants to read a file) */}
        {phase === "permission" && capture?.pendingAction === "match-codebase" && detectedFile ? (
          <div className="overlay-design-card__permission">
            <p className="overlay-design-card__permission-text">
              Allow Glass to read <strong>{detectedFile.fileName}</strong> to match your codebase style?
            </p>
            <div className="overlay-design-card__permission-btns">
              <button
                type="button"
                className="gbtn gbtn--primary"
                onPointerDown={ensureOverlayInteractive}
                onClick={() => send({
                  type: "design-grant-file-read",
                  feedItemId: item.id,
                  action: "match-codebase",
                })}
              >
                Allow
              </button>
              <button
                type="button"
                className="gbtn gbtn--ghost"
                onPointerDown={ensureOverlayInteractive}
                onClick={() => send({
                  type: "design-skip-file-read",
                  feedItemId: item.id,
                  action: "match-codebase",
                })}
              >
                Skip
              </button>
            </div>
          </div>
        ) : phase === "done" ? (
          <p className="overlay-design-card__status overlay-design-card__status--done">
            ✓ Generated — see response above
          </p>
        ) : isWorking ? (
          <p className="overlay-design-card__status overlay-design-card__status--working">
            <span className="overlay-design-card__spinner" aria-hidden="true" />
            {statusLine ?? "Working…"}
          </p>
        ) : (
          /* Stack selector + 4 quick-action buttons */
          <div className="overlay-design-card__actions">
            <div className="overlay-design-card__stack-row">
              <label className="overlay-design-card__stack-label" htmlFor="design-stack-select">Stack</label>
              <select
                id="design-stack-select"
                className="overlay-design-card__stack-select"
                value={(state.glassSettings.designStack ?? DEFAULT_DESIGN_STACK) as DesignStack}
                onChange={(e) => send({ type: "set-design-stack", stack: e.target.value as DesignStack })}
                onPointerDown={ensureOverlayInteractive}
              >
                {(Object.entries(DESIGN_STACK_LABELS) as [DesignStack, string][]).map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </select>
            </div>
            {DESIGN_ACTIONS.map((action) => {
              const currentStack = (state.glassSettings.designStack ?? DEFAULT_DESIGN_STACK) as DesignStack;
              return (
                <button
                  key={action}
                  type="button"
                  className="gbtn gbtn--ghost overlay-design-card__action-btn"
                  onPointerDown={ensureOverlayInteractive}
                  onClick={() => send({
                    type: "design-generate",
                    feedItemId: item.id,
                    action,
                  })}
                >
                  {getActionLabel(action, currentStack)}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <span className="glass-answer-shell__led ui-led-line" aria-hidden="true" />
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

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
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [refineText, setRefineText] = useState("");

  // Memoize the extracted code block so preview and apply use the same string
  const applyCode = useMemo(
    () => extractFirstCodeBlock(item.fullBody ?? item.body ?? "") ?? "",
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [item.id, item.fullBody, item.body],
  );

  // Pending diff state for this card (set by glass-preview-diff in main process)
  const pendingDiff = state.pendingDiffs?.[item.id];

  const handleRefine = useCallback(() => {
    if (!refineText.trim()) return;
    // Use designCaptureId (the capture card's id) because state.designCaptures is
    // keyed by capture id, not the response card id. Fall back to item.id only if
    // designCaptureId is somehow absent (shouldn't happen for design-generated cards).
    send({
      type: "design-generate",
      feedItemId: item.designCaptureId ?? item.id,
      action: item.designAction!,
      refinementFeedback: refineText.trim(),
    });
    setRefineText("");
  }, [refineText, item.designCaptureId, item.id, item.designAction]);

  const checkScrollMore = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setHasMore(el.scrollHeight - el.scrollTop - el.clientHeight > 8);
  }, []);

  useEffect(() => {
    checkScrollMore();
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(checkScrollMore);
    ro.observe(el);
    return () => ro.disconnect();
  }, [checkScrollMore, item]);
  const isListenInsight = Boolean(item.listenMomentId);
  const isTerminalFix = item.kind === "terminal-fix";
  const isLooking = item.kind === "looking";
  const isThinking = item.kind === "thinking";
  const isResponse = item.kind === "response";
  const isError = item.kind === "error";
  const isChat = isOverlayChatFeedKind(item.kind);

  // ── /run shell output card ────────────────────────────────────────────────
  if (item.kind === "shell" && item.shellOutputId) {
    return <ShellOutputCard id={item.shellOutputId} />;
  }

  // ── Terminal-fix card ─────────────────────────────────────────────────────
  if (isTerminalFix) {
    return (
      <article
        className="overlay-terminal-fix-card glass-answer-shell"
        data-testid="glass-terminal-fix-card"
        onPointerDownCapture={ensureOverlayInteractive}
      >
        <span className="glass-answer-shell__sheen" aria-hidden="true" />
        <button
          type="button"
          className="overlay-feed-card__dismiss-x"
          aria-label="Dismiss"
          title="Dismiss"
          onPointerDown={ensureOverlayInteractive}
          onClick={() => send({ type: "remove-command-feed-item", id: item.id })}
        >
          ×
        </button>
        <div className="overlay-terminal-fix-card__inner">
          {/* Header */}
          <div className="overlay-terminal-fix-card__header">
            <span className="overlay-terminal-fix-card__icon" aria-hidden="true">⬡</span>
            <span className="overlay-terminal-fix-card__label">Terminal error detected</span>
          </div>
          {/* Failed command */}
          {item.failedCommand ? (
            <div className="overlay-terminal-fix-card__failed">
              <span className="overlay-terminal-fix-card__failed-label">Failed:</span>
              <code className="overlay-terminal-fix-card__failed-cmd">{item.failedCommand}</code>
            </div>
          ) : null}
          {/* Explanation */}
          {item.body ? (
            <p className="overlay-terminal-fix-card__explanation glass-selectable-text"
              onContextMenu={prepareGlassTextContextMenu}
              onPointerDownCapture={prepareGlassTextPointerDown}
            >
              {item.body}
            </p>
          ) : null}
          {/* Fix command preview */}
          {item.fixCommand ? (
            <div className="overlay-terminal-fix-card__fix-row">
              <code className="overlay-terminal-fix-card__fix-cmd">{item.fixCommand}</code>
              <button
                type="button"
                className="gbtn gbtn--primary overlay-terminal-fix-card__fix-btn"
                data-testid="glass-terminal-fix-btn"
                onPointerDown={ensureOverlayInteractive}
                onClick={() => {
                  send({
                    type: "glass-terminal-fix-accept",
                    termId: item.termId ?? "",
                    command: item.fixCommand ?? "",
                  });
                  send({ type: "remove-command-feed-item", id: item.id });
                }}
              >
                ↳ Fix it
              </button>
            </div>
          ) : null}
        </div>
        <span className="glass-answer-shell__led ui-led-line" aria-hidden="true" />
      </article>
    );
  }

  // ── Design-to-Code capture card (#163) ───────────────────────────────────
  if (item.kind === "design-capture") {
    return <DesignCaptureCard item={item} />;
  }

  // ── Build-error card (#162) ───────────────────────────────────────────────
  if (item.kind === "build-error") {
    return (
      <article
        className="overlay-build-error-card glass-answer-shell"
        data-testid="glass-build-error-card"
        onPointerDownCapture={ensureOverlayInteractive}
      >
        <span className="glass-answer-shell__sheen" aria-hidden="true" />
        <button
          type="button"
          className="overlay-feed-card__dismiss-x"
          aria-label="Dismiss"
          title="Dismiss"
          onPointerDown={ensureOverlayInteractive}
          onClick={() => send({ type: "remove-command-feed-item", id: item.id })}
        >
          ×
        </button>
        <div className="overlay-build-error-card__inner">
          <div className="overlay-build-error-card__header">
            <span className="overlay-build-error-card__icon" aria-hidden="true">⚠</span>
            <span className="overlay-build-error-card__label">{item.title}</span>
          </div>
          <p className="overlay-build-error-card__snippet glass-selectable-text"
            onContextMenu={prepareGlassTextContextMenu}
            onPointerDownCapture={prepareGlassTextPointerDown}
          >
            {item.body}
          </p>
          {item.errorFilePaths && item.errorFilePaths.length > 0 ? (
            <p className="overlay-build-error-card__files">
              {item.errorFilePaths.map((f) => f.split("/").pop()).join(", ")}
            </p>
          ) : null}
          <div className="overlay-build-error-card__actions">
            <button
              type="button"
              className="gbtn gbtn--primary"
              data-testid="glass-build-fix-glass-btn"
              onPointerDown={ensureOverlayInteractive}
              onClick={() => {
                send({
                  type: "glass-build-fix-glass",
                  feedItemId: item.id,
                  errorText: item.errorText ?? item.body,
                  errorFilePaths: item.errorFilePaths ?? [],
                });
              }}
            >
              Fix with Glass
            </button>
            <button
              type="button"
              className="gbtn gbtn--ghost"
              onPointerDown={ensureOverlayInteractive}
              onClick={() => send({ type: "remove-command-feed-item", id: item.id })}
            >
              Dismiss
            </button>
          </div>
        </div>
        <span className="glass-answer-shell__led ui-led-line" aria-hidden="true" />
      </article>
    );
  }

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
    // During streaming, show the growing partial answer in place of the
    // generic "IIVO is thinking…" placeholder so tokens appear live.
    const streamingBody =
      isThinking && state.partialAnswer ? state.partialAnswer : null;
    const chatDisplayBody = streamingBody ?? displayBody;
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
        {!item.pinned ? (
          <button
            type="button"
            className="overlay-feed-card__dismiss-x"
            aria-label="Dismiss"
            title="Dismiss"
            onPointerDown={ensureOverlayInteractive}
            onClick={() => send({ type: "remove-command-feed-item", id: item.id })}
          >
            ×
          </button>
        ) : null}
        <div
          className="glass-answer-shell__content glass-chat-reply__content"
          onContextMenu={prepareGlassTextContextMenu}
          onPointerDownCapture={prepareGlassTextPointerDown}
        >
          <p className="glass-chat-reply__prompt glass-selectable-text">{prompt}</p>
          <div
            ref={scrollRef}
            className="glass-chat-reply__scroll"
            onScroll={checkScrollMore}
          >
            {isPending || isError ? (
              <p
                className={`glass-chat-reply__answer glass-selectable-text${isPending && !streamingBody ? " glass-chat-reply__answer--pending" : ""}${isError ? " glass-chat-reply__answer--error" : ""}`}
              >
                {chatDisplayBody}
              </p>
            ) : (
              <div className="glass-chat-reply__answer glass-selectable-text">
                <GlassMarkdown>{chatDisplayBody ?? ""}</GlassMarkdown>
              </div>
            )}
            {hasMore && !isPending ? (
              <div className="glass-chat-reply__scroll-more" aria-hidden="true">
                <span className="glass-chat-reply__scroll-more-arrow">↓</span>
              </div>
            ) : null}
          </div>
          {!isPending ? (
            <div
              className="overlay-feed-card__actions glass-chat-reply__actions"
              onPointerDownCapture={ensureOverlayInteractive}
            >
              {(isResponse || isError) && item.body ? (
                <CopyButton
                  className="gbtn gbtn--ghost"
                  data-testid="glass-overlay-copy"
                  text={item.fullBody ?? item.body ?? ""}
                />
              ) : null}
              {isResponse && item.body ? (
                <>
                  <button
                    type="button"
                    className="gbtn gbtn--ghost"
                    data-testid="glass-overlay-type-back"
                    onPointerDown={ensureOverlayInteractive}
                    onClick={() => {
                      send({
                        type: "inject-keystrokes",
                        text: item.fullBody ?? item.body ?? "",
                        id: item.id + "-type",
                        targetApp: state.previousApp,
                      });
                    }}
                  >
                    Type it back
                  </button>
                  <button
                    type="button"
                    className="gbtn gbtn--ghost"
                    data-testid="glass-overlay-write-file"
                    onPointerDown={ensureOverlayInteractive}
                    onClick={() => {
                      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
                      send({
                        type: "write-file",
                        path: `~/Desktop/glass-${ts}.md`,
                        content: item.fullBody ?? item.body ?? "",
                        id: item.id + "-file",
                      });
                    }}
                  >
                    Write to file
                  </button>
                  {item.codeFilePath && hasCodeBlock(item.fullBody ?? item.body ?? "") ? (
                    pendingDiff ? (
                      // diff loading / ready / error → show Cancel + (if ready) Apply
                      <>
                        {pendingDiff.status === "ready" && !pendingDiff.diff?.unchanged ? (
                          <button
                            type="button"
                            className="gbtn gbtn--primary"
                            data-testid="glass-overlay-apply-confirm"
                            onPointerDown={ensureOverlayInteractive}
                            onClick={() => {
                              send({
                                type: "glass-apply-fix-to-file",
                                feedItemId: item.id,
                                filePath: item.codeFilePath!,
                                code: pendingDiff.code ?? applyCode,
                                expectedHash: pendingDiff.contentHash,
                              });
                            }}
                          >
                            Apply
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="gbtn gbtn--ghost"
                          data-testid="glass-overlay-apply-cancel"
                          onPointerDown={ensureOverlayInteractive}
                          onClick={() => send({ type: "glass-dismiss-diff", feedItemId: item.id })}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      // idle → show Apply to file button
                      <button
                        type="button"
                        className="gbtn gbtn--ghost"
                        data-testid="glass-overlay-apply-to-file"
                        onPointerDown={ensureOverlayInteractive}
                        onClick={() => {
                          send({
                            type: "glass-preview-diff",
                            feedItemId: item.id,
                            filePath: item.codeFilePath!,
                            code: applyCode,
                          });
                        }}
                      >
                        Apply to file
                      </button>
                    )
                  ) : null}
                  {!item.codeFilePath && item.designAction && item.designAction !== "describe" && hasCodeBlock(item.fullBody ?? item.body ?? "") ? (
                    <button
                      type="button"
                      className="gbtn gbtn--ghost"
                      data-testid="glass-overlay-save-component"
                      onPointerDown={ensureOverlayInteractive}
                      onClick={() => {
                        // Use the stack snapshotted at generation time, not the live setting.
                        const ext = DESIGN_STACK_EXTENSIONS[item.designStack ?? state.glassSettings.designStack ?? DEFAULT_DESIGN_STACK] ?? ".tsx";
                        const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
                        send({
                          type: "write-file",
                          path: `~/Desktop/component-${ts}${ext}`,
                          content: applyCode,
                          id: item.id + "-save",
                        });
                      }}
                    >
                      Save component
                    </button>
                  ) : null}
                </>
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
          {pendingDiff ? (
            <div className="glass-diff">
              <div className="glass-diff__header">
                <span className="glass-diff__filename">{item.codeFilePath ? item.codeFilePath.split("/").pop() : "file"}</span>
                {pendingDiff.status === "loading" ? (
                  <span className="glass-diff__meta">Reading file…</span>
                ) : pendingDiff.status === "error" ? (
                  <span className="glass-diff__meta glass-diff__meta--error">{pendingDiff.message ?? "Error"}</span>
                ) : pendingDiff.diff?.unchanged ? (
                  <span className="glass-diff__meta">No changes</span>
                ) : pendingDiff.diff ? (
                  <span className="glass-diff__meta">
                    <span className="glass-diff__add-count">+{pendingDiff.diff.added}</span>
                    {" "}
                    <span className="glass-diff__rem-count">−{pendingDiff.diff.removed}</span>
                  </span>
                ) : null}
              </div>
              {pendingDiff.status === "ready" && pendingDiff.displayLines && !pendingDiff.diff?.unchanged ? (
                <DiffView lines={pendingDiff.displayLines} />
              ) : null}
            </div>
          ) : null}
          {state.actionResult && (state.actionResult.id === item.id + "-type" || state.actionResult.id === item.id + "-file" || state.actionResult.id === item.id + "-apply" || state.actionResult.id === item.id + "-save") ? (
            <p className="glass-action-feedback" style={{ fontSize: "11px", opacity: 0.7, marginTop: "4px", color: state.actionResult.status === "ok" ? "#6fff8e" : "#ff6b6b" }}>
              {state.actionResult.status === "ok" ? "✓ " : "✗ "}{state.actionResult.message}
            </p>
          ) : null}
          {/* Restore backup — shown after a successful apply or after a restore attempt (#163) */}
          {item.codeFilePath && (
            state.actionResult?.id === item.id + "-apply" && state.actionResult.status === "ok" ||
            state.actionResult?.id === item.id + "-restore"
          ) ? (
            <div className="glass-restore-row">
              {state.actionResult?.id === item.id + "-restore" ? (
                /* After restore attempt — show feedback + allow re-restore */
                <span className="glass-restore-feedback" style={{ color: state.actionResult.status === "ok" ? "#6fff8e" : "#ff6b6b" }}>
                  {state.actionResult.status === "ok" ? "✓ Original restored" : `✗ ${state.actionResult.message}`}
                </span>
              ) : (
                /* After successful apply — offer restore */
                <button
                  type="button"
                  className="gbtn gbtn--ghost glass-restore-btn"
                  onPointerDown={ensureOverlayInteractive}
                  onClick={() => send({
                    type: "glass-restore-backup",
                    feedItemId: item.id,
                    filePath: item.codeFilePath!,
                  })}
                >
                  ↩ Restore original
                </button>
              )}
            </div>
          ) : null}
          {/* Build verification status (#163) */}
          {(() => {
            const verify = state.buildVerifications?.[item.id];
            if (!verify) return null;
            return (
              <div className="glass-verify-row">
                {verify.status === "running" ? (
                  <span className="glass-verify-row__running">
                    <span className="overlay-design-card__spinner" aria-hidden="true" />
                    Verifying… <code>{verify.command}</code>
                  </span>
                ) : verify.status === "ok" ? (
                  <span className="glass-verify-row__ok">✓ Build passed</span>
                ) : verify.status === "not-found" ? (
                  <span className="glass-verify-row__warn">⚠ No build command found — verify manually</span>
                ) : (
                  <span className="glass-verify-row__fail">✗ Build failed — see error card</span>
                )}
              </div>
            );
          })()}
          {/* Refinement input (#166) */}
          {item.designAction && item.designAction !== "describe" && hasCodeBlock(item.fullBody ?? item.body ?? "") ? (
            <div className="overlay-feed-card__refine-row" onPointerDownCapture={ensureOverlayInteractive}>
              <input
                className="overlay-feed-card__refine-input"
                type="text"
                placeholder="Refine this component…"
                value={refineText}
                onChange={e => setRefineText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && refineText.trim()) {
                    handleRefine();
                  }
                }}
              />
              <button
                className="overlay-feed-card__refine-btn"
                type="button"
                onPointerDown={ensureOverlayInteractive}
                onClick={handleRefine}
                disabled={!refineText.trim()}
              >
                Refine
              </button>
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
      {!item.pinned ? (
        <button
          type="button"
          className="overlay-feed-card__dismiss-x"
          aria-label="Dismiss"
          title="Dismiss"
          onClick={() => send({ type: "remove-command-feed-item", id: item.id })}
        >
          ×
        </button>
      ) : null}
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
