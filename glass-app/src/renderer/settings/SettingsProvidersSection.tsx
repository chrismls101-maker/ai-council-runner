import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Bot, Brain, FolderOpen, Layers, Sparkles, Wrench } from "lucide-react";
import type { ApiKeyMeta } from "../../shared/ipc.ts";
import type { GlassState } from "../../shared/ipc.ts";
import type { GlassUserSettings } from "../../shared/glassSettings.ts";
import {
  GLASS_ANTHROPIC_KEY_ID,
  GLASS_ANTHROPIC_KEY_META,
  GLASS_OPENAI_KEY_ID,
  GLASS_OPENAI_KEY_META,
} from "../../shared/glassProviderKeys.ts";
import { isAnthropicKeyFormatValid } from "../../shared/anthropicKeyFormat.ts";
import { isOpenAiKeyFormatValid } from "../../shared/openaiKeyFormat.ts";
import {
  PROVIDER_BASE_URL_SHORTCUTS,
  PROVIDER_SHORTCUT_NAMES,
} from "../../shared/providerPresets.ts";
import { displayAgentOutputFolder } from "../../shared/agentOutputFolder.ts";
import { send } from "../useGlassState.ts";

type ConnectMode = "anthropic" | "openai" | "plain";
type CardStatus = "ok" | "warn" | "idle" | "error";

