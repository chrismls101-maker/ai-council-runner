import { useState } from "react";
import type { ApiKeySaveRequest } from "../../shared/ipc.ts";
import { TerminalWelcomeSwarm } from "../dock/TerminalWelcomeSwarm.tsx";
import "./FirstRunSetup.css";

interface FirstRunSetupProps {
  onComplete: () => void;
}

export function FirstRunSetup({ onComplete }: FirstRunSetupProps): JSX.Element {
  const [anthropicKey, setAnthropicKey] = useState("");
  const [deepgramKey, setDeepgramKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = anthropicKey.trim().length > 0 && !saving;

  async function handleGetStarted(): Promise<void> {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const now = Date.now();

      const anthropicReq: ApiKeySaveRequest = {
        meta: {
          id: "key_anthropic_standalone",
          service: "AI Provider",
          label: "Primary API Key",
          environment: "prod",
          createdAt: now,
          lastUsedAt: null,
        },
        value: anthropicKey.trim(),
      };
      const anthropicRes = await window.glass.apiKeySave(anthropicReq);
      if (!anthropicRes.ok) {
        setError(anthropicRes.error ?? "Could not save the API key.");
        setSaving(false);
        return;
      }

      if (deepgramKey.trim()) {
        const deepgramReq: ApiKeySaveRequest = {
          meta: {
            id: "key_deepgram_standalone",
            service: "Deepgram",
            label: "API Key",
            environment: "prod",
            createdAt: now,
            lastUsedAt: null,
          },
          value: deepgramKey.trim(),
        };
        // Best-effort: a Deepgram failure should not block getting started.
        await window.glass.apiKeySave(deepgramReq).catch(() => undefined);
      }

      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed.");
      setSaving(false);
    }
  }

  return (
    <div className="frs-root">
      <div className="frs-substrate-wrap" aria-hidden="true">
        <TerminalWelcomeSwarm atomTint="emerald" />
      </div>

      <div className="frs-content">
        <div className="frs-logo">IIVO Terminal</div>
        <div className="frs-sub">Your shell, with AI built in.</div>
        <span className="ui-led-line frs-brand-led" aria-hidden="true" />
        <p className="frs-why">
          Add your AI provider key to unlock intelligence at the prompt — diagnose failures,
          generate commands, execute intent. Encrypted in Keychain on this Mac.
        </p>

        <div className="frs-form">
        <div>
          <label className="frs-label" htmlFor="frs-ai-key">
            AI API KEY
          </label>
          <div className="frs-input-wrap">
            <input
              id="frs-ai-key"
              className="frs-input"
              type="password"
              placeholder="Paste your API key"
              value={anthropicKey}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setAnthropicKey(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="frs-label" htmlFor="frs-deepgram">
            DEEPGRAM API KEY
          </label>
          <div className="frs-input-wrap">
            <input
              id="frs-deepgram"
              className="frs-input"
              type="password"
              placeholder="Optional"
              value={deepgramKey}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setDeepgramKey(e.target.value)}
            />
          </div>
          <div className="frs-hint frs-hint--voice">
            Optional — powers voice <span className="frs-voice-arrow">→</span> shell.
          </div>
        </div>

        {error ? <div className="frs-hint frs-hint--error">{error}</div> : null}

        <button
          className="frs-btn"
          type="button"
          disabled={!canSubmit}
          onClick={() => void handleGetStarted()}
        >
          {saving ? "CONNECTING…" : "CONNECT"}
        </button>

        <button className="frs-skip" type="button" onClick={onComplete}>
          Skip for now
        </button>
        <div className="frs-hint frs-hint--skip">
          Plain shell works without a key — AI stays off until you connect one.
        </div>
        </div>

        <div className="frs-keychain">Keys are stored securely using macOS Keychain.</div>
      </div>

      <div className="frs-panel-led-wrap" aria-hidden="true">
        <span className="ui-led-line frs-panel-led" />
      </div>
    </div>
  );
}
