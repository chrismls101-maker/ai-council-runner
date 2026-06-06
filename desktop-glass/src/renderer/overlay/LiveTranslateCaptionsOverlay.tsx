import { send } from "../useGlassState.ts";
import {
  LIVE_TRANSLATE_LANGUAGE_CODES,
  liveTranslateOverlayPairLabel,
  type LiveTranslateTargetLanguage,
} from "../../shared/liveTranslateTypes.ts";
import { formatCaptionForOverlay, shortLanguageCode } from "../../shared/liveTranslateCaptions.ts";
import type { LiveTranslateRuntimeState } from "../../shared/liveTranslateTypes.ts";

/** Bottom-center live translation captions — max ~2 lines, non-blocking. */
export function LiveTranslateCaptionsOverlay({
  runtime,
  enterInteractive,
  leaveInteractive,
}: {
  runtime: LiveTranslateRuntimeState;
  enterInteractive?: () => void;
  leaveInteractive?: () => void;
}): JSX.Element | null {
  if (!runtime.active || !runtime.config.enabled || !runtime.captionsVisible) return null;
  if (runtime.config.captionPosition === "panel") return null;

  const line = runtime.captions.current;
  const formatted = formatCaptionForOverlay(line, runtime.config.displayMode, {
    originalCode: shortLanguageCode(runtime.detectedSourceLanguage, "Original"),
    translatedCode:
      LIVE_TRANSLATE_LANGUAGE_CODES[runtime.config.targetLanguage as LiveTranslateTargetLanguage] ??
      "Translation",
  });

  if (!formatted) return null;

  const pairLabel = liveTranslateOverlayPairLabel(
    runtime.config.sourceLanguage,
    runtime.config.targetLanguage,
    runtime.detectedSourceLanguage,
  );

  return (
    <div
      className="live-translate-captions"
      data-testid="glass-live-translate-captions"
      onMouseEnter={enterInteractive}
      onMouseLeave={leaveInteractive}
    >
      <div
        className={`live-translate-captions__inner${
          formatted.interim ? " live-translate-captions__inner--interim" : ""
        }`}
      >
        <div className="live-translate-captions__meta" data-testid="glass-translate-language-pair">
          {pairLabel}
          {runtime.languageUncertain ? " · detecting…" : ""}
        </div>
        {formatted.secondary && runtime.config.displayMode === "original_and_translation" ? (
          <p
            className={`live-translate-captions__original${
              formatted.interim ? " live-translate-captions__original--interim" : ""
            }`}
            data-testid="glass-translate-caption-original"
          >
            {formatted.secondary}
          </p>
        ) : formatted.secondary ? (
          <p className="live-translate-captions__note">{formatted.secondary}</p>
        ) : null}
        <p
          className={`live-translate-captions__text${
            formatted.interim ? " live-translate-captions__text--interim" : ""
          }`}
          data-testid="glass-translate-caption-text"
          data-interim={formatted.interim ? "true" : "false"}
        >
          {formatted.primary}
        </p>
        {formatted.note ? (
          <p className="live-translate-captions__note">{formatted.note}</p>
        ) : null}
      </div>
      <button
        type="button"
        className="live-translate-captions__hide"
        data-testid="glass-translate-hide-captions"
        aria-label="Hide captions"
        onClick={() => send({ type: "translate-set-captions-visible", visible: false })}
      >
        Hide
      </button>
    </div>
  );
}
