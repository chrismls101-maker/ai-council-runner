/**
 * ConsentStep — L2.4 Glass Setup Consent Checkpoints
 *
 * Renders four required consent checkboxes during first-run Glass setup:
 *   1. Microphone access   (consentMicAck)
 *   2. Screen capture      (consentScreenAck)
 *   3. System audio        (consentRecordingAck)
 *   4. Terms of Service    (consentTosAck)
 *
 * All four must be checked before the user can proceed. On proceed the
 * component fires `send({ type: "persist-consent-flags", flags })` to
 * persist flags through the main process (glassOnboardingStore).
 *
 * Plug-in point in Overlay.tsx: render <ConsentStep onComplete={...} />
 * before <SortingHatScreen /> in the first-run onboarding branch — i.e.
 * after language is chosen (`chosenUiLocale` truthy) but before the Sorting
 * Hat manifests. The parent branch should gate on
 * `!allConsentGiven(state.consentState)` to suppress ConsentStep for users
 * who have already accepted.
 *
 * IMPORTANT: Legal copy below is intentionally placeholder.
 * All [LEGAL_COPY_PLACEHOLDER] blocks MUST be replaced by attorney-reviewed
 * text before public release.
 */

import { useState, useCallback, useEffect } from "react";
import { send } from "../useGlassState.ts";
import "../styles/glass-onboarding.css";
import "./ConsentStep.css";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export interface ConsentFlags {
  consentMicAck: boolean;
  consentScreenAck: boolean;
  consentRecordingAck: boolean;
  consentTosAck: boolean;
}

/** True when all four consent flags are checked. */
export function allConsentGiven(flags: Partial<ConsentFlags> | null | undefined): boolean {
  if (!flags) return false;
  return (
    flags.consentMicAck === true &&
    flags.consentScreenAck === true &&
    flags.consentRecordingAck === true &&
    flags.consentTosAck === true
  );
}

// ---------------------------------------------------------------------------
// Sub-component: single checkbox row
// ---------------------------------------------------------------------------

interface CheckboxRowProps {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
}

