/**
 * OpenAI STT types and config for IIVO Glass (shared, testable).
 * API key stays in main process only — never exposed to renderer.
 */

export type SttProviderId = "openai" | "none";

export type SttEndpointMode = "server" | "direct" | "none";

export type SttProviderStatus =
  | "configured"
  | "missing_key"
  | "disabled"
  | "unsupported"
  | "server_unavailable"
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
  endpoint?: SttEndpointMode;
};

export const DEFAULT_STT_MODEL = "gpt-4o-mini-transcribe";
export const DEFAULT_CHUNK_MS = 20_000;
export const LISTENING_COST_WARN_MS = 10 * 60 * 1000;
export const DEFAULT_AUTO_STOP_MS = 30 * 60 * 1000;

export interface SttConfig {
  enabled: boolean;
  provider: SttProviderId;
  endpoint: SttEndpointMode;
  model: string;
  status: SttProviderStatus;
  autoStopMs: number;
  autoStopEnabled: boolean;
  directKeyAvailable: boolean;
}

export interface GlassSttState {
  provider: SttProviderId;
  endpoint: SttEndpointMode;
  status: SttProviderStatus;
  model: string;
  enabled: boolean;
  chunkMs: number;
  autoStopEnabled: boolean;
  autoStopMs: number;
  micPathLabel?: string;
  lastTranscript?: string;
  lastError?: string;
  transcribing?: boolean;
  listeningElapsedMs?: number;
}

export const STT_MISSING_KEY_MESSAGE =
  "OpenAI transcription is not configured. Set IIVO_GLASS_OPENAI_API_KEY in root .env for direct Glass STT.";

export function glassDirectApiKey(env: Record<string, string | undefined>): string | null {
  const glassKey = env.IIVO_GLASS_OPENAI_API_KEY?.trim();
  if (glassKey) return glassKey;
  return env.OPENAI_API_KEY?.trim() || null;
}

export const STT_SERVER_UNAVAILABLE_MESSAGE =
  "IIVO transcription server unavailable. Start npm run dev or configure direct Glass STT.";

export const STT_DISABLED_MESSAGE = "OpenAI transcription is disabled.";

export const STT_COST_NOTE =
  "Transcription uses OpenAI STT and may incur usage cost. Keep sessions focused.";

export const STT_MIC_NOT_CONFIGURED_MESSAGE =
  "Microphone captured. OpenAI transcription is not configured.";

export const STT_TRANSCRIPTION_FAILED_MESSAGE =
  "I heard audio but transcription failed. Try again or check STT settings.";

export function sttTranscriptionFailedMessage(audioCaptured: boolean, detail?: string): string {
  if (audioCaptured) {
    return detail
      ? `${STT_TRANSCRIPTION_FAILED_MESSAGE} (${detail})`
      : STT_TRANSCRIPTION_FAILED_MESSAGE;
  }
  return detail?.trim() || "Transcription failed.";
}

export const STT_WEB_SPEECH_LABEL =
  "Microphone live transcription via Web Speech";

export const STT_OPENAI_CHUNK_LABEL =
  "Microphone chunk transcription via OpenAI";

export const STT_SYSTEM_OPENAI_LABEL =
  "System audio chunk transcription via OpenAI";

export function sttProviderLabel(
  provider: SttProviderId,
  status: SttProviderStatus,
  endpoint: SttEndpointMode,
): string {
  if (status === "disabled") return "Disabled";
  if (status === "missing_key") return "Not configured";
  if (status === "server_unavailable") return "Server unavailable";
  if (status === "unsupported") return "Unsupported";
  if (status === "error") return "Error";
  if (provider === "openai" && endpoint === "server") return "OpenAI (IIVO server)";
  if (provider === "openai" && endpoint === "direct") return "OpenAI (direct)";
  if (provider === "openai") return "OpenAI";
  return "Not configured";
}

