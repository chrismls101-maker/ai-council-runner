import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { AgentScreenContext } from "../../shared/ipc.ts";
import type { CoderAgentModelId } from "../../shared/coderAgentModels.ts";
import type { GlassCoderComposerMode } from "../../shared/glassComposerMode.ts";
import {
  estimateComposerPromptTokens,
  formatComposerTokenCounter,
  resolveContextWindowTokens,
} from "../../shared/coderAgentModels.ts";
import { filterComposerMentionCandidates } from "../../shared/glassIdeComposerMentions.ts";
import { GlassHoverTooltip } from "../components/GlassHoverTooltip.tsx";
import { ensureOverlayInteractive, prepareGlassTextPointerDown, prepareGlassTextContextMenu } from "../glassTextInteraction.ts";
import { GlassIdeModelSelector } from "./GlassIdeModelSelector.tsx";
import { GlassIdeComposerModeSelect } from "./GlassIdeComposerModeSelect.tsx";

interface GlassIdeStreamComposerProps {
  placeholder: string;
  prompt: string;
  onPromptChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onRun: () => void;
  onStop: () => void;
  textareaRef: RefObject<HTMLTextAreaElement>;
  outputFolderLabel: string;
  agentRunning: boolean;
  coderModelId: CoderAgentModelId;
  composerMode: GlassCoderComposerMode;
  screenDetecting: boolean;
  screenContext: AgentScreenContext | null;
  onDismissScreenContext: () => void;
}

