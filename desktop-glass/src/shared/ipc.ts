/**
 * IPC contract shared between the Electron main process, the preload bridge,
 * and the React renderers (dock + panel).
 */

import type { GlassConfig } from "./config.ts";
import type {
  ExtractedNotes,
  GlassMomentKind,
  PanelTab,
  SavedMoment,
} from "./types.ts";
import type { PrivacyState } from "./privacyState.ts";
import type { GlassSession } from "./sessionTypes.ts";
import type { TranscriptionMode, SystemAudioStatus } from "./audioCaptureTypes.ts";
import type { WindowContext } from "./windowContextTypes.ts";
import type { GlassSttState } from "./sttTypes.ts";
import type { GlassWindowState, OverlayMode } from "./glassWindowTypes.ts";
import type { GlassOperationDiagnostics } from "./glassOperations.ts";
import type { GlassCommandFeedItem } from "./commandFeed.ts";
import type { GlassAskStatus, GlassLastAskResponse } from "./glassAskTypes.ts";
import type { GlassLatestScreenshotState, GlassScreenContextStatus } from "./glassScreenContext.ts";
import type { GlassVisualAskRetention } from "./glassScreenshotRetention.ts";
import type { GlassUserSettings } from "./glassSettings.ts";
import type { ConnectedDisplaySnapshot } from "./displayInfo.ts";
import type { MeetingIntelligenceState, MeetingSubType } from "./meetingIntelligenceTypes.ts";
import type { WingmanState } from "./wingmanSession.ts";
import type { WingmanMemoryState } from "./wingmanMemory.ts";

export type { GlassSttState } from "./sttTypes.ts";

// ---------------------------------------------------------------------------
// Glass Q&A memory entry (persisted cross-session)
// ---------------------------------------------------------------------------

export interface GlassMemoryEntry {
  /** Unique entry id. */
  id: string;
  /** Unix timestamp (ms) when the entry was saved. */
  ts: number;
  /** Name of the active app at time of ask (e.g. "Cursor"). */
  app?: string;
  /** Browser URL if available at time of ask. */
  url?: string;
  /** The user's question / prompt. */
  prompt: string;
  /** Claude's full response (fullBody). */
  answer: string;
  /** runId from the feed item, if available. */
  runId?: string;
}

export type SessionActionStatus =
  | "idle"
  | "preparing"
  | "sending"
  | "opened"
  | "failed";

export type AnalysisStatus = "idle" | "running" | "done" | "failed";

export interface IivoAnalysisState {
  status: AnalysisStatus;
  text?: string;
  runId?: string;
  contextId?: string;
  error?: string;
  estimatedCredits?: number;
  updatedAt?: string;
}

