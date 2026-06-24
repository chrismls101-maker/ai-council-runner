import { useCallback, useEffect, useState } from "react";
import type { ApiKeyMeta } from "../../shared/ipc.ts";
import {
  GLASS_ANTHROPIC_KEY_ID,
  GLASS_OPENAI_KEY_ID,
} from "../../shared/glassProviderKeys.ts";
import { isAnthropicKeyFormatValid } from "../../shared/anthropicKeyFormat.ts";
import { isOpenAiKeyFormatValid } from "../../shared/openaiKeyFormat.ts";
import {
  PROVIDER_BASE_URL_SHORTCUTS,
  PROVIDER_SHORTCUT_NAMES,
} from "../../shared/providerPresets.ts";

type SettingsSection = "providers" | "context" | "shortcuts" | "about";

function providerDotClass(connected: boolean, optional = false): string {
  if (connected) return "glass-settings__dot glass-settings__dot--ok";
  if (optional) return "glass-settings__dot glass-settings__dot--muted";
  return "glass-settings__dot glass-settings__dot--error";
}

function generateCustomId(): string {
  return `key_custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function GlassSettings(): JSX.Element {
  const [section, setSection] = useState<SettingsSection>("providers");
  const [anthropicMasked, setAnthropicMasked] = useState<string | null>(null);
  const [openAiMasked, setOpenAiMasked] = useState<string | null>(null);
  const [anthropicKey, setAnthropicKey] = useState("");
  const [openAiKey, setOpenAiKey] = useState("");
  const [anthropicLoading, setAnthropicLoading] = useState(false);
  const [openAiLoading, setOpenAiLoading] = useState(false);
  const [anthropicError, setAnthropicError] = useState<string | null>(null);
  const [openAiError, setOpenAiError] = useState<string | null>(null);
  const [screenContextEnabled, setScreenContextEnabled] = useState(true);
  const [appVersion, setAppVersion] = useState("—");
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const [customKey, setCustomKey] = useState("");
  const [customShortcut, setCustomShortcut] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);
  const [customLoading, setCustomLoading] = useState(false);

  const refreshMasked = useCallback(async (): Promise<void> => {
    const [anthropic, openai] = await Promise.all([
      window.glass.apiKeyGetMasked(GLASS_ANTHROPIC_KEY_ID),
      window.glass.apiKeyGetMasked(GLASS_OPENAI_KEY_ID),
    ]);
    setAnthropicMasked(anthropic.masked);
    setOpenAiMasked(openai.masked);
  }, []);

  useEffect(() => {
    void refreshMasked();
    void window.glass.getAppVersion().then(setAppVersion);
    void window.glass.getState().then((state) => {
      setScreenContextEnabled(state.glassSettings.screenContextEnabled !== false);
    });
    return window.glass.onState((state) => {
      setScreenContextEnabled(state.glassSettings.screenContextEnabled !== false);
    });
  }, [refreshMasked]);

  const handleAnthropicReconnect = useCallback(async (): Promise<void> => {
    const trimmed = anthropicKey.trim();
    if (!isAnthropicKeyFormatValid(trimmed)) {
      setAnthropicError("Anthropic keys start with sk-ant-");
      return;
    }
    setAnthropicLoading(true);
    setAnthropicError(null);
    try {
      const res = await window.glass.anthropicKeyConnect(trimmed);
      if (!res.ok) {
        setAnthropicError(res.error ?? "Key not recognized — check it and try again");
        return;
      }
      setAnthropicKey("");
      await refreshMasked();
    } catch {
      setAnthropicError("Could not connect key.");
    } finally {
      setAnthropicLoading(false);
    }
  }, [anthropicKey, refreshMasked]);

  const handleOpenAiConnect = useCallback(async (): Promise<void> => {
    const trimmed = openAiKey.trim();
    if (!isOpenAiKeyFormatValid(trimmed)) {
      setOpenAiError("OpenAI keys start with sk-");
      return;
    }
    setOpenAiLoading(true);
    setOpenAiError(null);
    try {
      const res = await window.glass.openaiKeyConnect(trimmed);
      if (!res.ok) {
        setOpenAiError(res.error ?? "Key not recognized — check it and try again");
        return;
      }
      setOpenAiKey("");
      await refreshMasked();
    } catch {
      setOpenAiError("Could not connect key.");
    } finally {
      setOpenAiLoading(false);
    }
  }, [openAiKey, refreshMasked]);

  const handleOpenAiDisconnect = useCallback(async (): Promise<void> => {
    setOpenAiLoading(true);
    setOpenAiError(null);
    try {
      await window.glass.apiKeyDelete(GLASS_OPENAI_KEY_ID);
      await refreshMasked();
    } catch {
      setOpenAiError("Could not disconnect.");
    } finally {
      setOpenAiLoading(false);
    }
  }, [refreshMasked]);

  const handleScreenContextToggle = useCallback((enabled: boolean): void => {
    setScreenContextEnabled(enabled);
    window.glass.send({
      type: "set-glass-coder-settings",
      patch: { screenContextEnabled: enabled },
    });
  }, []);

  const handleCustomShortcut = useCallback((name: string): void => {
    setCustomShortcut(name);
    setCustomName(name);
    setCustomBaseUrl(PROVIDER_BASE_URL_SHORTCUTS[name] ?? "");
  }, []);

  const handleTestCustom = useCallback(async (): Promise<void> => {
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
    } catch {
      setCustomError("Connection failed.");
    } finally {
      setCustomLoading(false);
    }
  }, [customBaseUrl, customKey, customName]);

  const handleClose = useCallback((): void => {
    window.glass.closeSettings();
  }, []);

  const anthropicConnected = Boolean(anthropicMasked);
  const openAiConnected = Boolean(openAiMasked);

  return (
    <div className="glass-settings" data-testid="glass-settings">
      <header className="glass-settings__titlebar">
        <span className="glass-settings__title">Settings</span>
        <button
          type="button"
          className="glass-settings__close"
          aria-label="Close settings"
          onClick={handleClose}
        >
          ×
        </button>
      </header>

      <div className="glass-settings__body">
        <nav className="glass-settings__nav" aria-label="Settings sections">
          {(
            [
              ["providers", "Providers"],
              ["context", "Context"],
              ["shortcuts", "Shortcuts"],
              ["about", "About"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`glass-settings__nav-item${section === id ? " glass-settings__nav-item--active" : ""}`}
              onClick={() => setSection(id)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="glass-settings__content">
          {section === "providers" ? (
            <div className="glass-settings__section">
              <h2 className="glass-settings__section-title">Providers</h2>
              <p className="glass-settings__hint">
                API keys are encrypted on this Mac. Values are never shown after saving.
              </p>

              <div className="glass-settings__row">
                <span className={providerDotClass(anthropicConnected)} aria-hidden="true" />
                <div className="glass-settings__row-main">
                  <div className="glass-settings__row-head">
                    <span className="glass-settings__row-label">Anthropic</span>
                    <span className="glass-settings__row-status">
                      {anthropicConnected ? "Connected" : "Not connected"}
                    </span>
                  </div>
                  {anthropicMasked ? (
                    <span className="glass-settings__masked">{anthropicMasked}</span>
                  ) : null}
                  <div className="glass-settings__row-actions">
                    <input
                      className="glass-settings__input"
                      type="password"
                      placeholder="sk-ant-..."
                      value={anthropicKey}
                      autoComplete="off"
                      spellCheck={false}
                      disabled={anthropicLoading}
                      onChange={(e) => {
                        setAnthropicKey(e.target.value);
                        if (anthropicError) setAnthropicError(null);
                      }}
                    />
                    <button
                      type="button"
                      className="glass-settings__btn"
                      disabled={!anthropicKey.trim() || anthropicLoading}
                      onClick={() => void handleAnthropicReconnect()}
                    >
                      {anthropicLoading ? "Connecting…" : "Re-connect"}
                    </button>
                  </div>
                  {anthropicError ? <p className="glass-settings__error">{anthropicError}</p> : null}
                </div>
              </div>

              <div className="glass-settings__row">
                <span className={providerDotClass(openAiConnected, true)} aria-hidden="true" />
                <div className="glass-settings__row-main">
                  <div className="glass-settings__row-head">
                    <span className="glass-settings__row-label">OpenAI</span>
                    <span className="glass-settings__row-status">
                      {openAiConnected ? "Connected" : "Not connected"}
                    </span>
                  </div>
                  {openAiMasked ? (
                    <span className="glass-settings__masked">{openAiMasked}</span>
                  ) : null}
                  <div className="glass-settings__row-actions">
                    <input
                      className="glass-settings__input"
                      type="password"
                      placeholder="sk-..."
                      value={openAiKey}
                      autoComplete="off"
                      spellCheck={false}
                      disabled={openAiLoading}
                      onChange={(e) => {
                        setOpenAiKey(e.target.value);
                        if (openAiError) setOpenAiError(null);
                      }}
                    />
                    {openAiConnected ? (
                      <button
                        type="button"
                        className="glass-settings__btn glass-settings__btn--ghost"
                        disabled={openAiLoading}
                        onClick={() => void handleOpenAiDisconnect()}
                      >
                        Disconnect
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="glass-settings__btn"
                        disabled={!openAiKey.trim() || openAiLoading}
                        onClick={() => void handleOpenAiConnect()}
                      >
                        {openAiLoading ? "Connecting…" : "Connect"}
                      </button>
                    )}
                  </div>
                  {openAiError ? <p className="glass-settings__error">{openAiError}</p> : null}
                </div>
              </div>

              {!customOpen ? (
                <button
                  type="button"
                  className="glass-settings__link-btn"
                  onClick={() => setCustomOpen(true)}
                >
                  Add custom provider
                </button>
              ) : (
                <div className="glass-settings__custom">
                  <p className="glass-settings__custom-title">Custom provider</p>
                  <div className="glass-settings__shortcut-row">
                    {PROVIDER_SHORTCUT_NAMES.map((name) => (
                      <button
                        key={name}
                        type="button"
                        className={`glass-settings__shortcut${customShortcut === name ? " glass-settings__shortcut--active" : ""}`}
                        onClick={() => handleCustomShortcut(name)}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                  <input
                    className="glass-settings__input glass-settings__input--block"
                    placeholder="Provider name"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                  />
                  <input
                    className="glass-settings__input glass-settings__input--block"
                    placeholder="Base URL"
                    value={customBaseUrl}
                    onChange={(e) => setCustomBaseUrl(e.target.value)}
                  />
                  <input
                    className="glass-settings__input glass-settings__input--block"
                    type="password"
                    placeholder="API key"
                    value={customKey}
                    autoComplete="off"
                    onChange={(e) => setCustomKey(e.target.value)}
                  />
                  <div className="glass-settings__row-actions">
                    <button
                      type="button"
                      className="glass-settings__btn"
                      disabled={customLoading || !customBaseUrl.trim() || !customKey.trim()}
                      onClick={() => void handleTestCustom()}
                    >
                      {customLoading ? "Testing…" : "Test connection"}
                    </button>
                    <button
                      type="button"
                      className="glass-settings__btn glass-settings__btn--ghost"
                      disabled={customLoading}
                      onClick={() => {
                        setCustomOpen(false);
                        setCustomError(null);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                  {customError ? <p className="glass-settings__error">{customError}</p> : null}
                </div>
              )}
            </div>
          ) : null}

          {section === "context" ? (
            <div className="glass-settings__section">
              <h2 className="glass-settings__section-title">Context</h2>
              <label className="glass-settings__toggle-row">
                <input
                  type="checkbox"
                  checked={screenContextEnabled}
                  onChange={(e) => handleScreenContextToggle(e.target.checked)}
                />
                <span>Enable screen context</span>
              </label>
              <p className="glass-settings__hint">
                Glass reads your screen with your permission to give IIVO live context.
              </p>
              <p className="glass-settings__privacy">
                Screen content is never stored or sent to AI without your action.
              </p>
            </div>
          ) : null}

          {section === "shortcuts" ? (
            <div className="glass-settings__section">
              <h2 className="glass-settings__section-title">Shortcuts</h2>
              <p className="glass-settings__hint">Coming soon: editable shortcuts</p>
              <ul className="glass-settings__shortcut-list">
                <li>
                  <kbd>⌘⇧Space</kbd>
                  <span>Open command bar</span>
                </li>
                <li>
                  <kbd>⌘⇧D</kbd>
                  <span>Open dashboard</span>
                </li>
              </ul>
            </div>
          ) : null}

          {section === "about" ? (
            <div className="glass-settings__section">
              <h2 className="glass-settings__section-title">About</h2>
              <div className="glass-settings__about-row">
                <span className="glass-settings__about-label">App</span>
                <span>Glass</span>
              </div>
              <div className="glass-settings__about-row">
                <span className="glass-settings__about-label">Version</span>
                <span>{appVersion}</span>
              </div>
              <div className="glass-settings__about-links">
                <button
                  type="button"
                  className="glass-settings__link-btn"
                  onClick={() =>
                    void window.glass.settingsOpenExternal("https://console.anthropic.com")
                  }
                >
                  console.anthropic.com
                </button>
                <button
                  type="button"
                  className="glass-settings__link-btn"
                  onClick={() => void window.glass.settingsOpenExternal("https://iivo.ai/privacy")}
                >
                  Privacy Policy
                </button>
              </div>
              <button
                type="button"
                className="glass-settings__btn glass-settings__btn--danger"
                onClick={() => window.glass.send({ type: "glass-quit" })}
              >
                Quit Glass
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
