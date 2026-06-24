import { useCallback, useEffect, useState } from "react";
import type { ApiKeyMeta } from "../../shared/ipc.ts";
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
import "./ProvidersSettings.css";

function generateCustomId(): string {
  return `key_custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

type ConnectMode = "anthropic" | "openai" | "plain";

interface ProviderRowProps {
  title: string;
  meta: ApiKeyMeta;
  optional?: boolean;
  placeholder: string;
  connectMode: ConnectMode;
  onSaved: () => void;
}

function ProviderKeyRow({
  title,
  meta,
  optional = false,
  placeholder,
  connectMode,
  onSaved,
}: ProviderRowProps): JSX.Element {
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
    <div className="providers-row">
      <div className="providers-row-head">
        <span className="providers-row-title">{title}</span>
        {optional ? <span className="providers-optional">Optional</span> : null}
      </div>
      {!editing ? (
        <div className="providers-row-display">
          <span className="providers-masked">{masked ?? "Not connected"}</span>
          <button type="button" className="providers-update-btn" onClick={() => setEditing(true)}>
            {masked ? "Update" : "Connect"}
          </button>
        </div>
      ) : (
        <div className="providers-edit">
          <input
            className="providers-input"
            type="password"
            placeholder={placeholder}
            value={value}
            autoComplete="off"
            spellCheck={false}
            disabled={loading}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
          />
          <div className="providers-edit-actions">
            <button
              type="button"
              className="providers-save-btn"
              disabled={!value.trim() || loading}
              onClick={() => void handleSave()}
            >
              {loading ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className="providers-cancel-btn"
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
        </div>
      )}
      {error ? <p className="providers-error">{error}</p> : null}
    </div>
  );
}

export function ProvidersSettings(): JSX.Element {
  const [keys, setKeys] = useState<ApiKeyMeta[]>([]);
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const [customKey, setCustomKey] = useState("");
  const [customShortcut, setCustomShortcut] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);
  const [customLoading, setCustomLoading] = useState(false);

  const refreshKeys = useCallback(() => {
    void window.glass.apiKeyList().then((res) => setKeys(res.keys ?? []));
  }, []);

  useEffect(() => {
    refreshKeys();
  }, [refreshKeys]);

  const anthropicMeta = keys.find((k) => k.id === GLASS_ANTHROPIC_KEY_ID) ?? GLASS_ANTHROPIC_KEY_META;
  const openaiMeta = keys.find((k) => k.id === GLASS_OPENAI_KEY_ID) ?? GLASS_OPENAI_KEY_META;

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

  return (
    <div className="summary-box panel__settings providers-settings">
      <p className="section-title">Providers</p>
      <p className="hint">API keys are encrypted on this Mac. Values are never shown after saving.</p>

      <ProviderKeyRow
        title="Anthropic"
        meta={anthropicMeta}
        placeholder="sk-ant-..."
        connectMode="anthropic"
        onSaved={refreshKeys}
      />

      <ProviderKeyRow
        title="OpenAI"
        meta={openaiMeta}
        optional
        placeholder="sk-..."
        connectMode="openai"
        onSaved={refreshKeys}
      />

      {!customOpen ? (
        <button type="button" className="providers-add-btn" onClick={() => setCustomOpen(true)}>
          Add custom provider
        </button>
      ) : (
        <div className="providers-custom">
          <p className="providers-custom-title">Custom provider</p>
          <div className="providers-shortcuts">
            {PROVIDER_SHORTCUT_NAMES.map((name) => (
              <button
                key={name}
                type="button"
                className={`providers-shortcut${customShortcut === name ? " providers-shortcut--active" : ""}`}
                onClick={() => handleCustomShortcut(name)}
              >
                {name}
              </button>
            ))}
          </div>
          <input
            className="providers-input"
            placeholder="Provider name"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
          />
          <input
            className="providers-input"
            placeholder="Base URL (OpenAI-compatible)"
            value={customBaseUrl}
            onChange={(e) => setCustomBaseUrl(e.target.value)}
          />
          <input
            className="providers-input"
            type="password"
            placeholder="API key"
            value={customKey}
            autoComplete="off"
            onChange={(e) => setCustomKey(e.target.value)}
          />
          {customError ? <p className="providers-error">{customError}</p> : null}
          <div className="providers-edit-actions">
            <button
              type="button"
              className="providers-save-btn"
              disabled={!customBaseUrl.trim() || !customKey.trim() || customLoading}
              onClick={() => void handleTestCustom()}
            >
              {customLoading ? "Testing…" : "Test connection"}
            </button>
            <button
              type="button"
              className="providers-cancel-btn"
              onClick={() => {
                setCustomOpen(false);
                setCustomError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
