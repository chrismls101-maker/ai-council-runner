/**
 * STT provider dispatch for Glass main process.
 */

import type { SttConfig, SttTranscribeRequest, SttTranscribeResult } from "../shared/sttTypes.ts";
import { resolveSttConfig, sttStatusMessage } from "../shared/sttTypes.ts";
import { transcribeOpenAI, type FetchLike } from "./sttOpenAI.ts";

export function getSttConfig(env: Record<string, string | undefined> = process.env): SttConfig {
  return resolveSttConfig(env);
}

export async function transcribeWithProvider(
  config: SttConfig,
  request: SttTranscribeRequest,
  env: Record<string, string | undefined> = process.env,
  fetchImpl?: FetchLike,
): Promise<SttTranscribeResult> {
  if (!config.enabled || config.provider === "none") {
    throw new Error(sttStatusMessage("disabled"));
  }
  if (config.status === "missing_key") {
    throw new Error(sttStatusMessage("missing_key"));
  }
  if (config.status !== "configured") {
    throw new Error(sttStatusMessage(config.status));
  }
  if (config.provider === "openai") {
    const apiKey = env.OPENAI_API_KEY?.trim();
    if (!apiKey) throw new Error(sttStatusMessage("missing_key"));
    return transcribeOpenAI(apiKey, config.model, request, fetchImpl);
  }
  throw new Error(sttStatusMessage("unsupported"));
}
