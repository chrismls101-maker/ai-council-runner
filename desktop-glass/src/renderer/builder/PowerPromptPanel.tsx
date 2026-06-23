import { useCallback, useEffect, useRef, useState } from "react";
import type { PromptMode, PromptTarget } from "../../shared/ipc.ts";
import {
  createPrompt,
  loadPrompts,
  savePrompts,
} from "./promptStorage.ts";
import "./PowerPromptPanel.css";

// ---------------------------------------------------------------------------
// Config maps
// ---------------------------------------------------------------------------

interface TargetOption {
  value: PromptTarget;
  label: string;
  icon: string;
}

interface ModeOption {
  value: PromptMode;
  label: string;
  icon: string;
}

const TARGET_OPTIONS: TargetOption[] = [
  { value: "claude",     label: "Claude",      icon: "◆" },
  { value: "gpt",        label: "GPT-4",       icon: "◉" },
  { value: "cursor",     label: "Cursor",      icon: "⌥" },
  { value: "v0",         label: "v0",          icon: "▲" },
  { value: "midjourney", label: "Midjourney",  icon: "◈" },
  { value: "agent",      label: "Agent",       icon: "⟳" },
  { value: "general",    label: "General",     icon: "✦" },
];

const MODE_OPTIONS: ModeOption[] = [
  { value: "build",         label: "Build",         icon: "🔨" },
  { value: "debug",         label: "Debug",         icon: "🐛" },
  { value: "explain",       label: "Explain",       icon: "💡" },
  { value: "create",        label: "Create",        icon: "✍️" },
  { value: "research",      label: "Research",      icon: "🔎" },
  { value: "design-agent",  label: "Design Agent",  icon: "🤖" },
  { value: "review",        label: "Review",        icon: "👁" },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PowerPromptPanelProps {
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PowerPromptPanel({ onClose }: PowerPromptPanelProps): JSX.Element {
  const [intent, setIntent] = useState("");
  const [target, setTarget] = useState<PromptTarget>("claude");
  const [mode, setMode] = useState<PromptMode>("build");
  const [userContext, setUserContext] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  const intentRef = useRef<HTMLTextAreaElement>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus intent on mount
  useEffect(() => {
    intentRef.current?.focus();
  }, []);

  // Prefetch current Glass context on mount
  const fetchGlassContext = useCallback(async (): Promise<void> => {
    try {
      const s = await window.glass.getState();
      // Pre-fill context field with Glass's current screen digest.
      // User can edit, add to, or clear this before generating.
      const detected = [
        s.activeApp ? `App: ${s.activeApp}` : null,
        s.workingContext ?? null,
      ]
        .filter(Boolean)
        .join("\n");
      setUserContext(detected);
    } catch {
      // ignore — context is optional
    }
  }, []);

  useEffect(() => {
    void fetchGlassContext();
  }, [fetchGlassContext]);

  const handleRefreshContext = useCallback(async (): Promise<void> => {
    setRefreshing(true);
    await fetchGlassContext();
    setRefreshing(false);
  }, [fetchGlassContext]);

  const handleGenerate = useCallback(async (): Promise<void> => {
    if (!intent.trim() || generating) return;
    setGenerating(true);
    setResult(null);
    setError(null);
    setCopied(false);
    setSaved(false);

    try {
      const res = await window.glass.promptGenerate({
        intent: intent.trim(),
        target,
        mode,
        userContext: userContext.trim() || undefined,
      });
      if (res.error) {
        setError(res.error);
      } else {
        setResult(res.result ?? "");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setGenerating(false);
    }
  }, [intent, target, mode, generating]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        void handleGenerate();
      }
    },
    [handleGenerate],
  );

  const handleCopy = useCallback(async (): Promise<void> => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
    } catch {
      await window.glass.writeClipboard(result);
    }
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 1800);
  }, [result]);

  const handleSaveToLibrary = useCallback((): void => {
    if (!result) return;
    const prompts = loadPrompts();
    const title = `${intent.slice(0, 50).trim()}${intent.length > 50 ? "…" : ""}`;
    const newPrompt = createPrompt(title, result, [target, mode]);
    savePrompts([newPrompt, ...prompts]);
    setSaved(true);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => setSaved(false), 2200);
  }, [result, intent, target, mode]);

  const canGenerate = intent.trim().length > 0 && !generating;

  return (
    <div className="pgen-panel">
      {/* Header */}
      <div className="pgen-header">
        <span className="pgen-title">
          <span className="pgen-title-icon">⚡</span>
          Prompt Generator
        </span>
        <button
          type="button"
          className="pgen-btn-close"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {/* Editable context field */}
      <div className="pgen-context-wrap">
        <div className="pgen-context-header">
          <label className="pgen-context-label">
            <span className="pgen-context-dot" />
            Context
          </label>
          <div className="pgen-context-btns">
            <button
              type="button"
              className="pgen-ctx-btn"
              title="Refresh from screen"
              onClick={() => void handleRefreshContext()}
              disabled={refreshing}
            >
              {refreshing ? <span className="pgen-spinner" /> : "↺"}
            </button>
            <button
              type="button"
              className="pgen-ctx-btn"
              title="Clear context"
              onClick={() => setUserContext("")}
            >
              ✕
            </button>
          </div>
        </div>
        <textarea
          className="pgen-context-input"
          placeholder="Glass will auto-detect your context. Edit to add specifics, or clear to generate without context."
          value={userContext}
          onChange={(e) => setUserContext(e.target.value)}
          rows={2}
        />
      </div>

      {/* Intent input */}
      <div className="pgen-intent-wrap">
        <label className="pgen-intent-label">What are you trying to do?</label>
        <textarea
          ref={intentRef}
          className="pgen-intent"
          placeholder="e.g. build a login page with email and Google OAuth"
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
        />
      </div>

      {/* Target + Mode + Generate row */}
      <div className="pgen-controls">
        <div className="pgen-select-wrap">
          <span className="pgen-select-label">For</span>
          <select
            className="pgen-select"
            value={target}
            onChange={(e) => setTarget(e.target.value as PromptTarget)}
          >
            {TARGET_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.icon} {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="pgen-select-wrap">
          <span className="pgen-select-label">Mode</span>
          <select
            className="pgen-select"
            value={mode}
            onChange={(e) => setMode(e.target.value as PromptMode)}
          >
            {MODE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.icon} {o.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          className="pgen-btn-generate"
          onClick={() => void handleGenerate()}
          disabled={!canGenerate}
        >
          {generating ? (
            <span className="pgen-spinner" />
          ) : (
            "⚡ Generate"
          )}
        </button>
      </div>

      {/* Output area */}
      <div className="pgen-output-wrap">
        {generating && (
          <div className="pgen-generating">
            <span className="pgen-spinner pgen-spinner--lg" />
            <span>Crafting your prompt…</span>
          </div>
        )}

        {!generating && error && (
          <div className="pgen-error">{error}</div>
        )}

        {!generating && result && (
          <>
            <div className="pgen-output-header">
              <span className="pgen-output-label">Generated Prompt</span>
              <div className="pgen-output-actions">
                <button
                  type="button"
                  className={`pgen-btn-action${copied ? " pgen-btn-action--done" : ""}`}
                  onClick={() => void handleCopy()}
                >
                  {copied ? "✓ Copied" : "⎘ Copy"}
                </button>
                <button
                  type="button"
                  className={`pgen-btn-action${saved ? " pgen-btn-action--done" : ""}`}
                  onClick={handleSaveToLibrary}
                >
                  {saved ? "✓ Saved" : "+ Library"}
                </button>
              </div>
            </div>
            <pre className="pgen-output">{result}</pre>
          </>
        )}

        {!generating && !result && !error && (
          <div className="pgen-empty">
            <span className="pgen-empty-icon">⚡</span>
            <span>Describe your intent above and hit Generate.</span>
            <span className="pgen-empty-hint">⌘↵ to generate quickly</span>
          </div>
        )}
      </div>
    </div>
  );
}
