import { useCallback, useRef, useState } from "react";
import { isAnthropicKeyFormatValid } from "../../shared/anthropicKeyFormat.ts";
import type { ActivationPresentation } from "../../shared/ipc.ts";
import { ActivationKeyWait } from "./ActivationKeyWait.tsx";

const FORMAT_ERROR =
  "That doesn't look like a valid Anthropic key — it should start with sk-ant-";
const AUTH_ERROR =
  "Anthropic couldn't verify this key. Check that it's active in your console.";

const FORM_DISSOLVE_MS = 520;
const KEY_WAIT_EXIT_MS = 380;
const FORM_RETURN_MS = 420;

type ActivationPhase = "form" | "dissolving" | "key-wait" | "returning";

export function ActivationScreen(): JSX.Element {
  const [phase, setPhase] = useState<ActivationPhase>("form");
  const [apiKey, setApiKey] = useState("");
  const [formatError, setFormatError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const keyInputRef = useRef<HTMLInputElement>(null);
  const dissolveTimerRef = useRef<number | null>(null);

  const presentation: ActivationPresentation = phase === "key-wait" ? "key-wait" : "form";

  const canSubmit = apiKey.trim().length > 0 && !loading;
  const displayError = formatError ?? submitError;

  const validateFormat = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setFormatError(null);
      return;
    }
    if (!isAnthropicKeyFormatValid(trimmed)) {
      setFormatError(FORMAT_ERROR);
      return;
    }
    setFormatError(null);
  }, []);

  async function handleConnect(): Promise<void> {
    if (!canSubmit) return;
    const trimmed = apiKey.trim();
    if (!isAnthropicKeyFormatValid(trimmed)) {
      setFormatError(FORMAT_ERROR);
      return;
    }
    setLoading(true);
    setSubmitError(null);
    try {
      const res = await window.glass.activationConnect(trimmed);
      if (!res.ok) {
        setSubmitError(res.error ?? AUTH_ERROR);
        return;
      }
      setApiKey("");
    } catch {
      setSubmitError(AUTH_ERROR);
    } finally {
      setLoading(false);
    }
  }

  const enterKeyWait = useCallback((): void => {
    if (phase !== "form") return;
    setPhase("dissolving");
    if (dissolveTimerRef.current) window.clearTimeout(dissolveTimerRef.current);
    dissolveTimerRef.current = window.setTimeout(() => {
      dissolveTimerRef.current = null;
      void (async () => {
        const res = await window.glass.activationSetPresentation("key-wait");
        if (res.ok) {
          setPhase("key-wait");
        } else {
          setPhase("form");
        }
      })();
    }, FORM_DISSOLVE_MS);
  }, [phase]);

  const exitKeyWait = useCallback(async (): Promise<void> => {
    if (phase !== "key-wait") return;
    setPhase("returning");
    await new Promise((resolve) => window.setTimeout(resolve, KEY_WAIT_EXIT_MS));
    const res = await window.glass.activationSetPresentation("form");
    if (!res.ok) {
      setPhase("key-wait");
      return;
    }
    setPhase("form");
    await new Promise((resolve) => window.setTimeout(resolve, FORM_RETURN_MS));
    keyInputRef.current?.focus();
  }, [phase]);

  function handleQuit(): void {
    void window.glass.activationQuit();
  }

  const showForm = phase === "form" || phase === "dissolving";
  const showAletheia = phase === "key-wait" || phase === "returning";

  return (
    <div
      className={`activation-root${presentation === "key-wait" ? " activation-root--key-wait" : ""}${phase === "dissolving" ? " activation-root--dissolving" : ""}`}
    >
      <div className="activation-glass" aria-hidden="true">
        <span className="activation-glass__sheen" />
        <span className="activation-glass__streak activation-glass__streak--a" />
        <span className="activation-glass__streak activation-glass__streak--b" />
      </div>

      {showAletheia ? (
        <div
          className={`activation-key-wait-shell${phase === "returning" ? " activation-key-wait-shell--exiting" : ""}`}
        >
          {phase === "key-wait" || phase === "returning" ? (
            <ActivationKeyWait onReady={exitKeyWait} />
          ) : null}
        </div>
      ) : null}

      {showForm ? (
        <div
          className={`activation-stage${phase === "dissolving" ? " activation-stage--dissolving" : ""}`}
        >
          <div className="activation-panel">
            <header className="activation-header">
              <span className="activation-eyebrow">G L A S S</span>
              <h1 className="activation-heading">Connect your AI</h1>
              <p className="activation-lead">
                Glass runs on Anthropic&apos;s Claude. Enter your API key to activate — usage is
                billed directly to your Anthropic account.
              </p>
            </header>

            <div className="activation-key-section">
              <label className="activation-label" htmlFor="activation-key">
                Anthropic API key
              </label>
              <input
                ref={keyInputRef}
                id="activation-key"
                className={`activation-input${displayError ? " activation-input--error" : ""}`}
                type="password"
                placeholder="sk-ant-..."
                value={apiKey}
                autoComplete="off"
                spellCheck={false}
                disabled={loading || phase === "dissolving"}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  if (formatError) setFormatError(null);
                  if (submitError) setSubmitError(null);
                }}
                onBlur={(e) => validateFormat(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canSubmit) {
                    e.preventDefault();
                    void handleConnect();
                  }
                }}
              />
              <button
                type="button"
                className="activation-key-link"
                disabled={phase === "dissolving"}
                onClick={enterKeyWait}
              >
                <span className="activation-key-link__arrow" aria-hidden="true">
                  →
                </span>
                <span>
                  Get a key at console.anthropic.com
                  <span className="activation-key-link__hint"> (takes about 2 minutes)</span>
                </span>
              </button>
              <p
                className={`activation-error${displayError ? " activation-error--visible" : ""}`}
                aria-live="polite"
              >
                {displayError ?? "\u00a0"}
              </p>
              <p
                className={`activation-status${loading ? " activation-status--visible" : ""}`}
                aria-live="polite"
              >
                {loading ? "Checking your key with Anthropic" : "\u00a0"}
              </p>
            </div>

            <footer className="activation-footer">
              <button
                type="button"
                className="activation-submit"
                disabled={!canSubmit || phase === "dissolving"}
                onClick={() => void handleConnect()}
              >
                {loading ? "Connecting…" : "Connect and continue"}
              </button>
              <p className="activation-footnote">
                Your Anthropic key powers the core Glass experience. You can add OpenAI and other
                providers in Settings after activation.
              </p>
            </footer>
          </div>

          <button type="button" className="activation-quit" onClick={handleQuit}>
            Quit Glass
          </button>
        </div>
      ) : null}
    </div>
  );
}
