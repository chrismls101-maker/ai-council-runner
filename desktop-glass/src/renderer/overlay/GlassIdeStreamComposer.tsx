import type { RefObject } from "react";
import type { AgentScreenContext } from "../../shared/ipc.ts";
import { GlassHoverTooltip } from "../components/GlassHoverTooltip.tsx";
import { ensureOverlayInteractive, prepareGlassTextPointerDown } from "../glassTextInteraction.ts";

interface GlassIdeStreamComposerProps {
  placeholder: string;
  prompt: string;
  onPromptChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onRun: () => void;
  onPickWorkspace: () => void;
  textareaRef: RefObject<HTMLTextAreaElement>;
  workspaceLabel?: string;
  outputFolderLabel: string;
  agentRunning: boolean;
  screenDetecting: boolean;
  screenContext: AgentScreenContext | null;
  onDismissScreenContext: () => void;
}

function ComposerRunIcon({ detecting }: { detecting: boolean }): JSX.Element {
  if (detecting) {
    return (
      <svg className="gide-composer-run__icon gide-composer-run__icon--spin" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="8 12" />
      </svg>
    );
  }
  return (
    <svg className="gide-composer-run__icon" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M4.5 3.2v7.6L10.8 7 4.5 3.2z" fill="currentColor" />
    </svg>
  );
}

export function GlassIdeStreamComposer({
  placeholder,
  prompt,
  onPromptChange,
  onKeyDown,
  onRun,
  onPickWorkspace,
  textareaRef,
  workspaceLabel,
  outputFolderLabel,
  agentRunning,
  screenDetecting,
  screenContext,
  onDismissScreenContext,
}: GlassIdeStreamComposerProps): JSX.Element {
  const runDisabled =
    !prompt.trim()
    || agentRunning
    || !workspaceLabel
    || screenDetecting;

  const runLabel = screenDetecting
    ? "Detecting active file on screen"
    : !workspaceLabel
      ? "Set a project folder first"
      : "Run Glass Coder (Enter)";

  return (
    <div className="gide-stream-composer" data-testid="glass-ide-stream-composer">
      <div className="gide-composer-toolbar">
        <GlassHoverTooltip label="Choose project root folder for Glass Coder" placement="top">
          <button
            type="button"
            className="gide-workspace-btn"
            onClick={onPickWorkspace}
            onPointerDown={ensureOverlayInteractive}
            aria-label="Project folder"
          >
            Project → {workspaceLabel ?? "Choose folder…"}
          </button>
        </GlassHoverTooltip>
        {!workspaceLabel ? (
          <GlassHoverTooltip label="Set project folder for Glass Coder" placement="top">
            <button
              type="button"
              className="gide-workspace-btn gide-workspace-btn--set"
              onClick={onPickWorkspace}
              onPointerDown={ensureOverlayInteractive}
              aria-label="Set project folder"
            >
              Set folder
            </button>
          </GlassHoverTooltip>
        ) : null}
      </div>
      {screenContext?.detectError ? (
        <div className="gide-detected gide-detected--error">{screenContext.detectError}</div>
      ) : null}
      {screenDetecting ? (
        <div className="gide-detected gide-detected--pending">Scanning screen for active file…</div>
      ) : null}
      {!screenDetecting && screenContext?.detectedFilePath ? (
        <div className="gide-detected">
          <span>Detected: {screenContext.detectedFilePath.split("/").pop()}</span>
          <GlassHoverTooltip label="Dismiss detected file" placement="top">
            <button
              type="button"
              className="gide-detected-dismiss"
              onClick={onDismissScreenContext}
              onPointerDown={ensureOverlayInteractive}
              aria-label="Dismiss detected file"
            >
              ✕
            </button>
          </GlassHoverTooltip>
        </div>
      ) : null}
      <div className="gide-composer-field">
        <textarea
          ref={textareaRef}
          className="gide-composer-input"
          placeholder={placeholder}
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          onPointerDown={prepareGlassTextPointerDown}
          onKeyDown={onKeyDown}
          rows={2}
          disabled={agentRunning}
        />
        <GlassHoverTooltip label={runLabel} placement="top">
          <button
            type="button"
            className={`gide-composer-run${runDisabled ? " gide-composer-run--disabled" : " gide-composer-run--ready"}`}
            disabled={runDisabled}
            onClick={onRun}
            onPointerDown={ensureOverlayInteractive}
            aria-label={runLabel}
          >
            <ComposerRunIcon detecting={screenDetecting} />
          </button>
        </GlassHoverTooltip>
      </div>
      <div className="gide-chat-footer">
        <span>↵ run · Shift+↵ newline · Files → {outputFolderLabel}</span>
      </div>
    </div>
  );
}
