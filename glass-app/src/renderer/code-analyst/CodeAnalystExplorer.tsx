/**
 * CodeAnalystExplorer — full-screen Code Analyst workspace (matches Research glass shell).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Sun } from "lucide-react";
import type { AgentEvent } from "../../shared/ipc";
import { displayAgentOutputFolder } from "../../shared/agentOutputFolder";
import { armCodeAnalystOverlayPointer, ensureOverlayInteractive, prepareGlassTextPointerDown, prepareGlassTextContextMenu } from "../glassTextInteraction.ts";
import { useGlassState } from "../useGlassState.ts";
import { GlassIdeProjectGate } from "../overlay/GlassIdeProjectGate.tsx";
import { TorrentColumn, type TorrentColumnHandle } from "../research/TorrentColumn";
import "../research/ResearchExplorer.css";
import "../workspace/workspaceChrome.css";
import "./CodeAnalystExplorer.css";

type Screen = "intro" | "stream" | "deliver";
type Theme = "light" | "dark";

const THEME_KEY = "glass-code-analyst-theme";
const SESSION_KEY = "glass-code-analyst-session-v1";

type PersistedSession = {
  prompt: string;
  screen: Screen;
  activePrompt: string;
  phase: number;
  chip: string;
  status: string;
  zones: [string, string, string];
  leftLines: Array<{ text: string; type: string }>;
  midLines: Array<{ text: string; type: string }>;
  rightLines: Array<{ text: string; type: string }>;
  reportText: string;
  savedPath: string;
};

function createRunId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `code-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function shorten(text: string, max = 52): string {
  if (!text) return "Code analysis";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function ascii(s: string): string {
  return s
    .replace(/—|–/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[^\x00-\x7F]/g, "");
}

function readTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function loadSession(): PersistedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedSession;
  } catch {
    return null;
  }
}

function saveSession(session: PersistedSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* ignore */
  }
}

function basename(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path;
}

function ReportPanel({ text, savedPath }: { text: string; savedPath: string }) {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim());
  return (
    <div className="code-analyst-report">
      {savedPath ? (
        <div className="ca-report-path">
          <span className="ca-report-path-label">Saved</span>
          <span className="ca-report-path-name">{basename(savedPath)}</span>
        </div>
      ) : null}
      <div className="ca-report-body ws-selectable" onContextMenu={prepareGlassTextContextMenu}>
        {paragraphs.map((p, i) => {
          const line = ascii(p.trim());
          if (line.startsWith("### ")) return <h3 key={i} className="ca-report-h3">{line.slice(4)}</h3>;
          if (line.startsWith("## ")) return <h2 key={i} className="ca-report-h2">{line.slice(3)}</h2>;
          if (line.startsWith("# ")) return <h1 key={i} className="ca-report-h1">{line.slice(2)}</h1>;
          return <p key={i} className="ca-report-p">{line}</p>;
        })}
      </div>
    </div>
  );
}

interface Props {
  prompt: string;
  visible?: boolean;
  onClose: () => void;
}