export const IPC = {
  command: "glass:command",
  getState: "glass:get-state",
  state: "glass:state",
  setIgnoreMouse: "glass:set-ignore-mouse",
  overlayNotificationActive: "glass:overlay-notification-active",
  /** Renderer → main: pointer entered/left the notification card host. */
  overlayPointerOverNotification: "glass:overlay-pointer-over-notification",
  /** Renderer → main: builder strip mounted/unmounted (guards pointer-over IPC). */
  builderStripVisible: "glass:builder-strip-visible",
  /** Renderer → main: pointer entered/left the builder strip (Prompts / Keys). */
  overlayPointerOverBuilderStrip: "glass:overlay-pointer-over-builder-strip",
  /** Renderer → main: builder strip panel (Prompts/Keys) open — keep overlay interactive. */
  builderStripPanelOpen: "glass:builder-strip-panel-open",
  resizeDock: "glass:resize-dock",
  resizeTerminal: "glass:resize-terminal",
  dismissTerminalWindow: "glass:dismiss-terminal-window",
  /** Main → terminal renderer: frameless window was shown; run open reveal. */
  terminalWindowShown: "glass:terminal-window-shown",
  /** Main → renderer: foreground process title update for a PTY tab. Payload: (termId, title|null). */
  terminalTitleUpdate: "glass:terminal-title-update",
  windowContextGet: "glass:window-context-get-current",
  sttProcessChunk: "glass:stt-process-chunk",
  transcriptionControl: "glass:transcription-control",
  commandBarFocus: "glass:command-bar-focus",
  commandBarPrefill: "glass:command-bar-prefill",
  e2eGetExternalUrls: "glass:e2e-get-external-urls",
  e2eResetExternalUrls: "glass:e2e-reset-external-urls",
  e2eGetWindowMetadata: "glass:e2e-get-window-metadata",
  e2eGetCaptureTarget: "glass:e2e-get-capture-target",
  e2eSimulateCaptureFail: "glass:e2e-simulate-capture-fail",
  e2eSimulateScreenEnumFail: "glass:e2e-simulate-screen-enum-fail",
  e2eSimulateSystemAudioEnumFail: "glass:e2e-simulate-system-audio-enum-fail",
  e2eSetCaptureProbes: "glass:e2e-set-capture-probes",
  e2eResetSetupState: "glass:e2e-reset-setup-state",
  e2eOpenOnboarding: "glass:e2e-open-onboarding",
  updateGlassProfile: "glass:update-glass-profile",
  saveGlassMemory: "glass:save-glass-memory",
  lensCapture: "glass:lens-capture",
  lensScreenshot: "glass:lens-screenshot",
  hideForCapture: "glass:hide-for-capture",
  restoreAfterCapture: "glass:restore-after-capture",
  deepgramAudioChunk: "glass:deepgram-audio-chunk",
  // ── Built-in terminal (PTY) ────────────────────────────────────────────────
  /** Main → renderer: PTY output data. Payload: { termId, data }. */
  ptyData: "glass:pty-data",
  /** Renderer → main: raw keystroke/paste data. Payload: { termId, data }. */
  ptyInput: "glass:pty-input",
  /** Renderer → main: terminal resize. Payload: { termId, cols, rows }. */
  ptyResize: "glass:pty-resize",
  /** Renderer → main: fetch buffered PTY output for replay after attach. */
  ptyReplay: "glass:pty-replay",
  /** Renderer → main: byte length of the PTY replay buffer (before resize / attach). */
  ptyReplayLength: "glass:pty-replay-length",
  /** Renderer → main: write plain text to the system clipboard. */
  writeClipboard: "glass:write-clipboard",
  // ── API Key Manager ────────────────────────────────────────────────────────
  /** Renderer → main: list all stored key metadata (no values). */
  apiKeyList: "glass:api-key-list",
  /** Renderer → main: get decrypted value for a specific key id. */
  apiKeyGetValue: "glass:api-key-get-value",
  /** Renderer → main: save (create or update) a key. Payload: { meta, value }. */
  apiKeySave: "glass:api-key-save",
  /** Renderer → main: delete a key by id. */
  apiKeyDelete: "glass:api-key-delete",
  // ── Power Prompt Generator ─────────────────────────────────────────────────
  /** Renderer → main: generate an expert prompt from intent + target + mode. */
  promptGenerate: "glass:prompt-generate",
  // ── AI Spend Tracker ───────────────────────────────────────────────────────
  /** Renderer → main: get cached spend snapshot (instant, never triggers fetch). */
  spendGet: "glass:spend-get",
  /** Renderer → main: force-refresh all provider spend data and return snapshot. */
  spendRefresh: "glass:spend-refresh",
  /**
   * Renderer → main: one-off billing URL fetch using a stored API key.
   * Main handles the HTTP request so CORS never applies.
   */
  spendCustomFetch: "glass:spend-custom-fetch",
  /** Renderer → main: get logged spend history (last N days). */
  spendHistoryGet: "glass:spend-history-get",
  // ── Terminal AI ────────────────────────────────────────────────────────────
  /**
   * Renderer → main: explain the last terminal command + its output using Claude.
   * Returns a short explanation + optional fix suggestion.
   */
  terminalExplain: "glass:terminal-explain",
  /**
   * Renderer → main: convert a natural-language description into a single
   * shell command for macOS/zsh using Claude.
   */
  nlToShell: "glass:nl-to-shell",
  /**
   * Renderer (terminal window) → main: transcribe recorded audio via Deepgram's
   * pre-recorded REST API. Used by the Voice → Shell feature (Task #44).
   */
  voiceShellTranscribe: "glass:voice-shell-transcribe",
  /**
   * Renderer → main (fire-and-forget): push recent built-in terminal command
   * blocks into the rolling AI context buffer (Task #41).
   */
  terminalContextPush: "glass:terminal-context-push",
  /**
   * Renderer (terminal window) → main: capture the full screen, package it with
   * terminal context, and analyze it via Claude Vision (Task #45). The screenshot
   * is captured in the main process — the renderer sends only text context.
   */
  terminalVisionAnalyze: "glass:terminal-vision-analyze",
  /**
   * Renderer (terminal window) → main: after a command finishes, ask Claude for
   * 3 AI-powered next-command suggestions based on the last command + cwd (Task #46).
   */
  terminalSuggest: "glass:terminal-suggest",
  // ── Persistent Smart Scrollback (Task #47) ──────────────────────────────────
  /**
   * Renderer (terminal window) → main (fire-and-forget): persist finished
   * terminal command blocks to the encrypted SQLite scrollback store.
   */
  scrollbackWrite: "glass:scrollback-write",
  /**
   * Renderer (terminal window) → main: natural-language search over the
   * encrypted command history. Claude ranks recent rows; matching rows are
   * decrypted and returned.
   */
  scrollbackSearch: "glass:scrollback-search",
  // ── Extract & Build Mode ────────────────────────────────────────────────────
  /**
   * Renderer → main: run stage-1 detection on a transcript chunk.
   * Returns a 4-6 word label if build content is detected, null otherwise.
   */
  extractDetect: "glass:extract-detect",
  /**
   * Renderer → main: run stage-2 grand master prompt generation on full transcript.
   * Returns the structured build prompt string.
   */
  extractGenerate: "glass:extract-generate",
  extractBuildHandoff: "glass:extract-build-handoff",
  /** Main → overlay: full extract-mode transcript snapshot (system audio STT). */
  extractModeTranscript: "glass:extract-mode-transcript",
} as const;

// ── Built-in terminal AI context (Task #41) ──────────────────────────────────

/** One recent built-in terminal command, fed into the AI `userContext`. */
export interface TerminalContextBlock {
  command: string;
  output: string;     // already ANSI-stripped, safe to truncate
  exitCode?: number;
  status: "success" | "error" | "unknown";
  durationMs?: number;
}

// ── Terminal AI ──────────────────────────────────────────────────────────────

export interface NlToShellRequest {
  prompt: string;
  /** Last 5 finished commands for context. */
  recentCommands?: string[];
}

export interface NlToShellResponse {
  command?: string;
  error?: string;
}

// ── Voice → Shell (Task #44) ─────────────────────────────────────────────────

export interface VoiceShellTranscribeRequest {
  buffer: ArrayBuffer;
  mimeType: string;
}

export interface VoiceShellTranscribeResponse {
  transcript?: string;
  error?: string;
}

export interface TerminalExplainRequest {
  /** The command that was run (e.g. "npm run build"). */
  command: string;
  /** Raw output / error text from the command (ANSI stripped). Max 8000 chars. */
  output: string;
  /** Optional exit code for extra context. */
  exitCode?: number;
}

export interface TerminalExplainResponse {
  /** Short explanation + fix suggestion in Markdown. */
  explanation?: string;
  error?: string;
}

// ── Screen-Aware Terminal Assistant (Task #45) ───────────────────────────────

export interface TerminalVisionRequest {
  terminalContext: string;
  lastCommand?: string;
  lastOutput?: string;
}

export interface TerminalVisionResponse {
  analysis?: string;
  error?: string;
}

// ── AI Command Suggestions (Task #46) ────────────────────────────────────────

export interface TerminalSuggestRequest {
  lastCommand: string;
  lastStatus: "success" | "error" | "unknown";
  cwd: string;
  recentCommands: string[]; // last 5 commands
}

