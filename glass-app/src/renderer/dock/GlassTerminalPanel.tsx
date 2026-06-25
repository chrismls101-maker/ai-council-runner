/**
 * IIVO Glass built-in terminal panel.
 *
 * Addons active:
 *   @xterm/addon-canvas   — WebGL2/canvas renderer (smooth scrolling, lower CPU)
 *   @xterm/addon-fit      — auto-resize to container
 *   @xterm/addon-search   — Cmd+F inline find bar
 *   @xterm/addon-web-links — Cmd+click URLs
 *   @xterm/addon-ligatures — programming ligatures (Node env required, Electron ✓)
 *   @xterm/addon-image    — inline images via SIXEL + iTerm2 IIP protocol
 *
 * Hotkeys:
 *   Cmd+K          → clear terminal + scrollback
 *   Cmd+F          → toggle find bar
 *   Escape         → close find bar (when open)
 */

import { useEffect, useRef, useCallback, useState, forwardRef, useImperativeHandle } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { CanvasAddon } from "@xterm/addon-canvas";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { LigaturesAddon } from "@xterm/addon-ligatures";
import { ImageAddon } from "@xterm/addon-image";
import type { ISearchOptions } from "@xterm/addon-search";
import type {
  TerminalExplainResponse,
  TerminalSuggestion,
  ScrollbackWriteBlock,
  ScrollbackSearchResult,
  TerminalFixResponse,
} from "../../shared/ipc.ts";
import { send, useGlassState } from "../useGlassState.ts";
import { loadTerminalSize, GLASS_TERMINAL_REVEAL_MS, type GlassTerminalSize } from "./glassTerminalLayout.ts";
import { useTerminalPanelResize } from "./useTerminalPanelResize.ts";
import { useTerminalBlockSessions } from "./useTerminalBlocks.ts";
import type { TerminalBlock } from "./useTerminalBlocks.ts";
import type { GlassTerminalPanelAction } from "../../shared/terminalPanelActions.ts";
import { extractOsc7Cwd } from "./terminalOscParse.ts";
import { TerminalWelcomeSwarm } from "./TerminalWelcomeSwarm.tsx";
import { GlassHoverTooltip } from "../components/GlassHoverTooltip.tsx";
import { armIdeOverlayPointer, prepareGlassTextPointerDown } from "../glassTextInteraction.ts";

import "@xterm/xterm/css/xterm.css";
import "./GlassTerminalPanel.css";

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

const GLASS_TERMINAL_THEME = {
  background: "#0a0c12",
  foreground: "#e2e8f0",
  cursor: "#41e0a3",
  cursorAccent: "#0d1117",
  selectionBackground: "rgba(65, 224, 163, 0.25)",
  black: "#1a1f2e",
  red: "#ff6b7a",
  green: "#41e0a3",
  yellow: "#f0c96a",
  blue: "#7eb0ff",
  magenta: "#c084fc",
  cyan: "#38e1ff",
  white: "#e2e8f0",
  brightBlack: "#4a5568",
  brightRed: "#ff8b94",
  brightGreen: "#6affd4",
  brightYellow: "#ffd080",
  brightBlue: "#99c5ff",
  brightMagenta: "#d8b4fe",
  brightCyan: "#70efff",
  brightWhite: "#f8fafc",
};

