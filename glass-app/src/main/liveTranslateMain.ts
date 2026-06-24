/**
 * Main-process Live Translate chunk handler.
 */

import { applyCaptionChunk } from "../shared/liveTranslateCaptions.ts";
import {
  detectLanguageHeuristic,
  isAlreadyTargetLanguage,
  shouldAttemptTranslation,
} from "../shared/liveTranslateEngine.ts";
import {
  applyGlossaryToTranslation,
  buildTranslateSystemPrompt,
  buildTranslateUserPrompt,
  recentCaptionContext,
} from "../shared/liveTranslatePrompt.ts";
import type { LiveTranslateRuntimeState } from "../shared/liveTranslateTypes.ts";
import {
  setLiveTranslateStatus,
  shouldPersistTranslateChunk,
  shouldPersistTranslationOnly,
} from "../shared/liveTranslateState.ts";
import type { LiveTranslateLanguage } from "../shared/liveTranslateTypes.ts";
import { liveTranslateLanguagePairLabel } from "../shared/liveTranslateTypes.ts";
import type { GlassConfig } from "../shared/config.ts";
import { translateViaServer } from "./liveTranslateClient.ts";
import { translateViaDeepL } from "./deepLTranslate.ts";

export interface ProcessTranslateChunkInput {
  text: string;
  interim?: boolean;
  chunkId?: string;
  tags?: string[];
  appContext?: string;
  /** Passed through to applyCaptionChunk for sentence-level accumulation in the display. */
  sentenceId?: string;
}

export interface ProcessTranslateChunkDeps {
  config: GlassConfig;
  runtime: LiveTranslateRuntimeState;
  fetchImpl?: typeof fetch;
  shouldSuppressErrors?: () => boolean;
}

export interface TranslateChunkResult {
  runtime: LiveTranslateRuntimeState;
  original: string;
  translated?: string;
  alreadyTargetLanguage?: boolean;
}

export async function processTranslateTranscriptChunk(
  input: ProcessTranslateChunkInput,
  deps: ProcessTranslateChunkDeps,
): Promise<TranslateChunkResult> {
  let runtime = deps.runtime;
  const original = input.text.trim();
  if (!runtime.active || !runtime.config.enabled) {
    return { runtime, original };
  }

  if (!shouldAttemptTranslation(original, input.interim)) return { runtime, original };

  const detection = detectLanguageHeuristic(original);
  const detected = runtime.config.sourceLanguage === "auto" ? detection.language : runtime.config.sourceLanguage;
  const alreadyTarget = isAlreadyTargetLanguage(
    detection.language,
    runtime.config.targetLanguage,
    runtime.config.sourceLanguage,
  );

  runtime = {
    ...runtime,
    detectedSourceLanguage: detected,
    languageUncertain: detection.uncertain,
    captions: {
      ...runtime.captions,
      languagePairLabel: liveTranslateLanguagePairLabel(
        runtime.config.sourceLanguage,
        runtime.config.targetLanguage,
        detected,
      ),
    },
  };

  if (alreadyTarget) {
    runtime = {
      ...runtime,
      status: "active",
      captions: applyCaptionChunk(runtime.captions, {
        original,
        translated: original,
        interim: input.interim,
        id: input.chunkId,
        sentenceId: input.sentenceId,
        detectedLanguage: detected,
        alreadyTargetLanguage: true,
      }),
    };
    return { runtime, original, translated: original, alreadyTargetLanguage: true };
  }

  try {
    const previousCaptions = recentCaptionContext(runtime.captions.lines);

    // Try DeepL first (~50–150 ms) if the key is set; fall back to IIVO server.
    const deeplApiKey = process.env.DEEPL_API_KEY?.trim();
    let translatedRaw: string;
    let alreadyTargetLanguage: boolean | undefined;

    if (deeplApiKey) {
      const deeplResult = await translateViaDeepL(
        deeplApiKey,
        original,
        runtime.config.targetLanguage,
        runtime.config.sourceLanguage,
        deps.fetchImpl,
      );
      translatedRaw = deeplResult.translated;
    } else {
      const serverResult = await translateViaServer(
        deps.config,
        {
          text: original,
          sourceLanguage: runtime.config.sourceLanguage,
          targetLanguage: runtime.config.targetLanguage,
          interim: input.interim,
          mode: runtime.config.mode,
          latencyMode: runtime.config.latencyMode,
          previousCaptions,
          glossaryTerms: runtime.config.glossaryTerms,
          appContext: input.appContext,
        },
        deps.fetchImpl,
      );
      translatedRaw = serverResult.translated;
      alreadyTargetLanguage = serverResult.alreadyTargetLanguage;
    }

    const translated = applyGlossaryToTranslation(
      translatedRaw,
      runtime.config.glossaryTerms,
    );
    runtime = setLiveTranslateStatus(runtime, "active");
    runtime = {
      ...runtime,
      captions: applyCaptionChunk(runtime.captions, {
        original,
        translated,
        interim: input.interim,
        id: input.chunkId,
        sentenceId: input.sentenceId,
        detectedLanguage: detected,
        languageUncertain: detection.uncertain,
        alreadyTargetLanguage,
      }),
      lastError: undefined,
    };
    return { runtime, original, translated, alreadyTargetLanguage };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Translation failed";
    if (deps.shouldSuppressErrors?.()) {
      return { runtime, original, translated: original };
    }
    runtime = {
      ...setLiveTranslateStatus(runtime, "error"),
      lastError: message,
      captions: applyCaptionChunk(runtime.captions, {
        original,
        translated: original,
        interim: false,
        id: input.chunkId,
        detectedLanguage: detected,
        languageUncertain: detection.uncertain,
      }),
    };
    return { runtime, original, translated: original };
  }
}

export function translateSessionTags(
  runtime: LiveTranslateRuntimeState,
  baseTags?: string[],
): string[] | undefined {
  if (!shouldPersistTranslateChunk(runtime.config)) return undefined;
  const tags = [...(baseTags ?? []), "live_translate"];
  if (shouldPersistTranslationOnly(runtime.config)) tags.push("translation_only");
  return tags;
}

export function translateEventMetadata(
  runtime: LiveTranslateRuntimeState,
  original: string,
  translated: string,
): Record<string, unknown> | undefined {
  if (!shouldPersistTranslateChunk(runtime.config)) return undefined;
  const translationOnly = shouldPersistTranslationOnly(runtime.config);
  return {
    liveTranslate: {
      original: translationOnly ? undefined : original,
      translatedText: translated,
      translated: translated,
      targetLanguage: runtime.config.targetLanguage,
      detectedSourceLanguage: runtime.detectedSourceLanguage as LiveTranslateLanguage,
      labeledAsTranslation: true,
      isTranslation: true,
    },
  };
}
