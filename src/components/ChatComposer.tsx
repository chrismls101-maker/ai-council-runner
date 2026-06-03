import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type DragEvent,
  type ChangeEvent,
  type ClipboardEvent,
  type ReactNode,
} from "react";
import ComposerPillSelect from "./ComposerPillSelect";
import IivoPlaceholderField from "./IivoPlaceholderField";
import { withIivoWordmark } from "../utils/brandText";
import ComposerAttachments from "./ComposerAttachments";
import ContextAttachmentChips from "./ContextAttachmentChips";
import { ComposerCreditHint } from "./UsageIndicator";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import {
  hasBusinessProfileContent,
  saveSessionBusinessContext,
} from "../utils/composerContext";
import type { BusinessContext } from "../types/decisionQuality";
import {
  PRESET_OPTIONS,
  TOKEN_MODE_OPTIONS,
  type TokenMode,
  type WorkflowOption,
} from "../types";
import {
  EXECUTION_MODE_OPTIONS,
  executionModeIcon,
  executionModeLabel,
  executionModeShortLabel,
  type ExecutionMode,
} from "../types/executionMode";
import { AUTO_ROUTER_HELPER } from "../constants/publicMessages";
import type { ComposerAttachment } from "../types/attachments";
import type { AttachedContextItem } from "../types/contextBridge";
import { isFileDragEvent } from "../utils/composerAttachments";
import { useAutoResizeTextarea } from "../hooks/useAutoResizeTextarea";

function ConfigureSlidersIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <circle cx="8" cy="6" r="2" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="16" cy="12" r="2" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="11" cy="18" r="2" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

type ContextPanel = "profile" | null;

export type ContextBridgeMenuAction =
  | "paste-context"
  | "import-url"
  | "save-evidence"
  | "ask-iivo"
  | "upload-file";

export interface ChatComposerHandle {
  focus: () => void;
}

