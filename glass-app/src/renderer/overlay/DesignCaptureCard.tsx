import type { GlassCommandFeedItem } from "../../shared/commandFeed.ts";
import {
  DEFAULT_DESIGN_STACK,
  DESIGN_STACK_LABELS,
  getActionLabel,
  isDesignPhaseWorking,
  normalizeDesignPhase,
  type DesignStack,
  type DesignToCodeAction,
} from "../../shared/designToCode.ts";
import { send, useGlassState } from "../useGlassState.ts";
import { ensureOverlayInteractive } from "../glassTextInteraction.ts";

const DESIGN_ACTIONS: DesignToCodeAction[] = ["react", "html", "describe", "match-codebase"];

function qualityNeedsBanner(
  quality: import("../../shared/designToCode.ts").DesignCaptureQuality | undefined,
  acknowledged?: boolean,
): boolean {
  if (acknowledged || !quality) return false;
  return quality.confidence < 0.55 || quality.issues.length > 0;
}

function phaseLabel(phase: ReturnType<typeof normalizeDesignPhase>): string | null {
  switch (phase) {
    case "reading": return "Reading file…";
    case "analyzing": return "Analyzing";
    case "generating": return "Generating";
    case "verifying": return "Verifying";
    case "awaiting_permission": return "Permission";
    default: return null;
  }
}

