/**
 * WritingStudio — full-screen Writing Agent workspace (matches Research / Code Analyst shell).
 *
 * Produces blogs, emails, essays, product copy — optional web search, saves via write_file.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { PanelLeft, Plus, Sun, X } from "lucide-react";
import type { AgentEvent } from "../../shared/ipc";
import { displayAgentOutputFolder } from "../../shared/agentOutputFolder";
import {
  armWritingStudioOverlayPointer,
  ensureOverlayInteractive,
  prepareGlassTextPointerDown,
  prepareGlassTextContextMenu,
} from "../glassTextInteraction.ts";
import { useGlassState } from "../useGlassState.ts";
import { TorrentColumn, type TorrentColumnHandle } from "../research/TorrentColumn";
import type { LineType } from "../research/phaseContent";
import {
  buildWritingAgentPrompt,
  createEmptyWritingSession,
  deleteWritingSession,
  loadWritingSessionStore,
  persistWritingSessionStore,
  upsertWritingSession,
  wordCount,
  readingTimeMinutes,
  writingSessionStatusLabel,
  sessionTitleFromBrief,
  WRITING_FORMAT_LABELS,
  WRITING_TONE_LABELS,
  type WritingFormat,
  type WritingSessionSnapshot,
  type WritingSessionStore,
  type WritingTone,
  type StoredTorrentLine,
} from "./writingSessionStore";
import "../research/ResearchExplorer.css";
import "../workspace/workspaceChrome.css";
import { WorkspaceSessionTabs } from "../workspace/WorkspaceSessionTabs";
import "./WritingStudio.css";

type Theme = "light" | "dark";

const THEME_KEY = "glass-writing-theme";

type SessionLines = {
  left: StoredTorrentLine[];
  mid: StoredTorrentLine[];
  right: StoredTorrentLine[];
};

function createRunId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `writing-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function shorten(text: string, max = 52): string {
  if (!text) return "New draft";
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

function basename(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path;
}

function readTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function emptySessionLines(): SessionLines {
  return { left: [], mid: [], right: [] };
}

const FORMAT_OPTIONS = Object.keys(WRITING_FORMAT_LABELS) as WritingFormat[];
const TONE_OPTIONS = Object.keys(WRITING_TONE_LABELS) as WritingTone[];

function DocumentDeliver({
  text,
  savedPath,
  format,
  tone,
}: {
  text: string;
  savedPath: string;
  format: WritingFormat;
  tone: WritingTone;
}) {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim());
  const words = wordCount(text);
  const readMin = readingTimeMinutes(text);

  return (
    <div className="writing-deliver">
      <div className="writing-deliver__meta">
        <span className="writing-deliver__stat">{WRITING_FORMAT_LABELS[format]}</span>
        <span className="writing-deliver__stat">{WRITING_TONE_LABELS[tone]}</span>
        <span className="writing-deliver__stat">{words} words</span>
        <span className="writing-deliver__stat">{readMin} min read</span>
        {savedPath ? (
          <span className="writing-deliver__path">Saved → {basename(savedPath)}</span>
        ) : null}
      </div>
      <div className="writing-deliver__body ws-selectable" onContextMenu={prepareGlassTextContextMenu}>
        {paragraphs.map((p, i) => {
          const line = ascii(p.trim());
          if (line.startsWith("### ")) return <h3 key={i}>{line.slice(4)}</h3>;
          if (line.startsWith("## ")) return <h2 key={i}>{line.slice(3)}</h2>;
          if (line.startsWith("# ")) return <h1 key={i}>{line.slice(2)}</h1>;
          return <p key={i}>{line}</p>;
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

export function WritingStudio({ prompt: initialPrompt, visible = true, onClose }: Props) {
  const glassState = useGlassState();
  const outputFolder = displayAgentOutputFolder(glassState.glassSettings);

  const leftRef = useRef<TorrentColumnHandle>(null);
  const midRef = useRef<TorrentColumnHandle>(null);
  const rightRef = useRef<TorrentColumnHandle>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const activeBriefRef = useRef("");
  const runningRef = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);
  const activeSessionIdRef = useRef("");
  const sessionLinesRef = useRef<Map<string, SessionLines>>(new Map());
  const lastExternalPromptRef = useRef("");
  const storeRef = useRef<WritingSessionStore>(loadWritingSessionStore());

  const [sessionStore, setSessionStore] = useState<WritingSessionStore>(() => loadWritingSessionStore());
  const [screen, setScreen] = useState<"intro" | "stream" | "deliver">("intro");
  const [inputText, setInputText] = useState("");
  const [activeBrief, setActiveBrief] = useState("");
  const [format, setFormat] = useState<WritingFormat>("blog");
  const [tone, setTone] = useState<WritingTone>("professional");
  const [phase, setPhase] = useState(0);
  const [chip, setChip] = useState("Writing Agent");
  const [status, setStatus] = useState("");
  const [zones, setZones] = useState<[string, string, string]>(["References", "Craft", "Draft"]);
  const [counting, setCounting] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [introOut, setIntroOut] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => readTheme());
  const [documentText, setDocumentText] = useState("");
  const [savedPath, setSavedPath] = useState("");

  const persistStore = useCallback((next: WritingSessionStore) => {
    storeRef.current = next;
    persistWritingSessionStore(next);
    setSessionStore(next);
  }, []);

  const snapshotFromUi = useCallback((): WritingSessionSnapshot => {
    const sessionId = activeSessionIdRef.current;
    const lines = sessionLinesRef.current.get(sessionId) ?? emptySessionLines();
    const titleSource = activeBrief.trim() || inputText.trim();
    return {
      id: sessionId,
      title: sessionTitleFromBrief(titleSource),
      brief: activeBrief.trim() || inputText.trim(),
      format,
      tone,
      screen,
      inputText,
      activeBrief,
      phase,
      chip,
      status,
      zones: [zones[0] ?? "", zones[1] ?? "", zones[2] ?? ""] as [string, string, string],
      counting,
      countdown,
      introOut,
      leftLines: [...lines.left],
      midLines: [...lines.mid],
      rightLines: [...lines.right],
      documentText,
      savedPath,
      running: runningRef.current,
      createdAt:
        sessionStore.sessions.find((s) => s.id === sessionId)?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
  }, [
    activeBrief,
    chip,
    countdown,
    counting,
    documentText,
    format,
    inputText,
    introOut,
    phase,
    savedPath,
    screen,
    sessionStore.sessions,
    status,
    tone,
    zones,
  ]);

  const saveActiveSession = useCallback(() => {
    if (!activeSessionIdRef.current) return;
    const snapshot = snapshotFromUi();
    persistStore(upsertWritingSession(storeRef.current, snapshot));
  }, [persistStore, snapshotFromUi]);

  const applySession = useCallback((session: WritingSessionSnapshot) => {
    activeSessionIdRef.current = session.id;
    activeBriefRef.current = session.activeBrief;
    runningRef.current = session.running;

    sessionLinesRef.current.set(session.id, {
      left: [...session.leftLines],
      mid: [...session.midLines],
      right: [...session.rightLines],
    });

    setScreen(session.screen);
    setInputText(session.inputText);
    setActiveBrief(session.activeBrief);
    setFormat(session.format);
    setTone(session.tone);
    setPhase(session.phase);
    setChip(session.chip);
    setStatus(session.status);
    setZones([...session.zones]);
    setCounting(session.counting);
    setCountdown(session.countdown);
    setIntroOut(session.introOut);
    setDocumentText(session.documentText);
    setSavedPath(session.savedPath);

    requestAnimationFrame(() => {
      leftRef.current?.restore(session.leftLines);
      midRef.current?.restore(session.midLines);
      rightRef.current?.restore(session.rightLines);
    });
  }, []);

  const commitStore = useCallback(
    (next: WritingSessionStore, sessionToApply?: WritingSessionSnapshot) => {
      persistStore(next);
      if (sessionToApply) applySession(sessionToApply);
    },
    [applySession, persistStore],
  );

  useEffect(() => {
    const loaded = loadWritingSessionStore();
    storeRef.current = loaded;
    setSessionStore(loaded);
    const active = loaded.sessions.find((s) => s.id === loaded.activeSessionId) ?? loaded.sessions[0];
    if (active) applySession(active);
  }, [applySession]);

  useEffect(() => {
    if (!visible) return;
    document.body.classList.add("glass-body--workspace-active");
    armWritingStudioOverlayPointer();
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
    saveActiveSession();
    const session = createEmptyWritingSession(p);
    sessionLinesRef.current.set(session.id, emptySessionLines());
    const next = upsertWritingSession(storeRef.current, session);
    commitStore(next, session);
  }, [commitStore, initialPrompt, saveActiveSession]);

  useEffect(() => {
    const timer = window.setTimeout(() => saveActiveSession(), 400);
    return () => window.clearTimeout(timer);
  }, [
    activeBrief,
    chip,
    countdown,
    counting,
    documentText,
    format,
    inputText,
    introOut,
    phase,
    saveActiveSession,
    savedPath,
    screen,
    status,
    tone,
    zones,
  ]);

  const getSessionLines = useCallback((sessionId: string): SessionLines => {
    if (!sessionLinesRef.current.has(sessionId)) {
      sessionLinesRef.current.set(sessionId, emptySessionLines());
    }
    return sessionLinesRef.current.get(sessionId)!;
  }, []);

  const pushToColumn = useCallback(
    (
      sessionId: string,
      column: "left" | "mid" | "right",
      text: string,
      type: LineType = "normal",
    ) => {
      const lines = getSessionLines(sessionId);
      const entry = { text, type };
      if (column === "left") lines.left.push(entry);
      if (column === "mid") lines.mid.push(entry);
      if (column === "right") lines.right.push(entry);

      if (activeSessionIdRef.current !== sessionId) return;
      if (column === "left") leftRef.current?.push(text, type);
      if (column === "mid") midRef.current?.push(text, type);
      if (column === "right") rightRef.current?.push(text, type);
    },
    [getSessionLines],
  );

  const patchSessionInStore = useCallback(
    (sessionId: string, patch: Partial<WritingSessionSnapshot>) => {
      const existing = storeRef.current.sessions.find((s) => s.id === sessionId);
      if (!existing) return;
      const lines = getSessionLines(sessionId);
      const merged: WritingSessionSnapshot = {
        ...existing,
        ...patch,
        id: sessionId,
        leftLines: [...lines.left],
        midLines: [...lines.mid],
        rightLines: [...lines.right],
        updatedAt: Date.now(),
      };
      persistStore(upsertWritingSession(storeRef.current, merged));
    },
    [getSessionLines, persistStore],
  );

  const runWriting = useCallback(async (brief: string, sessionId: string, fmt: WritingFormat, tne: WritingTone) => {
    if (runningRef.current) return;
    runningRef.current = true;
    const agentPrompt = buildWritingAgentPrompt(brief, fmt, tne);
    patchSessionInStore(sessionId, { running: true, screen: "stream", activeBrief: brief, format: fmt, tone: tne });

    const runId = createRunId();
    let docContent = "";
    let docSavedPath = "";
    let rightBuffer = "";
    let writingDocument = false;

    const applyIfActive = (fn: () => void) => {
      if (activeSessionIdRef.current === sessionId) fn();
    };

    applyIfActive(() => {
      setPhase(1);
      setStatus("Phase 1 — Understanding brief");
      setChip("Writing Agent — Crafting");
      setZones(["References", "Craft", "Draft"]);
    });
    patchSessionInStore(sessionId, {
      phase: 1,
      status: "Phase 1 — Understanding brief",
      chip: "Writing Agent — Crafting",
      zones: ["References", "Craft", "Draft"],
    });

    pushToColumn(sessionId, "mid", `Format: ${WRITING_FORMAT_LABELS[fmt]}`, "dim");
    pushToColumn(sessionId, "mid", `Tone: ${WRITING_TONE_LABELS[tne]}`, "dim");
    pushToColumn(sessionId, "mid", "");

    const cleanup = window.glass.onAgentEvent((ev: AgentEvent) => {
      if (ev.runId !== runId) return;

      switch (ev.kind) {
        case "tool-start": {
          const name = ev.toolName ?? "";
          const input = ev.toolInput as Record<string, unknown> | null;
          if (name === "web_search") {
            const query = String(input?.query ?? "").trim();
            pushToColumn(sessionId, "left", query ? `Searching: ${query}` : "Searching web…", "dim");
            applyIfActive(() => {
              setPhase(1);
              setStatus("Phase 1 — Gathering references");
            });
            patchSessionInStore(sessionId, { phase: 1, status: "Phase 1 — Gathering references" });
            pushToColumn(sessionId, "mid", "Checking facts and context…");
          } else if (name === "write_file") {
            writingDocument = true;
            docContent = String(input?.content ?? "");
            if (rightBuffer.trim()) {
              pushToColumn(sessionId, "right", rightBuffer.trim());
              rightBuffer = "";
            }
            pushToColumn(sessionId, "right", "Saving document…", "dim");
            applyIfActive(() => {
              setPhase(4);
              setStatus("Phase 4 — Saving");
            });
            patchSessionInStore(sessionId, { phase: 4, status: "Phase 4 — Saving" });
          } else {
            pushToColumn(sessionId, "mid", `Running ${name.replace(/_/g, " ")}…`, "dim");
          }
          break;
        }
        case "tool-done": {
          const name = ev.toolName ?? "";
          if (name === "web_search" && ev.toolResult) {
            pushToColumn(sessionId, "left", "");
            pushToColumn(sessionId, "left", "Sources:", "dim");
            const lines = ev.toolResult.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 16);
            lines.forEach((l) => pushToColumn(sessionId, "left", l.slice(0, 88)));
            pushToColumn(sessionId, "left", "");
            pushToColumn(sessionId, "mid", "Outlining structure…");
            pushToColumn(sessionId, "mid", "Shaping voice and flow…");
            applyIfActive(() => {
              setPhase(2);
              setStatus("Phase 2 — Crafting");
            });
            patchSessionInStore(sessionId, { phase: 2, status: "Phase 2 — Crafting" });
          } else if (name === "write_file") {
            docSavedPath = ev.savedFilePath ?? "";
            const fname = docSavedPath ? basename(docSavedPath) : "";
            pushToColumn(sessionId, "right", fname ? `Saved: ${fname}` : "Document saved.", "signal");
          }
          break;
        }
        case "text-delta": {
          if (!ev.text || writingDocument) break;
          rightBuffer += ev.text;
          const nl = rightBuffer.lastIndexOf("\n");
          if (nl >= 0 || rightBuffer.length >= 80) {
            const flush = nl >= 0 ? rightBuffer.slice(0, nl) : rightBuffer;
            rightBuffer = nl >= 0 ? rightBuffer.slice(nl + 1) : "";
            if (flush.trim()) pushToColumn(sessionId, "right", flush.trim());
          }
          applyIfActive(() => {
            setPhase(3);
            setStatus("Phase 3 — Drafting");
          });
          patchSessionInStore(sessionId, { phase: 3, status: "Phase 3 — Drafting" });
          break;
        }
        case "narrate": {
          if (ev.text) pushToColumn(sessionId, "mid", ascii(ev.text));
          break;
        }
        case "done": {
          if (rightBuffer.trim()) pushToColumn(sessionId, "right", rightBuffer.trim());
          const finalText =
            docContent || getSessionLines(sessionId).right.map((l) => l.text).join("\n");
          applyIfActive(() => {
            setDocumentText(finalText);
            setSavedPath(docSavedPath);
            setPhase(5);
            setChip("Writing Agent — Complete");
            setStatus("Draft complete");
            setZones(["", "", ""]);
            setTimeout(() => setScreen("deliver"), 900);
          });
          patchSessionInStore(sessionId, {
            running: false,
            screen: "deliver",
            documentText: finalText,
            savedPath: docSavedPath,
            phase: 5,
            chip: "Writing Agent — Complete",
            status: "Draft complete",
            zones: ["", "", ""],
          });
          runningRef.current = false;
          break;
        }
        case "error": {
          pushToColumn(sessionId, "right", `[ERROR] ${(ev.error ?? "Unknown error").slice(0, 80)}`, "warn");
          applyIfActive(() => {
            setChip("Writing Agent — Error");
            setStatus("Error");
          });
          patchSessionInStore(sessionId, { running: false, chip: "Writing Agent — Error", status: "Error" });
          runningRef.current = false;
          break;
        }
        case "cancelled": {
          pushToColumn(sessionId, "right", "Writing cancelled.", "dim");
          applyIfActive(() => setStatus("Cancelled"));
          patchSessionInStore(sessionId, { running: false, status: "Cancelled" });
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
        agentId: "writing",
        prompt: agentPrompt,
        runId,
      });
      if (!res.started) {
        pushToColumn(sessionId, "right", `Failed to start: ${res.error ?? "agent refused"}`, "warn");
        applyIfActive(() => setStatus("Error"));
        patchSessionInStore(sessionId, { running: false, status: "Error" });
        runningRef.current = false;
      }
    } catch (err) {
      pushToColumn(sessionId, "right", `Error: ${String(err).slice(0, 80)}`, "warn");
      applyIfActive(() => setStatus("Error"));
      patchSessionInStore(sessionId, { running: false, status: "Error" });
      runningRef.current = false;
    }
  }, [getSessionLines, patchSessionInStore, pushToColumn]);

  const handleSubmit = useCallback(() => {
    const brief = inputText.trim();
    if (!brief || counting) return;
    setActiveBrief(brief);
    activeBriefRef.current = brief;
    setCounting(true);
    setCountdown(3);
  }, [counting, inputText]);

  const handleHide = useCallback(() => {
    saveActiveSession();
    onClose();
  }, [onClose, saveActiveSession]);

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
        void runWriting(
          activeBriefRef.current,
          activeSessionIdRef.current,
          format,
          tone,
        );
      }, 650);
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [counting, countdown, format, runWriting, tone]);

  const resetUiToIntro = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    runningRef.current = false;
    setPhase(0);
    setChip("Writing Agent");
    setStatus("");
    setZones(["References", "Craft", "Draft"]);
    leftRef.current?.clear();
    midRef.current?.clear();
    rightRef.current?.clear();
    setDocumentText("");
    setSavedPath("");
    setScreen("intro");
    setCounting(false);
    setCountdown(3);
    setIntroOut(false);
    setInputText("");
    setActiveBrief("");
    activeBriefRef.current = "";
    setFormat("blog");
    setTone("professional");
  }, []);

  const handleNewSession = useCallback(() => {
    saveActiveSession();
    const session = createEmptyWritingSession();
    sessionLinesRef.current.set(session.id, emptySessionLines());
    resetUiToIntro();
    const next = upsertWritingSession(storeRef.current, session);
    commitStore(next, session);
    if (visible) {
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [commitStore, resetUiToIntro, saveActiveSession, visible]);

  const switchSession = useCallback(
    (sessionId: string) => {
      if (sessionId === activeSessionIdRef.current) return;
      saveActiveSession();
      const session = storeRef.current.sessions.find((s) => s.id === sessionId);
      if (!session) return;
      const next = { ...storeRef.current, activeSessionId: sessionId };
      commitStore(next, session);
    },
    [commitStore, saveActiveSession],
  );

  const handleDeleteSession = useCallback(
    (sessionId: string, event: React.MouseEvent) => {
      event.stopPropagation();
      saveActiveSession();
      const next = deleteWritingSession(storeRef.current, sessionId);
      const active = next.sessions.find((s) => s.id === next.activeSessionId) ?? next.sessions[0];
      if (!active) return;
      commitStore(next, active);
    },
    [commitStore, saveActiveSession],
  );

  const toggleSidebar = useCallback(() => {
    const next = { ...storeRef.current, sidebarOpen: !storeRef.current.sidebarOpen };
    persistStore(next);
  }, [persistStore]);

  const handleCopyDocument = useCallback(() => {
    const text = documentText.trim();
    if (!text) return;
    void navigator.clipboard.writeText(text);
  }, [documentText]);

  const progress =
    phase === 0 ? 0 : phase === 1 ? 20 : phase === 2 ? 45 : phase === 3 ? 72 : phase === 4 ? 90 : 100;
  const shortBrief = shorten(activeBrief);
  const canSubmit = inputText.trim().length > 0 && !counting;
  const tabSessions = sessionStore.sessions.slice(0, 8);

  return (
    <div
      className={[
        "writing-studio",
        `writing-studio--${theme}`,
        !visible && "writing-studio--hidden",
        sessionStore.sidebarOpen && "writing-studio--sidebar-open",
      ].filter(Boolean).join(" ")}
    >
      <div className="writing-studio__glass" aria-hidden="true" />

      <aside
        className={`writing-sidebar${sessionStore.sidebarOpen ? " writing-sidebar--open" : ""}`}
        aria-label="Recent drafts"
      >
        <div className="writing-sidebar__header">
          <span className="writing-sidebar__title">Recent drafts</span>
          <button
            type="button"
            className="writing-sidebar__item-delete"
            onClick={toggleSidebar}
            aria-label="Close history panel"
          >
            <X size={16} />
          </button>
        </div>
        <div className="writing-sidebar__list">
          {sessionStore.sessions.map((session) => (
            <button
              key={session.id}
              type="button"
              className={`writing-sidebar__item${
                session.id === sessionStore.activeSessionId ? " writing-sidebar__item--active" : ""
              }`}
              onClick={() => switchSession(session.id)}
            >
              <span className="writing-sidebar__item-title">{session.title}</span>
              <span className="writing-sidebar__item-meta">
                <span>{writingSessionStatusLabel(session)}</span>
                <span>{new Date(session.updatedAt).toLocaleDateString()}</span>
              </span>
              <span
                role="button"
                tabIndex={0}
                className="writing-sidebar__item-delete"
                aria-label={`Delete ${session.title}`}
                onClick={(event) => handleDeleteSession(session.id, event)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    handleDeleteSession(session.id, event as unknown as React.MouseEvent);
                  }
                }}
              >
                <X size={12} />
              </span>
            </button>
          ))}
        </div>
      </aside>

      <header
        className="writing-chrome"
        onPointerDownCapture={() => armWritingStudioOverlayPointer()}
      >
        <div className="writing-chrome__left">
          <button
            type="button"
            className="writing-history-toggle"
            onClick={toggleSidebar}
            onPointerDown={prepareGlassTextPointerDown}
            aria-label="Toggle draft history"
            aria-expanded={sessionStore.sidebarOpen}
          >
            <PanelLeft size={16} strokeWidth={1.75} />
            <span>History</span>
          </button>
          <button
            type="button"
            className="writing-new-btn"
            onClick={handleNewSession}
            onPointerDown={prepareGlassTextPointerDown}
          >
            <Plus size={15} strokeWidth={2} />
            <span>New</span>
          </button>
          <WorkspaceSessionTabs
            sessions={tabSessions}
            activeSessionId={sessionStore.activeSessionId}
            onSelect={switchSession}
            onClose={(sessionId, event) => handleDeleteSession(sessionId, event)}
            shortenTitle={(title) => shorten(title, 28)}
            ariaLabel="Open draft sessions"
          />
        </div>
        <div className="writing-chrome__right">
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
            Exit Studio
          </button>
        </div>
      </header>

      {screen === "intro" && (
        <div className={`writing-intro${introOut ? " writing-intro--out" : ""}`}>
          <div className="writing-intro-inner">
            <div className="ws-chip">Writing Agent</div>
            {!counting ? (
              <>
                <div className="ws-label">What should we write?</div>
                <div className="ws-option-row">
                  <span className="ws-option-label">Format</span>
                  {FORMAT_OPTIONS.map((f) => (
                    <button
                      key={f}
                      type="button"
                      className={`ws-chip-btn${format === f ? " ws-chip-btn--active" : ""}`}
                      onClick={() => setFormat(f)}
                      onPointerDown={ensureOverlayInteractive}
                    >
                      {WRITING_FORMAT_LABELS[f]}
                    </button>
                  ))}
                </div>
                <div className="ws-option-row">
                  <span className="ws-option-label">Tone</span>
                  {TONE_OPTIONS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`ws-chip-btn${tone === t ? " ws-chip-btn--active" : ""}`}
                      onClick={() => setTone(t)}
                      onPointerDown={ensureOverlayInteractive}
                    >
                      {WRITING_TONE_LABELS[t]}
                    </button>
                  ))}
                </div>
                <textarea
                  ref={inputRef}
                  className="ws-input"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onPointerDown={prepareGlassTextPointerDown}
                  onFocus={armWritingStudioOverlayPointer}
                  onContextMenu={prepareGlassTextContextMenu}
                  placeholder='e.g. "Product launch email for IIVO Glass v0.7 — excited but professional"'
                  rows={4}
                  spellCheck
                />
                <div className="ws-actions">
                  <button className="ws-submit" onClick={handleSubmit} disabled={!canSubmit}>
                    Start Writing
                  </button>
                  <button className="ws-cancel" onClick={handleHide}>Cancel</button>
                </div>
                <div className="ws-hint">
                  Enter to start · Esc to hide · Documents save to {outputFolder}
                </div>
              </>
            ) : (
              <>
                <div className="ws-brief">{activeBrief}</div>
                <div className="ws-status">
                  {countdown > 0 ? `Beginning in ${countdown}…` : "Starting…"}
                </div>
                <div className="ws-bar">
                  <div className="ws-bar-fill" style={{ width: `${((3 - countdown) / 3) * 100}%` }} />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {screen !== "intro" && (
        <div className="writing-content">
          <div className="writing-topbar">
            <div className="writing-badge">{chip}</div>
            <div className="writing-task">{shortBrief}</div>
            <div className="writing-phase">{status}</div>
            {screen === "deliver" ? (
              <>
                <button
                  type="button"
                  className="writing-action-btn"
                  onClick={handleCopyDocument}
                  onPointerDown={prepareGlassTextPointerDown}
                  disabled={!documentText.trim()}
                >
                  Copy
                </button>
                <button
                  type="button"
                  className="writing-action-btn"
                  onClick={handleNewSession}
                  onPointerDown={prepareGlassTextPointerDown}
                >
                  New Draft
                </button>
              </>
            ) : null}
          </div>

          <div className="writing-zones">
            {zones.map((z, i) => (
              <div key={i} className="writing-zone-label">{z}</div>
            ))}
          </div>

          <div className="writing-columns">
            <TorrentColumn ref={leftRef} label="References" />
            <TorrentColumn ref={midRef} label="Craft" />
            <TorrentColumn ref={rightRef} label="Draft" />

            {screen === "deliver" && documentText ? (
              <DocumentDeliver
                text={documentText}
                savedPath={savedPath}
                format={format}
                tone={tone}
              />
            ) : null}
          </div>

          <div className="writing-progress">
            <div className="writing-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}