export interface TerminalSuggestion {
  command: string;
  why: string; // one short sentence
}

export interface TerminalSuggestResponse {
  suggestions?: TerminalSuggestion[];
  error?: string;
}

// ── Persistent Smart Scrollback (Task #47) ───────────────────────────────────

export interface ScrollbackWriteBlock {
  sessionId: string;
  command: string;
  output: string;
  exitCode?: number;
  status: "success" | "error" | "unknown";
  cwd?: string;
  startedAt: number;
  durationMs?: number;
}

export interface ScrollbackSearchRequest {
  query: string;
}

export interface ScrollbackSearchResult {
  id: number;
  command: string;
  output: string;
  status: "success" | "error" | "unknown";
  exitCode?: number;
  cwd?: string;
  startedAt: number;
  durationMs?: number;
}

export interface ScrollbackSearchResponse {
  results?: ScrollbackSearchResult[];
  error?: string;
}

// ── API Key Manager ──────────────────────────────────────────────────────────

export interface ApiKeyMeta {
  id: string;
  service: string;
  label: string;
  environment: "dev" | "prod" | "any";
  createdAt: number;
  lastUsedAt: number | null;
}

export interface ApiKeySaveRequest {
  meta: ApiKeyMeta;
  value: string;
}

export interface ApiKeyListResponse {
  keys: ApiKeyMeta[];
  error?: string;
  encryptionAvailable?: boolean;
}

export interface ApiKeyValueResponse {
  value: string | null;
}

export interface ApiKeyMutateResponse {
  ok: boolean;
  error?: string;
}

// ── Power Prompt Generator ───────────────────────────────────────────────────

/** Target AI the generated prompt is optimized for. */
export type PromptTarget =
  | "claude"
  | "gpt"
  | "cursor"
  | "v0"
  | "midjourney"
  | "agent"
  | "general";

/** The type of task the prompt should accomplish. */
export type PromptMode =
  | "build"
  | "debug"
  | "explain"
  | "create"
  | "research"
  | "design-agent"
  | "review";

export interface PromptGenerateRequest {
  /** One-sentence description of what the user wants to achieve. */
  intent: string;
  /** Which AI the generated prompt is for. */
  target: PromptTarget;
  /** The category of task. */
  mode: PromptMode;
  /**
   * User-edited context string — overrides Glass auto-detected context entirely.
   * When empty, main process falls back to state.workingContext.
   */
  userContext?: string;
}

export interface PromptGenerateResponse {
  /** The generated expert-level prompt, ready to copy and use. */
  result?: string;
  /** Set when generation failed. */
  error?: string;
  /** The Glass working-context string that was injected (shown in panel for transparency). */
  usedContext?: string;
  /** The active app at generation time. */
  usedApp?: string;
}

// ── AI Spend Tracker ─────────────────────────────────────────────────────────

export interface ProviderSpendResult {
  /** Normalized service id (e.g. "openai", "elevenlabs", "deepgram", "anthropic"). */
  service: string;
  /** Display name shown in the panel. */
  displayName: string;
  /** "ok" = data fetched, "error" = fetch failed, "unavailable" = no API, "no-key" = key not stored. */
  status: "ok" | "error" | "unavailable" | "no-key";
  /** Spend today in USD (where available). */
  todayUSD?: number;
  /** Spend this billing period in USD (where available). */
  monthUSD?: number;
  /** Unit label for non-USD usage (e.g. "characters", "hours"). */
  unitLabel?: string;
  /** Units consumed this period. */
  unitsUsed?: number;
  /** Total unit limit for this period (for a usage bar). */
  unitLimit?: number;
  /** Unix ms when units reset. */
  unitReset?: number;
  /** Remaining credit balance in USD (Deepgram prepaid credit). */
  balanceUSD?: number;
  /** Error message if status is "error". */
  error?: string;
  /** Unix ms when this result was last fetched. */
  lastFetched: number;
}

/**
 * Config for a user-defined custom billing provider.
 * Stored in renderer localStorage; fetched via spendCustomFetch IPC.
 */
export interface CustomSpendProvider {
  /** Unique id (nanoid or Date.now string). */
  id: string;
  /** Display name, e.g. "My Custom LLM". */
  name: string;
  /** Full billing endpoint URL. */
  url: string;
  /** How to authenticate the request. */
  authStyle: "bearer" | "token" | "custom-header" | "query-param";
  /** Header name when authStyle = "custom-header" (e.g. "xi-api-key"). */
  customHeaderName?: string;
  /** Query param name when authStyle = "query-param" (e.g. "api_key"). */
  queryParamName?: string;
  /** API Key Manager key id to use for auth. */
  keyId: string;
  /**
   * Dot-path into the JSON response body to find the USD spend value.
   * Examples: "total_usage", "data.cost_usd", "balance.amount"
   * Supports array index notation: "items.0.amount"
   */
  responsePath: string;
  /**
   * Optional divisor — e.g. 100 if the API returns cents.
   * Leave undefined / 1 if the value is already in USD.
   */
  divisor?: number;
  /** Optional: label this as "today" or "month" spend. Defaults to "month". */
  spendPeriod?: "today" | "month";
}

/** One day's aggregated spend across all providers. */
export interface SpendDaySummary {
  /** ISO date string "YYYY-MM-DD". */
  date: string;
  /** Sum of all provider USD spend for this day. */
  totalUSD: number;
  /** Per-provider breakdown. */
  providers: {
    service: string;
    displayName: string;
    usd: number;
  }[];
}

export interface SpendCustomFetchRequest {
  url: string;
  authStyle: CustomSpendProvider["authStyle"];
  customHeaderName?: string;
  queryParamName?: string;
  keyId: string;
}

export interface SpendCustomFetchResponse {
  ok: boolean;
  /** Raw parsed JSON body (if ok). */
  body?: unknown;
  /** HTTP status code. */
  status?: number;
  error?: string;
}

