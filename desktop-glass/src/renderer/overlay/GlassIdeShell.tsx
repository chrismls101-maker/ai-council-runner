/**
 * Glass IDE shell — Tier B layout: tree | editor+terminal | stream.
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { AgentScreenContext, GlassState, OpenCoderWithPromptPayload } from "../../shared/ipc.ts";
import { GLASS_AGENT_CATALOG } from "../../shared/agentCatalog.ts";
import { displayAgentOutputFolder } from "../../shared/agentOutputFolder.ts";
import {
  clampGlassIdeEditorSplitRatio,
  clampGlassIdeEditorRatioForTerminalExpand,
  clampGlassIdeStreamWidthPx,
  clampGlassIdeTreeWidthPx,
  defaultGlassIdeTerminalExpandedEditorRatio,
  GLASS_IDE_STREAM_WIDTH_MAX,
  GLASS_IDE_STREAM_WIDTH_MIN,
  GLASS_IDE_TERMINAL_COLLAPSE_SNAP_PX,
  GLASS_IDE_TERMINAL_COLLAPSED_CHROME_PX,
  GLASS_IDE_TREE_WIDTH_MAX,
  GLASS_IDE_TREE_WIDTH_MIN,
  resolveGlassIdeLayout,
} from "../../shared/glassIdeLayout.ts";
import {
  isFreshScreenContext,
  lowConfidenceScreenContext,
  SCREEN_DETECT_CACHE_MS,
  SCREEN_DETECT_TIMEOUT_MS,
  screenDetectTimeout,
} from "../../shared/screenDetect.ts";
import { GlassHoverTooltip } from "../components/GlassHoverTooltip.tsx";
import { GlassTerminalPanel } from "../dock/GlassTerminalPanel.tsx";
import { GlassCoderStream, coderStreamStatusLabel } from "./GlassCoderStream.tsx";
import { GlassIdeStream } from "./GlassIdeStream.tsx";
import "./GlassIdeStream.css";
import { GlassQaModeNotification } from "./GlassQaModeNotification.tsx";
import "./GlassQaBoard.css";
import { GlassIdeEditorPane } from "./GlassIdeEditorPane.tsx";
import { GlassIdeFileTree, GideSidebarChevron } from "./GlassIdeFileTree.tsx";
import { GlassIdeStreamComposer } from "./GlassIdeStreamComposer.tsx";
import { useSplitWithValue, armIdeOverlayDrag, releaseIdeOverlayDrag } from "./useSplit.ts";
import {
  deriveGlassIdePresencePhase,
  glassIdePresenceLabel,
} from "../../shared/glassIdePresence.ts";
import { ensureOverlayInteractive, armIdeOverlayPointer } from "../glassTextInteraction.ts";
import { send } from "../useGlassState.ts";
import "./GlassIdeShell.css";

const CODER_DEF = GLASS_AGENT_CATALOG.find((d) => d.id === "coder")!;

function createRunId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `agent-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

interface GlassIdeShellProps {
  state: GlassState;
  answer: string;
  prompt: string;
  runId: string | null;
  onLaunchConsumed?: () => void;
  launchPrompt?: OpenCoderWithPromptPayload | null;
}

export function GlassIdeShell({
  state,
  answer,
  prompt: streamPrompt,
  runId,
  launchPrompt,
  onLaunchConsumed,
}: GlassIdeShellProps): JSX.Element {
  const [prompt, setPrompt] = useState("");
  const [screenContext, setScreenContext] = useState<AgentScreenContext | null>(null);
  const [screenDetecting, setScreenDetecting] = useState(false);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [hasDirtyFiles, setHasDirtyFiles] = useState(false);
  const [treeRefreshKey, setTreeRefreshKey] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const screenDetectCacheRef = useRef<{ ctx: AgentScreenContext | null; at: number } | null>(null);
  const screenDetectGenerationRef = useRef(0);
  const launchHandledRef = useRef<string | null>(null);
  const centerStackRef = useRef<HTMLDivElement>(null);
  const resolvedLayout = resolveGlassIdeLayout(state.glassSettings);
  const initialEditorRatio = clampGlassIdeEditorRatioForTerminalExpand(
    resolvedLayout.glassIdeEditorSplitRatio,
  );
  const editorRatioRef = useRef(initialEditorRatio);
  const [treeWidth, setTreeWidth] = useState(resolvedLayout.glassIdeTreeWidthPx);
  const [streamWidth, setStreamWidth] = useState(resolvedLayout.glassIdeStreamWidthPx);
  const [editorRatio, setEditorRatio] = useState(initialEditorRatio);
  const [treeCollapsed, setTreeCollapsed] = useState(false);
  const treeWidthBeforeCollapseRef = useRef(resolvedLayout.glassIdeTreeWidthPx);
  const terminalExpanded = state.glassIdeTerminalExpanded ?? false;
  const expandedEditorRatioRef = useRef(defaultGlassIdeTerminalExpandedEditorRatio());

  useEffect(() => {
    const next = resolveGlassIdeLayout(state.glassSettings);
    setTreeWidth(next.glassIdeTreeWidthPx);
    setStreamWidth(next.glassIdeStreamWidthPx);
    setEditorRatio(next.glassIdeEditorSplitRatio);
    editorRatioRef.current = clampGlassIdeEditorRatioForTerminalExpand(next.glassIdeEditorSplitRatio);
    expandedEditorRatioRef.current = clampGlassIdeEditorRatioForTerminalExpand(next.glassIdeEditorSplitRatio);
  }, [
    state.glassSettings.glassIdeTreeWidthPx,
    state.glassSettings.glassIdeStreamWidthPx,
    state.glassSettings.glassIdeEditorSplitRatio,
  ]);

  const workspaceLabel = state.glassSettings.agentCodeWorkspaceRoot?.trim() || undefined;
  const agentRunning = state.agentRun?.agentId === "coder" && state.agentRun.status === "running";
  const approvalPending = Boolean(
    state.agentPendingApproval?.agentId === "coder"
    && state.agentRun?.agentId === "coder"
    && state.agentRun.status === "running"
    && state.agentPendingApproval.runId === state.agentRun.runId,
  );
  const exitBlockedReason = agentRunning
    ? "Coder is running — click Exit to stop and leave"
    : approvalPending
      ? "Approval pending — Exit will abandon the pending change"
      : hasDirtyFiles
        ? "Unsaved edits — Exit will discard them"
        : null;
  const activeRunId =
    state.agentRun?.agentId === "coder" ? state.agentRun.runId : runId;
  const streamStatus = coderStreamStatusLabel(
    state.agentRun?.agentId === "coder" ? state.agentRun : null,
    state.agentPendingApproval ?? null,
    activeRunId,
    state.coderLoopIteration,
  );
  const presencePhase = deriveGlassIdePresencePhase({
    privacyListening: state.privacy.listening,
    askStatus: state.askStatus,
    agentRun: state.agentRun ?? null,
    agentPendingApproval: state.agentPendingApproval ?? null,
    partialAnswer: state.partialAnswer,
  });
  const presenceLabel = glassIdePresenceLabel(presencePhase);
  const aletheiaChip = state.glassIdeAletheia?.chip ?? null;
  const qaModeEnabled = state.glassSettings.qaModeEnabled === true;
  const qaAutoFix = state.glassSettings.qaAutoFix === true;

  const handleTreeSplit = useSplitWithValue(treeWidth, {
    axis: "horizontal",
    min: GLASS_IDE_TREE_WIDTH_MIN,
    max: GLASS_IDE_TREE_WIDTH_MAX,
    onValueChange: (next) => setTreeWidth(clampGlassIdeTreeWidthPx(next)),
    onCommit: (next) => {
      window.glass.glassIdeLayoutSet({ glassIdeTreeWidthPx: clampGlassIdeTreeWidthPx(next) });
    },
  });

  const handleStreamSplit = useSplitWithValue(streamWidth, {
    axis: "horizontal",
    invertDelta: true,
    min: GLASS_IDE_STREAM_WIDTH_MIN,
    max: GLASS_IDE_STREAM_WIDTH_MAX,
    onValueChange: (next) => setStreamWidth(clampGlassIdeStreamWidthPx(next)),
    onCommit: (next) => {
      window.glass.glassIdeLayoutSet({ glassIdeStreamWidthPx: clampGlassIdeStreamWidthPx(next) });
    },
  });

  const handleEditorTerminalSplit = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>): void => {
      if (!terminalExpanded) return;
      event.preventDefault();
      event.stopPropagation();
      armIdeOverlayDrag();
      const target = event.currentTarget;
      target.setPointerCapture(event.pointerId);
      const stack = centerStackRef.current;
      if (!stack) return;

      const onPointerMove = (ev: PointerEvent): void => {
        const rect = stack.getBoundingClientRect();
        if (rect.height <= 0) return;
        const ratio = clampGlassIdeEditorSplitRatio((ev.clientY - rect.top) / rect.height);
        editorRatioRef.current = ratio;
        setEditorRatio(ratio);
      };

      const endResize = (): void => {
        target.removeEventListener("pointermove", onPointerMove);
        try {
          target.releasePointerCapture(event.pointerId);
        } catch {
          /* ignore */
        }
        releaseIdeOverlayDrag();
        const stackEl = centerStackRef.current;
        const stackH = stackEl?.getBoundingClientRect().height ?? 0;
        const terminalH = stackH * (1 - editorRatioRef.current);
        if (stackH > 0 && terminalH < GLASS_IDE_TERMINAL_COLLAPSE_SNAP_PX) {
          expandedEditorRatioRef.current = clampGlassIdeEditorRatioForTerminalExpand(editorRatioRef.current);
          send({ type: "glass-ide-terminal-set-expanded", expanded: false, manual: true });
        } else {
          const clamped = clampGlassIdeEditorRatioForTerminalExpand(editorRatioRef.current);
          editorRatioRef.current = clamped;
          setEditorRatio(clamped);
          expandedEditorRatioRef.current = clamped;
          window.glass.glassIdeLayoutSet({ glassIdeEditorSplitRatio: clamped });
        }
      };

      target.addEventListener("pointermove", onPointerMove);
      target.addEventListener("pointerup", endResize, { once: true });
      target.addEventListener("pointercancel", endResize, { once: true });
    },
    [terminalExpanded],
  );

  const toggleTerminalExpanded = useCallback((): void => {
    armIdeOverlayPointer();
    if (terminalExpanded) {
      expandedEditorRatioRef.current = clampGlassIdeEditorRatioForTerminalExpand(editorRatioRef.current);
      send({ type: "glass-ide-terminal-set-expanded", expanded: false, manual: true });
      return;
    }
    const nextRatio = expandedEditorRatioRef.current;
    editorRatioRef.current = nextRatio;
    setEditorRatio(nextRatio);
    send({ type: "glass-ide-terminal-set-expanded", expanded: true, manual: true });
  }, [terminalExpanded]);

  const handleIdePointerEnter = useCallback((): void => {
    ensureOverlayInteractive();
    window.glass.setOverlayPointerOverIde?.(true);
  }, []);

  useEffect(() => {
    ensureOverlayInteractive();
    window.glass.setOverlayPointerOverIde?.(true);
    return () => {
      window.glass.setOverlayPointerOverIde?.(false);
    };
  }, []);

  const handleStopCoder = (): void => {
    window.glass.agentStop();
  };

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    if (state.glassSettings.screenContextEnabled === false) return;
    if (screenContext?.detectedFilePath || screenContext?.detectError) return;

    const cached = screenDetectCacheRef.current;
    if (cached && isFreshScreenContext(cached.at, SCREEN_DETECT_CACHE_MS)) {
      setScreenContext(cached.ctx);
      return;
    }

    let cancelled = false;
    const generation = ++screenDetectGenerationRef.current;
    setScreenDetecting(true);
    void screenDetectTimeout(
      () => window.glass.detectScreenFile(),
      SCREEN_DETECT_TIMEOUT_MS,
      lowConfidenceScreenContext(),
    ).then((ctx) => {
      if (cancelled || generation !== screenDetectGenerationRef.current) return;
      setScreenDetecting(false);
      const next = ctx.detectedFilePath || ctx.detectError ? ctx : null;
      screenDetectCacheRef.current = { ctx: next, at: Date.now() };
      setScreenContext(next);
    });
    return () => {
      cancelled = true;
      setScreenDetecting(false);
    };
  }, [state.glassSettings.screenContextEnabled, screenContext?.detectedFilePath, screenContext?.detectError]);

  const handleRun = useCallback(async (
    runPrompt?: string,
    ctx?: AgentScreenContext,
    loopAutoTrigger?: boolean,
  ): Promise<void> => {
    const trimmed = (runPrompt ?? prompt).trim();
    if (!trimmed || agentRunning) return;
    if (!state.glassSettings.agentCodeWorkspaceRoot?.trim()) {
      void window.glass.agentPickWorkspaceRoot();
      return;
    }

    const runId = createRunId();
    setPrompt("");

    try {
      const res = await window.glass.agentRun({
        agentId: "coder",
        prompt: trimmed,
        runId,
        agentScreenContext: ctx ?? screenContext ?? undefined,
        loopAutoTrigger,
      });
      if (!res.started) return;

      window.dispatchEvent(
        new CustomEvent("glass-agent-start", {
          detail: { agentId: "coder", prompt: trimmed, runId },
        }),
      );
    } catch {
      // agentRun surfaces errors via state
    }
  }, [
    prompt,
    agentRunning,
    screenContext,
    state.glassSettings.agentCodeWorkspaceRoot,
  ]);

  useEffect(() => {
    if (!launchPrompt) return;
    const key = launchPrompt.launchNonce != null
      ? `nonce:${launchPrompt.launchNonce}`
      : `${launchPrompt.prompt}:${launchPrompt.autoRun ? "1" : "0"}`;
    if (launchHandledRef.current === key) return;
    launchHandledRef.current = key;

    setPrompt(launchPrompt.prompt);
    if (launchPrompt.screenContext) {
      screenDetectCacheRef.current = {
        ctx: launchPrompt.screenContext.detectedFilePath || launchPrompt.screenContext.detectError
          ? launchPrompt.screenContext
          : null,
        at: Date.now(),
      };
      setScreenContext(launchPrompt.screenContext);
    }
    if (launchPrompt.autoRun && workspaceLabel) {
      window.setTimeout(() => {
        void handleRun(
          launchPrompt.prompt,
          launchPrompt.screenContext ?? undefined,
          launchPrompt.loopAutoTrigger,
        );
        onLaunchConsumed?.();
      }, 50);
    } else {
      onLaunchConsumed?.();
    }
  }, [launchPrompt, workspaceLabel, handleRun, onLaunchConsumed]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleRun();
      }
    },
    [handleRun],
  );

  const handleOpenFile = useCallback((relativePath: string): void => {
    const rel = relativePath.trim().replace(/\\/g, "/");
    if (!rel) return;
    setSelectedFilePath(rel);
  }, []);

  const handleSelectPath = useCallback((relativePath: string): void => {
    if (!relativePath) return;
    setSelectedFilePath(relativePath);
  }, []);

  useEffect(() => {
    return window.glass.onGlassIdeOpenFile(({ relativePath }) => {
      handleOpenFile(relativePath);
    });
  }, [handleOpenFile]);

  useEffect(() => {
    return window.glass.onShowQaModeNotification(() => {
      // state sync via qaNotificationVisible on push()
    });
  }, []);

  const handleDismissQaNotification = useCallback((): void => {
    window.glass.dismissQaModeNotification();
  }, []);

  const toggleTreeCollapsed = useCallback((): void => {
    setTreeCollapsed((prev) => {
      if (!prev) {
        treeWidthBeforeCollapseRef.current = treeWidth;
        return true;
      }
      setTreeWidth(treeWidthBeforeCollapseRef.current);
      return false;
    });
  }, [treeWidth]);

  const handleExit = useCallback((): void => {
    ensureOverlayInteractive();
    window.glass.setOverlayPointerOverIde?.(true);
    if (agentRunning) {
      if (!window.confirm("Stop Glass Coder and exit the IDE?")) return;
      window.glass.agentStop();
    } else if (approvalPending) {
      if (!window.confirm("A change is waiting for approval. Exit anyway?")) return;
    } else if (hasDirtyFiles) {
      if (!window.confirm("You have unsaved changes. Exit without saving?")) return;
    }
    window.glass.glassIdeClose();
  }, [agentRunning, approvalPending, hasDirtyFiles]);

  const armIdeControlPointer = useCallback((event: ReactPointerEvent): void => {
    event.stopPropagation();
    armIdeOverlayPointer();
  }, []);

  const handlePickWorkspace = (): void => {
    void window.glass.agentPickWorkspaceRoot();
  };

  const outputFolderLabel = displayAgentOutputFolder(state.glassSettings);
  const editorFlex = terminalExpanded ? Math.round(editorRatio * 1000) : 1;
  const terminalFlex = terminalExpanded ? Math.round((1 - editorRatio) * 1000) : 0;

  return (
    <div
      className="gide-shell"
      data-testid="glass-ide-shell"
      data-presence={presencePhase}
      style={{
        "--gide-terminal-chrome-h": `${GLASS_IDE_TERMINAL_COLLAPSED_CHROME_PX}px`,
      } as CSSProperties}
      onPointerDownCapture={ensureOverlayInteractive}
      onPointerEnter={handleIdePointerEnter}
    >
      <div className="gide-presence-aura" aria-hidden="true" />
      <header className="gide-header">
        <div className="gide-header__lead">
          <GlassHoverTooltip
            label={treeCollapsed ? "Show file tree" : "Collapse file tree"}
            placement="bottom"
          >
            <button
              type="button"
              className="gide-tree-toggle"
              onClick={toggleTreeCollapsed}
              onPointerDown={armIdeControlPointer}
              aria-label={treeCollapsed ? "Show file tree" : "Collapse file tree"}
              aria-expanded={!treeCollapsed}
            >
              <GideSidebarChevron direction={treeCollapsed ? "right" : "left"} />
            </button>
          </GlassHoverTooltip>
          <span className="gide-title">Glass IDE</span>
        </div>
        {presenceLabel ? (
          <span className="gide-presence-chip" data-presence={presencePhase}>
            {presenceLabel}
          </span>
        ) : aletheiaChip ? (
          <span className="gide-presence-chip gide-presence-chip--aletheia">
            {aletheiaChip}
          </span>
        ) : null}
        <span className="gide-header-meta">
          {workspaceLabel ? workspaceLabel.split("/").pop() : "No project folder"}
        </span>
        <div className="gide-header__tools">
          <GlassHoverTooltip
            label="Automatically fix QA pipeline failures"
            placement="bottom"
          >
            <button
              type="button"
              className={`gide-qa-toggle${qaAutoFix ? " gide-qa-toggle--active" : ""}`}
            onClick={() => window.glass.qaAutoFixToggle()}
            onPointerDown={armIdeControlPointer}
              disabled={!qaModeEnabled}
              aria-label="QA auto-fix"
            >
              Auto-fix {qaAutoFix ? "●" : "○"}
            </button>
          </GlassHoverTooltip>
          <GlassHoverTooltip
            label="Run full QA pipeline after each Coder run"
            placement="bottom"
          >
            <button
              type="button"
              className={`gide-qa-toggle${qaModeEnabled ? " gide-qa-toggle--active" : ""}`}
            onClick={() => window.glass.qaModeToggle()}
            onPointerDown={armIdeControlPointer}
              aria-label="QA mode"
            >
              {qaModeEnabled ? <span className="gide-qa-toggle__dot" aria-hidden="true" /> : null}
              ◈ QA Mode {qaModeEnabled ? "●" : "○"}
            </button>
          </GlassHoverTooltip>
        </div>
        {exitBlockedReason ? (
          <span className="gide-exit-blocked">{exitBlockedReason}</span>
        ) : null}
        <GlassHoverTooltip
          label="Exit IDE — command bar and dock return"
          placement="bottom"
        >
          <button
            type="button"
            className="gide-exit-btn"
            onClick={handleExit}
            onPointerDown={armIdeControlPointer}
            aria-label="Exit Glass IDE"
          >
            Exit
          </button>
        </GlassHoverTooltip>
      </header>

      <div
        className="gide-main"
        onPointerDownCapture={ensureOverlayInteractive}
      >
        {!treeCollapsed ? (
          <>
            <section
              className="gide-pane gide-pane--tree"
              style={{ width: treeWidth, flexShrink: 0 }}
              aria-label="Project files"
            >
              <GlassIdeFileTree
                workspaceRoot={workspaceLabel}
                selectedPath={selectedFilePath}
                onSelectPath={handleSelectPath}
                refreshKey={treeRefreshKey}
              />
            </section>

            <div
              className="gide-split gide-split--horizontal"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize file tree"
              title="Drag to resize file tree"
              onPointerDown={(e) => {
                armIdeControlPointer(e);
                handleTreeSplit(e);
              }}
            />
          </>
        ) : null}

        <section className="gide-pane gide-pane--center" aria-label="Editor and terminal">
          <div ref={centerStackRef} className="gide-center-stack">
            <div
              className="gide-center-editor"
              style={{
                flex: terminalExpanded ? `${editorFlex} 1 0` : "1 1 0",
                minHeight: 0,
              }}
            >
              <GlassIdeEditorPane
                state={state}
                selectedPath={selectedFilePath}
                onSelectedPathChange={setSelectedFilePath}
                onDirtyChange={setHasDirtyFiles}
                onTreeRefresh={() => setTreeRefreshKey((k) => k + 1)}
              />
            </div>
            {terminalExpanded ? (
              <div
                className="gide-split gide-split--vertical"
                role="separator"
                aria-orientation="horizontal"
                aria-label="Resize editor and terminal"
                title="Drag to resize editor and terminal"
                onPointerDown={(e) => {
                  armIdeControlPointer(e);
                  handleEditorTerminalSplit(e);
                }}
              />
            ) : null}
            <div
              className={[
                "gide-center-terminal",
                terminalExpanded ? "" : "gide-center-terminal--collapsed",
              ].filter(Boolean).join(" ")}
              style={
                terminalExpanded
                  ? { flex: `${terminalFlex} 1 0`, minHeight: 0 }
                  : undefined
              }
            >
              {state.glassDockTerminalOpen ? (
                <GlassTerminalPanel
                  variant="embedded"
                  ideCollapsed={!terminalExpanded}
                  onIdeToggleCollapse={toggleTerminalExpanded}
                />
              ) : (
                <div className="gide-placeholder gide-placeholder--compact">
                  <p>Starting terminal…</p>
                </div>
              )}
            </div>
          </div>
        </section>

        <div
          className="gide-split gide-split--horizontal"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize AI stream"
          title="Drag to resize AI stream"
          onPointerDown={(e) => {
            armIdeControlPointer(e);
            handleStreamSplit(e);
          }}
        />

        <section
          className="gide-pane gide-pane--stream"
          style={{ width: streamWidth, flexShrink: 0 }}
          aria-label="AI stream"
        >
          <div className="gide-stream-pane">
            <GlassQaModeNotification
              visible={Boolean(state.qaNotificationVisible)}
              onDismiss={handleDismissQaNotification}
            />
            <div className="gide-stream-toolbar">
            <span className="gide-pane__label">AI stream</span>
            <span className={`gide-stream-badge${agentRunning ? " gide-stream-badge--live" : ""}`}>
              {streamStatus}
            </span>
            {agentRunning ? (
              <GlassHoverTooltip label="Stop Glass Coder" placement="bottom">
                <button
                  type="button"
                  className="gide-stop-btn"
                  onClick={handleStopCoder}
                  onPointerDown={armIdeControlPointer}
                  aria-label="Stop Glass Coder"
                >
                  ■ Stop
                </button>
              </GlassHoverTooltip>
            ) : null}
          </div>
          <GlassIdeStream
            state={state}
            answer={answer}
            runId={runId}
            taskPrompt={streamPrompt || prompt}
            onOpenFile={handleOpenFile}
          />
          <GlassIdeStreamComposer
            placeholder={CODER_DEF.placeholder}
            prompt={prompt}
            onPromptChange={setPrompt}
            onKeyDown={handleKeyDown}
            onRun={() => void handleRun()}
            onPickWorkspace={handlePickWorkspace}
            textareaRef={textareaRef}
            workspaceLabel={workspaceLabel}
            outputFolderLabel={outputFolderLabel}
            agentRunning={agentRunning}
            screenDetecting={screenDetecting}
            screenContext={screenContext}
            onDismissScreenContext={() => {
              screenDetectCacheRef.current = null;
              setScreenContext(null);
            }}
          />
          </div>
        </section>
      </div>
    </div>
  );
}
