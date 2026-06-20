import { useCallback, useEffect, useState } from "react";
import { send } from "../useGlassState.ts";
import { ensureOverlayInteractive } from "../glassTextInteraction.ts";
import { LANGUAGE_OPTIONS } from "../../shared/glassLocale.ts";
import type { GlassUiLocale } from "../../shared/glassLocale.ts";
import { OverlayGlassFrame } from "../shared/OverlayGlassFrame.tsx";
import "../shared/overlayGlassFrame.css";
import "./LanguagePickerScreen.css";

export function LanguagePickerScreen(): JSX.Element {
  const [selecting, setSelecting] = useState<GlassUiLocale | null>(null);

  const handleSelect = useCallback((locale: GlassUiLocale): void => {
    setSelecting(locale);
    window.glass?.setIgnoreMouse?.(false);
    send({ type: "set-ui-locale", locale });
  }, []);

  // Full-screen interactive — main also syncs via syncLanguagePickerOverlayInteractivity on push().
  useEffect(() => {
    window.glass?.setIgnoreMouse?.(false);
    return () => window.glass?.setIgnoreMouse?.(true);
  }, []);

  return (
    <div className="language-picker" data-testid="glass-language-picker" data-onboarding-interactive="">
      <div className="language-picker__veil" aria-hidden="true" />

      <div className="language-picker__header">
        <h1 className="language-picker__title">SELECT LANGUAGE</h1>
        <p className="language-picker__subtitle">Choose your preferred language to continue</p>
      </div>

      <div className="language-picker__grid">
        {LANGUAGE_OPTIONS.map((option) => (
          <button
            key={option.locale}
            type="button"
            className={`language-picker__card${selecting === option.locale ? " language-picker__card--selected" : ""}`}
            data-testid={`glass-language-${option.locale}`}
            data-onboarding-interactive=""
            onClick={() => handleSelect(option.locale)}
            onPointerDown={(event) => {
              ensureOverlayInteractive();
              window.glass?.setIgnoreMouse?.(false);
              event.currentTarget.focus();
            }}
            disabled={selecting !== null}
          >
            <span className="language-picker__flag" aria-hidden="true">
              {option.flag}
            </span>
            <span className="language-picker__native">{option.nativeLabel}</span>
            <span className="language-picker__english">{option.englishLabel}</span>
          </button>
        ))}
      </div>

      <p className="language-picker__footer">You can change this later in Settings</p>

      <OverlayGlassFrame />
    </div>
  );
}