function generateCustomId(): string {
  return `key_custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

type PipelineCardProps = {
  step: string;
  title: string;
  summary: string;
  status: CardStatus;
  icon: JSX.Element;
  children: ReactNode;
  testId: string;
};

function ProviderPipelineCard({
  step,
  title,
  summary,
  status,
  icon,
  children,
  testId,
}: PipelineCardProps): JSX.Element {
  return (
    <article className="glass-settings__audio-card" data-testid={testId}>
      <div className="glass-settings__audio-card-head">
        <span className="glass-settings__audio-step">{step}</span>
        <span className={`glass-settings__audio-status glass-settings__audio-status--${status}`}>
          {status === "ok" ? "Connected" : status === "warn" ? "Action needed" : status === "error" ? "Issue" : "Not connected"}
        </span>
      </div>
      <div className="glass-settings__audio-card-main">
        <span className="glass-settings__audio-icon">{icon}</span>
        <div className="glass-settings__audio-copy">
          <h3 className="glass-settings__audio-title">{title}</h3>
          <p className="glass-settings__audio-summary">{summary}</p>
        </div>
      </div>
      <div className="glass-settings__audio-card-body">{children}</div>
    </article>
  );
}

type ProviderKeyEditorProps = {
  placeholder: string;
  connectMode: ConnectMode;
  meta: ApiKeyMeta;
  onSaved: () => void;
  testIdPrefix: string;
};

function ProviderKeyEditor({
  placeholder,
  connectMode,
  meta,
  onSaved,
  testIdPrefix,
}: ProviderKeyEditorProps): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [masked, setMasked] = useState<string | null>(null);

  const loadMasked = useCallback(async () => {
    const res = await window.glass.apiKeyGetMasked(meta.id);
    setMasked(res.masked);
  }, [meta.id]);

  useEffect(() => {
    void loadMasked();
  }, [loadMasked]);

  async function handleSave(): Promise<void> {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (connectMode === "anthropic" && !isAnthropicKeyFormatValid(trimmed)) {
      setError("Anthropic keys start with sk-ant-");
      return;
    }
    if (connectMode === "openai" && !isOpenAiKeyFormatValid(trimmed)) {
      setError("OpenAI keys start with sk-");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (connectMode === "anthropic") {
        const res = await window.glass.anthropicKeyConnect(trimmed);
        if (!res.ok) {
          setError(res.error ?? "Key not recognized — check it and try again");
          return;
        }
      } else if (connectMode === "openai") {
        const res = await window.glass.openaiKeyConnect(trimmed);
        if (!res.ok) {
          setError(res.error ?? "Key not recognized — check it and try again");
          return;
        }
      } else {
        const res = await window.glass.apiKeySave({
          meta: { ...meta, createdAt: meta.createdAt ?? Date.now() },
          value: trimmed,
        });
        if (!res.ok) {
          setError(res.error ?? "Could not save key.");
          return;
        }
      }
      setValue("");
      setEditing(false);
      await loadMasked();
      onSaved();
    } catch {
      setError("Could not save key.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {!editing ? (
        <>
          <p className="glass-settings__audio-detail">
            {masked ? (
              <>
                Saved as <code>{masked}</code>
              </>
            ) : (
              "No key saved yet"
            )}
          </p>
          <div className="glass-settings__audio-actions">
            <button
              type="button"
              className="gbtn gbtn--primary"
              data-testid={`${testIdPrefix}-connect`}
              onClick={() => setEditing(true)}
            >
              {masked ? "Update key" : "Connect key"}
            </button>
          </div>
        </>
      ) : (
        <>
          <label className="glass-settings__audio-field">
            <span>API key</span>
            <input
              className="glass-settings__providers-input"
              type="password"
              placeholder={placeholder}
              value={value}
              autoComplete="off"
              spellCheck={false}
              disabled={loading}
              data-testid={`${testIdPrefix}-input`}
              onChange={(e) => {
                setValue(e.target.value);
                if (error) setError(null);
              }}
            />
          </label>
          {error ? <p className="hint hint--error">{error}</p> : null}
          <div className="glass-settings__audio-actions">
            <button
              type="button"
              className="gbtn gbtn--primary"
              disabled={!value.trim() || loading}
              data-testid={`${testIdPrefix}-save`}
              onClick={() => void handleSave()}
            >
              {loading ? "Saving…" : "Save key"}
            </button>
            <button
              type="button"
              className="gbtn gbtn--ghost"
              disabled={loading}
              onClick={() => {
                setEditing(false);
                setValue("");
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </>
  );
}

type SettingsProvidersSectionProps = {
  state: GlassState;
};

export function SettingsProvidersSection({ state }: SettingsProvidersSectionProps): JSX.Element {
  const [keys, setKeys] = useState<ApiKeyMeta[]>([]);
  const [anthropicMasked, setAnthropicMasked] = useState<string | null>(null);
  const [openAiMasked, setOpenAiMasked] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const [customKey, setCustomKey] = useState("");
  const [customShortcut, setCustomShortcut] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);
  const [customLoading, setCustomLoading] = useState(false);

  const refreshKeys = useCallback(() => {
    void window.glass.apiKeyList().then((res) => setKeys(res.keys ?? []));
    void window.glass.apiKeyGetMasked(GLASS_ANTHROPIC_KEY_ID).then((res) => {
      setAnthropicMasked(res.masked);
    });
    void window.glass.apiKeyGetMasked(GLASS_OPENAI_KEY_ID).then((res) => {
      setOpenAiMasked(res.masked);
    });
  }, []);

  useEffect(() => {
    refreshKeys();
  }, [refreshKeys]);

  const anthropicMeta =
    keys.find((k) => k.id === GLASS_ANTHROPIC_KEY_ID) ?? GLASS_ANTHROPIC_KEY_META;
  const openaiMeta = keys.find((k) => k.id === GLASS_OPENAI_KEY_ID) ?? GLASS_OPENAI_KEY_META;

  const outputFolder = displayAgentOutputFolder(state.glassSettings);
  const workspace = state.glassSettings.agentCodeWorkspaceRoot?.trim();
  const indexState = state.indexState;
  const memoryStatus = state.projectMemoryState?.status;

  const indexLabel = (() => {
    if (!workspace) return "Choose a code project folder first";
    if (indexState?.status === "indexing" && indexState.progress) {
      const p = indexState.progress;
      if (p.phase === "pulling") {
        return p.detail ? `Pulling model — ${p.detail}` : "Pulling embedding model…";
      }
      if (p.total > 0) return `Indexing (${p.indexed}/${p.total} embedded)`;
      return "Indexing…";
    }
    if (indexState?.status === "ready" && indexState.fileCount != null) {
      return `Ready — ${indexState.fileCount} files indexed`;
    }
    if (indexState?.status === "error") return indexState.error ?? "Index error";
    if (state.ollamaAvailable === false) return "Start Ollama for semantic search";
    return "Not indexed yet";
  })();

  const indexStatus: CardStatus = !workspace
    ? "idle"
    : indexState?.status === "ready"
      ? "ok"
      : indexState?.status === "indexing"
        ? "idle"
        : indexState?.status === "error" || state.ollamaAvailable === false
          ? "warn"
          : "idle";

  const patchCoderSettings = (
    patch: Partial<
      Pick<
        GlassUserSettings,
        | "indexEnabled"
        | "indexAutoOnOpen"
        | "screenContextEnabled"
        | "voiceCoderEnabled"
        | "coderAutoVerify"
        | "coderAutoReview"
      >
    >,
  ): void => {
    send({ type: "set-glass-coder-settings", patch });
  };

  function handleCustomShortcut(name: string): void {
    setCustomShortcut(name);
    setCustomName(name);
    setCustomBaseUrl(PROVIDER_BASE_URL_SHORTCUTS[name] ?? "");
  }

  async function handleTestCustom(): Promise<void> {
    setCustomLoading(true);
    setCustomError(null);
    try {
      const res = await window.glass.providerTestConnection({
        baseUrl: customBaseUrl,
        apiKey: customKey,
      });
      if (!res.ok) {
        setCustomError(res.error ?? "Connection failed.");
        return;
      }
      const meta: ApiKeyMeta = {
        id: generateCustomId(),
        service: customName.trim() || "Custom",
        label: customBaseUrl.trim(),
        environment: "any",
        createdAt: Date.now(),
        lastUsedAt: null,
      };
      const saveRes = await window.glass.apiKeySave({ meta, value: customKey.trim() });
      if (!saveRes.ok) {
        setCustomError(saveRes.error ?? "Could not save provider.");
        return;
      }
      setCustomOpen(false);
      setCustomName("");
      setCustomBaseUrl("");
      setCustomKey("");
      setCustomShortcut("");
      refreshKeys();
    } catch {
      setCustomError("Connection failed.");
    } finally {
      setCustomLoading(false);
    }
  }

  const customCount = keys.filter(
    (k) => k.id !== GLASS_ANTHROPIC_KEY_ID && k.id !== GLASS_OPENAI_KEY_ID,
  ).length;

  return (
    <div className="glass-settings__providers" data-testid="glass-settings-providers">
      <p className="glass-settings__audio-lede">
        Connect AI providers in order: <strong>Anthropic</strong> powers agents and the command bar,{" "}
        <strong>OpenAI</strong> is optional for speech-to-text, and you can add{" "}
        <strong>custom</strong> OpenAI-compatible endpoints. Keys stay encrypted on this Mac.
      </p>

      <ProviderPipelineCard
        step="1"
        title="Anthropic"
        summary="Required for Glass Agents, council, and Claude-powered features."
        status={anthropicMasked ? "ok" : "warn"}
        icon={<Brain size={26} strokeWidth={1.75} />}
        testId="glass-settings-provider-anthropic"
      >
        <ProviderKeyEditor
          meta={anthropicMeta}
          placeholder="sk-ant-..."
          connectMode="anthropic"
          testIdPrefix="glass-settings-anthropic"
          onSaved={refreshKeys}
        />
      </ProviderPipelineCard>

      <ProviderPipelineCard
        step="2"
        title="OpenAI"
        summary="Optional — used for speech-to-text when configured under Audio."
        status={openAiMasked ? "ok" : "idle"}
        icon={<Sparkles size={26} strokeWidth={1.75} />}
        testId="glass-settings-provider-openai"
      >
        <ProviderKeyEditor
          meta={openaiMeta}
          placeholder="sk-..."
          connectMode="openai"
          testIdPrefix="glass-settings-openai"
          onSaved={refreshKeys}
        />
      </ProviderPipelineCard>

      <ProviderPipelineCard
        step="3"
        title="Custom provider"
        summary={
          customCount > 0
            ? `${customCount} custom provider${customCount === 1 ? "" : "s"} saved — add OpenRouter, Groq, or any OpenAI-compatible API.`
            : "Add OpenRouter, Groq, or any OpenAI-compatible base URL."
        }
        status={customCount > 0 ? "ok" : "idle"}
        icon={<Wrench size={26} strokeWidth={1.75} />}
        testId="glass-settings-provider-custom"
      >
        {!customOpen ? (
          <div className="glass-settings__audio-actions">
            <button
              type="button"
              className="gbtn gbtn--primary"
              data-testid="glass-settings-custom-open"
              onClick={() => setCustomOpen(true)}
            >
              Add custom provider
            </button>
          </div>
        ) : (
          <>
            <p className="glass-settings__block-label">Quick presets</p>
            <div className="glass-settings__pill-row">
              {PROVIDER_SHORTCUT_NAMES.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={`glass-settings__pill${customShortcut === name ? " glass-settings__pill--active" : ""}`}
                  onClick={() => handleCustomShortcut(name)}
                >
                  {name}
                </button>
              ))}
            </div>
            <label className="glass-settings__audio-field">
              <span>Provider name</span>
              <input
                className="glass-settings__providers-input"
                placeholder="My provider"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
              />
            </label>
            <label className="glass-settings__audio-field">
              <span>Base URL (OpenAI-compatible)</span>
              <input
                className="glass-settings__providers-input"
                placeholder="https://..."
                value={customBaseUrl}
                onChange={(e) => setCustomBaseUrl(e.target.value)}
              />
            </label>
            <label className="glass-settings__audio-field">
              <span>API key</span>
              <input
                className="glass-settings__providers-input"
                type="password"
                placeholder="API key"
                value={customKey}
                autoComplete="off"
                onChange={(e) => setCustomKey(e.target.value)}
              />
            </label>
            {customError ? <p className="hint hint--error">{customError}</p> : null}
            <div className="glass-settings__audio-actions">
              <button
                type="button"
                className="gbtn gbtn--primary"
                disabled={!customBaseUrl.trim() || !customKey.trim() || customLoading}
                onClick={() => void handleTestCustom()}
              >
                {customLoading ? "Testing…" : "Test & save"}
              </button>
              <button
                type="button"
                className="gbtn gbtn--ghost"
                onClick={() => {
                  setCustomOpen(false);
                  setCustomError(null);
                }}
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </ProviderPipelineCard>

      <section className="glass-settings__block glass-settings__providers-agents">
        <p className="glass-settings__block-label">Glass Agents</p>
        <p className="glass-settings__block-sub">
          Where agent reports land and which folder Code Analyst searches.
        </p>

        <ProviderPipelineCard
          step="A"
          title="Workspace folders"
          summary="Output folder for reports · code project folder for browsing your repo."
          status={workspace ? "ok" : "warn"}
          icon={<FolderOpen size={26} strokeWidth={1.75} />}
          testId="glass-settings-agent-folders"
        >
          <label className="glass-settings__audio-field">
            <span>Output folder</span>
            <button
              type="button"
              className="gbtn gbtn--ghost glass-settings__path-btn"
              onClick={() => void window.glass.agentPickOutputFolder()}
            >
              {outputFolder}
            </button>
          </label>
          <label className="glass-settings__audio-field">
            <span>Code project folder</span>
            <button
              type="button"
              className="gbtn gbtn--ghost glass-settings__path-btn"
              onClick={() => void window.glass.agentPickWorkspaceRoot()}
            >
              {workspace || "Choose folder…"}
            </button>
          </label>
        </ProviderPipelineCard>

        <ProviderPipelineCard
          step="B"
          title="Codebase index"
          summary="Local semantic search via Ollama (nomic-embed-text) — free and offline."
          status={indexStatus}
          icon={<Layers size={26} strokeWidth={1.75} />}
          testId="glass-settings-agent-index"
        >
          <p className="glass-settings__audio-detail">{indexLabel}</p>
          {state.ollamaAvailable === false ? (
            <p className="glass-settings__block-hint">
              Start Ollama to enable semantic search; Glass Coder falls back to file search.
            </p>
          ) : null}
          <div className="glass-settings__audio-actions">
            <button
              type="button"
              className="gbtn gbtn--primary"
              disabled={!workspace || indexState?.status === "indexing"}
              onClick={() => workspace && void window.glass.indexStart(workspace)}
            >
              Index now
            </button>
          </div>
          <label className="glass-settings__toggle-card">
            <input
              type="checkbox"
              checked={state.glassSettings.indexEnabled !== false}
              onChange={(e) => patchCoderSettings({ indexEnabled: e.target.checked })}
            />
            <span>
              <strong>Enable semantic index</strong>
              <small>Build embeddings for natural-language code search</small>
            </span>
          </label>
          <label className="glass-settings__toggle-card">
            <input
              type="checkbox"
              checked={state.glassSettings.indexAutoOnOpen !== false}
              onChange={(e) => patchCoderSettings({ indexAutoOnOpen: e.target.checked })}
            />
            <span>
              <strong>Auto-index on project open</strong>
            </span>
          </label>
        </ProviderPipelineCard>

        <ProviderPipelineCard
          step="C"
          title="Project memory"
          summary="Generates GLASS_CONTEXT.md in your project — Glass Coder reads it every run."
          status={
            memoryStatus === "done" ? "ok" : memoryStatus === "error" ? "error" : "idle"
          }
          icon={<Bot size={26} strokeWidth={1.75} />}
          testId="glass-settings-agent-memory"
        >
          {memoryStatus === "generating" ? (
            <p className="glass-settings__block-hint">Generating GLASS_CONTEXT.md…</p>
          ) : null}
          {memoryStatus === "done" ? (
            <p className="glass-settings__block-hint">✓ GLASS_CONTEXT.md saved in your project folder</p>
          ) : null}
          {memoryStatus === "error" ? (
            <p className="hint hint--error">
              {state.projectMemoryState?.error ?? "Generation failed"}
            </p>
          ) : null}
          <div className="glass-settings__audio-actions">
            <button
              type="button"
              className="gbtn gbtn--primary"
              disabled={!workspace}
              onClick={() => {
                if (memoryStatus === "generating") {
                  window.glass.cancelProjectMemory();
                } else {
                  void window.glass.generateProjectMemory();
                }
              }}
            >
              {memoryStatus === "generating"
                ? "Cancel"
                : memoryStatus === "done"
                  ? "Regenerate"
                  : "Generate GLASS_CONTEXT.md"}
            </button>
          </div>
        </ProviderPipelineCard>

        <section className="glass-settings__block glass-settings__block--compact">
          <p className="glass-settings__block-label">Coder behavior</p>
          <label className="glass-settings__toggle-card">
            <input
              type="checkbox"
              checked={state.glassSettings.screenContextEnabled !== false}
              onChange={(e) => patchCoderSettings({ screenContextEnabled: e.target.checked })}
            />
            <span>
              <strong>Screen-aware context</strong>
              <small>Captures display for active editor file detection</small>
            </span>
          </label>
          <label className="glass-settings__toggle-card">
            <input
              type="checkbox"
              checked={state.glassSettings.voiceCoderEnabled !== false}
              onChange={(e) => patchCoderSettings({ voiceCoderEnabled: e.target.checked })}
            />
            <span>
              <strong>Voice → Glass Coder</strong>
            </span>
          </label>
          <label className="glass-settings__toggle-card">
            <input
              type="checkbox"
              checked={state.glassSettings.coderAutoVerify !== false}
              onChange={(e) => patchCoderSettings({ coderAutoVerify: e.target.checked })}
            />
            <span>
              <strong>Auto-verify after apply</strong>
            </span>
          </label>
          <label className="glass-settings__toggle-card">
            <input
              type="checkbox"
              checked={state.glassSettings.coderAutoReview !== false}
              onChange={(e) => patchCoderSettings({ coderAutoReview: e.target.checked })}
            />
            <span>
              <strong>Auto-review after verify</strong>
            </span>
          </label>
        </section>
      </section>
    </div>
  );
}