export function CodeAnalystExplorer({ prompt: initialPrompt, visible = true, onClose }: Props) {
  const glassState = useGlassState();
  const workspaceRoot = glassState.glassSettings.agentCodeWorkspaceRoot?.trim() ?? "";
  const workspaceLabel = workspaceRoot ? basename(workspaceRoot) : "Choose project folder…";
  const outputFolder = displayAgentOutputFolder(glassState.glassSettings);

  const leftRef = useRef<TorrentColumnHandle>(null);
  const midRef = useRef<TorrentColumnHandle>(null);
  const rightRef = useRef<TorrentColumnHandle>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const runningRef = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);
  const activePromptRef = useRef("");
  const linesRef = useRef({
    left: [] as PersistedSession["leftLines"],
    mid: [] as PersistedSession["midLines"],
    right: [] as PersistedSession["rightLines"],
  });
  const lastExternalPromptRef = useRef("");

  const [screen, setScreen] = useState<Screen>("intro");
  const [inputText, setInputText] = useState("");
  const [activePrompt, setActivePrompt] = useState("");
  const [phase, setPhase] = useState(0);
  const [chip, setChip] = useState("Code Analyst");
  const [status, setStatus] = useState("");
  const [zones, setZones] = useState<[string, string, string]>(["Files", "Analysis", "Report"]);
  const [counting, setCounting] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [introOut, setIntroOut] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => readTheme());
  const [reportText, setReportText] = useState("");
  const [savedPath, setSavedPath] = useState("");

  const persist = useCallback(() => {
    saveSession({
      prompt: inputText,
      screen,
      activePrompt,
      phase,
      chip,
      status,
      zones,
      leftLines: [...linesRef.current.left],
      midLines: [...linesRef.current.mid],
      rightLines: [...linesRef.current.right],
      reportText,
      savedPath,
    });
  }, [activePrompt, chip, inputText, phase, reportText, savedPath, screen, status, zones]);

  const restoreSession = useCallback((session: PersistedSession) => {
    setInputText(session.prompt);
    setActivePrompt(session.activePrompt);
    activePromptRef.current = session.activePrompt;
    setScreen(session.screen);
    setPhase(session.phase);
    setChip(session.chip);
    setStatus(session.status);
    setZones(session.zones);
    setReportText(session.reportText);
    setSavedPath(session.savedPath);
    linesRef.current = {
      left: [...session.leftLines],
      mid: [...session.midLines],
      right: [...session.rightLines],
    };
    requestAnimationFrame(() => {
      leftRef.current?.restore(session.leftLines as never);
      midRef.current?.restore(session.midLines as never);
      rightRef.current?.restore(session.rightLines as never);
    });
  }, []);

  useEffect(() => {
    const saved = loadSession();
    if (saved) restoreSession(saved);
  }, [restoreSession]);

  useEffect(() => {
    if (!visible) return;
    document.body.classList.add("glass-body--workspace-active");
    armCodeAnalystOverlayPointer();
    const t = window.setTimeout(() => inputRef.current?.focus(), 120);
    return () => {
      document.body.classList.remove("glass-body--workspace-active");
      window.clearTimeout(t);
    };
  }, [visible]);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => () => { cleanupRef.current?.(); }, []);

  useEffect(() => {
    const p = initialPrompt.trim();
    if (!p || p === lastExternalPromptRef.current) return;
    lastExternalPromptRef.current = p;
    setInputText(p);
  }, [initialPrompt]);

  useEffect(() => {
    const timer = window.setTimeout(persist, 400);
    return () => window.clearTimeout(timer);
  }, [persist]);

  const pushLine = useCallback(
    (col: "left" | "mid" | "right", text: string, type = "normal") => {
      const entry = { text, type };
      linesRef.current[col].push(entry);
      if (col === "left") leftRef.current?.push(text, type as never);
      if (col === "mid") midRef.current?.push(text, type as never);
      if (col === "right") rightRef.current?.push(text, type as never);
    },
    [],
  );

  const runAnalysis = useCallback(async (prompt: string) => {
    if (runningRef.current) return;
    runningRef.current = true;

    const runId = createRunId();
    let reportContent = "";
    let reportSavedPath = "";
    let rightBuffer = "";
    let writingReport = false;

    setPhase(1);
    setStatus("Phase 1 — Scanning project");
    setChip("Code Analyst — Running");
    setZones(["Files", "Analysis", "Report"]);
    linesRef.current = { left: [], mid: [], right: [] };
    leftRef.current?.clear();
    midRef.current?.clear();
    rightRef.current?.clear();

    const cleanup = window.glass.onAgentEvent((ev: AgentEvent) => {
      if (ev.runId !== runId) return;

      switch (ev.kind) {
        case "tool-start": {
          const name = ev.toolName ?? "";
          const input = ev.toolInput as Record<string, unknown> | null;
          if (name === "list_directory") {
            const path = String(input?.path ?? input?.directory ?? ".").trim();
            pushLine("left", `Listing ${path || "project"}…`, "dim");
            setPhase(1);
            setStatus("Phase 1 — Mapping structure");
          } else if (name === "search_files") {
            const pattern = String(input?.pattern ?? input?.query ?? "").trim();
            pushLine("left", pattern ? `Searching: ${pattern}` : "Searching files…", "dim");
            setPhase(2);
            setStatus("Phase 2 — Locating files");
          } else if (name === "read_file") {
            const path = String(input?.path ?? "").trim();
            pushLine("left", path ? `Reading ${basename(path)}` : "Reading file…", "hit");
            setPhase(2);
            setStatus("Phase 2 — Reading code");
          } else if (name === "write_file") {
            writingReport = true;
            reportContent = String(input?.content ?? "");
            if (rightBuffer.trim()) {
              pushLine("right", rightBuffer.trim());
              rightBuffer = "";
            }
            pushLine("right", "Writing report…", "dim");
            setPhase(4);
            setStatus("Phase 4 — Saving report");
          } else {
            pushLine("mid", `Running ${name.replace(/_/g, " ")}…`, "dim");
          }
          break;
        }
        case "tool-done": {
          const name = ev.toolName ?? "";
          if (name === "list_directory" && ev.toolResult) {
            const lines = ev.toolResult.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 24);
            lines.forEach((l) => pushLine("left", l.slice(0, 88)));
            pushLine("left", "");
          } else if (name === "search_files" && ev.toolResult) {
            const lines = ev.toolResult.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 20);
            lines.forEach((l) => pushLine("left", l.slice(0, 88)));
            pushLine("left", "");
            pushLine("mid", "Cross-referencing matches…");
          } else if (name === "read_file") {
            pushLine("mid", "Analyzing contents…");
          } else if (name === "write_file") {
            reportSavedPath = ev.savedFilePath ?? "";
            const fname = reportSavedPath ? basename(reportSavedPath) : "";
            pushLine("right", fname ? `Saved: ${fname}` : "Report saved.", "signal");
          }
          break;
        }
        case "text-delta": {
          if (!ev.text || writingReport) break;
          rightBuffer += ev.text;
          const nl = rightBuffer.lastIndexOf("\n");
          if (nl >= 0 || rightBuffer.length >= 80) {
            const flush = nl >= 0 ? rightBuffer.slice(0, nl) : rightBuffer;
            rightBuffer = nl >= 0 ? rightBuffer.slice(nl + 1) : "";
            if (flush.trim()) pushLine("right", flush.trim());
          }
          setPhase(3);
          setStatus("Phase 3 — Synthesizing");
          break;
        }
        case "narrate": {
          if (ev.text) pushLine("mid", ev.text);
          break;
        }
        case "done": {
          if (rightBuffer.trim()) pushLine("right", rightBuffer.trim());
          const finalText = reportContent || linesRef.current.right.map((l) => l.text).join("\n");
          setReportText(finalText);
          setSavedPath(reportSavedPath);
          setPhase(5);
          setChip("Code Analyst — Complete");
          setStatus("Analysis complete");
          setZones(["", "", ""]);
          setTimeout(() => setScreen("deliver"), 900);
          runningRef.current = false;
          break;
        }
        case "error": {
          pushLine("right", `[ERROR] ${(ev.error ?? "Unknown error").slice(0, 80)}`, "warn");
          setChip("Code Analyst — Error");
          setStatus("Error");
          runningRef.current = false;
          break;
        }
        case "cancelled": {
          pushLine("right", "Analysis cancelled.", "dim");
          setStatus("Cancelled");
          runningRef.current = false;
          break;
        }
        default:
          break;
      }
    });

    cleanupRef.current = cleanup;

    try {
      const res = await window.glass.agentRun({
        agentId: "code",
        prompt,
        runId,
      });
      if (!res.started) {
        pushLine("right", `Failed to start: ${res.error ?? "agent refused"}`, "warn");
        setStatus("Error");
        runningRef.current = false;
      }
    } catch (err) {
      pushLine("right", `Error: ${String(err).slice(0, 80)}`, "warn");
      setStatus("Error");
      runningRef.current = false;
    }
  }, [pushLine]);

  const handleSubmit = useCallback(() => {
    const q = inputText.trim();
    if (!q || counting || !workspaceRoot) return;
    setActivePrompt(q);
    activePromptRef.current = q;
    setCounting(true);
    setCountdown(3);
  }, [counting, inputText, workspaceRoot]);

  const handleHide = useCallback(() => {
    persist();
    onClose();
  }, [onClose, persist]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "Escape") handleHide();
  }, [handleHide, handleSubmit]);

  useEffect(() => {
    if (!counting) return;
    if (countdown <= 0) {
      setIntroOut(true);
      setTimeout(() => {
        setScreen("stream");
        void runAnalysis(activePromptRef.current);
      }, 650);
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [counting, countdown, runAnalysis]);

  const handleNewAnalysis = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    runningRef.current = false;
    setScreen("intro");
    setCounting(false);
    setCountdown(3);
    setIntroOut(false);
    setInputText("");
    setActivePrompt("");
    activePromptRef.current = "";
    setPhase(0);
    setChip("Code Analyst");
    setStatus("");
    setZones(["Files", "Analysis", "Report"]);
    setReportText("");
    setSavedPath("");
    linesRef.current = { left: [], mid: [], right: [] };
    leftRef.current?.clear();
    midRef.current?.clear();
    rightRef.current?.clear();
    setTimeout(() => inputRef.current?.focus(), 120);
  }, []);

  const handleImplementInCoder = useCallback(() => {
    const summary = (reportText || linesRef.current.right.map((l) => l.text).join("\n")).trim().slice(-2000);
    if (!summary) return;
    window.glass.glassIdeOpen();
    void window.glass.agentRun({
      agentId: "coder",
      prompt: `Implement the fixes from this Code Analyst report:\n\n${summary}`,
      runId: createRunId(),
    });
    handleHide();
  }, [handleHide, reportText]);

  const handlePickWorkspace = useCallback(() => {
    armCodeAnalystOverlayPointer();
    void window.glass.agentPickWorkspaceRoot();
  }, []);

  const handleSelectRecentProject = useCallback((folderPath: string) => {
    armCodeAnalystOverlayPointer();
    void window.glass.glassIdeSelectWorkspace({ folder: folderPath });
  }, []);

  const handleCreateProject = useCallback(() => {
    armCodeAnalystOverlayPointer();
    void window.glass.glassIdeCreateProject();
  }, []);

  const needsProject = !workspaceRoot;

  const progress =
    phase === 0 ? 0 : phase === 1 ? 18 : phase === 2 ? 42 : phase === 3 ? 68 : phase === 4 ? 88 : 100;

  return (
    <div
      className={[
        "code-analyst-explorer",
        `code-analyst-explorer--${theme}`,
        !visible && "code-analyst-explorer--hidden",
      ].filter(Boolean).join(" ")}
    >
      <div className="code-analyst-explorer__glass" aria-hidden="true" />

      <header
        className="code-analyst-chrome"
        onPointerDownCapture={() => armCodeAnalystOverlayPointer()}
      >
        <div className="code-analyst-chrome__left">
          <span className="code-analyst-chrome__title">Code Analyst</span>
          <button
            type="button"
            className="code-analyst-chrome__project"
            title={workspaceRoot || "Choose project folder"}
            onClick={handlePickWorkspace}
            onPointerDown={ensureOverlayInteractive}
          >
            {workspaceRoot ? workspaceLabel : "Choose project folder…"}
          </button>
        </div>
        <div className="code-analyst-chrome__right">
          <button
            type="button"
            className="ws-chrome-theme"
            onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
            onPointerDown={prepareGlassTextPointerDown}
            aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
          >
            <span className="ws-chrome-theme__icon" aria-hidden="true">
              <Sun size={14} strokeWidth={1.75} />
            </span>
            <span>{theme === "light" ? "Light" : "Dark"}</span>
          </button>
          <button
            type="button"
            className="ws-chrome-exit"
            onClick={handleHide}
            onPointerDown={prepareGlassTextPointerDown}
          >
            Exit Analyst
          </button>
        </div>
      </header>

      {screen === "intro" && needsProject && !counting ? (
        <div className="code-analyst-intro">
          <GlassIdeProjectGate
            state={glassState}
            title="Code Analyst"
            subtitle="Open or create a project folder to analyze your codebase."
            icon="⌥"
            onOpenFolder={handlePickWorkspace}
            onCreateProject={handleCreateProject}
            onSelectRecent={handleSelectRecentProject}
            onExit={handleHide}
            hideFooterExit
          />
        </div>
      ) : null}

      {screen === "intro" && !needsProject && (
        <div className={`code-analyst-intro${introOut ? " code-analyst-intro--out" : ""}`}>
          <div className="code-analyst-intro-inner">
            <div className="ca-chip">Code Analyst</div>
            {!counting ? (
              <>
                <div className="ca-label">What should we analyze in your codebase?</div>
                <button
                  type="button"
                  className="ca-workspace-btn"
                  onClick={handlePickWorkspace}
                  onPointerDown={ensureOverlayInteractive}
                >
                  Project folder → {workspaceLabel}
                </button>
                <textarea
                  ref={inputRef}
                  className="ca-input"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onPointerDown={prepareGlassTextPointerDown}
                  onFocus={armCodeAnalystOverlayPointer}
                  onContextMenu={prepareGlassTextContextMenu}
                  placeholder='e.g. "Review error handling in the auth module"'
                  rows={3}
                  spellCheck={false}
                />
                <div className="ca-actions">
                  <button
                    className="ca-submit"
                    onClick={handleSubmit}
                    disabled={!inputText.trim() || !workspaceRoot}
                  >
                    Begin Analysis
                  </button>
                  <button className="ca-cancel" onClick={handleHide}>Cancel</button>
                </div>
                <div className="ca-hint">
                  Enter to start · Esc to hide · Reports save to {outputFolder}
                </div>
              </>
            ) : (
              <>
                <div className="ca-question">{activePrompt}</div>
                <div className="ca-status">
                  {countdown > 0 ? `Beginning in ${countdown}…` : "Starting…"}
                </div>
                <div className="ca-bar">
                  <div className="ca-bar-fill" style={{ width: `${((3 - countdown) / 3) * 100}%` }} />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {screen !== "intro" && (
        <div className="code-analyst-content">
          <div className="code-analyst-topbar">
            <div className="code-analyst-badge">{chip}</div>
            <div className="code-analyst-task">{shorten(activePrompt)}</div>
            <div className="code-analyst-phase">{status}</div>
            {screen === "deliver" ? (
              <>
                <button
                  type="button"
                  className="code-analyst-handoff"
                  onClick={handleImplementInCoder}
                  onPointerDown={prepareGlassTextPointerDown}
                >
                  Implement in Glass Coder
                </button>
                <button
                  type="button"
                  className="code-analyst-handoff"
                  onClick={handleNewAnalysis}
                  onPointerDown={prepareGlassTextPointerDown}
                >
                  New Analysis
                </button>
              </>
            ) : null}
          </div>

          <div className="code-analyst-zones">
            {zones.map((z, i) => (
              <div key={i} className="code-analyst-zone-label">{z}</div>
            ))}
          </div>

          <div className="code-analyst-columns">
            <TorrentColumn ref={leftRef} label="Files" />
            <TorrentColumn ref={midRef} label="Analysis" />
            <TorrentColumn ref={rightRef} label="Report" />

            {screen === "deliver" && reportText ? (
              <ReportPanel text={reportText} savedPath={savedPath} />
            ) : null}
          </div>

          <div className="code-analyst-progress">
            <div className="code-analyst-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}