export interface SpendSnapshot {
  providers: ProviderSpendResult[];
  /** Sum of todayUSD across providers that have it. */
  totalTodayUSD: number;
  /** Sum of monthUSD across providers that have it. */
  totalMonthUSD: number;
  /** Unix ms when the snapshot was assembled. */
  refreshedAt: number;
}

export interface SaveGlassMemoryRequest {
  content: string;
  prompt?: string;
  runId?: string;
}

export interface SaveGlassMemoryResponse {
  ok: boolean;
  error?: string;
}

export type TranscriptionControlCommand =
  | { type: "start" }
  | { type: "stop" }
  | { type: "probe-microphone" }
  | { type: "probe-virtual-audio-devices" }
  | { type: "startup-audio-restore" }
  | { type: "connect-system-audio" }
  | { type: "test-system-audio" }
  | { type: "test-blackhole" };

export type GlassCommand =
  | { type: "capture-screen" }
  | { type: "capture-screen-only" }
  | { type: "start-listening" }
  | { type: "pause"; reason?: "user" | "auto" }
  | { type: "stop" }
  | { type: "stop-everything" }
  | { type: "request-start-listening" }
  | { type: "append-transcript"; text: string }
  | { type: "add-transcript-chunk"; text: string; tags?: string[]; interim?: boolean; speakerId?: number }
  | { type: "clear-transcript" }
  | { type: "transcription-set-mode"; mode: TranscriptionMode }
  | { type: "system-audio-set-status"; status: SystemAudioStatus; detail?: string }
  | { type: "report-virtual-audio-devices"; devices: { deviceId: string; label: string }[] }
  | { type: "set-selected-virtual-audio-device"; deviceId: string }
  | { type: "stt-listening-timer"; elapsedMs: number }
  | { type: "stt-cost-warning" }
  | { type: "save-moment"; note?: string; kind?: GlassMomentKind }
  | { type: "delete-moment"; id: string }
  | { type: "clear-moments" }
  | { type: "send-screenshot"; imageDataUrl?: string }
  | { type: "send-transcript" }
  | { type: "send-moment"; id: string }
  | { type: "ask-iivo" }
  | { type: "submit-command"; text: string; lensContext?: import("./glassLensContext.ts").GlassLensContext }
  | { type: "ask-iivo-direct"; text: string }
  | { type: "prefill-command-bar"; text: string }
  | { type: "cancel-glass-ask" }
  | { type: "set-glass-hotkey"; preset: GlassUserSettings["hotkeyPreset"] }
  | { type: "set-ui-locale"; locale: import("./glassLocale.ts").GlassUiLocale }
  | { type: "set-glass-display"; target: GlassUserSettings["displayTarget"] }
  | { type: "refresh-glass-layout" }
  | { type: "set-chrome-layout-locked"; locked: boolean }
  | { type: "chrome-window-drag"; dx: number; dy: number }
  | { type: "set-dock-orientation"; orientation: GlassUserSettings["dockOrientation"] }
  | { type: "set-save-visual-asks-to-session"; enabled: boolean }
  | { type: "set-auto-upload-captures-to-context"; enabled: boolean }
  | { type: "set-mic-auto-send-after-silence"; enabled: boolean }
  | { type: "set-clipboard-intelligence-enabled"; enabled: boolean }
  /** Dev-only: inject text into the clipboard intelligence pipeline without polling. */
  | { type: "clipboard-intel-debug-inject"; text: string }
  | { type: "save-last-visual-capture" }
  | { type: "reset-chrome-layout" }
  | { type: "open-feed-in-iivo"; id: string }
  | { type: "save-feed-moment"; id: string }
  | { type: "report-command-bar-stack-height"; heightPx: number }
  | { type: "command-bar-blur" }
  | { type: "toggle-command-bar" }
  | { type: "voice-mode-start" }
  | { type: "clear-command-feed" }
  | { type: "dismiss-overlay-chat" }
  | { type: "pin-command-feed-item"; id: string; pinned: boolean }
  | { type: "remove-command-feed-item"; id: string }
  | { type: "open-chat" }
  | { type: "set-tab"; tab: PanelTab }
  | { type: "toggle-panel" }
  | { type: "hide-notes-pad" }
  | { type: "toggle-overlay" }
  | { type: "set-overlay-mode"; mode: OverlayMode }
  | { type: "window-context-refresh" }
  | { type: "capture-media-context" }
  | { type: "run-setup-check"; silent?: boolean; forceCaptureProbe?: boolean }
  | { type: "run-capture-diagnostics" }
  | { type: "clear-last-notice" }
  | { type: "clear-last-error" }
  | { type: "clear-capture-diagnostics-report" }
  | { type: "report-mic-permission"; status: import("./glassCapabilities.ts").MicPermissionReport }
  | { type: "open-screen-recording-settings" }
  | { type: "open-microphone-settings" }
  | { type: "open-accessibility-settings" }
  | { type: "open-privacy-settings" }
  | { type: "open-audio-midi-setup" }
  | { type: "open-sound-settings" }
  | { type: "show-virtual-audio-help" }
  | { type: "show-blackhole-setup" }
  | { type: "detect-audio-devices" }
  | { type: "verify-system-audio" }
  | { type: "connect-system-audio" }
  | { type: "focus-audio-setup" }
  | { type: "save-mac-output-device" }
  | { type: "clear-mac-output-device" }
  | { type: "test-blackhole" }
  | { type: "retry-capture-permission" }
  | { type: "retry-capture" }
  | { type: "retry-system-audio" }
  | { type: "test-microphone" }
  | { type: "test-system-audio" }
  | {
      type: "e2e-set-server-health";
      health: import("./glassCapabilities.ts").GlassServerHealthForSetup | null;
    }
  | {
      type: "e2e-set-capture-probes";
      screenCaptureProbe?: import("./captureSourceEnumeration.ts").ScreenCaptureProbeStatus;
      screenCaptureDetail?: string;
      windowCaptureProbe?: import("./captureSourceEnumeration.ts").WindowCaptureProbeStatus;
      systemAudioStatus?: SystemAudioStatus;
      systemAudioDetail?: string;
    }
  | { type: "e2e-reset-setup-state" }
  | { type: "e2e-open-onboarding" }
  | { type: "e2e-copilot-tick" }
  | { type: "e2e-set-copilot-silence"; value: boolean }
  | {
      type: "e2e-inject-copilot-intervention";
      intervention: import("./copilotTypes.ts").GlassCopilotIntervention;
    }
  | { type: "update-glass-profile"; profile: import("./glassUserProfile.ts").GlassUserProfile }
  | { type: "complete-glass-onboarding"; profile?: import("./glassUserProfile.ts").GlassUserProfile }
  | { type: "set-glass-server-urls"; apiUrl: string; webUrl: string }
  | { type: "skip-glass-onboarding" }
  | { type: "session-start"; title?: string }
  | { type: "session-pause" }
  | { type: "session-resume" }
  | { type: "session-end" }
  | { type: "session-clear" }
  | { type: "session-capture" }
  | { type: "session-add-note"; text: string; sourceTitle?: string }
  | { type: "session-extract-insights" }
  | { type: "session-accept-insight"; id: string }
  | { type: "session-dismiss-insight"; id: string }
  | { type: "session-delete-event"; id: string }
  | { type: "session-save-insight-moment"; id: string }
  | { type: "session-send" }
  | { type: "session-send-event"; id: string }
  | { type: "session-send-insight"; id: string }
  | { type: "session-send-summary" }
  | { type: "session-open-in-iivo" }
  | { type: "session-analyze-now" }
  | { type: "view-council-on-web"; runId: string }
  /** @deprecated use session-open-in-iivo */
  | { type: "session-analyze-council" }
  // --- Session Copilot ---
  | { type: "copilot-set-mode"; mode: import("./copilotTypes.ts").GlassCopilotMode }
  | { type: "copilot-set-config"; patch: Partial<import("./copilotTypes.ts").GlassCopilotConfig> }
  | { type: "copilot-set-muted"; muted: boolean }
  | {
      type: "copilot-card-action";
      id: string;
      action: import("./copilotTypes.ts").GlassCopilotCardAction;
    }
  | { type: "copilot-accept-offer"; mode: import("./copilotTypes.ts").GlassCopilotMode }
  | { type: "copilot-dismiss-offer" }
  | { type: "copilot-generate-debrief" }
  | { type: "copilot-dismiss-debrief" }
  | { type: "copilot-open-debrief-in-iivo" }
  | { type: "copilot-dismiss-silence-warning" }
  | { type: "copilot-pause-system-audio" }
  | { type: "copilot-listening-limit-continue" }
  | { type: "copilot-listening-limit-stop" }
  | { type: "copilot-refine-session-type" }
  | { type: "copilot-dismiss-diagnostic-result" }
  | { type: "copilot-open-diagnostic-in-iivo" }
  | { type: "copilot-save-diagnostic-result" }
  | { type: "glass-update-check" }
  | { type: "glass-update-apply" }
  | { type: "glass-update-dismiss" }
  | {
      type: "e2e-set-app-update";
      update: Partial<import("./glassAppUpdate.ts").GlassAppUpdateState>;
    }
  | { type: "translate-set-config"; patch: Partial<import("./liveTranslateTypes.ts").LiveTranslateConfig> }
  | { type: "translate-start"; targetLanguage?: import("./liveTranslateTypes.ts").LiveTranslateTargetLanguage }
  | { type: "translate-stop" }
  | { type: "translate-set-captions-visible"; visible: boolean }
  | { type: "translate-enable-microphone"; enabled: boolean }
  | { type: "open-translate-setup" }
  | { type: "install-system-audio" }
  | { type: "connect-iivo-account"; connectToken: string }
  | { type: "disconnect-iivo-account" }
  // --- Meeting Intelligence ---
  | { type: "meeting-set-type"; subType: MeetingSubType }
  | { type: "meeting-delete-moment"; id: string }
  | { type: "meeting-add-moment"; momentType: import("./meetingIntelligenceTypes.ts").MeetingMomentType; content: string }
  // --- Wingman ---
  | { type: "wingman-start"; goal: string }
  | { type: "wingman-end" }
  | { type: "wingman-new-session" }
  | { type: "wingman-inspect"; prompt?: string }
  | { type: "wingman-add-note"; content: string }
  | { type: "wingman-search-sessions"; query: string }
  | { type: "wingman-terminal-toggle" }
  | { type: "wingman-agent-proxy-enable" }
  | { type: "wingman-agent-proxy-disable" }
  | { type: "wingman-agent-proxy-consent-grant" }
  | { type: "wingman-github-pat-save"; token: string }
  | { type: "wingman-github-pat-clear" }
  | { type: "wingman-github-pat-status" }
  // ── Test backdoors — only active when IIVO_GLASS_TEST=1 ──────────────────
  | { type: "wingman-debug-inject-inspection"; response?: string; prompt?: string }
  | { type: "wingman-debug-set-token-invalid" }
  | { type: "wingman-debug-get-session" }
  | { type: "wingman-debug-clear-state" }
  // ── Live Terminal Widget ──────────────────────────────────────────────────
  | { type: "terminal-widget-toggle" }
  | { type: "terminal-widget-move"; x: number; y: number }
  // --- Glass Q&A Memory ---
  | { type: "search-memory"; query: string }
  | { type: "get-recent-memory" }
  // ── Action Execution Engine ───────────────────────────────────────────────
  | { type: "run-shell"; command: string; id: string }
  | { type: "write-file"; path: string; content: string; id: string }
  | { type: "inject-keystrokes"; text: string; id: string; targetApp?: string }
  | { type: "cancel-shell"; id: string }
  // ── Glass built-in terminal (PTY) ─────────────────────────────────────────
  | { type: "glass-terminal-open" }
  | { type: "glass-terminal-close" }
  | { type: "glass-terminal-kill" }
  | { type: "glass-terminal-new-tab" }
  | { type: "glass-terminal-close-tab"; termId?: string }
  | { type: "glass-terminal-switch-tab"; termId: string }
  | { type: "glass-terminal-action"; action: import("./terminalPanelActions.ts").GlassTerminalPanelAction }
  // ── Context assembler ─────────────────────────────────────────────────────
  /** Hotkey-triggered: snapshot screen + window + terminal context, focus command bar */
  | { type: "glass-context-ask" }
  // ── Terminal auto-fix ─────────────────────────────────────────────────────
  /** User clicked "Fix it" on a terminal-fix overlay card — types fix into PTY */
  | { type: "glass-terminal-fix-accept"; termId: string; command: string }
  // ── Extract & Build Mode ────────────────────────────────────────────────────
  /** Start system-audio capture for Extract & Build Mode. */
  | { type: "extract-mode-start" }
  /** Stop Extract & Build Mode capture (may stop listening if mode started it). */
  | { type: "extract-mode-stop" }
  // ── Glass Powers palette ──────────────────────────────────────────────────
  /** ⌘⇧P — open / toggle the Glass Powers quick-launcher palette */
  | { type: "toggle-powers-palette" }
  /** Close the palette without invoking a power */
  | { type: "dismiss-powers-palette" }
  // ── Fix injection into editor (#160) ─────────────────────────────────────
  /**
   * User confirmed "Apply to file" on an overlay response card.
   * `feedItemId` is used to key the actionResult so the card shows feedback.
   * `filePath` is the absolute path captured from the code context snapshot.
   * `code` is the extracted code block content from the AI response.
   * `expectedHash` is the sha256 of the file content read at preview time —
   * if the file changed on disk since the preview, the write is aborted.
   */
  | { type: "glass-apply-fix-to-file"; feedItemId: string; filePath: string; code: string; expectedHash?: string }
  // ── Diff preview (#161) ───────────────────────────────────────────────────
  /**
   * User clicked "Apply to file" — main reads the current file, computes a
   * unified diff against `code`, and stores the result in
   * GlassState.pendingDiffs[feedItemId] as status "ready" or "error".
   * `code` is frozen here so the preview and the eventual apply use the same string.
   */
  | { type: "glass-preview-diff"; feedItemId: string; filePath: string; code: string }
  /** Dismiss a pending diff (Cancel button, or auto-dismissed after successful apply). */
  | { type: "glass-dismiss-diff"; feedItemId: string }
  // ── Build monitor (#162) ──────────────────────────────────────────────────
  /**
   * "Fix with AI" on a build-error card — reads the referenced source files,
   * builds a code-fix prompt, and submits through the normal AI ask flow.
   * The resulting response card has codeFilePath set so Apply to file works.
   */
  | { type: "glass-build-fix-ai"; feedItemId: string; errorText: string; errorFilePaths: string[] }
  // ── Design-to-Code Bridge (#163) ─────────────────────────────────────────
  /** One-click button in command bar: capture screen, detect editor, show design card. */
  | { type: "design-capture" }
  /** User clicked one of the 4 quick-action buttons on the design capture card. */
  | { type: "design-generate"; feedItemId: string; action: import("./designToCode.ts").DesignToCodeAction; refinementFeedback?: string }
  /** Permission prompt → Allow: read editor file then generate. */
  | { type: "design-grant-file-read"; feedItemId: string; action: import("./designToCode.ts").DesignToCodeAction }
  /** Permission prompt → Skip: generate without codebase context. */
  | { type: "design-skip-file-read"; feedItemId: string; action: import("./designToCode.ts").DesignToCodeAction }
  /** User changed the target framework/stack in the design card picker (#163-F). */
  | { type: "set-design-stack"; stack: import("./designToCode.ts").DesignStack }
  /** Restore latest .glass-backup-*.bak over the original file (undo apply). */
  | { type: "glass-restore-backup"; feedItemId: string; filePath: string }
  /** Run tsc --noEmit or npm run build in the dock terminal to verify a file write compiled. */
  | { type: "glass-verify-build"; feedItemId: string; filePath: string }
  // ── Custom slash commands (#165) ──────────────────────────────────────────
  /** User invoked a custom command from the powers palette. */
  | { type: "custom-command-run"; name: string }
  /** Renderer requests TTS — main calls ElevenLabs and plays audio back. */
  | { type: "glass-tts"; text: string }
  /** Sorting Hat placement complete — write persona + mark onboarding done. */
  | { type: "glass-onboarding-complete"; persona: "developer" | "sales" | "operator" | "writer" | "general" }
  /** User skipped onboarding — just mark complete with no persona set. */
  | { type: "glass-onboarding-skip" }
  /** Re-run Sorting Hat persona calibration (from Settings). */
  | { type: "glass-onboarding-recalibrate" }
  /** E2E — force Sorting Hat visible without wiping userData. */
  | { type: "e2e-open-sorting-hat" }
  /** Dev only — open Sorting Hat onboarding on the running app (keeps 8s manifest). */
  | { type: "dev-open-onboarding" };

