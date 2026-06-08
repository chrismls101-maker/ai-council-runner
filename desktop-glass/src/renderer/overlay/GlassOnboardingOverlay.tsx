import { useEffect, useRef, useState } from "react";
import { GLASS_ONBOARDING_QUESTIONS } from "../../shared/glassOnboarding.ts";
import type { GlassUserProfile } from "../../shared/glassUserProfile.ts";
import { send } from "../useGlassState.ts";
import "../styles/glass-onboarding.css";

type Step = 0 | 1 | 2 | "calibrated";

export function GlassOnboardingOverlay(): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [step, setStep] = useState<Step>(0);
  const [answers, setAnswers] = useState<GlassUserProfile>({
    name: "",
    usualWork: "",
    currentFocus: "",
  });
  const [draft, setDraft] = useState("");

  const questionIndex = typeof step === "number" ? step : 2;
  const question = GLASS_ONBOARDING_QUESTIONS[questionIndex];

  useEffect(() => {
    if (step === "calibrated") return;
    const saved = answers[question.key];
    setDraft(saved);
    const t = window.setTimeout(() => inputRef.current?.focus(), reduceMotion ? 0 : 120);
    return () => window.clearTimeout(t);
  }, [step, question.key, answers, reduceMotion]);

  const handleSkip = (): void => {
    send({ type: "skip-glass-onboarding" });
  };

  const handleContinue = (): void => {
    const trimmed = draft.trim();
    if (!trimmed) return;

    const nextAnswers = { ...answers, [question.key]: trimmed };
    setAnswers(nextAnswers);

    if (step === 2) {
      setAnswers(nextAnswers);
      setStep("calibrated");
      window.setTimeout(() => {
        send({ type: "complete-glass-onboarding", profile: nextAnswers });
      }, reduceMotion ? 800 : 3200);
      return;
    }

    if (typeof step === "number") {
      setStep((step + 1) as 0 | 1 | 2);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Enter" && draft.trim()) {
      event.preventDefault();
      handleContinue();
    }
  };

  return (
    <div className="glass-onboarding-backdrop" role="presentation">
      <div className="glass-onboarding-ambient" aria-hidden="true" />
      <div
        className="glass-onboarding-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="glass-onboarding-title"
        data-testid="onboarding-modal"
      >
        <span className="ui-led-line glass-onboarding-led" aria-hidden="true" />

        {step === "calibrated" ? (
          <div className="glass-onboarding-calibrated" data-testid="onboarding-calibrated">
            <div className="glass-onboarding-calibrated-ring" aria-hidden="true" />
            <p className="glass-onboarding-calibrated-eyebrow">Calibration complete</p>
            <h2 id="glass-onboarding-title" className="glass-onboarding-calibrated-title">
              Glass is calibrated.
            </h2>
            <p className="glass-onboarding-calibrated-copy">
              I&apos;ll stay above your work and keep context with you.
            </p>
          </div>
        ) : (
          <div className="glass-onboarding-step">
            <p className="glass-onboarding-kicker">Calibrating to you</p>
            <h2 id="glass-onboarding-title" className="glass-onboarding-question">
              {question.label}
            </h2>
            <label className="glass-onboarding-field" htmlFor="glass-onboarding-input">
              <input
                ref={inputRef}
                id="glass-onboarding-input"
                type="text"
                className="glass-onboarding-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your answer…"
                autoComplete="off"
                aria-labelledby="glass-onboarding-title"
                data-testid={`onboarding-input-${question.key}`}
              />
            </label>
            <div className="glass-onboarding-actions">
              <button
                type="button"
                className="glass-onboarding-skip"
                onClick={handleSkip}
                data-testid="onboarding-skip"
              >
                Skip
              </button>
              <button
                type="button"
                className="glass-onboarding-continue"
                onClick={handleContinue}
                disabled={!draft.trim()}
                data-testid={step === 2 ? "onboarding-finish" : "onboarding-next"}
              >
                {step === 2 ? "Calibrate" : "Continue"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
