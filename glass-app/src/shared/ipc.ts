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
  /** Renderer → main: pointer over the debrief side panel (text select / scroll). */
  overlayPointerOverDebriefPanel: "glass:overlay-pointer-over-debrief-panel",
  /** Renderer → main: builder strip mounted/unmounted (guards pointer-over IPC). */
  builderStripVisible: "glass:builder-strip-visible",
  /** Renderer → main: pointer entered/left the builder strip (Prompts / Keys). */
  overlayPointerOverBuilderStrip: "glass:overlay-pointer-over-builder-strip",
  /** Renderer → main: pointer entered/left the Glass IDE shell (splits, tree, composer). */
  overlayPointerOverIde: "glass:overlay-pointer-over-ide",
  /** Renderer → main: pointer entered/left the Exit Glass control (top-right). */
  overlayPointerOverExitControl: "glass:overlay-pointer-over-exit-control",
  /** Renderer → main: builder strip panel (Prompts/Keys) open — keep overlay interactive. */
  builderStripPanelOpen: "glass:builder-strip-panel-open",
  aletheiaStripMenuOpen: "glass:aletheia-strip-menu-open",
  /** Renderer → main: Glass Response Panel open — keep overlay interactive. */
  responsePanelOpen: "glass:response-panel-open",
  /** Renderer → main: Session Copilot overlay card (debrief, diagnostic, offer) visible. */
  copilotOverlayCardOpen: "glass:copilot-overlay-card-open",
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
  /** Renderer → main: primary chrome renderer has React mounted and painted (dev primary mode). */
  rendererMounted: "glass:renderer-mounted",
  /** Main → renderer: companion privacy timer expired — speak resume line. */
  companionPrivacyResumed: "glass:companion-privacy-resumed",
  /** Main → renderer: Deepgram final transcript for companion mic (diarized). */
  companionDeepgramFinal: "glass:companion-deepgram-final",
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
  /** Panel → main: masked key display (never returns raw value). */
  apiKeyGetMasked: "glass:api-key-get-masked",
  /** Renderer → main: save (create or update) a key. Payload: { meta, value }. */
  apiKeySave: "glass:api-key-save",
  /** Renderer → main: delete a key by id. */
  apiKeyDelete: "glass:api-key-delete",
  /** Activation window → main: validate + store Anthropic key (main process only). */
  activationConnect: "glass:activation-connect",
  /** Activation window → main: open Anthropic keys page in browser. */
  activationOpenKeysUrl: "glass:activation-open-keys-url",
  /** Activation window → main: quit without connecting a key. */
  activationQuit: "glass:activation-quit",
  /** Activation window → main: fullscreen form vs compact key-wait rail. */
  activationSetPresentation: "glass:activation-set-presentation",
  /** Activation window → main: fetch TTS audio (base64 mp3) for Aletheia lines. */
  activationSpeak: "glass:activation-speak",
  /** Activation window → main: FAQ help while user is in the browser. */
  activationAskHelp: "glass:activation-ask-help",
  /** Panel or activation → main: live-validate and store Anthropic key. */
  anthropicKeyConnect: "glass:anthropic-key-connect",
  /** Panel → main: live-validate and store OpenAI key. */
  openaiKeyConnect: "glass:openai-key-connect",
  /** Settings panel → main: test custom provider before saving. */
  providerTestConnection: "glass:provider-test-connection",
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
  // ── Terminal Auto Fix (Task #65) ────────────────────────────────────────────
  /**
   * Renderer (terminal window) → main: given a failed command + output, ask Claude
   * for a corrected command, 1-line diagnosis, and what changed.
   */
  terminalFix: "glass:terminal-fix",
  // ── Glass Command Palette (Task #66) ─────────────────────────────────────────
  /** Renderer → main: get all palette sections populated with live data. */
  paletteGetSections: "glass:palette-get-sections",
  /** Renderer → main (fire-and-forget): record that an item was actioned. */
  paletteRecordUse: "glass:palette-record-use",

  // ── Glass Agents ─────────────────────────────────────────────────────────────
  /** Renderer → main: start an agent loop. Returns AgentRunResponse. */
  agentRun: "glass:agent-run",
  /** Renderer → main (fire-and-forget): abort the active agent loop. */
  agentStop: "glass:agent-stop",
  /** Main → renderer (broadcast): streaming event from the active agent. */
  agentEvent: "glass:agent-event",
  /** Renderer → main: open a folder picker for the agent output directory. */
  agentPickOutputFolder: "glass:agent-pick-output-folder",
  /** Renderer → main: open a folder picker for the code-agent workspace root. */
  agentPickWorkspaceRoot: "glass:agent-pick-workspace-root",
  /** Renderer → main: open a file with the default app. */
  agentOpenPath: "glass:agent-open-path",
  /** Renderer → main: reveal a file or folder in Finder. */
  agentRevealPath: "glass:agent-reveal-path",
  /** Renderer → main: approve or skip a pending Glass Coder write. */
  agentApprove: "glass:agent-approve",
  /** Renderer → main: trust or skip remaining Coder edits for a run. */
  agentSetApprovalMode: "glass:agent-set-approval-mode",
  /** Renderer → main: close Coder workspace (restore dock + command bar). */
  coderWorkspaceClose: "glass:coder-workspace-close",
  /** Renderer → main: open Research Explorer full-screen (hides dock + command bar). */
  openResearchExplorer: "glass:open-research-explorer",
  /** Renderer → main: close Research Explorer (restores dock + command bar). */
  closeResearchExplorer: "glass:close-research-explorer",
  /** Renderer → main: Research Explorer UI mounted — force overlay clicks + focus. */
  researchExplorerMounted: "glass:research-explorer-mounted",
  /** Renderer → main: open Code Analyst full-screen workspace. */
  openCodeAnalystExplorer: "glass:open-code-analyst-explorer",
  /** Renderer → main: hide Code Analyst workspace (state persists in renderer). */
  closeCodeAnalystExplorer: "glass:close-code-analyst-explorer",
  /** Renderer → main: Code Analyst workspace mounted — force overlay clicks + focus. */
  codeAnalystExplorerMounted: "glass:code-analyst-explorer-mounted",
  /** Renderer → main: open Writing Studio full-screen workspace. */
  openWritingStudio: "glass:open-writing-studio",
  /** Renderer → main: hide Writing Studio (state persists in renderer). */
  closeWritingStudio: "glass:close-writing-studio",
  /** Renderer → main: Writing Studio mounted — force overlay clicks + focus. */
  writingStudioMounted: "glass:writing-studio-mounted",
  /** Renderer → main: reload saved projects index from disk into shared state. */
  refreshGlassStorageProjects: "glass:refresh-glass-storage-projects",
  /** Renderer → main: open Glass Storage Projects full-screen workspace. */
  openGlassStorageProjects: "glass:open-glass-storage-projects",
  /** Renderer → main: hide Glass Storage Projects workspace. */
  closeGlassStorageProjects: "glass:close-glass-storage-projects",
  /** Renderer → main: Glass Storage Projects mounted — force overlay clicks + focus. */
  glassStorageProjectsMounted: "glass:glass-storage-projects-mounted",
  /** Renderer → main: thumbnail data URL for a saved Glass Storage project. */
  getGlassStorageProjectThumb: "glass:get-glass-storage-project-thumb",
  /** Renderer → main: full detail for a saved Glass Storage project. */
  getGlassStorageProjectDetail: "glass:get-glass-storage-project-detail",
  /** Renderer → main: reveal saved project folder in Finder. */
  revealGlassStorageProject: "glass:reveal-glass-storage-project",
  /** Renderer → main: reload user-uploaded files in Glass Storage → Files. */
  refreshGlassStorageFiles: "glass:refresh-glass-storage-files",
  /** Renderer → main: open file picker and import into Glass Storage → Files. */
  pickAndImportGlassStorageFiles: "glass:pick-and-import-glass-storage-files",
  /** Renderer → main: import absolute paths (drag-drop) into Glass Storage → Files. */
  importGlassStorageFiles: "glass:import-glass-storage-files",
  /** Renderer → main: delete one uploaded file. */
  deleteGlassStorageFile: "glass:delete-glass-storage-file",
  /** Renderer → main: reveal uploaded file in Finder. */
  revealGlassStorageFile: "glass:reveal-glass-storage-file",
  /** Main → dashboard renderer: agent bus events for live panels. */
  dashboardAgentEvent: "glass:dashboard-agent-event",
  /** Renderer → main: open Glass Dashboard fullscreen in overlay. */
  openGlassDashboard: "glass:open-glass-dashboard",
  /** Renderer → main: close Glass Dashboard overlay. */
  closeGlassDashboard: "glass:close-glass-dashboard",
  /** Renderer → main: dashboard mounted — assert overlay focus. */
  glassDashboardMounted: "glass:glass-dashboard-mounted",
  /** Renderer → main: open Aletheia Dashboard fullscreen in overlay. */
  openAletheiaDashboard: "glass:open-aletheia-dashboard",
  /** Renderer → main: close Aletheia Dashboard overlay. */
  closeAletheiaDashboard: "glass:close-aletheia-dashboard",
  /** Renderer → main: Aletheia dashboard mounted — assert overlay focus. */
  aletheiaDashboardMounted: "glass:aletheia-dashboard-mounted",
  /** Dashboard → main: recent sessions from SQLite. */
  getRecentSessions: "glass:get-recent-sessions",
  getSessionMessages: "glass:get-session-messages",
  getLastCouncilRun: "glass:get-last-council-run",
  getAgentRunsByCorrelation: "glass:get-agent-runs-by-correlation",
  getUserContext: "glass:get-user-context",
  deleteUserContextKey: "glass:delete-user-context-key",
  /** Dashboard → main: 7-day retention rollup from local SQLite. */
  getRetentionSummary: "glass:get-retention-summary",
  /** Dashboard → main: agent event bus subscriber health snapshot. */
  getAgentBusHealth: "glass:get-agent-bus-health",
  /** Dashboard → main: per-session model spend from SQLite. */
  getSessionSpend: "glass:get-session-spend",
  // ── Aletheia Dashboard IPC (distinct from Glass Dashboard channels) ─────
  /** Aletheia dashboard → main: recent sessions (last 10, no privileged fields). */
  getAletheiaRecentSessions: "glass:aletheia-get-recent-sessions",
  /** Aletheia dashboard → main: session messages for continuity context. */
  getAletheiaSessionMessages: "glass:aletheia-get-session-messages",
  /**
   * Aletheia dashboard → main: Aletheia companion session history for recap panel.
   * Returns recent AletheiaSessionRow list (max 20). Gated to Aletheia window only.
   */
  getAletheiaSessionHistory: "glass:aletheia-get-session-history",
  /**
   * Glass Memory admin → main: wipe all Aletheia companion session rows.
   * GLASS DASHBOARD ONLY — must never be registered in aletheiaDashboardIpc.ts.
   */
  deleteAletheiaSessionHistory: "glass:aletheia-delete-session-history",
  /** Settings renderer → main: initial section when opened via deep link. */
  getSettingsInitialSection: "glass:get-settings-initial-section",
  /** Renderer → main: open Glass Settings window. */
  openGlassSettings: "glass:open-glass-settings",
  /** Renderer → main: close Glass Settings window. */
  closeGlassSettings: "glass:close-glass-settings",
  /** Settings renderer → main: app version string. */
  getAppVersion: "glass:get-app-version",
  getSentryDsn: "glass:get-sentry-dsn",
  /** Settings renderer → main: open URL in default browser. */
  settingsOpenExternal: "glass:settings-open-external",
  /** Renderer → main: open Glass IDE shell (Glass Coder transform). */
  glassIdeOpen: "glass:ide-open",
  /** Renderer → main: exit Glass IDE shell. */
  glassIdeClose: "glass:ide-close",
  /** Renderer → main: set IDE live preview URL (localhost only). */
  glassIdePreviewSetUrl: "glass:ide-preview-set-url",
  /** Renderer → main: reload IDE live preview. */
  glassIdePreviewReload: "glass:ide-preview-reload",
  /** Renderer → main: list project files for IDE file browser. */
  glassIdeListProject: "glass:ide-list-project",
  /** Renderer → main: read a project file for IDE viewer. */
  glassIdeReadProjectFile: "glass:ide-read-project-file",
  /** Renderer → main: write an existing project file from IDE editor. */
  glassIdeWriteProjectFile: "glass:ide-write-project-file",
  /** Renderer → main: read tsconfig/jsconfig for IDE TypeScript intelligence. */
  glassIdeReadTsConfig: "glass:ide-read-tsconfig",
  /** Renderer → main: set workspace from recent list (no dialog). */
  glassIdeSelectWorkspace: "glass:ide-select-workspace",
  /** Renderer → main: create a new project folder and set it as the Coder workspace. */
  glassIdeCreateProject: "glass:ide-create-project",
  /** Renderer → main: load project TS/JS files for Monaco extra libs (light LSP). */
  glassIdeProjectLibs: "glass:ide-project-libs",
  /** Renderer → main: line-level ghost text completion for IDE editor. */
  glassIdeGhostSuggest: "glass:ide-ghost-suggest",
  /** Renderer → main: sync active Monaco editor context for voice/agents. */
  glassIdeEditorContextUpdate: "glass:ide-editor-context-update",
  /** Main → overlay: open a project file in the IDE editor. */
  glassIdeOpenFile: "glass:ide-open-file",
  /** Renderer → main: persist Glass IDE layout split sizes. */
  glassIdeLayoutSet: "glass:ide-layout-set",
  /** Renderer → main: persist Glass Coder panel width. */
  coderPanelSetWidth: "glass:coder-panel-set-width",
  /** Renderer → main: restore the latest Glass backup for a file. */
  agentRestoreBackup: "glass:agent-restore-backup",
  /** Renderer → main: start indexing a project root. */
  indexStart: "glass:index-start",
  /** Main → renderer: indexing progress. */
  indexProgress: "glass:index-progress",
  /** Main → renderer: indexing complete. */
  indexDone: "glass:index-done",
  /** Main → renderer: indexing error. */
  indexError: "glass:index-error",
  /** Renderer → main: get index status. */
  indexStatus: "glass:index-status",
  /** Renderer → main: screenshot + detect active editor file. */
  detectScreenFile: "glass:detect-screen-file",
  /** Main → renderer: screen file detection result. */
  screenFileResult: "glass:screen-file-result",
  /** Main → renderer: open Glass Coder with pre-filled prompt. */
  openCoderWithPrompt: "glass:open-coder-with-prompt",
  /** Renderer → main: generate GLASS_CONTEXT.md via Code Analyst. */
  generateProjectMemory: "glass:generate-project-memory",
  /** Renderer → main: cancel in-progress project memory generation. */
  cancelProjectMemory: "glass:cancel-project-memory",
  /** Renderer → main: start Aletheia Video Watch Mode on a display. */
  videoWatchStart: "glass:video-watch-start",
  /** Renderer → main: stop Video Watch Mode. */
  videoWatchStop: "glass:video-watch-stop",
  /** Renderer → main: Video Watch Mode status snapshot. */
  videoWatchStatus: "glass:video-watch-status",
  /** Renderer → main: current Video Watch buffer (or null). */
  videoWatchBuffer: "glass:video-watch-buffer",
  /** Renderer → main: re-run Coder with typecheck errors. */
  coderVerifyFix: "glass:coder-verify-fix",
  /** Renderer → main: re-run Coder with review findings. */
  coderReviewFix: "glass:coder-review-fix",
  /** Renderer → main: dismiss code review card. */
  coderReviewDismiss: "glass:coder-review-dismiss",
  /** Renderer → main: toggle QA Mode. */
  qaModeToggle: "glass:qa-mode-toggle",
  /** Renderer → main: toggle QA auto-fix. */
  qaAutoFixToggle: "glass:qa-auto-fix-toggle",
  /** Renderer → main: toggle QA pipeline TTS progress narration. */
  qaSpeakProgressToggle: "glass:qa-speak-progress-toggle",
  /** Renderer → main: toggle IDE line-level ghost text. */
  coderGhostTextToggle: "glass:coder-ghost-text-toggle",
  /** Renderer → main: restore files from latest loop-fix checkpoint. */
  coderRollbackCheckpoint: "glass:coder-rollback-checkpoint",
  /** Main → overlay: show QA Mode entry notification (first toggle per session). */
  showQaModeNotification: "glass:show-qa-notification",
  /** Renderer → main: dismiss QA Mode notification. */
  dismissQaModeNotification: "glass:dismiss-qa-notification",
  /** Main → renderer: QA pipeline check updates. */
  qaPipelineUpdate: "glass:qa-pipeline-update",
  /** Renderer → main: fix all QA failures with Glass Coder. */
  qaPipelineFixAll: "glass:qa-pipeline-fix-all",
  /** Main → overlay: probe preview webview for console errors. */
  idePreviewProbe: "glass:ide-preview-probe",
  /** Overlay → main: preview probe result. */
  idePreviewProbeResult: "glass:ide-preview-probe-result",
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

