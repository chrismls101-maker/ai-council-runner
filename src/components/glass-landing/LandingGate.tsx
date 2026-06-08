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
              <input
                id="landing-gate-password"
                type="password"
                className="glass-landing-gate__input"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                autoFocus
                data-testid="landing-gate-password"
              />
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