export interface GlassState {
  privacy: PrivacyState;
  transcript: string;
  notes: ExtractedNotes;
  moments: SavedMoment[];
  panelTab: PanelTab;
  config: GlassConfig;
  lastError?: string;
  lastNotice?: string;
  lastSentUrl?: string;
  session: GlassSession | null;
  sessionSummary: string;
  sessionActionStatus: SessionActionStatus;
  transcriptionMode: TranscriptionMode;
  systemAudioStatus: SystemAudioStatus;
  systemAudioDetail?: string;
  windowContext: WindowContext;
  iivoAnalysis: IivoAnalysisState;
  stt: GlassSttState;
  panelVisible: boolean;
  windows: GlassWindowState;
  operationDiagnostics: GlassOperationDiagnostics;
  commandFeed: GlassCommandFeedItem[];
  /** Measured command bar stack height (accessories + composer). */
  commandBarStackHeightPx?: number;
  /** Distance from overlay work-area bottom to top of command bar stack (for response card clearance). */
  commandBarOverlayClearancePx?: number;
  askStatus: GlassAskStatus;
  /** Accumulated partial answer while streaming (cleared when done/error). */
  partialAnswer?: string;
  lastAskResponse?: GlassLastAskResponse;
  latestScreenshot?: GlassLatestScreenshotState | null;
  screenContextStatus?: GlassScreenContextStatus;
  visualAskRetention?: GlassVisualAskRetention | null;
  visualAskPayloadDiagnostics?: import("./glassScreenContext.ts").VisualAskPayloadDiagnostics | null;
  visualAskDiagnostics?: import("./visualAskDiagnostics.ts").VisualAskDiagnostics | null;
  glassSettings: GlassUserSettings;
  availableDisplayIds: number[];
  connectedDisplays: ConnectedDisplaySnapshot[];
  setupCapabilities: import("./glassCapabilities.ts").GlassCapabilityRow[];
  setupCheckSummary?: string;
  captureDiagnosticsReport?: import("./captureDiagnostics.ts").CaptureDiagnosticsReport;
  appIdentityReport?: import("./glassAppIdentityReport.ts").GlassAppIdentityReport;
  duplicateAppBundles?: import("./glassAppIdentityReport.ts").DuplicateGlassAppBundle[];
  duplicateAppWarning?: string;
  virtualAudioDevices?: import("./virtualAudioDevices.ts").VirtualAudioDeviceMatch[];
  selectedVirtualAudioDeviceId?: string;
  micPermission: import("./glassCapabilities.ts").MicPermissionReport;
  copilot: import("./copilotTypes.ts").GlassCopilotRuntimeState;
  /** Incremented when the panel requests Voice Mode; the command bar starts it. */
  voiceModeStartNonce?: number;
  /** Incremented to open Live Translate setup in the Copilot panel (command bar parity). */
  translateSetupRequestId?: number;
  /** Latest media/page context for Listen mode (text metadata only). */
  mediaContext?: import("./mediaContextTypes.ts").MediaContext | null;
  appUpdate: import("./glassAppUpdate.ts").GlassAppUpdateState;
  /** Seconds remaining before listening starts; undefined when idle. */
  listenCountdownSeconds?: number;
  /** Structured live notes for Listen mode (note-first UI). */
  listenLiveNotes?: import("./listenLiveNotes.ts").ListenLiveNotesState;
  /** Live Translate captions runtime (separate from Listen notes). */
  liveTranslate?: import("./liveTranslateTypes.ts").LiveTranslateRuntimeState;
  /** First-run calibration modal blocks chrome until complete or skipped. */
  onboardingOpen: boolean;
  /** Whether first-launch onboarding has been completed. */
  onboardingComplete?: boolean;
  /** Boot splash finished — Sorting Hat must not mount or speak until true. */
  glassBootComplete?: boolean;
  /** The persona assigned during onboarding. */
  persona?: "developer" | "sales" | "operator" | "writer" | "general";
  /** Epoch ms when Sorting Hat last finished — suppresses greeting TTS overlap. */
  onboardingFinishedAt?: number;
  /** E2E — shorten Sorting Hat manifest delays. */
  e2eFastOnboarding?: boolean;
  /** Unpackaged Electron dev build — unlocks builder strip for local testing. */
  glassDevMode?: boolean;
  /** Audio chunk from TTS — base64 encoded mp3, played by renderer then cleared. */
  ttsAudio?: { id: string; data: string };
  glassUserProfile: import("./glassUserProfile.ts").GlassUserProfile | null;
  /** Progress of the one-click BlackHole + Multi-Output Device install flow. */
  blackHoleInstallStatus?: "idle" | "downloading" | "installing" | "configuring" | "done" | "error";
  /** Human-readable progress label for the install flow. */
  blackHoleInstallProgress?: string;
  /** Linked IIVO account (set after user pastes a connect token). */
  iivoAccountLink: import("./iivoAccountLink.ts").IivoAccountLink | null;
  /** Live Meeting Intelligence runtime (populated only when meetings mode is active). */
  meetingIntelligence?: MeetingIntelligenceState;
  /**
   * Active IIVO API server URL (resolved from saved settings or env var).
   * Exposed so the Settings UI can display and edit the current value.
   */
  iivoApiUrl: string;
  /**
   * Active IIVO web app URL (resolved from saved settings or env var).
   * Exposed so the Settings UI can display and edit the current value.
   */
  iivoWebUrl: string;
  /** Wingman Mode — active work companion session state. */
  wingman: WingmanState;
  /** Wingman cross-session memory — search results + library stats. */
  wingmanMemory: WingmanMemoryState;
  /** Agent proxy — local HTTP proxy for AI agent API interception. */
  agentProxy: AgentProxyState;
  /** GitHub integration — whether a valid PAT is stored. */
  githubPATConfigured: boolean;
  /** Set true if the last GitHub API call rejected the stored PAT. */
  githubTokenInvalid: boolean;
  /** Live terminal feed — always-on polling of frontmost terminal output. */
  liveTerminal: LiveTerminalFeed | null;
  /** Whether the floating terminal widget is visible in the overlay. */
  terminalWidgetVisible: boolean;
  /** Position of the floating terminal widget (percent of screen). */
  terminalWidgetPos: { x: number; y: number };
  /** Last known clipboard text content (polled every 2 s, silent). */
  clipboardText?: string;
  /** Name of the frontmost app (e.g. "Cursor", "Chrome"), updated on each app switch. */
  activeApp?: string;
  /** App that was frontmost before Glass itself took focus — used for keystroke injection target. */
  previousApp?: string;
  /** One-sentence digest of what the user is working on right now (ambient screen intelligence). */
  workingContext?: string;
  /** Unix ms timestamp of the last workingContext update. */
  workingContextAge?: number;
  /** Results from the last search-memory or get-recent-memory command. */
  memoryResults?: GlassMemoryEntry[];
  /**
   * Pending diff previews keyed by feed item id (#161).
   * Populated by glass-preview-diff; cleared by glass-dismiss-diff or on successful apply.
   */
  pendingDiffs?: Record<string, {
    feedItemId: string;
    filePath: string;
    status: "loading" | "ready" | "error";
    /** Unified diff (present when status === "ready"). */
    diff?: import("./diff.ts").UnifiedDiff;
    /** Context-collapsed display lines precomputed in main (present when status === "ready"). */
    displayLines?: import("./diff.ts").DiffLine[];
    /** sha256 of the file content read at preview time; checked again at apply time. */
    contentHash?: string;
    /** Whether the file existed on disk (false → new-file creation, all-add diff). */
    fileExisted?: boolean;
    /** The frozen code string to apply (extracted at preview-request time). */
    code?: string;
    /** Error or notice message. */
    message?: string;
  }>;
  /** Running shell commands and their streaming output. */
  shellOutputs?: Record<string, {
    id: string;
    command: string;
    output: string;
    status: "running" | "done" | "error";
    exitCode?: number;
  }>;
  /** Result of the most recent write-file, inject-keystrokes, apply-fix, or restore action. */
  actionResult?: {
    id: string;
    type: "write-file" | "inject-keystrokes" | "apply-fix" | "restore-backup";
    status: "ok" | "error";
    message: string;
  };
  // ── Design-to-Code Bridge (#163) ─────────────────────────────────────────
  /** Active design capture cards keyed by feed item id. */
  designCaptures?: Record<string, {
    feedItemId: string;
    /** data: URL thumbnail of the captured screen. */
    imageDataUrl: string;
    /** Editor file detected at capture time. Null if no editor was open. */
    detectedFile?: { fileName: string; filePath: string | null; language: string } | null;
    /** Current phase for transparency status display. */
    phase: "ready" | "permission" | "reading" | "generating" | "done";
    /** Which action is mid-flight. */
    pendingAction?: import("./designToCode.ts").DesignToCodeAction;
    /** Refinement feedback pending through a permission dialog. */
    pendingRefinementFeedback?: string;
    /** Human-readable status line shown in the card, e.g. "Reading Button.tsx…" */
    statusLine?: string;
  }>;
  /** Build verification status keyed by feed item id (#163). */
  buildVerifications?: Record<string, {
    feedItemId: string;
    status: "running" | "ok" | "failed" | "not-found";
    /** The command that was run (or attempted), e.g. "tsc --noEmit" */
    command: string;
  }>;
  // ── Glass built-in terminal ────────────────────────────────────────────────
  /** Whether the dock terminal panel is currently open. */
  glassDockTerminalOpen?: boolean;
  /** Active PTY session id (set while terminal is running). */
  glassDockTerminalId?: string;
  /** Open PTY tabs — active id is glassDockTerminalId. */
  glassDockTerminalTabs?: import("./terminalPanelActions.ts").GlassTerminalTab[];
  /** One-shot action for the terminal renderer (⌘⇧P, etc.). */
  glassTerminalPendingAction?: import("./terminalPanelActions.ts").GlassTerminalPendingAction;
  // ── Glass Powers palette ───────────────────────────────────────────────────
  /** Whether the ⌘⇧P powers quick-launcher is currently visible. */
  powersPaletteOpen?: boolean;
  // ── Custom commands (#165) ─────────────────────────────────────────────────
  /** User-defined slash commands loaded from ~/.iivo/glass-commands.json. */
  customCommands?: import("../shared/customCommands.ts").CustomCommand[];
  /** Validation warnings from the last custom commands config load. */
  customCommandsWarnings?: string[];
  /** True while Extract & Build Mode is capturing system audio in main. */
  extractBuildModeActive?: boolean;
}