export function sttStatusMessage(
  status: SttProviderStatus,
  endpoint: SttEndpointMode = "server",
): string {
  switch (status) {
    case "configured":
      return endpoint === "server"
        ? `${STT_COST_NOTE} Uses your running IIVO server's OPENAI_API_KEY.`
        : `${STT_COST_NOTE} Uses IIVO_GLASS_OPENAI_API_KEY (Glass main process only).`;
    case "missing_key":
      return STT_MISSING_KEY_MESSAGE;
    case "server_unavailable":
      return STT_SERVER_UNAVAILABLE_MESSAGE;
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
  const v = (value ?? "openai").trim().toLowerCase();
  if (v === "openai") return "openai";
  if (v === "none") return "none";
  return "openai";
}

function parseEndpoint(value: string | undefined): SttEndpointMode {
  const v = (value ?? "server").trim().toLowerCase();
  if (v === "direct") return "direct";
  if (v === "none") return "none";
  return "server";
}

export function resolveSttConfig(
  env: Record<string, string | undefined> = {},
): SttConfig {
  const endpoint = parseEndpoint(env.IIVO_GLASS_STT_ENDPOINT);
  const enabledDefault = endpoint === "none" ? false : true;
  const enabled = parseBool(env.IIVO_GLASS_STT_ENABLED, enabledDefault);
  const provider = parseProvider(env.IIVO_GLASS_STT_PROVIDER);
  const model = (env.IIVO_GLASS_STT_MODEL ?? DEFAULT_STT_MODEL).trim() || DEFAULT_STT_MODEL;
  const autoStopEnabled = parseBool(env.IIVO_GLASS_STT_AUTO_STOP, false);
  const autoStopMinutes = parseInt(env.IIVO_GLASS_STT_AUTO_STOP_MINUTES ?? "30", 10);
  const autoStopMs = Number.isFinite(autoStopMinutes) ? autoStopMinutes * 60 * 1000 : DEFAULT_AUTO_STOP_MS;
  const directKeyAvailable = !!glassDirectApiKey(env);

  if (!enabled || endpoint === "none" || provider === "none") {
    return {
      enabled: false,
      provider: "none",
      endpoint: "none",
      model,
      status: "disabled",
      autoStopMs,
      autoStopEnabled,
      directKeyAvailable,
    };
  }

  if (endpoint === "server") {
    return {
      enabled: true,
      provider: "openai",
      endpoint: "server",
      model,
      status: "configured",
      autoStopMs,
      autoStopEnabled,
      directKeyAvailable,
    };
  }

  if (endpoint === "direct") {
    if (!directKeyAvailable) {
      return {
        enabled: true,
        provider: "openai",
        endpoint: "direct",
        model,
        status: "missing_key",
        autoStopMs,
        autoStopEnabled,
        directKeyAvailable: false,
      };
    }
    return {
      enabled: true,
      provider: "openai",
      endpoint: "direct",
      model,
      status: "configured",
      autoStopMs,
      autoStopEnabled,
      directKeyAvailable: true,
    };
  }

  return {
    enabled,
    provider: "none",
    endpoint: "none",
    model,
    status: "unsupported",
    autoStopMs,
    autoStopEnabled,
    directKeyAvailable,
  };
}

export function buildGlassSttState(config: SttConfig, partial?: Partial<GlassSttState>): GlassSttState {
  return {
    provider: config.provider,
    endpoint: config.endpoint,
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
  endpoint?: SttEndpointMode;
  error?: string;
}): Record<string, unknown> {
  return {
    audioPath: opts.audioPath,
    audioMimeType: opts.audioMimeType,
    transcriptionProvider: "openai",
    transcriptionModel: opts.model,
    transcriptionEndpoint: opts.endpoint,
    transcriptionStatus: opts.status,
    transcriptionSource: opts.source,
    durationMs: opts.durationMs,
    transcriptionError: opts.error,
  };
}

export function resolveMicPathLabel(
  mode: "microphone_web_speech" | "microphone_media_recorder" | "manual" | "system_audio",
): string | undefined {
  if (mode === "microphone_web_speech") return STT_WEB_SPEECH_LABEL;
  if (mode === "microphone_media_recorder") return STT_OPENAI_CHUNK_LABEL;
  if (mode === "system_audio") return STT_SYSTEM_OPENAI_LABEL;
  return undefined;
}
