/** Supported UI / onboarding locales for Glass first-run. */
export type GlassUiLocale = "en" | "es" | "zh";

export const GLASS_UI_LOCALES: GlassUiLocale[] = ["en", "es", "zh"];

export const DEFAULT_GLASS_UI_LOCALE: GlassUiLocale = "en";

export function parseUiLocale(value: unknown): GlassUiLocale {
  return value === "es" || value === "zh" || value === "en" ? value : DEFAULT_GLASS_UI_LOCALE;
}

/** Parse persisted locale — undefined until user picks on first launch. */
export function parseUiLocaleSetting(value: unknown): GlassUiLocale | undefined {
  return value === "en" || value === "es" || value === "zh" ? value : undefined;
}

/** True once the user picked a language on the post-boot picker. */
export function isUiLocaleChosen(value: unknown): boolean {
  return value === "en" || value === "es" || value === "zh";
}

export interface LanguageOption {
  locale: GlassUiLocale;
  nativeLabel: string;
  englishLabel: string;
  flag: string;
}

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { locale: "en", nativeLabel: "English", englishLabel: "English", flag: "🇺🇸" },
  { locale: "es", nativeLabel: "Español", englishLabel: "Spanish", flag: "🇪🇸" },
  { locale: "zh", nativeLabel: "中文", englishLabel: "Chinese", flag: "🇨🇳" },
];

export interface LocaleVoiceConfig {
  voiceId: string;
  model: string;
  label: string;
}

export function resolveLocaleVoiceConfig(locale: GlassUiLocale): LocaleVoiceConfig {
  switch (locale) {
    case "es":
      return {
        voiceId: "EXAVITQu4vr4xnSDxMaL",
        model: "eleven_multilingual_v2",
        label: "Sarah (Spanish)",
      };
    case "zh":
      return {
        voiceId: "XrExE9yKIg1WjnnlVkGX",
        model: "eleven_multilingual_v2",
        label: "Matilda (Chinese)",
      };
    default:
      return {
        voiceId: "XrExE9yKIg1WjnnlVkGX",
        model: "eleven_turbo_v2_5",
        label: "Matilda (English)",
      };
  }
}

/** Web Speech API BCP-47 tag for onboarding mic input. */
export function speechRecognitionLang(locale: GlassUiLocale): string {
  switch (locale) {
    case "es":
      return "es-ES";
    case "zh":
      return "zh-CN";
    default:
      return "en-US";
  }
}

/** Deepgram `language` query param for pre-recorded transcription. */
export function deepgramLanguageCode(locale: GlassUiLocale): string {
  switch (locale) {
    case "es":
      return "es";
    case "zh":
      return "zh";
    default:
      return "en";
  }
}
