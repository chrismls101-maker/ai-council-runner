import { type FormEvent, useEffect, useState } from "react";
import {
  fetchLandingGateStatus,
  isLandingGateUnlockedLocally,
  setLandingGateUnlockedLocally,
  unlockLandingGate,
} from "../../utils/landingGate";
import AnimatedGlassBackground from "./AnimatedGlassBackground";
import GlassButton from "./GlassButton";
import GlassPanel from "./GlassPanel";
import "./glass-landing.css";

type GateState = "loading" | "open" | "locked";

export default function LandingGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>("loading");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const { enabled } = await fetchLandingGateStatus();
        if (cancelled) return;
        if (!enabled || isLandingGateUnlockedLocally()) {
          setState("open");
        } else {
          setState("locked");
        }
      } catch {
        if (!cancelled) setState("open");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const ok = await unlockLandingGate(password);
      if (ok) {
        setLandingGateUnlockedLocally();
        setState("open");
        return;
      }
      setError("Incorrect password");
    } catch {
      setError("Could not verify password. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (state === "loading") {
    return (
      <div className="glass-landing glass-landing-gate" data-testid="glass-landing-gate-loading">
        <AnimatedGlassBackground />
      </div>
    );
  }

  if (state === "locked") {
    return (
      <div className="glass-landing glass-landing-gate" data-testid="glass-landing-gate">
        <AnimatedGlassBackground />
        <div className="glass-landing-gate__shell">
          <GlassPanel className="glass-landing-gate__panel">
            <p className="glass-landing-gate__eyebrow">Private preview</p>
            <h1 className="glass-landing-gate__title">IIVO Glass</h1>
            <form className="glass-landing-gate__form" onSubmit={handleSubmit}>
              <label className="glass-landing-gate__label" htmlFor="landing-gate-password">
                Password
              </label>
              <div className="glass-landing-gate__input-wrap">
                <input
                  id="landing-gate-password"
                  type={showPassword ? "text" : "password"}
                  className="glass-landing-gate__input"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  autoFocus
                  data-testid="landing-gate-password"
                />
                <button
                  type="button"
                  className="glass-landing-gate__reveal"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  data-testid="landing-gate-password-reveal"
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M3 3l18 18M10.58 10.58A2 2 0 0 0 12 15a2 2 0 0 0 1.42-.58M9.88 5.1A10.94 10.94 0 0 1 12 5c5 0 9.27 3.11 11 8-1.02 2.74-2.86 5.02-5.18 6.46M6.61 6.61C4.09 7.92 2.27 10.14 1 13c1.73 4.89 6 8 11 8 1.05 0 2.06-.14 3-.4"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
                    </svg>
                  )}
                </button>
              </div>
              {error ? (
                <p className="glass-landing-gate__error" role="alert">
                  {error}
                </p>
              ) : null}
              <GlassButton
                type="submit"
                disabled={submitting || !password.trim()}
                data-testid="landing-gate-submit"
              >
                Submit
              </GlassButton>
            </form>
          </GlassPanel>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
