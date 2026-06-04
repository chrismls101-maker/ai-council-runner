/**
 * STT provider dispatch for Glass main process.
 * Prefers IIVO server endpoint; falls back to direct OpenAI when configured.
 */

import type { GlassConfig } from "../shared/config.ts";
import type { SttConfig, SttTranscribeRequest, SttTranscribeResult } from "../shared/sttTypes.ts";
import {
  resolveSttConfig,
  sttStatusMessage,
  STT_SERVER_UNAVAILABLE_MESSAGE,
} from "../shared/sttTypes.ts";
import { transcribeOpenAI, type FetchLike } from "./sttOpenAI.ts";
import { transcribeViaServer } from "./sttServer.ts";

export function getSttConfig(env: Record<string, string | undefined> = process.env): SttConfig {
  return resolveSttConfig(env);
}

async function transcribeDirect(
  config: SttConfig,
  request: SttTranscribeRequest,
  env: Record<string, string | undefined>,
  fetchImpl?: FetchLike,
): Promise<SttTranscribeResult> {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(sttStatusMessage("missing_key", "direct"));
  }
  const result = await transcribeOpenAI(apiKey, config.model, request, fetchImpl);
  return { ...result, endpoint: "direct" };
}

export async function transcribeWithProvider(
  config: SttConfig,
  glassConfig: GlassConfig,
  request: SttTranscribeRequest,
  env: Record<string, string | undefined> = process.env,
  fetchImpl?: FetchLike,
): Promise<SttTranscribeResult> {
  if (!config.enabled || config.endpoint === "none") {
    throw new Error(sttStatusMessage("disabled", config.endpoint));
  }

  if (config.endpoint === "server") {
    try {
      return await transcribeViaServer(glassConfig, config.model, request, fetchImpl);
    } catch (serverErr) {
      if (config.directKeyAvailable) {
        try {
          const direct = await transcribeDirect(config, request, env, fetchImpl);
          return {
            ...direct,
            warning: serverErr instanceof Error ? serverErr.message : STT_SERVER_UNAVAILABLE_MESSAGE,
          };
        } catch {
          throw serverErr;
        }
      }
      throw serverErr;
    }
  }

  if (config.endpoint === "direct") {
    if (config.status === "missing_key") {
      throw new Error(sttStatusMessage("missing_key", "direct"));
    }
    return transcribeDirect(config, request, env, fetchImpl);
  }

  throw new Error(sttStatusMessage("unsupported", config.endpoint));
}
