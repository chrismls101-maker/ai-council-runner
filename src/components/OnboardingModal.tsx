import { useState, type ReactNode } from "react";
import { withIivoWordmark } from "../utils/brandText";
import { completeOnboarding } from "../utils/onboarding";

const SCREENS: { title: ReactNode; copy: ReactNode }[] = [
  {
    title: withIivoWordmark("What is IIVO?", "onb-1-title"),
    copy: withIivoWordmark(
      "IIVO is an AI decision engine. Ask one important question and IIVO decides whether to answer directly, search for verified information, or run a specialist council.",
      "onb-1-copy",
    ),
  },
  {
    title: withIivoWordmark("How IIVO works", "onb-2-title"),
    copy: withIivoWordmark(
      "Simple questions use one model. Serious decisions can use strategy, critique, research, execution planning, and final judgment. IIVO shows sources, cost, trace, and memory when relevant.",
      "onb-2-copy",
    ),
  },
  {
    title: "Your workspace",
    copy: withIivoWordmark(
      "IIVO can remember decisions, track outcomes, compare answers in Benchmark Lab, and show credit usage. You stay in control of memory, exports, and deletes.",
      "onb-3-copy",
    ),
  },
];

interface OnboardingModalProps {
  onComplete: () => void;
  onOpenSettings: () => void;
}

export default function OnboardingModal({ onComplete, onOpenSettings }: OnboardingModalProps) {
  const [step, setStep] = useState(0);
  const screen = SCREENS[step];
  const isLast = step === SCREENS.length - 1;

  const dismiss = () => {
    completeOnboarding();
    onComplete();
  };

  const handleOpenSettings = () => {
    dismiss();
    onOpenSettings();
  };

  return (
    <div className="onboarding-backdrop" role="presentation">
      <div
        className="onboarding-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        data-testid="onboarding-modal"
      >
        <div className="onboarding-progress" aria-hidden="true">
          {SCREENS.map((_, i) => (
            <span key={i} className={`onboarding-dot${i === step ? " active" : ""}`} />
          ))}
        </div>
        <h2 id="onboarding-title">{screen.title}</h2>
        <p className="onboarding-copy">{screen.copy}</p>
        <div className="onboarding-actions">
          <div className="onboarding-actions-secondary">
            <button
              type="button"
              className="btn ghost small"
              onClick={dismiss}
              data-testid="onboarding-skip"
            >
              Skip
            </button>
            <button
              type="button"
              className="btn ghost small"
              onClick={handleOpenSettings}
              data-testid="onboarding-open-settings"
            >
              Open Settings
            </button>
          </div>
          {isLast ? (
            <button
              type="button"
              className="btn primary small onboarding-cta"
              onClick={dismiss}
              data-testid="onboarding-get-started"
              autoFocus
            >
              Get started
            </button>
          ) : (
            <button
              type="button"
              className="btn primary small onboarding-cta"
              onClick={() => setStep((s) => s + 1)}
              data-testid="onboarding-next"
              autoFocus
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