export interface ApiKeyMaskedResponse {
  masked: string | null;
}

export interface ApiKeyMutateResponse {
  ok: boolean;
  error?: string;
}

export interface ActivationConnectResponse {
  ok: boolean;
  error?: string;
}

export type ActivationPresentation = "form" | "key-wait";

export interface ActivationSpeakResponse {
  ok: boolean;
  data?: string;
}

export interface ActivationAskHelpResponse {
  ok: boolean;
  answer: string;
}

/** Forwarded from Agent Event Bus → dashboard window. */
export interface GlassDashboardAgentEvent {
  eventId: string;
  type: string;
  sourceAgentId: string;
  payload: unknown;
  timestamp: string;
  runId: string;
  correlationId: string;
}

export interface ProviderTestConnectionRequest {
  baseUrl: string;
  apiKey: string;
}

export interface ProviderTestConnectionResponse {
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
  | { type: "start"; mode?: TranscriptionMode }
  | { type: "stop" }
  | { type: "probe-microphone" }
  | { type: "probe-virtual-audio-devices" }
  | { type: "startup-audio-restore" }
  | { type: "deepgram-whisper-fallback"; scope: "translate" | "listen" | "meetings" | "watch" | "companion" }
  | { type: "listen-deepgram-start" }
  | { type: "meetings-deepgram-start" }
  | { type: "video-watch-audio-start" }
  | { type: "video-watch-audio-stop" }
  | { type: "connect-system-audio" }
  | { type: "test-system-audio" }
  | { type: "test-blackhole" };

export type GlassCommand =
  | { type: "capture-screen" }
  | { type: "capture-screen-only" }
  | { type: "start-listening" }
  | { type: "pause"; reason?: "user" | "auto" }
  | { type: "stop" }
  | { type: "stop-everything"; origin?: "strip" }
  | { type: "request-start-listening" }
  | { type: "activate-listen-mode" }
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
  | {
      type: "submit-command";
      text: string;
      lensContext?: import("./glassLensContext.ts").GlassLensContext;
      /** Phase 4a — Companion route hint from renderer auto-submit. */
      companionRoute?: import("./companionRetarget.ts").CompanionRoute;
    }
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
  | { type: "set-dock-placement"; placement: GlassUserSettings["dockPlacement"] }
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
  | { type: "clear-dashboard-nav" }
  | { type: "set-capture-sub-tab"; subTab: import("./panelTabRouting.ts").CaptureSubTab }
  | { type: "toggle-panel" }
  | { type: "hide-notes-pad" }
  | { type: "toggle-overlay" }
  | { type: "set-overlay-mode"; mode: OverlayMode }
  | { type: "window-context-refresh" }
  | { type: "capture-media-context" }
  | { type: "run-setup-check"; silent?: boolean; forceCaptureProbe?: boolean }
  | { type: "run-capture-diagnostics" }
  | { type: "clear-last-notice" }
  | { type: "clear-recovery-toast" }
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
  /**
   * L2.4 — Persist one or more consent checkpoint flags.
   * Renderer sends this when the user checks/unchecks a consent box.
   * Main merges the flags into glassOnboardingStore without touching profile
   * or completion state.
   */
  | {
      type: "persist-consent-flags";
      flags: Partial<{
        consentMicAck: boolean;
        consentScreenAck: boolean;
        consentRecordingAck: boolean;
        consentTosAck: boolean;
      }>;
    }
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
  | { type: "glass-quit" }
  | { type: "glass-update-check" }
  | { type: "glass-update-apply" }
  | { type: "glass-update-dismiss" }
  | {
      type: "e2e-set-app-update";
      update: Partial<import("./glassAppUpdate.ts").GlassAppUpdateState>;
    }
  /** E2E only — surface a build-from-audio overlay card without running extraction. */
  | { type: "e2e-surface-build-from-audio-card"; prompt?: string }
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
  /** P0.1 — confirm a pending Aletheia action intent after review. */
  | { type: "confirm-aletheia-action"; intentId: string }
  /** P0.1 — reject a pending Aletheia action intent. */
  | { type: "reject-aletheia-action"; intentId: string }
  /** P0.4 — dismiss permission revocation banner in Aletheia dashboard. */
  | { type: "dismiss-aletheia-permission-alert" }
  /** P0.3 — dismiss sidecar degradation banner in Aletheia dashboard. */
  | { type: "dismiss-aletheia-sidecar-alert" }
  /** P0.5 — re-run Aletheia dependency bootstrap pass. */
  | { type: "run-aletheia-bootstrap" }
  /** B2.1 — approve a pending Aletheia advice card (does not execute — waits for B2.2). */
  | { type: "approve-aletheia-advice"; adviceId: string }
  /** B2.1 — dismiss a pending Aletheia advice card without acting. */
  | { type: "dismiss-aletheia-advice"; adviceId: string }
  /** B2.2 — modify a pending Aletheia action before confirmation. */
  | { type: "modify-aletheia-action"; intentId: string; modifier: string }
  /** B3.3 — continue a paused delegated loop after a decision point. */
  | { type: "continue-aletheia-loop" }
  /** B3.3 — cancel an in-progress delegated loop. */
  | { type: "cancel-aletheia-loop" }
  /** Computer operator — activate Aletheia, permissions, grant card or auto-run. */
  | {
      type: "prepare-aletheia-computer-operator";
      goal?: string;
      surface?: import("./aletheiaComputerOperatorLoop.ts").ComputerOperatorEntrySurface;
    }
  /** Computer operator — start from conversation goal. */
  | { type: "start-aletheia-computer-operator"; goal?: string }
  /** Computer operator — grant bounded session and run loop. */
  | {
      type: "grant-aletheia-computer-session";
      loopId: string;
      goal?: string;
      alwaysAllow?: boolean;
    }
  /** Computer operator — cancel in-progress operator loop. */
  | { type: "cancel-aletheia-computer-operator" }
  /** Computer operator — clear terminal complete/failed snapshot from UI. */
  | { type: "dismiss-aletheia-computer-operator" }
  /** Computer operator — revoke a saved always-allow grant. */
  | { type: "revoke-aletheia-computer-persistent-grant"; grantId: string }
  /** Aletheia — task-scoped “use computer for this task” routing hint. */
  | { type: "set-aletheia-use-computer-for-next-task"; enabled: boolean }
  /** Aletheia — shortcut: enable computer hint, activate if needed, focus command bar. */
  | { type: "aletheia-use-computer-shortcut" }
  /** B3.4 — follow-up action on an active research conversation thread. */
  | { type: "aletheia-research-follow-up"; action: import("./aletheiaResearchConversation.ts").ResearchFollowUpAction }
  | { type: "add-aletheia-note"; body: string; category?: import("./aletheiaNotes.ts").AletheiaNoteCategory }
  | { type: "update-aletheia-note"; noteId: string; body: string }
  | { type: "delete-aletheia-note"; noteId: string }
  /** B7 — clear an active security containment hold after user review. */
  | { type: "dismiss-aletheia-security-containment" }
  /** B8 — founder-only Deployed Execution invoke / deactivate. */
  | { type: "invoke-aletheia-deployed-execution" }
  | { type: "deactivate-aletheia-deployed-execution" }
  /** E2E — patch GlassState fields for deterministic dashboard tests. */
  | { type: "e2e-set-state"; patch: Partial<GlassState> }
  // ── Glass built-in terminal (PTY) ─────────────────────────────────────────
  | { type: "glass-terminal-open" }
  | { type: "glass-terminal-close" }
  | { type: "glass-terminal-kill" }
  | { type: "glass-terminal-new-tab" }
  | { type: "glass-terminal-close-tab"; termId?: string }
  | { type: "glass-terminal-switch-tab"; termId: string }
  | { type: "glass-terminal-action"; action: import("./terminalPanelActions.ts").GlassTerminalPanelAction }
  | { type: "glass-terminal-pending-action-ack" }
  // ── Context assembler ─────────────────────────────────────────────────────
  /** Hotkey-triggered: snapshot screen + window + terminal context, focus command bar */
  | { type: "glass-context-ask" }
  // ── Terminal auto-fix ─────────────────────────────────────────────────────
  /** User clicked "Fix it" on a terminal-fix overlay card — types fix into PTY */
  | { type: "glass-terminal-fix-accept"; termId: string; command: string; feedItemId?: string }
  // ── Build from audio ─────────────────────────────────────────────────────
  /** User clicked "Build from video" on a build-from-audio card — opens Coder pre-filled */
  | { type: "glass-build-from-audio"; prompt: string }
  | { type: "glass-terminal-run"; command: string }
  /** IDE embedded terminal — expand/collapse chrome (orchestrator + builder strip sync). */
  | { type: "glass-ide-terminal-set-expanded"; expanded: boolean; manual?: boolean }
  /** IDE embedded terminal — user scrolled, focused, or typed in terminal. */
  | { type: "glass-ide-terminal-interaction" }
  | { type: "run-omniparser-install" }
  | { type: "refresh-omniparser-install" }
  // ── Extract & Build Mode ────────────────────────────────────────────────────
  /** Start system-audio capture for Extract & Build Mode. */
  | { type: "extract-mode-start" }
  /** Stop Extract & Build Mode capture (may stop listening if mode started it). */
  | { type: "extract-mode-stop" }
  // ── Glass Powers Menu ──────────────────────────────────────────────────
  /** ⌘⇧P — open / toggle the Glass Powers Menu overlay. */
  | { type: "toggle-powers-menu" }
  /** Close the powers menu without invoking a power */
  | { type: "dismiss-powers-menu" }
  // ── Glass Command Palette commands (Task #66) ──────────────────────────────
  /** Fix the most recent failed terminal command via Claude. */
  | { type: "terminal-fix-last" }
  /** Explain the most recent terminal command + its output via Claude. */
  | { type: "terminal-explain-last" }
  /** Explain the current clipboard contents via Claude. */
  | { type: "explain-clipboard" }
  /** Clear the active terminal scrollback. */
  | { type: "clear-terminal" }
  /** Open the built-in Glass terminal. */
  | { type: "open-terminal" }
  /** Open terminal and focus the natural-language → shell bar. */
  | { type: "terminal-nl-focus" }
  // ── Glass Command Palette (Task #66) ───────────────────────────────────────
  /** ⌘⇧G — toggle the Raycast-style Glass Command Palette overlay. */
  | { type: "toggle-command-palette" }
  /** Close the Glass Command Palette without running a command. */
  | { type: "dismiss-command-palette" }
  /** Open or reopen the Glass Answer Panel (formatted side panel for last answer). */
  | { type: "open-answer-panel" }
  // ── Glass Companion (strip-toggle voice presence) ─────────────────────────
  /** Toggle Companion session on/off from the builder strip. */
  | { type: "toggle-companion-mode"; origin?: "strip" }
  /** Enter companion privacy mode (timed silence). */
  | { type: "companion-privacy-start"; durationMs?: number }
  /** End companion privacy mode early. */
  | { type: "companion-privacy-end" }
  /** Aletheia → Glass System: open Setup (closes Aletheia dashboard when mutual exclusion on). */
  | { type: "open-glass-setup" }
  /** Aletheia → Glass System: open Memory (closes Aletheia dashboard when mutual exclusion on). */
  | { type: "open-glass-memory" }
  /** Clear ephemeral Companion overlay manifestations. */
  | { type: "clear-companion-presence" }
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
   * "Fix with Glass" on a build-error card — opens Glass Coder with terminal error context.
   * builds a code-fix prompt, and submits through the normal AI ask flow.
   * The resulting response card has codeFilePath set so Apply to file works.
   */
  | { type: "glass-build-fix-glass"; feedItemId: string; errorText: string; errorFilePaths: string[] }
  // ── Design-to-Code Bridge (#163) ─────────────────────────────────────────
  /** One-click button in command bar: capture screen, detect editor, show design card. */
  | { type: "design-capture" }
  /** User clicked one of the 4 quick-action buttons on the design capture card. */
  | { type: "design-generate"; feedItemId: string; action: import("./designToCode.ts").DesignToCodeAction; refinementFeedback?: string }
  /** Re-run screen capture for an existing design card (preserves stack/action prefs). */
  | { type: "design-recapture"; feedItemId: string }
  /** Dismiss low-quality capture warning and proceed with actions. */
  | { type: "design-ack-quality"; feedItemId: string }
  /** Permission prompt → Allow: read editor file then generate. */
  | { type: "design-grant-file-read"; feedItemId: string; action: import("./designToCode.ts").DesignToCodeAction }
  /** Permission prompt → Skip: generate without codebase context. */
  | { type: "design-skip-file-read"; feedItemId: string; action: import("./designToCode.ts").DesignToCodeAction }
  /** User changed the target framework/stack in the design card picker (#163-F). */
  | { type: "set-design-stack"; stack: import("./designToCode.ts").DesignStack }
  /** Retry saving a completed Design to Code run to Glass Storage. */
  | { type: "design-retry-save"; feedItemId: string }
  /** Restore latest .glass-backup-*.bak over the original file (undo apply). */
  | { type: "glass-restore-backup"; feedItemId: string; filePath: string }
  /** Run tsc --noEmit or npm run build in the dock terminal to verify a file write compiled. */
  | { type: "glass-verify-build"; feedItemId: string; filePath: string }
  // ── Custom slash commands (#165) ──────────────────────────────────────────
  /** User invoked a custom command from the powers palette. */
  | { type: "custom-command-run"; name: string }
  /** Open Glass Coder with a pre-filled prompt (voice or automation). */
  | {
      type: "open-coder-with-prompt";
      prompt: string;
      autoRun?: boolean;
      screenContext?: AgentScreenContext;
    }
  /** Open a file in Glass IDE (voice or automation). */
  | { type: "glass-ide-open-file"; relativePath: string }
  /** Route an IDE-aware voice phrase (open file, explain selection, etc.). */
  | { type: "glass-ide-voice-command"; transcript: string }
  /** Update Glass Coder index / screen / voice settings. */
  | {
      type: "set-glass-coder-settings";
      patch: Partial<Pick<
        import("./glassSettings.ts").GlassUserSettings,
        "indexEnabled" | "indexAutoOnOpen" | "screenContextEnabled" | "voiceCoderEnabled"
        | "coderAutoVerify" | "coderAutoReview" | "coderAgentModel" | "coderComposerMode"
      >>;
    }
  /** Renderer requests TTS — main calls ElevenLabs and plays audio back. */
  | { type: "glass-tts"; text: string }
  /** Companion timed TTS — returns audio + character alignment for presence sync. */
  | { type: "glass-tts-timed"; text: string; requestId?: string }
  /** Sorting Hat placement complete — write persona + mark onboarding done. */
  | { type: "glass-onboarding-complete"; persona: "developer" | "sales" | "operator" | "writer" | "general" }
  /** User skipped onboarding — just mark complete with no persona set. */
  | { type: "glass-onboarding-skip" }
  /** Re-run Sorting Hat persona calibration (from Settings). */
  | { type: "glass-onboarding-recalibrate" }
  /** E2E — force Sorting Hat visible without wiping userData. */
  | { type: "e2e-open-sorting-hat" }
  /** Dev only — open Sorting Hat onboarding on the running app (keeps 8s manifest). */
  | { type: "dev-open-onboarding" }
  /** Dev only — open Anthropic key activation window for UI preview. */
  | { type: "dev-open-activation" };

export interface GlassState {
  privacy: PrivacyState;
  transcript: string;
  notes: ExtractedNotes;
  moments: SavedMoment[];
  panelTab: PanelTab;
  captureSubTab?: import("./panelTabRouting.ts").CaptureSubTab;
  config: GlassConfig;
  lastError?: string;
  lastNotice?: string;
  /** One-shot boot toast after unclean process exit (cleared by renderer). */
  recoveryToast?: string;
  recoveryToastNonce?: number;
  /** Persistent warning when session-history.db was quarantined on startup. */
  dbRecoveryWarning?: string;
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
  /** Live server-degraded reason (mid-session failures + setup check). */
  iivoServerDegradedReason?: string;
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
  /** Active Glass agent run — updated by main while an agent loop is live. */
  agentRun?: GlassAgentRunState | null;
  /** Recent Glass agent runs (newest first). */
  agentHistory?: AgentHistoryEntry[];
  /** Glass Coder — pending write awaiting Apply/Skip. */
  agentPendingApproval?: {
    runId: string;
    agentId: GlassAgentId;
    pendingToolId: string;
    pendingToolName: string;
  } & AgentPendingApprovalPayload | null;
  /** Glass Coder — files applied/skipped/failed in the active or last run. */
  agentChangeLog?: AgentChangeLogEntry[];
  /** Glass Coder workspace — dock + command bar hidden. */
  coderWorkspaceActive?: boolean;
  /** Glass IDE shell — full overlay coding layout. */
  glassIdeActive?: boolean;
  /** Aletheia Research Explorer — full-screen overlay, hides dock + command bar. */
  researchExplorerActive?: boolean;
  /** Question the user submitted to the Research Explorer. */
  researchExplorerQuestion?: string;
  /** Code Analyst full-screen workspace — hides dock + command bar. */
  codeAnalystExplorerActive?: boolean;
  /** Prompt prefilled when opening Code Analyst workspace. */
  codeAnalystExplorerPrompt?: string;
  /** Writing Studio full-screen workspace — hides dock + command bar. */
  writingStudioActive?: boolean;
  /** Brief prefilled when opening Writing Studio. */
  writingStudioPrompt?: string;
  /** Glass Storage Projects — full-screen workspace; hides dock + command bar. */
  glassStorageProjectsActive?: boolean;
  /** Saved Glass Storage project records (Design to Code, etc.). */
  glassStorageProjects?: import("./glassStorageProjectTypes.ts").GlassProjectRecord[];
  /** Selected project in Projects workspace (detail panel). */
  glassStorageProjectsSelectedId?: string | null;
  /** User-uploaded files in Glass Storage → Files tab. */
  glassStorageFiles?: import("./glassStorageFileTypes.ts").GlassStorageFileRecord[];
  /** Last Design to Code project id for Aletheia recall bridge. */
  latestDesignToCodeProjectId?: string | null;
  /** Glass Dashboard — full-screen overlay above builder strip; hides dock + command bar. */
  glassDashboardActive?: boolean;
  /** One-shot nav target when opening the dashboard (cleared after mount). */
  glassDashboardNav?: import("./glassDashboardNav.ts").GlassDashboardNav | null;
  /** Aletheia Dashboard — Aletheia-centered control surface above builder strip. */
  aletheiaDashboardActive?: boolean;
  /** IDE live preview — auto-detected or user-set localhost URL. */
  glassIdePreviewUrl?: string | null;
  /** Bumped after Coder Apply to reload the preview webview. */
  glassIdePreviewReloadNonce?: number;
  /** IDE embedded terminal expanded (false = collapsed chrome strip). */
  glassIdeTerminalExpanded?: boolean;
  /** Aletheia advisory — subtle IDE chip, feed line, optional speech. */
  glassIdeAletheia?: import("./glassIdeAletheiaAdvisory.ts").GlassIdeAletheiaSnapshot;
  /** Glass Coder — Ollama embedding index state. */
  indexState?: GlassIndexState;
  /** Ollama reachable for semantic index (updated on index ops). */
  ollamaAvailable?: boolean;
  /** GLASS_CONTEXT.md generation state. */
  projectMemoryState?: ProjectMemoryState | null;
  /** Glass IDE QA pipeline state (when QA Mode enabled). */
  qaPipelineState?: import("./glassQaPipeline.ts").QaPipelineState | null;
  /** QA fix-loop recovery — selective re-run, history, convergence. */
  qaRecoveryState?: import("./glassQaRecovery.ts").QaRecoveryState | null;
  /** QA Mode entry notification visible in IDE stream pane. */
  qaNotificationVisible?: boolean;
  /** Post-Coder typecheck / build verify. */
  coderVerifyState?: CoderVerifyState | null;
  /** Post-verify Code Analyst review. */
  coderReviewState?: CoderReviewState | null;
  /** Auto-fix loop — current iteration (1 = user-initiated). */
  coderLoopIteration?: number;
  /** Ties verify, review, and fix runs in one session. */
  coderLoopSessionId?: string;
  /** Snapshots of applied files before each auto-fix iteration. */
  coderCheckpoints?: import("./coderCheckpoints.ts").CoderCheckpoint[];
  /** Per-run shell cwd for Glass Coder run_project_command continuity. */
  coderTerminalCwdByRunId?: Record<string, string>;
  /** QA auto-enabled due to risky path heuristics on last run. */
  qaRiskTriggered?: boolean;
  qaRiskPaths?: string[];
  /** Token usage + estimated cost for the active / last Coder run. */
  coderRunUsage?: import("./coderAgentModels.ts").CoderRunUsage | null;
  /** Estimated USD for all model calls in the current Glass session (SQLite). */
  sessionSpendUsd?: number;
  /** Active Glass agent run — updated by main while an agent loop is live. */
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
  /**
   * Consent checkpoint flags — read from glassOnboardingStore at boot.
   * Architecture law: no mic, screen-capture, or recording capability may
   * activate without the corresponding flag being true. These are read-only
   * in the renderer; mutations go through persistConsentFlags() in main.
   * Exposed here so Aletheia trust panel and Glass setup UI can render
   * permission status without issuing privileged IPC calls.
   */
  consentState?: {
    micAck: boolean;
    screenAck: boolean;
    recordingAck: boolean;
    tosAck: boolean;
  };
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
  ttsAudio?: import("./ttsAlignment.ts").TimedTtsPayload;
  glassUserProfile: import("./glassUserProfile.ts").GlassUserProfile | null;
  /** Progress of the one-click BlackHole + Multi-Output Device install flow. */
  blackHoleInstallStatus?: "idle" | "downloading" | "installing" | "configuring" | "done" | "error";
  /** Human-readable progress label for the install flow. */
  blackHoleInstallProgress?: string;
  /** Linked IIVO account (set after user pastes a connect token). */
  iivoAccountLink: import("./iivoAccountLink.ts").IivoAccountLink | null;
  /** Server-side feature flags (polled from /api/glass/runtime-config). */
  serverRuntimeFlags: import("./serverRuntimeFlags.ts").ServerRuntimeFlags | null;
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
    status: "ok" | "error" | "pending";
    message: string;
  };
  /** P0.1 — Aletheia action orchestrator pipeline snapshot for trust UI. */
  aletheiaActionPipeline?: import("./aletheiaExecution.ts").AletheiaActionPipelineSnapshot;
  /** P0.4 — live permission + consent instrumentation for Aletheia authority tiers. */
  aletheiaPermissionPlane?: import("./aletheiaPermissionControlPlane.ts").AletheiaPermissionControlPlaneSnapshot;
  /** P0.4 — most recent permission revocation alert (cleared on dismiss). */
  aletheiaPermissionAlert?: {
    message: string;
    domain: string;
    revokedAt: number;
    alertNonce: number;
  };
  /** P0.3 — supervised local services health snapshot. */
  aletheiaSidecarPlane?: import("./aletheiaSidecarManager.ts").AletheiaSidecarManagerSnapshot;
  /** P0.3 — service degradation alert (cleared on dismiss). */
  aletheiaSidecarAlert?: {
    message: string;
    serviceId: string;
    degradedAt: number;
    alertNonce: number;
  };
  /** P0.5 — unified dependency manifest + bootstrap snapshot. */
  aletheiaDependencyManifest?: import("./aletheiaDependencyManifest.ts").AletheiaDependencyManifestSnapshot;
  /** B1.1 — passive vs active observation signal instrumentation. */
  aletheiaObservationPlane?: import("./aletheiaObservationSignals.ts").AletheiaObservationSnapshot;
  /** B1.2 — presence-first companion activation state. */
  aletheiaActivation?: import("./aletheiaActivationPolicy.ts").AletheiaActivationState;
  /** B1.3 — cross-signal ambient synthesis snapshot. */
  aletheiaAmbientSynthesis?: import("./aletheiaAmbientSynthesis.ts").AletheiaAmbientSynthesisSnapshot;
  /** B2.1 — pending advice cards awaiting user go/no-go. */
  aletheiaPendingAdvice?: import("./aletheiaPendingAdvice.ts").AletheiaPendingAdviceSnapshot;
  /** B2.1 — one-shot companion speech after advice approve/dismiss. */
  aletheiaAdviceSpeak?: { text: string; nonce: number };
  /** Design to Code — one-shot Aletheia voice without companion toggle. */
  aletheiaEphemeralSpeak?: { text: string; nonce: number };
  /** B2.3 — bounded autonomy loop scope, audit trail, and summary. */
  aletheiaBoundedLoop?: import("./aletheiaBoundedAutonomy.ts").AletheiaBoundedLoopSnapshot;
  /** B3.1 — live agent coordination activity for council / research / writing routes. */
  aletheiaAgentActivity?: import("./aletheiaAgentCoordinator.ts").AletheiaAgentActivitySnapshot;
  /** B3.2 — delegated presence: focus app, observe, report back. */
  aletheiaDelegatedPresence?: import("./aletheiaDelegatedPresence.ts").AletheiaDelegatedPresenceSnapshot;
  /** B3.3 — general delegated loop with live narrative and handoff. */
  aletheiaDelegatedLoop?: import("./aletheiaDelegatedLoop.ts").AletheiaDelegatedLoopSnapshot;
  /** Conversation-driven computer operator loop (capture → act → verify). */
  aletheiaComputerOperator?: import("./aletheiaComputerOperatorLoop.ts").AletheiaComputerOperatorSnapshot;
  /** Saved always-allow computer operator session grants. */
  aletheiaComputerOperatorGrants?: import("./aletheiaComputerSessionAuthority.ts").ComputerOperatorPersistentGrant[];
  /** B3.4 — web research conversation thread with citations. */
  aletheiaResearchConversation?: import("./aletheiaResearchConversation.ts").AletheiaResearchConversationSnapshot;
  /** B4.1 — persona-aware operating mode for Aletheia companion. */
  aletheiaPersonaBehavior?: import("./aletheiaPersonaBehavior.ts").AletheiaPersonaBehaviorSnapshot;
  /** B4.2 — Aletheia session notes (decisions + rationales). */
  aletheiaNotes?: import("./aletheiaNotes.ts").AletheiaNotesSnapshot;
  /** B4.3 — attention recovery brief after a meaningful gap. */
  aletheiaAttentionRecovery?: import("./aletheiaAttentionRecovery.ts").AletheiaAttentionRecoverySnapshot;
  /** B5.1 — relationship thread across app switches while companion is active. */
  aletheiaRelationshipThread?: import("./aletheiaRelationshipThread.ts").AletheiaRelationshipThreadSnapshot;
  /** B5.2 — multi-display situational awareness. */
  aletheiaDisplayAwareness?: import("./aletheiaDisplayAwareness.ts").AletheiaDisplayAwarenessSnapshot;
  /** B6 — live trust activity and human-legible audit trail from action ledger. */
  aletheiaTrustActivity?: import("./aletheiaTrustLedger.ts").AletheiaTrustActivitySnapshot;
  /** B7 — security hive agents, threats, and operational mode. */
  aletheiaSecurityHive?: import("./aletheiaSecurityHive.ts").SecurityHiveSnapshot;
  /** B8 — founder-only Deployed Execution session (omitted from snapshot for non-founders). */
  aletheiaDeployedExecution?: import("./aletheiaFounderCommandTier.ts").AletheiaDeployedExecutionSnapshot;
  // ── Design-to-Code Bridge (#163) ─────────────────────────────────────────
  /** Active design capture cards keyed by feed item id. */
  designCaptures?: Record<string, Omit<import("./designToCode.ts").DesignToCodeSession, "id">>;
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
  // ── Glass Powers Menu ───────────────────────────────────────────────────
  /** Whether the ⌘⇧P powers quick-launcher is currently visible. */
  powersMenuOpen?: boolean;
  /** Whether the ⌘⇧G Command Palette overlay is visible. */
  commandPaletteOpen?: boolean;
  /** Builder-strip Glass Companion session is active (toggle, not hold-to-talk). */
  companionModeActive?: boolean;
  /** Incremented on each Companion toggle — overlay starts/stops the voice loop. */
  companionModeToggleNonce?: number;
  /** OmniParser warm-up phase for Aletheia intro TTS on Companion toggle. */
  companionWarmupPhase?: "none" | "warming" | "ready";
  /** Bumped when companionWarmupPhase changes — renderer speaks warm/ready lines. */
  companionWarmupSpeakNonce?: number;
  /** Active Companion presence — uiMap + guidancePlan for overlay manifestations. */
  companionPresence?: import("./companionGuidance.ts").CompanionGuidancePayload | null;
  /** Phase 4a — session memory for multi-turn Companion routing. */
  companionMemory?: import("./companionSessionMemory.ts").CompanionSessionMemory | null;
  /** Task-scoped hint: interpret the next request as a Mac computer task when possible. */
  aletheiaUseComputerForNextTask?: boolean;
  /** Companion privacy mode — Aletheia stays silent until resumeAt. */
  companionPrivacy?: {
    active: boolean;
    resumeAt: number;
    durationMs: number;
  };
  /** Bumped when Command Palette requests re-showing the Glass Response Panel. */
  responsePanelRevealSeq?: number;
  /** Hint for palette quick actions from the built-in terminal context buffer. */
  paletteTerminalHint?: import("./paletteTypes.ts").PaletteLastTerminalBlock | null;
  // ── Custom commands (#165) ─────────────────────────────────────────────────
  /** User-defined slash commands loaded from ~/.iivo/glass-commands.json. */
  customCommands?: import("../shared/customCommands.ts").CustomCommand[];
  /** Validation warnings from the last custom commands config load. */
  customCommandsWarnings?: string[];
  /** OmniParser sidecar install status (Companion UI detection). */
  omniParserInstall?: import("./omniParserInstall.ts").OmniParserInstallState;
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

// ── Terminal Auto Fix (Task #65) ─────────────────────────────────────────────

export interface TerminalFixRequest {
  /** The command that failed. */
  command: string;
  /** ANSI-stripped terminal output (stderr + stdout) from the failed command. Max 6000 chars. */
  output: string;
  /** Exit code of the failed command. */
  exitCode: number;
  /** Optional rolling context: last N finished commands as a single string. */
  context?: string;
}

export interface TerminalFixResponse {
  /** The corrected command, ready to run. Single line, no explanation. */
  fixedCommand?: string;
  /** One-line explanation of what went wrong (e.g. "Missing dependency: ts-node"). */
  diagnosis?: string;
  /** One-line explanation of what was changed (e.g. "Added --legacy-peer-deps flag"). */
  whatChanged?: string;
  error?: string;
}

// ── Glass Command Palette (Task #66) ───────────────────────────────────────────

export interface PaletteGetSectionsRequest {
  context: import("./paletteTypes.ts").PaletteContextSignals;
}
export interface PaletteGetSectionsResponse {
  sections: import("./paletteTypes.ts").PaletteSection[];
  error?: string;
}
export interface PaletteRecordUseRequest {
  itemId: string;
}

// ── Glass Agents ─────────────────────────────────────────────────────────────

export const GLASS_AGENT_IDS = ["research", "code", "writing", "coder"] as const;
export type GlassAgentId = (typeof GLASS_AGENT_IDS)[number];

export function isGlassAgentId(value: unknown): value is GlassAgentId {
  return typeof value === "string" && (GLASS_AGENT_IDS as readonly string[]).includes(value);
}

export interface AgentScreenContext {
  detectedFilePath?: string;
  visibleErrors?: string[];
  editorName?: string;
  confidence?: "high" | "low";
  /** Set when screen detection fails (e.g. missing Screen Recording permission). */
  detectError?: string;
}

export interface OpenCoderWithPromptPayload {
  prompt: string;
  autoRun?: boolean;
  screenContext?: AgentScreenContext | null;
  loopAutoTrigger?: boolean;
  /** Unique per broadcast — avoids launch de-dupe blocking loop fix runs. */
  launchNonce?: number;
}

export interface GlassIndexState {
  projectRoot: string;
  status: "idle" | "indexing" | "ready" | "error";
  fileCount?: number;
  progress?: {
    processed: number;
    indexed: number;
    total: number;
    phase?: "pulling" | "embedding";
    detail?: string;
  };
  lastIndexedAt?: number;
  error?: string;
}

export interface ProjectMemoryState {
  status: "idle" | "generating" | "done" | "error";
  error?: string;
}

export interface CoderVerifyState {
  status: "idle" | "running" | "pass" | "fail";
  output?: string;
  runId: string;
  /** Shell command that was run (e.g. npm run typecheck). */
  command?: string;
}

/** Structured metadata for run_project_command tool receipts in the IDE stream. */
export interface CoderCommandReceipt {
  command: string;
  cwd: string;
  exitCode: number;
  durationMs: number;
  output: string;
}

export interface CoderReviewState {
  status: "idle" | "running" | "done" | "dismissed";
  runId: string;
  findings?: string;
  fileCount?: number;
}

export interface AgentRunRequest {
  /** Which agent to run. */
  agentId: GlassAgentId;
  /** User's plain-language task description. */
  prompt: string;
  /** Client-generated id — echoed on every AgentEvent so stale runs can be ignored. */
  runId: string;
  /** Screen-aware context from OmniParser / vision detection. */
  agentScreenContext?: AgentScreenContext;
  /** Continuation of auto-fix loop — do not reset session. */
  loopAutoTrigger?: boolean;
}

export interface AgentRunResponse {
  started: boolean;
  runId?: string;
  error?: string;
}

export type AgentEventKind =
  | "text-delta"   // streaming token from Claude
  | "tool-start"   // agent is about to call a tool
  | "tool-done"    // tool call finished
  | "narrate"      // short Aletheia spoken cue
  | "done"         // agent loop complete
  | "cancelled"    // user stopped the run
  | "approval-required" // Glass Coder waiting for user to apply/skip a write
  | "usage"             // token usage update during agent loop
  | "error";       // unrecoverable error

export type GlassAgentRunStatus = "running" | "done" | "error" | "cancelled";

export interface GlassAgentRunState {
  runId: string;
  agentId: GlassAgentId;
  status: GlassAgentRunStatus;
  updatedAt: number;
  prompt?: string;
  savedFilePath?: string;
}

export interface AgentPickOutputFolderResponse {
  ok: boolean;
  folder?: string;
  cancelled?: boolean;
  error?: string;
}

export interface AgentPendingApprovalPayload {
  filePath: string;
  relativePath: string;
  description: string;
  displayLines: import("./diff.ts").DiffLine[];
  diff: import("./diff.ts").UnifiedDiff;
  contentHash: string;
  proposedContent: string;
  fileExisted: boolean;
  /** delete_file approval — show destructive warning UI. */
  isDelete?: boolean;
}

export interface AgentApproveRequest {
  runId: string;
  pendingToolId: string;
  approved: boolean;
}

export interface AgentApproveResponse {
  ok: boolean;
  error?: string;
}

export type CoderApprovalMode = "normal" | "trust_edits" | "skip_all";

export interface AgentSetApprovalModeRequest {
  runId: string;
  mode: CoderApprovalMode;
}

export interface AgentSetApprovalModeResponse {
  ok: boolean;
  error?: string;
}

export interface AgentChangeLogEntry {
  runId: string;
  path: string;
  relativePath: string;
  action: "applied" | "skipped" | "failed" | "deleted";
  description: string;
  at: number;
  error?: string;
  /** Set when applyCodeToFile created a backup (restore via agentRestoreBackup). */
  backupPath?: string;
}

export interface AgentEvent {
  /** Matches the runId in the run request. */
  runId: string;
  /** Matches the agentId in the run request. */
  agentId: GlassAgentId;
  kind: AgentEventKind;
  /**
   * Links this event to an agent chain on the AgentEventBus.
   * Set when the event originates from or triggers a bus chain.
   * See src/main/agentEventBus.ts
   */
  correlationId?: string;
  /** Per-agent monotonic sequence number within a chain. */
  sequence?: number;
  /** Incremental text token (text-delta only). */
  text?: string;
  /** Tool name (tool-start / tool-done). */
  toolName?: string;
  /** Tool input as parsed JSON (tool-start only). */
  toolInput?: unknown;
  /** Short human-readable result summary (tool-done only). */
  toolResult?: string;
  /** Absolute path written (write_file tool-done only). */
  savedFilePath?: string;
  /** Error message (error only). */
  error?: string;
  /** Glass Coder — tool awaiting user approval. */
  pendingToolId?: string;
  pendingToolName?: string;
  pendingToolInput?: unknown;
  pendingApproval?: AgentPendingApprovalPayload;
  /** Glass Coder — change log entry (tool-done for write tools). */
  changeLogEntry?: AgentChangeLogEntry;
  /** Token usage snapshot (usage only). */
  usageInputTokens?: number;
  usageOutputTokens?: number;
  usageModelId?: import("./coderAgentModels.ts").CoderAgentModelId;
  usageApiModel?: string;
  usageEstimatedUsd?: number;
  /** Glass Coder — structured command receipt (run_project_command tool-done). */
  commandReceipt?: CoderCommandReceipt;
}

export interface AgentHistoryEntry {
  runId: string;
  agentId: GlassAgentId;
  prompt: string;
  startedAt: number;
  finishedAt?: number;
  status: GlassAgentRunStatus;
  savedFilePath?: string;
  error?: string;
  changedFiles?: string[];
}

export interface AgentPathResponse {
  ok: boolean;
  error?: string;
}

export interface GlassIdeGhostSuggestRequest {
  relativePath: string;
  line: number;
  linePrefix: string;
}

export interface GlassIdeGhostSuggestResponse {
  suggestion: string;
}

export interface GlassIdeProjectLib {
  filePath: string;
  uri: string;
  content: string;
}

export interface GlassIdeProjectLibsResponse {
  ok: boolean;
  projectRoot?: string;
  libs?: GlassIdeProjectLib[];
  error?: string;
}

export interface GlassIdeSelectWorkspaceRequest {
  folder: string;
}

export interface GlassIdeSelectWorkspaceResponse {
  ok: boolean;
  folder?: string;
  error?: string;
}

export interface CoderRollbackCheckpointRequest {
  runId: string;
}

export interface CoderRollbackCheckpointResponse {
  ok: boolean;
  restored?: number;
  error?: string;
}

export type {
  QaCheck,
  QaCheckId,
  QaCheckStatus,
  QaPipelineState,
  QaPipelineStatus,
} from "./glassQaPipeline.ts";

export type {
  AgentRunRow,
  AgentRunStatus,
  MessageRow,
  ModelCallRow,
  SessionRow,
  SessionRowWithMeta,
  SessionSpendSummary,
  UserContextRow,
} from "./glassSessionHistory.ts";

/** 7-day local retention rollup (dashboard). */
export interface RetentionSummary {
  sessionsLast7Days: number;
  workflowsPerSession: number;
  autofixAcceptanceRate: number;
  buildLoopSuccessRate: number;
}

export interface AgentBusSubscriberHealth {
  subscriberId: string;
  consecutiveMissedHeartbeats: number;
  healthy: boolean;
  lastAckSeq: number;
}

export interface AgentBusHealthSnapshot {
  healthy: boolean;
  dlqDepth: number;
  openBreakers: string[];
  heartbeatSeq: number;
  subscribers: AgentBusSubscriberHealth[];
  staleSubscribers: string[];
}