export interface LiveTerminalLine {
  text: string;
  /** "command" = shell prompt+command, "output" = stdout, "error" = stderr/error line, "system" = Glass annotation */
  kind: "command" | "output" | "error" | "system";
  ts: number;
}

export interface LiveTerminalFeed {
  lines: LiveTerminalLine[];
  /** The most recently detected running command (null if idle). */
  activeCommand: string | null;
  /** Exit code of the last completed command (null if still running or unknown). */
  lastExitCode: number | null;
  /** True = last command succeeded (exit 0), false = failed, null = unknown. */
  lastExitSuccess: boolean | null;
  /** Name of the terminal app being read (e.g. "Ghostty", "Terminal"). */
  appName: string | null;
}

export interface AgentProxyState {
  /** Whether the user has granted consent for agent interception. */
  consented: boolean;
  /** Whether the proxy server is currently running. */
  running: boolean;
  /** The port the proxy is listening on (when running). */
  port: number;
  /** Whether the consent modal should be shown. */
  showConsentModal: boolean;
  /** Total number of agent API calls captured this session. */
  capturedCallCount: number;
}

export interface SttProcessChunkRequest {
  buffer: ArrayBuffer;
  mimeType: string;
  source: "microphone" | "system_audio";
  sessionId?: string;
}

