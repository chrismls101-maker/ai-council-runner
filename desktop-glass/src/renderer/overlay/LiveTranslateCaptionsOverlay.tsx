import { send } from "../useGlassState.ts";
import {
  LIVE_TRANSLATE_LANGUAGE_LABELS,
  type LiveTranslateTargetLanguage,
} from "../../shared/liveTranslateTypes.ts";
import { formatCaptionForOverlay } from "../../shared/liveTranslateCaptions.ts";
import type { LiveTranslateRuntimeState } from "../../shared/liveTranslateTypes.ts";

const TARGET_LANGUAGES: LiveTranslateTargetLanguage[] = ["en", "es", "pt", "fr", "de", "it"];

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
    original:
      runtime.detectedSourceLanguage && runtime.detectedSourceLanguage !== "auto"
        ? LIVE_TRANSLATE_LANGUAGE_LABELS[runtime.detectedSourceLanguage]
        : "Original",
    translated: LIVE_TRANSLATE_LANGUAGE_LABELS[runtime.config.targetLanguage],
  });

  if (!formatted) return null;

  return (
    <div
      className="live-translate-captions"
      data-testid="glass-live-translate-captions"
      onMouseEnter={enterInteractive}
      onMouseLeave={leaveInteractive}
    >
      <div className="live-translate-captions__inner">
        <div className="live-translate-captions__meta" data-testid="glass-translate-language-pair">
          {runtime.captions.languagePairLabel}
          {runtime.languageUncertain ? " · detecting…" : ""}
        </div>
        {formatted.secondary ? (
          <p className="live-translate-captions__original" data-testid="glass-translate-caption-original">
            {formatted.secondary}
          </p>
        ) : null}
        <p className="live-translate-captions__text" data-testid="glass-translate-caption-text">
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