const SEARCH_OPTIONS: ISearchOptions = {
  regex: false,
  wholeWord: false,
  caseSensitive: false,
  incremental: true,
  decorations: {
    matchBackground: "rgba(255, 193, 7, 0.3)",
    matchBorder: "rgba(255, 193, 7, 0.6)",
    matchOverviewRuler: "rgba(255, 193, 7, 0.8)",
    activeMatchBackground: "rgba(255, 152, 0, 0.5)",
    activeMatchBorder: "rgba(255, 152, 0, 0.9)",
    activeMatchColorOverviewRuler: "rgba(255, 152, 0, 0.9)",
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function terminalContainerReady(el: HTMLElement): boolean {
  return el.clientWidth >= 2 && el.clientHeight >= 2;
}

/** Wait for shell to emit a fresh prompt after SIGWINCH before replaying PTY output. */
const PTY_ATTACH_SETTLE_MS = 48;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function fitTerminalToPty(
  termId: string,
  term: Terminal,
  fit: FitAddon,
  container: HTMLDivElement,
): void {
  if (!terminalContainerReady(container)) return;
  fit.fit();
  window.glass.sendPtyResize(termId, term.cols, term.rows);
}
// ESC ] 0 ; <title> BEL  or  ESC ] 0 ; <title> ESC \
// ESC ] 2 ; <title> BEL  or  ESC ] 2 ; <title> ESC \
const OSC_TITLE_RE = /\x1b\](?:0|2);([^\x07\x1b]*)(?:\x07|\x1b\\)/g;

// ---------------------------------------------------------------------------
// Find Bar component
// ---------------------------------------------------------------------------

function FindBar({
  searchAddon,
  onClose,
}: {
  searchAddon: SearchAddon;
  onClose: () => void;
}): JSX.Element {
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [regex, setRegex] = useState(false);
  const [matchCount, setMatchCount] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const search = useCallback(
    (q: string, forward = true, overrides?: Partial<ISearchOptions>): void => {
      if (!q) {
        setMatchCount("");
        return;
      }
      // Accept explicit overrides so toggle buttons can pass the *new* flag value
      // before the React state update has re-rendered (fixes stale-closure bug).
      const opts: ISearchOptions = { ...SEARCH_OPTIONS, caseSensitive, regex, ...overrides };
      const found = forward
        ? searchAddon.findNext(q, opts)
        : searchAddon.findPrevious(q, opts);
      setMatchCount(found ? "" : "No results");
    },
    [searchAddon, caseSensitive, regex],
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const q = e.target.value;
    setQuery(q);
    search(q, true);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "Enter") { search(query, !e.shiftKey); }
  };

  return (
    <div className="gtp-find-bar" role="search" aria-label="Find in terminal">
      <div className="gtp-find-input-wrap">
        <input
          ref={inputRef}
          className="gtp-find-input"
          type="text"
          placeholder="Find…"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKey}
          spellCheck={false}
          autoComplete="off"
        />
        {matchCount && <span className="gtp-find-no-results">{matchCount}</span>}
      </div>
      <div className="gtp-find-actions">
        <button
          type="button"
          className={`gtp-find-toggle${caseSensitive ? " gtp-find-toggle--active" : ""}`}
          title="Case sensitive"
          onClick={() => {
            const next = !caseSensitive;
            setCaseSensitive(next);
            // Pass new value directly to avoid stale-closure using old state
            search(query, true, { caseSensitive: next });
          }}
        >Aa</button>
        <button
          type="button"
          className={`gtp-find-toggle${regex ? " gtp-find-toggle--active" : ""}`}
          title="Regular expression"
          onClick={() => {
            const next = !regex;
            setRegex(next);
            search(query, true, { regex: next });
          }}
        >.*</button>
        <button
          type="button"
          className="gtp-find-nav"
          title="Previous match (Shift+Enter)"
          onClick={() => search(query, false)}
        >↑</button>
        <button
          type="button"
          className="gtp-find-nav"
          title="Next match (Enter)"
          onClick={() => search(query, true)}
        >↓</button>
        <button
          type="button"
          className="gtp-find-close"
          title="Close (Escape)"
          onClick={onClose}
        >✕</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ExplainOverlay — ⌘+E "Explain Last Error" card (Task #39)
// ---------------------------------------------------------------------------

type ExplainState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "done"; result?: TerminalExplainResponse; command?: string; content?: string }
  | { phase: "error"; message: string };

function renderMarkdownInline(text: string): JSX.Element {
  // Minimal inline Markdown: bold (**text**), code (`text`), newlines.
  // Full parser not needed — explanations are short and predictable.
  const parts: (string | JSX.Element)[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Code spans first (higher priority)
    const codeMatch = remaining.match(/^([\s\S]*?)`([^`]+)`/);
    if (codeMatch) {
      if (codeMatch[1]) parts.push(codeMatch[1]);
      parts.push(<code key={key++} className="gte-inline-code">{codeMatch[2]}</code>);
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }
    // Bold
    const boldMatch = remaining.match(/^([\s\S]*?)\*\*([^*]+)\*\*/);
    if (boldMatch) {
      if (boldMatch[1]) parts.push(boldMatch[1]);
      parts.push(<strong key={key++}>{boldMatch[2]}</strong>);
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }
    // No more patterns — emit the rest
    parts.push(remaining);
    break;
  }

  // Split on newlines for line breaks
  const withBreaks: (string | JSX.Element)[] = [];
  parts.forEach((part, i) => {
    if (typeof part === "string") {
      const lines = part.split("\n");
      lines.forEach((line, j) => {
        withBreaks.push(line);
        if (j < lines.length - 1) withBreaks.push(<br key={`br-${i}-${j}`} />);
      });
    } else {
      withBreaks.push(part);
    }
  });

  return <>{withBreaks}</>;
}

function ExplainOverlay({
  state,
  onDismiss,
  onCopy,
}: {
  state: ExplainState;
  onDismiss: () => void;
  onCopy: (text: string) => void;
}): JSX.Element | null {
  if (state.phase === "idle") return null;

  return (
    <div className="gte-overlay" role="dialog" aria-label="Explain last error">
      <div className="gte-overlay-header">
        <span className="gte-overlay-icon">⚡</span>
        <span className="gte-overlay-title">Explain Last Error</span>
        {state.phase === "done" && state.command && (
          <span className="gte-overlay-cmd" title={state.command}>{state.command}</span>
        )}
        <button
          type="button"
          className="gte-overlay-close"
          onClick={onDismiss}
          title="Dismiss (Escape)"
        >✕</button>
      </div>

      <div className="gte-overlay-body">
        {state.phase === "loading" && (
          <div className="gte-overlay-loading">
            <span className="gte-spinner" />
            <span>Analyzing with Claude…</span>
          </div>
        )}

        {state.phase === "error" && (
          <div className="gte-overlay-error">{state.message}</div>
        )}

        {state.phase === "done" && (
          <>
            {state.result?.error ? (
              <div className="gte-overlay-error">{state.result.error}</div>
            ) : (
              <div className="gte-overlay-explanation">
                {renderMarkdownInline(state.result?.explanation ?? "")}
              </div>
            )}
          </>
        )}
      </div>

      {state.phase === "done" && state.result?.explanation && (
        <div className="gte-overlay-footer">
          <button
            type="button"
            className="gte-overlay-copy"
            onClick={() => onCopy(state.result?.explanation ?? "")}
          >
            Copy
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// VisionOverlay — ⌘+Shift+E "Screen Analysis" card (Task #45)
// ---------------------------------------------------------------------------
// Reuses the .gte-overlay* styles but pins to the top of the panel
// (.gte-vision-overlay) so it never overlaps the bottom Explain overlay.

function VisionOverlay({
  state,
  onDismiss,
  onCopy,
}: {
  state: ExplainState;
  onDismiss: () => void;
  onCopy: (text: string) => void;
}): JSX.Element | null {
  if (state.phase === "idle") return null;

  const content = state.phase === "done" ? state.content ?? "" : "";

  return (
    <div className="gte-overlay gte-vision-overlay" role="dialog" aria-label="Screen analysis">
      <div className="gte-overlay-header">
        <span className="gte-overlay-icon">👁</span>
        <span className="gte-overlay-title">Screen Analysis</span>
        <button
          type="button"
          className="gte-overlay-close"
          onClick={onDismiss}
          title="Dismiss (Escape)"
        >✕</button>
      </div>

      <div className="gte-overlay-body">
        {state.phase === "loading" && (
          <div className="gte-overlay-loading">
            <span className="gte-spinner" />
            <span>Analyzing your screen with Claude…</span>
          </div>
        )}

        {state.phase === "error" && (
          <div className="gte-overlay-error">{state.message}</div>
        )}

        {state.phase === "done" && (
          <div className="gte-overlay-explanation">
            {renderMarkdownInline(content)}
          </div>
        )}
      </div>

      {state.phase === "done" && content && (
        <div className="gte-overlay-footer">
          <button
            type="button"
            className="gte-overlay-copy"
            onClick={() => onCopy(content)}
          >
            Copy
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// NLCommandBar — ⌃+Space natural language → shell command (Task #40)
// ---------------------------------------------------------------------------

type NLState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "done"; command: string }
  | { phase: "error"; message: string };

export type NLCommandBarHandle = {
  focusInput: () => void;
};

const NLCommandBar = forwardRef<
  NLCommandBarHandle,
  {
    blocks: TerminalBlock[];
    termId: string | undefined;
    voiceActive: boolean;
    voiceStopSignal: number;
    onVoiceStart: () => void;
    onVoiceStop: () => void;
    onVoiceClose: () => void;
    embedded?: boolean;
  }
>(function NLCommandBar(
  { blocks, termId, voiceActive, voiceStopSignal, onVoiceStart, onVoiceStop, onVoiceClose, embedded = false },
  ref,
) {
  const [query, setQuery] = useState("");
  const [nlState, setNlState] = useState<NLState>({ phase: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focusInput: (): void => {
      inputRef.current?.focus();
    },
  }));

  const resetNl = useCallback((): void => {
    setQuery("");
    setNlState({ phase: "idle" });
  }, []);

  const submit = useCallback((): void => {
    const prompt = query.trim();
    if (!prompt) return;
    setNlState({ phase: "loading" });
    window.glass
      .nlToShell({
        prompt,
        recentCommands: blocks.slice(-5).map((b) => b.command).filter(Boolean),
      })
      .then((res) => {
        if (res.error) {
          setNlState({ phase: "error", message: res.error });
          return;
        }
        // Strip any trailing newline the LLM might leave in.
        const command = (res.command ?? "").replace(/\n+$/, "").trim();
        if (!command) {
          setNlState({ phase: "error", message: "No command returned" });
          return;
        }
        setNlState({ phase: "done", command });
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Conversion failed";
        setNlState({ phase: "error", message });
      });
  }, [query, blocks]);

  const runCommand = useCallback(
    (command: string): void => {
      if (!termId) return;
      window.glass.sendPtyInput(termId, command + "\n");
      resetNl();
      inputRef.current?.blur();
    },
    [termId, resetNl],
  );

  const editCommand = useCallback((command: string): void => {
    setQuery(command);
    setNlState({ phase: "idle" });
    inputRef.current?.focus();
  }, []);

  const handleInputKey = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      resetNl();
      inputRef.current?.blur();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      // Bug #1 fix: stop bubbling so the outer div's handlePreviewKey
      // doesn't also fire and double-inject the command.
      e.stopPropagation();
      if (nlState.phase === "done") {
        runCommand(nlState.command);
      } else if (nlState.phase === "idle" || nlState.phase === "error") {
        // Bug #2 fix: don't re-submit while a request is already in flight.
        submit();
      }
      return;
    }
  };

  // Handles Enter/Tab on the PREVIEW area (not the input).
  // The input's stopPropagation prevents it from double-firing there.
  const handlePreviewKey = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (nlState.phase !== "done") return;
    if (e.key === "Escape") {
      e.preventDefault();
      resetNl();
      return;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      runCommand(nlState.command);
    }
  };

  return (
    <div
      className="gtp-nl-bar"
      role="region"
      aria-label="Natural language to shell command"
      onKeyDown={handlePreviewKey}
      onPointerDownCapture={embedded ? armIdeOverlayPointer : undefined}
    >
      <div className="gtp-nl-label">
        <div className="gtp-nl-label-main">
          <span className="gtp-nl-label-icon" aria-hidden="true">⌃</span>
          <span className="gtp-nl-label-arrow" aria-hidden="true">→</span>
          <span>Shell</span>
        </div>
        <span className="gtp-nl-label-hint">
          Describe what you want — Enter converts it to a shell command
        </span>
      </div>

      {voiceActive && termId && (
        <VoiceShellBar
          embedded
          blocks={blocks}
          termId={termId}
          stopSignal={voiceStopSignal}
          onClose={onVoiceClose}
        />
      )}

      <div className="gtp-nl-input-row">
        <button
          type="button"
          className={`gtp-nl-mic-btn${voiceActive ? " gtp-nl-mic-btn--active" : ""}`}
          onClick={() => {
            if (!termId) return;
            if (voiceActive) onVoiceStop();
            else onVoiceStart();
          }}
          onPointerDown={embedded ? armIdeOverlayPointer : undefined}
          disabled={!termId}
          aria-label={voiceActive ? "Stop voice input" : "Voice to shell"}
          title={voiceActive ? "Stop voice (⌘⇧V)" : "Voice to shell (⌘⇧V)"}
        >
          <IconMic />
        </button>
        <div className="gtp-nl-input-wrap">
          <input
            ref={inputRef}
            className="gtp-nl-input"
            type="text"
            placeholder="e.g. find all files bigger than 100MB in home dir"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKey}
            onPointerDown={embedded ? prepareGlassTextPointerDown : undefined}
            spellCheck={false}
            autoComplete="off"
            disabled={voiceActive}
          />
        </div>
      </div>

      {nlState.phase === "loading" && (
        <div className="gtp-nl-loading">
          <span className="gte-spinner" />
          <span>Converting with Claude…</span>
        </div>
      )}

      {nlState.phase === "error" && (
        <div className="gtp-nl-error">{nlState.message}</div>
      )}

      {nlState.phase === "done" && (
        <>
          <div className="gtp-nl-preview">
            <code className="gtp-nl-preview-cmd">{nlState.command}</code>
          </div>
          {!termId && (
            <div className="gtp-nl-error">No active terminal session — start one to run this.</div>
          )}
          <div className="gtp-nl-actions">
            <button
              type="button"
              className="gtp-nl-btn gtp-nl-btn--run"
              onClick={() => runCommand(nlState.command)}
              disabled={!termId}
              title={termId ? "Run command (Enter / Tab)" : "No active terminal session"}
            >
              ↵ Run
            </button>
            <button
              type="button"
              className="gtp-nl-btn gtp-nl-btn--edit"
              onClick={() => editCommand(nlState.command)}
              title="Edit the request"
            >
              Edit
            </button>
          </div>
        </>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// VoiceShellBar — ⌘+Shift+V voice → shell command (Task #44)
// ---------------------------------------------------------------------------

type VoiceShellPhase =
  | { phase: "recording" }
  | { phase: "transcribing" }
  | { phase: "converting"; transcript: string }
  | { phase: "ready"; transcript: string; command: string }
  | { phase: "error"; message: string };

function pickRecorderMimeType(): string {
  if (
    typeof MediaRecorder !== "undefined" &&
    MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
  ) {
    return "audio/webm;codecs=opus";
  }
  return "audio/webm";
}

function VoiceShellBar({
  blocks,
  termId,
  onClose,
  stopSignal,
  embedded = false,
}: {
  blocks: TerminalBlock[];
  termId: string | undefined;
  onClose: () => void;
  /** Incremented by the parent when ⌘⇧V is pressed again — triggers stop. */
  stopSignal: number;
  embedded?: boolean;
}): JSX.Element {
  const [state, setState] = useState<VoiceShellPhase>({ phase: "recording" });
  const [elapsed, setElapsed] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const mimeTypeRef = useRef<string>("audio/webm");
  // Guards double-stop (hotkey + button + unmount can all race).
  const stoppedRef = useRef(false);

  // Releases the mic stream + recorder. CRITICAL: without stopping the tracks
  // the browser keeps the mic-active indicator on forever.
  const releaseMic = useCallback((): void => {
    try {
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") rec.stop();
    } catch {
      /* ignore */
    }
    recorderRef.current = null;
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  // The full transcribe → convert pipeline, run when recording stops.
  const runPipeline = useCallback(
    async (audioBlob: Blob): Promise<void> => {
      try {
        const buffer = await audioBlob.arrayBuffer();
        setState({ phase: "transcribing" });

        const tr = await window.glass.voiceShellTranscribe({
          buffer,
          mimeType: mimeTypeRef.current,
        });
        if (tr.error || !tr.transcript) {
          setState({ phase: "error", message: tr.error ?? "No speech detected" });
          return;
        }
        const transcript = tr.transcript;
        setState({ phase: "converting", transcript });

        const nl = await window.glass.nlToShell({
          prompt: transcript,
          recentCommands: blocks.slice(-5).map((b) => b.command).filter(Boolean),
        });
        if (nl.error) {
          setState({ phase: "error", message: nl.error });
          return;
        }
        const command = (nl.command ?? "").replace(/\n+$/, "").trim();
        if (!command) {
          setState({ phase: "error", message: "No command returned" });
          return;
        }
        setState({ phase: "ready", transcript, command });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Voice command failed";
        setState({ phase: "error", message });
      }
    },
    [blocks],
  );

  // Stop recording → assemble chunks → run pipeline.
  const stopRecording = useCallback((): void => {
    if (stoppedRef.current) return;
    stoppedRef.current = true;

    const rec = recorderRef.current;
    const mimeType = mimeTypeRef.current;

    const finish = (): void => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      // Release the mic immediately once we have the data.
      const stream = streamRef.current;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      recorderRef.current = null;
      void runPipeline(blob);
    };

    if (rec && rec.state !== "inactive") {
      rec.onstop = finish;
      try {
        rec.stop();
      } catch {
        finish();
      }
    } else {
      finish();
    }
  }, [runPipeline]);

  // Mount: request mic + start recording.
  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
      })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const mimeType = pickRecorderMimeType();
        mimeTypeRef.current = mimeType;
        const recorder = new MediaRecorder(stream, { mimeType });
        recorderRef.current = recorder;
        chunksRef.current = [];
        recorder.ondataavailable = (e: BlobEvent) => {
          if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
        };
        recorder.start(100);
        setState({ phase: "recording" });
      })
      .catch((err: unknown) => {
        const message =
          err instanceof Error && err.name === "NotAllowedError"
            ? "Microphone access denied — allow it in System Settings → Privacy → Microphone."
            : err instanceof Error
              ? err.message
              : "Could not access the microphone.";
        setState({ phase: "error", message });
      });

    return () => {
      cancelled = true;
      releaseMic();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Elapsed timer — only ticks while recording.
  useEffect(() => {
    if (state.phase !== "recording") return;
    setElapsed(0);
    const id = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [state.phase]);

  // Parent pressed ⌘⇧V again while recording → stop & transcribe.
  // While not recording, a repeat press dismisses the bar.
  const phaseRef = useRef(state.phase);
  phaseRef.current = state.phase;
  useEffect(() => {
    if (stopSignal === 0) return;
    if (phaseRef.current === "recording") {
      stopRecording();
    } else {
      releaseMic();
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopSignal]);

  const dismiss = useCallback((): void => {
    releaseMic();
    onClose();
  }, [releaseMic, onClose]);

  const runCommand = useCallback(
    (command: string): void => {
      if (!termId) return;
      window.glass.sendPtyInput(termId, command + "\n");
      dismiss();
    },
    [termId, dismiss],
  );

  // Keyboard: Escape always dismisses; Enter/Tab runs when ready.
  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      dismiss();
      return;
    }
    if (state.phase === "ready" && (e.key === "Enter" || e.key === "Tab")) {
      e.preventDefault();
      e.stopPropagation();
      runCommand(state.command);
    }
  };

  const fmt = (s: number): string =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const isReady = state.phase === "ready";

  return (
    <div
      className={`gtp-voice-bar${isReady ? " gtp-voice-bar--ready" : ""}${embedded ? " gtp-voice-bar--embedded" : ""}`}
      role={embedded ? "group" : "dialog"}
      aria-label="Voice to shell command"
      tabIndex={embedded ? undefined : -1}
      ref={embedded ? undefined : (el) => el?.focus()}
      onKeyDown={handleKey}
    >
      {!embedded && (
        <div className="gtp-voice-header">
          <span className="gtp-voice-label">🎤 Voice → Shell</span>
          {state.phase === "recording" && (
            <span className="gtp-voice-timer">{fmt(elapsed)}</span>
          )}
        </div>
      )}

      {embedded && state.phase === "recording" && (
        <div className="gtp-voice-header gtp-voice-header--embedded">
          <span className="gtp-voice-recording-dot" />
          <span className="gtp-voice-label">Listening…</span>
          <span className="gtp-voice-timer">{fmt(elapsed)}</span>
        </div>
      )}

      {state.phase === "recording" && !embedded && (
        <div className="gtp-voice-status">
          <span className="gtp-voice-recording-dot" />
          <div className="gtp-voice-waveform" aria-hidden="true">
            <span /><span /><span /><span /><span />
          </div>
          <span>Listening… speak your command</span>
        </div>
      )}

      {state.phase === "transcribing" && (
        <div className="gtp-voice-status">
          <span className="gte-spinner" />
          <span>Transcribing with Deepgram…</span>
        </div>
      )}

      {state.phase === "converting" && (
        <>
          <div className="gtp-voice-transcript">“{state.transcript}”</div>
          <div className="gtp-voice-status">
            <span className="gte-spinner" />
            <span>Converting to shell command…</span>
          </div>
        </>
      )}

      {state.phase === "ready" && (
        <>
          <div className="gtp-voice-transcript">“{state.transcript}”</div>
          <div className="gtp-voice-preview">
            <code className="gtp-voice-preview-cmd">{state.command}</code>
          </div>
          {!termId && (
            <div className="gtp-voice-error">
              No active terminal session — start one to run this.
            </div>
          )}
          <div className="gtp-voice-actions">
            <button
              type="button"
              className="gtp-voice-btn gtp-voice-btn--run"
              onClick={() => runCommand(state.command)}
              disabled={!termId}
              title={termId ? "Run command (Enter / Tab)" : "No active terminal session"}
            >
              ↵ Run
            </button>
            <button
              type="button"
              className="gtp-voice-btn"
              onClick={() => {
                void window.glass.writeClipboard(state.command).catch(() => {});
              }}
              title="Copy command to clipboard"
            >
              Copy
            </button>
            <button
              type="button"
              className="gtp-voice-btn"
              onClick={dismiss}
              title="Dismiss (Esc)"
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {state.phase === "error" && (
        <>
          <div className="gtp-voice-error">{state.message}</div>
          <div className="gtp-voice-actions">
            <button
              type="button"
              className="gtp-voice-btn"
              onClick={dismiss}
              title="Dismiss (Esc)"
            >
              Close
            </button>
          </div>
        </>
      )}

      {state.phase === "recording" && (
        <div className="gtp-voice-actions">
          <button
            type="button"
            className="gtp-voice-btn gtp-voice-btn--stop"
            onClick={stopRecording}
            title="Stop & transcribe (⌘⇧V)"
          >
            ■ Stop
          </button>
          <button
            type="button"
            className="gtp-voice-btn"
            onClick={dismiss}
            title="Dismiss (Esc)"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SuggestionsBar — AI next-command suggestions (Task #46)
// ---------------------------------------------------------------------------
// Slim bar that slides up after a command finishes, offering 3 AI-suggested
// next commands. Clicking a chip injects it into the PTY. Auto-dismisses on
// any keypress (handled by the parent's keydown effect).

interface SuggestionsBarProps {
  suggestions: TerminalSuggestion[];
  onSelect: (command: string) => void;
  onDismiss: () => void;
  loading: boolean;
}

function SuggestionsBar({
  suggestions,
  onSelect,
  onDismiss,
  loading,
}: SuggestionsBarProps): JSX.Element {
  return (
    <div className="gtp-suggest-bar" role="region" aria-label="AI command suggestions">
      <div className="gtp-suggest-label">
        <span className="gtp-suggest-label-icon">✨</span>
        <span>Next</span>
      </div>

      {loading ? (
        <div className="gtp-suggest-loading">
          <span className="gte-spinner" />
          <span>Thinking…</span>
        </div>
      ) : (
        <div className="gtp-suggest-chips">
          {suggestions.map((s, i) => (
            <button
              key={`${i}-${s.command}`}
              type="button"
              className="gtp-suggest-chip"
              title={s.why || s.command}
              onClick={() => {
                onSelect(s.command);
                onDismiss();
              }}
            >
              <span className="gtp-suggest-chip-cmd">{s.command}</span>
              {s.why && <span className="gtp-suggest-chip-why">{s.why}</span>}
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        className="gtp-suggest-dismiss"
        title="Dismiss suggestions"
        aria-label="Dismiss suggestions"
        onClick={onDismiss}
      >
        ✕
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ScrollbackSearchBar — natural-language search over persisted history (Task #47)
// ---------------------------------------------------------------------------
// ⌘⇧F opens a search bar. Claude ranks the encrypted command history (over
// plaintext command summaries kept in SQLite) and returns matching rows. Each
// result can be re-injected into the PTY (without a trailing newline — the user
// presses Enter) or copied to the clipboard.

type SearchState =
  | { phase: "idle" }
  | { phase: "searching" }
  | { phase: "results"; results: ScrollbackSearchResult[] }
  | { phase: "error"; message: string };

interface ScrollbackSearchBarProps {
  onInject: (command: string) => void;
  onClose: () => void;
}

function ScrollbackSearchBar({ onInject, onClose }: ScrollbackSearchBarProps): JSX.Element {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>({ phase: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSearch = async (): Promise<void> => {
    if (!query.trim() || state.phase === "searching") return;
    setState({ phase: "searching" });
    try {
      const res = await window.glass.scrollbackSearch({ query });
      if (res.error) {
        setState({ phase: "error", message: res.error });
      } else {
        setState({ phase: "results", results: res.results ?? [] });
      }
    } catch (e) {
      setState({ phase: "error", message: String(e) });
    }
  };

  const handleKey = (e: React.KeyboardEvent): void => {
    e.stopPropagation();
    if (e.key === "Enter") void handleSearch();
    if (e.key === "Escape") onClose();
  };

  const formatDate = (ts: number): string =>
    new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="gtp-scrollback-bar" onKeyDown={(e) => e.stopPropagation()}>
      <div className="gtp-scrollback-header">
        <span className="gtp-scrollback-title">🔍 Search History</span>
        <button
          type="button"
          className="gtp-scrollback-close"
          onClick={onClose}
          aria-label="Close history search"
        >
          ✕
        </button>
      </div>
      <div className="gtp-scrollback-input-row">
        <input
          ref={inputRef}
          className="gtp-scrollback-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKey}
          placeholder="e.g. the deploy command from last week…"
        />
        <button
          type="button"
          className="gtp-scrollback-search-btn"
          onClick={() => void handleSearch()}
          disabled={state.phase === "searching" || !query.trim()}
        >
          {state.phase === "searching" ? "…" : "Search"}
        </button>
      </div>
      {state.phase === "results" && state.results.length === 0 && (
        <div className="gtp-scrollback-empty">No matching commands found</div>
      )}
      {state.phase === "results" && state.results.length > 0 && (
        <div className="gtp-scrollback-results">
          {state.results.map((r) => (
            <div key={r.id} className="gtp-scrollback-result">
              <div className="gtp-scrollback-result-meta">
                <span className={`gtp-scrollback-status gtp-scrollback-status-${r.status}`}>
                  {r.status === "error" ? "✗" : "✓"}
                </span>
                <span className="gtp-scrollback-date">{formatDate(r.startedAt)}</span>
                {r.cwd && (
                  <span className="gtp-scrollback-cwd">
                    {r.cwd.replace(/^\/Users\/[^/]+/, "~")}
                  </span>
                )}
              </div>
              <div className="gtp-scrollback-command">{r.command}</div>
              {r.output && (
                <div className="gtp-scrollback-output">
                  {r.output.slice(0, 200)}
                  {r.output.length > 200 ? "…" : ""}
                </div>
              )}
              <div className="gtp-scrollback-actions">
                <button
                  type="button"
                  className="gtp-scrollback-inject"
                  onClick={() => {
                    onInject(r.command);
                    onClose();
                  }}
                >
                  ↵ Run
                </button>
                <button
                  type="button"
                  className="gtp-scrollback-copy"
                  onClick={() => void window.glass.writeClipboard(r.command)}
                >
                  Copy
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {state.phase === "error" && (
        <div className="gtp-scrollback-empty gtp-scrollback-error">{state.message}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TerminalFixCard — inline AI fix card shown below a failed command block (Task #65)
// ---------------------------------------------------------------------------

type FixCardPhase = "loading" | "ready" | "running" | "done" | "error";

function TerminalFixCard({
  result,
  phase,
  termId,
  onDismiss,
}: {
  result: TerminalFixResponse | null;
  phase: FixCardPhase;
  termId: string | undefined;
  onDismiss: () => void;
}): JSX.Element {
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const handleCopy = (): void => {
    if (!result?.fixedCommand) return;
    window.glass.writeClipboard(result.fixedCommand).catch(() => {});
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 1500);
  };

  const handleRun = (): void => {
    if (!result?.fixedCommand || !termId) return;
    window.glass.sendPtyInput(termId, result.fixedCommand + "\n");
    onDismiss();
  };

  if (phase === "loading") {
    return (
      <div className="gtf-card gtf-card--loading">
        <span className="gtf-spinner" />
        <span className="gtf-loading-text">Analyzing fix…</span>
      </div>
    );
  }

  if (phase === "error" || (phase === "ready" && !result?.fixedCommand)) {
    return (
      <div className="gtf-card gtf-card--error">
        <span className="gtf-error-icon">⚠</span>
        <span className="gtf-error-text">
          {result?.diagnosis ?? result?.error ?? "No fix found"}
        </span>
        <button type="button" className="gtf-btn-dismiss" onClick={onDismiss} title="Dismiss">
          ×
        </button>
      </div>
    );
  }

  return (
    <div className="gtf-card">
      <div className="gtf-card-header">
        <span className="gtf-badge">Fix ↗</span>
        {result?.diagnosis && (
          <span className="gtf-diagnosis">{result.diagnosis}</span>
        )}
        <button type="button" className="gtf-btn-dismiss" onClick={onDismiss} title="Dismiss">
          ×
        </button>
      </div>

      {result?.fixedCommand && (
        <div className="gtf-command-row">
          <code className="gtf-fixed-command">{result.fixedCommand}</code>
        </div>
      )}

      {result?.whatChanged && (
        <div className="gtf-what-changed">{result.whatChanged}</div>
      )}

      <div className="gtf-actions">
        <button
          type="button"
          className="gtf-btn gtf-btn--primary"
          onClick={handleRun}
          disabled={!termId || phase === "running" || phase === "done"}
          title={termId ? "Inject command into terminal" : "No active terminal session"}
        >
          {phase === "done" ? "✓ Sent" : "Run Fix"}
        </button>
        <button
          type="button"
          className="gtf-btn gtf-btn--secondary"
          onClick={handleCopy}
          title="Copy fixed command"
        >
          {copied ? "✓ Copied" : "Copy"}
        </button>
        <button type="button" className="gtf-btn gtf-btn--ghost" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CommandBlock — a single parsed command + output block (Tasks #36, #37)
// ---------------------------------------------------------------------------

function fmtDuration(startedAt: number, finishedAt?: number): string {
  const ms = (finishedAt ?? Date.now()) - startedAt;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

function CommandBlock({
  block,
  termId,
  autoFixOnError = true,
}: {
  block: TerminalBlock;
  termId?: string;
  autoFixOnError?: boolean;
}): JSX.Element {
  const [copied, setCopied] = useState<"cmd" | "out" | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Terminal Auto Fix state (Task #65)
  const [fixPhase, setFixPhase] = useState<FixCardPhase | "idle">("idle");
  const [fixResult, setFixResult] = useState<TerminalFixResponse | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const copyText = (text: string, which: "cmd" | "out"): void => {
    window.glass.writeClipboard(text).catch(() => {});
    setCopied(which);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(null), 1500);
  };

  const handleFix = useCallback((): void => {
    if (fixPhase !== "idle") {
      // Toggle dismiss if card already open
      setFixPhase("idle");
      setFixResult(null);
      return;
    }
    setFixPhase("loading");
    setFixResult(null);
    window.glass
      .terminalFix({
        command: block.command,
        output: block.output ?? "",
        exitCode: block.exitCode ?? 1,
      })
      .then((res) => {
        setFixResult(res);
        setFixPhase(res.error && !res.fixedCommand ? "error" : "ready");
      })
      .catch((err: unknown) => {
        setFixResult({ error: err instanceof Error ? err.message : "Fix failed" });
        setFixPhase("error");
      });
  }, [block.command, block.exitCode, block.output, fixPhase]);

  const autoFixTriggeredRef = useRef(false);

  useEffect(() => {
    autoFixTriggeredRef.current = false;
  }, [block.id]);

  useEffect(() => {
    if (!autoFixOnError || block.status !== "error" || autoFixTriggeredRef.current) return;
    const timer = window.setTimeout(() => {
      if (autoFixTriggeredRef.current) return;
      autoFixTriggeredRef.current = true;
      handleFix();
    }, 1_200);
    return () => window.clearTimeout(timer);
  }, [autoFixOnError, block.status, block.id, handleFix]);

  const handleFixDismiss = (): void => {
    setFixPhase("idle");
    setFixResult(null);
  };

  const statusClass =
    block.status === "success" ? "gtp-block--success"
    : block.status === "error" ? "gtp-block--error"
    : "gtp-block--unknown";

  const dotClass =
    block.status === "success" ? "gtp-block-dot--success"
    : block.status === "error" ? "gtp-block-dot--error"
    : block.status === "running" ? "gtp-block-dot--running"
    : "gtp-block-dot--unknown";

  const isError = block.status === "error";
  const showFixCard = isError && fixPhase !== "idle";

  return (
    <div className={`gtp-block ${statusClass}`}>
      {/* Command line */}
      <div className="gtp-block-cmd-row">
        <span className={`gtp-block-dot ${dotClass}`} />
        <span className="gtp-block-cmd" title={block.command}>{block.command || "…"}</span>
        <div className="gtp-block-cmd-actions">
          {block.finishedAt && (
            <span className="gtp-block-duration">{fmtDuration(block.startedAt, block.finishedAt)}</span>
          )}
          {block.exitCode != null && block.exitCode !== 0 && (
            <span className="gtp-block-exit">exit {block.exitCode}</span>
          )}
          {isError && (
            <button
              type="button"
              className={`gtp-block-fix-btn${fixPhase !== "idle" ? " gtp-block-fix-btn--active" : ""}`}
              onClick={handleFix}
              title="Ask Glass to fix this error"
            >
              Fix ↗
            </button>
          )}
          <button
            type="button"
            className="gtp-block-copy"
            onClick={() => copyText(block.command, "cmd")}
            title="Copy command"
          >{copied === "cmd" ? "✓" : "⌘"}</button>
          {block.output && (
            <button
              type="button"
              className="gtp-block-copy"
              onClick={() => copyText(block.output, "out")}
              title="Copy output"
            >{copied === "out" ? "✓" : "⧉"}</button>
          )}
          {block.output && (
            <button
              type="button"
              className="gtp-block-collapse"
              onClick={() => setCollapsed((v) => !v)}
              title={collapsed ? "Expand output" : "Collapse output"}
            >{collapsed ? "▶" : "▼"}</button>
          )}
        </div>
      </div>

      {/* Output */}
      {!collapsed && block.output && (
        <pre className="gtp-block-output">{block.output}</pre>
      )}

      {/* Terminal Fix Card (Task #65) */}
      {showFixCard && (
        <TerminalFixCard
          result={fixResult}
          phase={fixPhase as FixCardPhase}
          termId={termId}
          onDismiss={handleFixDismiss}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// InlineBlocksStrip — Warp-style collapsible blocks above the NL bar
// ---------------------------------------------------------------------------

function InlineBlocksStrip({
  blocks,
  termId,
}: {
  blocks: TerminalBlock[];
  termId?: string;
}): JSX.Element | null {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);

  const finished = blocks.filter((b) => b.status !== "running");
  const runningBlock = (() => {
    for (let i = blocks.length - 1; i >= 0; i -= 1) {
      if (blocks[i].status === "running") return blocks[i];
    }
    return null;
  })();
  const visibleFinished = finished.slice(runningBlock ? -3 : -4);
  const visible = runningBlock ? [...visibleFinished, runningBlock] : finished.slice(-4);

  const handleScroll = useCallback((): void => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }, []);

  useEffect(() => {
    if (pinnedRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "instant" });
    }
  }, [visible.length, runningBlock?.id, runningBlock?.command]);

  if (visible.length === 0) return null;

  return (
    <div className="gtp-inline-blocks">
      <div className="gtp-inline-blocks-scroll" ref={scrollRef} onScroll={handleScroll}>
        {visible.map((b) => (
          <CommandBlock key={b.id} block={b} termId={termId} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TerminalTabBar — multi-session PTY tabs
// ---------------------------------------------------------------------------

function TerminalTabBar({
  tabs,
  activeId,
  titles,
  onSelect,
  onClose,
  onNew,
}: {
  tabs: Array<{ id: string }>;
  activeId?: string;
  titles: ReadonlyMap<string, string | null>;
  onSelect: (termId: string) => void;
  onClose: (termId: string) => void;
  onNew: () => void;
}): JSX.Element {
  const labelFor = (id: string): string => {
    const title = titles.get(id);
    if (title) return title;
    const idx = tabs.findIndex((t) => t.id === id);
    return idx >= 0 ? `Tab ${idx + 1}` : "Shell";
  };

  return (
    <div className="glass-terminal-tabs" role="tablist" aria-label="Terminal sessions">
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={active}
            className={`glass-terminal-tab${active ? " glass-terminal-tab--active" : ""}`}
          >
            <button
              type="button"
              className="glass-terminal-tab__select"
              onClick={() => onSelect(tab.id)}
              title={labelFor(tab.id)}
            >
              <span className="glass-terminal-tab__label">{labelFor(tab.id)}</span>
            </button>
            <button
              type="button"
              className="glass-terminal-tab__close"
              onClick={() => onClose(tab.id)}
              aria-label={`Close ${labelFor(tab.id)}`}
            >
              ×
            </button>
          </div>
        );
      })}
      <GlassHoverTooltip label="New tab (⌘T)" placement="bottom">
        <button
          type="button"
          className="glass-terminal-tab glass-terminal-tab--new"
          onClick={onNew}
          aria-label="New terminal tab"
        >
          +
        </button>
      </GlassHoverTooltip>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

type SuggestState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "ready"; suggestions: TerminalSuggestion[] }
  | { phase: "error" };

// ── SVG icon components for the terminal header toolbar ───────────────────

function IconMic(): JSX.Element {
  return (
    <svg width="10" height="14" viewBox="0 0 10 14" fill="none" aria-hidden="true">
      <rect x="2.5" y="1" width="5" height="7.5" rx="2.5" stroke="currentColor" strokeWidth="1.4" fill="none"/>
      <path d="M1 8c0 2.2 1.8 4 4 4s4-1.8 4-4" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round"/>
      <line x1="5" y1="12" x2="5" y2="13.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}

function IconX(): JSX.Element {
  return (
    <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden="true">
      <line x1="1" y1="1" x2="8" y2="8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      <line x1="8" y1="1" x2="1" y2="8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  );
}
function IconChevronDown(): JSX.Element {
  return (
    <svg width="12" height="8" viewBox="0 0 12 8" fill="none" aria-hidden="true">
      <path d="M1 1.5L6 6.5L11 1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function IconChevronUp(): JSX.Element {
  return (
    <svg width="12" height="8" viewBox="0 0 12 8" fill="none" aria-hidden="true" style={{ transform: "rotate(180deg)" }}>
      <path d="M1 1.5L6 6.5L11 1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ── Welcome state — shown when the terminal is fresh (no commands yet) ─────

type TerminalWelcomeAction = "nl" | "voice" | "explain" | "vision" | "scrollback";

const WELCOME_SHORTCUTS: ReadonlyArray<{
  id: TerminalWelcomeAction;
  keys: readonly string[];
  label: string;
}> = [
  { id: "nl", keys: ["⌃", "Space"], label: "Natural language" },
  { id: "voice", keys: ["⌘", "⇧", "V"], label: "Voice command" },
  { id: "explain", keys: ["⌘", "E"], label: "Explain error" },
  { id: "vision", keys: ["⌘", "⇧", "E"], label: "Screen analysis" },
  { id: "scrollback", keys: ["⌘", "⇧", "F"], label: "Search history" },
];

function TerminalWelcome({
  visible,
  onAction,
}: {
  visible: boolean;
  onAction: (action: TerminalWelcomeAction) => void;
}): JSX.Element {
  return (
    <div className={`glass-terminal-welcome${visible ? " glass-terminal-welcome--visible" : ""}`}>
      <div className="gtw-inner">
        <div className="gtw-brand">
          <div className="gtw-swarm-wrap">
            <TerminalWelcomeSwarm />
          </div>
          <div className="gtw-brand-text">
            <span className="gtw-logo-text">IIVO Glass</span>
            <p className="gtw-tagline">AI-powered terminal</p>
          </div>
        </div>
        <p className="gtw-section-label">Shortcuts</p>
        <div className="gtw-features">
          {WELCOME_SHORTCUTS.map(({ id, keys, label }) => (
            <button
              key={id}
              type="button"
              className="gtw-row"
              onClick={() => onAction(id)}
              title={`${label} — ${keys.join(" ")}`}
            >
              <span className="gtw-label">{label}</span>
              <div className="gtw-keys" aria-hidden="true">
                {keys.map((k) => (
                  <kbd key={k} className="gtw-kbd">
                    {k}
                  </kbd>
                ))}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export interface GlassTerminalPanelProps {
  variant?: "window" | "embedded";
  /** IDE dock strip — viewport hidden, tab bar + NL shell bar stay visible. */
  ideCollapsed?: boolean;
  onIdeToggleCollapse?: () => void;
}

export function GlassTerminalPanel({
  variant = "window",
  ideCollapsed = false,
  onIdeToggleCollapse,
}: GlassTerminalPanelProps = {}): JSX.Element {
  const embedded = variant === "embedded";
  const state = useGlassState();
  const reportIdeTerminalInteraction = useCallback((): void => {
    if (!embedded) return;
    send({ type: "glass-ide-terminal-interaction" });
  }, [embedded]);
  const [panelSize, setPanelSize] = useState<GlassTerminalSize>(loadTerminalSize);
  const [showFind, setShowFind] = useState(false);
  // Voice → Shell (Task #44). stopSignal is bumped on a repeat ⌘⇧V press.
  const [showVoiceShell, setShowVoiceShell] = useState(false);
  const [voiceStopSignal, setVoiceStopSignal] = useState(0);
  const nlBarRef = useRef<NLCommandBarHandle>(null);
  // True only after the terminal init effect has run — gates find-bar interactions
  const [terminalReady, setTerminalReady] = useState(false);
  const [explainState, setExplainState] = useState<ExplainState>({ phase: "idle" });
  // Task #45 — Screen-Aware Terminal Assistant (⌘⇧E). Reuses ExplainState.
  const [visionState, setVisionState] = useState<ExplainState>({ phase: "idle" });
  // Task #42 — tab titles keyed by PTY session id.
  const [tabTitles, setTabTitles] = useState<Map<string, string | null>>(() => new Map());
  // Task #46 — cwd per PTY tab (OSC 7), used for scrollback + AI suggestions.
  const [cwdByTab, setCwdByTab] = useState<Map<string, string>>(() => new Map());
  const [suggestState, setSuggestState] = useState<SuggestState>({ phase: "idle" });
  const suggestDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Task #47 — Persistent Smart Scrollback search bar (⌘⇧F).
  const [showScrollback, setShowScrollback] = useState(false);
  // Track which finished block ids have already been persisted this session so
  // we never double-write when the blocks array re-renders. Reset on session switch.
  const writtenBlockIdsRef = useRef<Map<string, Set<string>>>(new Map());
  const { blocksFor, feedChunk, clearFor } = useTerminalBlockSessions();
  const termId = state.glassDockTerminalId;
  const cwd = termId ? (cwdByTab.get(termId) ?? "") : "";
  const blocks = blocksFor(termId);
  const tabs = state.glassDockTerminalTabs ?? (termId ? [{ id: termId }] : []);

  const clearTerminalHistory = useCallback((): void => {
    if (termId) clearFor(termId);
    window.glass.terminalContextPush([]);
  }, [clearFor, termId]);

  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const explainGenRef = useRef(0);
  const visionGenRef = useRef(0);
  const suggestGenRef = useRef(0);
  const scrollbackWriteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Guards against StrictMode double-attach completing out of order. */
  const attachGenRef = useRef(0);
  /** Panel hidden with session still alive — re-open only rewires listeners. */
  const detachedTermRef = useRef<string | null>(null);
  /** Skip reveal animation wait when switching tabs on an already-visible panel. */
  const terminalRevealReadyRef = useRef(false);
  /** Prevents duplicate palette actions when pending action stays in state. */
  const consumedActionNonceRef = useRef(0);
  /** Skip duplicate post-reveal resize when attach already fit the PTY. */
  const attachFitTermRef = useRef<string | null>(null);

  const startResize = useTerminalPanelResize(panelSize, setPanelSize);

  // Sync panel size → Electron window (floating terminal only)
  useEffect(() => {
    if (embedded) return;
    window.glass.resizeTerminal(panelSize.width, panelSize.height);
  }, [panelSize.width, panelSize.height, embedded]);

  // ── Terminal initialisation ────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    if (termRef.current) return;

    const term = new Terminal({
      fontFamily: '"SF Mono", "Fira Code", "JetBrains Mono", "Menlo", monospace',
      fontSize: 13,
      lineHeight: 1.45,
      letterSpacing: 0,
      cursorBlink: true,
      cursorStyle: "block",
      // Task #38 — 50k scrollback
      scrollback: 50_000,
      fastScrollModifier: "alt",
      fastScrollSensitivity: 5,
      theme: GLASS_TERMINAL_THEME,
      allowTransparency: false,
      macOptionIsMeta: true,
    });

    // Task #34 — load all addons
    const fitAddon = new FitAddon();
    const canvasAddon = new CanvasAddon();
    const searchAddon = new SearchAddon();
    const webLinksAddon = new WebLinksAddon();
    const ligaturesAddon = new LigaturesAddon();
    const imageAddon = new ImageAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(searchAddon);
    term.loadAddon(webLinksAddon);
    term.loadAddon(imageAddon);

    term.open(containerRef.current);

    // Canvas addon must be loaded after open(); fall back to default renderer if WebGL fails
    try {
      term.loadAddon(canvasAddon);
    } catch {
      /* WebGL unavailable — xterm default renderer */
    }
    // Ligatures addon must be loaded after open() in an Electron/Node env
    try {
      term.loadAddon(ligaturesAddon);
    } catch {
      /* optional — missing font ligatures */
    }

    termRef.current = term;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;
    // Signal that addons are wired — enables find bar interactions
    setTerminalReady(true);

    const fitWhenReady = (): void => {
      const container = containerRef.current;
      if (!container || !terminalContainerReady(container)) return;
      try { fitAddon.fit(); } catch { /* ignore until panel has real dimensions */ }
    };

    fitWhenReady();
    const fitTimer = window.setTimeout(fitWhenReady, 120);

    return () => { window.clearTimeout(fitTimer); };
  }, []);

  // ── Dispose on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      setTerminalReady(false);
      termRef.current?.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
    };
  }, []);

  // ── Push terminal blocks to main process for AI context (Task #41) ─────────
  // Debounced by 400ms; only finished blocks are sent, with output capped.
  useEffect(() => {
    if (blocks.length === 0) return;
    const timer = window.setTimeout(() => {
      // Type predicate narrows status so no unsafe cast is needed downstream.
      const isFinished = (
        b: TerminalBlock,
      ): b is TerminalBlock & { status: "success" | "error" | "unknown" } =>
        b.status !== "running";

      const contextBlocks = blocks
        .filter(isFinished)
        .slice(-15)
        .map((b) => ({
          command: b.command,
          output: b.output.slice(0, 800), // cap output size
          exitCode: b.exitCode,
          status: b.status,   // TypeScript knows this is "success"|"error"|"unknown"
          durationMs: b.finishedAt != null ? b.finishedAt - b.startedAt : undefined,
        }));
      if (contextBlocks.length === 0) return;
      window.glass.terminalContextPush(contextBlocks);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [blocks]);

  // ── Persist finished blocks to encrypted scrollback (Task #47) ─────────────
  // Debounced 300ms so OSC 7 cwd can arrive before write. Deduped by block id.
  useEffect(() => {
    if (!termId) return;

    const writtenForSession = writtenBlockIdsRef.current.get(termId) ?? new Set<string>();
    if (!writtenBlockIdsRef.current.has(termId)) {
      writtenBlockIdsRef.current.set(termId, writtenForSession);
    }
    const newFinished = blocks.filter(
      (b) =>
        b.status !== "running" &&
        b.command.trim() &&
        !writtenForSession.has(b.id),
    );
    if (newFinished.length === 0) return;

    if (scrollbackWriteTimerRef.current) clearTimeout(scrollbackWriteTimerRef.current);
    scrollbackWriteTimerRef.current = setTimeout(() => {
      scrollbackWriteTimerRef.current = null;
      const toWrite: ScrollbackWriteBlock[] = newFinished.map((b) => ({
        sessionId: termId,
        command: b.command,
        output: (b.output ?? "").slice(0, 2000),
        exitCode: b.exitCode,
        status: b.status as "success" | "error" | "unknown",
        cwd: cwd || undefined,
        startedAt: b.startedAt ?? Date.now(),
        durationMs: b.finishedAt != null ? b.finishedAt - b.startedAt : undefined,
      }));

      newFinished.forEach((b) => writtenForSession.add(b.id));
      window.glass.scrollbackWrite(toWrite);
    }, 300);

    return () => {
      if (scrollbackWriteTimerRef.current) {
        clearTimeout(scrollbackWriteTimerRef.current);
        scrollbackWriteTimerRef.current = null;
      }
    };
  }, [blocks, termId, cwd]);

  // ── AI Command Suggestions trigger (Task #46) ─────────────────────────────
  // When the most recent block finishes, debounce 800ms then ask Claude for 3
  // next-command suggestions. Silent failure — if anything goes wrong we just
  // stay idle. NOTE: cwd & suggestState are intentionally read but NOT in deps
  // (they'd re-trigger / loop); blocks is the only trigger.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    // Find the most recently FINISHED block.
    const lastFinished = [...blocks]
      .reverse()
      .find(
        (b) => b.status === "success" || b.status === "error" || b.status === "unknown",
      );
    if (!lastFinished || !lastFinished.command.trim()) return;

    // Debounce — wait 800ms after the block finishes before firing.
    if (suggestDebounceRef.current) clearTimeout(suggestDebounceRef.current);
    suggestDebounceRef.current = setTimeout(async () => {
      const gen = ++suggestGenRef.current;
      setSuggestState({ phase: "loading" });
      const recentCmds = blocks
        .filter((b) => b.status !== "running" && b.command.trim())
        .slice(-5)
        .map((b) => b.command);
      try {
        const result = await window.glass.terminalSuggest({
          lastCommand: lastFinished.command,
          lastStatus: lastFinished.status as "success" | "error" | "unknown",
          cwd: cwd || "~",
          recentCommands: recentCmds,
        });
        if (gen !== suggestGenRef.current) return;
        if (result.suggestions && result.suggestions.length > 0) {
          setSuggestState({ phase: "ready", suggestions: result.suggestions });
        } else {
          setSuggestState({ phase: "idle" });
        }
      } catch {
        if (gen !== suggestGenRef.current) return;
        setSuggestState({ phase: "idle" });
      }
    }, 800);

    return () => {
      if (suggestDebounceRef.current) clearTimeout(suggestDebounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks]);

  // ── Dismiss suggestions when a new command starts running (Task #46) ───────
  useEffect(() => {
    const hasRunning = blocks.some((b) => b.status === "running");
    if (hasRunning) {
      suggestGenRef.current += 1;
      setSuggestState((prev) => (prev.phase === "idle" ? prev : { phase: "idle" }));
    }
  }, [blocks]);

  // ── Clear suggestion debounce timer on unmount (Task #46) ──────────────────
  useEffect(() => {
    return () => {
      if (suggestDebounceRef.current) clearTimeout(suggestDebounceRef.current);
      suggestDebounceRef.current = null;
      if (scrollbackWriteTimerRef.current) clearTimeout(scrollbackWriteTimerRef.current);
      scrollbackWriteTimerRef.current = null;
    };
  }, []);

  // ── Reset suggestions on session switch (Task #46) ───────────────────────
  useEffect(() => {
    setSuggestState({ phase: "idle" });
    suggestGenRef.current += 1;
    if (suggestDebounceRef.current) {
      clearTimeout(suggestDebounceRef.current);
      suggestDebounceRef.current = null;
    }
  }, [termId]);

  // Drop cwd entries for closed tabs.
  useEffect(() => {
    const live = new Set(tabs.map((t) => t.id));
    setCwdByTab((prev) => {
      let stale = false;
      for (const id of prev.keys()) {
        if (!live.has(id)) { stale = true; break; }
      }
      if (!stale) return prev;
      const next = new Map<string, string>();
      for (const [id, p] of prev) {
        if (live.has(id)) next.set(id, p);
      }
      return next;
    });
  }, [tabs]);

  // Inject a suggested command into the PTY. Unlike NLCommandBar (which appends
  // "\n" to auto-run), suggestions are speculative/auto-shown, so we inject the
  // command WITHOUT a trailing newline — the user reviews it and presses Enter.
  const runSuggestion = useCallback(
    (command: string): void => {
      const termId = state.glassDockTerminalId;
      if (!termId) return;
      window.glass.sendPtyInput(termId, command);
    },
    [state.glassDockTerminalId],
  );

  // ── Explain Last Error (Task #39) ─────────────────────────────────────────

  const triggerExplain = useCallback((): void => {
    const lastErrorBlock = [...blocks].reverse().find((b) => b.status === "error");

    let command = "";
    let output = "";
    let exitCode: number | undefined;

    if (lastErrorBlock) {
      command = lastErrorBlock.command;
      output = lastErrorBlock.output;
      exitCode = lastErrorBlock.exitCode;
    } else {
      // Fallback: scrape last ~100 lines from the xterm buffer when no parsed error block
      const term = termRef.current;
      if (term) {
        const buf = term.buffer.active;
        const lineCount = Math.min(buf.length, 100);
        const start = buf.length - lineCount;
        const lines: string[] = [];
        for (let i = start; i < buf.length; i++) {
          const line = buf.getLine(i);
          if (line) lines.push(line.translateToString(true));
        }
        output = lines.join("\n").trimEnd();
      }
      if (!output) {
        setExplainState({ phase: "error", message: "No failed command to explain." });
        return;
      }
    }

    if (!command && !output) return;

    const gen = ++explainGenRef.current;
    setExplainState({ phase: "loading" });

    window.glass.terminalExplain({ command, output, exitCode })
      .then((result) => {
        if (gen !== explainGenRef.current) return;
        setExplainState({ phase: "done", result, command });
      })
      .catch((err: unknown) => {
        if (gen !== explainGenRef.current) return;
        const message = err instanceof Error ? err.message : "Unknown error";
        setExplainState({ phase: "error", message });
      });
  }, [blocks]);

  const handleDismissExplain = useCallback((): void => {
    explainGenRef.current += 1;
    setExplainState({ phase: "idle" });
  }, []);

  const handleCopyExplain = useCallback((text: string): void => {
    window.glass.writeClipboard(text).catch(() => {});
  }, []);

  // ── Screen-Aware Terminal Assistant (Task #45) ────────────────────────────
  // ⌘⇧E: capture the full screen (in main) + recent terminal context, then run
  // Claude Vision and show the result in a top-anchored overlay.

  const triggerVisionAnalyze = useCallback(async (): Promise<void> => {
    if (visionState.phase === "loading") return;

    const gen = ++visionGenRef.current;
    setVisionState({ phase: "loading" });

    // Build a readable summary of the recent finished command blocks.
    const ctx = [...blocks]
      .filter((b) => b.status !== "running")
      .slice(-15)
      .map((b) => {
        const status =
          b.status === "success" ? "✓" :
          b.status === "error" ? `✗${b.exitCode != null ? ` (exit ${b.exitCode})` : ""}` :
          "○";
        const out = b.output ? `\n  └ ${b.output.slice(0, 400)}${b.output.length > 400 ? "…" : ""}` : "";
        return `$ ${b.command} ${status}${out}`;
      })
      .join("\n");

    const lastError = [...blocks].reverse().find((b) => b.status === "error");

    try {
      const result = await window.glass.terminalVisionAnalyze({
        terminalContext: ctx,
        lastCommand: lastError?.command,
        lastOutput: lastError?.output?.slice(0, 2000),
      });
      if (gen !== visionGenRef.current) return;
      if (result.error) {
        setVisionState({ phase: "error", message: result.error });
      } else {
        setVisionState({ phase: "done", content: result.analysis ?? "" });
      }
    } catch (err) {
      if (gen !== visionGenRef.current) return;
      setVisionState({ phase: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }, [visionState.phase, blocks]);

  const handleDismissVision = useCallback((): void => {
    visionGenRef.current += 1;
    setVisionState({ phase: "idle" });
  }, []);

  const handleCopyVision = useCallback((text: string): void => {
    window.glass.writeClipboard(text).catch(() => {});
  }, []);

  const focusTerminalInput = useCallback((): void => {
    containerRef.current?.querySelector<HTMLElement>(".xterm-helper-textarea")?.focus();
  }, []);

  const startVoiceShell = useCallback((): void => {
    setVoiceStopSignal(0);
    setShowVoiceShell(true);
  }, []);

  const stopVoiceShell = useCallback((): void => {
    setVoiceStopSignal((n) => n + 1);
  }, []);

  const closeVoiceShell = useCallback((): void => {
    setShowVoiceShell(false);
    setVoiceStopSignal(0);
  }, []);

  const handleWelcomeAction = useCallback(
    (action: TerminalWelcomeAction): void => {
      focusTerminalInput();
      switch (action) {
        case "nl":
          nlBarRef.current?.focusInput();
          break;
        case "voice":
          startVoiceShell();
          break;
        case "explain":
          triggerExplain();
          break;
        case "vision":
          void triggerVisionAnalyze();
          break;
        case "scrollback":
          setShowScrollback(true);
          break;
      }
    },
    [focusTerminalInput, triggerExplain, triggerVisionAnalyze, startVoiceShell],
  );

  const runTerminalPanelAction = useCallback(
    (action: GlassTerminalPanelAction): void => {
      switch (action) {
        case "explain":
          triggerExplain();
          break;
        case "vision":
          void triggerVisionAnalyze();
          break;
        case "find":
          if (searchAddonRef.current) setShowFind(true);
          break;
        case "scrollback":
          setShowScrollback(true);
          break;
        case "voice":
          startVoiceShell();
          break;
        case "nl-focus":
          nlBarRef.current?.focusInput();
          break;
        case "clear":
          termRef.current?.clear();
          clearTerminalHistory();
          break;
      }
    },
    [triggerExplain, triggerVisionAnalyze, startVoiceShell, clearTerminalHistory],
  );

  useEffect(() => {
    const pending = state.glassTerminalPendingAction;
    if (!pending) return;
    if (consumedActionNonceRef.current === pending.nonce) return;
    consumedActionNonceRef.current = pending.nonce;
    runTerminalPanelAction(pending.action);
    send({ type: "glass-terminal-pending-action-ack" });
  }, [state.glassTerminalPendingAction, runTerminalPanelAction]);

  const handleSwitchTab = useCallback((id: string): void => {
    send({ type: "glass-terminal-switch-tab", termId: id });
  }, []);

  const handleCloseTab = useCallback((id: string): void => {
    send({ type: "glass-terminal-close-tab", termId: id });
  }, []);

  const handleNewTab = useCallback((): void => {
    send({ type: "glass-terminal-new-tab" });
  }, []);

  // ── Global hotkey handler ─────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const term = termRef.current;

      // Task #46: dismiss AI command suggestions on any keypress in terminal
      // (ignore bare modifier-only chords so ⌘/⌃ shortcuts can still trigger).
      if (!e.metaKey && !e.ctrlKey) {
        setSuggestState((prev) => {
          if (prev.phase !== "idle") suggestGenRef.current += 1;
          return prev.phase === "idle" ? prev : { phase: "idle" };
        });
      }

      // Escape — dismiss explain + vision overlays (global, no focus check needed)
      if (e.key === "Escape") {
        setExplainState((prev) => {
          if (prev.phase !== "idle") explainGenRef.current += 1;
          return prev.phase !== "idle" ? { phase: "idle" } : prev;
        });
        setVisionState((prev) => {
          if (prev.phase !== "idle") visionGenRef.current += 1;
          return prev.phase !== "idle" ? { phase: "idle" } : prev;
        });
        // Don't return — allow other handlers (e.g. find bar close) to also fire
      }

      if (!term) return;

      const inTerminal =
        containerRef.current?.contains(document.activeElement) ||
        containerRef.current?.contains(e.target as Node);

      // Cmd+K — clear terminal + block history (Task #35)
      if ((e.metaKey || e.ctrlKey) && e.key === "k" && inTerminal) {
        e.preventDefault();
        term.clear();
        clearTerminalHistory();
        return;
      }

      // ⌘+Shift+F — Persistent Smart Scrollback search (Task #47).
      // Check before plain ⌘F. With Shift held, e.key is "F" (uppercase).
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "F" && inTerminal) {
        e.preventDefault();
        setShowScrollback((v) => !v);
        return;
      }

      // Cmd+F — toggle find bar (Task #35) — only when addon is ready
      if ((e.metaKey || e.ctrlKey) && e.key === "f" && inTerminal) {
        e.preventDefault();
        if (searchAddonRef.current) setShowFind((v) => !v);
        return;
      }

      // ⌘+Shift+E — Screen-Aware Terminal Assistant / Claude Vision (Task #45).
      // Check before plain ⌘E. With Shift held, e.key is "E" (uppercase).
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "E" && inTerminal) {
        e.preventDefault();
        void triggerVisionAnalyze();
        return;
      }

      // Cmd+E — explain last error (Task #39)
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === "e" && inTerminal) {
        e.preventDefault();
        triggerExplain();
        return;
      }

      // Ctrl+Space — focus natural language bar (Task #40).
      // Ctrl (not Cmd) avoids the macOS Spotlight ⌘Space conflict.
      if (e.ctrlKey && e.key === " " && inTerminal) {
        e.preventDefault();
        nlBarRef.current?.focusInput();
        return;
      }

      // Cmd+T — new terminal tab
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === "t" && inTerminal) {
        e.preventDefault();
        handleNewTab();
        return;
      }

      // Cmd+W — close active tab
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === "w" && inTerminal) {
        e.preventDefault();
        if (termId) handleCloseTab(termId);
        return;
      }

      // ⌘+Shift+V — voice to shell (Task #44). Note: e.key === "V" (uppercase)
      // when Shift is held. A repeat press while open signals stop / dismiss.
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "V" && inTerminal) {
        e.preventDefault();
        if (showVoiceShell) stopVoiceShell();
        else startVoiceShell();
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [triggerExplain, triggerVisionAnalyze, clearTerminalHistory, showVoiceShell, startVoiceShell, stopVoiceShell, handleNewTab, handleCloseTab, termId]);

  // Parse command blocks + cwd for every PTY tab — including background sessions.
  useEffect(() => {
    return window.glass.onPtyData((id, data) => {
      feedChunk(id, data);
      const path = extractOsc7Cwd(data);
      if (path) {
        setCwdByTab((prev) => {
          if (prev.get(id) === path) return prev;
          const next = new Map(prev);
          next.set(id, path);
          return next;
        });
      }
    });
  }, [feedChunk]);

  // Reset reveal timing when the panel is fully hidden.
  useEffect(() => {
    if (!state.glassDockTerminalOpen) {
      terminalRevealReadyRef.current = false;
    }
  }, [state.glassDockTerminalOpen]);

  // ── Attach / detach PTY session ───────────────────────────────────────────
  useEffect(() => {
    const termId = state.glassDockTerminalId;
    const open = state.glassDockTerminalOpen ?? false;
    const term = termRef.current;
    if (!termId) {
      detachedTermRef.current = null;
      attachFitTermRef.current = null;
      return;
    }
    if (!open || !term) return;

    const attachGen = ++attachGenRef.current;
    let active = true;

    const wirePtyListeners = (): void => {
      const unsubData = window.glass.onPtyData((id, data) => {
        if (id === termId && active) {
          // Task #42: extract OSC 0/2 title sequences before feeding xterm.
          OSC_TITLE_RE.lastIndex = 0;
          let oscMatch: RegExpExecArray | null;
          while ((oscMatch = OSC_TITLE_RE.exec(data)) !== null) {
            const title = oscMatch[1].trim();
            setTabTitles((prev) => {
              const next = new Map(prev);
              next.set(termId, title || null);
              return next;
            });
          }
          term.write(data);
        }
      });

      const dataDispose = term.onData((data: string) => {
        reportIdeTerminalInteraction();
        window.glass.sendPtyInput(termId, data);
      });

      cleanupRef.current = () => {
        unsubData();
        dataDispose.dispose();
      };
    };

    const attach = async (): Promise<void> => {
      // Panel was hidden — xterm still has content; only restore live listeners.
      if (detachedTermRef.current === termId) {
        detachedTermRef.current = null;
        if (!active || attachGen !== attachGenRef.current) return;
        wirePtyListeners();
        terminalRevealReadyRef.current = true;
        return;
      }

      // Mark replay offset before any resize so we skip the pre-size shell prompt.
      const fromByte = await window.glass.replayPtyByteLength(termId);
      if (!active || attachGen !== attachGenRef.current) return;

      const skipRevealWait = terminalRevealReadyRef.current || embedded;
      if (!skipRevealWait) {
        // Wait for reveal animation + real container dimensions before the one resize.
        await sleep(GLASS_TERMINAL_REVEAL_MS + 24);
        if (!active || attachGen !== attachGenRef.current) return;
      }

      const fit = fitAddonRef.current;
      const container = containerRef.current;
      if (fit && container) {
        try {
          fitTerminalToPty(termId, term, fit, container);
          attachFitTermRef.current = termId;
        } catch { /* ignore */ }
      }

      await sleep(PTY_ATTACH_SETTLE_MS);
      if (!active || attachGen !== attachGenRef.current) return;

      const replay = await window.glass.replayPtySession(termId, fromByte);
      if (!active || attachGen !== attachGenRef.current) return;

      term.clear();
      if (replay) term.write(replay);
      wirePtyListeners();
      terminalRevealReadyRef.current = true;
    };

    void attach();

    return () => {
      active = false;
      cleanupRef.current?.();
      cleanupRef.current = null;
      if (termId) detachedTermRef.current = termId;
    };
  }, [termId, state.glassDockTerminalOpen, embedded, reportIdeTerminalInteraction]);

  // ── Task #42: poll-based title updates for all tabs ───────────────────────
  useEffect(() => {
    const active = termId;
    if (!active) return;
    const unsub = window.glass.onTerminalTitleUpdate((id, title) => {
      setTabTitles((prev) => {
        const next = new Map(prev);
        next.set(id, title ?? null);
        return next;
      });
    });
    return unsub;
  }, [termId]);

  // ── Re-fit on panel open ──────────────────────────────────────────────────
  useEffect(() => {
    const fit = fitAddonRef.current;
    const term = termRef.current;
    const termId = state.glassDockTerminalId;
    if (!fit || !term || !termId) return;

    const t = setTimeout(() => {
      if (attachFitTermRef.current === termId) {
        attachFitTermRef.current = null;
        return;
      }
      const container = containerRef.current;
      if (!container || !terminalContainerReady(container)) return;
      try {
        fitTerminalToPty(termId, term, fit, container);
      } catch { /* ignore */ }
    }, GLASS_TERMINAL_REVEAL_MS + 24);
    return () => clearTimeout(t);
  }, [state.glassDockTerminalOpen, state.glassDockTerminalId]);

  // ── Re-fit on panel resize ────────────────────────────────────────────────
  useEffect(() => {
    const fit = fitAddonRef.current;
    const term = termRef.current;
    const termId = state.glassDockTerminalId;
    if (!fit || !term) return;

    const t = window.setTimeout(() => {
      const container = containerRef.current;
      if (!container || !terminalContainerReady(container)) return;
      try {
        fit.fit();
        if (termId) window.glass.sendPtyResize(termId, term.cols, term.rows);
      } catch { /* ignore */ }
    }, 0);
    return () => window.clearTimeout(t);
  }, [panelSize.width, panelSize.height, state.glassDockTerminalId, embedded, ideCollapsed]);

  // ── ResizeObserver for container dimension changes ────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const fit = fitAddonRef.current;
      const term = termRef.current;
      const termId = state.glassDockTerminalId;
      if (!fit || !term || !termId || !terminalContainerReady(el)) return;
      try {
        fit.fit();
        window.glass.sendPtyResize(termId, term.cols, term.rows);
      } catch { /* ignore */ }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [state.glassDockTerminalId]);

  const handleCloseTabActive = useCallback((): void => {
    if (termId) send({ type: "glass-terminal-close-tab", termId });
  }, [termId]);

  const handleClose = useCallback((): void => {
    send({ type: "glass-terminal-close" });
  }, []);

  const handleCloseFind = useCallback((): void => {
    setShowFind(false);
    // Return focus to terminal
    containerRef.current?.querySelector<HTMLElement>(".xterm-helper-textarea")?.focus();
  }, []);

  const terminalActive = !!state.glassDockTerminalId;
  const sessionEnded = state.glassDockTerminalOpen && !state.glassDockTerminalId;

  return (
    <div
      className={[
        "glass-terminal-panel",
        embedded ? "glass-terminal-panel--embedded" : "",
        embedded && ideCollapsed ? "glass-terminal-panel--ide-collapsed" : "",
      ].filter(Boolean).join(" ")}
      data-testid="glass-terminal-panel"
      style={embedded ? { width: "100%", height: "100%" } : { width: panelSize.width, height: panelSize.height }}
      onPointerDownCapture={embedded ? () => {
        armIdeOverlayPointer();
        reportIdeTerminalInteraction();
      } : undefined}
      onPointerEnter={embedded ? armIdeOverlayPointer : undefined}
    >
      {/* Header — tabs + minimal chrome (actions live in ⌘⇧P) */}
      <div className="glass-terminal-header">
        <span
          className={`glass-terminal-header__status${terminalActive ? " glass-terminal-header__status--live" : ""}`}
          aria-hidden="true"
          title={terminalActive ? "Terminal session active" : "Session ended"}
        />
        {tabs.length > 0 ? (
          <TerminalTabBar
            tabs={tabs}
            activeId={termId}
            titles={tabTitles}
            onSelect={handleSwitchTab}
            onClose={handleCloseTab}
            onNew={handleNewTab}
          />
        ) : (
          <span className="glass-terminal-header__title">
            {terminalActive ? "Glass Terminal" : "Terminal — session ended"}
          </span>
        )}
        <div className="glass-terminal-header__controls">
          {terminalActive && (
            <GlassHoverTooltip label="Close tab (⌘W)" placement="top">
              <button
                type="button"
                className="glass-terminal-ctrl-btn glass-terminal-ctrl-btn--kill"
                onClick={handleCloseTabActive}
              >
                <IconX />
                <span>Close</span>
              </button>
            </GlassHoverTooltip>
          )}
          {!embedded ? (
            <GlassHoverTooltip label="Hide terminal panel" placement="top">
              <button
                type="button"
                className="glass-terminal-ctrl-btn glass-terminal-ctrl-btn--hide"
                onClick={handleClose}
              >
                <IconChevronDown />
                <span>Hide</span>
              </button>
            </GlassHoverTooltip>
          ) : onIdeToggleCollapse ? (
            <GlassHoverTooltip
              label={ideCollapsed ? "Expand terminal panel" : "Collapse terminal panel"}
              placement="top"
            >
              <button
                type="button"
                className="glass-terminal-ctrl-btn glass-terminal-ctrl-btn--hide"
                onClick={onIdeToggleCollapse}
                onPointerDown={armIdeOverlayPointer}
                aria-label={ideCollapsed ? "Expand terminal" : "Collapse terminal"}
              >
                {ideCollapsed ? <IconChevronUp /> : <IconChevronDown />}
                <span>{ideCollapsed ? "Expand" : "Collapse"}</span>
              </button>
            </GlassHoverTooltip>
          ) : null}
        </div>
      </div>

      {/* Find bar (Task #35) */}
      {showFind && searchAddonRef.current && (
        <FindBar
          searchAddon={searchAddonRef.current}
          onClose={handleCloseFind}
        />
      )}

      {/* Voice → shell bar (Task #44) — removed from header; lives in bottom NL bar */}

      {/* Persistent Smart Scrollback search bar (Task #47) */}
      {showScrollback && (
        <ScrollbackSearchBar
          onInject={runSuggestion}
          onClose={() => setShowScrollback(false)}
        />
      )}

      {/* Explain Last Error overlay (Task #39) */}
      <ExplainOverlay
        state={explainState}
        onDismiss={handleDismissExplain}
        onCopy={handleCopyExplain}
      />

      {/* Screen-Aware Terminal Assistant overlay (Task #45) */}
      <VisionOverlay
        state={visionState}
        onDismiss={handleDismissVision}
        onCopy={handleCopyVision}
      />

      {/* Viewport — full width; blocks render inline above NL bar */}
      <div className="gtp-content-row">
        <div
          className="glass-terminal-viewport"
          ref={containerRef}
          data-testid="glass-terminal-viewport"
          onPointerDown={embedded ? () => {
            armIdeOverlayPointer();
            reportIdeTerminalInteraction();
          } : undefined}
          onWheel={embedded ? reportIdeTerminalInteraction : undefined}
        />
        <TerminalWelcome
          visible={blocks.length === 0 && terminalReady && terminalActive}
          onAction={handleWelcomeAction}
        />
      </div>

      <InlineBlocksStrip blocks={blocks} termId={termId} />

      {/* Natural language → shell command bar — always pinned at bottom (Task #40) */}
      {terminalActive && (
        <NLCommandBar
          ref={nlBarRef}
          blocks={blocks}
          termId={termId}
          voiceActive={showVoiceShell}
          voiceStopSignal={voiceStopSignal}
          onVoiceStart={startVoiceShell}
          onVoiceStop={stopVoiceShell}
          onVoiceClose={closeVoiceShell}
          embedded={embedded}
        />
      )}

      {/* AI Command Suggestions bar (Task #46) */}
      {(suggestState.phase === "loading" || suggestState.phase === "ready") && (
        <SuggestionsBar
          suggestions={suggestState.phase === "ready" ? suggestState.suggestions : []}
          loading={suggestState.phase === "loading"}
          onSelect={runSuggestion}
          onDismiss={() => {
            suggestGenRef.current += 1;
            setSuggestState({ phase: "idle" });
          }}
        />
      )}

      {sessionEnded && (
        <div className="glass-terminal-ended">
          <span>Session ended</span>
          <button
            type="button"
            className="glass-terminal-ctrl-btn"
            onClick={() => send({ type: "glass-terminal-open" })}
          >
            New session
          </button>
        </div>
      )}

      {!embedded ? (
        <>
          <div
            className="glass-terminal-resize glass-terminal-resize--east"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize terminal width"
            onPointerDown={startResize("e")}
          />
          <div
            className="glass-terminal-resize glass-terminal-resize--south"
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize terminal height"
            onPointerDown={startResize("s")}
          />
          <div
            className="glass-terminal-resize glass-terminal-resize--south-east"
            role="presentation"
            aria-hidden="true"
            onPointerDown={startResize("se")}
          />
        </>
      ) : null}
    </div>
  );
}