function CheckboxRow({ id, checked, onChange, children }: CheckboxRowProps): JSX.Element {
  return (
    <label className="consent-step-row" htmlFor={id} data-checked={checked}>
      <span className="consent-step-checkbox-wrap">
        <input
          id={id}
          type="checkbox"
          className="consent-step-checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="consent-step-checkmark" aria-hidden="true" />
      </span>
      <span className="consent-step-row-text">{children}</span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ConsentStepProps {
  /**
   * Initial consent state loaded from GlassState — lets user resume with
   * previously checked boxes still checked (reversibility requirement).
   */
  initialFlags?: Partial<ConsentFlags>;
  /** Called after the user clicks "I agree" with all boxes checked. */
  onComplete: () => void;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ConsentStep({ initialFlags, onComplete }: ConsentStepProps): JSX.Element {
  const [flags, setFlags] = useState<ConsentFlags>({
    consentMicAck: initialFlags?.consentMicAck ?? false,
    consentScreenAck: initialFlags?.consentScreenAck ?? false,
    consentRecordingAck: initialFlags?.consentRecordingAck ?? false,
    consentTosAck: initialFlags?.consentTosAck ?? false,
  });

  // Persist each flag change immediately so state is durable even if user
  // closes before completing the final step.
  const handleChange = useCallback(
    (key: keyof ConsentFlags, value: boolean): void => {
      const next = { ...flags, [key]: value };
      setFlags(next);
      send({ type: "persist-consent-flags", flags: { [key]: value } });
    },
    [flags],
  );

  const canProceed = allConsentGiven(flags);

  const handleProceed = (): void => {
    if (!canProceed) return;
    // Persist the full set one final time as an atomic checkpoint, then
    // call onComplete to advance the onboarding flow.
    send({ type: "persist-consent-flags", flags });
    onComplete();
  };

  // ── Keyboard: Enter when all checked → proceed ────────────────────────────
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Enter" && canProceed) {
        event.preventDefault();
        handleProceed();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canProceed, flags]);

  return (
    <div className="glass-onboarding-backdrop" role="presentation">
      <div className="glass-onboarding-ambient" aria-hidden="true" />
      <div
        className="glass-onboarding-card consent-step-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-step-title"
        data-testid="consent-step-modal"
      >
        <span className="ui-led-line glass-onboarding-led" aria-hidden="true" />

        <div className="glass-onboarding-step consent-step-content">
          <p className="glass-onboarding-kicker">Glass Setup</p>
          <h2
            id="consent-step-title"
            className="glass-onboarding-question consent-step-heading"
          >
            Before we begin
          </h2>
          <p className="consent-step-intro">
            Glass uses a few system capabilities to assist you. Please review and
            confirm each below.
          </p>

          <div
            className="consent-step-rows"
            role="group"
            aria-label="Required consent checkboxes"
          >
            {/* 1 — Microphone */}
            <CheckboxRow
              id="consent-mic"
              checked={flags.consentMicAck}
              onChange={(v) => handleChange("consentMicAck", v)}
            >
              <strong>Microphone access</strong>
              <br />
              <span className="consent-step-detail">
                Glass uses your microphone for voice sessions.{" "}
                {/* [LEGAL_COPY_PLACEHOLDER: attorney-reviewed mic disclosure] */}
                [LEGAL_COPY_PLACEHOLDER]
              </span>
            </CheckboxRow>

            {/* 2 — Screen capture */}
            <CheckboxRow
              id="consent-screen"
              checked={flags.consentScreenAck}
              onChange={(v) => handleChange("consentScreenAck", v)}
            >
              <strong>Screen capture</strong>
              <br />
              <span className="consent-step-detail">
                Glass uses screen capture to understand your context.{" "}
                {/* [LEGAL_COPY_PLACEHOLDER: attorney-reviewed screen disclosure] */}
                [LEGAL_COPY_PLACEHOLDER]
              </span>
            </CheckboxRow>

            {/* 3 — System audio / recording */}
            <CheckboxRow
              id="consent-recording"
              checked={flags.consentRecordingAck}
              onChange={(v) => handleChange("consentRecordingAck", v)}
            >
              <strong>System audio capture</strong>
              <br />
              <span className="consent-step-detail">
                Glass can capture system audio to assist with meetings and ambient
                context.{" "}
                {/* [LEGAL_COPY_PLACEHOLDER: attorney-reviewed recording disclosure] */}
                [LEGAL_COPY_PLACEHOLDER]
              </span>
            </CheckboxRow>

            {/* 4 — TOS */}
            <CheckboxRow
              id="consent-tos"
              checked={flags.consentTosAck}
              onChange={(v) => handleChange("consentTosAck", v)}
            >
              <strong>Terms of Service &amp; Privacy Policy</strong>
              <br />
              <span className="consent-step-detail">
                I agree to the Terms of Service and Privacy Policy.{" "}
                {/* [LEGAL_COPY_PLACEHOLDER: links to ToS + PP documents] */}
                [LEGAL_COPY_PLACEHOLDER]
              </span>
            </CheckboxRow>
          </div>

          <div className="glass-onboarding-actions consent-step-actions">
            <span className="consent-step-required-note" aria-live="polite">
              {canProceed ? "" : "All items required to continue"}
            </span>
            <button
              type="button"
              className="glass-onboarding-continue"
              onClick={handleProceed}
              disabled={!canProceed}
              data-testid="consent-step-proceed"
            >
              I agree — Continue
            </button>
          </div>
        </div>
      </div>
      <p className="glass-onboarding-rescue" data-testid="consent-step-rescue-hint">
        Stuck? Press <kbd>⌘⌥⎋</kbd> to Force Quit
      </p>
    </div>
  );
}
