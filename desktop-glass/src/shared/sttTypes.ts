/**
 * OpenAI STT types and config for IIVO Glass (shared, testable).
 * API key stays in main process only — never exposed to renderer.
 */

export type SttProviderId = "openai" | "none";

export type SttProviderStatus =
  | "configured"
  | "missing_key"
  | "disabled"
  | "unsupported"
  | "error";

export type SttAudioSource = "microphone" | "system_audio";

export type SttTranscribeRequest = {
  audioPath: string;
  mimeType: string;
  source: SttAudioSource;
  language?: string;
  sessionId?: string;
  eventId?: string;
};

export type SttTranscribeResult = {
  text: string;
  provider: "openai";
  model: string;
  durationMs?: number;
  warning?: string;
};

export const DEFAULT_STT_MODEL = "gpt-4o-mini-transcribe";
export const DEFAULT_CHUNK_MS = 20_000;
export const LISTENING_COST_WARN_MS = 10 * 60 * 1000;
export const DEFAULT_AUTO_STOP_MS = 30 * 60 * 1000;

export interface SttConfig {
  enabled: boolean;
  provider: SttProviderId;
  model: string;
  status: SttProviderStatus;
  autoStopMs: number;
  autoStopEnabled: boolean;
}

export interface GlassSttState {
  provider: SttProviderId;
  status: SttProviderStatus;
  model: string;
  enabled: boolean;
  chunkMs: number;
  autoStopEnabled: boolean;
  autoStopMs: number;
  lastTranscript?: string;
  lastError?: string;
  transcribing?: boolean;
  listeningElapsedMs?: number;
}

export const STT_MISSING_KEY_MESSAGE =
  "OpenAI transcription is not configured. Add OPENAI_API_KEY to enable STT.";

export const STT_DISABLED_MESSAGE = "OpenAI transcription is disabled.";

export const STT_COST_NOTE =
  "Transcription uses OpenAI STT and may incur usage cost. Keep sessions focused.";

export const STT_MIC_NOT_CONFIGURED_MESSAGE =
  "Microphone captured. OpenAI transcription is not configured.";

export function sttProviderLabel(provider: SttProviderId, status: SttProviderStatus): string {
  if (provider === "openai" && status === "configured") return "OpenAI";
  if (status === "disabled") return "Disabled";
  if (status === "missing_key") return "Not configured";
  if (status === "unsupported") return "Unsupported";
  if (status === "error") return "Error";
  return "Not configured";
}

export function sttStatusMessage(status: SttProviderStatus): string {
  switch (status) {
    case "configured":
      return STT_COST_NOTE;
    case "missing_key":
      return STT_MISSING_KEY_MESSAGE;
    case "disabled":
      return STT_DISABLED_MESSAGE;
    case "unsupported":
      return "Speech-to-text provider is not supported in this build.";
    case "error":
      return "Speech-to-text configuration error.";
    default:
      return "";
  }
}

function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null || value.trim() === "") return defaultValue;
  const v = value.trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no") return false;
  return defaultValue;
}

function parseProvider(value: string | undefined): SttProviderId {
  const v = (value ?? "none").trim().toLowerCase();
  if (v === "openai") return "openai";
  return "none";
}

export function resolveSttConfig(
  env: Record<string, string | undefined> = {},
): SttConfig {
  const enabled = parseBool(env.IIVO_GLASS_STT_ENABLED, false);
  const provider = parseProvider(env.IIVO_GLASS_STT_PROVIDER);
  const model = (env.IIVO_GLASS_STT_MODEL ?? DEFAULT_STT_MODEL).trim() || DEFAULT_STT_MODEL;
  const autoStopEnabled = parseBool(env.IIVO_GLASS_STT_AUTO_STOP, false);
  const autoStopMinutes = parseInt(env.IIVO_GLASS_STT_AUTO_STOP_MINUTES ?? "30", 10);
  const autoStopMs = Number.isFinite(autoStopMinutes) ? autoStopMinutes * 60 * 1000 : DEFAULT_AUTO_STOP_MS;

  if (!enabled || provider === "none") {
    return {
      enabled: false,
      provider: "none",
      model,
      status: "disabled",
      autoStopMs,
      autoStopEnabled,
    };
  }

  if (provider === "openai") {
    const key = env.OPENAI_API_KEY?.trim();
    if (!key) {
      return {
        enabled: true,
        provider: "openai",
        model,
        status: "missing_key",
        autoStopMs,
        autoStopEnabled,
      };
    }
    return {
      enabled: true,
      provider: "openai",
      model,
      status: "configured",
      autoStopMs,
      autoStopEnabled,
    };
  }

  return {
    enabled,
    provider: "none",
    model,
    status: "unsupported",
    autoStopMs,
    autoStopEnabled,
  };
}

export function buildGlassSttState(config: SttConfig, partial?: Partial<GlassSttState>): GlassSttState {
  return {
    provider: config.provider,
    status: config.status,
    model: config.model,
    enabled: config.enabled && config.status === "configured",
    chunkMs: DEFAULT_CHUNK_MS,
    autoStopEnabled: config.autoStopEnabled,
    autoStopMs: config.autoStopMs,
    ...partial,
  };
}

export function buildTranscriptEventMetadata(opts: {
  audioPath: string;
  audioMimeType: string;
  model: string;
  source: SttAudioSource;
  durationMs?: number;
  status: "success" | "failed";
  error?: string;
}): Record<string, unknown> {
  return {
    audioPath: opts.audioPath,
    audioMimeType: opts.audioMimeType,
    transcriptionProvider: "openai",
    transcriptionModel: opts.model,
    transcriptionStatus: opts.status,
    transcriptionSource: opts.source,
    durationMs: opts.durationMs,
    transcriptionError: opts.error,
  };
}