function DesignActionPanel({
  itemId,
  stack,
}: {
  itemId: string;
  stack: DesignStack;
}): JSX.Element {
  return (
    <div className="overlay-design-card__actions">
      <div className="overlay-design-card__stack-row">
        <label className="overlay-design-card__stack-label" htmlFor={`design-stack-${itemId}`}>
          Stack
        </label>
        <select
          id={`design-stack-${itemId}`}
          className="overlay-design-card__stack-select"
          value={stack}
          onChange={(e) => send({ type: "set-design-stack", stack: e.target.value as DesignStack })}
          onPointerDown={ensureOverlayInteractive}
        >
          {(Object.entries(DESIGN_STACK_LABELS) as [DesignStack, string][]).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>
      </div>
      {DESIGN_ACTIONS.map((action) => (
        <button
          key={action}
          type="button"
          className="gbtn gbtn--ghost overlay-design-card__action-btn"
          onPointerDown={ensureOverlayInteractive}
          onClick={() => send({
            type: "design-generate",
            feedItemId: itemId,
            action,
          })}
        >
          {getActionLabel(action, stack)}
        </button>
      ))}
    </div>
  );
}

export function DesignCaptureCard({ item }: { item: GlassCommandFeedItem }): JSX.Element {
  const state = useGlassState();
  const capture = state.designCaptures?.[item.id];
  const phase = normalizeDesignPhase(capture?.phase ?? "ready");
  const statusLine = capture?.statusLine;
  const detectedFile = capture?.detectedFile;
  const quality = capture?.quality;
  const currentStack = (state.glassSettings.designStack ?? DEFAULT_DESIGN_STACK) as DesignStack;

  const showPermission = phase === "awaiting_permission";
  const isWorking = isDesignPhaseWorking(phase) && !showPermission;
  const isDone = phase === "done";
  const isFailed = phase === "failed";
  const showActions = !showPermission && !isWorking && !isDone;
  const showQualityBanner = qualityNeedsBanner(quality, capture?.qualityAcknowledged) && showActions;
  const badge = phaseLabel(phase);

  return (
    <article
      className="overlay-design-card glass-answer-shell"
      data-testid="glass-design-capture-card"
      data-phase={phase}
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
        <div className="overlay-design-card__header">
          <span className="overlay-design-card__icon" aria-hidden="true">✦</span>
          <span className="overlay-design-card__title">Design to Code</span>
          {badge ? (
            <span className="overlay-design-card__phase-badge">{badge}</span>
          ) : null}
          {detectedFile ? (
            <span className="overlay-design-card__file">{detectedFile.fileName}</span>
          ) : null}
        </div>

        {item.designImageDataUrl ? (
          <div className="overlay-design-card__thumb-wrap">
            <img
              className="overlay-design-card__thumb"
              src={item.designImageDataUrl}
              alt="Captured screen"
            />
          </div>
        ) : null}

        {showQualityBanner ? (
          <div className="overlay-design-card__quality" role="status">
            <div className="overlay-design-card__quality-icon" aria-hidden="true">⚠</div>
            <div className="overlay-design-card__quality-body">
              <p className="overlay-design-card__quality-text">
                {quality?.recommendation ?? "Capture quality may affect fidelity."}
              </p>
              {quality?.issues.length ? (
                <p className="overlay-design-card__quality-issues">
                  {quality.issues.join(" · ")}
                </p>
              ) : null}
            </div>
            <div className="overlay-design-card__quality-actions">
              <button
                type="button"
                className="gbtn gbtn--ghost overlay-design-card__recapture-btn"
                onPointerDown={ensureOverlayInteractive}
                onClick={() => send({ type: "design-recapture", feedItemId: item.id })}
              >
                Recapture
              </button>
              <button
                type="button"
                className="gbtn gbtn--primary overlay-design-card__continue-btn"
                onPointerDown={ensureOverlayInteractive}
                onClick={() => send({ type: "design-ack-quality", feedItemId: item.id })}
              >
                Continue anyway
              </button>
            </div>
          </div>
        ) : null}

        {showPermission && capture?.pendingAction === "match-codebase" && detectedFile ? (
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
        ) : isDone ? (
          <div className="overlay-design-card__done-block">
            {capture?.glassProjectSaveStatus === "pending" ? (
              <p className="overlay-design-card__status overlay-design-card__status--working">
                <span className="overlay-design-card__spinner" aria-hidden="true" />
                Saving to Glass Storage…
              </p>
            ) : capture?.glassProjectSaveStatus === "saved" ? (
              <p className="overlay-design-card__status overlay-design-card__status--done">
                ✓ Saved to Glass Storage → Projects
              </p>
            ) : capture?.glassProjectSaveStatus === "failed" ? (
              <p className="overlay-design-card__status overlay-design-card__status--failed">
                Generated — saving to Projects failed
                {capture.glassProjectSaveError ? `: ${capture.glassProjectSaveError}` : ""}
              </p>
            ) : (
              <p className="overlay-design-card__status overlay-design-card__status--done">
                ✓ Generated — see response above
              </p>
            )}
            <div className="overlay-design-card__toolbar">
              {capture?.glassProjectSaveStatus === "saved" ? (
                <button
                  type="button"
                  className="overlay-design-card__toolbar-link"
                  onPointerDown={ensureOverlayInteractive}
                  onClick={() => {
                    const projectId = capture?.glassProjectId ?? item.id;
                    window.glass.openGlassStorageProjects(projectId);
                  }}
                >
                  View in Projects
                </button>
              ) : capture?.glassProjectSaveStatus === "failed" ? (
                <button
                  type="button"
                  className="overlay-design-card__toolbar-link"
                  onPointerDown={ensureOverlayInteractive}
                  onClick={() => send({ type: "design-retry-save", feedItemId: item.id })}
                >
                  Retry save
                </button>
              ) : null}
              <button
                type="button"
                className="overlay-design-card__toolbar-link"
                onPointerDown={ensureOverlayInteractive}
                onClick={() => send({ type: "design-recapture", feedItemId: item.id })}
              >
                Recapture screen
              </button>
            </div>
          </div>
        ) : isFailed ? (
          <>
            <p className="overlay-design-card__status overlay-design-card__status--failed">
              {statusLine ?? "Generation failed — try again."}
            </p>
            <DesignActionPanel itemId={item.id} stack={currentStack} />
          </>
        ) : isWorking ? (
          <p className="overlay-design-card__status overlay-design-card__status--working">
            <span className="overlay-design-card__spinner" aria-hidden="true" />
            {statusLine ?? "Working…"}
          </p>
        ) : (
          <>
            <div className="overlay-design-card__toolbar">
              <button
                type="button"
                className="overlay-design-card__toolbar-link"
                onPointerDown={ensureOverlayInteractive}
                onClick={() => send({ type: "design-recapture", feedItemId: item.id })}
              >
                Recapture screen
              </button>
            </div>
            <DesignActionPanel itemId={item.id} stack={currentStack} />
          </>
        )}
      </div>

      <span className="glass-answer-shell__led ui-led-line" aria-hidden="true" />
    </article>
  );
}