function ComposerActionIcon({
  mode,
}: {
  mode: "detecting" | "send" | "stop";
}): JSX.Element {
  if (mode === "detecting") {
    return (
      <svg className="gide-composer-run__icon gide-composer-run__icon--spin" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="8 12" />
      </svg>
    );
  }
  if (mode === "stop") {
    return (
      <svg className="gide-composer-run__icon" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <rect x="4" y="4" width="6" height="6" rx="1" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg className="gide-composer-run__icon" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M7 3v8M7 3L4.5 5.5M7 3l2.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function mentionQueryAtCursor(prompt: string, cursor: number): { query: string; start: number } | null {
  const before = prompt.slice(0, cursor);
  const at = before.lastIndexOf("@");
  if (at < 0) return null;
  const fragment = before.slice(at + 1);
  if (fragment.includes(" ") || fragment.includes("\n")) return null;
  return { query: fragment, start: at };
}

export function GlassIdeStreamComposer({
  placeholder,
  prompt,
  onPromptChange,
  onKeyDown,
  onRun,
  onStop,
  textareaRef,
  outputFolderLabel,
  agentRunning,
  coderModelId,
  composerMode,
  screenDetecting,
  screenContext,
  onDismissScreenContext,
}: GlassIdeStreamComposerProps): JSX.Element {
  const [projectPaths, setProjectPaths] = useState<string[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionListRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    let cancelled = false;
    void window.glass.glassIdeListProject().then((res) => {
      if (cancelled || !res.ok || !res.entries) return;
      setProjectPaths(res.entries.filter((e) => !e.isDirectory).map((e) => e.relativePath));
    });
    return () => { cancelled = true; };
  }, []);

  const mentionCandidates = useMemo(
    () => filterComposerMentionCandidates(mentionQuery, projectPaths),
    [mentionQuery, projectPaths],
  );

  const syncMentionState = useCallback((): void => {
    const el = textareaRef.current;
    if (!el) {
      setMentionOpen(false);
      return;
    }
    const ctx = mentionQueryAtCursor(prompt, el.selectionStart ?? prompt.length);
    if (!ctx) {
      setMentionOpen(false);
      return;
    }
    setMentionOpen(true);
    setMentionQuery(ctx.query);
    setMentionIndex(0);
  }, [prompt, textareaRef]);

  const insertMention = useCallback((relativePath: string): void => {
    const el = textareaRef.current;
    const cursor = el?.selectionStart ?? prompt.length;
    const ctx = mentionQueryAtCursor(prompt, cursor);
    if (!ctx) return;
    const before = prompt.slice(0, ctx.start);
    const after = prompt.slice(cursor);
    const next = `${before}@${relativePath} ${after}`;
    onPromptChange(next);
    setMentionOpen(false);
    requestAnimationFrame(() => {
      const target = textareaRef.current;
      if (!target) return;
      const pos = before.length + relativePath.length + 2;
      target.focus();
      target.setSelectionRange(pos, pos);
    });
  }, [onPromptChange, prompt, textareaRef]);

  const handleComposerKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (mentionOpen && mentionCandidates.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => Math.min(mentionCandidates.length - 1, i + 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(mentionCandidates[mentionIndex] ?? mentionCandidates[0]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionOpen(false);
        return;
      }
    }
    onKeyDown(e);
  }, [insertMention, mentionCandidates, mentionIndex, mentionOpen, onKeyDown]);

  const isStopMode = agentRunning;
  const actionMode = screenDetecting ? "detecting" : isStopMode ? "stop" : "send";
  const sendDisabled = !prompt.trim() || screenDetecting;
  const tokenCounter = formatComposerTokenCounter(
    estimateComposerPromptTokens(prompt),
    resolveContextWindowTokens(coderModelId, prompt),
  );
  const actionLabel = screenDetecting
    ? "Detecting active file on screen"
    : isStopMode
      ? "Stop Glass Coder"
      : "Send to Glass Coder (Enter)";

  const handleAction = (): void => {
    if (isStopMode) {
      onStop();
      return;
    }
    if (!sendDisabled) onRun();
  };

  return (
    <div className="gide-stream-composer" data-testid="glass-ide-stream-composer">
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
        <div className="gide-composer-input-wrap">
          {mentionOpen && mentionCandidates.length > 0 ? (
            <ul
              ref={mentionListRef}
              className="gide-composer-mentions"
              data-testid="glass-ide-composer-mentions"
              role="listbox"
            >
              {mentionCandidates.map((path, i) => (
                <li key={path}>
                  <button
                    type="button"
                    className={`gide-composer-mentions__item${i === mentionIndex ? " gide-composer-mentions__item--active" : ""}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => insertMention(path)}
                    onPointerDown={ensureOverlayInteractive}
                  >
                    @{path}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <textarea
            ref={textareaRef}
            className="gide-composer-input"
            placeholder={placeholder}
            value={prompt}
            onChange={(e) => {
              onPromptChange(e.target.value);
              requestAnimationFrame(syncMentionState);
            }}
            onPointerDown={prepareGlassTextPointerDown}
            onKeyDown={handleComposerKeyDown}
            onKeyUp={syncMentionState}
            onClick={syncMentionState}
            onContextMenu={prepareGlassTextContextMenu}
            rows={2}
          />
          <div className="gide-composer-input-bar">
            <div className="gide-composer-input-bar__left">
              <GlassIdeComposerModeSelect mode={composerMode} disabled={agentRunning} />
              <GlassIdeModelSelector modelId={coderModelId} disabled={agentRunning} />
            </div>
            <GlassHoverTooltip label={actionLabel} placement="top">
              <button
                type="button"
                className={`gide-composer-run${
                  isStopMode
                    ? " gide-composer-run--stop"
                    : sendDisabled
                      ? " gide-composer-run--disabled"
                      : " gide-composer-run--ready"
                }`}
                disabled={!isStopMode && sendDisabled}
                onClick={handleAction}
                onPointerDown={ensureOverlayInteractive}
                aria-label={actionLabel}
                data-testid={isStopMode ? "glass-ide-composer-stop" : "glass-ide-composer-send"}
              >
                <ComposerActionIcon mode={actionMode} />
              </button>
            </GlassHoverTooltip>
          </div>
        </div>
      </div>
      <div className="gide-chat-footer">
        <span>
          {isStopMode
            ? "■ stop in composer · Shift+↵ newline"
            : "↵ send · Shift+↵ newline · @ file"} · Files → {outputFolderLabel}
        </span>
        <span className="gide-composer-token-counter" data-testid="glass-ide-composer-token-counter">
          {tokenCounter}
        </span>
      </div>
    </div>
  );
}
