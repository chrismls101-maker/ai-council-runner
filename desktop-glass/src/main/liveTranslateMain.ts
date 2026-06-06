/**
 * Main-process Live Translate chunk handler.
 */

import { applyCaptionChunk } from "../shared/liveTranslateCaptions.ts";
import {
  detectLanguageHeuristic,
  isAlreadyTargetLanguage,
  shouldAttemptTranslation,
} from "../shared/liveTranslateEngine.ts";
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

export interface ProcessTranslateChunkInput {
  text: string;
  interim?: boolean;
  chunkId?: string;
  tags?: string[];
}

export interface ProcessTranslateChunkDeps {
  config: GlassConfig;
  runtime: LiveTranslateRuntimeState;
  fetchImpl?: typeof fetch;
}

export async function processTranslateTranscriptChunk(
  input: ProcessTranslateChunkInput,
  deps: ProcessTranslateChunkDeps,
): Promise<LiveTranslateRuntimeState> {
  let runtime = deps.runtime;
  if (!runtime.active || !runtime.config.enabled) return runtime;

  const text = input.text.trim();
  if (!shouldAttemptTranslation(text, input.interim)) return runtime;

  const detection = detectLanguageHeuristic(text);
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
        original: text,
        translated: text,
        interim: input.interim,
        id: input.chunkId,
        detectedLanguage: detected,
        alreadyTargetLanguage: true,
      }),
    };
    return runtime;
  }

  try {
    const result = await translateViaServer(deps.config, {
      text,
      sourceLanguage: runtime.config.sourceLanguage,
      targetLanguage: runtime.config.targetLanguage,
      interim: input.interim,
    }, deps.fetchImpl);

    runtime = setLiveTranslateStatus(runtime, "active");
    runtime = {
      ...runtime,
      captions: applyCaptionChunk(runtime.captions, {
        original: text,
        translated: result.translated,
        interim: input.interim,
        id: input.chunkId,
        detectedLanguage: detected,
        languageUncertain: detection.uncertain,
        alreadyTargetLanguage: result.alreadyTargetLanguage,
      }),
      lastError: undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Translation failed";
    runtime = {
      ...setLiveTranslateStatus(runtime, "error"),
      lastError: message,
    };
  }

  return runtime;
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
  return {
    liveTranslate: {
      original,
      translated: shouldPersistTranslationOnly(runtime.config) ? translated : undefined,
      targetLanguage: runtime.config.targetLanguage,
      detectedSourceLanguage: runtime.detectedSourceLanguage as LiveTranslateLanguage,
      isTranslation: true,
    },
  };
}
