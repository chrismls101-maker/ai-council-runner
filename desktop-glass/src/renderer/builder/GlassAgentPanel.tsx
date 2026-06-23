/**
 * Glass Agent Panel
 *
 * Right-side panel on the Builder Strip. Pick an agent, type a task, run —
 * panel closes, Aletheia narrates, results stream into the Response Panel.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentEvent, AgentHistoryEntry, AgentScreenContext, GlassAgentId } from "../../shared/ipc.ts";
import { GLASS_AGENT_CATALOG, agentCatalogName } from "../../shared/agentCatalog.ts";
import { agentCardStatusForEvent } from "../../shared/agentNarration.ts";
import { displayAgentOutputFolder } from "../../shared/agentOutputFolder.ts";
import {
  isFreshScreenContext,
  lowConfidenceScreenContext,
  SCREEN_DETECT_CACHE_MS,
  SCREEN_DETECT_TIMEOUT_MS,
  screenDetectTimeout,
} from "../../shared/screenDetect.ts";
import { useGlassState } from "../useGlassState.ts";
import "./GlassAgentPanel.css";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AgentStatus = "idle" | "running" | "done" | "error";

interface AgentRun {
  agentId: GlassAgentId;
  status: AgentStatus;
  textAccum: string;
  statusLine: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultAgentRun(agentId: GlassAgentId): AgentRun {
  return {
    agentId,
    status: "running",
    textAccum: "",
    statusLine: "",
  };
}

function applyAgentEvent(existing: AgentRun, ev: AgentEvent): AgentRun {
  const updated = { ...existing };

  switch (ev.kind) {
    case "text-delta":
      updated.textAccum += ev.text ?? "";
      break;
    case "tool-start":
    case "tool-done":
    case "approval-required":
      updated.statusLine = agentCardStatusForEvent(ev);
      break;
    case "done":
      updated.status = "done";
      updated.statusLine = agentCardStatusForEvent(ev);
      break;
    case "cancelled":
      updated.status = "idle";
      updated.statusLine = agentCardStatusForEvent(ev);
      break;
    case "error":
      updated.status = "error";
      updated.statusLine = agentCardStatusForEvent(ev);
      break;
  }

  return updated;
}

function dispatchAgentOutput(ev: AgentEvent, text: string): void {
  if (ev.kind !== "text-delta") return;
  window.dispatchEvent(
    new CustomEvent("glass-agent-output", {
      detail: { agentId: ev.agentId, runId: ev.runId, text },
    }),
  );
}

function createRunId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `agent-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface AgentCardProps {
  def: (typeof GLASS_AGENT_CATALOG)[number];
  run: AgentRun | null;
  onRun: (
    agentId: GlassAgentId,
    prompt: string,
    screenContext?: AgentScreenContext,
    loopAutoTrigger?: boolean,
  ) => void;
  onStop: () => void;
  workspaceLabel?: string;
  onPickWorkspace?: () => void;
  screenContextEnabled?: boolean;
  screenContext?: AgentScreenContext | null;
  onScreenContextChange?: (ctx: AgentScreenContext | null) => void;
  launchPrompt?: import("../../shared/ipc.ts").OpenCoderWithPromptPayload | null;
  onLaunchConsumed?: () => void;
  onOpenIde?: () => void;
}

function AgentCard({
  def,
  run,
  onRun,
  onStop,
  workspaceLabel,
  onPickWorkspace,
  screenContextEnabled = true,
  screenContext,
  onScreenContextChange,
  launchPrompt,
  onLaunchConsumed,
  onOpenIde,
}: AgentCardProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [screenDetecting, setScreenDetecting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const screenDetectCacheRef = useRef<{ ctx: AgentScreenContext | null; at: number } | null>(null);
  const screenDetectGenerationRef = useRef(0);

  const isRunning = run?.status === "running";
  const isDone = run?.status === "done";
  const isError = run?.status === "error";

  const handleCardClick = useCallback((): void => {
    if (isRunning) return;
    if (def.id === "coder") {
      window.glass.glassIdeOpen();
      onOpenIde?.();
      return;
    }
    setExpanded((prev) => {
      if (prev) screenDetectGenerationRef.current += 1;
      return !prev;
    });
  }, [isRunning, def.id, onOpenIde]);

  useEffect(() => {
    if (expanded && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [expanded]);

  useEffect(() => {
    if (!expanded || def.id !== "coder" || !screenContextEnabled) return;
    if (screenContext?.detectedFilePath || screenContext?.detectError) return;

    const cached = screenDetectCacheRef.current;
    if (cached && isFreshScreenContext(cached.at, SCREEN_DETECT_CACHE_MS)) {
      onScreenContextChange?.(cached.ctx);
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
      onScreenContextChange?.(next);
    });
    return () => {
      cancelled = true;
      setScreenDetecting(false);
    };
  }, [expanded, def.id, screenContextEnabled, onScreenContextChange, screenContext?.detectedFilePath, screenContext?.detectError]);

  const launchHandledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!launchPrompt || def.id !== "coder") return;
    const key = `${launchPrompt.prompt}:${launchPrompt.autoRun ? "1" : "0"}`;
    if (launchHandledRef.current === key) return;
    launchHandledRef.current = key;

    setExpanded(true);
    setPrompt(launchPrompt.prompt);
    if (launchPrompt.screenContext) {
      screenDetectCacheRef.current = {
        ctx: launchPrompt.screenContext.detectedFilePath || launchPrompt.screenContext.detectError
          ? launchPrompt.screenContext
          : null,
        at: Date.now(),
      };
      onScreenContextChange?.(launchPrompt.screenContext);
    }
    if (launchPrompt.autoRun && workspaceLabel) {
      const ctx = launchPrompt.screenContext;
      window.setTimeout(() => {
        onRun(def.id, launchPrompt.prompt, ctx ?? undefined, launchPrompt.loopAutoTrigger);
        setPrompt("");
        setExpanded(false);
        onLaunchConsumed?.();
      }, 50);
    } else if (launchPrompt.autoRun && !workspaceLabel) {
      onLaunchConsumed?.();
    } else {
      onLaunchConsumed?.();
    }
  }, [launchPrompt, def.id, onRun, onLaunchConsumed, onScreenContextChange, workspaceLabel]);

  const handleSubmit = useCallback((): void => {
    const trimmed = prompt.trim();
    if (!trimmed || isRunning) return;
    screenDetectGenerationRef.current += 1;
    onRun(def.id, trimmed, screenContext ?? undefined);
    setPrompt("");
    setExpanded(false);
  }, [prompt, isRunning, onRun, def.id, screenContext]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
      if (e.key === "Escape") {
        screenDetectGenerationRef.current += 1;
        setExpanded(false);
      }
    },
    [handleSubmit],
  );

  return (
    <div
      className={`gap-card${isRunning ? " gap-card--running" : ""}${isDone ? " gap-card--done" : ""}${isError ? " gap-card--error" : ""}${expanded && def.id === "coder" ? " gap-card--composer" : ""}`}
    >
      <div className="gap-card__header">
        <button
          type="button"
          className="gap-card__header-main"
          onClick={handleCardClick}
          aria-expanded={expanded}
          disabled={isRunning}
        >
          <span className="gap-card__icon" aria-hidden="true">
            {isRunning ? (
              <span className="gap-card__spinner" aria-hidden="true" />
            ) : (
              def.icon
            )}
          </span>
          <span className="gap-card__meta">
            <span className="gap-card__name">{def.name}</span>
            <span className="gap-card__desc">{def.description}</span>
          </span>
          {!isRunning ? (
            <span className="gap-card__chevron" aria-hidden="true">
              {expanded ? "▲" : "▼"}
            </span>
          ) : null}
        </button>
        {isRunning ? (
          <button
            type="button"
            className="gap-card__stop"
            onClick={onStop}
            aria-label="Stop agent"
          >
            ■
          </button>
        ) : null}
      </div>

      {expanded && !isRunning && (
        <div className="gap-card__input-area">
          {(def.id === "code" || def.id === "coder") && onPickWorkspace ? (
            <button
              type="button"
              className="gap-card__workspace-btn"
              onClick={onPickWorkspace}
              title={
                def.id === "coder"
                  ? "Project root for Glass Coder — reads and writes here after approval"
                  : "Default project folder for Code Analyst — it lists and searches here first"
              }
            >
              Project folder → {workspaceLabel ?? "Choose folder…"}
            </button>
          ) : null}
          {def.id === "coder" && screenContext?.detectError ? (
            <div className="gap-card__detected-file gap-card__detected-file--error">
              {screenContext.detectError}
            </div>
          ) : null}
          {def.id === "coder" && screenDetecting ? (
            <div className="gap-card__detected-file gap-card__detected-file--pending">
              Scanning screen for active file…
            </div>
          ) : null}
          {def.id === "coder" && !screenDetecting && screenContext?.detectedFilePath ? (
            <div className="gap-card__detected-file">
              <span>Detected: {screenContext.detectedFilePath.split("/").pop()}</span>
              <button
                type="button"
                className="gap-card__detected-dismiss"
                onClick={() => {
                  screenDetectCacheRef.current = null;
                  onScreenContextChange?.(null);
                }}
                aria-label="Dismiss detected file"
              >
                ✕
              </button>
            </div>
          ) : null}
          <textarea
            ref={textareaRef}
            className="gap-card__textarea"
            placeholder={def.placeholder}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={def.id === "coder" ? 6 : 3}
          />
          <div className="gap-card__input-footer">
            <span className="gap-card__hint">↵ to run · Shift+↵ for newline · Esc to cancel</span>
            <button
              type="button"
              className="gap-card__run-btn"
              disabled={
                !prompt.trim()
                || (def.id === "coder" && !workspaceLabel)
                || (def.id === "coder" && screenDetecting)
              }
              onClick={handleSubmit}
            >
              {def.id === "coder" && screenDetecting
                ? "Detecting file…"
                : def.id === "coder" && !workspaceLabel
                  ? "Set project folder"
                  : "Run"}
            </button>
          </div>
        </div>
      )}

      {run?.statusLine && (
        <div
          className={`gap-card__status${isError ? " gap-card__status--error" : ""}`}
        >
          {run.statusLine}
        </div>
      )}
    </div>
  );
}

function formatHistoryTime(ts: number): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function historyStatusLabel(entry: AgentHistoryEntry): string {
  if (entry.status === "running") return "Running…";
  if (entry.status === "done") {
    if (entry.agentId === "coder" && entry.changedFiles?.length) {
      const n = entry.changedFiles.length;
      return n === 1 ? "1 file changed" : `${n} files changed`;
    }
    return entry.savedFilePath ? "Saved" : "Done";
  }
  if (entry.status === "error") return "Failed";
  if (entry.status === "cancelled") return "Stopped";
  return "";
}

interface AgentHistoryProps {
  history: AgentHistoryEntry[];
  anyRunning: boolean;
  onRerun: (agentId: GlassAgentId, prompt: string) => void;
}

function AgentHistory({ history, anyRunning, onRerun }: AgentHistoryProps): JSX.Element | null {
  const recent = history.slice(0, 5);
  if (recent.length === 0) return null;

  return (
    <div className="gap-history">
      <div className="gap-history__title">Recent runs</div>
      {recent.map((entry) => (
        <button
          key={entry.runId}
          type="button"
          className={`gap-history__item gap-history__item--${entry.status}`}
          disabled={anyRunning}
          onClick={() => onRerun(entry.agentId, entry.prompt)}
          title={entry.prompt}
        >
          <span className="gap-history__meta">
            <span className="gap-history__name">{agentCatalogName(entry.agentId)}</span>
            <span className="gap-history__time">{formatHistoryTime(entry.startedAt)}</span>
          </span>
          <span className="gap-history__prompt">{entry.prompt}</span>
          <span className="gap-history__status">{historyStatusLabel(entry)}</span>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel component
// ---------------------------------------------------------------------------

interface GlassAgentPanelProps {
  onClose: () => void;
}

export function GlassAgentPanel({ onClose }: GlassAgentPanelProps): JSX.Element {
  const state = useGlassState();
  const [runs, setRuns] = useState<Map<GlassAgentId, AgentRun>>(new Map());
  const activeRunIdRef = useRef<string | null>(null);
  const runsRef = useRef(runs);
  runsRef.current = runs;

  const outputFolderLabel = displayAgentOutputFolder(state.glassSettings);
  const workspaceLabel = state.glassSettings.agentCodeWorkspaceRoot?.trim() || undefined;
  const anyRunning = state.agentRun?.status === "running";
  const history = state.agentHistory ?? [];
  const [coderScreenContext, setCoderScreenContext] = useState<AgentScreenContext | null>(null);
  const [coderLaunch, setCoderLaunch] = useState<import("../../shared/ipc.ts").OpenCoderWithPromptPayload | null>(null);

  useEffect(() => {
    return window.glass.onOpenCoderWithPrompt((payload) => {
      setCoderLaunch(payload);
    });
  }, []);

  useEffect(() => {
    const live = state.agentRun;
    if (!live || live.status !== "running") return;
    activeRunIdRef.current = live.runId;
    setRuns((prev) => {
      const next = new Map(prev);
      next.set(live.agentId, {
        agentId: live.agentId,
        status: "running",
        textAccum: next.get(live.agentId)?.textAccum ?? "",
        statusLine: next.get(live.agentId)?.statusLine || "Running…",
      });
      return next;
    });
  }, [state.agentRun?.runId, state.agentRun?.status]);

  useEffect(() => {
    return window.glass.onAgentEvent((ev: AgentEvent) => {
      if (activeRunIdRef.current !== ev.runId) return;

      const existing = runsRef.current.get(ev.agentId) ?? defaultAgentRun(ev.agentId);
      const updated = applyAgentEvent(existing, ev);

      const next = new Map(runsRef.current);
      next.set(ev.agentId, updated);
      runsRef.current = next;
      setRuns(next);

      if (ev.kind === "done" || ev.kind === "error" || ev.kind === "cancelled") {
        if (activeRunIdRef.current === ev.runId) {
          activeRunIdRef.current = null;
        }
      }

      dispatchAgentOutput(ev, updated.textAccum);
    });
  }, []);

  const handleRun = useCallback(async (
    agentId: GlassAgentId,
    prompt: string,
    screenContext?: AgentScreenContext,
    loopAutoTrigger?: boolean,
  ): Promise<void> => {
    if (agentId === "coder" && !state.glassSettings.agentCodeWorkspaceRoot?.trim()) {
      void window.glass.agentPickWorkspaceRoot();
      return;
    }

    const runId = createRunId();
    activeRunIdRef.current = runId;

    setRuns((prev) => {
      const next = new Map(prev);
      next.set(agentId, {
        agentId,
        status: "running",
        textAccum: "",
        statusLine: "Starting…",
      });
      return next;
    });

    // Panel closes when the agent starts — work continues in background.
    onClose();

    try {
      const res = await window.glass.agentRun({
        agentId,
        prompt,
        runId,
        agentScreenContext: screenContext,
        loopAutoTrigger,
      });
      if (!res.started) {
        if (activeRunIdRef.current === runId) activeRunIdRef.current = null;
        setRuns((prev) => {
          const next = new Map(prev);
          next.set(agentId, {
            agentId,
            status: "error",
            textAccum: "",
            statusLine: res.error ?? "Failed to start.",
          });
          return next;
        });
        return;
      }

      window.dispatchEvent(
        new CustomEvent("glass-agent-start", {
          detail: { agentId, prompt, runId },
        }),
      );
    } catch (err) {
      if (activeRunIdRef.current === runId) activeRunIdRef.current = null;
      const message = err instanceof Error ? err.message : "Failed to start agent.";
      setRuns((prev) => {
        const next = new Map(prev);
        next.set(agentId, {
          agentId,
          status: "error",
          textAccum: "",
          statusLine: message,
        });
        return next;
      });
    }
  }, [onClose, state.glassSettings.agentCodeWorkspaceRoot]);

  const handleStop = useCallback((): void => {
    window.glass.agentStop();
    setRuns((prev) => {
      const next = new Map(prev);
      for (const [id, run] of next) {
        if (run.status === "running") {
          next.set(id, { ...run, statusLine: "Stopping…" });
        }
      }
      return next;
    });
  }, []);

  const handlePickOutputFolder = useCallback((): void => {
    void window.glass.agentPickOutputFolder();
  }, []);

  const handlePickWorkspace = useCallback((): void => {
    void window.glass.agentPickWorkspaceRoot();
  }, []);

  return (
    <div className="gap-panel" data-testid="glass-agent-panel">
      <div className="gap-header">
        <span className="gap-title">Agents</span>
        <button
          type="button"
          className="gap-close"
          onClick={onClose}
          aria-label="Close Agents panel"
        >
          ✕
        </button>
      </div>

      <div className="gap-body">
        <AgentHistory history={history} anyRunning={anyRunning} onRerun={handleRun} />
        {GLASS_AGENT_CATALOG.map((def) => (
          <AgentCard
            key={def.id}
            def={def}
            run={runs.get(def.id) ?? null}
            onRun={handleRun}
            onStop={handleStop}
            workspaceLabel={workspaceLabel}
            onPickWorkspace={def.id === "code" || def.id === "coder" ? handlePickWorkspace : undefined}
            screenContextEnabled={state.glassSettings.screenContextEnabled !== false}
            screenContext={def.id === "coder" ? coderScreenContext : null}
            onScreenContextChange={def.id === "coder" ? setCoderScreenContext : undefined}
            launchPrompt={def.id === "coder" ? coderLaunch : null}
            onLaunchConsumed={def.id === "coder" ? () => setCoderLaunch(null) : undefined}
            onOpenIde={def.id === "coder" ? onClose : undefined}
          />
        ))}
      </div>

      <div className="gap-footer">
        <span>Results stream into the Answer Panel</span>
        <button
          type="button"
          className="gap-footer__folder-btn"
          onClick={handlePickOutputFolder}
          title="Change where agent files are saved"
        >
          Files → {outputFolderLabel}
        </button>
      </div>
    </div>
  );
}
