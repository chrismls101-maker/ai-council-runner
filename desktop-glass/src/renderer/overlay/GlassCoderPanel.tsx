import type { GlassState } from "../../shared/ipc.ts";
import { GlassHoverTooltip } from "../components/GlassHoverTooltip.tsx";
import { ensureOverlayInteractive } from "../glassTextInteraction.ts";
import { GlassCoderStream, coderStreamStatusLabel } from "./GlassCoderStream.tsx";
import { useCoderPanelResize } from "./useCoderPanelResize.ts";
import "./GlassCoderPanel.css";

interface GlassCoderPanelProps {
  open: boolean;
  widthPx: number;
  onWidthChange: (width: number) => void;
  onClose: () => void;
  state: GlassState;
  answer: string;
  prompt: string;
  runId: string | null;
}

function interactivePointerProps(): {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerEnter: () => void;
} {
  return {
    onPointerDown: (e) => {
      e.stopPropagation();
      ensureOverlayInteractive();
    },
    onPointerEnter: ensureOverlayInteractive,
  };
}

export function GlassCoderPanel({
  open,
  widthPx,
  onWidthChange,
  onClose,
  state,
  answer,
  prompt,
  runId,
}: GlassCoderPanelProps): JSX.Element {
  const onResize = useCoderPanelResize(widthPx, onWidthChange);

  const pending = state.agentPendingApproval;
  const activeRunId =
    state.agentRun?.agentId === "coder" ? state.agentRun.runId : runId;
  const showApproval = pending && pending.runId === activeRunId;
  const workspaceLocked =
    (state.agentRun?.agentId === "coder" && state.agentRun.status === "running")
    || Boolean(showApproval);

  const handleClose = (): void => {
    if (workspaceLocked) return;
    window.glass.coderWorkspaceClose();
    onClose();
  };

  const handleStop = (): void => {
    window.glass.agentStop();
    window.glass.coderWorkspaceClose();
  };

  return (
    <div
      className={`gcp-panel${open ? " gcp-panel--open" : ""}`}
      style={{ width: widthPx }}
      data-testid="glass-coder-panel"
      aria-hidden={!open}
      onPointerDownCapture={ensureOverlayInteractive}
    >
      <div
        className="gcp-resize-handle"
        onPointerDown={(e) => {
          ensureOverlayInteractive();
          onResize(e);
        }}
        aria-label="Resize panel"
      />

      <div className="gcp-header">
        <span className="gcp-title">
          {coderStreamStatusLabel(
            state.agentRun ?? null,
            pending ?? null,
            activeRunId,
            state.coderLoopIteration,
          )}
        </span>
        <div className="gcp-header-actions">
          {state.agentRun?.status === "running" ? (
            <GlassHoverTooltip label="Stop agent" placement="bottom">
              <button
                type="button"
                className="gcp-icon-btn gcp-icon-btn--stop"
                onClick={handleStop}
                aria-label="Stop agent"
                {...interactivePointerProps()}
              >
                ■
              </button>
            </GlassHoverTooltip>
          ) : null}
          <GlassHoverTooltip
            label={workspaceLocked ? "Stop the agent or finish approval before closing" : "Close Coder workspace"}
            placement="bottom"
          >
            <button
              type="button"
              className="gcp-icon-btn"
              onClick={handleClose}
              disabled={workspaceLocked}
              aria-label="Close Coder workspace"
              {...interactivePointerProps()}
            >
              ✕
            </button>
          </GlassHoverTooltip>
        </div>
      </div>

      <GlassCoderStream
        state={state}
        answer={answer}
        prompt={prompt}
        runId={runId}
      />
    </div>
  );
}