interface ChatComposerProps {
  prompt: string;
  onPromptChange: (v: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  running: boolean;
  disabled: boolean;
  layout?: "landing" | "pinned";
  preset: string;
  onPresetChange: (v: string) => void;
  workflow: string;
  onWorkflowChange: (v: string) => void;
  workflows: WorkflowOption[];
  executionMode: ExecutionMode;
  onExecutionModeChange: (v: ExecutionMode) => void;
  tokenMode: TokenMode;
  onTokenModeChange: (v: TokenMode) => void;
  benchmark: boolean;
  onBenchmarkChange: (v: boolean) => void;
  decisionObjective: string;
  onDecisionObjectiveChange: (v: string) => void;
  businessContext: BusinessContext;
  onBusinessContextChange: (v: BusinessContext) => void;
  rememberContext: boolean;
  onRememberContextChange: (v: boolean) => void;
  attachments: ComposerAttachment[];
  onRemoveAttachment: (id: string) => void;
  onAddFiles: (files: File[]) => Promise<void>;
  attachmentError?: string | null;
  globalDragActive?: boolean;
  creditEstimateLabel?: string | null;
  attachedContext?: AttachedContextItem[];
  onRemoveAttachedContext?: (id: string) => void;
  onPreviewAttachedContext?: (item: AttachedContextItem) => void;
  onContextBridgeAction?: (action: ContextBridgeMenuAction) => void;
  visionConfigured?: boolean;
}

const CONTEXT_BRIDGE_MENU = [
  { id: "paste-context" as const, label: "Paste Context", enabled: true, icon: "📋" },
  { id: "import-url" as const, label: "Import URL", enabled: true, icon: "🔗" },
  { id: "upload-file" as const, label: "Upload File", enabled: true, icon: "📎" },
  { id: "save-evidence" as const, label: "Save as Evidence", enabled: true, icon: "🗂" },
  { id: "ask-iivo" as const, label: withIivoWordmark("Ask IIVO About This", "ask-iivo"), enabled: true, icon: "✦" },
] as const satisfies ReadonlyArray<{ id: string; label: ReactNode; enabled: boolean; icon: string }>;

const ChatComposer = forwardRef<ChatComposerHandle, ChatComposerProps>(
  function ChatComposer(
    {
      prompt,
      onPromptChange,
      onSubmit,
      onStop,
      running,
      disabled,
      preset,
      onPresetChange,
      workflow,
      onWorkflowChange,
      workflows,
      executionMode,
      onExecutionModeChange,
      tokenMode,
      onTokenModeChange,
      benchmark,
      onBenchmarkChange,
      decisionObjective,
      onDecisionObjectiveChange,
      businessContext,
      onBusinessContextChange,
      rememberContext,
      onRememberContextChange,
      attachments,
      onRemoveAttachment,
      onAddFiles,
      attachmentError,
      globalDragActive = false,
      creditEstimateLabel = null,
      attachedContext = [],
      onRemoveAttachedContext,
      onPreviewAttachedContext,
      onContextBridgeAction,
      visionConfigured = false,
      layout = "pinned",
    },
    ref,
  ) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const { ref: autoResizeRef, syncHeight: resizeTextarea } = useAutoResizeTextarea(prompt);
    const mergeTextareaRef = useCallback(
      (node: HTMLTextAreaElement | null) => {
        textareaRef.current = node;
        autoResizeRef.current = node;
      },
      [autoResizeRef],
    );
    const fileInputRef = useRef<HTMLInputElement>(null);
    const contextUiRef = useRef<HTMLDivElement>(null);
    const configureRef = useRef<HTMLDivElement>(null);
    const composerDragCounter = useRef(0);
    const [contextMenuOpen, setContextMenuOpen] = useState(false);
    const [contextPanel, setContextPanel] = useState<ContextPanel>(null);
    const [configureOpen, setConfigureOpen] = useState(false);
    const [openPill, setOpenPill] = useState<
      "execution-mode" | "workflow" | "preset" | "token" | null
    >(null);
    const [multiLine, setMultiLine] = useState(false);
    const [composerDragActive, setComposerDragActive] = useState(false);
    const [contextDraft, setContextDraft] = useState<BusinessContext>(businessContext);

    useImperativeHandle(ref, () => ({
      focus: () => textareaRef.current?.focus(),
    }));

    const closeContextUi = useCallback(() => {
      setContextMenuOpen(false);
      setContextPanel(null);
    }, []);

    const appendTranscript = useCallback(
      (text: string) => {
        onPromptChange(prompt ? `${prompt.trimEnd()} ${text}` : text);
      },
      [prompt, onPromptChange],
    );

    const { listening, error: voiceError, toggle: toggleVoice, supported } =
      useSpeechRecognition(appendTranscript);

    useLayoutEffect(() => {
      const applied = resizeTextarea();
      setMultiLine(applied > 36 || prompt.includes("\n"));
    }, [prompt, resizeTextarea]);

    useEffect(() => {
      if (!contextMenuOpen && !contextPanel) return;
      const onDocClick = (e: MouseEvent) => {
        if (contextUiRef.current && !contextUiRef.current.contains(e.target as Node)) {
          closeContextUi();
        }
      };
      const onEscape = (e: globalThis.KeyboardEvent) => {
        if (e.key === "Escape") closeContextUi();
      };
      document.addEventListener("mousedown", onDocClick);
      document.addEventListener("keydown", onEscape);
      return () => {
        document.removeEventListener("mousedown", onDocClick);
        document.removeEventListener("keydown", onEscape);
      };
    }, [contextMenuOpen, contextPanel, closeContextUi]);

    useEffect(() => {
      if (!configureOpen) return;
      const onDocClick = (e: MouseEvent) => {
        if (configureRef.current && !configureRef.current.contains(e.target as Node)) {
          setConfigureOpen(false);
        }
      };
      const onEscape = (e: globalThis.KeyboardEvent) => {
        if (e.key === "Escape") setConfigureOpen(false);
      };
      document.addEventListener("mousedown", onDocClick);
      document.addEventListener("keydown", onEscape);
      return () => {
        document.removeEventListener("mousedown", onDocClick);
        document.removeEventListener("keydown", onEscape);
      };
    }, [configureOpen]);

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (running || disabled || !canSubmit) return;
        onSubmit();
        return;
      }
      if (e.key === "Enter" && e.shiftKey) {
        requestAnimationFrame(resizeTextarea);
      }
    };

    const handlePromptChange = (value: string) => {
      onPromptChange(value);
      requestAnimationFrame(resizeTextarea);
    };

    const canSubmit = Boolean(
      prompt.trim() || attachments.length > 0 || attachedContext.length > 0,
    );

    const handleSubmit = () => {
      if (running || disabled || !canSubmit) return;
      if (listening) toggleVoice();
      onSubmit();
    };

    const handleComposerDragEnter = (e: DragEvent<HTMLDivElement>) => {
      if (disabled || running || !isFileDragEvent(e.nativeEvent)) return;
      e.preventDefault();
      composerDragCounter.current += 1;
      setComposerDragActive(true);
    };

    const handleComposerDragOver = (e: DragEvent<HTMLDivElement>) => {
      if (disabled || running || !isFileDragEvent(e.nativeEvent)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    };

    const handleComposerDragLeave = (e: DragEvent<HTMLDivElement>) => {
      if (!isFileDragEvent(e.nativeEvent)) return;
      composerDragCounter.current -= 1;
      if (composerDragCounter.current <= 0) {
        composerDragCounter.current = 0;
        setComposerDragActive(false);
      }
    };

    const handleComposerDrop = async (e: DragEvent<HTMLDivElement>) => {
      if (disabled || running || !isFileDragEvent(e.nativeEvent)) return;
      e.preventDefault();
      composerDragCounter.current = 0;
      setComposerDragActive(false);
      const files = Array.from(e.dataTransfer.files ?? []);
      if (files.length > 0) await onAddFiles(files);
    };

    const handleFileInputChange = async (e: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      e.target.value = "";
      if (files.length > 0) await onAddFiles(files);
    };

    const handlePaste = async (e: ClipboardEvent<HTMLTextAreaElement>) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length === 0) return;
      e.preventDefault();
      await onAddFiles(files);
    };

    const dragActive = globalDragActive || composerDragActive;

    const openContextPanel = (panel: ContextPanel) => {
      setContextMenuOpen(false);
      if (panel === "profile") {
        setContextDraft(businessContext);
      }
      setContextPanel(panel);
    };

    const handleSaveContext = () => {
      if (!hasBusinessProfileContent(contextDraft)) return;
      onBusinessContextChange(contextDraft);
      saveSessionBusinessContext(contextDraft, rememberContext);
      closeContextUi();
    };

    const updateContextDraft = (field: keyof BusinessContext, value: string) => {
      setContextDraft((prev) => ({ ...prev, [field]: value }));
    };

    const isLanding = layout === "landing";
    const executionModeDescription =
      EXECUTION_MODE_OPTIONS.find((o) => o.value === executionMode)?.description ?? "";

    const executionModeSelect = (
      <ComposerPillSelect
        value={executionMode}
        options={EXECUTION_MODE_OPTIONS.map((o) => ({
          value: o.value,
          label: executionModeShortLabel(o.value),
          description: o.description,
        }))}
        onChange={(v) => onExecutionModeChange(v as ExecutionMode)}
        icon={executionModeIcon(executionMode)}
        ariaLabel="Execution mode"
        disabled={running}
        triggerTestId="execution-mode-select"
        open={openPill === "execution-mode"}
        onOpenChange={(v) => setOpenPill(v ? "execution-mode" : null)}
        variant={isLanding ? "minimal" : "default"}
      />
    );

    const configurePanel = configureOpen && (
      <div
        id="composer-configure-panel"
        className={`composer-configure-panel${isLanding ? " landing-configure-panel" : ""}`}
        role="region"
        aria-label="Advanced configuration"
      >
            <p className="composer-configure-mode-note" data-testid="execution-mode-description">
              <strong>{executionModeLabel(executionMode)}</strong> — {executionModeDescription}
            </p>
            <div className="composer-configure-advanced-row">
              <label className="composer-configure-field-label">Preset</label>
              <ComposerPillSelect
                value={preset}
                options={PRESET_OPTIONS.map((p) => ({
                  value: p.value,
                  label: p.label,
                  description: p.description,
                }))}
                onChange={onPresetChange}
                icon="▤"
                ariaLabel="Preset"
                disabled={running}
                triggerTestId="preset-select"
                open={openPill === "preset"}
                onOpenChange={(v) => setOpenPill(v ? "preset" : null)}
              />
            </div>
            <div className="composer-configure-advanced-row">
              <label className="composer-configure-field-label">Response depth</label>
              <ComposerPillSelect
                value={tokenMode}
                options={TOKEN_MODE_OPTIONS.map((o) => ({
                  value: o.value,
                  label: o.label,
                  description: o.hint,
                }))}
                onChange={(v) => onTokenModeChange(v as TokenMode)}
                icon="⚡"
                ariaLabel="Response depth"
                disabled={running}
                triggerTestId="token-mode-select"
                open={openPill === "token"}
                onOpenChange={(v) => setOpenPill(v ? "token" : null)}
              />
            </div>
            <p
              className="composer-configure-preset-note muted"
              data-testid="preset-neutral-note"
            >
              {preset === "none" ? (
                <>
                  <strong>Preset:</strong> Neutral mode — no project preset injected.
                </>
              ) : (
                <>
                  <strong>Preset:</strong>{" "}
                  {PRESET_OPTIONS.find((p) => p.value === preset)?.label ?? preset} — project
                  context is injected into runs.
                </>
              )}
            </p>
            <details className="composer-advanced-routing" data-testid="advanced-routing">
              <summary>Advanced routing</summary>
              <p className="muted composer-advanced-routing-note">
                Auto Router is the internal system IIVO uses to pick the route. Execution Mode
                controls how aggressive routing can be.
              </p>
              <div className="composer-configure-advanced-row">
                <label className="composer-configure-field-label">Workflow override</label>
                <ComposerPillSelect
                  value={workflow}
                  options={workflows.map((w) => ({
                    value: w.value,
                    label: w.label,
                    description: w.purpose,
                  }))}
                  onChange={onWorkflowChange}
                  icon="↝"
                  ariaLabel="Workflow override"
                  disabled={running}
                  triggerTestId="workflow-select"
                  open={openPill === "workflow"}
                  onOpenChange={(v) => setOpenPill(v ? "workflow" : null)}
                />
              </div>
              <div className="auto-router-helper" data-testid="auto-router-helper">
                <strong>{withIivoWordmark(AUTO_ROUTER_HELPER.title, "auto-router-title")}</strong>
                <p className="muted">{AUTO_ROUTER_HELPER.intro}</p>
                <ul>
                  {AUTO_ROUTER_HELPER.paths.map((path) => (
                    <li key={path.name}>
                      <strong>{path.name}</strong> — {path.detail}
                    </li>
                  ))}
                </ul>
              </div>
            </details>
            <button
              type="button"
              className="btn ghost small composer-business-context-btn"
              onClick={() => openContextPanel("profile")}
              disabled={running}
            >
              Business Context
            </button>
            <label className="composer-configure-field">
              <span>Decision Objective</span>
              <input
                type="text"
                value={decisionObjective}
                onChange={(e) => onDecisionObjectiveChange(e.target.value)}
                placeholder="What outcome are you trying to achieve?"
                disabled={running}
              />
            </label>
            <label className="composer-configure-benchmark">
              <input
                type="checkbox"
                checked={benchmark}
                onChange={(e) => onBenchmarkChange(e.target.checked)}
                disabled={running}
              />
              <span className="composer-configure-benchmark-text">
                <span className="composer-configure-benchmark-label">
                  Benchmark this run
                </span>
                <span className="composer-configure-helper">
                  Adds a single-model baseline alongside this run. For full scoring and history, use
                  Benchmark Lab in the sidebar.
                </span>
              </span>
            </label>
      </div>
    );

    const landingComposerHeader = isLanding && !disabled && (
      <div className="composer-configure-wrap landing-composer-header" ref={configureRef}>
        {configurePanel}
        <div className="landing-composer-meta">
          <div className="composer-mode-control landing-mode-control" data-testid="execution-mode-control">
            {executionModeSelect}
          </div>
          <button
            type="button"
            className="landing-configure-link"
            onClick={() => setConfigureOpen((o) => !o)}
            aria-expanded={configureOpen}
            aria-controls="composer-configure-panel"
            disabled={running}
            data-testid="composer-configure"
          >
            Configure
            <svg
              className={`landing-configure-chevron${configureOpen ? " is-open" : ""}`}
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="m6 9 6 6 6-6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>
    );

    const configureControls = !disabled && !isLanding && (
      <div className="composer-configure-wrap" ref={configureRef}>
        <div className="composer-toolbar-row">
          <div className="composer-mode-control" data-testid="execution-mode-control">
            <span className="composer-mode-prefix">Mode:</span>
            {executionModeSelect}
          </div>
          <button
            type="button"
            className="pill-configure-btn"
            onClick={() => setConfigureOpen((o) => !o)}
            aria-expanded={configureOpen}
            aria-controls="composer-configure-panel"
            disabled={running}
            data-testid="composer-configure"
          >
            <ConfigureSlidersIcon />
            Configure
          </button>
        </div>
        {configurePanel}
        <ComposerCreditHint estimateLabel={creditEstimateLabel} />
      </div>
    );

    return (
      <div
        className={`chat-composer-wrap layout-${layout}${dragActive ? " drag-active" : ""}`}
        onDragEnter={handleComposerDragEnter}
        onDragOver={handleComposerDragOver}
        onDragLeave={handleComposerDragLeave}
        onDrop={handleComposerDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="composer-file-input"
          multiple
          accept="image/*,.txt,.md,.markdown,.json,.csv,.tsv,.xml,.html,.htm,.yaml,.yml,.log,.js,.jsx,.ts,.tsx,.py,.rb,.go,.rs,.java,.c,.cpp,.css,.scss,.sql,.sh,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
          onChange={handleFileInputChange}
          tabIndex={-1}
          aria-hidden="true"
        />

        <div
          ref={contextUiRef}
          className={`composer-context-ui${isLanding ? " landing-composer-stack" : ""}`}
        >
          {landingComposerHeader}
          <div
            className={`chat-composer${layout === "landing" ? " composer-shell" : ""}${multiLine || attachments.length > 0 ? " is-expanded" : ""}${dragActive ? " is-drag-over" : ""}${attachments.length > 0 ? " has-attachments" : ""}`}
          >
            <div className="composer-main">
              <div className="composer-plus-wrap">
              <button
                type="button"
                className="composer-icon-btn composer-plus-btn"
                onClick={() => {
                  setContextPanel(null);
                  setContextMenuOpen((o) => !o);
                }}
                aria-label="Add context"
                aria-expanded={contextMenuOpen}
                disabled={disabled || running}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M12 5v14M5 12h14"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
              {contextMenuOpen && !contextPanel && (
                <div
                  className="composer-context-menu context-bridge-menu"
                  role="menu"
                  aria-label="Context Bridge"
                  data-testid="context-bridge-menu"
                >
                  <p className="composer-context-menu-title">Context Bridge</p>
                  {CONTEXT_BRIDGE_MENU.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`composer-context-item context-bridge-item${item.enabled ? "" : " is-disabled"}`}
                      role="menuitem"
                      disabled={!item.enabled}
                      data-testid={`context-bridge-${item.id}`}
                      onClick={() => {
                        if (!item.enabled) return;
                        closeContextUi();
                        switch (item.id) {
                          case "upload-file":
                            fileInputRef.current?.click();
                            break;
                          case "paste-context":
                          case "import-url":
                          case "save-evidence":
                          case "ask-iivo":
                            onContextBridgeAction?.(item.id);
                            break;
                          default:
                            break;
                        }
                      }}
                    >
                      <span className="context-bridge-item-icon" aria-hidden="true">
                        {item.icon}
                      </span>
                      <span className="context-bridge-item-label">{item.label}</span>
                      {!item.enabled && (
                        <span className="composer-context-soon">Coming soon</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="composer-input-stack">
              <ContextAttachmentChips
                items={attachedContext}
                onRemove={(id) => onRemoveAttachedContext?.(id)}
                onPreview={onPreviewAttachedContext}
                disabled={disabled || running}
                visionConfigured={visionConfigured}
              />
              <ComposerAttachments
                attachments={attachments}
                onRemove={onRemoveAttachment}
                disabled={disabled || running}
              />

              <IivoPlaceholderField
                show={!prompt.trim() && attachments.length === 0}
                before="Message "
                after="…"
                variant="composer"
              >
                <textarea
                  ref={mergeTextareaRef}
                  className="composer-textarea"
                  value={prompt}
                  onChange={(e) => handlePromptChange(e.target.value)}
                  onInput={resizeTextarea}
                  onKeyDown={handleKeyDown}
                  onPaste={(e) => {
                    void handlePaste(e);
                    requestAnimationFrame(resizeTextarea);
                  }}
                  placeholder={
                    attachments.length > 0 ? "Add a message about your files…" : ""
                  }
                  disabled={disabled}
                  rows={1}
                  aria-label="Message IIVO"
                  data-testid="composer-input"
                />
              </IivoPlaceholderField>
            </div>

            <div className="composer-trailing">
              <button
                type="button"
                className={`composer-icon-btn composer-mic-btn ${listening ? "listening" : ""}`}
                onClick={toggleVoice}
                aria-label={listening ? "Stop voice input" : "Start voice input"}
                aria-pressed={listening}
                disabled={disabled || running}
                title={supported ? "Voice input" : "Voice input not supported"}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <path
                    d="M19 11a7 7 0 0 1-14 0M12 18v3"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>

              <span className="composer-trailing-divider" aria-hidden="true" />

              {running ? (
                <button
                  type="button"
                  className="composer-send-btn stop"
                  onClick={onStop}
                  aria-label="Stop council run"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <rect x="6" y="6" width="12" height="12" rx="1" />
                  </svg>
                </button>
              ) : (
                <button
                  type="button"
                  className="composer-send-btn"
                  onClick={handleSubmit}
                  disabled={disabled || !canSubmit}
                  aria-label="Send message"
                  data-testid="composer-send"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M12 19V5M12 5l-6 6M12 5l6 6"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {layout === "landing" && (
            <span className="composer-led-rim ui-led-line" aria-hidden="true" />
          )}

          {dragActive && (
            <div className="composer-drop-hint" aria-hidden="true">
              Drop files or images here
            </div>
          )}
          </div>

          {contextPanel === "profile" && (
            <div className="composer-context-panel" role="dialog" aria-label="Add Business Context">
              <div className="composer-context-panel-header">
                <h3>Add Business Context</h3>
                <button
                  type="button"
                  className="composer-context-panel-close"
                  onClick={closeContextUi}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              <p className="composer-context-panel-desc">
                Structured context is included with your run for the current session.
              </p>
              <div className="composer-profile-grid">
                {(
                  [
                    ["name", "Project / Business Name"],
                    ["offer", "Offer"],
                    ["targetCustomer", "Target Customer"],
                    ["pricing", "Pricing"],
                    ["currentGoal", "Current Goal"],
                    ["constraints", "Constraints"],
                    ["notes", "Notes"],
                  ] as const
                ).map(([field, label]) => (
                  <label key={field} className="composer-profile-field">
                    <span>{label}</span>
                    {field === "notes" ? (
                      <textarea
                        value={contextDraft[field]}
                        onChange={(e) => updateContextDraft(field, e.target.value)}
                        placeholder={label}
                        rows={2}
                      />
                    ) : (
                      <input
                        type="text"
                        value={contextDraft[field]}
                        onChange={(e) => updateContextDraft(field, e.target.value)}
                        placeholder={label}
                      />
                    )}
                  </label>
                ))}
              </div>
              <label className="composer-remember-context">
                <input
                  type="checkbox"
                  checked={rememberContext}
                  onChange={(e) => onRememberContextChange(e.target.checked)}
                />
                Remember for this session
              </label>
              <div className="composer-context-panel-actions">
                <button type="button" className="btn ghost small" onClick={closeContextUi}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn primary small"
                  onClick={handleSaveContext}
                  disabled={!hasBusinessProfileContent(contextDraft)}
                >
                  Save context
                </button>
              </div>
            </div>
          )}
        </div>

        {configureControls}

        {hasBusinessProfileContent(businessContext) && (
          <div className="composer-context-badge">
            Context: {businessContext.name.trim() || "Active"}
          </div>
        )}

        {voiceError && (
          <p className="composer-voice-error" role="status">{voiceError}</p>
        )}

        {attachmentError && (
          <p className="composer-attachment-error" role="status">{attachmentError}</p>
        )}

        {!isLanding && (
          <p className="composer-footnote">Enter to send · Shift+Enter for new line</p>
        )}
      </div>
    );
  },
);

export default ChatComposer;
