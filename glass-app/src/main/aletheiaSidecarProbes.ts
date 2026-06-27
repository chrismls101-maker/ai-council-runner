/**
 * Health probes for Aletheia sidecar services (P0.3 Body).
 */

import {
  isOmniParserEnabled,
  isOmniParserSidecarWarm,
  omniParserWeightsPresent,
  resolveOmniParserSidecarDir,
} from "./companionOmniParser.ts";
import type { SidecarServiceProbeInput, SidecarServiceStatus } from "../shared/aletheiaSidecarManager.ts";

export interface SttProbeInput {
  sttEnabled: boolean;
  sttStatus: string;
  lastSttError?: string;
  deepgramKeyPresent: boolean;
  openAiKeyPresent: boolean;
}

export interface ObservationProbeInput {
  screenCaptureReady: boolean;
  screenCaptureDetail?: string;
}

export async function probeOmniParserService(): Promise<SidecarServiceProbeInput> {
  if (!isOmniParserEnabled()) {
    return {
      id: "omniparser",
      status: "disabled",
      detail: "OmniParser optional — enable via weights or IIVO_COMPANION_OMNI_PARSER=1.",
    };
  }

  const sidecarDir = resolveOmniParserSidecarDir();
  if (!sidecarDir) {
    return {
      id: "omniparser",
      status: "not_installed",
      detail: "Sidecar bundle not found in this Glass build.",
    };
  }

  if (!omniParserWeightsPresent()) {
    return {
      id: "omniparser",
      status: "degraded",
      detail: "Running in mock mode — install model weights for real detection.",
    };
  }

  try {
    const warm = await isOmniParserSidecarWarm();
    if (warm) {
      return { id: "omniparser", status: "healthy", detail: "Model loaded and responding." };
    }
    return { id: "omniparser", status: "starting", detail: "Sidecar warming — vision marks may be delayed." };
  } catch {
    return { id: "omniparser", status: "failed", detail: "Sidecar unreachable — will retry automatically." };
  }
}

export function probeSttService(input: SttProbeInput): SidecarServiceProbeInput {
  if (!input.sttEnabled) {
    return {
      id: "stt",
      status: "disabled",
      detail: "Streaming transcription disabled in settings.",
    };
  }

  const hasTranscriptionPath = input.deepgramKeyPresent || input.openAiKeyPresent;
  if (!hasTranscriptionPath || input.sttStatus === "missing_key") {
    return {
      id: "stt",
      status: "not_installed",
      detail: "No transcription API key — add Deepgram or OpenAI in Glass Setup.",
    };
  }

  const status = normalizeSttStatus(input.sttStatus, input.lastSttError, input.deepgramKeyPresent);
  return {
    id: "stt",
    status,
    detail: sttDetail(status, input.lastSttError, input.deepgramKeyPresent),
  };
}

export function probeObservationService(input: ObservationProbeInput): SidecarServiceProbeInput {
  if (input.screenCaptureReady) {
    return { id: "observation", status: "healthy", detail: "Screen capture ready." };
  }
  return {
    id: "observation",
    status: "degraded",
    detail: input.screenCaptureDetail?.trim() || "Screen Recording permission or probe not ready.",
  };
}

function normalizeSttStatus(
  sttStatus: string,
  lastError?: string,
  deepgramKeyPresent?: boolean,
): SidecarServiceStatus {
  if (sttStatus === "error") return "failed";
  if (sttStatus === "server_unavailable") return "degraded";
  if (lastError?.trim() && sttStatus !== "configured") return "degraded";
  if (!deepgramKeyPresent) return "degraded";
  return "healthy";
}

function sttDetail(status: SidecarServiceStatus, lastError?: string, deepgramKeyPresent?: boolean): string {
  if (status === "failed" && lastError?.trim()) return lastError.trim();
  if (status === "healthy") {
    return deepgramKeyPresent
      ? "Streaming transcription ready."
      : "Whisper fallback ready (no Deepgram key).";
  }
  if (status === "degraded" && !deepgramKeyPresent) {
    return "Using Whisper fallback — speaker labels unavailable.";
  }
  if (status === "degraded") return lastError?.trim() || "Transcription reconnecting.";
  return "Transcription status unknown.";
}