export interface SttProcessChunkResponse {
  ok: boolean;
  text?: string;
  error?: string;
  eventId?: string;
}

// ── Extract & Build Mode ──────────────────────────────────────────────────────

/** Stage-1: detect if transcript chunk contains "how to build X" content. */
export interface ExtractDetectRequest {
  /** Recent transcript text to analyze (last ~2 min of audio). */
  transcript: string;
}

export interface ExtractDetectResponse {
  /** 4-6 word label describing what's being built, e.g. "AI agents for enterprise companies". Null if no build content detected. */
  label: string | null;
  error?: string;
}

/** Stage-2: generate grand master build prompt from full accumulated transcript. */
export interface ExtractGenerateRequest {
  /** Full accumulated transcript text. */
  transcript: string;
  /** The detected label for context. */
  detectedLabel?: string;
}

export interface ExtractGenerateResponse {
  /** The grand master build prompt ready to paste into Cursor/Claude Code. */
  prompt?: string;
  error?: string;
}

export interface ExtractBuildHandoffRequest {
  target: import("./extractBuildHandoff.ts").ExtractBuildTarget;
  prompt: string;
}

export interface ExtractBuildHandoffResponse {
  ok: boolean;
  pasted: boolean;
  notice?: string;
  error?: string;
  /** True when Accessibility settings were opened to help the user grant paste permission. */
  openedAccessibilitySettings?: boolean;
}
