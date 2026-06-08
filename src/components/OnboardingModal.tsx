import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { GlassUserProfile } from "../types/userProfile";
import { completeOnboarding } from "../utils/onboarding";

const QUESTIONS = [
  { key: "name" as const, label: "What's your name?" },
  { key: "usualWork" as const, label: "What kind of work do you usually do?" },
  { key: "currentFocus" as const, label: "What are you focused on right now?" },
];

type Step = 0 | 1 | 2 | "calibrated";

interface OnboardingModalProps {
  onComplete: () => void;
}

export default function OnboardingModal({ onComplete }: OnboardingModalProps) {
  const reduceMotion = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>(0);
  const [answers, setAnswers] = useState<GlassUserProfile>({
    name: "",
    usualWork: "",
    currentFocus: "",
  });
  const [draft, setDraft] = useState("");

  const questionIndex = typeof step === "number" ? step : 2;
  const question = QUESTIONS[questionIndex];

  useEffect(() => {
    if (step === "calibrated") return;
    const saved = answers[question.key];
    setDraft(saved);
    const t = window.setTimeout(() => inputRef.current?.focus(), reduceMotion ? 0 : 120);
    return () => window.clearTimeout(t);
  }, [step, question.key, answers, reduceMotion]);

  const dismissAfterCalibration = useCallback(() => {
    window.setTimeout(() => onComplete(), reduceMotion ? 800 : 4200);
  }, [onComplete, reduceMotion]);

  const handleSkip = () => {
    completeOnboarding();
    onComplete();
  };

  const handleContinue = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;

    const nextAnswers = { ...answers, [question.key]: trimmed };
    setAnswers(nextAnswers);

    if (step === 2) {
      completeOnboarding(nextAnswers);
      setStep("calibrated");
      dismissAfterCalibration();
      return;
    }

    if (typeof step === "number") {
      setStep((step + 1) as 0 | 1 | 2);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && draft.trim()) {
      event.preventDefault();
      handleContinue();
    }
  };

  const motionProps = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 16 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -10 },
        transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const },
      };

  return (
    <div className="glass-onboarding-backdrop" role="presentation">
      <div className="glass-onboarding-ambient" aria-hidden="true" />
      <motion.div
        className="glass-onboarding-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="glass-onboarding-title"
        data-testid="onboarding-modal"
        {...(reduceMotion ? {} : { initial: { opacity: 0, scale: 0.98 }, animate: { opacity: 1, scale: 1 }, transition: { duration: 0.5 } })}
      >
        <span className="ui-led-line glass-onboarding-led" aria-hidden="true" />

        {step === "calibrated" ? (
          <motion.div
            className="glass-onboarding-calibrated"
            data-testid="onboarding-calibrated"
            {...motionProps}
          >
            <div className="glass-onboarding-calibrated-ring" aria-hidden="true" />
            <p className="glass-onboarding-calibrated-eyebrow">Calibration complete</p>
            <h2 id="glass-onboarding-title" className="glass-onboarding-calibrated-title">
              Glass is calibrated.
            </h2>
            <p className="glass-onboarding-calibrated-copy">
              I&apos;ll stay above your work and keep context with you.
            </p>
          </motion.div>
        ) : (
          <motion.div key={String(step)} className="glass-onboarding-step" {...motionProps}>
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
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
