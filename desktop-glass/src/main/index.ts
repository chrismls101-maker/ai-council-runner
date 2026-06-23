/**
 * IIVO Glass — Electron main process.
 *
 * Owns the canonical Glass state, handles user-initiated commands, talks to the
 * existing IIVO Context Bridge API, and hands off to the IIVO web app. Nothing
 * captures or sends without an explicit command from the UI.
 */

import { fetchElevenLabsTtsBuffer, fetchElevenLabsTtsWithTimestamps, glassElevenLabsConfig, describeElevenLabsVoice } from "./glassElevenLabsTts.ts";
import { mergeCompanionGuidance } from "../shared/mergeCompanionUiMap.ts";
import type { UiMap } from "../shared/companionGuidance.ts";
import { buildSegmentTimings, type TimedTtsPayload } from "../shared/ttsAlignment.ts";
import { buildCompanionLocalUiMap } from "./companionUiMapBuilder.ts";
import {
  allManifestationsFromPlan,
  buildCaptureCropsForManifestations,
} from "./companionCaptureCrops.ts";
import {
  anchorWatchDrifted,
  captureAnchorSnapshot,
  COMPANION_ANCHOR_INVALIDATED_NOTICE,
  type AnchorWatchSnapshot,
} from "./companionAnchorWatch.ts";
import { shouldTryOmniParser, tryOmniParserMarks, warmOmniParserSidecarWithCallbacks } from "./companionOmniParser.ts";
import {
  buildOmniParserInstallTerminalCommand,
  getOmniParserInstallState,
} from "./omniParserInstall.ts";
import {
  clearCompanionSessionMemory,
  updateCompanionSessionMemory,
} from "./companionSessionStore.ts";
import {
  canReuseCompanionCapture,
  companionMemoryForAsk,
  screenshotFromCompanionMemory,
  type CompanionSessionMemory,
} from "../shared/companionSessionMemory.ts";
import {
  resolveCompanionRoute,
  type CompanionRoute,
} from "../shared/companionRetarget.ts";
import { detectAmbientConversation } from "../shared/companionAmbientDetect.ts";
import { loadGlassEnv } from "./loadGlassEnv.ts";
import * as Sentry from "@sentry/electron/main";
import { installGlassE2eHooks, getE2eExternalUrls, resetE2eExternalUrls } from "./e2eMainHooks.ts";
import { installDefaultGlassHandoffOpener, openGlassHandoffUrl } from "./glassBrowserHandoff.ts";
import { getGlassE2eWindowMetadata } from "./e2eWindowMetadata.ts";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { appendFile, existsSync, readFile } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
import { app, BrowserWindow, clipboard, dialog, ipcMain, protocol, screen, shell, type WebContents } from "electron";
import { GLASS_BOOT_DURATION_MS } from "../shared/bootTiming.ts";
import { isBootSplashBundlePresent } from "../shared/bootSplash.ts";
import { DOCK_MIN_WIDTH_VERTICAL } from "../shared/glassLayoutMath.ts";
import { resolveConfig, buildIivoChatUrl, buildLensAskUrl, buildRunHistoryUrl } from "../shared/config.ts";
import {
  privacyReducer,
  initialPrivacyState,
  type PrivacyState,
} from "../shared/privacyState.ts";
import { extractNotes, emptyNotes } from "../shared/noteExtraction.ts";
import { SavedMomentsStore } from "../shared/savedMoments.ts";
import {
  buildScreenshotContextPayload,
  buildTextContextPayload,
} from "../shared/contextPayload.ts";
import { createScreenshotContext, createContextItem } from "../shared/iivoClient.ts";
import {
  IPC,
  type GlassCommand,
  type GlassState,
  type SaveGlassMemoryRequest,
  type SessionActionStatus,
  type ApiKeySaveRequest,
  type PromptGenerateRequest,
  type SpendSnapshot,
  type SpendCustomFetchRequest,
  type SpendCustomFetchResponse,
  type TerminalExplainRequest,
  type TerminalExplainResponse,
  type NlToShellRequest,
  type NlToShellResponse,
  type VoiceShellTranscribeRequest,
  type VoiceShellTranscribeResponse,
  type TerminalVisionRequest,
  type TerminalVisionResponse,
  type TerminalSuggestRequest,
  type TerminalSuggestResponse,
  type TerminalSuggestion,
  type TerminalContextBlock,
  type ScrollbackWriteBlock,
  type ScrollbackSearchRequest,
  type ScrollbackSearchResponse,
  type ExtractDetectRequest,
  type ExtractDetectResponse,
  type ExtractGenerateRequest,
  type ExtractGenerateResponse,
  type ExtractBuildHandoffRequest,
  type ExtractBuildHandoffResponse,
  type TerminalFixRequest,
  type TerminalFixResponse,
  type PaletteGetSectionsRequest,
  type PaletteGetSectionsResponse,
  type PaletteRecordUseRequest,
  isGlassAgentId,
  type GlassAgentId,
  type AgentEvent,
  type AgentRunRequest,
  type AgentRunResponse,
  type AgentPickOutputFolderResponse,
  type AgentPathResponse,
  type AgentApproveRequest,
  type AgentApproveResponse,
  type AgentChangeLogEntry,
  type GlassAgentRunState,
} from "../shared/ipc.ts";
import { PALETTE_COMMAND_REGISTRY } from "../shared/paletteCommandRegistry.ts";
import { buildCommandPaletteSections } from "../shared/paletteCommandSections.ts";
import type {
  GlassCommandItem,
  ApiKeyItem,
  PaletteSection,
  PaletteFrequencyMap,
} from "../shared/paletteTypes.ts";
import { loadPaletteFrequency, recordPaletteUse } from "./paletteFrequencyStore.ts";
import {
  pushTerminalContext,
  clearTerminalContext,
  getTerminalContextString,
  normalizeTerminalContextBlocks,
  getLastTerminalErrorBlock,
  getLastTerminalContextBlock,
  getRecentTerminalContextBlocks,
} from "./terminalContext.ts";
import { saveResponseToMemoryVault } from "../shared/iivoMemoryClient.ts";
import { waitForMinLookingDuration, waitForMinThinkingDuration, GLASS_ASK_TIMEOUT_MS, VOICE_ASK_STATUS } from "../shared/glassAskTiming.ts";
import type { PanelTab } from "../shared/types.ts";
import { GlassSessionStore } from "../shared/sessionStore.ts";
import {
  extractSessionIntelligence,
  selectNewInsights,
} from "../shared/sessionIntelligence.ts";
import { buildSessionSummary } from "../shared/sessionSummary.ts";
import { buildSessionContextPayload } from "../shared/sessionPayload.ts";
import type { TranscriptionMode } from "../shared/audioCaptureTypes.ts";
import type { IivoAnalysisState } from "../shared/ipc.ts";
import {
  mergeCaptureSource,
  windowContextForEvent,
  WINDOW_CONTEXT_UNAVAILABLE_MESSAGE,
  type WindowContext,
} from "../shared/windowContextTypes.ts";
import {
  buildAnalysisFailureNotice,
  buildCouncilRunRequest,
  buildSessionAnalysisPrompt,
  estimateCouncilCredits,
  runCouncilAnalysis,
} from "../shared/iivoAnalysisClient.ts";
import { captureDisplayById } from "./capture.ts";
import {
  resolveCaptureDisplay,
  sanitizeDisplayTarget,
} from "./displayRegistry.ts";
import {
  blurCommandBar,
  broadcast,
  beginGlassBootSequence,
  createSplashWindow,
  createWindows,
  disposeWindows,
  finishSplash,
  whenGlassWindowsReady,
  getCommandBarHotkeyStatus,
  applyGlassUserSettings,
  getAvailableDisplayIds,
  getConnectedDisplays,
  getDisplayLayoutSummary,
  refreshGlassDisplayLayout,
  setListenNotesPadVisible,
  getGlassWindowState,
  syncOverlayPresentationRaised,
  getWindows,
  getLayoutManager,
  isPanelVisible,
  lockChromeLayout,
  unlockChromeLayout,
  resetChromeLayoutOrigins,
  nudgeChromeWindowFromWebContents,
  registerCommandBarHotkeys,
  registerContextAskHotkey,
  registerPowersMenuHotkey,
  resizeDockWindow,
  showGlassTerminalWindow,
  dismissGlassTerminalWindow,
  scheduleDismissGlassTerminalWindow,
  resizeGlassTerminalWindow,
  setChromeLayoutPersistHandler,
  syncChromeLayoutFromSettings,
  setOverlayPinnedForTranslate,
  setOverlayMode,
  toggleCommandBar,
  focusCommandBar,
  prefillCommandBar,
  toggleOverlay,
  togglePanel,
  closePanel,
  unregisterCommandBarHotkeys,
  setOnboardingPending,
  setGlassBootSequenceCompleteHandler,
  setOnboardingEmergencyHandler,
  registerOnboardingEmergencyShortcut,
  unregisterOnboardingEmergencyShortcut,
  setCommandBarLayoutChangedHandler,
  hideGlassWindowsForCapture,
  restoreGlassWindowsAfterCapture,
  syncCommandBarWindowToStackHeight,
  setIgnoreMouseFromWindow,
  setOverlayPointerOverNotification,
  setOverlayPointerOverDebriefPanel,
  setBuilderStripVisible,
  setBuilderStripLayoutReserve,
  setOverlayPointerOverBuilderStrip,
  setOverlayPointerOverIde,
  setOverlayIdeActive,
  setBuilderStripPanelOpen,
  setResponsePanelOpen,
  setCopilotOverlayCardOpen,
  setCommandPaletteOpen,
  setPowersMenuOpen,
  setCoderWorkspaceActive,
  setIdeChromeSuppressed,
  ensureOnboardingOverlayClickThrough,
  syncLanguagePickerOverlayInteractivity,
} from "./windows.ts";
import { computeCommandBarOverlayClearancePx, builderStripLayoutReservePx, glassLayoutContentBottomY } from "../shared/glassLayoutMath.ts";
import { shouldShowBuilderStrip } from "../shared/builderStripVisibility.ts";
import { logGlassClickDebug } from "./glassClickDebug.ts";
import {
  listApiKeys,
  getApiKeyValue,
  saveApiKey,
  deleteApiKey,
  touchApiKey,
  isApiKeyEncryptionAvailable,
} from "./apiKeyStore.ts";
import { IdeChromeOrchestrator } from "./glassIdeChromeOrchestrator.ts";
import { isPtyErrorLine } from "../shared/glassIdeChromeOrchestrator.ts";
import { IdeAletheiaAdvisory } from "./ideAletheiaAdvisory.ts";
import { emptyGlassIdeAletheiaSnapshot } from "../shared/glassIdeAletheiaAdvisory.ts";
import type { IdeChromeSignal } from "../shared/glassIdeChromeOrchestrator.ts";
import { runAgent, type ApprovalGateRequest } from "./agentRunner.ts";
import {
  appendAgentHistory,
  loadAgentHistory,
  updateAgentHistoryRun,
} from "./agentHistoryStore.ts";
import { resolveAgentOutputFolder } from "./agents/paths.ts";
import {
  completeGlassOnboardingStore,
  loadGlassOnboardingState,
  persistGlassUserProfile,
} from "./glassOnboardingStore.ts";
import { normalizeGlassUserProfile, type GlassUserProfile } from "../shared/glassUserProfile.ts";
import {
  loadGlassContextProfile,
  persistGlassContextProfile,
} from "./glassContextStore.ts";
import {
  recordGlassContextInteraction,
  resolveGlassUserContext,
  type GlassContextProfile,
} from "../shared/glassContextEngine.ts";
import {
  normalizeApiKeyId,
  normalizeApiKeyMeta,
  normalizeApiKeyValue,
} from "../shared/apiKeyValidation.ts";
import { buildMetaPrompt } from "./powerPromptEngine.ts";
import { buildDetectionPrompt, buildGenerationPrompt } from "./extractMode.ts";
import { parseExtractDetectLabel } from "../shared/extractModeLogic.ts";
import { runExtractBuildHandoff } from "./extractBuildHandoffRunner.ts";
import { buildTerminalFixPrompt, parseTerminalFixResponse } from "./terminalFixEngine.ts";
import { EXTRACT_BUILD_MACOS_PERMISSION_EXPLAIN } from "../shared/extractBuildHandoff.ts";
import { getSpendSnapshot, refreshSpendSnapshot, startSpendPolling } from "./spendTracker.ts";
import { getSpendHistory, getAllTimeTotal } from "./spendHistory.ts";
import { loadMoments, persistMoments } from "./store.ts";
import {
  loadIivoAccountLink,
  persistIivoAccountLink,
  clearIivoAccountLink,
} from "./iivoAccountStore.ts";
import { loadSessions, persistSessions } from "./sessionPersistence.ts";
import {
  clearSessionScreenshotFolder,
  deleteScreenshotFiles,
  readScreenshotDataUrl,
  resolveThumbnailFilePath,
  saveSessionScreenshot,
} from "./sessionScreenshots.ts";
import {
  getCachedWindowContext,
  getCurrentWindowContext,
  refreshWindowContext,
} from "./windowContext.ts";
import {
  applySystemAudioChromiumFlags,
  registerSystemAudioHandler,
} from "./systemAudioHandler.ts";
import { release, homedir } from "node:os";
import { resolveInitialSystemAudioStatus, darwinMajorFromRelease } from "../shared/systemAudioCapture.ts";
import type { SystemAudioStatus } from "../shared/systemAudioTypes.ts";
import { buildGlassSttState, resolveSttConfig } from "../shared/sttTypes.ts";
import { DeepgramStreamingSession } from "./deepgramStreamingSTT.ts";
import { listeningCostWarningMessage } from "../shared/audioChunks.ts";
import { MIC_PAUSED_AUTO_MESSAGE } from "../shared/commandBarMic.ts";
import { SessionCopilotController } from "../shared/copilotController.ts";
import {
  buildDeterministicDiagnosticFallback,
  buildDiagnosticAnalysisPrompt,
  parseDiagnosticAnalysisResponse,
} from "../shared/copilotDiagnosticAnalysis.ts";
import {
  buildSemanticSessionTypePrompt,
  canSemanticRefineOnDebrief,
  parseSemanticSessionTypeResponse,
} from "../shared/copilotSessionSemantic.ts";
import { SESSION_TYPE_LABELS } from "../shared/copilotSessionType.ts";
import type { CopilotResolution } from "../shared/copilotController.ts";
import {
  copilotModeIsActive,
  type GlassCopilotConfig,
  type GlassCopilotMode,
  type GlassCopilotRuntimeState,
} from "../shared/copilotTypes.ts";
import { shouldOfferCopilot, withCopilotConfig } from "../shared/copilotConfig.ts";
import { GLASS_MODE_PRESETS } from "../shared/glassModePresets.ts";
import {
  buildCurrentMomentContext,
  listenInterruptStatusLabel,
} from "../shared/currentMomentContext.ts";
import {
  deriveActiveListeningMode,
  activeListeningMissingContextMessage,
} from "../shared/activeListeningContext.ts";
import { shouldShortCircuitThinContext } from "../shared/activeListeningGuidance.ts";
import { extractMediaContext } from "../shared/mediaContextExtract.ts";
import { MEDIA_CONTEXT_VISION_PROMPT, type MediaContext } from "../shared/mediaContextTypes.ts";
import { getActiveBrowserUrl } from "./browserUrl.ts";
import {
  applyGlassAppUpdate,
  checkForGlassAppUpdate,
} from "./glassAppUpdate.ts";
import { captureGlassLensPage, captureGlassLensScreenshot } from "./glassLensCapture.ts";
import {
  applyGlassAutoUpdate,
  checkGlassAutoUpdate,
  initGlassAutoUpdater,
  isGlassAutoUpdateEnabled,
} from "./glassAutoUpdater.ts";
import {
  emptyGlassAppUpdateState,
  type GlassAppUpdateState,
} from "../shared/glassAppUpdate.ts";
import {
  buildActiveListeningProactiveIntervention,
  clearActiveListeningRuntime,
  initialActiveListeningRuntime,
  pickActiveListeningProactiveMoment,
  proactiveShouldShowCard,
  type ActiveListeningRuntimeState,
} from "../shared/activeListeningProactive.ts";
import {
  evaluateListenMoments,
  markListenMomentStatus,
  pickBestListenMomentForSurface,
} from "../shared/listenMomentIntelligence.ts";
import {
  countSurfacesInLast10Min,
  isListenWarmupActive,
  listenWarmupRemainingMs,
  shouldSurfaceListenMoment,
} from "../shared/listenMomentTiming.ts";
import { classifyListenSegment } from "../shared/listenSegmentClassifier.ts";
import {
  clearListenModeRuntime,
  hasActiveListenCard,
  prepareListenModeSession,
  type ListenModeRuntime,
} from "../shared/listenModeRuntime.ts";
import {
  initialListenMomentEngineState,
  type ListenMoment,
} from "../shared/listenMomentTypes.ts";
import { listenThoughtFeedBodies } from "../shared/listenThoughtCards.ts";
import {
  buildListenLiveNotes,
  listenTranscriptChunksFromEvents,
  LIVE_NOTES_REFRESH_MS,
  LIVE_NOTES_AI_REFRESH_MS,
  LIVE_NOTES_AI_MIN_DELTA_CHARS,
  mergeListenAiNotes,
  computeLiveNotesRefreshInterval,
  shouldRefreshStreamingLiveNotes,
  type ListenAiNote,
  type ListenLiveNotesState,
} from "../shared/listenLiveNotes.ts";
import { refreshListenNotesWithAI } from "./listenNotesAiRefresh.ts";
import { extractSpeakerNames, extractNamesFromTitle } from "../shared/speakerNameExtraction.ts";
import {
  initialLiveTranslateRuntime,
  shouldPersistTranslateChunk,
  shouldPersistTranslationOnly,
  startLiveTranslate,
  stopLiveTranslate,
  updateLiveTranslateConfig,
  translateAllowsMicrophone,
} from "../shared/liveTranslateState.ts";
import type { LiveTranslateRuntimeState } from "../shared/liveTranslateTypes.ts";
import {
  shouldSuppressTranslateStartupError,
  isTranslateHardError,
  TRANSLATE_SILENCE_GRACE_MS,
  TRANSLATE_WAITING_CAPTION,
} from "../shared/liveTranslateGrace.ts";
import { processTranslateTranscriptChunk, translateEventMetadata } from "./liveTranslateMain.ts";
import { applyCaptionChunk } from "../shared/liveTranslateCaptions.ts";
import {
  applyListenTranscriptFragment,
  initialListenRollingTranscript,
  rollingTranscriptWindow,
  type ListenRollingTranscriptState,
} from "../shared/listenStreamingTranscript.ts";
import {
  decideListenCardSurface,
  type ListenCardSurfaceDecision,
} from "../shared/listenCardState.ts";
import {
  appendTranscriptDeduped,
  dedupeTranscriptEventsForDisplay,
  isDuplicateTranscriptChunk,
  transcriptSourceFromTags,
} from "../shared/transcriptDedupe.ts";
import {
  buildListenCheckpointSummary,
  shouldWriteListenCheckpoint,
  STREAMING_LISTEN_CHECKPOINT_MINUTES,
  listenCheckpointsFromSessionEvents,
} from "../shared/listenCheckpoint.ts";
import {
  applyMeetingTypeOverrideInEngine,
  deleteMeetingMoment,
  addMeetingMoment,
  resetMeetingIntelligenceState,
  runMeetingIntelligencePass,
  shouldRunExtractionPass,
} from "../shared/meetingIntelligenceEngine.ts";
import {
  getMeetingSchema,
  type ExtractedMomentRaw,
} from "../shared/meetingExtractionSchemas.ts";
import {
  buildMeetingExtractionPrompt,
  parseExtractionResponse,
} from "../shared/meetingExtractionPrompts.ts";
import { buildMeetingReport } from "../shared/meetingReport.ts";
import {
  MEETING_EXTRACTION_INTERVAL_MS,
  MEETING_INTELLIGENCE_INITIAL_STATE,
  MEETING_SUB_TYPE_LABELS,
  type MeetingIntelligenceState,
  type MeetingMoment,
} from "../shared/meetingIntelligenceTypes.ts";
import {
  pruneRunningTranscript,
  pruneTranscriptSessionEvents,
} from "../shared/listenSessionRetention.ts";
import { isListeningLimitEnabled } from "../shared/listeningLimit.ts";
import {
  buildSessionDebrief,
  buildDebriefAiPrompt,
  detectDebriefTrigger,
} from "../shared/copilotDebrief.ts";
import {
  createListeningLimitState,
  extendListeningLimit,
  LISTENING_LIMIT_RESPONSE_TIMEOUT_MS,
  markListeningLimitReached,
  resetListeningLimitState,
  shouldAutoStopListeningLimit,
  shouldTriggerListeningLimit,
  type ListeningLimitState,
} from "../shared/listeningLimit.ts";
import { processSttChunk, type SttProcessChunkPayload } from "./sttChunkHandler.ts";
import type { GlassSttState } from "../shared/ipc.ts";
import {
  CAPTURE_NO_SESSION_HINT,
  CAPTURE_SESSION_SUCCESS_MESSAGE,
  CAPTURE_SUCCESS_MESSAGE,
  LISTENING_STOPPED_MESSAGE,
  captureErrorMessage,
  createInitialOperationDiagnostics,
  diagnosticsForCapture,
  diagnosticsForListening,
  recordOperation,
  type GlassOperationDiagnostics,
} from "../shared/glassOperations.ts";
import {
  broadcastTranscriptionControl,
  stopAllActiveCaptureAndListening,
} from "./glassOperations.ts";
import {
  restoreMacOutputFromSettings,
  broadcastStartupAudioRestore,
} from "./startupAudioRestore.ts";
import { getCurrentMacOutputDeviceName } from "./macAudioOutput.ts";
import { installBlackHoleAndSetupAudio } from "./blackHoleInstaller.ts";
import {
  appendCommandFeedItem,
  createCommandFeedItem,
  type GlassCommandFeedItem,
} from "../shared/commandFeed.ts";
import { askIivoGlass, askIivoGlassStream, GlassAskCancelledError, isGlassAskPayloadTooLargeError } from "./glassAskClient.ts";
import { optimizeVisualAskImage } from "./visualImageOptimizer.ts";
import { applyOptimizedToPayload } from "./glassVisualAskCapture.ts";
import {
  GLASS_VISUAL_PAYLOAD_RETRY_MESSAGE,
  GLASS_VISUAL_PAYLOAD_TOO_LARGE_MESSAGE,
} from "../shared/visualImageOptimizerConfig.ts";
import type { VisualAskPayloadDiagnostics } from "../shared/glassScreenContext.ts";
import { chooseVisualQualityPreset } from "../shared/visualAskQuality.ts";
import {
  formatBytesShort,
  visualAskUserMessageForFrame,
  type VisualAskDiagnostics,
} from "../shared/visualAskDiagnostics.ts";
import {
  preflightCodeToServerResult,
} from "../shared/visualAskPreflight.ts";
import { runVisualAskPreflight } from "./glassVisualAskPreflight.ts";
import { uploadGlassScreenshotContext } from "./glassLatestScreenshot.ts";
import {
  buildVisualAskRetentionStatus,
  shouldAutoUploadCapturesToContext,
  shouldDiscardEphemeralAfterAsk,
  VISUAL_ASK_RETENTION_DISMISS_MS,
  type EphemeralVisualCapture,
  type GlassVisualAskRetention,
} from "../shared/glassScreenshotRetention.ts";
import { createLatestScreenshotState } from "../shared/glassLatestScreenshotAsk.ts";
import type { GlassAskSessionPayload, GlassAskStatus, GlassLastAskResponse } from "../shared/glassAskTypes.ts";
import { isSubstantialResponse } from "../shared/glassAskTypes.ts";
import { companionPrefersResponsePanel } from "../shared/glassCompanion.ts";
import {
  buildGlassScreenContextStatus,
  promptRequestsGlassScreenVisual,
  type GlassLatestScreenshotState,
  type GlassScreenContextPhase,
} from "../shared/glassScreenContext.ts";
import { shouldCaptureScreenForGlassAsk } from "../shared/glassVisualIntent.ts";
import { resolveScreenshotForVisualAsk } from "./glassVisualAskCapture.ts";
import {
  DEFAULT_GLASS_USER_SETTINGS,
  type GlassUserSettings,
} from "../shared/glassSettings.ts";
import { parseUiLocale, isUiLocaleChosen, deepgramLanguageCode } from "../shared/glassLocale.ts";
import { loadGlassUserSettings, persistGlassUserSettings } from "./glassSettingsPersistence.ts";
import {
  buildGlassSetupCapabilities,
  formatSetupCheckSummary,
  isServerConnectivityMessage,
  mapCaptureErrorToScreenCaptureStatus,
  VIRTUAL_AUDIO_HELP_DETAIL,
  type GlassCapabilityRow,
  type GlassServerHealthForSetup,
  type MicPermissionReport,
  type ScreenCaptureProbeStatus,
  type WindowCaptureProbeStatus,
} from "../shared/glassCapabilities.ts";
import { shouldRaiseOverlayForNotifications } from "../shared/glassNotifications.ts";
import type { CaptureDiagnosticsReport } from "../shared/captureDiagnostics.ts";
import { runCaptureDiagnosticsReport } from "./captureDiagnostics.ts";
import { startScreenDigestLoop, isDigestFresh } from "./glassScreenDigest.ts";
import type { ScreenDigestResult } from "./glassScreenDigest.ts";
import {
  collectGlassAppIdentityReport,
  findDuplicateGlassAppBundles,
} from "./glassAppIdentityDiagnostic.ts";
import { runGlassSetupCheck } from "./glassSetupCheck.ts";
import { openGlassSystemSettings } from "./glassSystemSettings.ts";
import { glassMenuAppName } from "../shared/glassAppIdentity.ts";
import type { GlassAppIdentityReport, DuplicateGlassAppBundle } from "../shared/glassAppIdentityReport.ts";
import { buildDuplicateAppWarning } from "../shared/glassPackagingVariant.ts";
import type { ScreenCaptureProbeSnapshot } from "../shared/screenCaptureProbe.ts";
import {
  DUPLICATE_APP_CAPTURE_FAILURE_MESSAGE,
  formatScreenCaptureProbeDebug,
} from "../shared/screenCaptureProbe.ts";
import { detectVirtualAudioDevices } from "../shared/virtualAudioDevices.ts";
import {
  BLACKHOLE_SETUP_INSTRUCTIONS,
  pickPreferredVirtualAudioDevice,
  resolveVirtualAudioDeviceId,
} from "../shared/virtualAudioCapture.ts";
import type { VirtualAudioDeviceMatch } from "../shared/virtualAudioDevices.ts";
import { lookupGlassErrorAnswer } from "../shared/glassErrorFAQ.ts";
import {
  saveMemoryEntry,
  searchMemory,
  getRecentMemory,
} from "./glassMemory.ts";
import {
  writeFile as glassWriteFile,
  applyCodeToFile,
  readFileForDiff,
  restoreBackup,
  injectKeystrokes,
  runShellCommand,
} from "./glassActions.ts";
import {
  buildDesignToCodePrompt,
  isEditorAppName,
  DEFAULT_DESIGN_STACK,
  type DesignToCodeAction,
  type DesignStack,
} from "../shared/designToCode.ts";
import { computeUnifiedDiff, collapseUnchanged } from "../shared/diff.ts";
import {
  createPtySession,
  writePtyInput,
  resizePty,
  killPtySession,
  killAllPtySessions,
  getPtyReplayBuffer,
  getPtyReplayBufferFrom,
  getPtyReplayBufferLength,
  getForegroundProcessName,
  getActivePtySessionIds,
} from "./glassTerminal.ts";
import {
  registerSession as registerScrollbackSession,
  writeBlocks as writeScrollbackBlocks,
  getRecentSummary as getScrollbackRecentSummary,
  getByIdsInOrder as getScrollbackByIdsInOrder,
  closeDb as closeScrollbackDb,
} from "./scrollbackStore.ts";
import {
  normalizeScrollbackWriteBlocks,
  parseScrollbackSearchIds,
} from "./scrollbackValidation.ts";
import {
  readCodeContext,
  formatCodeContext,
  parseFileNameFromTitle,
  detectLanguage,
} from "./codeContextReader.ts";
import { buildCoderBootstrapContext } from "./agentCoderBootstrap.ts";
import {
  buildReviewFixPrompt,
  buildVerifyFixPrompt,
  canStartLoopFix,
  CODER_LOOP_MAX_ITERATIONS,
  generateProjectMemory,
  incrementLoopForFix,
  orchestrateAfterCoderDone,
} from "./coderBuildLoop.ts";
import { runQaPipeline, triggerQaFixAll } from "./coderQaPipeline.ts";
import type { QaPipelineHost } from "./coderQaPipeline.ts";
import { CoderPostRunScheduler } from "./coderPostRunOrchestration.ts";
import type { CoderPostRunOrchestrationHost } from "./coderPostRunOrchestration.ts";
import { isCoderRunEligibleForPostRun } from "../shared/coderPostRunOrchestration.ts";
import type { CoderBuildLoopHost } from "../shared/coderBuildLoopHost.ts";
import { narrateToolStart } from "../shared/agentNarration.ts";
import {
  checkOllamaAvailable,
  closeAllIndexDbs,
  getIndexFileCount,
  hasIndex,
  indexFile,
  indexProject,
  reindexProject,
  searchIndex,
  startWatching,
  stopAllWatchers,
  stopWatching,
} from "./glassIndex.ts";
import { detectAgentScreenContextFromCapture } from "./screenContext.ts";
import { expandTildePath, resolveProjectFilePath, filterExistingRelPaths, sanitizeAgentScreenContext } from "../shared/agentProjectPaths.ts";
import { isAllowedPreviewUrl, normalizePreviewUrl, parseDevServerUrl } from "../shared/glassIdePreview.ts";
import {
  listGlassIdeProjectFiles,
  readGlassIdeProjectFile,
  writeGlassIdeProjectFile,
} from "./glassIdeProject.ts";
import {
  maybeStartStaticIdePreview,
  stopStaticPreviewServer,
} from "./glassIdeStaticServer.ts";
import { readGlassIdeTsConfig } from "./glassIdeTsConfig.ts";
import {
  clearGlassIdeEditorContext,
  enrichAgentPromptForIde,
  getGlassIdeEditorContext,
  resolveGlassIdeVoiceFileQuery,
  setGlassIdeEditorContext,
} from "./glassIdeEditorContext.ts";
import { matchGlassIdeEditorVoiceIntent } from "../shared/glassIdeEditorContext.ts";
import {
  clampGlassIdeEditorSplitRatio,
  clampGlassIdeStreamWidthPx,
  clampGlassIdeTreeWidthPx,
  type GlassIdeLayoutSettings,
} from "../shared/glassIdeLayout.ts";
import { SCREEN_DETECT_TIMEOUT_MS } from "../shared/screenDetect.ts";
import { readImportGraph } from "./importGraphReader.ts";
import { watchCustomCommands } from "./customCommandsLoader.ts";
import { buildShellThenPromptText } from "../shared/customCommands.ts";
import {
  classifyClipboard,
  ClipboardIntelligenceGate,
  buildErrorPrompt,
  buildCodePrompt,
} from "./clipboardIntelligence.ts";

loadGlassEnv();

const mainDir = dirname(fileURLToPath(import.meta.url));

{
  const { apiKey, voiceId, model } = glassElevenLabsConfig();
  if (apiKey) {
    console.log(
      `[IIVO Glass] TTS: ElevenLabs — ${describeElevenLabsVoice(voiceId)} (${voiceId}) model=${model}`,
    );
  } else {
    console.warn(
      "[IIVO Glass] TTS: no ELEVENLABS_API_KEY — Sorting Hat will fall back to macOS speech if server TTS unavailable",
    );
  }
}

/**
 * Scrub known secrets and token-shaped strings from Sentry event payloads
 * before they leave the device. Runs on every event in beforeSend.
 *
 * We redact:
 *   1. Any baked-in env var value that is non-empty (API keys, secrets, DSN)
 *   2. OpenAI sk- bearer tokens
 *   3. Any run of 40+ hex chars (catches Deepgram-style keys)
 */
function scrubSentryString(s: string): string {
  const secrets: string[] = [
    process.env.IIVO_GLASS_API_SECRET,
    process.env.DEEPGRAM_API_KEY,
    process.env.IIVO_GLASS_OPENAI_API_KEY,
    process.env.OPENAI_API_KEY,
    process.env.SENTRY_DSN,
  ].filter((v): v is string => typeof v === "string" && v.length > 8);

  let out = s;
  for (const secret of secrets) {
    // Escape for regex in case value contains special chars.
    const escaped = secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(escaped, "g"), "[REDACTED]");
  }
  // Generic: OpenAI-style bearer tokens and long hex keys.
  out = out.replace(/sk-[A-Za-z0-9]{20,}/g, "[REDACTED]");
  out = out.replace(/\b[0-9a-f]{40,}\b/g, "[REDACTED]");
  return out;
}

function scrubSentryEvent(event: Parameters<NonNullable<Parameters<typeof Sentry.init>[0]["beforeSend"]>>[0]): typeof event {
  // Scrub exception messages.
  if (event.exception?.values) {
    for (const ex of event.exception.values) {
      if (ex.value) ex.value = scrubSentryString(ex.value);
    }
  }
  // Scrub top-level message.
  if (event.message) {
    event.message = scrubSentryString(event.message);
  }
  // Scrub breadcrumb messages + data strings.
  if (event.breadcrumbs?.length) {
    for (const crumb of event.breadcrumbs) {
      if (crumb.message) crumb.message = scrubSentryString(crumb.message);
      if (crumb.data && typeof crumb.data === "object") {
        const data = crumb.data as Record<string, unknown>;
        for (const k of Object.keys(data)) {
          if (typeof data[k] === "string") data[k] = scrubSentryString(data[k] as string);
        }
      }
    }
  }
  return event;
}

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  release: app.getVersion(),
  environment: app.isPackaged ? "production" : "development",
  // Only report errors in packaged (production) builds.
  // Dev builds throw various expected errors (auth mismatches, missing env vars,
  // audio probe failures) that are noise in the Sentry dashboard.
  enabled: app.isPackaged,
  attachStacktrace: true,
  maxBreadcrumbs: 40,
  beforeSend(event) {
    return scrubSentryEvent(event);
  },
});
app.setName(glassMenuAppName(app.isPackaged));
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
installDefaultGlassHandoffOpener();
installGlassE2eHooks();

if (process.env.IIVO_GLASS_E2E === "1" || !app.isPackaged) {
  app.commandLine.appendSwitch("remote-debugging-port", "19222");
}

applySystemAudioChromiumFlags();

const defaultWindowContext: WindowContext = {
  status: "unavailable",
  reason: WINDOW_CONTEXT_UNAVAILABLE_MESSAGE,
};

protocol.registerSchemesAsPrivileged([
  {
    scheme: "glass-screenshot",
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

const config = resolveConfig(process.env);
const sttConfig = resolveSttConfig(process.env);

interface AppState {
  privacy: PrivacyState;
  transcript: string;
  panelTab: PanelTab;
  lastError?: string;
  lastNotice?: string;
  lastSentUrl?: string;
  pendingCaptureDataUrl?: string;
  latestScreenshot?: GlassLatestScreenshotState | null;
  visualAskPhase: GlassScreenContextPhase;
  visualAskRetention: GlassVisualAskRetention | null;
  visualAskPayloadDiagnostics: VisualAskPayloadDiagnostics | null;
  visualAskDiagnostics: VisualAskDiagnostics | null;
  ephemeralVisualCapture: EphemeralVisualCapture | null;
  sessionActionStatus: SessionActionStatus;
  transcriptionMode: TranscriptionMode;
  systemAudioStatus: SystemAudioStatus;
  systemAudioDetail?: string;
  windowContext: WindowContext;
  iivoAnalysis: IivoAnalysisState;
  stt: GlassSttState;
  operationDiagnostics: GlassOperationDiagnostics;
  commandFeed: GlassCommandFeedItem[];
  askStatus: GlassAskStatus;
  partialAnswer?: string;
  lastAskResponse?: GlassLastAskResponse;
  askInFlight: boolean;
  glassSettings: GlassUserSettings;
  screenCaptureProbe: ScreenCaptureProbeStatus;
  screenCaptureDetail?: string;
  windowCaptureProbe: WindowCaptureProbeStatus;
  windowCaptureDetail?: string;
  micPermission: MicPermissionReport;
  serverHealthForSetup: GlassServerHealthForSetup | null;
  setupCapabilities: GlassCapabilityRow[];
  setupCheckSummary?: string;
  captureDiagnosticsReport?: CaptureDiagnosticsReport;
  appIdentityReport?: GlassAppIdentityReport;
  duplicateAppBundles: DuplicateGlassAppBundle[];
  duplicateAppWarning?: string;
  virtualAudioDevices: VirtualAudioDeviceMatch[];
  selectedVirtualAudioDeviceId?: string;
  nativeLoopbackTested: boolean;
  voiceModeStartNonce: number;
  companionModeActive: boolean;
  companionModeToggleNonce: number;
  /** OmniParser warm-up phase for Companion toggle TTS. */
  companionWarmupPhase: "none" | "warming" | "ready";
  /** Bumped when companionWarmupPhase changes — renderer speaks warm/ready lines. */
  companionWarmupSpeakNonce: number;
  companionPresence: import("../shared/companionGuidance.ts").CompanionGuidancePayload | null;
  /** Phase 4a — multi-turn Companion session memory. */
  companionMemory: CompanionSessionMemory | null;
  companionPrivacy?: {
    active: boolean;
    resumeAt: number;
    durationMs: number;
  };
  translateSetupRequestId: number;
  agentRun: GlassAgentRunState | null;
  agentHistory: import("../shared/ipc.ts").AgentHistoryEntry[];
  agentPendingApproval: import("../shared/ipc.ts").GlassState["agentPendingApproval"];
  agentChangeLog: import("../shared/ipc.ts").AgentChangeLogEntry[];
  coderWorkspaceActive: boolean;
  glassIdeActive: boolean;
  glassIdePreviewUrl: string | null;
  glassIdePreviewReloadNonce: number;
  glassIdeTerminalExpanded: boolean;
  glassIdeAletheia: import("../shared/glassIdeAletheiaAdvisory.ts").GlassIdeAletheiaSnapshot;
  indexState: import("../shared/ipc.ts").GlassIndexState;
  ollamaAvailable: boolean;
  projectMemoryState: import("../shared/ipc.ts").ProjectMemoryState | null;
  coderVerifyState: import("../shared/ipc.ts").CoderVerifyState | null;
  coderReviewState: import("../shared/ipc.ts").CoderReviewState | null;
  qaPipelineState: import("../shared/glassQaPipeline.ts").QaPipelineState | null;
  qaNotificationVisible: boolean;
  coderLoopIteration?: number;
  coderLoopSessionId?: string;
  mediaContext: MediaContext | null;
  appUpdate: GlassAppUpdateState;
  listenCountdownSeconds?: number;
  onboardingOpen: boolean;
  glassUserProfile: GlassUserProfile | null;
  commandBarStackHeightPx?: number;
  commandBarOverlayClearancePx?: number;
  listenLiveNotes?: ListenLiveNotesState;
  blackHoleInstallStatus?: import("../shared/ipc.ts").GlassState["blackHoleInstallStatus"];
  blackHoleInstallProgress?: string;
  iivoAccountLink: import("../shared/iivoAccountLink.ts").IivoAccountLink | null;
  omniParserInstall: import("../shared/omniParserInstall.ts").OmniParserInstallState;
  /** Last known clipboard text content (polled every 2 s, silent). */
  clipboardText?: string;
  /** Name of the frontmost app, updated on each app switch. */
  activeApp?: string;
  /** Name of the app that was frontmost before Glass itself took focus. */
  previousApp?: string;
  /** One-sentence ambient digest of what the user is working on right now. */
  workingContext?: string;
  /** Unix ms timestamp of the last workingContext update. */
  workingContextAge?: number;
  /** Running shell commands and their streaming output (action execution engine). */
  shellOutputs?: Record<string, {
    id: string;
    command: string;
    output: string;
    status: "running" | "done" | "error";
    exitCode?: number;
  }>;
  /** Result of the most recent write-file, inject-keystrokes, apply-fix, or restore-backup action. */
  actionResult?: {
    id: string;
    type: "write-file" | "inject-keystrokes" | "apply-fix" | "restore-backup";
    status: "ok" | "error";
    message: string;
  };
  /** Whether the dock terminal panel is open. */
  glassDockTerminalOpen?: boolean;
  /** Active PTY session id. */
  glassDockTerminalId?: string;
  /** Open PTY tabs — active id is glassDockTerminalId. */
  glassDockTerminalTabs?: Array<{ id: string }>;
  /** One-shot action for the terminal renderer (⌘⇧P, etc.). */
  glassTerminalPendingAction?: import("../shared/terminalPanelActions.ts").GlassTerminalPendingAction;
  /** Whether the ⌘⇧P powers quick-launcher palette is visible. */
  powersMenuOpen?: boolean;
  /** Whether the ⌘⇧G Command Palette overlay is visible. */
  commandPaletteOpen?: boolean;
  /** Bumped when Command Palette requests re-showing the Glass Response Panel. */
  responsePanelRevealSeq?: number;
  /** Pending diff previews keyed by feed item id. */
  pendingDiffs?: import("../shared/ipc.ts").GlassState["pendingDiffs"];
  /** Active design-to-code capture cards keyed by feed item id (#163). */
  designCaptures?: import("../shared/ipc.ts").GlassState["designCaptures"];
  /** Build verification status keyed by feed item id (#163). */
  buildVerifications?: import("../shared/ipc.ts").GlassState["buildVerifications"];
  /** User-defined slash commands from ~/.iivo/glass-commands.json (#165). */
  customCommands?: import("../shared/ipc.ts").GlassState["customCommands"];
  /** Validation warnings from last custom commands load (#165). */
  customCommandsWarnings?: string[];
  /** Whether first-launch onboarding has been completed (Sorting Hat). */
  onboardingComplete?: boolean;
  /** Boot splash finished — Sorting Hat must not mount until true. */
  glassBootComplete?: boolean;
  /** The persona assigned during Sorting Hat onboarding. */
  persona?: "developer" | "sales" | "operator" | "writer" | "general";
  /** Audio chunk from TTS — base64 encoded mp3, played by renderer then cleared. */
  ttsAudio?: TimedTtsPayload;
  /** Epoch ms when Sorting Hat last finished — suppresses greeting TTS overlap. */
  onboardingFinishedAt?: number;
  /** E2E — shorten Sorting Hat manifest delays. */
  e2eFastOnboarding?: boolean;
}

/** Set true in will-quit — prevents PTY onExit callbacks from calling push() on destroyed windows. */
let appIsQuitting = false;

// ── Build monitor state (#162) ────────────────────────────────────────────────
/** Debounce timers for in-stream build error detection, keyed by PTY session id. */
const buildMonitorDebounce = new Map<string, ReturnType<typeof setTimeout>>();
/** Rolling output buffers for build error detection (last 60 stripped lines), keyed by PTY id. */
const buildMonitorBuffers = new Map<string, string[]>();
/** Fingerprint of the last build-error card surfaced per PTY id — prevents duplicate cards. */
const buildMonitorLastFingerprint = new Map<string, string>();
const BUILD_MONITOR_BUFFER_LINES = 60;
const BUILD_MONITOR_DEBOUNCE_MS = 600;

// ── Terminal tab auto-title (#42) ───────────────────────────────────────────────
/** Foreground-process polling timers keyed by PTY session id. */
const titlePollIntervals = new Map<string, ReturnType<typeof setInterval>>();

function startTitlePolling(termId: string): void {
  stopTitlePolling(termId); // clear any existing
  const interval = setInterval(async () => {
    try {
      const title = await getForegroundProcessName(termId);
      const win = getWindows()?.terminal;
      if (win && !win.isDestroyed()) {
        win.webContents.send(IPC.terminalTitleUpdate, termId, title);
      }
    } catch { /* ignore */ }
  }, 2000);
  titlePollIntervals.set(termId, interval);
}

function stopTitlePolling(termId: string): void {
  const existing = titlePollIntervals.get(termId);
  if (existing) {
    clearInterval(existing);
    titlePollIntervals.delete(termId);
  }
  // Send a null title to reset the header
  const win = getWindows()?.terminal;
  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC.terminalTitleUpdate, termId, null);
  }
}

let terminalActionNonce = 0;

function getTerminalTabs(): Array<{ id: string }> {
  return state.glassDockTerminalTabs ?? [];
}

function setTerminalTabs(tabs: Array<{ id: string }>): void {
  state.glassDockTerminalTabs = tabs.length > 0 ? tabs : undefined;
}

function syncTerminalTabsWithLiveSessions(): void {
  const live = new Set(getActivePtySessionIds());
  setTerminalTabs(getTerminalTabs().filter((t) => live.has(t.id)));
}

function appendTerminalTab(termId: string): void {
  setTerminalTabs([...getTerminalTabs(), { id: termId }]);
}

function removeTerminalTab(termId: string): void {
  setTerminalTabs(getTerminalTabs().filter((t) => t.id !== termId));
}

function pickLiveTerminalTabId(): string | undefined {
  const live = new Set(getActivePtySessionIds());
  const active = state.glassDockTerminalId;
  if (active && live.has(active)) return active;
  return getTerminalTabs().find((t) => live.has(t.id))?.id;
}

function handlePtySessionData(id: string, data: string): void {
  const terminal = getWindows()?.terminal;
  if (terminal && !terminal.isDestroyed()) {
    terminal.webContents.send(IPC.ptyData, id, data);
  }
  if (state.glassIdeActive) {
    const overlay = getWindows()?.overlay;
    if (overlay && !overlay.isDestroyed()) {
      overlay.webContents.send(IPC.ptyData, id, data);
    }
  }
  maybeSetIdePreviewUrlFromTerminal(data);
  notifyIdeChromePtyOutput(id, data);
  const stripped = data.replace(/\x1b\[[0-9;]*[A-Za-z]|\x1b\][^\x07]*\x07/g, "").replace(/\r/g, "");
  const buf = buildMonitorBuffers.get(id) ?? [];
  buf.push(...stripped.split("\n"));
  if (buf.length > BUILD_MONITOR_BUFFER_LINES) {
    buf.splice(0, buf.length - BUILD_MONITOR_BUFFER_LINES);
  }
  buildMonitorBuffers.set(id, buf);
  const existing = buildMonitorDebounce.get(id);
  if (existing) clearTimeout(existing);
  buildMonitorDebounce.set(id, setTimeout(() => {
    buildMonitorDebounce.delete(id);
    void checkBuildMonitor(id, buf);
  }, BUILD_MONITOR_DEBOUNCE_MS));
}

function handlePtySessionExit(
  id: string,
  exitCode: number,
  context: import("./glassTerminal.ts").GlassTerminalExitContext,
): void {
  if (appIsQuitting) return;
  stopTitlePolling(id);
  removeTerminalTab(id);
  if (state.glassDockTerminalId === id) {
    state.glassDockTerminalId = pickLiveTerminalTabId();
  }
  const debounce = buildMonitorDebounce.get(id);
  if (debounce) { clearTimeout(debounce); buildMonitorDebounce.delete(id); }
  buildMonitorBuffers.delete(id);
  buildMonitorLastFingerprint.delete(id);
  push();
  if (exitCode !== 0 && context.lastCommand) {
    void handleTerminalAutoFix(id, exitCode, context);
  }
}

function spawnGlassDockPtySession(): string {
  const termId = createPtySession({
    onData: handlePtySessionData,
    onExit: handlePtySessionExit,
  });
  appendTerminalTab(termId);
  state.glassDockTerminalId = termId;
  registerScrollbackSession(termId, homedir());
  startTitlePolling(termId);
  return termId;
}

function killGlassDockTerminalTab(termId: string): void {
  stopTitlePolling(termId);
  killPtySession(termId);
}

function ensureGlassTerminalSession(): string {
  syncTerminalTabsWithLiveSessions();
  const live = pickLiveTerminalTabId();
  if (live) {
    state.glassDockTerminalId = live;
    return live;
  }
  return spawnGlassDockPtySession();
}

function dispatchTerminalPanelAction(
  action: import("../shared/terminalPanelActions.ts").GlassTerminalPanelAction,
): void {
  state.glassTerminalPendingAction = { action, nonce: ++terminalActionNonce };
  push();
  showGlassTerminalWindowUnlessIde();
}

let askAbortController: AbortController | null = null;
let askRequestGeneration = 0;
/** AX/DOM UiMap captured during companion visual ask — merged into guidance on response. */
let companionLocalUiMapForAsk: UiMap | null = null;
let companionAnchorBaseline: AnchorWatchSnapshot | null = null;
let companionAnchorWatchTimer: ReturnType<typeof setInterval> | null = null;
let thinkingStartedAtMs: number | null = null;
let lookingStartedAtMs: number | null = null;
let glassUserSettings: GlassUserSettings = { ...DEFAULT_GLASS_USER_SETTINGS };

const state: AppState = {
  privacy: { ...initialPrivacyState },
  transcript: "",
  panelTab: "setup",
  sessionActionStatus: "idle",
  transcriptionMode: "manual",
  systemAudioStatus: resolveInitialSystemAudioStatus(
    process.platform,
    darwinMajorFromRelease(release()),
  ),
  windowContext: defaultWindowContext,
  iivoAnalysis: { status: "idle" },
  stt: buildGlassSttState(sttConfig, {
    deepgramEnabled: !!(process.env.DEEPGRAM_API_KEY?.trim()),
  }),
  operationDiagnostics: createInitialOperationDiagnostics(),
  commandFeed: [],
  commandBarStackHeightPx: undefined,
  commandBarOverlayClearancePx: undefined,
  askStatus: "idle",
  askInFlight: false,
  latestScreenshot: null,
  visualAskPhase: "idle",
  visualAskRetention: null,
  visualAskPayloadDiagnostics: null,
  visualAskDiagnostics: null,
  ephemeralVisualCapture: null,
  glassSettings: { ...DEFAULT_GLASS_USER_SETTINGS },
  screenCaptureProbe: "unknown",
  windowCaptureProbe: "unknown",
  micPermission: "not_requested",
  serverHealthForSetup: null,
  setupCapabilities: [],
  duplicateAppBundles: [],
  virtualAudioDevices: [],
  nativeLoopbackTested: false,
  voiceModeStartNonce: 0,
  companionModeActive: false,
  companionModeToggleNonce: 0,
  companionWarmupPhase: "none",
  companionWarmupSpeakNonce: 0,
  companionPresence: null,
  companionMemory: null,
  companionPrivacy: undefined,
  translateSetupRequestId: 0,
  agentRun: null,
  agentHistory: [],
  agentPendingApproval: null,
  agentChangeLog: [],
  coderWorkspaceActive: false,
  glassIdeActive: false,
  glassIdePreviewUrl: null,
  glassIdePreviewReloadNonce: 0,
  glassIdeTerminalExpanded: false,
  glassIdeAletheia: emptyGlassIdeAletheiaSnapshot(),
  indexState: { projectRoot: "", status: "idle" },
  ollamaAvailable: false,
  projectMemoryState: null,
  coderVerifyState: null,
  coderReviewState: null,
  qaPipelineState: null,
  qaNotificationVisible: false,
  mediaContext: null,
  appUpdate: emptyGlassAppUpdateState(app.getVersion()),
  onboardingOpen: false,
  glassUserProfile: null,
  iivoAccountLink: null,
  omniParserInstall: getOmniParserInstallState(),
};

const ideChromeOrchestrator = new IdeChromeOrchestrator({
  isIdeActive: () => state.glassIdeActive === true,
  getExpanded: () => state.glassIdeTerminalExpanded,
  setExpanded: (expanded) => {
    state.glassIdeTerminalExpanded = expanded;
  },
  push,
});

const ideAletheiaAdvisory = new IdeAletheiaAdvisory({
  isIdeActive: () => state.glassIdeActive === true,
  getEditorContext: getGlassIdeEditorContext,
  getSettings: () => state.glassSettings,
  persistSettings: async (settings) => {
    state.glassSettings = settings;
    glassUserSettings = settings;
    await persistGlassUserSettings(settings);
  },
  getTerminalInteractionAt: () => ideChromeOrchestrator.getLastTerminalInteractionAt(),
  getLoopIteration: () => state.coderLoopIteration,
  getAdvisorySnapshot: () => state.glassIdeAletheia,
  setAdvisorySnapshot: (snapshot) => {
    state.glassIdeAletheia = snapshot;
  },
  push,
  getRunSignals: () => {
    const agentRun = state.agentRun?.agentId === "coder" ? state.agentRun : null;
    const qa = state.qaPipelineState;
    const verify = state.coderVerifyState;
    const qaHasFail = Boolean(qa?.checks.some((c) => c.status === "fail"));
    const qaRunning = qa?.status === "running"
      || Boolean(qa?.checks.some((c) => c.status === "running"));
    const verifyFailed = verify?.status === "fail";
    const failedCheck = qa?.checks.find((c) => c.status === "fail");
    const errorHint =
      state.lastError
      ?? verify?.output?.slice(0, 240)
      ?? failedCheck?.detail
      ?? failedCheck?.label
      ?? null;
    return {
      agentRunning: agentRun?.status === "running",
      agentFailed: agentRun?.status === "error",
      agentDone: agentRun?.status === "done",
      qaHasFail,
      qaRunning,
      verifyFailed,
      errorHint,
    };
  },
});

function applyIdeChromeSignal(signal: IdeChromeSignal): void {
  ideChromeOrchestrator.onSignal(signal);
  if (state.glassIdeActive) {
    ideAletheiaAdvisory.onRunPhaseChange();
  }
}

function dispatchIdeChromeSignal(signal: IdeChromeSignal): void {
  if (!state.glassIdeActive) {
    applyIdeChromeSignal(signal);
    return;
  }
  const bypassGate =
    signal.kind === "user-set-expanded"
    || signal.kind === "terminal-interaction"
    || signal.kind === "ide-opened"
    || signal.kind === "ide-closed";
  if (bypassGate) {
    applyIdeChromeSignal(signal);
    return;
  }
  const gate = ideAletheiaAdvisory.beforeChromeSignal(signal);
  if (!gate.proceed) return;
  if (gate.deferMs > 0) {
    ideAletheiaAdvisory.scheduleDeferredChromeSignal(signal, gate.deferMs, applyIdeChromeSignal);
    return;
  }
  applyIdeChromeSignal(signal);
}

const ideChromePtyErrorDebounce = new Map<string, ReturnType<typeof setTimeout>>();

function notifyIdeChromePtyOutput(termId: string, data: string): void {
  if (!state.glassIdeActive) return;
  const stripped = data
    .replace(/\x1b\[[0-9;]*[A-Za-z]|\x1b\][^\x07]*\x07/g, "")
    .replace(/\r/g, "");
  const lines = stripped.split("\n").map((l) => l.trim()).filter(Boolean);
  const tail = lines.slice(-4);
  if (!tail.some(isPtyErrorLine)) return;
  const existing = ideChromePtyErrorDebounce.get(termId);
  if (existing) clearTimeout(existing);
  ideChromePtyErrorDebounce.set(
    termId,
    setTimeout(() => {
      ideChromePtyErrorDebounce.delete(termId);
      dispatchIdeChromeSignal({ kind: "pty-error" });
    }, 400),
  );
}

let moments = new SavedMomentsStore();
let sessions = new GlassSessionStore();
let glassContextProfile: GlassContextProfile;

let listenCountdownTimer: ReturnType<typeof setInterval> | null = null;
/**
 * Timestamp of the last proactive (background) media context capture attempt.
 * Reset to 0 each time a fresh listen session boots so the first check fires immediately.
 */
let lastProactiveMediaCaptureMs = 0;
let visualAskRetentionDismissTimer: ReturnType<typeof setTimeout> | null = null;

function clearVisualAskRetentionDismissTimer(): void {
  if (visualAskRetentionDismissTimer) {
    clearTimeout(visualAskRetentionDismissTimer);
    visualAskRetentionDismissTimer = null;
  }
}

function scheduleVisualAskRetentionDismiss(): void {
  clearVisualAskRetentionDismissTimer();
  visualAskRetentionDismissTimer = setTimeout(() => {
    if (state.visualAskRetention?.usedForAnswer) {
      state.visualAskRetention = null;
      push();
    }
    visualAskRetentionDismissTimer = null;
  }, VISUAL_ASK_RETENTION_DISMISS_MS);
}

function cancelListenCountdown(): void {
  if (listenCountdownTimer) {
    clearInterval(listenCountdownTimer);
    listenCountdownTimer = null;
  }
  if (state.listenCountdownSeconds != null) {
    state.listenCountdownSeconds = undefined;
  }
}

function completeListenCountdown(): void {
  if (listenCountdownTimer) {
    clearInterval(listenCountdownTimer);
    listenCountdownTimer = null;
  }
  state.listenCountdownSeconds = undefined;
  broadcastTranscriptionControl({ type: "start" });
  push();
}

function beginListenCapture(mode?: TranscriptionMode): void {
  cancelListenCountdown();
  broadcastTranscriptionControl(mode ? { type: "start", mode } : { type: "start" });
}

/** Atomically start a Listen-mode session and kick off system-audio capture. */
function activateListenMode(): void {
  const preset = GLASS_MODE_PRESETS.listen;
  if (!sessionIsLive()) {
    sessions.startSession("Listen");
    bindCopilotToSession();
    startCopilotLoop();
  }
  const next = withCopilotConfig(copilot.getConfig(), {
    mode: preset.copilotMode,
    sessionType: preset.sessionFocus,
  });
  persistCopilotConfig(next);
  if (copilotModeIsActive(next.mode) && sessionIsLive()) {
    bindCopilotToSession();
    refreshCopilotLoop();
  }
  if (!state.selectedVirtualAudioDeviceId?.trim()) {
    const preferred = pickPreferredVirtualAudioDevice(state.virtualAudioDevices ?? []);
    if (preferred?.deviceId) {
      state.selectedVirtualAudioDeviceId = preferred.deviceId;
      glassUserSettings = {
        ...glassUserSettings,
        selectedVirtualAudioDeviceId: preferred.deviceId,
      };
      state.glassSettings = glassUserSettings;
      void persistGlassUserSettings(glassUserSettings);
    }
  }
  state.transcriptionMode = "system_audio";
  state.operationDiagnostics = recordOperation(state.operationDiagnostics, "request-start-listening", "pending");
  syncListenNotesPadVisibility();
  bootstrapListenNotesPipeline();
  push();
  const virtualDeviceId = resolveVirtualAudioDeviceId({
    selectedVirtualAudioDeviceId: state.selectedVirtualAudioDeviceId,
    virtualAudioDevices: state.virtualAudioDevices,
  });
  console.log(
    `[Glass Listen] activate-listen-mode session=${sessions.current()?.id ?? "none"} ` +
      `virtualDevice=${virtualDeviceId ?? "none"} systemAudio=${state.systemAudioStatus}`,
  );
  beginListenCapture("system_audio");
}

function sessionIsLive(): boolean {
  const s = sessions.current();
  return !!s && (s.status === "active" || s.status === "paused");
}

// --- Session Copilot ---------------------------------------------------------
const copilot = new SessionCopilotController({
  idFactory: () => {
    try {
      if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
    } catch {
      /* fall through */
    }
    return `copilot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  },
  clock: () => new Date().toISOString(),
  now: () => Date.now(),
});
let copilotTimer: ReturnType<typeof setInterval> | null = null;
let copilotBoundSessionId: string | null = null;
let copilotOffered = false;
let systemAudioLastSignalMs: number | undefined;
/** Suppress translate startup errors until this timestamp (covers IPC race). */
let translateGraceUntilMs = 0;
let copilotVisualAskFailures = 0;
const copilotRecentCommands: string[] = [];
const copilotRecentResponses: string[] = [];
let activeListeningRuntime: ActiveListeningRuntimeState = initialActiveListeningRuntime();
let listenMomentRuntime: ListenModeRuntime = initialListenMomentEngineState();
/** AI-generated notes from the GPT-5.5 background pass. Reset on listen stop. */
let listenAiNotes: ListenAiNote[] = [];
/** Timestamp of the last successful AI notes refresh (ms). */
let lastAiNotesRefreshMs: number | undefined;
/** Rolling transcript length at the last AI notes trigger — used to gate on delta. */
let lastAiTranscriptLen = 0;
let liveTranslateRuntime: LiveTranslateRuntimeState = initialLiveTranslateRuntime();

// Wingman Mode runtime — active work companion session
let wingmanState: import("../shared/wingmanSession.ts").WingmanState = {
  active: false,
  session: null,
  inspecting: false,
  report: null,
};
let wingmanSnapshotInterval: ReturnType<typeof setInterval> | null = null;
let wingmanTerminalInterval: ReturnType<typeof setInterval> | null = null;

// ── Context assembler snapshot ────────────────────────────────────────────────
// Captured on ⌘⇧G hotkey press; consumed by the next submitCommand() call.
// Expires after 30 s so a forgotten hotkey press doesn't pollute a later ask.
interface GlassContextSnapshot {
  appName: string | null;
  windowTitle: string | null;
  terminalErrors: string[];
  lastCommand: string | null;
  capturedAt: number; // Date.now()
  // ── Code-aware injection (populated when frontmost app is a known editor) ──
  codeContext: import("./codeContextReader.ts").CodeContext | null;
}
let pendingContextSnapshot: GlassContextSnapshot | null = null;

// Live terminal widget — always-on overlay feed (independent of Wingman)
let liveTerminalState: import("../shared/ipc.ts").LiveTerminalFeed | null = null;
let liveTerminalWidgetVisible = false;
let liveTerminalWidgetPos = { x: 20, y: 60 }; // percent from top-left
let liveTerminalInterval: ReturnType<typeof setInterval> | null = null;
const LIVE_TERMINAL_MAX_LINES = 20;

// Wingman cross-session memory — in-memory search results (library lives in wingman-sessions.jsonl)
let wingmanMemoryState: import("../shared/wingmanMemory.ts").WingmanMemoryState = {
  searchResults: [],
  totalSessions: 0,
  loading: false,
};

// Glass Q&A memory — persisted answers across sessions
/** In-memory results from the last search-memory / get-recent-memory command. */
let glassMemoryResults: import("../shared/ipc.ts").GlassMemoryEntry[] | undefined = undefined;

// Agent proxy — local HTTP proxy for AI agent API interception
let agentProxyState: import("../shared/ipc.ts").AgentProxyState = {
  consented: false,
  running: false,
  port: 7421,
  showConsentModal: false,
  capturedCallCount: 0,
};
let agentProxyServer: import("./agentProxyServer.ts").AgentProxyServer | null = null;

// Action Execution Engine — cancel handles for running shell commands
const shellCancels = new Map<string, () => void>();

// Clipboard Intelligence gate — singleton so cooldown persists across polls
const clipboardIntelGate = new ClipboardIntelligenceGate();

// Ambient Screen Intelligence — most recent passive screen digest
let latestDigest: ScreenDigestResult | undefined = undefined;

// GitHub integration — PAT configuration state
let githubPATState: import("../shared/githubTypes.ts").GitHubPATState = {
  configured: false,
  tokenInvalid: false,
};

// Meeting Intelligence runtime — persists for the duration of a meetings-mode session
let meetingIntelState: MeetingIntelligenceState = { ...MEETING_INTELLIGENCE_INITIAL_STATE };
let meetingIntelTimer: ReturnType<typeof setInterval> | null = null;
/** Moment IDs that have already fired a proactive notice — cleared on session reset. */
const meetingIntelNoticedIds = new Set<string>();
/** Prevents concurrent AI extraction calls when the tick fires faster than the AI responds. */
let meetingExtractionInFlight = false;
let deepgramSession: DeepgramStreamingSession | null = null;
/**
 * Separate Deepgram session dedicated to listen mode (Live Notes).
 * Runs alongside the translate session when both are active.
 * Receives the same raw audio bytes via the IPC audio chunk handler.
 * Produces diarized transcript chunks tagged [S0]/[S1] for the rolling transcript.
 */
let listenDeepgramSession: DeepgramStreamingSession | null = null;
let listenDeepgramReconnectAttempts = 0;
const LISTEN_DEEPGRAM_RECONNECT_BASE_MS = 1_000;
const LISTEN_DEEPGRAM_RECONNECT_MAX_MS = 30_000;

/** Companion mic — Deepgram diarization when DEEPGRAM_API_KEY is set. */
let companionDeepgramSession: DeepgramStreamingSession | null = null;
let companionDeepgramReconnectAttempts = 0;
const COMPANION_DEEPGRAM_MAX_RECONNECT_ATTEMPTS = 3;

/** Safety-net ambient classifier state (renderer is primary). */
let companionLastSpeakerId: number | undefined;
let companionSpeakerChangeCount = 0;
let companionLastResponseAt = 0;

let companionPrivacyTimer: ReturnType<typeof setTimeout> | null = null;

function clearCompanionPrivacyTimer(): void {
  if (companionPrivacyTimer) {
    clearTimeout(companionPrivacyTimer);
    companionPrivacyTimer = null;
  }
}

function resetCompanionAmbientState(): void {
  companionLastSpeakerId = undefined;
  companionSpeakerChangeCount = 0;
  companionLastResponseAt = 0;
}

function clearCompanionPrivacyState(): void {
  clearCompanionPrivacyTimer();
  state.companionPrivacy = undefined;
}

/**
 * Push raw interim text directly to captions as a live preview — no translation API call.
 * The translated final will replace this when speech_final fires.
 */
function pushInterimCaptionPreview(text: string): void {
  if (!isTranslateActive()) return;
  liveTranslateRuntime = {
    ...liveTranslateRuntime,
    captions: applyCaptionChunk(liveTranslateRuntime.captions, {
      original: text,
      translated: text, // raw preview; translation replaces this on final
      interim: true,
      id: "deepgram-interim",
    }),
  };
  push();
}

function stopDeepgramSession(): void {
  if (deepgramSession) {
    deepgramSession.close();
    deepgramSession = null;
    console.log("[deepgram] session closed");
  }
}

/**
 * Seed `listenSpeakerNames` from the active browser tab title before Deepgram
 * connects.  Catches names mentioned in the video intro that play during the
 * ~2-5s Deepgram warm-up gap.
 *
 * Fire-and-forget — failures are silently ignored (missing app, no tab, etc.).
 */
function seedSpeakerNamesFromBrowserTitle(): void {
  // Try Chrome first, fall back to Safari.
  const script = `
    set chromeTitle to ""
    set safariTitle to ""
    try
      tell application "Google Chrome" to set chromeTitle to title of active tab of front window
    end try
    try
      tell application "Safari" to set safariTitle to name of front document
    end try
    if chromeTitle is not "" then
      return chromeTitle
    else
      return safariTitle
    end if
  `.trim();

  // Use execFile (not exec) — avoids shell spawning, consistent with all other
  // osascript calls in this file.
  execFileAsync("osascript", ["-e", script]).then(({ stdout }) => {
    const title = stdout.trim();
    if (!title) return;
    const fromTitle = extractNamesFromTitle(title);
    if (Object.keys(fromTitle).length === 0) return;
    // Merge — don't overwrite names already resolved from earlier transcript.
    listenSpeakerNames = { ...fromTitle, ...listenSpeakerNames };
    console.log("[listenNames] seeded from title:", fromTitle, "| title:", title.slice(0, 80));
  }).catch(() => {/* osascript unavailable or no browser open — skip */});
}

/** Start a diarization-enabled Deepgram session for listen mode (Live Notes). */
function startListenDeepgramSession(): void {
  const dgKey = process.env.DEEPGRAM_API_KEY?.trim();
  if (!dgKey) return; // no key → fall back to OpenAI STT chunks (no diarization)
  stopListenDeepgramSession();

  const makeListenCallbacks = () => ({
    onTranscript: ({ text, isFinal, speakerId }: { text: string; isFinal: boolean; speakerId?: number }) => {
      if (!isFinal) return; // interim not needed for listen-mode notes
      // Prefix with speaker tag so the AI pass and classifier can attribute notes.
      const speakerPrefix = speakerId != null ? `[S${speakerId}] ` : "";
      void processListenModeChunk(`${speakerPrefix}${text}`, ["system_audio"]);
    },
    onError: (err: Error) => {
      console.error("[deepgram:listen] error:", err.message);
    },
    onClose: () => {
      if (!shouldRunListenNotesPipeline()) return;
      listenDeepgramReconnectAttempts += 1;
      const delayMs = Math.min(
        LISTEN_DEEPGRAM_RECONNECT_BASE_MS * 2 ** (listenDeepgramReconnectAttempts - 1),
        LISTEN_DEEPGRAM_RECONNECT_MAX_MS,
      );
      console.warn(
        `[deepgram:listen] WS closed unexpectedly — reconnecting in ${Math.round(delayMs / 1000)}s…`,
      );
      setTimeout(() => {
        if (!shouldRunListenNotesPipeline()) return;
        startListenDeepgramSession();
      }, delayMs);
    },
  });

  listenDeepgramSession = new DeepgramStreamingSession(dgKey, "auto", makeListenCallbacks());

  const attemptListenDeepgramConnect = (attemptsLeft: number) => {
    listenDeepgramSession?.connect().then(() => {
      listenDeepgramReconnectAttempts = 0;
    }).catch((err: unknown) => {
      const msg = (err as Error).message ?? String(err);
      console.error(`[deepgram:listen] connect failed (${attemptsLeft} retries left):`, msg);
      if (attemptsLeft > 0 && shouldRunListenNotesPipeline()) {
        console.log("[deepgram:listen] retrying in 1.5s…");
        setTimeout(() => {
          if (!shouldRunListenNotesPipeline()) return;
          listenDeepgramSession = new DeepgramStreamingSession(dgKey, "auto", makeListenCallbacks());
          attemptListenDeepgramConnect(attemptsLeft - 1);
        }, 1_500);
      } else {
        listenDeepgramSession = null;
      }
    });
  };

  attemptListenDeepgramConnect(2);
  console.log("[deepgram:listen] session started (diarization enabled)");
}

/** Stop the listen-mode Deepgram session. */
function stopListenDeepgramSession(): void {
  if (listenDeepgramSession) {
    listenDeepgramSession.close();
    listenDeepgramSession = null;
    listenDeepgramReconnectAttempts = 0;
    console.log("[deepgram:listen] session closed");
  }
}

function notifyCompanionDeepgramUnavailable(reason: string): void {
  console.warn(`[deepgram:companion] unavailable — ${reason}`);
  stopCompanionDeepgramSession();
  broadcast(IPC.companionDeepgramUnavailable, {});
}

/** Start a diarization-enabled Deepgram session for companion mic. */
function startCompanionDeepgramSession(): void {
  const dgKey = process.env.DEEPGRAM_API_KEY?.trim();
  if (!dgKey || !state.companionModeActive) return;
  stopCompanionDeepgramSession();

  const makeCompanionCallbacks = () => ({
    onTranscript: ({
      text,
      isFinal,
      speakerId,
    }: {
      text: string;
      isFinal: boolean;
      speakerId?: number;
    }) => {
      if (!isFinal || !text.trim()) return;
      companionDeepgramReconnectAttempts = 0;
      broadcast(IPC.companionDeepgramFinal, { text: text.trim(), speakerId });
    },
    onError: (err: Error) => {
      console.error("[deepgram:companion] error:", err.message);
    },
    onClose: () => {
      if (!state.companionModeActive) return;
      companionDeepgramReconnectAttempts += 1;
      if (companionDeepgramReconnectAttempts > COMPANION_DEEPGRAM_MAX_RECONNECT_ATTEMPTS) {
        notifyCompanionDeepgramUnavailable("max reconnect attempts exceeded");
        return;
      }
      const delayMs = Math.min(
        LISTEN_DEEPGRAM_RECONNECT_BASE_MS * 2 ** (companionDeepgramReconnectAttempts - 1),
        LISTEN_DEEPGRAM_RECONNECT_MAX_MS,
      );
      setTimeout(() => {
        if (!state.companionModeActive) return;
        startCompanionDeepgramSession();
      }, delayMs);
    },
  });

  companionDeepgramSession = new DeepgramStreamingSession(dgKey, "auto", makeCompanionCallbacks());
  companionDeepgramSession.connect().catch((err: unknown) => {
    console.error("[deepgram:companion] connect failed:", (err as Error).message ?? err);
    notifyCompanionDeepgramUnavailable("initial connect failed");
  });
  console.log("[deepgram:companion] session started (diarization enabled)");
}

/** Stop the companion Deepgram session. */
function stopCompanionDeepgramSession(): void {
  if (companionDeepgramSession) {
    companionDeepgramSession.close();
    companionDeepgramSession = null;
    companionDeepgramReconnectAttempts = 0;
    console.log("[deepgram:companion] session closed");
  }
}
let listenLastChunkMs: number | undefined;
let listenRollingTranscript: ListenRollingTranscriptState = initialListenRollingTranscript();

/** Extract & Build Mode — system-audio transcript + capture ownership. */
let extractBuildModeActive = false;
let extractModeStartedCapture = false;
let extractRollingTranscript = "";
/** Speaker names resolved from transcript patterns — e.g. { "0": "Lex", "1": "Sam Altman" }. */
let listenSpeakerNames: Record<string, string> = {};

function syncExtractTranscriptToOverlay(text: string): void {
  const overlay = getWindows()?.overlay;
  if (overlay && !overlay.isDestroyed()) {
    overlay.webContents.send(IPC.extractModeTranscript, text);
  }
}

function feedExtractModeTranscriptChunk(chunk: string): void {
  if (!extractBuildModeActive || !chunk.trim()) return;
  const next = appendTranscriptDeduped(extractRollingTranscript, chunk.trim());
  if (next === extractRollingTranscript) return;
  extractRollingTranscript = next;
  syncExtractTranscriptToOverlay(extractRollingTranscript);
}

function startExtractBuildCapture(): void {
  extractBuildModeActive = true;
  extractRollingTranscript = "";
  extractModeStartedCapture = !state.privacy.listening;
  if (state.transcriptionMode !== "system_audio") {
    state.transcriptionMode = "system_audio";
  }
  if (!state.privacy.listening) {
    dispatchPrivacy({ type: "START_LISTENING", at: new Date().toISOString() });
    state.stt = { ...state.stt, listeningElapsedMs: 0, lastError: undefined };
    broadcastTranscriptionControl({ type: "start" });
  }
  syncExtractTranscriptToOverlay("");
  push();
}

function stopExtractBuildCapture(): void {
  extractBuildModeActive = false;
  if (extractModeStartedCapture && state.privacy.listening) {
    broadcastTranscriptionControl({ type: "stop" });
    dispatchPrivacy({ type: "PAUSE", at: new Date().toISOString() });
    state.stt = { ...state.stt, listeningElapsedMs: 0 };
  }
  extractModeStartedCapture = false;
  push();
}

function listenCheckpointsForSession(): import("../shared/listenCheckpoint.ts").ListenCheckpointSummary[] {
  const session = sessions.current();
  if (!session) return [];
  const all = listenCheckpointsFromSessionEvents(session.events);
  const listenStartedMs = listenMomentRuntime.listenStartedMs;
  if (!listenStartedMs) return all;
  return all.filter((cp) => {
    const writtenMs = Date.parse(cp.writtenAt);
    return (
      cp.windowEndMs >= listenStartedMs ||
      (!Number.isNaN(writtenMs) && writtenMs >= listenStartedMs)
    );
  });
}

function buildCurrentListenLiveNotes() {
  const session = sessions.current();
  const chunks = session ? listenTranscriptChunksFromEvents(session.events) : [];
  const checkpoints = listenCheckpointsForSession();
  const warmupCtx = {
    attentionLevel: copilot.getConfig().listenAttentionLevel,
    nowMs: Date.now(),
    recentTranscriptChars: 0,
    recentSurfacedTexts: [],
    userReceivingAnswer: false,
    muteSuggestions: copilot.getConfig().muteSuggestions,
    surfacesInLast10Min: 0,
    listenStartedMs: listenMomentRuntime.listenStartedMs,
    listenWarmupMs: copilot.getConfig().listenWarmupMs,
  };
  const building =
    isListenModeActive() &&
    state.privacy.listening &&
    isListenWarmupActive(warmupCtx);
  return buildListenLiveNotes({
    moments: listenMomentRuntime.moments,
    transcriptChunks: chunks,
    rollingTranscript: listenRollingTranscript.rollingText,
    listenStartedMs: listenMomentRuntime.listenStartedMs,
    nowMs: Date.now(),
    lastRefreshMs: listenMomentRuntime.lastLiveNotesRefreshMs,
    checkpoints,
    listeningStatus: building ? "building" : state.privacy.listening ? "listening" : "idle",
    duplicateFragmentCount: listenRollingTranscript.duplicateFragmentCount,
    aiNotes: listenAiNotes,
    lastAiRefreshMs: lastAiNotesRefreshMs,
  });
}

async function refreshStreamingListenNotes(nowMs: number, force = false): Promise<void> {
  if (!isListenModeActive()) return;

  // ── Proactive media context re-capture ──────────────────────────────────────
  // If the live session still has no media title, retry every 30 s.
  // Handles the common case: user starts listen mode before switching to the browser tab.
  if (!state.mediaContext?.title && nowMs - lastProactiveMediaCaptureMs > 30_000) {
    lastProactiveMediaCaptureMs = nowMs;
    void proactivelyCaptureMediaContext().catch(() => {});
  }
  // ────────────────────────────────────────────────────────────────────────────

  const last = listenMomentRuntime.lastLiveNotesRefreshMs;
  const rolling = rollingTranscriptWindow(listenRollingTranscript);
  const prevLen = listenMomentRuntime.lastEvalTranscriptLen ?? 0;
  const deltaLen = Math.max(0, rolling.length - prevLen);
  const intervalMs = computeLiveNotesRefreshInterval(deltaLen);
  if (!force && !shouldRefreshStreamingLiveNotes(last, nowMs, intervalMs)) {
    return;
  }

  const delta = rolling.length > prevLen ? rolling.slice(prevLen) : rolling.slice(-Math.min(200, rolling.length));

  if (delta.trim().length >= 12) {
    const config = copilot.getConfig();
    const media = state.mediaContext;
    const segment = classifyListenSegment({
      transcript: delta,
      visibleText: media?.visibleTextSummary,
      mediaTitle: media?.title,
      mediaChannel: media?.channelOrSource,
    });

    listenMomentRuntime.moments = evaluateListenMoments({
      newText: delta,
      recentTranscript: rolling.slice(0, Math.max(0, rolling.length - delta.length)),
      existingMoments: listenMomentRuntime.moments,
      nowMs,
      idFactory: () => `lm-${nowMs}-${Math.random().toString(36).slice(2, 8)}`,
      segmentKind: segment.kind,
      mediaContext: media,
    });
    listenMomentRuntime.lastEvalTranscriptLen = rolling.length;
  }

  listenMomentRuntime.lastLiveNotesRefreshMs = nowMs;

  // ── AI-quality note refresh (GPT-5.5 background pass) ──────────────────────
  // Fire-and-forget: never blocks the local refresh loop.
  // Gate: 35s since last AI refresh AND ≥300 new chars since last AI trigger.
  // FIX 3: also gate out when the most-recent segment was an ad or sponsor —
  // ad audio doesn't enter the rolling transcript (Fix 1) but the timer might
  // still fire; we skip the AI pass so we don't trigger a refresh on stale
  // content during an ad break and produce misleading "notes" from the boundary.
  const aiRefreshDue =
    isListenModeActive() &&
    nowMs - (lastAiNotesRefreshMs ?? 0) >= LIVE_NOTES_AI_REFRESH_MS &&
    rolling.length - lastAiTranscriptLen >= LIVE_NOTES_AI_MIN_DELTA_CHARS &&
    listenMomentRuntime.lastSegmentKind !== "ad" &&
    listenMomentRuntime.lastSegmentKind !== "sponsor";

  if (aiRefreshDue) {
    lastAiTranscriptLen = rolling.length;
    const currentTopicHint = state.listenLiveNotes?.currentTopic ?? rolling.slice(-120).trim();
    void refreshListenNotesWithAI(config, rolling, currentTopicHint, listenSpeakerNames).then((result) => {
      if (!isListenModeActive()) return; // user stopped listening while AI was thinking
      if (result.notes.length > 0) {
        listenAiNotes = mergeListenAiNotes(listenAiNotes, result.notes);
        lastAiNotesRefreshMs = Date.now();
        console.log(
          `[listenAiNotes] refreshed: ${result.notes.length} new notes (${listenAiNotes.length} total, model: ${result.model ?? "unknown"})`,
        );
        push(); // re-render with AI notes now in sections
      } else {
        // Log zero-note result to help diagnose why GPT-5.5 isn't producing notes.
        console.warn(
          `[listenAiNotes] AI pass returned 0 notes (model: ${result.model ?? "none"}, transcript len: ${rolling.length})`,
        );
      }
    });
  }
  // ───────────────────────────────────────────────────────────────────────────

  push();
}

function buildActiveListeningAskContext(userPrompt?: string) {
  const session = sessions.current();
  const config = copilot.getConfig();
  const activeMode = deriveActiveListeningMode(config, sessionIsLive() && copilotModeIsActive(config.mode));
  const screenshotMeta = state.latestScreenshot
    ? {
        capturedAt: state.latestScreenshot.capturedAt,
        sourceTitle: state.latestScreenshot.sourceTitle,
        label: state.latestScreenshot.displayLabel,
        screenshotPath: state.latestScreenshot.screenshotPath,
      }
    : undefined;
  return buildCurrentMomentContext({
    session: session ?? null,
    sessionLive: sessionIsLive(),
    runningTranscript: state.transcript,
    copilotConfig: config,
    activeMode,
    recentQuestions: copilotRecentCommands,
    lastAnswer: state.lastAskResponse?.fullAnswer ?? state.lastAskResponse?.answer,
    screenshotMeta,
    userPrompt,
    mediaContext: state.mediaContext,
    listenMoments: listenMomentRuntime.moments,
    activeMomentId: listenMomentRuntime.activeMomentId,
    lastSystemAudioChunkMs: listenLastChunkMs,
  });
}

/** Capture media/page context from window title, browser URL, and optional screen text. */
async function captureMediaContext(): Promise<void> {
  await refreshWindowContext();
  const ctx = getCachedWindowContext();
  const browserUrl = await getActiveBrowserUrl(ctx.appName);
  let visibleTextSummary: string | undefined;

  if (state.screenCaptureProbe === "ready") {
    try {
      const captureTarget = resolveCaptureDisplay(state.glassSettings.displayTarget);
      const shot = await captureDisplayById(captureTarget.id, captureTarget.label);
      const optimized = optimizeVisualAskImage(
        shot.imageDataUrl,
        { width: shot.width, height: shot.height },
        { prompt: MEDIA_CONTEXT_VISION_PROMPT, preset: "general" },
      );
      const response = await askIivoGlass(config, {
        prompt: MEDIA_CONTEXT_VISION_PROMPT,
        visualIntent: true,
        latestScreenshot: {
          imageDataUrl: optimized.imageDataUrl,
          label: captureTarget.label,
          capturedAt: new Date().toISOString(),
        },
      });
      visibleTextSummary = response.answer?.trim().slice(0, 2000);
    } catch {
      /* vision read optional — title/URL still used */
    }
  }

  const media =
    extractMediaContext({
      appName: ctx.appName,
      windowTitle: ctx.windowTitle,
      browserUrl,
      visibleTextSummary,
    }) ?? null;

  state.mediaContext = media;

  if (sessionIsLive() && sessions.current()?.status === "active" && media) {
    sessions.addEvent({
      kind: "app_context",
      title: media.title ?? "Media context captured",
      text: [
        media.sourceType,
        media.channelOrSource,
        media.url,
        media.durationLabel,
      ]
        .filter(Boolean)
        .join(" · "),
      ...eventContextFields(),
      metadata: { mediaContext: media },
    });
    await persistSessions(sessions);
  }

  if (media?.title) {
    state.lastNotice = `Media context: ${media.title.slice(0, 80)}${media.title.length > 80 ? "…" : ""}`;
  } else if (!media) {
    state.lastNotice = "Media context not detected — ensure the video tab is frontmost.";
  }
  push();
}

/**
 * Lightweight background media context capture for proactive retries — title/URL only, no vision AI.
 * Only updates state when a title is successfully found so it never clobbers an existing context.
 * Silently no-ops if the frontmost window isn't a recognisable media source.
 */
async function proactivelyCaptureMediaContext(): Promise<void> {
  if (!sessionIsLive()) return;
  await refreshWindowContext();
  const ctx = getCachedWindowContext();
  const browserUrl = await getActiveBrowserUrl(ctx.appName);
  const media =
    extractMediaContext({ appName: ctx.appName, windowTitle: ctx.windowTitle, browserUrl }) ?? null;
  if (!media?.title) return; // nothing useful — leave existing context untouched
  state.mediaContext = media;
  if (sessions.current()?.status === "active") {
    sessions.addEvent({
      kind: "app_context",
      title: media.title,
      text: [media.sourceType, media.channelOrSource, media.url, media.durationLabel]
        .filter(Boolean)
        .join(" · "),
      ...eventContextFields(),
      metadata: { mediaContext: media },
    });
    await persistSessions(sessions);
  }
  const displayTitle = media.title.slice(0, 80) + (media.title.length > 80 ? "…" : "");
  state.lastNotice = `Media context: ${displayTitle}`;
  push();
}

function maybeShowActiveListeningProactive(newText: string, tags?: string[]): void {
  const config = copilot.getConfig();
  const activeMode = deriveActiveListeningMode(config, sessionIsLive() && copilotModeIsActive(config.mode));
  if (activeMode === "listen") {
    void processListenModeChunk(newText, tags);
    return;
  }
  if (activeMode !== "meetings") return;
  // Lazily start the Meeting Intelligence extraction loop the first time a
  // meetings-mode transcript chunk arrives.
  if (!meetingIntelTimer) startMeetingIntelLoop();
  const moment = pickActiveListeningProactiveMoment({
    newTranscript: newText,
    recentCommands: copilotRecentCommands,
    copilotConfig: config,
    nowMs: Date.now(),
    lastProactiveMs: activeListeningRuntime.lastProactiveMs,
    recentShownTexts: activeListeningRuntime.recentProactiveTexts,
  });
  if (!moment) return;
  if (!proactiveShouldShowCard(config)) {
    state.lastNotice = `Active Listening noted: ${moment.title}`;
    return;
  }
  const intervention = buildActiveListeningProactiveIntervention(moment, {
    idFactory: () => `al-${Date.now()}`,
    clock: () => new Date().toISOString(),
  });
  activeListeningRuntime.lastProactiveMs = Date.now();
  activeListeningRuntime.recentProactiveTexts.push(moment.excerpt);
  if (activeListeningRuntime.recentProactiveTexts.length > 12) {
    activeListeningRuntime.recentProactiveTexts.shift();
  }
  pushFeed(createCommandFeedItem("response", intervention.body, { title: `Active Listening · ${intervention.title}` }));
  push();
}

function isListenModeActive(): boolean {
  const config = copilot.getConfig();
  return (
    deriveActiveListeningMode(config, sessionIsLive() && copilotModeIsActive(config.mode)) ===
    "listen"
  );
}

function shouldRunListenNotesPipeline(): boolean {
  const config = copilot.getConfig();
  return config.sessionType === "video_learning" && copilotModeIsActive(config.mode);
}

/** Show the floating notes pad as soon as Listen mode is active — not only after audio starts. */
function syncListenNotesPadVisibility(): void {
  if (shouldRunListenNotesPipeline() && sessionIsLive()) {
    setListenNotesPadVisible(true);
  }
}

function ensureListenSession(): void {
  if (sessionIsLive()) return;
  sessions.startSession("Listen");
  bindCopilotToSession();
  startCopilotLoop();
}

/** Start the notes refresh loop without clearing in-flight transcript (chunk safety net). */
function ensureListenNotesLoopRunning(): void {
  if (!shouldRunListenNotesPipeline() || listenNotesTimer) return;
  ensureListenSession();
  if (!listenMomentRuntime.listenStartedMs) {
    listenMomentRuntime = prepareListenModeSession(listenMomentRuntime, Date.now());
    listenRollingTranscript = initialListenRollingTranscript();
    listenMomentRuntime.lastLiveNotesRefreshMs = undefined;
    listenMomentRuntime.lastEvalTranscriptLen = 0;
  }
  copilot.clearPendingInterventions();
  clearListenCardState();
  startListenNotesLoop();
  setListenNotesPadVisible(true);
  startListenDeepgramSession();
  seedSpeakerNamesFromBrowserTitle();
  // Proactive media context capture for this (re)started pipeline slice.
  if (!state.mediaContext?.title) {
    lastProactiveMediaCaptureMs = 0;
    setTimeout(() => { void proactivelyCaptureMediaContext().catch(() => {}); }, 2_000);
  }
}

/** Fresh listen capture — reset runtime and start the notes loop. */
function bootstrapListenNotesPipeline(): void {
  if (!shouldRunListenNotesPipeline()) return;
  ensureListenSession();
  listenMomentRuntime = prepareListenModeSession(listenMomentRuntime, Date.now());
  listenRollingTranscript = initialListenRollingTranscript();
  listenMomentRuntime.lastLiveNotesRefreshMs = undefined;
  listenMomentRuntime.lastEvalTranscriptLen = 0;
  copilot.clearPendingInterventions();
  clearListenCardState();
  startListenNotesLoop();
  setListenNotesPadVisible(true);
  startListenDeepgramSession();
  seedSpeakerNamesFromBrowserTitle();
  // Auto-capture media context shortly after session boot so the debrief has title/platform
  // even when the user didn't manually trigger it. Retry cadence is handled in the notes loop.
  lastProactiveMediaCaptureMs = 0;
  setTimeout(() => { void proactivelyCaptureMediaContext().catch(() => {}); }, 2_000);
}

function isTranslateActive(): boolean {
  return liveTranslateRuntime.active && liveTranslateRuntime.config.enabled;
}

function armTranslateGracePeriod(nowMs = Date.now()): void {
  translateGraceUntilMs = nowMs + TRANSLATE_SILENCE_GRACE_MS;
}

function clearTranslateGracePeriod(): void {
  translateGraceUntilMs = 0;
}

function shouldSuppressTranslateStartupErrors(error?: string): boolean {
  return shouldSuppressTranslateStartupError({
    runtime: liveTranslateRuntime,
    error,
    systemAudioLastSignalMs,
    graceUntilMs: translateGraceUntilMs,
  });
}

function clearTranslateStartupErrors(): void {
  state.lastError = undefined;
  state.stt = { ...state.stt, lastError: undefined };
  if (liveTranslateRuntime.lastError) {
    liveTranslateRuntime = { ...liveTranslateRuntime, lastError: undefined, status: "starting" };
  }
}

/** Stop translate capture: renderer STT, HUD timer, and in-flight chunk reporting. */
function stopTranslateListening(): void {
  cancelListenCountdown();
  // Keep system audio alive if the listen notes pipeline is running — it still needs
  // audio for diarization and note extraction. Only stop audio for pure translate sessions.
  if (shouldRunListenNotesPipeline()) return;
  broadcastTranscriptionControl({ type: "stop" });
  if (!state.privacy.listening) {
    state.stt = { ...state.stt, transcribing: false, lastError: undefined };
    return;
  }
  dispatchPrivacy({ type: "PAUSE", at: new Date().toISOString() });
  state.stt = {
    ...state.stt,
    listeningElapsedMs: 0,
    transcribing: false,
    lastError: undefined,
  };
  resetListeningLimitTracking();
  state.operationDiagnostics = recordOperation(state.operationDiagnostics, "pause", "ok");
}

function shouldSaveTranscriptToSession(): boolean {
  if (isTranslateActive() && !shouldPersistTranslateChunk(liveTranslateRuntime.config)) {
    return isListenModeActive();
  }
  return true;
}

async function ingestTranslateChunk(
  text: string,
  opts?: { interim?: boolean; tags?: string[]; sentenceId?: string },
): Promise<void> {
  if (!isTranslateActive()) return;
  const chunkId = opts?.interim ? `tr-interim-${Date.now()}` : `tr-${Date.now()}`;
  if (!opts?.interim) {
    liveTranslateRuntime = {
      ...liveTranslateRuntime,
      status: "active",
      captions: applyCaptionChunk(liveTranslateRuntime.captions, {
        original: text,
        translated: text,
        interim: true,
        id: chunkId,
      }),
    };
    push();
  }
  if (process.env.IIVO_GLASS_E2E === "1") {
    liveTranslateRuntime = {
      ...liveTranslateRuntime,
      status: "active",
      captions: applyCaptionChunk(liveTranslateRuntime.captions, {
        original: text,
        translated: text,
        interim: opts?.interim === true,
        id: `e2e-${Date.now()}`,
      }),
    };
    push();
    return;
  }
  const appContext =
    state.mediaContext?.title ?? state.mediaContext?.channelOrSource ?? undefined;
  const result = await processTranslateTranscriptChunk(
    {
      text,
      interim: opts?.interim,
      chunkId,
      tags: opts?.tags,
      appContext: appContext ?? undefined,
      sentenceId: opts?.sentenceId,
    },
    { config, runtime: liveTranslateRuntime, shouldSuppressErrors: () => shouldSuppressTranslateStartupErrors() },
  );
  liveTranslateRuntime = result.runtime;
  if (
    !opts?.interim &&
    result.translated &&
    sessionIsLive() &&
    sessions.current()?.status === "active" &&
    shouldPersistTranslateChunk(liveTranslateRuntime.config)
  ) {
    const translateMeta = translateEventMetadata(liveTranslateRuntime, result.original, result.translated);
    if (translateMeta) {
      const ctxFields = eventContextFields();
      sessions.addEvent({
        kind: "transcript_note",
        title: result.original.length > 70 ? `${result.original.slice(0, 69)}…` : result.original,
        text: shouldPersistTranslationOnly(liveTranslateRuntime.config)
          ? result.translated
          : result.original,
        tags: [...(opts?.tags ?? []), "live_translate"],
        ...ctxFields,
        metadata: { ...(ctxFields.metadata ?? {}), ...translateMeta },
      });
      await pruneCurrentSessionEvents();
      await persistSessions(sessions);
    }
  }
  push();
}

function hasVisibleListenCard(): boolean {
  return hasActiveListenCard(listenMomentRuntime, state.commandFeed);
}

function clearListenCardState(): void {
  listenMomentRuntime.activeCardId = undefined;
  listenMomentRuntime.activeMomentId = undefined;
  listenMomentRuntime.queuedMomentIds = [];
}

function upsertListenInsightCard(moment: ListenMoment, surfaceDecision: ListenCardSurfaceDecision): void {
  const feed = listenThoughtFeedBodies(moment, state.mediaContext);
  if (surfaceDecision === "update_existing" && listenMomentRuntime.activeCardId) {
    state.commandFeed = state.commandFeed.map((item) =>
      item.id === listenMomentRuntime.activeCardId
        ? {
            ...item,
            title: feed.title,
            body: feed.body,
            fullBody: feed.fullBody,
            listenMomentId: moment.id,
          }
        : item,
    );
    listenMomentRuntime.activeMomentId = moment.id;
    return;
  }

  const item = createCommandFeedItem("response", feed.body, {
    title: feed.title,
    fullBody: feed.fullBody,
    listenMomentId: moment.id,
  });
  listenMomentRuntime.activeCardId = item.id;
  listenMomentRuntime.activeMomentId = moment.id;
  pushFeed(item);
}

async function pruneCurrentSessionEvents(): Promise<void> {
  const session = sessions.current();
  if (!session) return;
  session.events = pruneTranscriptSessionEvents(session.events);
}

async function maybeWriteListenCheckpoint(nowMs: number): Promise<void> {
  if (!listenMomentRuntime.listenStartedMs) return;
  const checkpointMinutes = STREAMING_LISTEN_CHECKPOINT_MINUTES;
  const cp = shouldWriteListenCheckpoint({
    listenStartedMs: listenMomentRuntime.listenStartedMs,
    nowMs,
    lastCheckpointIndex: listenMomentRuntime.lastCheckpointIndex ?? 0,
    checkpointMinutes,
  });
  if (!cp.write) return;
  listenMomentRuntime.lastCheckpointIndex = cp.checkpointIndex;
  const summary = buildListenCheckpointSummary({
    checkpointIndex: cp.checkpointIndex,
    listenStartedMs: listenMomentRuntime.listenStartedMs,
    nowMs,
    moments: listenMomentRuntime.moments,
    checkpointMinutes,
  });
  if (!sessionIsLive()) return;
  sessions.addEvent({
    kind: "manual_note",
    title: `Listen checkpoint ${cp.checkpointIndex}`,
    text: summary.bestIdeas[0] ?? "Checkpoint saved.",
    tags: ["listen_checkpoint"],
    ...eventContextFields(),
    metadata: { listenCheckpoint: summary },
  });
  await pruneCurrentSessionEvents();
  await persistSessions(sessions);
}

async function persistListenMomentEvent(moment: ListenMoment): Promise<void> {
  if (!sessionIsLive()) return;
  sessions.addEvent({
    kind: "saved_moment",
    title: moment.summary.slice(0, 80),
    text: moment.suggestedThought ?? moment.summary,
    tags: ["listen_moment", moment.type, moment.status],
    importance: moment.importance,
    ...eventContextFields(),
    metadata: { listenMoment: moment },
  });
  await pruneCurrentSessionEvents();
  await persistSessions(sessions);
}

async function processListenModeChunk(
  newText: string,
  tags?: string[],
  opts?: { interim?: boolean },
): Promise<void> {
  if (!tags?.includes("system_audio")) return;
  const config = copilot.getConfig();
  if (config.mode === "off") return;

  if (state.privacy.listening) {
    ensureListenNotesLoopRunning();
  }

  const nowMs = Date.now();
  listenLastChunkMs = nowMs;
  if (!listenMomentRuntime.listenStartedMs) {
    listenMomentRuntime.listenStartedMs = nowMs;
  }

  // ── FIX 1: classify segment BEFORE appending to rolling transcript ──────────
  // Ad / sponsor audio must never enter the rolling transcript — otherwise it
  // reaches extractStreamingNoteCandidates and the GPT-5.5 prompt window.
  // We classify with the incoming text + screen context before any append.
  const media = state.mediaContext;
  const segment = classifyListenSegment({
    transcript: newText,
    visibleText: media?.visibleTextSummary,
    mediaTitle: media?.title,
    mediaChannel: media?.channelOrSource,
  });
  listenMomentRuntime.lastSegmentKind = segment.kind;
  listenMomentRuntime.segmentCounts = {
    ...listenMomentRuntime.segmentCounts,
    [segment.kind]: (listenMomentRuntime.segmentCounts?.[segment.kind] ?? 0) + 1,
  };

  const isNonContentSegment = segment.kind === "ad" || segment.kind === "sponsor";

  // Only append content audio to the rolling transcript — ads and sponsor reads
  // are excluded so they can never surface as streaming notes or feed the AI pass.
  if (!isNonContentSegment) {
    listenRollingTranscript = applyListenTranscriptFragment(listenRollingTranscript, {
      text: newText,
      isInterim: opts?.interim ?? false,
      nowMs,
      idFactory: () => `lf-${nowMs}-${Math.random().toString(36).slice(2, 8)}`,
    });
    // Incrementally resolve speaker names from the transcript (free — no API call).
    // Only runs when there are [Sx] tags or the transcript is long enough to contain intros.
    if (newText.includes("[S") || listenRollingTranscript.rollingText.length > 120) {
      listenSpeakerNames = extractSpeakerNames(listenRollingTranscript.rollingText, listenSpeakerNames);
    }
  }
  // ─────────────────────────────────────────────────────────────────────────────

  if (opts?.interim) {
    await refreshStreamingListenNotes(nowMs, true);
    push();
    return;
  }

  const rolling = rollingTranscriptWindow(listenRollingTranscript);
  const ctx = buildActiveListeningAskContext();
  const recentTranscript = rolling || (ctx?.recentTranscriptWindow ?? "");

  // ── FIX 2: skip moment detection entirely during ads / sponsor reads ─────────
  // evaluateListenMoments still runs for lifecycle updates (staleness, maturity)
  // but detectCandidates is gated inside evaluateListenMoments via segmentKind.
  // Passing isNonContentSegment lets the function skip new-candidate detection
  // while still aging out old moments correctly.
  listenMomentRuntime.moments = evaluateListenMoments({
    newText: isNonContentSegment ? "" : newText,   // empty text = no new candidates
    recentTranscript,
    existingMoments: listenMomentRuntime.moments,
    nowMs,
    idFactory: () => `lm-${nowMs}-${Math.random().toString(36).slice(2, 8)}`,
    segmentKind: segment.kind,
    mediaContext: state.mediaContext,
  });
  // ─────────────────────────────────────────────────────────────────────────────

  const surfaceContext = {
    attentionLevel: config.listenAttentionLevel,
    nowMs,
    lastSurfaceMs: listenMomentRuntime.lastSurfaceMs,
    lastChunkMs: listenLastChunkMs,
    recentTranscriptChars: recentTranscript.length,
    recentSurfacedTexts: listenMomentRuntime.recentSurfacedTexts,
    userReceivingAnswer: state.askStatus === "pending" || state.askStatus === "streaming",
    muteSuggestions: config.muteSuggestions,
    surfacesInLast10Min: countSurfacesInLast10Min(listenMomentRuntime.surfaceTimestamps, nowMs),
    listenStartedMs: listenMomentRuntime.listenStartedMs,
    listenWarmupMs: config.listenWarmupMs,
    segmentSuppressProactive: segment.suppressProactive,
    segmentKind: segment.kind,
    liveThoughtsEnabled: config.showOverlaySuggestions && !config.muteSuggestions,
  };

  if (isListenWarmupActive(surfaceContext)) {
    state.lastNotice = "Listening… building context";
  }

  await maybeWriteListenCheckpoint(nowMs);

  const candidate = pickBestListenMomentForSurface(listenMomentRuntime.moments);
  if (!candidate) {
    listenMomentRuntime.silenceReasons.push("No ready moment detected.");
    if (listenMomentRuntime.silenceReasons.length > 30) listenMomentRuntime.silenceReasons.shift();
    await refreshStreamingListenNotes(nowMs);
    push();
    return;
  }

  const decision = shouldSurfaceListenMoment(candidate, surfaceContext);

  listenMomentRuntime.silenceReasons.push(`${decision.decision}: ${decision.reason}`);
  if (listenMomentRuntime.silenceReasons.length > 40) listenMomentRuntime.silenceReasons.shift();

  if (decision.decision === "mark_stale") {
    listenMomentRuntime.moments = markListenMomentStatus(listenMomentRuntime.moments, candidate.id, "stale");
    return;
  }

  if (decision.decision === "save_silently") {
    const updated = {
      ...candidate,
      status: "saved_silently" as const,
      disposition: "saved_silently" as const,
    };
    listenMomentRuntime.moments = markListenMomentStatus(listenMomentRuntime.moments, candidate.id, "saved_silently", updated);
    await persistListenMomentEvent(updated);
    await refreshStreamingListenNotes(nowMs);
    push();
    return;
  }

  if (decision.decision === "surface_now") {
    // Defense in depth: only Active attention may show overlay thought cards.
    if (config.listenAttentionLevel !== "active") {
      const silent = {
        ...candidate,
        status: "saved_silently" as const,
        disposition: "saved_silently" as const,
      };
      listenMomentRuntime.moments = markListenMomentStatus(
        listenMomentRuntime.moments,
        candidate.id,
        "saved_silently",
        silent,
      );
      await persistListenMomentEvent(silent);
      await refreshStreamingListenNotes(nowMs);
      push();
      return;
    }

    const thought = candidate.suggestedThought ?? candidate.summary;
    const updated = {
      ...candidate,
      status: "surfaced" as const,
      disposition: "surfaced" as const,
      surfacedAt: new Date(nowMs).toISOString(),
    };

    const activeMoment = listenMomentRuntime.moments.find(
      (m) => m.id === listenMomentRuntime.activeMomentId,
    );
    const cardDecision = decideListenCardSurface({
      runtime: listenMomentRuntime,
      moment: updated,
      hasVisibleListenCard: hasVisibleListenCard(),
      activeMoment,
    });

    if (cardDecision === "save_silently" || cardDecision === "queue_silent") {
      const silent = { ...updated, status: "saved_silently" as const, disposition: "saved_silently" as const };
      listenMomentRuntime.moments = markListenMomentStatus(
        listenMomentRuntime.moments,
        candidate.id,
        "saved_silently",
        silent,
      );
      listenMomentRuntime.queuedMomentIds = [...listenMomentRuntime.queuedMomentIds, candidate.id].slice(-20);
      await persistListenMomentEvent(silent);
      await refreshStreamingListenNotes(nowMs);
      push();
      return;
    }

    listenMomentRuntime.moments = markListenMomentStatus(listenMomentRuntime.moments, candidate.id, "surfaced", updated);
    listenMomentRuntime.lastSurfaceMs = nowMs;
    listenMomentRuntime.surfaceTimestamps.push(nowMs);
    listenMomentRuntime.recentSurfacedTexts.push(thought);
    if (listenMomentRuntime.recentSurfacedTexts.length > 12) listenMomentRuntime.recentSurfacedTexts.shift();

    await persistListenMomentEvent(updated);

    if (config.showOverlaySuggestions && !config.muteSuggestions) {
      upsertListenInsightCard(updated, cardDecision);
    } else {
      state.lastNotice = `IIVO thought saved: ${thought.slice(0, 80)}…`;
    }
  }

  await refreshStreamingListenNotes(nowMs);
  push();
}

// --- Max listening duration --------------------------------------------------
let listeningLimitState: ListeningLimitState = createListeningLimitState();
let listeningLimitAutoStopTimer: ReturnType<typeof setTimeout> | null = null;

function clearListeningLimitAutoStopTimer(): void {
  if (listeningLimitAutoStopTimer) {
    clearTimeout(listeningLimitAutoStopTimer);
    listeningLimitAutoStopTimer = null;
  }
}

function resetListeningLimitTracking(): void {
  listeningLimitState = resetListeningLimitState();
  clearListeningLimitAutoStopTimer();
}

function scheduleListeningLimitAutoStop(): void {
  clearListeningLimitAutoStopTimer();
  listeningLimitAutoStopTimer = setTimeout(() => {
    if (
      shouldAutoStopListeningLimit(listeningLimitState, Date.now()) &&
      state.privacy.listening
    ) {
      void stopListeningFromLimit("auto");
    }
  }, LISTENING_LIMIT_RESPONSE_TIMEOUT_MS);
}

async function recordListeningLimitReachedEvent(): Promise<void> {
  if (!sessionIsLive()) return;
  const maxMin = copilot.getConfig().maxListeningMin;
  sessions.addEvent({
    kind: "listening_limit_reached",
    title: "Listening limit reached",
    text: `Max listening duration (${maxMin} min) reached.`,
    importance: "medium",
    ...eventContextFields(),
  });
  await persistSessions(sessions);
}

async function triggerListeningLimitReached(): Promise<void> {
  listeningLimitState = markListeningLimitReached(listeningLimitState, Date.now());
  await recordListeningLimitReachedEvent();
  scheduleListeningLimitAutoStop();
  push();
}

function checkListeningLimit(elapsedMs: number): void {
  const maxMin = copilot.getConfig().maxListeningMin;
  if (!isListeningLimitEnabled(maxMin)) return;
  if (!state.privacy.listening) return;
  // Guard against stale/inherited elapsed from a prior run.
  if (elapsedMs < 0 || elapsedMs > maxMin * 60_000 * 1.5) {
    state.stt = { ...state.stt, listeningElapsedMs: 0 };
    return;
  }
  if (
    shouldTriggerListeningLimit({
      elapsedMs,
      maxListeningMin: maxMin,
      extensionMs: listeningLimitState.extensionMs,
      limitReached: listeningLimitState.limitReached,
      listening: state.privacy.listening,
    })
  ) {
    void triggerListeningLimitReached();
  }
}

async function stopListeningFromLimit(reason: "user" | "auto"): Promise<void> {
  broadcastTranscriptionControl({ type: "stop" });
  dispatchPrivacy({ type: "PAUSE", at: new Date().toISOString() });
  state.stt = { ...state.stt, listeningElapsedMs: 0 };
  state.operationDiagnostics = recordOperation(state.operationDiagnostics, "pause", "ok");
  resetListeningLimitTracking();
  state.lastNotice =
    reason === "auto"
      ? "Listening stopped — limit reached with no response."
      : LISTENING_STOPPED_MESSAGE;
  push();
}

function systemAudioActive(): boolean {
  return state.privacy.listening && state.transcriptionMode === "system_audio";
}

function trackCopilotCommand(text: string): void {
  copilotRecentCommands.push(text);
  if (copilotRecentCommands.length > 12) copilotRecentCommands.shift();
}

function trackCopilotResponse(text: string): void {
  copilotRecentResponses.push(text);
  if (copilotRecentResponses.length > 12) copilotRecentResponses.shift();
}

/** Mirror live copilot state onto the current session for persistence. */
function syncCopilotToSession(): void {
  if (!sessions.current()) return;
  sessions.setCopilotData(copilot.sessionData());
}

function copilotRuntime(): GlassCopilotRuntimeState {
  const config = copilot.getConfig();
  const activeMode = deriveActiveListeningMode(
    config,
    sessionIsLive() && copilotModeIsActive(config.mode),
  );
  const nowMs = Date.now();
  const warmupCtx = {
    attentionLevel: config.listenAttentionLevel,
    nowMs,
    recentTranscriptChars: 0,
    recentSurfacedTexts: [],
    userReceivingAnswer: false,
    muteSuggestions: config.muteSuggestions,
    surfacesInLast10Min: 0,
    listenStartedMs: listenMomentRuntime.listenStartedMs,
    listenWarmupMs: config.listenWarmupMs,
  };
  const building =
    activeMode === "listen" &&
    state.privacy.listening &&
    isListenWarmupActive(warmupCtx);
  const runtime = copilot.runtimeState(sessionIsLive());
  const listenActive = activeMode === "listen" && state.privacy.listening;
  return {
    ...runtime,
    pendingInterventions: listenActive ? [] : runtime.pendingInterventions,
    listeningLimitReached: listeningLimitState.limitReached,
    listenBuildingContext: building,
    listenWarmupRemainingMs: building ? listenWarmupRemainingMs(warmupCtx) : 0,
  };
}

/** Bind copilot to the active session (resets per-session state, hydrates persisted data). */
function bindCopilotToSession(): void {
  const session = sessions.current();
  const id = session?.id ?? null;
  if (copilotBoundSessionId === id) return;
  copilotBoundSessionId = id;
  copilotOffered = false;
  copilotVisualAskFailures = 0;
  copilotRecentCommands.length = 0;
  copilotRecentResponses.length = 0;
  activeListeningRuntime = clearActiveListeningRuntime();
  listenMomentRuntime = clearListenModeRuntime();
  listenLastChunkMs = undefined;
  listenRollingTranscript = initialListenRollingTranscript();
  listenAiNotes = [];
  lastAiNotesRefreshMs = undefined;
  listenSpeakerNames = {};
  lastAiTranscriptLen = 0;
  stopListenNotesLoop();
  resetMeetingIntelRuntime();
  copilot.bindSession(id);
  if (session?.copilot) {
    copilot.hydrate(session.id, session.copilot);
  }
}

function startCopilotLoop(): void {
  if (copilotTimer) return;
  if (!sessionIsLive() || !copilotModeIsActive(copilot.getConfig().mode)) return;
  const intervalMs = copilot.getConfig().intervalSec * 1000;
  copilotTimer = setInterval(() => {
    void runCopilotTick().catch((err) => {
      Sentry.captureException(err, { tags: { source: "copilot-tick" } });
    });
  }, intervalMs);
}

function stopCopilotLoop(): void {
  if (copilotTimer) {
    clearInterval(copilotTimer);
    copilotTimer = null;
  }
}

let listenNotesTimer: ReturnType<typeof setInterval> | null = null;

function startListenNotesLoop(): void {
  if (listenNotesTimer) return;
  listenNotesTimer = setInterval(() => {
    void refreshStreamingListenNotes(Date.now());
  }, 5_000);
}

function stopListenNotesLoop(): void {
  if (listenNotesTimer) {
    clearInterval(listenNotesTimer);
    listenNotesTimer = null;
  }
}

// --- Meeting Intelligence loop -----------------------------------------------

function isMeetingsModeActive(): boolean {
  const config = copilot.getConfig();
  return (
    deriveActiveListeningMode(config, sessionIsLive() && copilotModeIsActive(config.mode)) ===
    "meetings"
  );
}

function startMeetingIntelLoop(): void {
  if (meetingIntelTimer) return;
  meetingIntelTimer = setInterval(() => {
    runMeetingIntelTick();
  }, MEETING_EXTRACTION_INTERVAL_MS);
}

function stopMeetingIntelLoop(): void {
  if (meetingIntelTimer) {
    clearInterval(meetingIntelTimer);
    meetingIntelTimer = null;
  }
}

function resetMeetingIntelRuntime(): void {
  stopMeetingIntelLoop();
  meetingIntelState = resetMeetingIntelligenceState();
  meetingIntelNoticedIds.clear();
  meetingExtractionInFlight = false;
}

/**
 * Append a correction entry to meeting-corrections.jsonl in userData.
 * Fire-and-forget — errors are silently swallowed so they never impact the UI.
 * Each line is a self-contained JSON record for offline analysis / future training.
 */
function logMeetingCorrection(
  action: "delete" | "add",
  moment: MeetingMoment,
): void {
  try {
    const entry = JSON.stringify({
      ts:           Date.now(),
      sessionId:    sessions.current()?.id ?? "unknown",
      action,
      momentType:   moment.type,
      content:      moment.content,
      owner:        moment.owner,
      deadline:     moment.deadline,
      manualOverride: moment.manualOverride ?? false,
    });
    const logPath = join(app.getPath("userData"), "meeting-corrections.jsonl");
    appendFile(logPath, entry + "\n", () => { /* fire-and-forget */ });
  } catch {
    /* never block */
  }
}

/**
 * Read recent output from the frontmost terminal window (read-only, no control).
 *
 * Strategy:
 *   - Terminal.app: uses its AppleScript dictionary
 *   - iTerm2: uses iTerm2's AppleScript dictionary
 *   - Others (Ghostty, Warp, Kitty, etc.): returns null — no dict support;
 *     future: extend with AX text area reading if needed
 *
 * Returns the last ~120 lines of output, or null if unavailable / not a terminal.
 * Errors are swallowed silently — terminal reading is best-effort.
 */
async function readFrontTerminalOutput(appName: string): Promise<string | null> {
  try {
    const lower = appName.toLowerCase().trim();
    let script: string;

    if (lower === "terminal") {
      script = `tell application "Terminal"
  if (count of windows) > 0 then
    get contents of selected tab of front window
  end if
end tell`;
    } else if (lower.startsWith("iterm")) {
      script = `tell application "iTerm2"
  tell current window
    tell current tab
      tell current session
        get text
      end tell
    end tell
  end tell
end tell`;
    } else {
      // App has no known scripting dictionary for content — skip silently
      return null;
    }

    const { stdout } = await execFileAsync("osascript", ["-e", script]);
    const raw = stdout.trim();
    if (!raw) return null;
    // Return only the last 120 lines to stay focused on recent output
    const lines = raw.split(/\r?\n/);
    return lines.slice(-120).join("\n");
  } catch {
    return null;
  }
}

/**
 * Start the terminal watching interval for an active Wingman session.
 * Polls every 10 seconds, reads frontmost terminal output if it's a terminal app,
 * parses for errors/failures/successes, and auto-adds events + session notes.
 */
function startTerminalWatching(): void {
  if (wingmanTerminalInterval !== null) return; // already running
  wingmanTerminalInterval = setInterval(() => {
    void (async () => {
      if (!wingmanState.session?.terminalWatching) return;
      const ctx = getCachedWindowContext();
      const appName = ctx.appName ?? "";
      const { isTerminalApp, parseTerminalOutput, detectTerminalLoop } =
        await import("../shared/terminalEvents.ts");
      if (!isTerminalApp(appName)) return;
      const output = await readFrontTerminalOutput(appName);
      if (!output) return;
      const session = wingmanState.session;
      if (!session) return;
      const newEvents = parseTerminalOutput(output, {
        source: appName,
        existingEvents: session.terminalEvents,
        dedupeWindowMs: 60_000,
      });
      if (newEvents.length === 0) return;
      // Auto-create a wingman note for each new event
      const autoNotes = newEvents.map((e) => ({
        id: `note-terminal-${e.id}`,
        timestamp: e.timestamp,
        content: e.label,
        source: "wingman" as const,
      }));
      const updatedEvents = [...session.terminalEvents, ...newEvents];
      const loopWarning = detectTerminalLoop(updatedEvents) || session.loopWarning;
      wingmanState = {
        ...wingmanState,
        session: {
          ...session,
          terminalEvents: updatedEvents,
          notes: [...session.notes, ...autoNotes],
          loopWarning,
        },
      };
      // Surface first new event as a notice — pick the most severe
      const errorEvent = newEvents.find(
        (e) => e.type === "build_error" || e.type === "test_failure" || e.type === "runtime_error",
      );
      const noticedEvent = errorEvent ?? newEvents[0];
      if (noticedEvent) {
        state.lastNotice = `Wingman: ${noticedEvent.label}`;
      }
      if (loopWarning && !session.loopWarning) {
        state.lastNotice = "⚠ Wingman: same error 3× — loop detected in terminal";
      }
      push();
    })();
  }, 10_000);
}

function stopTerminalWatching(): void {
  if (wingmanTerminalInterval !== null) {
    clearInterval(wingmanTerminalInterval);
    wingmanTerminalInterval = null;
  }
}

// ─── Live terminal widget — always-on overlay feed ───────────────────────────

/**
 * Parse raw terminal text into LiveTerminalLine[].
 * Detects shell prompts (command lines) and error indicators.
 */
function parseLiveTerminalLines(
  raw: string,
  appName: string,
): import("../shared/ipc.ts").LiveTerminalLine[] {
  const now = Date.now();
  const lines = raw.split("\n").filter((l) => l.trim().length > 0).slice(-LIVE_TERMINAL_MAX_LINES);
  return lines.map((text) => {
    // Detect shell prompt lines: start with common prompt chars or end with $ / %
    const isCommand =
      /^[\w~/.@-]+[$%#>]\s/.test(text) ||
      /^\s*(>\s|❯\s|\$\s)/.test(text) ||
      /\s[$%#>]\s/.test(text);
    // Detect error lines
    const isError =
      /\b(error|Error|ERROR|FAIL|fail|failed|exception|Exception|panic|PANIC|fatal|Fatal|FATAL|❌|✗)\b/.test(
        text,
      ) ||
      /^\s*(at\s+\w|\w+Error:)/.test(text);
    const kind = isCommand ? "command" : isError ? "error" : "output";
    return { text: text.slice(0, 200), kind, ts: now };
  });
}

/**
 * Detect the active command (last command line seen) and last exit code.
 */
function detectLiveTerminalMeta(lines: import("../shared/ipc.ts").LiveTerminalLine[]): {
  activeCommand: string | null;
  lastExitCode: number | null;
  lastExitSuccess: boolean | null;
} {
  let activeCommand: string | null = null;
  let lastExitCode: number | null = null;
  let lastExitSuccess: boolean | null = null;

  for (const line of lines) {
    if (line.kind === "command") {
      // Strip prompt prefix to get the command text
      const cmd = line.text.replace(/^.*[$%#>]\s+/, "").trim();
      if (cmd.length > 0) activeCommand = cmd;
    }
    // Detect exit code patterns like "exit 1", "exited with code 0", "✓", "✗"
    const exitMatch = line.text.match(/exit(?:ed)?\s+(?:with\s+(?:code\s+)?)?(\d+)/i);
    if (exitMatch) {
      lastExitCode = parseInt(exitMatch[1], 10);
      lastExitSuccess = lastExitCode === 0;
    }
    if (/✓|✅|\bpassed\b|\bsuccess\b/i.test(line.text)) lastExitSuccess = true;
    if (/✗|❌|\bfailed\b|\bFAIL\b/.test(line.text)) lastExitSuccess = false;
  }

  return { activeCommand, lastExitCode, lastExitSuccess };
}

function startLiveTerminalPolling(): void {
  if (liveTerminalInterval !== null) return;
  liveTerminalInterval = setInterval(() => {
    void (async () => {
      try {
        const { isTerminalApp } = await import("../shared/terminalEvents.ts");
        const ctx = getCachedWindowContext();
        const appName = ctx.appName ?? "";
        if (!isTerminalApp(appName)) return; // only update when a terminal is focused
        const raw = await readFrontTerminalOutput(appName);
        if (!raw) return;
        const lines = parseLiveTerminalLines(raw, appName);
        const { activeCommand, lastExitCode, lastExitSuccess } = detectLiveTerminalMeta(lines);
        liveTerminalState = { lines, activeCommand, lastExitCode, lastExitSuccess, appName };
        push();
      } catch {
        // terminal reading is best-effort — swallow silently
      }
    })();
  }, 1_500);
}

function stopLiveTerminalPolling(): void {
  if (liveTerminalInterval !== null) {
    clearInterval(liveTerminalInterval);
    liveTerminalInterval = null;
  }
}

// ─── Perception loop — clipboard + app-switch ────────────────────────────────

/**
 * Start always-on background perception:
 *   - Clipboard polling every 2000 ms (silent — no push, just state update)
 *   - App-switch polling every 1500 ms (push on change so overlay can react)
 */
function startPerceptionLoop(): void {
  // Clipboard polling — silent updates only
  const { clipboard } = require("electron") as typeof import("electron");
  let lastClip = "";
  setInterval(() => {
    const clip = clipboard.readText();
    if (clip !== lastClip && clip.length > 0 && clip.length < 10000) {
      lastClip = clip;
      state.clipboardText = clip;
      // do NOT call push() here — too noisy; only update state silently
      // ── Clipboard Intelligence — proactive diagnosis (opt-in) ────────────
      if (state.glassSettings.clipboardIntelligenceEnabled) {
        const cls = classifyClipboard(clip);
        const decision = clipboardIntelGate.decide(clip, cls);
        if (decision.shouldFire) {
          void handleClipboardIntelligence(clip, cls);
        }
      }
    }
  }, 2000);

  // App-switch polling
  let lastApp = "";
  setInterval(() => {
    void (async () => {
      try {
        const result = await execFileAsync("osascript", [
          "-e",
          "tell application \"System Events\" to get name of first application process whose frontmost is true",
        ]);
        const appName = result.stdout.trim();
        if (appName && appName !== lastApp) {
          // Save the old app as previousApp, but skip Glass itself
          const oldApp = state.activeApp;
          const isGlassItself =
            oldApp &&
            /(electron|iivo|glass)/i.test(oldApp);
          if (oldApp && !isGlassItself) {
            state.previousApp = oldApp;
          }
          lastApp = appName;
          state.activeApp = appName;
          push(); // push on app switch so overlay can react
        }
      } catch {
        // ignore — accessibility permissions may not be granted
      }
    })();
  }, 1500);
}

// ─── Git repo discovery + diff capture ───────────────────────────────────────

/**
 * Try to discover the git repo root for the user's current project.
 *
 * Strategy (in order):
 *   1. CWD from iTerm2 (has a .path AppleScript property)
 *   2. CWD inferred from Terminal.app window title (often shows path)
 *   3. Candidate paths derived from VS Code / Cursor window titles in app snapshots
 *
 * For each candidate path, runs `git -C <path> rev-parse --show-toplevel`.
 * Returns the repo root and base ref on success, or null if none found.
 */
async function discoverGitRepo(
  appSnapshots: Array<{ app: string; title: string }>,
): Promise<{ repoPath: string; baseRef: string } | null> {
  const { buildRepoCandidatePaths, extractProjectNameFromTitle } = await import(
    "../shared/gitDiff.ts"
  );
  const os = await import("node:os");
  const homeDir = os.homedir();

  // Collect candidate paths to try
  const candidates: string[] = [];

  // Strategy 1: iTerm2 — ask for the current session path
  try {
    const script = `tell application "iTerm2"
  tell current window
    tell current session
      get path
    end tell
  end tell
end tell`;
    const { stdout } = await execFileAsync("osascript", ["-e", script]);
    const iTermPath = stdout.trim();
    if (iTermPath && iTermPath.startsWith("/")) {
      candidates.push(iTermPath);
    }
  } catch {
    /* iTerm2 not running or no scripting access — skip silently */
  }

  // Strategy 2: Terminal.app — parse window title (often shows cwd after "zsh" or "bash")
  try {
    const script = `tell application "Terminal"
  if (count of windows) > 0 then
    get custom title of selected tab of front window
  end if
end tell`;
    const { stdout } = await execFileAsync("osascript", ["-e", script]);
    const termTitle = stdout.trim();
    if (termTitle && termTitle.startsWith("/")) {
      candidates.push(termTitle);
    }
  } catch {
    /* Terminal not running — skip silently */
  }

  // Strategy 3: VS Code / Cursor window titles in app snapshots
  const editorApps = new Set(["code", "cursor", "visual studio code", "vscodium"]);
  const seenProjectNames = new Set<string>();
  for (const snap of [...appSnapshots].reverse()) {
    const appLower = snap.app.toLowerCase();
    if (!editorApps.has(appLower) && !appLower.includes("code") && !appLower.includes("cursor")) {
      continue;
    }
    const projectName = extractProjectNameFromTitle(snap.title);
    if (!projectName || seenProjectNames.has(projectName)) continue;
    seenProjectNames.add(projectName);
    for (const candidate of buildRepoCandidatePaths(projectName, homeDir)) {
      candidates.push(candidate);
    }
  }

  // Try each candidate — first valid git repo wins
  for (const candidatePath of candidates) {
    try {
      const { stdout: repoRoot } = await execFileAsync("git", [
        "-C", candidatePath,
        "rev-parse", "--show-toplevel",
      ]);
      const repoPath = repoRoot.trim();
      if (!repoPath) continue;

      // Got a valid repo — capture the current HEAD ref
      const { stdout: headRef } = await execFileAsync("git", [
        "-C", repoPath,
        "rev-parse", "HEAD",
      ]);
      const baseRef = headRef.trim();
      if (baseRef && baseRef.length === 40) {
        return { repoPath, baseRef };
      }
    } catch {
      /* Not a git repo or git not available at this path — continue */
    }
  }

  return null;
}

/**
 * Run `git diff --numstat` and `git diff --name-status` from baseRef to
 * the current working tree, then build a GitDiffSummary.
 * Returns null if git is unavailable, the repo has moved, or diff fails.
 */
async function captureSessionGitDiff(
  repoPath: string,
  baseRef: string,
  goal: string,
): Promise<import("../shared/gitDiff.ts").GitDiffSummary | null> {
  try {
    const [numstatResult, nameStatusResult] = await Promise.all([
      execFileAsync("git", ["-C", repoPath, "diff", "--numstat", baseRef]),
      execFileAsync("git", ["-C", repoPath, "diff", "--name-status", baseRef]),
    ]);

    const { buildGitDiffSummary } = await import("../shared/gitDiff.ts");
    return buildGitDiffSummary(
      numstatResult.stdout,
      nameStatusResult.stdout,
      repoPath,
      baseRef,
      goal,
    );
  } catch {
    return null;
  }
}

/**
 * Append a completed Wingman session record to wingman-sessions.jsonl in userData.
 * Fire-and-forget — errors are silently swallowed so they never interrupt the report flow.
 * Also refreshes wingmanMemoryState.totalSessions after a successful write.
 */
function saveWingmanSessionRecord(
  session: import("../shared/wingmanSession.ts").WingmanSession,
  report: import("../shared/wingmanSession.ts").WingmanReport,
): void {
  void (async () => {
    try {
      const { buildSessionRecord, serializeSessionRecord, parseSessionLibrary } = await import("../shared/wingmanMemory.ts");
      const record = buildSessionRecord(session, report);
      const line = serializeSessionRecord(record) + "\n";
      const libraryPath = join(app.getPath("userData"), "wingman-sessions.jsonl");
      appendFile(libraryPath, line, (err) => {
        if (!err) {
          // Re-read to get accurate total count
          readFile(libraryPath, "utf-8", (_e, data) => {
            if (!data) return;
            const lib = parseSessionLibrary(data);
            wingmanMemoryState = { ...wingmanMemoryState, totalSessions: lib.length };
          });
        }
      });
    } catch {
      /* never block the report push */
    }
  })();
}

/** High-signal moment types that warrant a brief notice. */
const MEETING_NOTICE_TYPES = new Set(["decision", "blocker", "risk", "action_item"]);

/** Short notice label per moment type (kept to ≤ 40 chars). */
function meetingMomentNoticeText(moment: MeetingMoment): string | null {
  switch (moment.type) {
    case "decision":    return `Decision captured`;
    case "blocker":     return `Blocker noted`;
    case "risk":        return `Risk flagged`;
    case "action_item": return moment.owner ? `Action → ${moment.owner}` : null; // only when owner known
    default:            return null;
  }
}

async function runMeetingIntelTick(): Promise<void> {
  if (!isMeetingsModeActive()) return;

  const transcript = state.transcript;
  const nowMs = Date.now();

  // ── AI extraction ─────────────────────────────────────────────────────────
  // Attempt AI-backed extraction before running the engine pass. If the AI
  // call fails or times out the engine falls back to regex automatically.
  let extractionOverride: ExtractedMomentRaw[] | undefined;

  if (
    !meetingExtractionInFlight &&
    shouldRunExtractionPass(meetingIntelState, transcript.length, nowMs)
  ) {
    meetingExtractionInFlight = true;
    try {
      const subType = meetingIntelState.classification?.subType;
      const schema  = subType ? getMeetingSchema(subType) : undefined;
      if (schema) {
        const lastLen = meetingIntelState.lastExtractionTranscriptLen ?? 0;
        const delta   = transcript.slice(lastLen);

        const prompt     = buildMeetingExtractionPrompt(delta, schema);
        const controller = new AbortController();
        const timeoutId  = setTimeout(() => controller.abort(), 9_000); // 9s hard cap

        try {
          const response = await askIivoGlass(
            config,
            { prompt, responseStyle: "full", modelPurpose: "semantic" },
            controller.signal,
          );
          clearTimeout(timeoutId);
          extractionOverride = parseExtractionResponse(response.answer, schema);
        } catch {
          clearTimeout(timeoutId);
          // AI call failed / timed out — engine will use regex fallback
        }
      }
    } finally {
      meetingExtractionInFlight = false;
    }
  }

  // Re-check after the await — mode might have been deactivated during AI call
  if (!isMeetingsModeActive()) return;

  // ── Engine pass ───────────────────────────────────────────────────────────
  const prev = meetingIntelState;
  const ctx  = getCachedWindowContext();
  const next = runMeetingIntelligencePass({
    transcript,
    state: meetingIntelState,
    appName: ctx.appName,
    windowTitle: ctx.windowTitle,
    nowMs,
    extractionOverride,
  });

  if (next !== meetingIntelState) {
    // Fire a notice when meeting type is first classified
    if (!prev.classification && next.classification) {
      const label = MEETING_SUB_TYPE_LABELS[next.classification.subType];
      state.lastNotice = `Meeting detected: ${label}`;
    }

    // Fire a single brief notice for the first new high-signal moment this tick
    if (next.moments.length > prev.moments.length) {
      const newMoments = next.moments.filter((m) => !meetingIntelNoticedIds.has(m.id));
      for (const moment of newMoments) {
        meetingIntelNoticedIds.add(moment.id);
        if (!MEETING_NOTICE_TYPES.has(moment.type)) continue;
        const notice = meetingMomentNoticeText(moment);
        if (notice) {
          state.lastNotice = notice;
          break; // one notice per tick
        }
      }
    }

    meetingIntelState = next;
    push();
  }
}

/** Restart the loop (e.g. after interval or mode change). */
function refreshCopilotLoop(): void {
  stopCopilotLoop();
  startCopilotLoop();
}

async function runCopilotTick(): Promise<void> {
  const session = sessions.current();
  const result = copilot.tick({
    sessionLive: sessionIsLive(),
    session,
    transcript: state.transcript,
    recentCommands: copilotRecentCommands,
    recentResponses: copilotRecentResponses,
    sourceApp: getCachedWindowContext().appName,
    sourceTitle: getCachedWindowContext().windowTitle,
    systemAudioActive: systemAudioActive(),
    systemAudioLastSignalMs,
    visualAskFailureCount: copilotVisualAskFailures,
  });
  if (!result.ran && !result.systemAudioSilenceWarning) return;
  if (result.intervention) {
    if (!isListenModeActive()) {
      pushFeed(
        createCommandFeedItem("response", result.intervention.body, {
          title: `Copilot · ${result.intervention.title}`,
        }),
      );
    }
  } else if (copilot.getConfig().mode === "passive" && result.newInsights.length > 0) {
    // Passive mode is near-silent: a tiny status, never a suggestion card.
    const n = result.newInsights.length;
    state.lastNotice = `Copilot captured ${n} idea${n === 1 ? "" : "s"}.`;
  }
  syncCopilotToSession();
  await persistSessions(sessions);
  push();
}

/** Offer to turn on Copilot when system audio starts inside a live session. */
function maybeOfferCopilotForSystemAudio(): void {
  if (!systemAudioActive()) return;
  systemAudioLastSignalMs = Date.now();
  const config = copilot.getConfig();
  if (config.mode !== "off" || config.sessionType === "video_learning") {
    return;
  }
  const offer = shouldOfferCopilot({
    mode: config.mode,
    sessionLive: sessionIsLive(),
    systemAudioActive: systemAudioActive(),
    alreadyOffered: copilotOffered,
  });
  if (offer) {
    copilot.setOffer({ reason: "system_audio", createdAt: new Date().toISOString() });
    copilotOffered = true;
  }
}

function refreshAppIdentityState(): void {
  state.appIdentityReport = collectGlassAppIdentityReport();
  state.duplicateAppBundles = findDuplicateGlassAppBundles(process.execPath);
  state.duplicateAppWarning = buildDuplicateAppWarning(
    state.duplicateAppBundles,
    state.appIdentityReport.bundlePath,
  );
}

function visualAskProbeDiagnostics(
  screenProbe: ScreenCaptureProbeSnapshot | undefined,
): Partial<import("../shared/visualAskDiagnostics.ts").VisualAskDiagnostics> {
  const id = state.appIdentityReport;
  if (!screenProbe) {
    return {
      runningAppPath: id?.bundlePath ?? id?.execPath,
      runningBundleId: id?.bundleIdentifier,
      packagingVariant: id?.packagingVariantLabel,
    };
  }
  return {
    preflightProbeResult: screenProbe.status,
    preflightThumbnailEmpty: screenProbe.probe.thumbnailEmpty ?? false,
    preflightSourceCount: screenProbe.probe.sourceCount,
    preflightDisplayId: screenProbe.displayId,
    runningAppPath: id?.bundlePath ?? id?.execPath,
    runningBundleId: id?.bundleIdentifier,
    packagingVariant: id?.packagingVariantLabel,
    lastPreflightIssue: formatScreenCaptureProbeDebug(screenProbe),
  };
}

function refreshOmniParserInstall(): void {
  state.omniParserInstall = getOmniParserInstallState();
}

function refreshSetupCapabilities(): void {
  state.setupCapabilities = buildGlassSetupCapabilities({
    platform: process.platform,
    screenCaptureProbe: state.screenCaptureProbe,
    screenCaptureDetail: state.screenCaptureDetail,
    windowCaptureProbe: state.windowCaptureProbe,
    windowCaptureDetail: state.windowCaptureDetail,
    captureStatus: state.operationDiagnostics.captureStatus,
    micPermission: state.micPermission,
    micListening: state.privacy.listening,
    systemAudioStatus: state.systemAudioStatus,
    systemAudioDetail: state.systemAudioDetail,
    virtualAudioDevices: state.virtualAudioDevices,
    selectedVirtualAudioDeviceId: state.selectedVirtualAudioDeviceId,
    transcriptionMode: state.transcriptionMode,
    serverHealth: state.serverHealthForSetup,
    sttStatus: state.stt.status,
    sttEnabled: state.stt.enabled,
    lastSttError: state.stt.lastError,
    lastError: state.lastError,
  });
}

async function applyGlassSetupCheckResult(
  result: Awaited<ReturnType<typeof runGlassSetupCheck>>,
  options: { silent?: boolean; noticePrefix?: string; showSummaryNotice?: boolean } = {},
): Promise<void> {
  state.serverHealthForSetup = result.serverHealth;
  state.screenCaptureProbe = result.screenCaptureProbe;
  state.screenCaptureDetail = result.screenCaptureDetail;
  state.windowCaptureProbe = result.windowCaptureProbe;
  state.windowCaptureDetail = result.windowCaptureDetail;
  if (
    !state.privacy.listening &&
    (process.env.IIVO_GLASS_E2E !== "1" || process.env.IIVO_GLASS_LIVE_E2E === "1")
  ) {
    const skipSystemAudioDowngrade =
      process.env.IIVO_GLASS_LIVE_E2E === "1" &&
      result.systemAudioStatus === "not_tested" &&
      state.systemAudioStatus === "available";
    if (!skipSystemAudioDowngrade) {
      state.systemAudioStatus = result.systemAudioStatus;
      state.systemAudioDetail = result.systemAudioDetail;
    }
  } else if (!state.privacy.listening && process.env.IIVO_GLASS_E2E === "1") {
    state.systemAudioStatus = result.systemAudioStatus;
    state.systemAudioDetail = result.systemAudioDetail;
  }
  if (result.serverHealth?.reachable) {
    if (isServerConnectivityMessage(state.lastError)) {
      state.lastError = undefined;
    }
    if (isServerConnectivityMessage(state.stt.lastError)) {
      state.stt = { ...state.stt, lastError: undefined };
    }
    if (sttConfig.endpoint === "server" && result.serverHealth.stt?.configured !== false) {
      state.stt = buildGlassSttState(
        { ...sttConfig, status: "configured" },
        { ...state.stt, lastError: undefined },
      );
    }
  }
  refreshSetupCapabilities();
  refreshOmniParserInstall();
  state.setupCheckSummary = formatSetupCheckSummary(state.setupCapabilities);
  if (!options.silent) {
    if (options.noticePrefix) {
      state.lastNotice = options.noticePrefix;
    } else if (options.showSummaryNotice && state.setupCheckSummary) {
      state.lastNotice = state.setupCheckSummary;
    }
  }
  push();
  if (
    !state.privacy.listening &&
    (process.env.IIVO_GLASS_E2E !== "1" || process.env.IIVO_GLASS_LIVE_E2E === "1")
  ) {
    if (options.showSummaryNotice) {
      state.lastNotice =
        "Connecting system audio — if macOS shows a screen picker, choose your display with audio enabled.";
      push();
    }
    broadcastTranscriptionControl({ type: "connect-system-audio" });
  }
}

function refreshCommandBarOverlayClearance(): boolean {
  const bar = getWindows()?.commandBar;
  const layout = getLayoutManager();
  const stackHeightPx = state.commandBarStackHeightPx;
  if (!bar || bar.isDestroyed() || !layout || !stackHeightPx || stackHeightPx <= 0) {
    return false;
  }
  const display = layout.getDisplay();
  const bounds = bar.getBounds();
  const clearance = computeCommandBarOverlayClearancePx({
    workAreaBottomY: glassLayoutContentBottomY(display),
    commandBarY: bounds.y,
    commandBarHeight: bounds.height,
    stackHeightPx,
  });
  if (state.commandBarOverlayClearancePx === clearance) {
    return false;
  }
  state.commandBarOverlayClearancePx = clearance;
  return true;
}

function scheduleInitialSetupCheck(): void {
  if (process.env.IIVO_GLASS_E2E === "1") return;
  void (async () => {
    const windows = getWindows();
    if (windows) {
      await whenGlassWindowsReady(windows);
    }
    const result = await runGlassSetupCheck({
      config,
      displayTarget: state.glassSettings.displayTarget,
    });
    await applyGlassSetupCheckResult(result, { silent: true });
  })().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[IIVO Glass] initial setup check failed:", message);
    state.lastNotice = `Setup check failed on launch: ${message}`;
    push();
  });
}

function snapshot(): GlassState {
  const session = sessions.current();
  return {
    privacy: state.privacy,
    transcript: state.transcript,
    notes: state.transcript.trim() ? extractNotes(state.transcript) : emptyNotes(),
    moments: moments.list(),
    panelTab: state.panelTab,
    config,
    lastError: state.lastError,
    lastNotice: state.lastNotice,
    lastSentUrl: state.lastSentUrl,
    session,
    sessionSummary: session ? buildSessionSummary(session) : "",
    sessionActionStatus: state.sessionActionStatus,
    transcriptionMode: state.transcriptionMode,
    systemAudioStatus: state.systemAudioStatus,
    systemAudioDetail: state.systemAudioDetail,
    windowContext: state.windowContext,
    iivoAnalysis: state.iivoAnalysis,
    stt: state.stt,
    panelVisible: isPanelVisible(),
    windows: getGlassWindowState(),
    operationDiagnostics: {
      ...state.operationDiagnostics,
      hotkeyStatus: getCommandBarHotkeyStatus(),
      displayInfo: getDisplayLayoutSummary(),
    },
    commandFeed: state.commandFeed,
    commandBarStackHeightPx: state.commandBarStackHeightPx,
    commandBarOverlayClearancePx: state.commandBarOverlayClearancePx,
    askStatus: state.askStatus,
    partialAnswer: state.partialAnswer,
    lastAskResponse: state.lastAskResponse,
    latestScreenshot: state.latestScreenshot ?? null,
    screenContextStatus: buildGlassScreenContextStatus(state.latestScreenshot, {
      phase: state.visualAskPhase,
    }),
    visualAskRetention: state.visualAskRetention,
    visualAskPayloadDiagnostics: state.visualAskPayloadDiagnostics,
    visualAskDiagnostics: state.visualAskDiagnostics,
    glassSettings: state.glassSettings,
    availableDisplayIds: getAvailableDisplayIds(),
    connectedDisplays: getConnectedDisplays(),
    setupCapabilities: state.setupCapabilities,
    setupCheckSummary: state.setupCheckSummary,
    captureDiagnosticsReport: state.captureDiagnosticsReport,
    appIdentityReport: state.appIdentityReport,
    duplicateAppBundles: state.duplicateAppBundles,
    duplicateAppWarning: state.duplicateAppWarning,
    virtualAudioDevices: state.virtualAudioDevices,
    selectedVirtualAudioDeviceId: state.selectedVirtualAudioDeviceId,
    micPermission: state.micPermission,
    copilot: copilotRuntime(),
    voiceModeStartNonce: state.voiceModeStartNonce,
    companionModeActive: state.companionModeActive,
    companionModeToggleNonce: state.companionModeToggleNonce,
    companionWarmupPhase: state.companionWarmupPhase,
    companionWarmupSpeakNonce: state.companionWarmupSpeakNonce,
    companionPresence: state.companionPresence,
    companionMemory: state.companionMemory,
    companionPrivacy: state.companionPrivacy,
    translateSetupRequestId: state.translateSetupRequestId,
    agentRun: state.agentRun,
    agentHistory: state.agentHistory,
    agentPendingApproval: state.agentPendingApproval,
    agentChangeLog: state.agentChangeLog,
    coderWorkspaceActive: state.coderWorkspaceActive,
    glassIdeActive: state.glassIdeActive,
    glassIdePreviewUrl: state.glassIdePreviewUrl,
    glassIdePreviewReloadNonce: state.glassIdePreviewReloadNonce,
    glassIdeTerminalExpanded: state.glassIdeTerminalExpanded,
    glassIdeAletheia: state.glassIdeAletheia,
    indexState: state.indexState,
    ollamaAvailable: state.ollamaAvailable,
    projectMemoryState: state.projectMemoryState,
    coderVerifyState: state.coderVerifyState,
    coderReviewState: state.coderReviewState,
    qaPipelineState: state.qaPipelineState,
    qaNotificationVisible: state.qaNotificationVisible,
    coderLoopIteration: state.coderLoopIteration,
    coderLoopSessionId: state.coderLoopSessionId,
    mediaContext: state.mediaContext,
    appUpdate: state.appUpdate,
    listenCountdownSeconds: state.listenCountdownSeconds,
    listenLiveNotes: isListenModeActive() ? buildCurrentListenLiveNotes() : undefined,
    liveTranslate: isTranslateActive() ? liveTranslateRuntime : undefined,
    onboardingOpen: state.onboardingOpen,
    onboardingComplete: state.onboardingComplete,
    glassBootComplete: state.glassBootComplete,
    persona: state.persona,
    ttsAudio: state.ttsAudio,
    onboardingFinishedAt: state.onboardingFinishedAt,
    e2eFastOnboarding: state.e2eFastOnboarding,
    glassDevMode: !app.isPackaged,
    glassUserProfile: state.glassUserProfile,
    blackHoleInstallStatus: state.blackHoleInstallStatus,
    blackHoleInstallProgress: state.blackHoleInstallProgress,
    iivoAccountLink: state.iivoAccountLink,
    omniParserInstall: state.omniParserInstall,
    meetingIntelligence: isMeetingsModeActive() ? meetingIntelState : undefined,
    iivoApiUrl: config.iivoApiUrl,
    iivoWebUrl: config.iivoWebUrl,
    wingman: wingmanState,
    wingmanMemory: wingmanMemoryState,
    agentProxy: agentProxyState,
    githubPATConfigured: githubPATState.configured,
    githubTokenInvalid: githubPATState.tokenInvalid,
    liveTerminal: liveTerminalState,
    terminalWidgetVisible: liveTerminalWidgetVisible,
    terminalWidgetPos: liveTerminalWidgetPos,
    clipboardText: state.clipboardText,
    activeApp: state.activeApp,
    previousApp: state.previousApp,
    workingContext: isDigestFresh(latestDigest) ? latestDigest.text : undefined,
    workingContextAge: latestDigest?.capturedAt,
    memoryResults: glassMemoryResults,
    shellOutputs: state.shellOutputs,
    actionResult: state.actionResult,
    glassDockTerminalOpen: state.glassDockTerminalOpen,
    glassDockTerminalId: state.glassDockTerminalId,
    glassDockTerminalTabs: state.glassDockTerminalTabs,
    glassTerminalPendingAction: state.glassTerminalPendingAction,
    designCaptures: state.designCaptures,
    pendingDiffs: state.pendingDiffs,
    buildVerifications: state.buildVerifications,
    powersMenuOpen: state.powersMenuOpen,
    commandPaletteOpen: state.commandPaletteOpen,
    responsePanelRevealSeq: state.responsePanelRevealSeq,
    paletteTerminalHint: (() => {
      const block = getLastTerminalContextBlock();
      if (!block) return null;
      return {
        command: block.command,
        output: block.output,
        exitCode: block.exitCode ?? null,
        status: block.status,
      };
    })(),
    customCommands: state.customCommands,
    customCommandsWarnings: state.customCommandsWarnings,
    extractBuildModeActive,
  };
}

async function finishGlassOnboarding(profile: GlassUserProfile | null): Promise<void> {
  unregisterOnboardingEmergencyShortcut();
  const stored = await completeGlassOnboardingStore(profile);
  state.onboardingOpen = false;
  state.glassUserProfile = stored.profile;
  glassUserSettings = {
    ...glassUserSettings,
    displayTarget: "primary",
    chromeLayoutLocked: true,
    dockCustomOrigin: null,
    commandBarCustomOrigin: null,
  };
  state.glassSettings = glassUserSettings;
  await persistGlassUserSettings(glassUserSettings);
  syncChromeLayoutFromSettings(glassUserSettings, { clearCustomOrigins: true });
  const manager = getLayoutManager();
  manager?.setDisplayTarget("primary");
  setOnboardingPending(false);

  // After first-run onboarding, Glass anchors to the primary display.
  // If the user has an external monitor connected, surface a one-time notice
  // so they know they can move Glass to it via Settings → Display.
  // This avoids silently leaving Glass on the built-in screen when the user's
  // real working display is HDMI/external.
  const externalDisplay = getConnectedDisplays().find((d) => !d.isPrimary);
  if (externalDisplay) {
    state.lastNotice = `External display detected (${externalDisplay.label}). Move Glass there in Settings → Display.`;
  }

  push();
}

function syncBuilderStripLayoutReserve(): void {
  const reserve = shouldShowBuilderStrip({
    onboardingComplete: state.onboardingComplete,
    persona: state.persona,
    glassDevMode: !app.isPackaged,
  })
    ? builderStripLayoutReservePx()
    : 0;
  setBuilderStripLayoutReserve(reserve);
}

async function finishSortingHatOnboarding(persona?: GlassState["persona"]): Promise<void> {
  unregisterOnboardingEmergencyShortcut();
  const effectivePersona =
    persona ?? (!app.isPackaged ? ("developer" as const) : undefined);
  state.onboardingOpen = false;
  glassUserSettings = {
    ...glassUserSettings,
    onboardingComplete: true,
    ...(effectivePersona ? { persona: effectivePersona } : {}),
    displayTarget: "primary",
    chromeLayoutLocked: true,
    dockCustomOrigin: null,
    commandBarCustomOrigin: null,
  };
  state.glassSettings = glassUserSettings;
  state.onboardingComplete = true;
  if (effectivePersona) state.persona = effectivePersona;
  state.onboardingFinishedAt = Date.now();
  syncBuilderStripLayoutReserve();

  const stored = await completeGlassOnboardingStore(state.glassUserProfile);
  state.glassUserProfile = stored.profile;
  await persistGlassUserSettings(glassUserSettings);
  syncChromeLayoutFromSettings(glassUserSettings, { clearCustomOrigins: true });
  const manager = getLayoutManager();
  manager?.setDisplayTarget("primary");
  setOnboardingPending(false);

  const externalDisplay = getConnectedDisplays().find((d) => !d.isPrimary);
  if (externalDisplay) {
    state.lastNotice = `External display detected (${externalDisplay.label}). Move Glass there in Settings → Display.`;
  }

  push();
}

async function beginSortingHatRecalibration(): Promise<void> {
  unregisterOnboardingEmergencyShortcut();
  state.onboardingOpen = false;
  glassUserSettings = {
    ...glassUserSettings,
    onboardingComplete: false,
    persona: undefined,
    uiLocale: undefined,
  };
  state.glassSettings = glassUserSettings;
  state.onboardingComplete = false;
  state.persona = undefined;
  state.onboardingFinishedAt = undefined;
  state.glassBootComplete = true;
  syncBuilderStripLayoutReserve();
  await persistGlassUserSettings(glassUserSettings);
  setOnboardingPending(true);
  setOnboardingEmergencyHandler(() => {
    void finishSortingHatOnboarding();
  });
  registerOnboardingEmergencyShortcut();
  push();
}

function skipGlassOnboardingEmergency(): void {
  void finishGlassOnboarding(null);
}

function pushFeed(item: GlassCommandFeedItem): void {
  state.commandFeed = appendCommandFeedItem(state.commandFeed, item);
}

function eventContextFields(opts?: { sourceTitle?: string; captureSource?: string }) {
  let ctx = getCachedWindowContext();
  if (opts?.captureSource) ctx = mergeCaptureSource(ctx, opts.captureSource);
  const mapped = windowContextForEvent(ctx);
  return {
    sourceApp: mapped.sourceApp,
    sourceTitle: opts?.sourceTitle ?? mapped.sourceTitle,
    metadata: mapped.metadata,
  };
}

function syncIdeChromeFromState(): void {
  setIdeChromeSuppressed(state.glassIdeActive || state.coderWorkspaceActive);
  setOverlayIdeActive(state.glassIdeActive === true);
}

function push(): void {
  refreshSetupCapabilities();
  refreshOmniParserInstall();
  const updatePhase = state.appUpdate.phase;
  const appUpdateVisible =
    updatePhase === "available" || updatePhase === "downloading" || updatePhase === "installing";
  syncOverlayPresentationRaised(
    shouldRaiseOverlayForNotifications({
      lastError: state.lastError,
      lastNotice: state.lastNotice,
      rendererNotificationActive: overlayRendererNotificationActive,
      appUpdateVisible,
    }),
  );
  syncIdeChromeFromState();
  syncLanguagePickerOverlayInteractivity(
    state.onboardingComplete === false &&
      state.glassBootComplete === true &&
      !state.onboardingOpen &&
      !isUiLocaleChosen(state.glassSettings?.uiLocale),
  );
  ensureOnboardingOverlayClickThrough();
  syncListenNotesPadVisibility();
  broadcast(IPC.state, snapshot());
}

let glassUpdateCheckTimer: ReturnType<typeof setInterval> | null = null;
let overlayRendererNotificationActive = false;

async function runGlassUpdateCheck(): Promise<void> {
  if (process.env.IIVO_GLASS_E2E === "1") return;
  if (
    state.appUpdate.phase === "installing" ||
    state.appUpdate.phase === "downloading"
  ) {
    return;
  }

  state.appUpdate = {
    ...state.appUpdate,
    phase: "checking",
    error: undefined,
    checkedAt: new Date().toISOString(),
  };
  push();

  if (isGlassAutoUpdateEnabled()) {
    await checkGlassAutoUpdate();
    return;
  }

  const next = await checkForGlassAppUpdate(config, {
    ...state.appUpdate,
    currentVersion: app.getVersion(),
  });

  state.appUpdate = next;
  push();
}

function scheduleGlassUpdateChecks(): void {
  if (process.env.IIVO_GLASS_E2E === "1") return;
  void runGlassUpdateCheck();
  setTimeout(() => void runGlassUpdateCheck(), 5_000);
  glassUpdateCheckTimer = setInterval(() => void runGlassUpdateCheck(), 30 * 60 * 1000);
}

function dispatchPrivacy(action: Parameters<typeof privacyReducer>[1]): void {
  state.privacy = privacyReducer(state.privacy, action);
}

async function openHandoff(contextId: string): Promise<void> {
  const url = buildLensAskUrl(config, contextId);
  state.lastSentUrl = url;
  const opened = await openGlassHandoffUrl(url);
  if (!opened.ok) {
    throw new Error(opened.error);
  }
}

async function registerLatestGlassCapture(input: {
  imageDataUrl: string;
  displayLabel: string;
  displayId: number;
  sourceTitle?: string;
  sessionId?: string;
  eventId?: string;
  screenshotPath?: string;
  thumbnailPath?: string;
  mimeType?: string;
}): Promise<void> {
  state.latestScreenshot = createLatestScreenshotState({
    ...input,
    contextUploadStatus: "none",
  });
  push();

  if (!shouldAutoUploadCapturesToContext(state.glassSettings)) {
    return;
  }

  const title = `IIVO Glass capture ${new Date().toLocaleString()}${input.displayLabel ? ` · ${input.displayLabel}` : ""}`;
  state.latestScreenshot.contextUploadStatus = "pending";
  push();
  const contextId = await uploadGlassScreenshotContext(config, input.imageDataUrl, title);
  if (state.latestScreenshot) {
    if (contextId) {
      state.latestScreenshot.contextId = contextId;
      state.latestScreenshot.contextUploadStatus = "ready";
    } else {
      state.latestScreenshot.contextUploadStatus = "failed";
    }
    push();
  }
}

async function uploadEphemeralVisualToContext(
  capture: EphemeralVisualCapture,
  title: string,
): Promise<string | undefined> {
  return uploadGlassScreenshotContext(config, capture.imageDataUrl, title);
}

function setEphemeralVisualCapture(input: {
  imageDataUrl: string;
  displayLabel?: string;
  displayId?: number;
  sourceTitle?: string;
  sessionId?: string;
  eventId?: string;
}): void {
  state.ephemeralVisualCapture = {
    imageDataUrl: input.imageDataUrl,
    capturedAt: new Date().toISOString(),
    displayLabel: input.displayLabel,
    displayId: input.displayId,
    sourceTitle: input.sourceTitle,
    sessionId: input.sessionId,
    eventId: input.eventId,
  };
}

function clearEphemeralVisualCapture(): void {
  state.ephemeralVisualCapture = null;
}

async function persistEphemeralVisualToSession(): Promise<boolean> {
  const ephemeral = state.ephemeralVisualCapture;
  if (!ephemeral || !sessionIsLive()) return false;
  const session = sessions.current();
  if (!session) return false;

  const ctxFields = eventContextFields({ sourceTitle: ephemeral.sourceTitle });
  const event = sessions.addEvent({
    kind: "screen_capture",
    title: `Screen capture · ${ephemeral.displayLabel ?? "Display"}`,
    sourceApp: ctxFields.sourceApp,
    sourceTitle: ctxFields.sourceTitle ?? ephemeral.sourceTitle,
    importance: "medium",
    metadata: { ...ctxFields.metadata, source: "visual_ask_save" },
  });
  if (!event) return false;

  const refs = await saveSessionScreenshot(session.id, event.id, ephemeral.imageDataUrl);
  event.screenshotPath = refs.screenshotPath;
  event.thumbnailPath = refs.thumbnailPath;
  event.screenshotMimeType = refs.screenshotMimeType;
  event.screenshotSizeBytes = refs.screenshotSizeBytes;

  state.latestScreenshot = createLatestScreenshotState({
    displayLabel: ephemeral.displayLabel ?? "Display",
    displayId: ephemeral.displayId ?? 0,
    sourceTitle: ephemeral.sourceTitle,
    sessionId: session.id,
    eventId: event.id,
    screenshotPath: refs.screenshotPath,
    thumbnailPath: refs.thumbnailPath,
    mimeType: refs.screenshotMimeType,
    contextUploadStatus: state.latestScreenshot?.contextUploadStatus ?? "none",
  });
  clearEphemeralVisualCapture();
  await persistSessions(sessions);
  return true;
}

async function handleCapture(): Promise<string | undefined> {
  state.lastError = undefined;
  const captureTarget = resolveCaptureDisplay(state.glassSettings.displayTarget);
  state.operationDiagnostics = {
    ...recordOperation(state.operationDiagnostics, "capture-screen", "pending"),
    captureStatus: `Capturing ${captureTarget.label}`,
  };
  dispatchPrivacy({ type: "CAPTURE_START", at: new Date().toISOString() });
  push();
  try {
    const result = await captureDisplayById(captureTarget.id, captureTarget.label);
    state.pendingCaptureDataUrl = result.imageDataUrl;
    await registerLatestGlassCapture({
      imageDataUrl: result.imageDataUrl,
      displayLabel: result.displayLabel,
      displayId: result.displayId,
      sourceTitle: result.sourceName,
    });
    state.lastNotice = `${CAPTURE_SUCCESS_MESSAGE} (${result.displayLabel})`;
    state.screenCaptureProbe = "ready";
    state.screenCaptureDetail = undefined;
    state.operationDiagnostics = diagnosticsForCapture(
      state.operationDiagnostics,
      true,
      undefined,
      result.displayLabel,
    );
    dispatchPrivacy({ type: "CAPTURE_DONE", at: new Date().toISOString() });
    refreshSetupCapabilities();
    push();
    return result.imageDataUrl;
  } catch (err) {
    const message = captureErrorMessage(err);
    state.lastError = message;
    state.lastNotice = /permission|screen recording/i.test(message)
      ? "Screen Recording permission needed. Open Settings, grant access to IIVO Glass, then Retry Capture."
      : message;
    state.screenCaptureProbe = mapCaptureErrorToScreenCaptureStatus(message);
    state.screenCaptureDetail = message;
    state.operationDiagnostics = diagnosticsForCapture(state.operationDiagnostics, false, message);
    dispatchPrivacy({ type: "CAPTURE_DONE", at: new Date().toISOString() });
    refreshSetupCapabilities();
    push();
    return undefined;
  }
}

async function sendScreenshot(imageDataUrl: string): Promise<void> {
  state.lastError = undefined;
  dispatchPrivacy({ type: "SEND_START", at: new Date().toISOString() });
  push();
  try {
    const payload = buildScreenshotContextPayload({
      title: `IIVO Glass capture ${new Date().toLocaleString()}`,
    });
    const item = await createScreenshotContext(config, payload, imageDataUrl);
    moments.add({
      kind: "screenshot",
      note: "Screen capture sent to IIVO",
      contextId: item.id,
      sentToIivo: true,
    });
    await persistMoments(moments);
    await openHandoff(item.id);
    dispatchPrivacy({ type: "SEND_DONE", at: new Date().toISOString() });
    push();
  } catch (err) {
    state.lastError = err instanceof Error ? err.message : "Send to IIVO failed";
    dispatchPrivacy({ type: "CAPTURE_DONE", at: new Date().toISOString() });
    push();
  }
}

async function sendTranscript(): Promise<void> {
  const text = state.transcript.trim();
  if (!text) {
    state.lastError = "No transcript text to send.";
    push();
    return;
  }
  state.lastError = undefined;
  dispatchPrivacy({ type: "SEND_START", at: new Date().toISOString() });
  push();
  try {
    const payload = buildTextContextPayload({
      title: `IIVO Glass transcript ${new Date().toLocaleString()}`,
      text,
      kind: "transcript",
    });
    const item = await createContextItem(config, payload);
    await openHandoff(item.id);
    dispatchPrivacy({ type: "SEND_DONE", at: new Date().toISOString() });
    push();
  } catch (err) {
    state.lastError = err instanceof Error ? err.message : "Send to IIVO failed";
    dispatchPrivacy({ type: "CAPTURE_DONE", at: new Date().toISOString() });
    push();
  }
}

function buildGlassAskSessionPayload(userPrompt?: string): GlassAskSessionPayload | undefined {
  const session = sessions.current();
  const live = sessionIsLive();
  const ctx = getCachedWindowContext();
  const activeListening = buildActiveListeningAskContext(userPrompt);

  const payload: GlassAskSessionPayload = {
    sessionId: session?.id,
    title: session?.title,
    summary: live && session ? buildSessionSummary(session) : undefined,
    recentTranscript: activeListening?.recentTranscriptWindow?.trim()
      ? activeListening.recentTranscriptWindow.trim().slice(-1500)
      : state.transcript.trim()
        ? state.transcript.trim().slice(-1500)
        : undefined,
    currentSource:
      ctx.status === "available"
        ? {
            appName: ctx.appName,
            windowTitle: ctx.windowTitle,
            sourceTitle: ctx.sourceName ?? ctx.displayName,
          }
        : ctx.sourceName
          ? { sourceTitle: ctx.sourceName }
          : undefined,
    activeListening,
  };

  if (live && session) {
    payload.recentEvents = session.events.slice(-8).map((e) => ({
      kind: e.kind,
      title: e.title,
      text: e.text,
      timestamp: e.timestamp,
      sourceTitle: e.sourceTitle,
    }));
    payload.recentInsights = session.insights.slice(-5).map((i) => i.text);
  }

  const hasContext =
    payload.summary ||
    payload.recentTranscript ||
    payload.recentEvents?.length ||
    payload.recentInsights?.length ||
    payload.currentSource ||
    payload.activeListening?.enabled;
  return hasContext ? payload : undefined;
}

function mergeVisualAskDiagnostics(partial: Partial<VisualAskDiagnostics>): void {
  state.visualAskDiagnostics = {
    phase: state.visualAskPhase,
    displayLabel: state.latestScreenshot?.displayLabel,
    displayId: state.latestScreenshot?.displayId,
    ...state.visualAskDiagnostics,
    ...partial,
  };
}

function visualDiagnosticsFromPayload(
  diag: VisualAskPayloadDiagnostics,
  extra?: Partial<VisualAskDiagnostics>,
): VisualAskDiagnostics {
  return {
    phase: state.visualAskPhase,
    originalDimensions: { width: diag.originalWidth, height: diag.originalHeight },
    optimizedDimensions: { width: diag.optimizedWidth, height: diag.optimizedHeight },
    optimizedSizeBytes: diag.optimizedSizeBytes,
    compressionPreset: diag.qualityPreset,
    qualityPreset: diag.qualityPreset,
    visualFrameMode: diag.visualFrameMode,
    cropBounds: diag.cropBounds,
    retryUsed: diag.status === "retry",
    ...extra,
  };
}

function buildVisualAskStatusMessages(
  captureLabel: string,
  diag: VisualAskPayloadDiagnostics | null | undefined,
): string[] {
  const messages: string[] = [];
  if (captureLabel) {
    messages.push(visualAskUserMessageForFrame("screen", captureLabel));
  }
  if (diag?.qualityPreset === "text") {
    messages.push("Using text clarity mode.");
  }
  if (diag?.visualFrameMode) {
    messages.push(visualAskUserMessageForFrame(diag.visualFrameMode));
  }
  if (diag?.optimizedSizeBytes) {
    messages.push(`Optimized screen image to ${formatBytesShort(diag.optimizedSizeBytes)}.`);
  }
  return messages;
}

async function openRunHistoryOnWeb(runId: string): Promise<void> {
  const trimmed = runId?.trim();
  if (!trimmed) return;

  const runUrl = buildRunHistoryUrl(config, trimmed);
  state.lastSentUrl = runUrl;
  const opened = await openGlassHandoffUrl(runUrl);
  if (opened.ok) {
    state.lastNotice = "Opened full council on web.";
  } else {
    state.lastNotice = opened.copiedToClipboard
      ? `Could not open browser. URL copied to clipboard: ${runUrl}`
      : `Could not open browser. Copy this URL: ${runUrl}`;
    state.lastError = opened.error;
  }
  push();
}

async function openFeedInIivo(feedId: string): Promise<void> {
  const item = state.commandFeed.find((f) => f.id === feedId);
  if (!item) return;

  if (item.runId) {
    const runUrl = buildRunHistoryUrl(config, item.runId);
    state.lastSentUrl = runUrl;
    const opened = await openGlassHandoffUrl(runUrl);
    if (opened.ok) {
      state.lastNotice = "Opened run in IIVO.";
      mergeVisualAskDiagnostics({ handoffUrl: runUrl, serverResult: "success" });
    } else {
      state.lastNotice = opened.copiedToClipboard
        ? `Could not open browser. URL copied to clipboard: ${runUrl}`
        : `Could not open browser. Copy this URL: ${runUrl}`;
      state.lastError = opened.error;
      mergeVisualAskDiagnostics({
        handoffUrl: runUrl,
        serverResult: "network_error",
        userMessage: opened.error,
      });
    }
    push();
    return;
  }

  if (item.contextId) {
    const url = buildLensAskUrl(config, item.contextId);
    try {
      await openHandoff(item.contextId);
      state.lastNotice = "Opened in IIVO with this answer attached.";
      mergeVisualAskDiagnostics({ handoffUrl: url, serverResult: "success" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const fallback = await openGlassHandoffUrl(url);
      const copied = !fallback.ok && fallback.copiedToClipboard;
      state.lastNotice = copied
        ? `Could not open browser. URL copied to clipboard: ${url}`
        : `Could not open browser. Copy this URL: ${url}`;
      state.lastError = msg;
      mergeVisualAskDiagnostics({ handoffUrl: url, serverResult: "network_error", userMessage: msg });
    }
    push();
    return;
  }

  const question = item.prompt ?? item.title;
  const answer = item.fullBody ?? (item.kind === "response" ? item.body : undefined);
  const session = sessions.current();
  const summary = session ? buildSessionSummary(session) : undefined;
  const retention = state.visualAskRetention;

  let screenshotContextId =
    item.contextId ?? state.lastAskResponse?.contextId ?? state.latestScreenshot?.contextId;

  const ephemeral = state.ephemeralVisualCapture;
  if (!screenshotContextId && ephemeral?.imageDataUrl) {
    const title = `IIVO Glass · ${question.length > 60 ? `${question.slice(0, 59)}…` : question}`;
    screenshotContextId = await uploadEphemeralVisualToContext(ephemeral, title);
    if (!screenshotContextId) {
      state.lastNotice = "Could not upload screen context to IIVO. Try again or use Capture.";
      state.lastError = "Context Bridge upload failed.";
      mergeVisualAskDiagnostics({
        serverResult: "error",
        retentionResult: "not_saved",
        userMessage: "Upload failed — screenshot was not sent to IIVO.",
      });
      push();
      return;
    }
    if (state.latestScreenshot) {
      state.latestScreenshot.contextId = screenshotContextId;
      state.latestScreenshot.contextUploadStatus = "ready";
    }
    if (retention?.usedForAnswer) {
      state.visualAskRetention = buildVisualAskRetentionStatus({
        usedForAnswer: true,
        savedToSession: retention.savedToSession,
        uploadedToContext: true,
      });
      mergeVisualAskDiagnostics({ retentionResult: "uploaded_to_context" });
    }
  }

  const parts = [`Question:\n${question}`];
  if (answer) parts.push(`Answer:\n${answer}`);
  if (summary?.trim()) parts.push(`Session context:\n${summary.trim()}`);
  if (screenshotContextId) {
    parts.push(`Screenshot context id: ${screenshotContextId}`);
  }
  if (retention) {
    parts.push(
      `Retention: savedToSession=${retention.savedToSession ? "yes" : "no"}, uploadedToContext=${retention.uploadedToContext ? "yes" : "no"}`,
    );
  }
  const text =
    parts.length > 1
      ? parts.join("\n\n")
      : `Question:\n${question}\n\n(Continue this conversation in IIVO.)`;
  const payload = buildTextContextPayload({
    title: `IIVO Glass · ${question.length > 60 ? `${question.slice(0, 59)}…` : question}`,
    text,
    kind: "note",
  });

  let contextId: string;
  try {
    const created = await createContextItem(config, payload);
    contextId = created.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    state.lastNotice = "Could not create IIVO context for handoff.";
    state.lastError = msg;
    mergeVisualAskDiagnostics({ serverResult: "network_error", userMessage: msg });
    push();
    return;
  }

  const handoffUrl = buildLensAskUrl(config, contextId);
  state.lastSentUrl = handoffUrl;
  const opened = await openGlassHandoffUrl(handoffUrl);
  if (opened.ok) {
    state.lastNotice = screenshotContextId
      ? "Opened in IIVO with answer and screen context."
      : "Opened in IIVO with this answer attached.";
    mergeVisualAskDiagnostics({
      handoffUrl,
      serverResult: "success",
      retentionResult: screenshotContextId
        ? "uploaded_to_context"
        : retention?.savedToSession
          ? "saved_to_session"
          : "not_saved",
    });
  } else {
    state.lastNotice = opened.copiedToClipboard
      ? `Could not open browser. URL copied to clipboard: ${handoffUrl}`
      : `Could not open browser. Copy this URL: ${handoffUrl}`;
    state.lastError = opened.error;
    mergeVisualAskDiagnostics({
      handoffUrl,
      serverResult: "network_error",
      userMessage: opened.error,
    });
  }
  push();
}

function removeThinkingFeedItems(): void {
  state.commandFeed = state.commandFeed.filter((item) => item.kind !== "thinking");
}

function removeLookingFeedItems(): void {
  state.commandFeed = state.commandFeed.filter((item) => item.kind !== "looking");
}

function removePendingAskFeedItems(): void {
  state.commandFeed = state.commandFeed.filter(
    (item) => item.kind !== "thinking" && item.kind !== "looking",
  );
}

function dismissOverlayChatFeed(): void {
  const chatKinds = new Set<GlassCommandFeedItem["kind"]>([
    "command",
    "thinking",
    "looking",
    "response",
    "error",
  ]);
  state.commandFeed = state.commandFeed.filter(
    (item) => item.pinned || !chatKinds.has(item.kind),
  );
  if (state.lastNotice?.startsWith("IIVO answered")) {
    state.lastNotice = undefined;
  }
  push();
}

function cancelGlassAsk(): void {
  if (!state.askInFlight) return;

  askRequestGeneration += 1;
  askAbortController?.abort();
  askAbortController = null;
  thinkingStartedAtMs = null;
  lookingStartedAtMs = null;
  state.askInFlight = false;
  state.askStatus = "idle";
  state.partialAnswer = undefined;
  state.visualAskPhase = "idle";
  removePendingAskFeedItems();
  pushFeed(createCommandFeedItem("error", "Request cancelled."));
  state.operationDiagnostics = recordOperation(state.operationDiagnostics, "ask-iivo", "error", "cancelled");
  push();
}

async function saveFeedMoment(feedId: string): Promise<void> {
  const item = state.commandFeed.find((f) => f.id === feedId);
  if (!item) return;
  const note = item.fullBody ?? item.body;
  moments.add({ kind: "note", note: note.slice(0, 500) });
  await persistMoments(moments);
  if (sessionIsLive()) {
    sessions.addEvent({ kind: "saved_moment", title: note.slice(0, 80) });
    await persistSessions(sessions);
  }

  let savedScreen = false;
  if (state.ephemeralVisualCapture && sessionIsLive()) {
    savedScreen = await persistEphemeralVisualToSession();
  }

  if (state.visualAskRetention?.usedForAnswer) {
    state.visualAskRetention = buildVisualAskRetentionStatus({
      usedForAnswer: true,
      savedToSession: savedScreen || state.visualAskRetention.savedToSession,
      uploadedToContext: state.visualAskRetention.uploadedToContext,
    });
  }

  pushFeed(createCommandFeedItem("moment", "Saved as a moment."));
  state.lastNotice = savedScreen
    ? "Saved answer and screen capture to session."
    : "Saved moment from IIVO answer.";
  push();
}

/**
 * Command-bar direct ask. Calls POST /api/glass/ask and renders the answer inline
 * as overlay response cards. Falls back to Context Bridge handoff on failure.
 */
function glassContextOnboardingSeed(): GlassUserProfile | null {
  return state.glassUserProfile;
}

function resolveGlassAskUserContext(): string | undefined {
  const base = resolveGlassUserContext(glassContextProfile, glassContextOnboardingSeed());
  const clipboardSnippet =
    state.clipboardText && state.clipboardText.length > 0
      ? `[Clipboard: "${state.clipboardText.slice(0, 500)}"]`
      : undefined;
  const screenDigest =
    isDigestFresh(latestDigest)
      ? `[Screen: ${latestDigest.text}]`
      : undefined;
  const parts = [base, clipboardSnippet, screenDigest].filter(Boolean);
  return parts.length > 0 ? parts.join("\n") : undefined;
}

async function recordGlassContextAfterResponse(prompt: string): Promise<void> {
  glassContextProfile = recordGlassContextInteraction(
    glassContextProfile,
    { question: prompt },
    glassContextOnboardingSeed(),
  );
  await persistGlassContextProfile(glassContextProfile);
}

function stopCompanionAnchorWatch(): void {
  if (companionAnchorWatchTimer) {
    clearInterval(companionAnchorWatchTimer);
    companionAnchorWatchTimer = null;
  }
  companionAnchorBaseline = null;
}

function startCompanionAnchorWatch(): void {
  stopCompanionAnchorWatch();
  const ctx = getCachedWindowContext();
  companionAnchorBaseline = captureAnchorSnapshot({
    bounds: ctx.windowBounds,
    appName: ctx.appName,
    windowTitle: ctx.windowTitle,
  });
  companionAnchorWatchTimer = setInterval(() => {
    if (!state.companionPresence) {
      stopCompanionAnchorWatch();
      return;
    }
    void (async () => {
      await refreshWindowContext();
      const current = getCachedWindowContext();
      const snap = captureAnchorSnapshot({
        bounds: current.windowBounds,
        appName: current.appName,
        windowTitle: current.windowTitle,
      });
      if (anchorWatchDrifted(companionAnchorBaseline, snap)) {
        state.companionPresence = null;
        state.lastNotice = COMPANION_ANCHOR_INVALIDATED_NOTICE;
        stopCompanionAnchorWatch();
        push();
      }
    })();
  }, 2000);
}

function attachCaptureCropsToPresence(
  presence: import("../shared/companionGuidance.ts").CompanionGuidancePayload | null,
  imageDataUrl?: string,
): import("../shared/companionGuidance.ts").CompanionGuidancePayload | null {
  if (!presence || !imageDataUrl) return presence;
  const plan = presence.guidancePlan;
  const allMan = allManifestationsFromPlan(plan.manifestations, plan.steps);
  const crops = buildCaptureCropsForManifestations({
    imageDataUrl,
    uiMap: presence.uiMap,
    manifestations: allMan,
    captureWidth: presence.uiMap.width,
    captureHeight: presence.uiMap.height,
  });
  if (!Object.keys(crops).length) return presence;
  return { ...presence, captureCrops: crops };
}

async function submitCommand(
  rawText: string,
  lensContext?: import("../shared/glassLensContext.ts").GlassLensContext | null,
  opts?: {
    /** Force visual capture using live screen (triggers resolveScreenshotForVisualAsk). */
    forceVisual?: boolean;
    /**
     * Inject a pre-captured screenshot data URL directly as the visual payload.
     * When provided, bypasses resolveScreenshotForVisualAsk entirely — no fresh
     * capture is taken. Used by design-to-code so the captured design image is
     * sent, not a screenshot taken after the user clicks an action button.
     */
    presetImageDataUrl?: string;
    /** Thread a file path onto the response card for Apply-to-file wiring. */
    codeFilePath?: string;
    /**
     * When the submission comes from design-to-code (#163-F), records which action
     * was used so the response card can offer the right "Save component" extension.
     */
    designAction?: import("../shared/designToCode.ts").DesignToCodeAction;
    /**
     * The stack setting at generation time — snapshotted so "Save component" uses
     * the correct extension even if the user changes the picker after generation.
     */
    designStack?: import("../shared/designToCode.ts").DesignStack;
    /**
     * Hint for server-side model selection.
     * - "fast"     → lightweight model for background / ambient tasks
     * - "standard" → default-tier model for normal questions
     * - "deep"     → strongest model for complex multi-step reasoning (build errors, codebase analysis)
     * Omit to let the server default (equivalent to "default" modelPurpose).
     */
    taskComplexity?: "fast" | "standard" | "deep";
    /**
     * Id of the design-capture feed item that triggered this generation (#166).
     * Stored on the response card so the renderer can send the correct feedItemId
     * when the user submits a refinement — state.designCaptures is keyed by capture id.
     */
    designCaptureId?: string;
    /** Phase 4a — Companion route from renderer auto-submit. */
    companionRoute?: CompanionRoute;
  },
): Promise<void> {
  // Consume any pending context snapshot (set by glass-context-ask hotkey).
  // Expires after 30 s so a stale snapshot never pollutes a later unrelated ask.
  let contextPrefix = "";
  // Captures the editor file path from the snapshot for "Apply to file" threading.
  let askFilePath: string | null = null;
  if (pendingContextSnapshot && Date.now() - pendingContextSnapshot.capturedAt < 30_000) {
    const parts: string[] = [];
    if (pendingContextSnapshot.appName) {
      parts.push(`Active app: ${pendingContextSnapshot.appName}`);
    }
    if (pendingContextSnapshot.windowTitle) {
      parts.push(`Window: ${pendingContextSnapshot.windowTitle}`);
    }
    if (pendingContextSnapshot.lastCommand) {
      parts.push(`Last command: ${pendingContextSnapshot.lastCommand}`);
    }
    if (pendingContextSnapshot.terminalErrors.length > 0) {
      parts.push(`Terminal errors:\n${pendingContextSnapshot.terminalErrors.join("\n")}`);
    }
    if (pendingContextSnapshot.codeContext) {
      parts.push(formatCodeContext(pendingContextSnapshot.codeContext));
    }
    if (parts.length > 0) {
      contextPrefix = `[Glass context — ${new Date(pendingContextSnapshot.capturedAt).toLocaleTimeString()}]\n${parts.join("\n")}\n\n`;
    }
    // Capture the file path BEFORE nulling — used later to wire "Apply to file".
    askFilePath = pendingContextSnapshot.codeContext?.filePath ?? null;
    pendingContextSnapshot = null; // consume — one-shot
  }

  const text = (contextPrefix + rawText).trim();

  if (state.companionPrivacy?.active) {
    return;
  }

  if (
    state.companionModeActive
    && opts?.companionRoute !== "barge_in"
  ) {
    const prevSpeakerId = companionLastSpeakerId;
    const ambient = detectAmbientConversation(
      text,
      undefined,
      prevSpeakerId,
      companionSpeakerChangeCount,
    );
    const recentConversation = Date.now() - companionLastResponseAt < 30_000;
    if (!ambient.addressedToCompanion && !recentConversation) {
      console.log(
        `[companion] ambient suppress: ${ambient.reason} "${text.slice(0, 60)}"`,
      );
      return;
    }
  }

  // ── /run — execute shell command from command bar ─────────────────────────
  // Detected BEFORE askInFlight guard so it works even during a streaming ask.
  if (text.startsWith("/run ") || text === "/run") {
    const shellCmd = text.slice(5).trim();
    if (shellCmd) {
      const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      // Open Glass terminal panel alongside the output card
      await handleCommand({ type: "glass-terminal-open" });
      // Register shell output entry
      if (!state.shellOutputs) state.shellOutputs = {};
      state.shellOutputs[runId] = {
        id: runId,
        command: shellCmd,
        output: "",
        status: "running",
      };
      // Push a feed handle so Overlay.tsx can render ShellOutputCard
      pushFeed(
        createCommandFeedItem("shell", shellCmd, {
          title: shellCmd,
          shellOutputId: runId,
        }),
      );
      push();
      // Execute via exec (clean bounded stream, not PTY)
      const cancel = runShellCommand(
        shellCmd,
        (chunk) => {
          if (!state.shellOutputs?.[runId]) return;
          state.shellOutputs[runId].output += chunk;
          push();
        },
        (exitCode) => {
          if (!state.shellOutputs?.[runId]) return;
          state.shellOutputs[runId].status = exitCode === 0 ? "done" : "error";
          state.shellOutputs[runId].exitCode = exitCode ?? undefined;
          shellCancels.delete(runId);
          push();
        },
      );
      shellCancels.set(runId, cancel);
    }
    return;
  }
  // ─────────────────────────────────────────────────────────────────────────

  if (!text || state.askInFlight) return;

  // "I'm done" / debrief intents generate a Session Debrief instead of a direct ask.
  if (detectDebriefTrigger(text) && sessionIsLive()) {
    trackCopilotCommand(text);
    pushFeed(createCommandFeedItem("command", text, { prompt: text }));
    await generateCopilotDebrief();
    await persistSessions(sessions);
    push();
    return;
  }

  // Pasted Glass error (from the error card copy button) — answer locally with
  // specific explanation + fix steps, no server round-trip needed.
  const errorFaqAnswer = lookupGlassErrorAnswer(text);
  if (errorFaqAnswer) {
    trackCopilotCommand(text);
    state.lastError = undefined;
    pushFeed(createCommandFeedItem("command", text, { prompt: text }));
    const answer = `**${errorFaqAnswer.title}**\n\n${errorFaqAnswer.body}`;
    state.lastAskResponse = {
      prompt: text,
      answer,
      fullAnswer: answer,
      at: new Date().toISOString(),
      routeUsed: "glass_direct",
    };
    pushFeed(createCommandFeedItem("response", answer, { prompt: text, fullBody: answer }));
    push();
    return;
  }

  const requestGeneration = ++askRequestGeneration;
  askAbortController?.abort();
  askAbortController = new AbortController();
  const signal = askAbortController.signal;

  const windowCtx = getCachedWindowContext();
  const companionMemoryContext = {
    frontApp: windowCtx.appName,
    windowTitle: windowCtx.windowTitle,
  };

  let companionRoute: CompanionRoute | undefined = opts?.companionRoute;
  if (state.companionModeActive && !companionRoute) {
    companionRoute = resolveCompanionRoute(text, state.companionMemory, companionMemoryContext);
  }

  const isCompanionRetarget =
    state.companionModeActive === true && companionRoute === "retarget";
  const isCompanionDirectFollowUp =
    state.companionModeActive === true && companionRoute === "direct_follow_up";
  const isCompanionScriptContinue =
    state.companionModeActive === true && companionRoute === "script_continue";
  const isCompanionBargeIn =
    state.companionModeActive === true && companionRoute === "barge_in";
  const reuseCompanionCapture =
    isCompanionRetarget &&
    canReuseCompanionCapture(state.companionMemory, companionMemoryContext);

  let visualIntent = opts?.forceVisual || shouldCaptureScreenForGlassAsk(text);
  if (state.companionModeActive) {
    if (companionRoute === "full_visual_ask" || isCompanionRetarget) {
      visualIntent = true;
    }
    if (isCompanionDirectFollowUp || isCompanionScriptContinue || isCompanionBargeIn) {
      visualIntent = false;
    }
  }
  // Allow callers to thread a file path directly without a pendingContextSnapshot.
  if (opts?.codeFilePath && !askFilePath) {
    askFilePath = opts.codeFilePath;
  }
  const lensAttached =
    lensContext && (lensContext.url || lensContext.text || lensContext.screenshot)
      ? lensContext
      : null;
  let lensScreenshotPayload: import("../shared/glassAskTypes.ts").GlassAskLatestScreenshot | undefined;
  if (lensAttached?.screenshot) {
    lensScreenshotPayload = {
      imageDataUrl: lensAttached.screenshot,
      sourceTitle: lensAttached.title,
      label: lensAttached.url,
    };
  }
  // Design-to-code: inject a pre-captured image without re-capturing the screen.
  if (opts?.presetImageDataUrl && !lensScreenshotPayload) {
    lensScreenshotPayload = {
      imageDataUrl: opts.presetImageDataUrl,
      sourceTitle: "Design capture",
      label: undefined,
    };
  }
  const wantsVisualCapture = visualIntent && !lensScreenshotPayload && !reuseCompanionCapture;
  clearVisualAskRetentionDismissTimer();
  state.visualAskRetention = null;
  state.askInFlight = true;
  state.askStatus = "pending";
  const preserveCompanionPresence =
    reuseCompanionCapture || isCompanionDirectFollowUp || isCompanionScriptContinue;
  if (!preserveCompanionPresence) {
    state.companionPresence = null;
  }
  companionLocalUiMapForAsk = null;
  state.lastError = undefined;
  state.operationDiagnostics = recordOperation(state.operationDiagnostics, "ask-iivo", "pending");

  const live = sessionIsLive();
  const session = sessions.current();

  trackCopilotCommand(text);
  if (live && session) {
    sessions.addEvent({
      kind: "iivo_command",
      title: text.length > 70 ? `${text.slice(0, 69)}…` : text,
      text,
      ...eventContextFields(),
    });
    await persistSessions(sessions);
  }

  const activeCtx = buildActiveListeningAskContext(text);
  if (shouldShortCircuitThinContext(activeCtx) && !visualIntent) {
    state.askInFlight = false;
    state.askStatus = "done";
    const listenConfig = copilot.getConfig();
    const listenMode =
      deriveActiveListeningMode(listenConfig, sessionIsLive() && copilotModeIsActive(listenConfig.mode)) ===
      "listen";
    const inWarmup =
      listenMode &&
      listenMomentRuntime.listenStartedMs != null &&
      Date.now() - listenMomentRuntime.listenStartedMs < listenConfig.listenWarmupMs;
    const msg = activeListeningMissingContextMessage(activeCtx?.detectedIntent, inWarmup);
    state.lastAskResponse = {
      prompt: text,
      answer: msg,
      fullAnswer: msg,
      at: new Date().toISOString(),
      routeUsed: "glass_direct",
    };
    pushFeed(createCommandFeedItem("response", msg, { prompt: text, fullBody: msg }));
    push();
    return;
  }

  let latestScreenshot: import("../shared/glassScreenContext.ts").GlassAskLatestScreenshot | undefined;
  let visualCaptureWarning: string | undefined;
  let usedVision = false;
  let visualSavedToSession = false;
  let visualCaptureFull: { imageDataUrl: string; width: number; height: number } | null = null;
  let visualAsk413Retried = false;

  if (wantsVisualCapture) {
    state.visualAskPayloadDiagnostics = null;
    state.visualAskDiagnostics = null;

    const captureTarget = resolveCaptureDisplay(state.glassSettings.displayTarget);
    if (process.env.IIVO_GLASS_E2E === "1") {
      void refreshWindowContext();
    } else {
      await refreshWindowContext();
    }
    const preflight = await runVisualAskPreflight({
      config,
      prompt: text,
      displayId: captureTarget.id,
      displayLabel: captureTarget.label,
      hasConnectedDisplays: getConnectedDisplays().length > 0,
      windowBoundsAvailable: !!getCachedWindowContext().windowBounds,
      skipCaptureProbe:
        process.env.IIVO_GLASS_E2E === "1" && process.env.IIVO_GLASS_E2E_CAPTURE_FAIL !== "1",
      signal,
    });

    if (!preflight.ok) {
      if (preflight.code === "capture_permission" && preflight.screenProbe) {
        state.screenCaptureProbe = preflight.screenProbe.status;
        state.screenCaptureDetail = preflight.message;
      }
      state.askInFlight = false;
      state.askStatus = "error";
      state.visualAskPhase = "idle";
      const userMessage =
        preflight.code === "capture_permission" && state.duplicateAppWarning
          ? `${preflight.message} ${state.duplicateAppWarning}`
          : preflight.message;
      mergeVisualAskDiagnostics({
        phase: "idle",
        displayLabel: captureTarget.label,
        displayId: captureTarget.id,
        serverResult: preflightCodeToServerResult(preflight.code),
        lastPreflightIssue: preflight.message,
        userMessage,
        ...visualAskProbeDiagnostics(preflight.screenProbe),
      });
      pushFeed(createCommandFeedItem("error", userMessage, { prompt: text }));
      state.lastError = userMessage;
      state.operationDiagnostics = recordOperation(
        state.operationDiagnostics,
        "ask-iivo",
        "error",
        preflight.code,
      );
      push();
      return;
    }

    state.screenCaptureProbe = preflight.screenProbe.status;
    state.screenCaptureDetail = undefined;
    const visualAskScreenProbe = preflight.screenProbe;

    const qualityPreset = chooseVisualQualityPreset(text);
    mergeVisualAskDiagnostics({
      phase: "looking",
      displayLabel: captureTarget.label,
      displayId: captureTarget.id,
      qualityPreset,
      userMessage: [
        visualAskUserMessageForFrame("screen", captureTarget.label),
        qualityPreset === "text" ? "Using text clarity mode." : undefined,
      ]
        .filter(Boolean)
        .join(" "),
      ...visualAskProbeDiagnostics(visualAskScreenProbe),
    });

    state.visualAskPhase = "looking";
    lookingStartedAtMs = Date.now();
    pushFeed(
      createCommandFeedItem("looking", "IIVO is looking at your screen…", {
        title: "IIVO is looking",
        prompt: text,
      }),
    );
    push();

    const captureOutcome = await resolveScreenshotForVisualAsk({
      config,
      glassSettings: state.glassSettings,
      sessions,
      sessionIsLive,
      latestScreenshot: state.latestScreenshot,
      pendingCaptureDataUrl: state.pendingCaptureDataUrl,
      resolveCaptureTarget: () => resolveCaptureDisplay(state.glassSettings.displayTarget),
      eventContextFields,
      prompt: text,
      onOptimizing: () => {
        state.visualAskPhase = "optimizing";
        removeLookingFeedItems();
        pushFeed(
          createCommandFeedItem("looking", "Optimizing screen image…", {
            title: "IIVO",
            prompt: text,
          }),
        );
        push();
      },
    });

    state.visualAskPhase = "idle";

    if (requestGeneration !== askRequestGeneration || signal.aborted) return;

    if (!captureOutcome.ok) {
      removeLookingFeedItems();
      state.askInFlight = false;
      state.askStatus = "error";
      const captureError =
        visualAskScreenProbe.ready
          ? DUPLICATE_APP_CAPTURE_FAILURE_MESSAGE
          : captureOutcome.error;
      if (!visualAskScreenProbe.ready) {
        state.screenCaptureProbe = mapCaptureErrorToScreenCaptureStatus(captureOutcome.error);
        state.screenCaptureDetail = captureOutcome.error;
      }
      mergeVisualAskDiagnostics({
        phase: "idle",
        serverResult: visualAskScreenProbe.ready ? "error" : "capture_permission",
        userMessage: captureError,
        ...visualAskProbeDiagnostics(visualAskScreenProbe),
      });
      pushFeed(createCommandFeedItem("error", captureError, { prompt: text }));
      state.lastError = captureError;
      state.operationDiagnostics = recordOperation(
        state.operationDiagnostics,
        "ask-iivo",
        "error",
        "capture_failed",
      );
      refreshSetupCapabilities();
      push();
      return;
    }

    state.latestScreenshot = captureOutcome.latestState;
    latestScreenshot = captureOutcome.payload;
    visualCaptureWarning = captureOutcome.warning;
    usedVision = true;
    state.visualAskPayloadDiagnostics = captureOutcome.payloadDiagnostics ?? null;
    if (captureOutcome.payloadDiagnostics) {
      const statusMessages = buildVisualAskStatusMessages(
        captureOutcome.latestState.displayLabel ?? captureTarget.label,
        captureOutcome.payloadDiagnostics,
      );
      mergeVisualAskDiagnostics(
        visualDiagnosticsFromPayload(captureOutcome.payloadDiagnostics, {
          displayLabel: captureOutcome.latestState.displayLabel ?? captureTarget.label,
          displayId: captureOutcome.latestState.displayId ?? captureTarget.id,
          retentionResult: captureOutcome.savedToSession ? "saved_to_session" : "not_saved",
          userMessage: statusMessages.join(" "),
        }),
      );
      if (statusMessages.length) {
        state.lastNotice = statusMessages[statusMessages.length - 1];
      }
    }
    visualCaptureFull = {
      imageDataUrl: captureOutcome.imageDataUrl,
      width: captureOutcome.captureWidth,
      height: captureOutcome.captureHeight,
    };

    if (state.companionModeActive) {
      const display = getConnectedDisplays().find(
        (d) => d.id === (captureOutcome.latestState.displayId ?? captureTarget.id),
      );
      const ctx = getCachedWindowContext();
      companionLocalUiMapForAsk = await buildCompanionLocalUiMap({
        captureId:
          captureOutcome.payload.eventId ??
          captureOutcome.payload.contextId ??
          `capture-${Date.now()}`,
        captureWidth: captureOutcome.captureWidth,
        captureHeight: captureOutcome.captureHeight,
        displayOrigin: display
          ? { x: display.bounds.x, y: display.bounds.y }
          : undefined,
      });
      if (
        captureOutcome.imageDataUrl &&
        shouldTryOmniParser(companionLocalUiMapForAsk?.marks.length ?? 0, ctx.appName)
      ) {
        const omniMarks = await tryOmniParserMarks({
          imageDataUrl: captureOutcome.imageDataUrl,
          captureWidth: captureOutcome.captureWidth,
          captureHeight: captureOutcome.captureHeight,
        });
        if (omniMarks.length && companionLocalUiMapForAsk) {
          companionLocalUiMapForAsk = {
            ...companionLocalUiMapForAsk,
            marks: [...companionLocalUiMapForAsk.marks, ...omniMarks].slice(0, 48),
          };
        } else if (omniMarks.length) {
          companionLocalUiMapForAsk = {
            captureId:
              captureOutcome.payload.eventId ??
              captureOutcome.payload.contextId ??
              `capture-${Date.now()}`,
            width: captureOutcome.captureWidth,
            height: captureOutcome.captureHeight,
            marks: omniMarks.slice(0, 48),
          };
        }
      }
    }

    visualSavedToSession = captureOutcome.savedToSession;
    if (captureOutcome.savedToSession) {
      state.pendingCaptureDataUrl = captureOutcome.imageDataUrl;
      if (live && sessionIsLive()) {
        await persistSessions(sessions);
      }
    } else {
      setEphemeralVisualCapture({
        imageDataUrl: captureOutcome.imageDataUrl,
        displayLabel: captureOutcome.latestState.displayLabel,
        displayId: captureOutcome.latestState.displayId,
        sourceTitle: captureOutcome.latestState.sourceTitle,
        sessionId: captureOutcome.latestState.sessionId,
        eventId: captureOutcome.eventId,
      });
    }
  }

  if (visualIntent) {
    if (lookingStartedAtMs != null) {
      await waitForMinLookingDuration(lookingStartedAtMs);
      lookingStartedAtMs = null;
    }
    removeLookingFeedItems();
  }
  if (visualIntent || lensScreenshotPayload) {
    state.visualAskPhase = "analyzing";
    push();
  }

  thinkingStartedAtMs = Date.now();
  const interruptLabel = listenInterruptStatusLabel(activeCtx);
  const thinkingLabel =
    interruptLabel ??
    (visualIntent || lensScreenshotPayload ? "Analyzing screen…" : "IIVO is thinking…");
  pushFeed(
    createCommandFeedItem(
      "thinking",
      thinkingLabel,
      { prompt: text },
    ),
  );
  push();

  const userContext = resolveGlassAskUserContext();
  // Append built-in terminal context if available (Task #41) — additive: when
  // no terminal context exists, enrichedUserContext === userContext exactly.
  const termCtx = getTerminalContextString();
  const enrichedUserContext = termCtx
    ? [userContext, termCtx].filter(Boolean).join("\n\n")
    : userContext;
  const companionDepthAsk =
    state.companionModeActive === true && companionPrefersResponsePanel(text);
  const askRequest = {
    prompt: text,
    session: buildGlassAskSessionPayload(text),
    latestScreenshot: latestScreenshot ?? lensScreenshotPayload,
    lensContext: lensAttached ?? undefined,
    visualIntent: visualIntent || Boolean(lensScreenshotPayload) || undefined,
    responseStyle: companionDepthAsk ? ("full" as const) : ("overlay" as const),
    modelPurpose: (opts?.taskComplexity === "deep" ? "diagnostic" : "default") as import("../shared/glassAskTypes.ts").GlassAskRequest["modelPurpose"],
    companionMode: state.companionModeActive || undefined,
    companionUiMap: companionLocalUiMapForAsk ?? undefined,
    companionRoute,
    companionMemory: state.companionMemory
      ? companionMemoryForAsk(state.companionMemory)
      : undefined,
    ...(enrichedUserContext ? { userContext: enrichedUserContext } : {}),
  };

  // Use streaming for pure-text asks (no screenshot/vision); fall back to
  // single-shot for visual asks (image already captured, no benefit to stream).
  const runGlassAsk = async (): Promise<import("../shared/glassAskTypes.ts").GlassAskResponse> => {
    if (visualIntent || Boolean(lensScreenshotPayload)) {
      return askIivoGlass(config, askRequest, signal);
    }
    return askIivoGlassStream(
      config,
      askRequest,
      (partial) => {
        if (requestGeneration !== askRequestGeneration) return;
        state.partialAnswer = partial;
        state.askStatus = "streaming";
        push();
      },
      signal,
    );
  };

  const withAskTimeout = <T>(promise: Promise<T>): Promise<T> =>
    Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        setTimeout(() => reject(new Error(VOICE_ASK_STATUS.timeout)), GLASS_ASK_TIMEOUT_MS);
      }),
    ]);

  try {
    let result = await withAskTimeout(runGlassAsk());

    if (requestGeneration !== askRequestGeneration) return;

    if (thinkingStartedAtMs != null) {
      await waitForMinThinkingDuration(thinkingStartedAtMs);
      thinkingStartedAtMs = null;
    }
    if (requestGeneration !== askRequestGeneration) return;

    removeThinkingFeedItems();
    state.askStatus = "done";
    state.partialAnswer = undefined;
    const overlayAnswer = result.shortAnswer ?? result.answer;
    const fullAnswer = result.answer;
    trackCopilotResponse(fullAnswer);
    state.lastAskResponse = {
      prompt: text,
      answer: overlayAnswer,
      fullAnswer,
      shortAnswer: result.shortAnswer,
      runId: result.runId,
      contextId: result.contextId,
      at: new Date().toISOString(),
      routeUsed: result.routeUsed,
      model: result.model,
    };
    if (
      state.companionModeActive &&
      (companionDepthAsk || isSubstantialResponse(fullAnswer))
    ) {
      state.responsePanelRevealSeq = (state.responsePanelRevealSeq ?? 0) + 1;
    }
    const localUiMapForMerge =
      companionLocalUiMapForAsk ?? state.companionMemory?.lastUiMap ?? undefined;
    const mergedPresence = mergeCompanionGuidance(
      localUiMapForMerge,
      result.companionGuidance ?? null,
    );
    const cropImage =
      visualCaptureFull?.imageDataUrl ??
      latestScreenshot?.imageDataUrl ??
      state.companionMemory?.lastCaptureImageDataUrl;
    const withCrops = attachCaptureCropsToPresence(mergedPresence, cropImage);
    state.companionPresence =
      withCrops ?? (preserveCompanionPresence ? state.companionPresence : null);
    if (state.companionPresence) {
      startCompanionAnchorWatch();
    } else {
      stopCompanionAnchorWatch();
    }
    if (state.companionModeActive && state.companionPresence) {
      state.companionMemory = updateCompanionSessionMemory(state.companionMemory, {
        prompt: text,
        presence: state.companionPresence,
        frontApp: windowCtx.appName,
        windowTitle: windowCtx.windowTitle,
        screenshot: latestScreenshot ?? lensScreenshotPayload,
        imageDataUrl: visualCaptureFull?.imageDataUrl,
      });
    } else if (
      state.companionModeActive &&
      state.companionMemory &&
      (isCompanionDirectFollowUp || isCompanionScriptContinue)
    ) {
      state.companionMemory = { ...state.companionMemory, lastPrompt: text };
    }
    if (state.companionModeActive) {
      companionLastResponseAt = Date.now();
    }
    companionLocalUiMapForAsk = null;

    const responseWarnings = [
      ...(visualCaptureWarning ? [visualCaptureWarning] : []),
      ...(result.warnings ?? []),
    ];
    pushFeed(
      createCommandFeedItem("response", overlayAnswer, {
        prompt: text,
        fullBody: fullAnswer,
        runId: result.runId,
        contextId: result.contextId,
        codeFilePath: askFilePath ?? undefined,
        designAction: opts?.designAction,
        designStack: opts?.designStack,
        designCaptureId: opts?.designCaptureId,
      }),
    );
    // Persist Q&A pair to durable cross-session memory (fire-and-forget)
    void saveMemoryEntry({
      prompt: text,
      answer: fullAnswer,
      app: getCachedWindowContext().appName ?? undefined,
      url: state.mediaContext?.url ?? undefined,
      runId: result.runId,
    }).catch(() => {
      /* never interrupt the UI flow */
    });
    if (visualIntent && usedVision) {
      state.visualAskRetention = buildVisualAskRetentionStatus({
        usedForAnswer: true,
        savedToSession: visualSavedToSession,
        uploadedToContext: false,
      });
      scheduleVisualAskRetentionDismiss();

      if (shouldDiscardEphemeralAfterAsk(state.glassSettings, !!live, visualSavedToSession)) {
        state.pendingCaptureDataUrl = undefined;
      }
    }

    if (responseWarnings.length) {
      state.lastNotice = responseWarnings[0];
    } else if (state.visualAskRetention?.detail) {
      state.lastNotice = `${state.visualAskRetention.label} · ${state.visualAskRetention.detail}`;
    }

    if (live && session) {
      sessions.addEvent({
        kind: "iivo_response",
        title: "IIVO response",
        text: fullAnswer,
        importance: "high",
        ...eventContextFields(),
        metadata: {
          routeUsed: result.routeUsed,
          model: result.model,
          usedVision: usedVision || result.usedVision === true,
          ...(latestScreenshot?.eventId
            ? {
                usedScreenshotEventId: latestScreenshot.eventId,
                usedScreenshotCapturedAt: latestScreenshot.capturedAt,
              }
            : {}),
          ...(latestScreenshot?.displayId != null
            ? { displayId: latestScreenshot.displayId }
            : {}),
        },
      });
      await persistSessions(sessions);
    }

    if (!state.lastNotice || state.lastNotice.startsWith("IIVO answered")) {
      state.lastNotice = live
        ? "IIVO answered inline. Saved to session."
        : visualIntent && state.visualAskRetention
          ? `${state.visualAskRetention.label} · ${state.visualAskRetention.detail ?? "Not saved"}`
          : "IIVO answered inline. Start a session to save this context.";
    }
    state.operationDiagnostics = recordOperation(state.operationDiagnostics, "ask-iivo", "ok");
    if (visualIntent) copilotVisualAskFailures = 0;
    if (visualIntent && state.visualAskPayloadDiagnostics) {
      mergeVisualAskDiagnostics({
        phase: "idle",
        serverResult: "success",
        retentionResult: visualSavedToSession ? "saved_to_session" : "not_saved",
      });
    }
    state.visualAskPhase = "idle";
    await recordGlassContextAfterResponse(text);
  } catch (err) {
    if (requestGeneration !== askRequestGeneration || signal.aborted || err instanceof GlassAskCancelledError) {
      return;
    }

    if (visualIntent) copilotVisualAskFailures += 1;

    if (
      visualIntent &&
      !visualAsk413Retried &&
      visualCaptureFull &&
      latestScreenshot &&
      isGlassAskPayloadTooLargeError(err)
    ) {
      visualAsk413Retried = true;
      state.lastNotice = GLASS_VISUAL_PAYLOAD_RETRY_MESSAGE;
      state.visualAskPhase = "optimizing";
      push();

      const captureTarget = resolveCaptureDisplay(state.glassSettings.displayTarget);
      const aggressive = optimizeVisualAskImage(
        visualCaptureFull.imageDataUrl,
        { width: visualCaptureFull.width, height: visualCaptureFull.height },
        {
          preset: "aggressive",
          prompt: text,
          retry: true,
          displayId: captureTarget.id,
          windowBounds: getCachedWindowContext().windowBounds,
        },
      );
      latestScreenshot = applyOptimizedToPayload(latestScreenshot, aggressive);
      const retryDiag: VisualAskPayloadDiagnostics = {
        originalWidth: aggressive.originalWidth,
        originalHeight: aggressive.originalHeight,
        originalSizeBytes: aggressive.originalSizeBytes,
        optimizedWidth: aggressive.optimizedWidth,
        optimizedHeight: aggressive.optimizedHeight,
        optimizedSizeBytes: aggressive.optimizedSizeBytes,
        optimizedMimeType: aggressive.mimeType,
        compressionApplied: aggressive.compressionApplied,
        status: "retry",
        visualFrameMode: aggressive.visualFrameMode,
        cropBounds: aggressive.cropBounds,
        qualityPreset: aggressive.qualityPreset,
      };
      state.visualAskPayloadDiagnostics = retryDiag;
      mergeVisualAskDiagnostics(
        visualDiagnosticsFromPayload(retryDiag, {
          retryUsed: true,
          serverResult: "idle",
          userMessage: `${GLASS_VISUAL_PAYLOAD_RETRY_MESSAGE} Optimized screen image to ${formatBytesShort(aggressive.optimizedSizeBytes)}.`,
        }),
      );
      state.visualAskPhase = "analyzing";
      push();

      try {
        const retryResult = await runGlassAsk();
        if (requestGeneration !== askRequestGeneration) return;

        if (thinkingStartedAtMs != null) {
          await waitForMinThinkingDuration(thinkingStartedAtMs);
          thinkingStartedAtMs = null;
        }
        removeThinkingFeedItems();
        state.askStatus = "done";
        const overlayAnswer = retryResult.shortAnswer ?? retryResult.answer;
        state.lastAskResponse = {
          prompt: text,
          answer: overlayAnswer,
          fullAnswer: retryResult.answer,
          shortAnswer: retryResult.shortAnswer,
          runId: retryResult.runId,
          contextId: retryResult.contextId,
          at: new Date().toISOString(),
          routeUsed: retryResult.routeUsed,
          model: retryResult.model,
        };
        state.companionPresence = mergeCompanionGuidance(
          companionLocalUiMapForAsk,
          retryResult.companionGuidance ?? null,
        );
        if (state.companionModeActive && state.companionPresence) {
          const retryCtx = getCachedWindowContext();
          state.companionMemory = updateCompanionSessionMemory(state.companionMemory, {
            prompt: text,
            presence: state.companionPresence,
            frontApp: retryCtx.appName,
            windowTitle: retryCtx.windowTitle,
            screenshot: latestScreenshot ?? lensScreenshotPayload,
            imageDataUrl: visualCaptureFull?.imageDataUrl,
          });
        }
        companionLocalUiMapForAsk = null;
        pushFeed(
          createCommandFeedItem("response", overlayAnswer, {
            prompt: text,
            fullBody: retryResult.answer,
            runId: retryResult.runId,
            contextId: retryResult.contextId,
          }),
        );
        // Persist retry Q&A pair to durable cross-session memory (fire-and-forget)
        void saveMemoryEntry({
          prompt: text,
          answer: retryResult.answer,
          app: getCachedWindowContext().appName ?? undefined,
          url: state.mediaContext?.url ?? undefined,
          runId: retryResult.runId,
        }).catch(() => {
          /* never interrupt the UI flow */
        });
        if (usedVision) {
          state.visualAskRetention = buildVisualAskRetentionStatus({
            usedForAnswer: true,
            savedToSession: visualSavedToSession,
            uploadedToContext: false,
          });
        }
        state.visualAskPhase = "idle";
        mergeVisualAskDiagnostics({ serverResult: "success", phase: "idle" });
        state.operationDiagnostics = recordOperation(state.operationDiagnostics, "ask-iivo", "ok");
        await recordGlassContextAfterResponse(text);
        push();
        return;
      } catch (retryErr) {
        if (requestGeneration !== askRequestGeneration || signal.aborted || retryErr instanceof GlassAskCancelledError) {
          return;
        }
        err = retryErr;
      }
    }

    removePendingAskFeedItems();
    const rawMessage = err instanceof Error ? err.message : "Could not reach IIVO server.";
    const message = isGlassAskPayloadTooLargeError(err)
      ? GLASS_VISUAL_PAYLOAD_TOO_LARGE_MESSAGE
      : rawMessage;
    state.visualAskPayloadDiagnostics = state.visualAskPayloadDiagnostics
      ? { ...state.visualAskPayloadDiagnostics, status: "failed" }
      : null;
    const serverResult = isGlassAskPayloadTooLargeError(err)
      ? "413"
      : /vision|not enabled|not configured/i.test(rawMessage)
        ? "vision_unavailable"
        : /fetch|network|econnrefused|unavailable/i.test(rawMessage)
          ? "network_error"
          : "error";
    mergeVisualAskDiagnostics({
      phase: "idle",
      serverResult,
      userMessage: message,
    });
    state.visualAskPhase = "idle";
    state.askStatus = "error";
    state.partialAnswer = undefined;
    pushFeed(
      createCommandFeedItem("error", `${message} Use Open in IIVO to continue in the browser.`, {
        prompt: text,
      }),
    );
    state.lastError = message;
    state.operationDiagnostics = recordOperation(state.operationDiagnostics, "ask-iivo", "error", message);
  } finally {
    if (requestGeneration === askRequestGeneration) {
      state.askInFlight = false;
      state.visualAskPhase = "idle";
      askAbortController = null;
      if (state.askStatus === "pending") state.askStatus = "idle";
      push();
    }
  }
}

/** Fetch TTS audio — prefers IIVO server /api/tts (same path as speak.ts), then direct ElevenLabs. */
async function fetchGlassTtsBuffer(text: string): Promise<Buffer | null> {
  const payload = text.trim().slice(0, 2000);
  if (!payload) return null;

  const locale = parseUiLocale(state.glassSettings?.uiLocale);
  const { voiceId, model } = glassElevenLabsConfig(locale);
  try {
    const serverRes = await fetch(`${config.iivoApiUrl}/api/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: payload, voiceId, model }),
    });
    if (serverRes.ok) {
      console.log(`[Glass TTS] server /api/tts ok voice=${voiceId} model=${model}`);
      return Buffer.from(await serverRes.arrayBuffer());
    }
    console.warn("[Glass TTS] /api/tts failed", serverRes.status);
  } catch (err) {
    console.warn("[Glass TTS] server unreachable, trying direct ElevenLabs", err);
  }

  const direct = await fetchElevenLabsTtsBuffer(payload, locale);
  if (direct) return direct;

  console.warn("[Glass TTS] no audio — set ELEVENLABS_API_KEY in .env or run IIVO server with TTS");
  return null;
}

/** Timed TTS for Companion — ElevenLabs character alignment when available. */
async function fetchGlassTtsTimedBuffer(text: string): Promise<TimedTtsPayload | null> {
  const payload = text.trim().slice(0, 2000);
  if (!payload) return null;

  const locale = parseUiLocale(state.glassSettings?.uiLocale);
  const timed = await fetchElevenLabsTtsWithTimestamps(payload, locale);
  if (timed) {
    return {
      id: Date.now().toString(),
      data: timed.audio.toString("base64"),
      alignment: timed.alignment ?? undefined,
    };
  }

  const fallback = await fetchGlassTtsBuffer(payload);
  if (!fallback) return null;
  return { id: Date.now().toString(), data: fallback.toString("base64") };
}

async function handleCommand(
  command: GlassCommand,
  sender?: WebContents,
): Promise<void> {
  // Leave a breadcrumb so any crash arriving at Sentry shows the last command dispatched.
  // Only record the command type — never the full payload (could contain user text or paths).
  Sentry.addBreadcrumb({
    category: "ipc",
    message: `command: ${(command as { type?: string }).type ?? "unknown"}`,
    level: "info",
  });
  switch (command.type) {
    case "capture-screen":
    case "capture-screen-only":
      await handleCapture();
      if (command.type === "capture-screen-only" && !sessionIsLive() && !state.lastError) {
        state.lastNotice = CAPTURE_NO_SESSION_HINT;
        push();
      }
      return;
    case "request-start-listening": {
      logGlassClickDebug("request-start-listening", {
        transcriptionMode: state.transcriptionMode,
        translateActive: isTranslateActive(),
      });
      const session = sessions.current();
      if (session?.status === "paused") {
        sessions.resumeSession();
      }
      const listenCapture = shouldRunListenNotesPipeline();
      if (listenCapture && state.transcriptionMode !== "system_audio") {
        state.transcriptionMode = "system_audio";
      }
      state.operationDiagnostics = recordOperation(state.operationDiagnostics, "request-start-listening", "pending");
      push();
      beginListenCapture(listenCapture ? "system_audio" : undefined);
      return;
    }
    case "activate-listen-mode":
      logGlassClickDebug("activate-listen-mode", {
        transcriptionMode: state.transcriptionMode,
        translateActive: isTranslateActive(),
      });
      activateListenMode();
      return;
    case "start-listening":
      logGlassClickDebug("start-listening", {
        transcriptionMode: state.transcriptionMode,
        translateActive: isTranslateActive(),
        privacyListening: state.privacy.listening,
      });
      console.log(
        `[Glass Listen] start-listening mode=${state.transcriptionMode} ` +
          `virtualDevice=${state.selectedVirtualAudioDeviceId ?? "none"}`,
      );
      dispatchPrivacy({ type: "START_LISTENING", at: new Date().toISOString() });
      state.stt = { ...state.stt, listeningElapsedMs: 0, lastError: undefined };
      bootstrapListenNotesPipeline();
      resetListeningLimitTracking();
      state.operationDiagnostics = diagnosticsForListening(
        recordOperation(state.operationDiagnostics, "start-listening", "ok"),
        state.transcriptionMode,
        state.stt,
      );
      maybeOfferCopilotForSystemAudio();
      push();
      return;
    case "pause":
      logGlassClickDebug("pause / stop-listening", {
        transcriptionMode: state.transcriptionMode,
        translateActive: isTranslateActive(),
      });
      cancelListenCountdown();
      broadcastTranscriptionControl({ type: "stop" });
      dispatchPrivacy({ type: "PAUSE", at: new Date().toISOString() });
      copilot.dismissSilenceWarning();
      state.stt = { ...state.stt, listeningElapsedMs: 0 };
      resetListeningLimitTracking();
      state.operationDiagnostics = recordOperation(state.operationDiagnostics, "pause", "ok");
      if (command.reason !== "user") {
        state.lastNotice = MIC_PAUSED_AUTO_MESSAGE;
      }
      push();
      return;
    case "stop":
    case "stop-everything": {
      cancelListenCountdown();
      cancelGlassAsk();
      state.visualAskPhase = "idle";
      const stopped = stopAllActiveCaptureAndListening({
        privacy: state.privacy,
        stt: state.stt,
        diagnostics: state.operationDiagnostics,
        transcriptionMode: state.transcriptionMode,
      });
      state.privacy = stopped.privacy;
      state.stt = stopped.stt;
      state.operationDiagnostics = stopped.diagnostics;
      state.lastNotice = undefined;
      state.lastError = stopped.lastError;
      copilot.dismissSilenceWarning();
      stopCopilotLoop();
      stopListenNotesLoop();
      stopMeetingIntelLoop();
      resetListeningLimitTracking();
      systemAudioLastSignalMs = undefined;
      activeListeningRuntime = clearActiveListeningRuntime();
      listenMomentRuntime = clearListenModeRuntime();
      listenLastChunkMs = undefined;
      listenRollingTranscript = initialListenRollingTranscript();
      listenAiNotes = [];
      lastAiNotesRefreshMs = undefined;
      listenSpeakerNames = {};
      lastAiTranscriptLen = 0;
      state.mediaContext = null;
      stopListenDeepgramSession();
      liveTranslateRuntime = stopLiveTranslate(liveTranslateRuntime);
      setOverlayPinnedForTranslate(false);
      copilot.setDebrief(null);
      const endingSession = sessions.current();
      if (
        endingSession &&
        (endingSession.status === "active" || endingSession.status === "paused")
      ) {
        sessions.endSession();
      }
      setListenNotesPadVisible(false);
      state.companionModeActive = false;
      state.companionPresence = null;
      state.companionMemory = clearCompanionSessionMemory();
      state.companionWarmupPhase = "none";
      clearCompanionPrivacyState();
      resetCompanionAmbientState();
      stopCompanionDeepgramSession();
      stopCompanionAnchorWatch();
      push();
      return;
    }
    case "hide-notes-pad":
      setListenNotesPadVisible(false);
      push();
      return;
    case "translate-set-config": {
      liveTranslateRuntime = updateLiveTranslateConfig(liveTranslateRuntime, command.patch);
      if (command.patch.enabled !== false) {
        armTranslateGracePeriod();
        clearTranslateStartupErrors();
      }
      push();
      return;
    }
    case "open-translate-setup": {
      if (!isPanelVisible()) togglePanel();
      state.panelTab = "copilot";
      state.translateSetupRequestId += 1;
      push();
      return;
    }
    case "translate-start": {
      logGlassClickDebug("translate-start", {
        targetLanguage: command.targetLanguage ?? liveTranslateRuntime.config.targetLanguage,
        transcriptionMode: state.transcriptionMode,
        privacyListening: state.privacy.listening,
      });
      // Guard: key check BEFORE starting the session so no overlay/caption appears on failure.
      const dgKey = process.env.DEEPGRAM_API_KEY?.trim();
      if (!dgKey) {
        state.lastError = "DEEPGRAM_API_KEY is not set — add it to desktop-glass/.env and restart.";
        push();
        return;
      }
      armTranslateGracePeriod();
      clearTranslateStartupErrors();
      liveTranslateRuntime = startLiveTranslate(liveTranslateRuntime, {
        targetLanguage: command.targetLanguage ?? liveTranslateRuntime.config.targetLanguage,
      });
      setOverlayPinnedForTranslate(true);
      state.lastNotice = undefined;
      {
        stopDeepgramSession();
        const srcLang = liveTranslateRuntime.config.sourceLanguage ?? "auto";
        // Factory so every retry and every reconnect gets a fresh closure sharing
        // the same dgKey / srcLang, and `onClose` can reference `makeTranslateCallbacks`.
        const makeTranslateCallbacks = () => ({
          onTranscript: ({ text, isFinal, sentenceId }: { text: string; isFinal: boolean; sentenceId?: string }) => {
            if (!isFinal) {
              // Always show interim as a live caption preview. For translation mode this
              // shows the speaker's original words in near-real-time, keeping the display
              // responsive. The translated final will overwrite when speech_final fires.
              pushInterimCaptionPreview(text);
              return;
            }
            // Final: translate and append to the current sentence line in the display.
            void ingestTranslateChunk(text, { tags: ["system_audio"], sentenceId });
          },
          onError: (err: Error) => {
            console.error("[deepgram] error:", err.message);
            if (isTranslateActive()) {
              state.lastError = `Translate audio error: ${err.message}`;
              push();
            }
          },
          onClose: () => {
            if (!isTranslateActive()) return;
            console.warn("[deepgram] translate WS closed unexpectedly — reconnecting in 1s…");
            setTimeout(() => {
              if (!isTranslateActive()) return;
              deepgramSession = new DeepgramStreamingSession(dgKey, srcLang, makeTranslateCallbacks());
              deepgramSession.connect().catch((reconnErr: unknown) => {
                console.error("[deepgram] post-drop reconnect failed:", (reconnErr as Error).message);
                deepgramSession = null;
              });
            }, 1_000);
          },
        });
        deepgramSession = new DeepgramStreamingSession(dgKey, srcLang, makeTranslateCallbacks());
        const attemptDeepgramConnect = (attemptsLeft: number) => {
          deepgramSession?.connect().catch((err: unknown) => {
            const msg = (err as Error).message ?? String(err);
            console.error(`[deepgram] connect failed (${attemptsLeft} retries left):`, msg);
            if (attemptsLeft > 0 && isTranslateActive()) {
              console.log("[deepgram] retrying in 1.5s…");
              setTimeout(() => {
                if (!isTranslateActive()) return;
                deepgramSession = new DeepgramStreamingSession(dgKey, srcLang, makeTranslateCallbacks());
                attemptDeepgramConnect(attemptsLeft - 1);
              }, 1500);
            } else {
              deepgramSession = null;
              if (isTranslateActive()) {
                state.lastError = `Deepgram connection failed: ${msg}`;
                push();
              }
            }
          });
        };
        attemptDeepgramConnect(2);
      }
      push();
      return;
    }
    case "translate-stop": {
      logGlassClickDebug("translate-stop", {
        transcriptionMode: state.transcriptionMode,
        privacyListening: state.privacy.listening,
      });
      clearTranslateGracePeriod();
      stopDeepgramSession();
      liveTranslateRuntime = stopLiveTranslate(liveTranslateRuntime);
      setOverlayPinnedForTranslate(false);
      state.lastNotice = undefined;
      stopTranslateListening();
      push();
      return;
    }
    case "translate-set-captions-visible": {
      liveTranslateRuntime = {
        ...liveTranslateRuntime,
        captionsVisible: command.visible,
      };
      push();
      return;
    }
    case "translate-enable-microphone": {
      liveTranslateRuntime = {
        ...liveTranslateRuntime,
        micExplicitlyEnabled: command.enabled,
        config: {
          ...liveTranslateRuntime.config,
          source: command.enabled ? "microphone" : liveTranslateRuntime.config.source,
        },
      };
      if (command.enabled) {
        state.lastNotice = "Microphone translation active.";
      }
      push();
      return;
    }
    case "append-transcript": {
      const chunk = command.text.trim();
      if (!chunk) return;
      state.transcript = appendTranscriptDeduped(state.transcript, chunk);
      state.transcript = pruneRunningTranscript(state.transcript);
      push();
      return;
    }
    case "add-transcript-chunk": {
      const chunk = command.text.trim();
      if (!chunk) return;
      const source = transcriptSourceFromTags(command.tags);
      const isInterim = command.interim === true;

      if (extractBuildModeActive && command.tags?.includes("system_audio") && !isInterim) {
        feedExtractModeTranscriptChunk(chunk);
      }

      const session = sessions.current();
      const recentEvents = (session?.events ?? []).filter((e) => e.kind === "transcript_note").slice(-40);
      if (!isInterim && isDuplicateTranscriptChunk(chunk, source, recentEvents)) {
        if (command.tags?.includes("system_audio") && isListenModeActive()) {
          void processListenModeChunk(chunk, command.tags, { interim: false });
        }
        push();
        return;
      }
      if (command.tags?.includes("system_audio")) {
        systemAudioLastSignalMs = Date.now();
      }
      if (!isInterim) {
        state.transcript = appendTranscriptDeduped(state.transcript, chunk);
        state.transcript = pruneRunningTranscript(state.transcript);
      }
      if (isInterim && isListenModeActive() && command.tags?.includes("system_audio")) {
        void processListenModeChunk(chunk, command.tags, { interim: true });
        push();
        return;
      }
      if (isInterim && isTranslateActive()) {
        void ingestTranslateChunk(chunk, { interim: true, tags: command.tags });
        push();
        return;
      }
      if (sessionIsLive() && sessions.current()?.status === "active" && shouldSaveTranscriptToSession()) {
        const ctxFields = eventContextFields();
        sessions.addEvent({
          kind: "transcript_note",
          title: chunk.length > 70 ? `${chunk.slice(0, 69)}…` : chunk,
          text: chunk,
          tags: command.tags,
          ...ctxFields,
        });
        await pruneCurrentSessionEvents();
        await persistSessions(sessions);
      } else if (!sessionIsLive() && !isTranslateActive()) {
        state.lastNotice = "Transcript saved. Start a session to keep chunks in the timeline.";
      }
      maybeShowActiveListeningProactive(chunk, command.tags);
      void ingestTranslateChunk(chunk, { interim: isInterim, tags: command.tags });
      push();
      return;
    }
    case "transcription-set-mode":
      state.transcriptionMode = command.mode;
      push();
      return;
    case "system-audio-set-status":
      state.systemAudioStatus = command.status;
      state.systemAudioDetail = command.detail;
      if (command.status === "requires_virtual_device" || command.status === "available") {
        state.nativeLoopbackTested = true;
      }
      refreshSetupCapabilities();
      push();
      return;
    case "report-virtual-audio-devices":
      state.virtualAudioDevices = detectVirtualAudioDevices(command.devices);
      if (
        state.selectedVirtualAudioDeviceId &&
        !state.virtualAudioDevices.some((d) => d.deviceId === state.selectedVirtualAudioDeviceId)
      ) {
        state.selectedVirtualAudioDeviceId = undefined;
        glassUserSettings = {
          ...glassUserSettings,
          selectedVirtualAudioDeviceId: undefined,
        };
        state.glassSettings = glassUserSettings;
        void persistGlassUserSettings(glassUserSettings);
      }
      refreshSetupCapabilities();
      push();
      return;
    case "set-selected-virtual-audio-device": {
      const deviceId = command.deviceId.trim() || undefined;
      state.selectedVirtualAudioDeviceId = deviceId;
      glassUserSettings = { ...glassUserSettings, selectedVirtualAudioDeviceId: deviceId };
      state.glassSettings = glassUserSettings;
      await persistGlassUserSettings(glassUserSettings);
      refreshSetupCapabilities();
      push();
      return;
    }
    case "stt-listening-timer":
      state.stt = { ...state.stt, listeningElapsedMs: command.elapsedMs };
      checkListeningLimit(command.elapsedMs);
      push();
      return;
    case "stt-cost-warning":
      state.lastNotice = listeningCostWarningMessage();
      push();
      return;
    case "clear-transcript":
      state.transcript = "";
      push();
      return;
    case "save-moment": {
      const note =
        command.note?.trim() ||
        (state.transcript.trim()
          ? extractNotes(state.transcript).summary || "Saved transcript moment"
          : "Saved moment");
      moments.add({ kind: command.kind ?? "note", note });
      await persistMoments(moments);
      if (sessionIsLive()) {
        sessions.addEvent({ kind: "saved_moment", title: note });
        await persistSessions(sessions);
      }
      push();
      return;
    }
    case "delete-moment":
      moments.remove(command.id);
      await persistMoments(moments);
      push();
      return;
    case "clear-moments":
      moments.clear();
      await persistMoments(moments);
      push();
      return;
    case "send-screenshot": {
      const dataUrl = command.imageDataUrl ?? state.pendingCaptureDataUrl ?? (await handleCapture());
      if (dataUrl) await sendScreenshot(dataUrl);
      return;
    }
    case "send-transcript":
      await sendTranscript();
      return;
    case "send-moment": {
      const moment = moments.list().find((m) => m.id === command.id);
      if (moment?.contextId) {
        await openHandoff(moment.contextId);
        push();
      } else if (moment) {
        // Re-send the note text as fresh context.
        const payload = buildTextContextPayload({
          title: moment.sourceTitle ?? "IIVO Glass moment",
          text: moment.note,
          kind: "note",
        });
        const item = await createContextItem(config, payload);
        moments.markSent(moment.id, item.id);
        await persistMoments(moments);
        await openHandoff(item.id);
        push();
      }
      return;
    }
    case "ask-iivo":
      state.panelTab = "summary";
      if (!isPanelVisible()) togglePanel();
      if (state.transcript.trim()) {
        await sendTranscript();
      }
      push();
      return;
    case "submit-command":
      await submitCommand(command.text, command.lensContext, {
        companionRoute: command.companionRoute,
      });
      return;
    case "ask-iivo-direct":
      await submitCommand(command.text);
      return;
    case "prefill-command-bar":
      prefillCommandBar(command.text);
      return;

    // ── Extract & Build Mode ───────────────────────────────────────────────────
    case "extract-mode-start":
      startExtractBuildCapture();
      return;
    case "extract-mode-stop":
      stopExtractBuildCapture();
      return;

    case "report-command-bar-stack-height": {
      const heightPx = Math.max(0, Math.round(command.heightPx));
      const stackChanged = state.commandBarStackHeightPx !== heightPx;
      state.commandBarStackHeightPx = heightPx;
      const barResized = syncCommandBarWindowToStackHeight(heightPx);
      const clearanceChanged = refreshCommandBarOverlayClearance();
      if (stackChanged || barResized || clearanceChanged) {
        push();
      }
      return;
    }
    case "cancel-glass-ask":
      cancelGlassAsk();
      return;
    case "set-glass-server-urls": {
      const { parseGlassServerUrl } = await import("../shared/glassSettings.ts");
      const apiUrl = parseGlassServerUrl(command.apiUrl) ?? config.iivoApiUrl;
      const webUrl = parseGlassServerUrl(command.webUrl) ?? config.iivoWebUrl;
      // Mutate the module-level config so all downstream callers pick up the new URLs immediately
      config.iivoApiUrl = apiUrl;
      config.iivoWebUrl = webUrl;
      state.glassSettings = { ...state.glassSettings, iivoApiUrl: parseGlassServerUrl(command.apiUrl), iivoWebUrl: parseGlassServerUrl(command.webUrl) };
      glassUserSettings = state.glassSettings;
      await persistGlassUserSettings(glassUserSettings);
      state.lastNotice = `Server URL updated: ${apiUrl}`;
      push();
      return;
    }
    case "set-glass-hotkey":
      state.glassSettings = { ...state.glassSettings, hotkeyPreset: command.preset };
      glassUserSettings = state.glassSettings;
      await persistGlassUserSettings(glassUserSettings);
      registerGlobalHotkeys();
      push();
      return;
    case "set-ui-locale":
      state.glassSettings = { ...state.glassSettings, uiLocale: command.locale };
      glassUserSettings = state.glassSettings;
      await persistGlassUserSettings(glassUserSettings);
      push();
      return;
    case "set-glass-display": {
      const displayTarget = sanitizeDisplayTarget(command.target);
      state.glassSettings = { ...state.glassSettings, displayTarget };
      glassUserSettings = state.glassSettings;
      await persistGlassUserSettings(glassUserSettings);
      applyGlassUserSettings(glassUserSettings);
      push();
      return;
    }
    case "set-save-visual-asks-to-session":
      state.glassSettings = {
        ...state.glassSettings,
        saveVisualAsksToSession: command.enabled,
      };
      glassUserSettings = state.glassSettings;
      await persistGlassUserSettings(glassUserSettings);
      push();
      return;
    case "set-auto-upload-captures-to-context":
      state.glassSettings = {
        ...state.glassSettings,
        autoUploadCapturesToContext: command.enabled,
      };
      glassUserSettings = state.glassSettings;
      await persistGlassUserSettings(glassUserSettings);
      push();
      return;
    case "set-mic-auto-send-after-silence":
      state.glassSettings = {
        ...state.glassSettings,
        micAutoSendAfterSilence: command.enabled,
      };
      glassUserSettings = state.glassSettings;
      await persistGlassUserSettings(glassUserSettings);
      push();
      return;
    case "set-clipboard-intelligence-enabled":
      state.glassSettings = {
        ...state.glassSettings,
        clipboardIntelligenceEnabled: command.enabled,
      };
      glassUserSettings = state.glassSettings;
      await persistGlassUserSettings(glassUserSettings);
      push();
      return;
    case "clipboard-intel-debug-inject": {
      if (process.env.IIVO_GLASS_E2E !== "1" && process.env.NODE_ENV !== "development") return;
      const cls = classifyClipboard(command.text);
      void handleClipboardIntelligence(command.text, cls);
      return;
    }
    case "save-mac-output-device": {
      const deviceName = await getCurrentMacOutputDeviceName();
      state.glassSettings = {
        ...state.glassSettings,
        savedMacOutputDeviceName: deviceName ?? undefined,
      };
      glassUserSettings = state.glassSettings;
      await persistGlassUserSettings(glassUserSettings);
      state.lastNotice = deviceName
        ? `Output device saved: ${deviceName}`
        : "Could not read current output device (is SwitchAudioSource installed?).";
      push();
      return;
    }
    case "clear-mac-output-device":
      state.glassSettings = {
        ...state.glassSettings,
        savedMacOutputDeviceName: undefined,
      };
      glassUserSettings = state.glassSettings;
      await persistGlassUserSettings(glassUserSettings);
      state.lastNotice = "Saved output device cleared.";
      push();
      return;
    case "save-last-visual-capture": {
      if (!sessionIsLive()) {
        state.lastNotice = "Start a session to save the screen capture.";
        push();
        break;
      }
      const saved = await persistEphemeralVisualToSession();
      if (saved && state.visualAskRetention?.usedForAnswer) {
        state.visualAskRetention = buildVisualAskRetentionStatus({
          usedForAnswer: true,
          savedToSession: true,
          uploadedToContext: state.visualAskRetention.uploadedToContext,
        });
        state.lastNotice = "Screen capture saved to session.";
      } else if (!state.ephemeralVisualCapture) {
        state.lastNotice = "No recent screen capture to save.";
      } else {
        state.lastNotice = "Could not save screen capture.";
      }
      push();
      return;
    }
    case "refresh-glass-layout":
      refreshGlassDisplayLayout();
      push();
      return;
    case "chrome-window-drag": {
      if (sender) {
        nudgeChromeWindowFromWebContents(sender, command.dx, command.dy);
      }
      return;
    }
    case "set-chrome-layout-locked": {
      if (command.locked) {
        const origins = lockChromeLayout();
        glassUserSettings = {
          ...glassUserSettings,
          chromeLayoutLocked: true,
          dockCustomOrigin: origins.dockCustomOrigin,
          commandBarCustomOrigin: origins.commandBarCustomOrigin,
        };
      } else {
        glassUserSettings = { ...glassUserSettings, chromeLayoutLocked: false };
        unlockChromeLayout();
      }
      syncChromeLayoutFromSettings(glassUserSettings);
      state.glassSettings = glassUserSettings;
      await persistGlassUserSettings(glassUserSettings);
      push();
      return;
    }
    case "set-dock-orientation": {
      glassUserSettings = { ...glassUserSettings, dockOrientation: command.orientation };
      state.glassSettings = glassUserSettings;
      await persistGlassUserSettings(glassUserSettings);
      push();
      return;
    }
    case "reset-chrome-layout": {
      resetChromeLayoutOrigins();
      glassUserSettings = {
        ...glassUserSettings,
        chromeLayoutLocked: true,
        dockCustomOrigin: null,
        commandBarCustomOrigin: null,
      };
      state.glassSettings = glassUserSettings;
      await persistGlassUserSettings(glassUserSettings);
      syncChromeLayoutFromSettings(glassUserSettings);
      push();
      return;
    }
    case "open-feed-in-iivo":
      try {
        await openFeedInIivo(command.id);
      } catch (err) {
        state.lastError = err instanceof Error ? err.message : "Open in IIVO failed";
        push();
      }
      return;
    case "save-feed-moment":
      await saveFeedMoment(command.id);
      return;
    case "command-bar-blur":
      blurCommandBar();
      return;
    case "toggle-command-bar":
      toggleCommandBar();
      push();
      return;
    case "voice-mode-start":
      // Surface the command bar (where Voice Mode lives) and signal it to start.
      // Mic only starts after the command-bar hook reacts — never on launch.
      focusCommandBar();
      state.voiceModeStartNonce += 1;
      push();
      return;
    case "toggle-companion-mode": {
      state.companionModeActive = !state.companionModeActive;
      state.companionModeToggleNonce += 1;
      if (!state.companionModeActive) {
        state.companionPresence = null;
        state.companionMemory = clearCompanionSessionMemory();
        state.companionWarmupPhase = "none";
        clearCompanionPrivacyState();
        resetCompanionAmbientState();
        stopCompanionDeepgramSession();
        stopCompanionAnchorWatch();
      } else {
        // Release command-bar Voice Mode mic before Aletheia listens in overlay.
        broadcastTranscriptionControl({ type: "stop" });
        state.companionWarmupPhase = "none";
        startCompanionDeepgramSession();
        warmOmniParserSidecarWithCallbacks({
          onWarming: () => {
            state.companionWarmupPhase = "warming";
            state.companionWarmupSpeakNonce += 1;
            push();
          },
          onReady: () => {
            state.companionWarmupPhase = "ready";
            state.companionWarmupSpeakNonce += 1;
            push();
          },
        });
      }
      push();
      return;
    }
    case "companion-privacy-start": {
      const durationMs = command.durationMs ?? 10 * 60 * 1000;
      state.companionPrivacy = {
        active: true,
        resumeAt: Date.now() + durationMs,
        durationMs,
      };
      resetCompanionAmbientState();
      clearCompanionPrivacyTimer();
      companionPrivacyTimer = setTimeout(() => {
        if (!state.companionPrivacy?.active) return;
        state.companionPrivacy = undefined;
        push();
        broadcast(IPC.companionPrivacyResumed, {});
      }, durationMs);
      push();
      return;
    }
    case "companion-privacy-end": {
      clearCompanionPrivacyState();
      push();
      return;
    }
    case "clear-companion-presence":
      state.companionPresence = null;
      stopCompanionAnchorWatch();
      push();
      return;
    case "clear-command-feed":
      state.commandFeed = [];
      push();
      return;
    case "dismiss-overlay-chat":
      dismissOverlayChatFeed();
      return;
    case "pin-command-feed-item":
      state.commandFeed = state.commandFeed.map((item) =>
        item.id === command.id ? { ...item, pinned: command.pinned } : item,
      );
      push();
      return;
    case "remove-command-feed-item": {
      // Clean up shellOutputs entry if this was a /run shell card
      const removing = state.commandFeed.find((item) => item.id === command.id);
      if (removing?.shellOutputId && state.shellOutputs?.[removing.shellOutputId]) {
        // Cancel any in-flight exec first
        const cancelFn = shellCancels.get(removing.shellOutputId);
        if (cancelFn) { cancelFn(); shellCancels.delete(removing.shellOutputId); }
        delete state.shellOutputs[removing.shellOutputId];
      }
      // Clean up any pending diff preview keyed by this feed item id (#161)
      if (state.pendingDiffs?.[command.id]) {
        delete state.pendingDiffs[command.id];
      }
      // Clean up design capture + build verification state (#163)
      if (state.designCaptures?.[command.id]) {
        delete state.designCaptures[command.id];
      }
      if (state.buildVerifications?.[command.id]) {
        delete state.buildVerifications[command.id];
      }
      state.commandFeed = state.commandFeed.filter((item) => item.id !== command.id);
      push();
      return;
    }
    case "open-chat":
      await shell.openExternal(buildIivoChatUrl(config));
      return;
    case "set-tab":
      state.panelTab = command.tab;
      push();
      return;
    case "clear-last-notice":
      state.lastNotice = undefined;
      push();
      return;
    case "clear-last-error":
      state.lastError = undefined;
      push();
      return;
    case "toggle-panel": {
      const panelWasOpen = isPanelVisible();
      togglePanel();
      if (panelWasOpen && state.lastNotice?.startsWith("Setup check:")) {
        state.lastNotice = undefined;
      }
      push();
      return;
    }
    case "toggle-overlay":
      toggleOverlay();
      push();
      return;
    case "set-overlay-mode":
      setOverlayMode(command.mode);
      push();
      return;
    case "window-context-refresh":
      state.windowContext = await refreshWindowContext();
      push();
      return;
    case "capture-media-context":
      await captureMediaContext();
      return;
    case "report-mic-permission":
      state.micPermission = command.status;
      refreshSetupCapabilities();
      push();
      return;
    case "run-setup-check":
    case "retry-system-audio": {
      const userInitiatedSetupCheck =
        command.type === "run-setup-check" && command.forceCaptureProbe === true;
      if (userInitiatedSetupCheck) {
        state.lastNotice = "Running setup check…";
        push();
      }
      const result = await runGlassSetupCheck({
        config,
        displayTarget: state.glassSettings.displayTarget,
        skipCaptureProbe:
          !userInitiatedSetupCheck &&
          process.env.IIVO_GLASS_E2E === "1" &&
          process.env.IIVO_GLASS_E2E_CAPTURE_FAIL !== "1",
      });
      const silent = command.type === "run-setup-check" && command.silent;
      const noticePrefix =
        command.type === "retry-system-audio"
          ? `System audio probe: ${result.systemAudioStatus}${result.systemAudioDiagnostics ? ` (${result.systemAudioDiagnostics})` : ""}`
          : undefined;
      await applyGlassSetupCheckResult(result, {
        silent,
        noticePrefix,
        showSummaryNotice: userInitiatedSetupCheck,
      });
      return;
    }
    case "run-capture-diagnostics": {
      refreshAppIdentityState();
      const report = await runCaptureDiagnosticsReport({
        displayTarget: state.glassSettings.displayTarget,
      });
      state.captureDiagnosticsReport = report;
      state.duplicateAppBundles = report.duplicateAppBundles;
      state.duplicateAppWarning = buildDuplicateAppWarning(
        report.duplicateAppBundles,
        report.appIdentity.bundlePath,
      );
      state.screenCaptureProbe = report.screenCaptureProbe;
      state.screenCaptureDetail = report.screenCaptureDetail;
      state.windowCaptureProbe = report.windowCaptureProbe;
      state.windowCaptureDetail = report.windowCaptureDetail;
      if (!state.privacy.listening) {
        state.systemAudioStatus = report.systemAudioStatus;
        state.systemAudioDetail = report.systemAudioDetail;
      }
      refreshSetupCapabilities();
      state.setupCheckSummary = formatSetupCheckSummary(state.setupCapabilities);
      state.lastNotice = report.lines.join("\n");
      push();
      return;
    }
    case "open-screen-recording-settings": {
      const opened = await openGlassSystemSettings("screenRecording");
      state.lastNotice = opened.message;
      push();
      return;
    }
    case "open-microphone-settings": {
      const opened = await openGlassSystemSettings("microphone");
      state.lastNotice = opened.message;
      push();
      return;
    }
    case "open-accessibility-settings": {
      const opened = await openGlassSystemSettings("accessibility");
      state.lastNotice = opened.message;
      push();
      return;
    }
    case "open-privacy-settings": {
      const opened = await openGlassSystemSettings("privacy");
      state.lastNotice = opened.message;
      push();
      return;
    }
    case "open-audio-midi-setup": {
      const opened = await openGlassSystemSettings("audioMidi");
      state.lastNotice = opened.message;
      push();
      return;
    }
    case "show-virtual-audio-help":
      state.lastNotice = VIRTUAL_AUDIO_HELP_DETAIL;
      push();
      return;
    case "show-blackhole-setup":
      state.lastNotice = BLACKHOLE_SETUP_INSTRUCTIONS;
      push();
      return;
    case "install-system-audio": {
      // Guard: already in progress
      if (
        state.blackHoleInstallStatus === "downloading" ||
        state.blackHoleInstallStatus === "installing" ||
        state.blackHoleInstallStatus === "configuring"
      ) {
        return;
      }
      // Kick off async, push progress updates via state
      installBlackHoleAndSetupAudio((p) => {
        state.blackHoleInstallStatus = p.status;
        state.blackHoleInstallProgress = p.progress;
        push();
      }).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        state.blackHoleInstallStatus = "error";
        state.blackHoleInstallProgress = msg;
        state.lastError = msg;
        push();
      });
      return;
    }
    case "connect-iivo-account": {
      const { connectToken } = command;
      (async () => {
        try {
          const res = await fetch(
            `${config.iivoApiUrl}/api/auth/glass-connect/verify/${encodeURIComponent(connectToken)}`,
          );
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            state.lastError = body.error ?? `Connect failed (${res.status})`;
            push();
            return;
          }
          const data = (await res.json()) as {
            sessionToken: string;
            userId: string;
            email: string;
            name: string | null;
          };
          const link = {
            sessionToken: data.sessionToken,
            userId: data.userId,
            email: data.email,
            name: data.name ?? null,
            linkedAt: new Date().toISOString(),
          };
          await persistIivoAccountLink(link);
          state.iivoAccountLink = link;
          push();
        } catch (err) {
          state.lastError =
            err instanceof Error ? err.message : "Could not reach iivo.ai — check your connection";
          push();
        }
      })();
      return;
    }
    case "disconnect-iivo-account": {
      (async () => {
        await clearIivoAccountLink();
        state.iivoAccountLink = null;
        push();
      })();
      return;
    }
    // --- Meeting Intelligence -------------------------------------------------
    case "meeting-set-type": {
      meetingIntelState = applyMeetingTypeOverrideInEngine(meetingIntelState, command.subType);
      state.lastNotice = `Re-scanning as ${MEETING_SUB_TYPE_LABELS[command.subType]}…`;
      push();
      return;
    }
    case "meeting-delete-moment": {
      const deleted = meetingIntelState.moments.find((m) => m.id === command.id);
      const next = deleteMeetingMoment(meetingIntelState, command.id);
      if (next !== meetingIntelState) {
        meetingIntelNoticedIds.delete(command.id);
        meetingIntelState = next;
        push();
        if (deleted) logMeetingCorrection("delete", deleted);
      }
      return;
    }
    case "meeting-add-moment": {
      const prev = meetingIntelState;
      meetingIntelState = addMeetingMoment(meetingIntelState, command.momentType, command.content);
      push();
      // Log the newly added moment (last item — addMeetingMoment appends)
      const added = meetingIntelState.moments.at(-1);
      if (added && added !== prev.moments.at(-1)) logMeetingCorrection("add", added);
      return;
    }
    // -------------------------------------------------------------------------
    // Wingman Mode
    // -------------------------------------------------------------------------
    case "wingman-start": {
      const {
        initialWingmanSession,
        shouldAddAppSnapshot,
      } = await import("../shared/wingmanSession.ts");
      // Stop any previous session cleanly
      if (wingmanSnapshotInterval !== null) {
        clearInterval(wingmanSnapshotInterval);
        wingmanSnapshotInterval = null;
      }
      stopTerminalWatching();
      const session = initialWingmanSession(command.goal);
      wingmanState = { active: true, session, inspecting: false, report: null };
      // Discover git repo asynchronously — doesn't block the session starting
      discoverGitRepo(session.appSnapshots).then((repoInfo) => {
        if (!repoInfo || !wingmanState.session) return;
        wingmanState = {
          ...wingmanState,
          session: {
            ...wingmanState.session,
            gitBaseRef: repoInfo.baseRef,
            gitRepoPath: repoInfo.repoPath,
          },
        };
        // Don't push() — this is background work, no UI change needed
      }).catch(() => { /* no git repo detected — silent */ });
      // Passive app snapshot accumulator — title + app only, no screenshots
      wingmanSnapshotInterval = setInterval(() => {
        if (!wingmanState.session) return;
        const ctx = getCachedWindowContext();
        const snap = {
          app: ctx.appName ?? "Unknown",
          title: ctx.windowTitle ?? "",
          timestamp: Date.now(),
        };
        if (shouldAddAppSnapshot(wingmanState.session.appSnapshots, snap)) {
          wingmanState = {
            ...wingmanState,
            session: {
              ...wingmanState.session,
              appSnapshots: [...wingmanState.session.appSnapshots, snap],
            },
          };
        }
      }, 30_000);
      state.lastNotice = `Wingman active — watching: ${command.goal}`;
      push();
      return;
    }

    case "wingman-inspect": {
      if (!wingmanState.session) return;
      const { detectLoop, detectScopeDrift } = await import("../shared/wingmanSession.ts");
      wingmanState = { ...wingmanState, inspecting: true };
      push();
      try {
        const captureTarget = resolveCaptureDisplay(state.glassSettings.displayTarget);
        const shot = await captureDisplayById(captureTarget.id, captureTarget.label);
        const optimized = optimizeVisualAskImage(
          shot.imageDataUrl,
          { width: shot.width, height: shot.height },
          { prompt: "Wingman work session inspection", preset: "general" },
        );
        // Non-null assertion safe: guarded above; no code path nulls session in this handler.
        const session = wingmanState.session!;
        const lastInspection = session.inspections.at(-1);
        const recentSnapshots = session.appSnapshots.slice(-3);
        const systemPrompt = [
          `You are Wingman, an active work companion.`,
          `Task goal: "${session.goal}"`,
          `Current app context: ${recentSnapshots.map((s) => `${s.app} (${s.title})`).join(" → ") || "unknown"}`,
          lastInspection ? `Previous finding: ${lastInspection.response.slice(0, 200)}` : "",
          ``,
          `Analyse the current screen and respond with:`,
          `1. What you observe (use "appears to", "I observe" — NEVER "verified" or "confirmed")`,
          `2. One concrete next step`,
          `3. Any risk or warning you see`,
          ``,
          `Keep your response under 150 words. Be specific to the task and what is visible.`,
          `Never claim to have verified, confirmed, tested, or proven anything.`,
        ]
          .filter(Boolean)
          .join("\n");
        const userPrompt = command.prompt
          ? command.prompt
          : `What do you observe on this screen relevant to: "${session.goal}"?`;
        const response = await askIivoGlass(config, {
          prompt: `${systemPrompt}\n\nUser question: ${userPrompt}`,
          visualIntent: true,
          latestScreenshot: {
            imageDataUrl: optimized.imageDataUrl,
            label: captureTarget.label,
            capturedAt: new Date().toISOString(),
          },
        });
        const answer = response.answer?.trim() ?? "No response from Wingman.";
        // Save screenshot ref (path-style key from timestamp)
        const screenshotRef = `wingman-${session.id}-${Date.now()}`;
        const scopeDriftWarning = detectScopeDrift(session.goal, answer) ?? undefined;
        const inspection = {
          id: `insp-${Date.now()}`,
          triggeredBy: "user" as const,
          timestamp: Date.now(),
          screenshotRef,
          prompt: command.prompt,
          response: answer,
          type: (command.prompt ? "question" : "next-step") as "question" | "next-step" | "warning" | "debug",
          confidence: "inferred" as const,
          scopeDriftWarning,
        };
        const newInspections = [...session.inspections, inspection];
        const loopWarning = detectLoop(newInspections);
        wingmanState = {
          ...wingmanState,
          inspecting: false,
          session: {
            ...session,
            inspections: newInspections,
            loopWarning,
          },
        };
        if (scopeDriftWarning) {
          state.lastNotice = `⚠ Wingman: ${scopeDriftWarning.slice(0, 100)}`;
        } else if (loopWarning && !session.loopWarning) {
          state.lastNotice = "⚠ Wingman: same issue observed twice — root cause may not be resolved";
        }
      } catch (err) {
        wingmanState = { ...wingmanState, inspecting: false };
        state.lastError = `Wingman inspect failed: ${err instanceof Error ? err.message : String(err)}`;
      }
      push();
      return;
    }

    case "wingman-add-note": {
      if (!wingmanState.session) return;
      const note = {
        id: `note-${Date.now()}`,
        timestamp: Date.now(),
        content: command.content,
        source: "user" as const,
      };
      wingmanState = {
        ...wingmanState,
        session: {
          ...wingmanState.session,
          notes: [...wingmanState.session.notes, note],
        },
      };
      push();
      return;
    }

    case "wingman-terminal-toggle": {
      if (!wingmanState.session) return;
      const wasWatching = wingmanState.session.terminalWatching;
      wingmanState = {
        ...wingmanState,
        session: {
          ...wingmanState.session,
          terminalWatching: !wasWatching,
        },
      };
      if (!wasWatching) {
        startTerminalWatching();
        state.lastNotice = "Wingman: terminal watching on";
      } else {
        stopTerminalWatching();
        state.lastNotice = "Wingman: terminal watching off";
      }
      push();
      return;
    }

    case "wingman-new-session": {
      // Dismiss the current report and reset to inactive state — no IPC side effects.
      wingmanState = { active: false, session: null, inspecting: false, report: null };
      push();
      return;
    }

    case "wingman-end": {
      if (!wingmanState.session) return;
      // Stop snapshot accumulator and terminal watcher
      if (wingmanSnapshotInterval !== null) {
        clearInterval(wingmanSnapshotInterval);
        wingmanSnapshotInterval = null;
      }
      stopTerminalWatching();
      // Stop agent proxy and collect captured calls
      const sessionAgentCalls = wingmanState.session.agentCalls.slice();
      if (agentProxyServer) {
        await agentProxyServer.stop();
        agentProxyServer = null;
        agentProxyState = { ...agentProxyState, running: false };
      }
      const endedSession = {
        ...wingmanState.session,
        endedAt: Date.now(),
        agentCalls: sessionAgentCalls,
      };
      wingmanState = { ...wingmanState, active: false, session: endedSession };
      push();
      // Capture git diff before generating the report
      const gitDiff =
        endedSession.gitRepoPath && endedSession.gitBaseRef
          ? await captureSessionGitDiff(
              endedSession.gitRepoPath,
              endedSession.gitBaseRef,
              endedSession.goal,
            )
          : null;

      // Generate report asynchronously — push state again when ready
      try {
        const { buildWingmanReportPrompt, buildWingmanReport } = await import("../shared/wingmanSession.ts");
        const prompt = buildWingmanReportPrompt(endedSession, gitDiff ?? undefined, sessionAgentCalls);
        const response = await askIivoGlass(config, { prompt, visualIntent: false });
        const aiSummary = response.answer?.trim() ?? "Session complete.";
        const report = buildWingmanReport(endedSession, aiSummary, gitDiff ?? undefined, sessionAgentCalls);
        wingmanState = { ...wingmanState, report };
        state.lastNotice = "Wingman session report ready.";
        push();
        saveWingmanSessionRecord(endedSession, report);

        // ── Verification pass (async, non-blocking) ─────────────────────────
        // Kick off after the report is already visible. Results are merged in
        // when ready and pushed to state again. Never blocks report display.
        void (async () => {
          try {
            const { extractClaims } = await import("../shared/verificationEngine.ts");
            const { runVerification } = await import("./verificationRunner.ts");
            const claims = extractClaims(endedSession, report);
            if (claims.length === 0) return;
            const verificationResults = await runVerification(claims);
            if (wingmanState.report) {
              wingmanState = {
                ...wingmanState,
                report: { ...wingmanState.report, verificationResults },
              };
              push();
            }
          } catch {
            // Verification failure is silent — never crashes the report
          }
        })();

        // ── GitHub PR context (async, non-blocking) ─────────────────────────
        // Only runs if the session had a detected git repo and a PAT is saved.
        if (endedSession.gitRepoPath) {
          void (async () => {
            try {
              const { fetchSessionPRContext } = await import("./githubService.ts");
              const result = await fetchSessionPRContext(endedSession.gitRepoPath!);
              if (result.tokenInvalid) {
                githubPATState = { ...githubPATState, tokenInvalid: true };
                push();
              }
              if (result.context && wingmanState.report) {
                wingmanState = {
                  ...wingmanState,
                  report: {
                    ...wingmanState.report,
                    githubPR: result.context,
                    githubTokenInvalid: result.tokenInvalid,
                  },
                };
                push();
              }
            } catch {
              // GitHub fetch failure is silent — never crashes the report
            }
          })();
        }
      } catch {
        const { buildWingmanReport } = await import("../shared/wingmanSession.ts");
        const report = buildWingmanReport(endedSession, "Session complete. Review the inspections above for details.", gitDiff ?? undefined, sessionAgentCalls);
        wingmanState = { ...wingmanState, report };
        saveWingmanSessionRecord(endedSession, report);
        push();
      }
      return;
    }

    case "wingman-search-sessions": {
      const { query } = command;
      wingmanMemoryState = { ...wingmanMemoryState, loading: true, searchResults: [] };
      push();
      try {
        const { parseSessionLibrary, searchWingmanSessions } = await import("../shared/wingmanMemory.ts");
        const libraryPath = join(app.getPath("userData"), "wingman-sessions.jsonl");
        const content = await new Promise<string>((resolve) => {
          readFile(libraryPath, "utf-8", (err, data) => resolve(err ? "" : data));
        });
        const library = parseSessionLibrary(content);
        const results = searchWingmanSessions(query, library);
        wingmanMemoryState = {
          searchResults: results,
          totalSessions: library.length,
          loading: false,
        };
      } catch {
        wingmanMemoryState = { ...wingmanMemoryState, loading: false, searchResults: [] };
      }
      push();
      return;
    }

    // --- Glass Q&A Memory --------------------------------------------------

    case "search-memory": {
      const results = await searchMemory(command.query);
      glassMemoryResults = results;
      push();
      return;
    }

    case "get-recent-memory": {
      const results = await getRecentMemory();
      glassMemoryResults = results;
      push();
      return;
    }

    // -----------------------------------------------------------------------

    case "wingman-agent-proxy-consent-grant": {
      // User clicked "Enable" in the consent modal — mark consented, clear modal
      agentProxyState = { ...agentProxyState, consented: true, showConsentModal: false };
      push();
      return;
    }

    case "wingman-agent-proxy-enable": {
      if (!wingmanState.session) return;
      // First time: show consent modal instead of starting immediately
      if (!agentProxyState.consented) {
        agentProxyState = { ...agentProxyState, showConsentModal: true };
        push();
        return;
      }
      // Already consented — start the proxy
      if (agentProxyServer) return; // already running
      try {
        const { AgentProxyServer, findAvailablePort } = await import("./agentProxyServer.ts");
        const port = (await findAvailablePort(agentProxyState.port)) ?? agentProxyState.port;
        agentProxyServer = new AgentProxyServer({
          port,
          onCall: (summary) => {
            agentProxyState = {
              ...agentProxyState,
              capturedCallCount: agentProxyState.capturedCallCount + 1,
            };
            if (!wingmanState.session) {
              push();
              return;
            }
            wingmanState = {
              ...wingmanState,
              session: {
                ...wingmanState.session,
                agentCalls: [...wingmanState.session.agentCalls, summary],
              },
            };
            push();
          },
          onError: (err) => {
            console.error("[AgentProxy]", err.message);
          },
        });
        await agentProxyServer.start();
        agentProxyState = { ...agentProxyState, running: true, port };
        state.lastNotice = `Agent interception active on port ${port}`;
      } catch (err) {
        state.lastError = `Agent proxy failed to start: ${(err as Error).message}`;
        agentProxyServer = null;
        agentProxyState = { ...agentProxyState, running: false };
      }
      push();
      return;
    }

    case "wingman-agent-proxy-disable": {
      if (agentProxyServer) {
        await agentProxyServer.stop();
        agentProxyServer = null;
      }
      agentProxyState = { ...agentProxyState, running: false, showConsentModal: false };
      state.lastNotice = "Agent interception disabled";
      push();
      return;
    }

    case "wingman-github-pat-save": {
      const { token } = command;
      try {
        const { savePAT, isPATConfigured } = await import("./githubService.ts");
        await savePAT(token);
        githubPATState = await isPATConfigured();
        state.lastNotice = "GitHub PAT saved — PR context will appear in future session reports.";
      } catch (err) {
        state.lastError = `Failed to save GitHub PAT: ${(err as Error).message}`;
        githubPATState = { configured: false, tokenInvalid: false };
      }
      push();
      return;
    }

    case "wingman-github-pat-clear": {
      try {
        const { clearPAT } = await import("./githubService.ts");
        await clearPAT();
        githubPATState = { configured: false, tokenInvalid: false };
        state.lastNotice = "GitHub PAT removed.";
      } catch {
        githubPATState = { configured: false, tokenInvalid: false };
      }
      push();
      return;
    }

    case "wingman-github-pat-status": {
      try {
        const { isPATConfigured } = await import("./githubService.ts");
        const freshState = await isPATConfigured();
        // Preserve tokenInvalid — only a real API call (401) or explicit save can clear it.
        // isPATConfigured only checks file existence, not token validity, so merging here
        // must not silently reset a flag that was set by a real GitHub rejection.
        githubPATState = {
          configured: freshState.configured,
          // Clear tokenInvalid only if the token was removed (no longer configured)
          tokenInvalid: freshState.configured ? githubPATState.tokenInvalid : false,
        };
      } catch {
        githubPATState = { configured: false, tokenInvalid: false };
      }
      push();
      return;
    }

    case "detect-audio-devices":
      broadcastTranscriptionControl({ type: "probe-virtual-audio-devices" });
      state.lastNotice = "Scanning for virtual audio devices (BlackHole, Loopback, etc.)…";
      push();
      return;
    case "test-blackhole":
      broadcastTranscriptionControl({ type: "test-blackhole" });
      state.lastNotice = "Testing BlackHole input — play audio on your Mac while the test runs.";
      push();
      return;
    case "open-sound-settings": {
      const opened = await openGlassSystemSettings("sound");
      state.lastNotice = opened.message;
      push();
      return;
    }
    case "retry-capture":
    case "retry-capture-permission": {
      const target = resolveCaptureDisplay(state.glassSettings.displayTarget);
      const probe = await import("./capture.ts").then((m) =>
        m.probeScreenCapturePermission(target.id),
      );
      if (probe.ok) {
        state.screenCaptureProbe = "ready";
        state.screenCaptureDetail = undefined;
        state.lastNotice = "Screen capture permission looks good. Try Capture Screen or a visual ask.";
      } else {
        state.screenCaptureProbe = mapCaptureErrorToScreenCaptureStatus(probe.error);
        state.screenCaptureDetail = probe.error;
        state.lastNotice = "Screen Recording permission still needed.";
      }
      refreshSetupCapabilities();
      push();
      return;
    }
    case "connect-system-audio":
    case "verify-system-audio":
      broadcastTranscriptionControl({ type: "connect-system-audio" });
      state.lastNotice = "Connecting system audio…";
      push();
      return;
    case "glass-quit": {
      const overlay = getWindows()?.overlay;
      const parent = overlay && !overlay.isDestroyed() ? overlay : null;
      const quitDialog = {
        type: "warning" as const,
        buttons: ["Cancel", "Quit Glass"],
        defaultId: 0,
        cancelId: 0,
        title: "Quit Glass",
        message: "Quit Glass?",
        detail: "This will close the app. Unsaved IDE edits will be lost.",
      };
      const { response } = parent
        ? await dialog.showMessageBox(parent, quitDialog)
        : await dialog.showMessageBox(quitDialog);
      if (response === 1) app.quit();
      return;
    }
    case "glass-update-check":
      void runGlassUpdateCheck();
      return;
    case "glass-update-apply": {
      state.appUpdate = {
        ...state.appUpdate,
        phase: isGlassAutoUpdateEnabled() ? "downloading" : "installing",
        error: undefined,
        downloadPercent: isGlassAutoUpdateEnabled() ? 0 : undefined,
      };
      push();
      const result = isGlassAutoUpdateEnabled()
        ? await applyGlassAutoUpdate(state.appUpdate.latestVersion)
        : await applyGlassAppUpdate();
      if (!result.ok) {
        state.appUpdate = { ...state.appUpdate, phase: "available", error: result.error };
        push();
      } else if ("usedDmgFallback" in result && result.usedDmgFallback) {
        state.appUpdate = {
          ...state.appUpdate,
          phase: "available",
          error:
            "In-app install needs a notarized build. The DMG opened in your browser — drag IIVO Glass to Applications, then reopen.",
        };
        state.lastNotice =
          "Update DMG opened — drag IIVO Glass to Applications, replace the old copy, then reopen.";
        push();
      }
      return;
    }
    case "glass-update-dismiss":
      state.appUpdate = { ...state.appUpdate, phase: "dismissed" };
      push();
      return;
    case "e2e-set-app-update":
      if (process.env.IIVO_GLASS_E2E === "1") {
        state.appUpdate = { ...state.appUpdate, ...command.update };
        push();
      }
      return;
    case "test-microphone":
      state.panelTab = "setup";
      if (!isPanelVisible()) togglePanel();
      broadcastTranscriptionControl({ type: "probe-microphone" });
      state.lastNotice = "Testing microphone — approve the macOS prompt if shown.";
      push();
      return;
    case "test-system-audio":
      state.panelTab = "setup";
      if (!isPanelVisible()) togglePanel();
      broadcastTranscriptionControl({ type: "test-system-audio" });
      state.lastNotice =
        "Testing system audio — choose the screen in the picker if prompted.";
      push();
      return;
    case "e2e-set-server-health":
      if (process.env.IIVO_GLASS_E2E === "1") {
        state.serverHealthForSetup = command.health;
        push();
      }
      return;
    case "e2e-set-capture-probes":
      if (process.env.IIVO_GLASS_E2E === "1") {
        if (command.screenCaptureProbe) state.screenCaptureProbe = command.screenCaptureProbe;
        if (command.screenCaptureDetail !== undefined) {
          state.screenCaptureDetail = command.screenCaptureDetail;
        }
        if (command.windowCaptureProbe) state.windowCaptureProbe = command.windowCaptureProbe;
        if (command.systemAudioStatus) state.systemAudioStatus = command.systemAudioStatus;
        if (command.systemAudioDetail !== undefined) {
          state.systemAudioDetail = command.systemAudioDetail;
        }
        refreshSetupCapabilities();
        state.setupCheckSummary = formatSetupCheckSummary(state.setupCapabilities);
        push();
      }
      return;
    case "complete-glass-onboarding": {
      const profile = normalizeGlassUserProfile(command.profile);
      await finishGlassOnboarding(profile);
      return;
    }
    case "skip-glass-onboarding":
      await finishGlassOnboarding(null);
      return;
    case "e2e-reset-setup-state":
      if (process.env.IIVO_GLASS_E2E === "1") {
        state.micPermission = "not_requested";
        state.screenCaptureProbe = "unknown";
        state.screenCaptureDetail = undefined;
        state.windowCaptureProbe = "unknown";
        state.windowCaptureDetail = undefined;
        state.systemAudioStatus = "not_tested";
        state.systemAudioDetail = "System audio probe skipped.";
        state.lastError = undefined;
        refreshSetupCapabilities();
        state.setupCheckSummary = formatSetupCheckSummary(state.setupCapabilities);
        push();
      }
      return;
    case "e2e-open-onboarding":
      if (process.env.IIVO_GLASS_E2E === "1") {
        state.onboardingOpen = true;
        push();
      }
      return;
    case "e2e-copilot-tick":
      if (process.env.IIVO_GLASS_E2E === "1") {
        await runCopilotTick();
      }
      return;
    case "e2e-set-copilot-silence":
      if (process.env.IIVO_GLASS_E2E === "1") {
        copilot.e2eSetSilenceWarning(command.value);
        push();
      }
      return;
    case "e2e-inject-copilot-intervention":
      if (process.env.IIVO_GLASS_E2E === "1") {
        copilot.e2eInjectIntervention(command.intervention);
        push();
      }
      return;
    case "update-glass-profile": {
      const incoming = normalizeGlassUserProfile(command.profile);
      if (!incoming) return;
      const merged = normalizeGlassUserProfile({
        ...state.glassUserProfile,
        ...incoming,
        updatedAt: new Date().toISOString(),
      });
      if (!merged) return;
      state.glassUserProfile = merged;
      const next = await persistGlassUserProfile(merged, state.onboardingComplete === true);
      state.glassUserProfile = next.profile;
      push();
      return;
    }
    // ── TEST BACKDOORS ─────────────────────────────────────────────────────────
    // Only active when IIVO_GLASS_TEST=1. Zero production impact.
    // These exercise the REAL code paths — they inject controlled inputs so
    // automated tests can trigger conditions that would otherwise require
    // a real screenshot, real GitHub 401, etc.

    case "wingman-debug-inject-inspection": {
      if (process.env.IIVO_GLASS_TEST !== "1") return;
      if (!wingmanState.session) return;
      const { response = "Observed: error on line 42", prompt } = command as {
        response?: string; prompt?: string;
      };
      // Same dynamic import pattern as the real wingman-inspect handler
      const { detectLoop, detectScopeDrift } = await import("../shared/wingmanSession.ts");
      const inspection: import("../shared/wingmanSession.ts").WingmanInspection = {
        id: `debug-${Date.now()}`,
        triggeredBy: "user",
        timestamp: Date.now(),
        screenshotRef: "debug-no-screenshot",
        response,
        type: "question",
        confidence: "observed",
        prompt,
      };
      const newInspections = [...wingmanState.session.inspections, inspection];
      // Run the REAL loop detection + scope drift logic on injected data
      const loopWarning = detectLoop(newInspections);
      const scopeDriftWarning = detectScopeDrift(wingmanState.session.goal, response) ?? undefined;
      wingmanState = {
        ...wingmanState,
        session: {
          ...wingmanState.session,
          inspections: newInspections,
          loopWarning,
        },
      };
      if (scopeDriftWarning) {
        state.lastNotice = `[TEST] Scope drift: ${scopeDriftWarning}`;
      } else if (loopWarning) {
        state.lastNotice = "[TEST] Loop detected";
      } else {
        state.lastNotice = `[TEST] Inspection injected (${newInspections.length} total)`;
      }
      push();
      return;
    }

    case "wingman-debug-set-token-invalid": {
      if (process.env.IIVO_GLASS_TEST !== "1") return;
      // Simulate a real 401 from GitHub — sets tokenInvalid in state exactly
      // as a real failed API call would.
      githubPATState = { ...githubPATState, tokenInvalid: true };
      if (wingmanState.report) {
        wingmanState = {
          ...wingmanState,
          report: { ...wingmanState.report, githubTokenInvalid: true },
        };
      }
      state.lastNotice = "[TEST] GitHub token-invalid state set";
      push();
      return;
    }

    case "wingman-debug-get-session": {
      if (process.env.IIVO_GLASS_TEST !== "1") return;
      // Returns current wingman session + report as IPC response data for assertions.
      // The post() handler in the QA script reads the returned JSON.
      state.lastNotice = `[TEST] Session snapshot: ${wingmanState.session?.id ?? "none"}`;
      push();
      // Return via lastNotice + state push — callers read via getState()
      return;
    }

    case "wingman-debug-clear-state": {
      if (process.env.IIVO_GLASS_TEST !== "1") return;
      // Stop any running intervals first
      if (wingmanSnapshotInterval) { clearInterval(wingmanSnapshotInterval); wingmanSnapshotInterval = null; }
      if (wingmanTerminalInterval) { clearInterval(wingmanTerminalInterval); wingmanTerminalInterval = null; }
      wingmanState = { active: false, session: null, inspecting: false, report: null };
      wingmanMemoryState = { searchResults: [], totalSessions: 0, loading: false };
      githubPATState = { configured: false, tokenInvalid: false };
      agentProxyState = { ...agentProxyState, capturedCallCount: 0, showConsentModal: false };
      state.lastNotice = "[TEST] Wingman state cleared";
      push();
      return;
    }

    // ── Live terminal widget ─────────────────────────────────────────────────
    case "terminal-widget-toggle": {
      liveTerminalWidgetVisible = !liveTerminalWidgetVisible;
      push();
      return;
    }

    case "terminal-widget-move": {
      liveTerminalWidgetPos = { x: command.x, y: command.y };
      push();
      return;
    }

    // ── Action Execution Engine ───────────────────────────────────────────────
    case "run-shell": {
      const { id, command: shellCmd } = command;
      if (!state.shellOutputs) state.shellOutputs = {};
      state.shellOutputs[id] = { id, command: shellCmd, output: '', status: 'running' };
      push();
      const cancel = runShellCommand(
        shellCmd,
        (chunk) => {
          if (!state.shellOutputs) return;
          state.shellOutputs[id].output += chunk;
          push();
        },
        (exitCode) => {
          if (!state.shellOutputs) return;
          state.shellOutputs[id].status = exitCode === 0 ? 'done' : 'error';
          state.shellOutputs[id].exitCode = exitCode ?? undefined;
          shellCancels.delete(id);
          push();
        },
      );
      shellCancels.set(id, cancel);
      return;
    }

    case "cancel-shell": {
      const cancelFn = shellCancels.get(command.id);
      if (cancelFn) { cancelFn(); shellCancels.delete(command.id); }
      return;
    }

    case "write-file": {
      const result = await glassWriteFile(command.path, command.content);
      state.actionResult = {
        id: command.id,
        type: 'write-file',
        status: result.ok ? 'ok' : 'error',
        message: result.message,
      };
      push();
      return;
    }

    case "inject-keystrokes": {
      if (command.targetApp) {
        try {
          await execFileAsync('osascript', ['-e', `tell application "${command.targetApp}" to activate`]);
          await new Promise(resolve => setTimeout(resolve, 400));
        } catch { /* ignore */ }
      }
      const result = await injectKeystrokes(command.text);
      state.actionResult = {
        id: command.id,
        type: 'inject-keystrokes',
        status: result.ok ? 'ok' : 'error',
        message: result.message,
      };
      push();
      return;
    }

    case "glass-preview-diff": {
      // Immediately push "loading" so the renderer shows a spinner
      if (!state.pendingDiffs) state.pendingDiffs = {};
      state.pendingDiffs[command.feedItemId] = {
        feedItemId: command.feedItemId,
        filePath: command.filePath,
        status: "loading",
        code: command.code,
      };
      push();
      // Read current file content
      const readResult = await readFileForDiff(command.filePath);
      if (!readResult.ok) {
        state.pendingDiffs[command.feedItemId] = {
          feedItemId: command.feedItemId,
          filePath: command.filePath,
          status: "error",
          message: readResult.message ?? "Failed to read file",
          code: command.code,
        };
        push();
        return;
      }
      // Compute diff and collapse context
      const diff = computeUnifiedDiff(readResult.content, command.code);
      const displayLines = collapseUnchanged(diff);
      state.pendingDiffs[command.feedItemId] = {
        feedItemId: command.feedItemId,
        filePath: command.filePath,
        status: "ready",
        diff,
        displayLines,
        contentHash: readResult.hash,
        fileExisted: readResult.existed,
        code: command.code,
      };
      push();
      return;
    }

    case "glass-dismiss-diff": {
      if (state.pendingDiffs?.[command.feedItemId]) {
        delete state.pendingDiffs[command.feedItemId];
        push();
      }
      return;
    }

    // ── Build monitor: "Fix with Glass" ──────────────────────────────────────
    case "glass-build-fix-glass": {
      const { errorText, errorFilePaths, feedItemId } = command;

      const workspaceRoot = state.glassSettings.agentCodeWorkspaceRoot?.trim();

      // Graceful fallback: if no project root set, fall back to old AI response path
      if (!workspaceRoot) {
        const fileSections: string[] = [];
        let primaryFilePath: string | null = null;
        for (const rawPath of errorFilePaths.slice(0, 3)) {
          const result = await readFileForDiff(rawPath);
          if (result.ok && result.existed && result.content) {
            const snippet = result.content.length > 4096
              ? result.content.slice(0, 4096) + "\n…(truncated)"
              : result.content;
            fileSections.push(`\`\`\`\n// ${rawPath}\n${snippet}\n\`\`\``);
            if (!primaryFilePath) {
              primaryFilePath = rawPath.startsWith("~/")
                ? join(process.env.HOME ?? "", rawPath.slice(2))
                : rawPath;
            }
          }
        }
        const fileContext = fileSections.length > 0
          ? `\nReferenced source files:\n${fileSections.join("\n\n")}`
          : "";
        const fallbackPrompt = [
          "The Glass dock terminal produced the following build error:",
          "",
          "```",
          errorText.slice(0, 2000),
          "```",
          fileContext,
          "",
          "Identify the root cause and provide the corrected code for the file that needs to be changed.",
          "Return a single fenced code block with the complete corrected file content.",
        ].join("\n");
        if (primaryFilePath) {
          pendingContextSnapshot = {
            appName: null,
            windowTitle: null,
            terminalErrors: [],
            lastCommand: null,
            capturedAt: Date.now(),
            codeContext: {
              fileName: primaryFilePath.split("/").pop() ?? "",
              language: "TypeScript",
              filePath: primaryFilePath,
              content: null,
              fileSizeBytes: null,
            },
          };
        }
        state.commandFeed = state.commandFeed.filter((f) => f.id !== feedItemId);
        void submitCommand(fallbackPrompt, undefined, { taskComplexity: "deep" });
        return;
      }

      state.commandFeed = state.commandFeed.filter((f) => f.id !== feedItemId);
      push();

      const fileList = errorFilePaths.length > 0
        ? `\nFiles referenced in the error:\n${errorFilePaths.map((p) => `- ${p}`).join("\n")}`
        : "";

      const coderPrompt = [
        "Fix this build error from the Glass terminal:",
        "",
        "```",
        errorText.slice(0, 3000),
        "```",
        fileList,
      ].join("\n");

      const screenCtx = errorFilePaths.length > 0
        ? sanitizeAgentScreenContext({
            detectedFilePath: errorFilePaths[0],
            visibleErrors: [errorText.slice(0, 500)],
            confidence: "high",
          }, workspaceRoot)
        : undefined;

      state.lastNotice = narrateToolStart("terminal-coder-trigger", {});
      state.glassIdeActive = true;
      syncIdeChromeFromState();
      try {
        ensureIdeTerminalSession();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        state.lastError = message;
        state.glassDockTerminalOpen = false;
      }
      push();
      broadcast(IPC.openCoderWithPrompt, {
        prompt: coderPrompt,
        autoRun: true,
        screenContext: screenCtx,
        launchNonce: ++coderLaunchNonce,
      });
      return;
    }

    case "glass-apply-fix-to-file": {
      const applyResult = await applyCodeToFile(command.filePath, command.code, command.expectedHash);
      if (!applyResult.ok && applyResult.driftDetected) {
        // File changed on disk since the preview — re-compute diff so card shows updated state
        if (!state.pendingDiffs) state.pendingDiffs = {};
        state.pendingDiffs[command.feedItemId] = {
          feedItemId: command.feedItemId,
          filePath: command.filePath,
          status: "loading",
          code: command.code,
        };
        state.actionResult = {
          id: command.feedItemId + "-apply",
          type: "apply-fix",
          status: "error",
          message: applyResult.message,
        };
        push();
        const reread = await readFileForDiff(command.filePath);
        if (reread.ok) {
          const diff = computeUnifiedDiff(reread.content, command.code);
          const displayLines = collapseUnchanged(diff);
          state.pendingDiffs[command.feedItemId] = {
            feedItemId: command.feedItemId,
            filePath: command.filePath,
            status: "ready",
            diff,
            displayLines,
            contentHash: reread.hash,
            fileExisted: reread.existed,
            code: command.code,
          };
        } else {
          state.pendingDiffs[command.feedItemId] = {
            feedItemId: command.feedItemId,
            filePath: command.filePath,
            status: "error",
            message: reread.message ?? "Failed to re-read file",
            code: command.code,
          };
        }
        push();
        return;
      }
      state.actionResult = {
        id: command.feedItemId + "-apply",
        type: "apply-fix",
        status: applyResult.ok ? "ok" : "error",
        message: applyResult.message,
      };
      if (applyResult.ok) {
        // Clear diff preview on successful apply
        delete state.pendingDiffs?.[command.feedItemId];
        // Auto-verify build for TS/JS files (#163)
        if (/\.(t|j)sx?$/.test(command.filePath)) {
          void handleCommand({
            type: "glass-verify-build",
            feedItemId: command.feedItemId,
            filePath: command.filePath,
          });
        }
      }
      push();
      return;
    }

    // ── Design-to-Code Bridge (#163) ─────────────────────────────────────────

    case "design-capture": {
      // Capture screen (independent from the existing capture button flow)
      const imageDataUrl = await handleCapture();
      if (!imageDataUrl) {
        // handleCapture already sets state.lastError; nothing more to do
        return;
      }

      // Detect editor app and file from current window context
      const wCtx = state.windowContext;
      const appName = wCtx.status === "available" ? (wCtx.appName ?? null) : null;
      const windowTitle = wCtx.status === "available" ? (wCtx.windowTitle ?? null) : null;

      let detectedFile: { fileName: string; filePath: string | null; language: string } | null = null;
      if (isEditorAppName(appName)) {
        const fileName = parseFileNameFromTitle(windowTitle);
        if (fileName) {
          const language = detectLanguage(fileName);
          detectedFile = { fileName, filePath: null, language };
        }
      }

      const feedItem = createCommandFeedItem("design-capture", "", {
        designImageDataUrl: imageDataUrl,
        designDetectedFileName: detectedFile?.fileName,
      });
      const captureId = feedItem.id;
      if (!state.designCaptures) state.designCaptures = {};
      state.designCaptures[captureId] = {
        feedItemId: captureId,
        imageDataUrl,
        detectedFile,
        phase: "ready",
      };
      pushFeed(feedItem);
      push();

      // Asynchronously resolve the file path (best-effort) and backfill into state
      if (detectedFile && appName && windowTitle) {
        readCodeContext({ appName, windowTitle, hintPaths: [] })
          .then((ctx) => {
            if (ctx?.filePath && state.designCaptures?.[captureId]?.detectedFile) {
              state.designCaptures[captureId].detectedFile = {
                fileName: ctx.fileName,
                filePath: ctx.filePath,
                language: ctx.language,
              };
              push();
            }
          })
          .catch(() => { /* best-effort */ });
      }
      return;
    }

    case "design-generate": {
      const { feedItemId, action } = command;
      const refinementFeedback = command.refinementFeedback;
      const capture = state.designCaptures?.[feedItemId];
      if (!capture) return;

      if (action === "match-codebase" && capture.detectedFile?.filePath) {
        // Need file content — ask permission first; stash feedback so grant/skip can carry it through
        capture.phase = "permission";
        capture.pendingAction = action;
        capture.pendingRefinementFeedback = refinementFeedback;
        capture.statusLine = `Allow Glass to read ${capture.detectedFile.fileName}?`;
        push();
      } else {
        // No file read needed — generate immediately
        void runDesignGeneration(feedItemId, action, false, { refinementFeedback });
      }
      return;
    }

    case "design-grant-file-read": {
      const { feedItemId, action } = command;
      const grantCapture = state.designCaptures?.[feedItemId];
      const pendingFeedback = grantCapture?.pendingRefinementFeedback;
      void runDesignGeneration(feedItemId, action, true, pendingFeedback ? { refinementFeedback: pendingFeedback } : undefined);
      return;
    }

    case "design-skip-file-read": {
      const { feedItemId, action } = command;
      const skipCapture = state.designCaptures?.[feedItemId];
      const pendingFeedback = skipCapture?.pendingRefinementFeedback;
      void runDesignGeneration(feedItemId, action, false, pendingFeedback ? { refinementFeedback: pendingFeedback } : undefined);
      return;
    }

    case "set-design-stack": {
      const { stack } = command;
      state.glassSettings.designStack = stack;
      push();
      void persistGlassUserSettings(state.glassSettings);
      return;
    }

    case "glass-restore-backup": {
      const { feedItemId, filePath } = command;
      const result = await restoreBackup(filePath);
      state.actionResult = {
        id: feedItemId + "-restore",
        type: "restore-backup",
        status: result.ok ? "ok" : "error",
        message: result.message,
      };
      push();
      return;
    }

    case "glass-verify-build": {
      const { feedItemId, filePath } = command;
      const buildCmd = await resolveBuildCommand(filePath);
      if (!state.buildVerifications) state.buildVerifications = {};
      if (!buildCmd) {
        state.buildVerifications[feedItemId] = {
          feedItemId,
          status: "not-found",
          command: "",
        };
        push();
        return;
      }
      state.buildVerifications[feedItemId] = {
        feedItemId,
        status: "running",
        command: buildCmd.cmd,
      };
      push();
      // Run build in a background process and update state when done.
      // The dock terminal is NOT used here to avoid double-execution — the build
      // monitor on the dock PTY handles any errors from manually-run builds separately.
      void checkBuildSuccess(feedItemId, buildCmd);
      return;
    }

    // ── Custom slash commands (#165) ─────────────────────────────────────────

    case "refresh-omniparser-install": {
      refreshOmniParserInstall();
      push();
      return;
    }

    case "run-omniparser-install": {
      const installCmd = buildOmniParserInstallTerminalCommand();
      if (!installCmd) {
        console.warn("[omniparser] install unavailable — sidecar not found");
        return;
      }
      if (isPanelVisible()) closePanel();
      await handleCommand({ type: "glass-terminal-run", command: installCmd });
      return;
    }

    case "glass-terminal-run": {
      if (!state.glassDockTerminalOpen || !state.glassDockTerminalId) {
        await handleCommand({ type: "glass-terminal-open" });
      }
      if (state.glassIdeActive) {
        dispatchIdeChromeSignal({ kind: "terminal-run" });
      }
      const runCmd = command.command;
      setTimeout(() => {
        const termId = state.glassDockTerminalId;
        if (termId) writePtyInput(termId, `${runCmd}\n`);
      }, 300);
      return;
    }

    case "glass-ide-open-file": {
      const rel = typeof command.relativePath === "string"
        ? command.relativePath.trim().replace(/\\/g, "/")
        : "";
      if (!rel || !state.glassIdeActive) return;
      broadcast(IPC.glassIdeOpenFile, { relativePath: rel });
      return;
    }

    case "glass-ide-voice-command": {
      const transcript = typeof command.transcript === "string" ? command.transcript.trim() : "";
      if (!transcript || !state.glassIdeActive) return;
      void (async () => {
        const ctx = getGlassIdeEditorContext();
        const intent = matchGlassIdeEditorVoiceIntent(transcript, ctx);
        if (!intent) return;
        const workspaceRoot = state.glassSettings.agentCodeWorkspaceRoot?.trim() ?? "";
        if (intent.kind === "open_file") {
          if (!workspaceRoot) return;
          const rel = await resolveGlassIdeVoiceFileQuery(workspaceRoot, intent.query);
          if (rel) broadcast(IPC.glassIdeOpenFile, { relativePath: rel });
          return;
        }
        if (intent.kind === "explain_selection" || intent.kind === "what_changed") {
          await handleCommand({
            type: "open-coder-with-prompt",
            prompt: intent.prompt,
            autoRun: true,
          });
        }
      })();
      return;
    }

    case "open-coder-with-prompt": {
      const { prompt, autoRun, screenContext } = command;
      const enrichedPrompt = enrichAgentPromptForIde(prompt, state.glassIdeActive === true);
      void (async () => {
        let ctx = screenContext;
        const workspaceRoot = state.glassSettings.agentCodeWorkspaceRoot?.trim();
        if (!ctx && state.glassSettings.screenContextEnabled !== false) {
          ctx = await detectAgentScreenContextFromCapture(async () => {
            const display = screen.getPrimaryDisplay();
            return captureDisplayById(display.id, "Primary Display");
          }, SCREEN_DETECT_TIMEOUT_MS);
        }
        if (ctx && workspaceRoot) {
          ctx = sanitizeAgentScreenContext(ctx, workspaceRoot);
        }
        state.glassIdeActive = true;
        syncIdeChromeFromState();
        try {
          ensureIdeTerminalSession();
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          state.lastError = message;
          state.glassDockTerminalOpen = false;
        }
        push();
        broadcast(IPC.openCoderWithPrompt, {
          prompt: enrichedPrompt,
          autoRun: autoRun !== false && ctx?.confidence === "high",
          screenContext: ctx,
          launchNonce: ++coderLaunchNonce,
        });
      })();
      return;
    }

    case "set-glass-coder-settings": {
      state.glassSettings = { ...state.glassSettings, ...command.patch };
      glassUserSettings = state.glassSettings;
      void persistGlassUserSettings(state.glassSettings);
      push();
      return;
    }

    case "custom-command-run": {
      const { name } = command;
      const cmd = (state.customCommands ?? []).find((c) => c.name === name);
      if (!cmd) {
        console.warn(`[custom-command] No command found with name "${name}"`);
        return;
      }

      switch (cmd.action.type) {
        case "shell": {
          // Show output in the dock terminal.
          // Check both glassDockTerminalOpen and glassDockTerminalId — the PTY
          // may have exited without clearing the open flag.
          if (!state.glassDockTerminalOpen || !state.glassDockTerminalId) {
            await handleCommand({ type: "glass-terminal-open" });
          }
          const shellAction = cmd.action;
          // Small delay to let terminal render before sending input
          setTimeout(() => {
            const termId = state.glassDockTerminalId;
            if (termId) writePtyInput(termId, shellAction.command + "\n");
          }, 150);
          return;
        }

        case "prompt": {
          // Send the preset text directly to Glass AI
          await submitCommand(cmd.action.text, null);
          return;
        }

        case "shell-then-prompt": {
          const { command: shellCmd, prompt: promptText } = cmd.action;
          const cmdName = cmd.name;
          // Show a "Running…" feed card while the command executes
          const feedItem = createCommandFeedItem(
            "shell",
            `Running /${cmdName}…`,
            { title: `/${cmdName}` },
          );
          pushFeed(feedItem);
          // Use a ref object to avoid TS control-flow narrowing issues
          const cancelRef = { fn: null as (() => void) | null };
          try {
            // runShellCommand is callback-based — wrap in a Promise.
            // Always resolve (even on non-zero exit) so Glass AI can explain
            // failures — that's the primary use-case for shell-then-prompt.
            const output = await new Promise<string>((resolve) => {
              let buf = "";
              cancelRef.fn = runShellCommand(
                shellCmd,
                (chunk) => { buf += chunk; },
                (exitCode) => {
                  cancelRef.fn = null;
                  if (exitCode !== null && exitCode !== 0) {
                    buf = `[exited with code ${exitCode}]\n${buf}`;
                  }
                  resolve(buf);
                },
              );
            });
            const fullPrompt = buildShellThenPromptText(promptText, output);
            await submitCommand(fullPrompt, null);
          } catch (err) {
            // Cancel any in-flight process on unexpected error
            cancelRef.fn?.();
            cancelRef.fn = null;
            const errItem = createCommandFeedItem(
              "error",
              `/${cmdName} failed: ${String(err)}`,
              { title: `/${cmdName} error` },
            );
            pushFeed(errItem);
          }
          return;
        }
      }
      return;
    }

    // ── Glass built-in terminal (PTY) ────────────────────────────────────────

    case "glass-terminal-open": {
      if (state.glassIdeActive) {
        try {
          ensureIdeTerminalSession();
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          state.lastError = message;
          state.glassDockTerminalOpen = false;
          push();
          return;
        }
        dispatchIdeChromeSignal({
          kind: "user-set-expanded",
          expanded: true,
          manual: true,
        });
        return;
      }
      try {
        ensureGlassTerminalSession();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        state.lastError = message;
        state.glassDockTerminalOpen = false;
        push();
        return;
      }
      state.glassDockTerminalOpen = true;
      push();
      showGlassTerminalWindowUnlessIde();
      if (process.env.ELECTRON_RENDERER_URL) {
        console.info("[IIVO Glass] glass-terminal-open", {
          termId: state.glassDockTerminalId,
          bounds: getWindows()?.terminal?.getBounds(),
        });
      }
      return;
    }

    case "glass-terminal-close": {
      if (state.glassIdeActive) {
        dispatchIdeChromeSignal({
          kind: "user-set-expanded",
          expanded: false,
          manual: true,
        });
        return;
      }
      state.glassDockTerminalOpen = false;
      push();
      scheduleDismissGlassTerminalWindow();
      return;
    }

    case "glass-terminal-new-tab": {
      try {
        spawnGlassDockPtySession();
        state.glassDockTerminalOpen = true;
        push();
        showGlassTerminalWindowUnlessIde();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        state.lastError = message;
        push();
      }
      return;
    }

    case "glass-terminal-switch-tab": {
      const { termId } = command;
      if (termId && getActivePtySessionIds().includes(termId)) {
        state.glassDockTerminalId = termId;
        push();
      }
      return;
    }

    case "glass-terminal-close-tab": {
      const termId = command.termId ?? state.glassDockTerminalId;
      if (termId) {
        killGlassDockTerminalTab(termId);
        if (!pickLiveTerminalTabId()) {
          clearTerminalContext();
          state.glassDockTerminalOpen = false;
          scheduleDismissGlassTerminalWindow();
        }
      }
      push();
      return;
    }

    case "glass-terminal-action": {
      const { action } = command;
      try {
        ensureGlassTerminalSession();
        state.glassDockTerminalOpen = true;
        dispatchTerminalPanelAction(action);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        state.lastError = message;
        push();
      }
      return;
    }

    case "glass-terminal-kill": {
      const termId = state.glassDockTerminalId;
      if (termId) {
        killGlassDockTerminalTab(termId);
      }
      if (!pickLiveTerminalTabId()) {
        clearTerminalContext();
        state.glassDockTerminalOpen = false;
        scheduleDismissGlassTerminalWindow();
      }
      push();
      return;
    }

    case "glass-terminal-pending-action-ack": {
      state.glassTerminalPendingAction = undefined;
      push();
      return;
    }

    case "glass-ide-terminal-set-expanded": {
      if (!state.glassIdeActive) return;
      dispatchIdeChromeSignal({
        kind: "user-set-expanded",
        expanded: command.expanded,
        manual: command.manual,
      });
      return;
    }

    case "glass-ide-terminal-interaction": {
      if (!state.glassIdeActive) return;
      dispatchIdeChromeSignal({ kind: "terminal-interaction" });
      return;
    }

    // ── Terminal auto-fix accept ───────────────────────────────────────────────
    // User clicked "Fix it" on the overlay card — type the fix into the PTY.
    case "glass-terminal-fix-accept": {
      const { termId, command: fixCmd } = command;
      if (termId && fixCmd) {
        // Ensure terminal panel is visible so user can see the fix running
        if (!state.glassDockTerminalOpen) {
          state.glassDockTerminalOpen = true;
          push();
          showGlassTerminalWindowUnlessIde();
        }
        // Write the fix command + Enter to the PTY
        writePtyInput(termId, `${fixCmd}\r`);
      }
      return;
    }

    // ── Context assembler ──────────────────────────────────────────────────────
    // ⌘⇧G: snapshot current window + terminal context, store it, focus command
    // bar. The user types their question; the next submitCommand() call picks up
    // the snapshot and prepends it to the prompt automatically.
    case "glass-context-ask": {
      const wCtx = state.windowContext;
      const termLines = liveTerminalState?.lines ?? [];
      const appName = wCtx.status === "available" ? (wCtx.appName ?? null) : null;
      const windowTitle = wCtx.status === "available" ? (wCtx.windowTitle ?? null) : null;

      // Capture base snapshot immediately — code context enrichment is async
      pendingContextSnapshot = {
        appName,
        windowTitle,
        terminalErrors: termLines
          .filter((l) => l.kind === "error")
          .slice(-3)
          .map((l) => l.text),
        lastCommand:
          liveTerminalState?.activeCommand ??
          termLines.filter((l) => l.kind === "command").slice(-1)[0]?.text ??
          null,
        capturedAt: Date.now(),
        codeContext: null,
      };

      // ── Code-aware injection: enrich snapshot if user is in an editor ─────
      // Runs concurrently — result lands in the snapshot before the user
      // finishes typing their question (typically 2-5s slack).
      const wingmanRepoPath: string | undefined =
        (state as { wingman?: { session?: { gitRepoPath?: string } } })
          .wingman?.session?.gitRepoPath;
      void readCodeContext({
        appName,
        windowTitle,
        hintPaths: wingmanRepoPath ? [wingmanRepoPath] : [],
      }).then((ctx) => {
        // Only store if the snapshot hasn't been consumed yet
        if (pendingContextSnapshot) {
          pendingContextSnapshot.codeContext = ctx;
        }
      }).catch(() => {
        /* best-effort, ignore */
      });

      // Focus the command bar so the user can type their question immediately
      const overlayWin = getWindows()?.overlay;
      if (overlayWin && !overlayWin.isDestroyed()) {
        overlayWin.webContents.send(IPC.commandBarFocus);
      }
      return;
    }

    // ── Glass Powers Menu ──────────────────────────────────────────────────
    case "toggle-powers-menu": {
      state.powersMenuOpen = !state.powersMenuOpen;
      if (state.powersMenuOpen) {
        state.commandPaletteOpen = false;
        setCommandPaletteOpen(false);
      }
      setPowersMenuOpen(state.powersMenuOpen);
      push();
      return;
    }

    case "dismiss-powers-menu": {
      if (state.powersMenuOpen) {
        state.powersMenuOpen = false;
        setPowersMenuOpen(false);
        push();
      }
      return;
    }

    // ── Glass Command Palette (Task #66) ─────────────────────────────────────
    case "toggle-command-palette": {
      state.commandPaletteOpen = !state.commandPaletteOpen;
      if (state.commandPaletteOpen) {
        state.powersMenuOpen = false;
        setPowersMenuOpen(false);
      }
      setCommandPaletteOpen(state.commandPaletteOpen);
      push();
      return;
    }

    case "dismiss-command-palette": {
      if (state.commandPaletteOpen) {
        state.commandPaletteOpen = false;
        setCommandPaletteOpen(false);
        push();
      }
      return;
    }

    case "open-answer-panel": {
      if (!state.lastAskResponse) {
        state.lastNotice = "Ask Glass in the command bar first — then use Answer Panel to reopen long answers.";
        push();
        return;
      }
      state.responsePanelRevealSeq = (state.responsePanelRevealSeq ?? 0) + 1;
      push();
      return;
    }

    case "open-terminal": {
      try {
        ensureGlassTerminalSession();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        state.lastError = message;
        state.glassDockTerminalOpen = false;
        push();
        return;
      }
      state.glassDockTerminalOpen = true;
      push();
      showGlassTerminalWindowUnlessIde();
      return;
    }

    case "terminal-nl-focus": {
      try {
        ensureGlassTerminalSession();
        state.glassDockTerminalOpen = true;
        dispatchTerminalPanelAction("nl-focus");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        state.lastError = message;
        push();
        return;
      }
      push();
      showGlassTerminalWindowUnlessIde();
      return;
    }

    case "terminal-explain-last": {
      try {
        ensureGlassTerminalSession();
        state.glassDockTerminalOpen = true;
        dispatchTerminalPanelAction("explain");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        state.lastError = message;
        push();
        return;
      }
      push();
      showGlassTerminalWindowUnlessIde();
      return;
    }

    case "clear-terminal": {
      try {
        ensureGlassTerminalSession();
        state.glassDockTerminalOpen = true;
        dispatchTerminalPanelAction("clear");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        state.lastError = message;
        push();
        return;
      }
      push();
      showGlassTerminalWindowUnlessIde();
      return;
    }

    case "terminal-fix-last": {
      void runPaletteTerminalFixLast();
      return;
    }

    case "explain-clipboard": {
      void runPaletteExplainClipboard();
      return;
    }

    // ── Sorting Hat TTS + onboarding ─────────────────────────────────────────

    case "glass-tts-timed": {
      const { text } = command;
      if (!text?.trim()) return;
      try {
        const timed = await fetchGlassTtsTimedBuffer(text);
        if (!timed?.data) {
          console.error("[Glass TTS] glass-tts-timed: no audio");
          state.ttsAudio = { id: `failed-${Date.now()}`, data: "" };
          push();
          setTimeout(() => {
            state.ttsAudio = undefined;
            push();
          }, 500);
          return;
        }
        const plan = state.companionPresence?.guidancePlan;
        if (timed.alignment && plan?.speech?.length) {
          timed.segmentTimings = buildSegmentTimings(plan.speech, timed.alignment);
        }
        state.ttsAudio = timed;
        console.log(
          `[Glass TTS] glass-tts-timed: sent ${timed.data.length} b64 chars, segments=${timed.segmentTimings?.length ?? 0}`,
        );
        push();
        setTimeout(() => {
          state.ttsAudio = undefined;
          push();
        }, 30_000);
      } catch (e) {
        console.error("[Glass TTS] timed fetch failed", e);
      }
      return;
    }

    case "glass-tts": {
      const { text } = command;
      if (!text?.trim()) return;
      try {
        const buf = await fetchGlassTtsBuffer(text);
        if (!buf) {
          console.error(
            "[Glass TTS] glass-tts: no audio (check ELEVENLABS_API_KEY in desktop-glass/.env or repo .env)",
          );
          state.ttsAudio = { id: `failed-${Date.now()}`, data: "" };
          push();
          setTimeout(() => {
            state.ttsAudio = undefined;
            push();
          }, 500);
          return;
        }
        state.ttsAudio = { id: Date.now().toString(), data: buf.toString("base64") };
        console.log(`[Glass TTS] glass-tts: sent ${buf.length} bytes to overlay`);
        push();
        // Keep in state long enough for overlay to receive + start playback.
        setTimeout(() => {
          state.ttsAudio = undefined;
          push();
        }, 15_000);
      } catch (e) {
        console.error("[Glass TTS] fetch failed", e);
      }
      return;
    }

    case "glass-onboarding-complete": {
      await finishSortingHatOnboarding(command.persona);
      return;
    }

    case "glass-onboarding-skip": {
      await finishSortingHatOnboarding();
      return;
    }

    case "glass-onboarding-recalibrate": {
      await beginSortingHatRecalibration();
      return;
    }

    case "e2e-open-sorting-hat":
      if (process.env.IIVO_GLASS_E2E === "1") {
        await beginSortingHatRecalibration();
      }
      return;

    case "dev-open-onboarding":
      if (!app.isPackaged) {
        await beginSortingHatRecalibration();
        console.log("[IIVO Glass] Sorting Hat opened (dev-open-onboarding)");
      }
      return;

    default:
      if (await handleCopilotCommand(command)) return;
      await handleSessionCommand(command);
      return;
  }
}

// ─── Glass Command Palette helpers (Task #66) ───────────────────────────────────

async function runPaletteTerminalFixLast(): Promise<void> {
  const block = getLastTerminalErrorBlock();
  if (!block) {
    state.lastNotice = "No failed terminal command to fix.";
    push();
    return;
  }

  try {
    ensureGlassTerminalSession();
    state.glassDockTerminalOpen = true;
    showGlassTerminalWindowUnlessIde();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    state.lastError = message;
    push();
    return;
  }

  try {
    const prompt = buildTerminalFixPrompt(
      block.command,
      block.output,
      block.exitCode ?? 1,
    );
    const response = await askIivoGlass(config, {
      prompt,
      modelPurpose: "default",
      responseStyle: "full",
    });
    const raw = response.answer?.trim() ?? "";
    if (!raw) {
      state.lastNotice = "Could not generate a fix.";
      push();
      return;
    }
    const parsed = parseTerminalFixResponse(raw);
    const termId = state.glassDockTerminalId;
    if (parsed.fixedCommand && termId) {
      pushFeed(
        createCommandFeedItem("terminal-fix", parsed.diagnosis ?? "Suggested fix", {
          title: "Glass Terminal",
          termId,
          fixCommand: parsed.fixedCommand,
          failedCommand: block.command,
          fullBody: [parsed.diagnosis, parsed.whatChanged].filter(Boolean).join("\n\n"),
        }),
      );
    } else {
      state.lastNotice = parsed.diagnosis ?? "No fix found for the last error.";
    }
    push();
  } catch (err) {
    state.lastNotice = err instanceof Error ? err.message : "Fix request failed";
    push();
  }
}

async function runPaletteExplainClipboard(): Promise<void> {
  let text = "";
  try {
    text = clipboard.readText().trim();
  } catch {
    text = "";
  }
  if (!text) {
    state.lastNotice = "Clipboard is empty.";
    push();
    return;
  }

  state.lastNotice = "Explaining clipboard…";
  push();

  try {
    const prompt = [
      "Explain the following text in plain English. Be concise (2–4 sentences).",
      "If it looks like code or an error message, say what it means and what to do next.",
      "",
      text.slice(0, 4000),
    ].join("\n");
    const response = await askIivoGlass(config, { prompt, modelPurpose: "default" });
    const answer = response.answer?.trim();
    if (!answer) {
      state.lastNotice = "Could not explain clipboard contents.";
      push();
      return;
    }
    pushFeed(
      createCommandFeedItem("response", answer, {
        title: "Clipboard explained",
        fullBody: answer,
      }),
    );
    state.lastNotice = undefined;
    push();
  } catch (err) {
    state.lastNotice = err instanceof Error ? err.message : "Explain failed";
    push();
  }
}

// ─── Terminal auto-fix ────────────────────────────────────────────────────────

/**
 * Called when the Glass built-in terminal exits with a non-zero code.
 * Asks the AI what went wrong and how to fix it, then pushes a "terminal-fix"
 * overlay card with the suggestion and a one-click "Fix it" button.
 */
async function handleTerminalAutoFix(
  termId: string,
  exitCode: number,
  context: import("./glassTerminal.ts").GlassTerminalExitContext,
): Promise<void> {
  const { lastCommand, outputLines } = context;
  if (!lastCommand) return;

  // Filter noise — blank lines, pure whitespace, shell prompts
  const meaningfulLines = outputLines
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.match(/^[\$%>#]\s/))
    .slice(-30); // last 30 meaningful lines

  // Build the AI prompt
  const outputText = meaningfulLines.join("\n");
  const prompt = [
    `The user ran this command in the Glass Terminal and it failed (exit code ${exitCode}):`,
    ``,
    `Command: ${lastCommand}`,
    ``,
    outputText ? `Terminal output:\n${outputText}` : "(no output captured)",
    ``,
    `In 1-2 sentences explain what went wrong. Then on a new line write exactly:`,
    `FIX: <the corrected command>`,
    ``,
    `Only output one FIX line. If no single-command fix exists, write FIX: none`,
  ].join("\n");

  try {
    const response = await askIivoGlass(config, { prompt, modelPurpose: "default" });
    const answer = response.answer?.trim() ?? "";
    if (!answer) return;

    // Parse explanation and fix command
    const fixMatch = answer.match(/^FIX:\s*(.+)$/im);
    const fixCommand = fixMatch?.[1]?.trim() ?? null;
    const explanation = answer.replace(/^FIX:.*$/im, "").trim();

    // Don't surface a card if there's no actionable fix
    if (!fixCommand || fixCommand === "none") {
      if (explanation) {
        pushFeed(
          createCommandFeedItem("error", explanation, {
            title: "Terminal error",
            failedCommand: lastCommand,
          }),
        );
        push();
      }
      return;
    }

    // Push the fix card — "Fix it" button will dispatch glass-terminal-fix-accept
    pushFeed(
      createCommandFeedItem("terminal-fix", explanation, {
        title: "Glass Terminal",
        termId,
        fixCommand,
        failedCommand: lastCommand,
        fullBody: explanation,
      }),
    );
    push();
  } catch (err) {
    console.warn("[terminal-auto-fix] AI call failed:", err);
  }
}

// ── Build monitor helper (#162) ───────────────────────────────────────────────

/**
 * Called (debounced) after each PTY data chunk. Runs parseTerminalOutput on
 * the rolling buffer and pushes a "build-error" feed card if a new build
 * error is detected that hasn't been surfaced yet for this session.
 */
async function checkBuildMonitor(termId: string, bufLines: string[]): Promise<void> {
  if (appIsQuitting) return;
  // Only surface cards when Glass is active (listening or capturing)
  // No additional gate — terminal auto-fix fires unconditionally too

  const { parseTerminalOutput, extractErrorFileRefs } =
    await import("../shared/terminalEvents.ts");

  const text = bufLines.join("\n");
  const events = parseTerminalOutput(text, { source: "Glass Terminal" });
  const buildErr = events.find((e) => e.type === "build_error" || e.type === "test_failure");
  if (!buildErr) return;

  // Dedup: don't push the same error twice for this session
  const fp = `${buildErr.type}:${buildErr.snippet.slice(0, 60)}`;
  if (buildMonitorLastFingerprint.get(termId) === fp) return;
  buildMonitorLastFingerprint.set(termId, fp);

  // Extract file refs from the full buffer for "Fix with AI" context
  const fileRefs = extractErrorFileRefs(text);

  pushFeed(
    createCommandFeedItem("build-error", buildErr.snippet, {
      title: buildErr.type === "test_failure" ? "Test failure" : "Build error",
      errorText: text.split("\n").filter((l) => l.trim()).slice(-40).join("\n"),
      errorFilePaths: fileRefs,
    }),
  );
  push();
}

// ── Design-to-Code helpers (#163) ────────────────────────────────────────────

/**
 * Core generation helper called after permission is resolved.
 * - If readFile is true and the capture has a resolved filePath, reads the file for codebase context.
 * - Builds the appropriate prompt via buildDesignToCodePrompt.
 * - Fires submitCommand with presetImageDataUrl so the pre-captured design image is sent to the AI instead of a fresh screen capture.
 */
async function runDesignGeneration(
  feedItemId: string,
  action: DesignToCodeAction,
  readFile: boolean,
  opts?: { refinementFeedback?: string },
): Promise<void> {
  const capture = state.designCaptures?.[feedItemId];
  if (!capture) return;

  // Snapshot the stack immediately — before any async gaps — so that a user
  // changing the picker while file-read is in progress doesn't corrupt this run (#163-F).
  const stack: DesignStack = state.glassSettings.designStack ?? DEFAULT_DESIGN_STACK;

  // Phase: reading (if applicable)
  const filePath = capture.detectedFile?.filePath ?? null;
  let fileContent: string | null = null;
  let importedFiles: import("../shared/designToCode.ts").ImportedFileContext[] = [];

  if (readFile && filePath) {
    capture.phase = "reading";
    capture.statusLine = `Reading ${capture.detectedFile!.fileName}…`;
    push();
    try {
      const result = await readFileForDiff(filePath);
      if (result.ok && result.existed) {
        fileContent = result.content.length > 4_000
          ? result.content.slice(0, 4_000) + "\n…(truncated)"
          : result.content;

        // #164 — pull in imported files for richer AI context
        capture.statusLine = `Reading imports of ${capture.detectedFile!.fileName}…`;
        push();
        try {
          const graph = await readImportGraph(filePath, result.content);
          importedFiles = graph.map((f) => ({
            fileName: f.fileName,
            language: f.language,
            filePath: f.filePath,
            content: f.content,
          }));
        } catch {
          // best-effort — proceed without import graph
        }
      }
    } catch {
      // best-effort — generate without codebase context
    }
  }

  // Phase: generating
  capture.phase = "generating";
  capture.pendingAction = action;
  capture.statusLine = "Generating…";
  push();

  const ctx: import("../shared/designToCode.ts").DesignToCodeContext = {
    fileName: capture.detectedFile?.fileName ?? null,
    language: capture.detectedFile?.language ?? null,
    filePath,
    content: fileContent,
    importedFiles: importedFiles.length > 0 ? importedFiles : undefined,
  };

  const prompt = buildDesignToCodePrompt(action, ctx, stack, opts?.refinementFeedback);

  // Inject the captured design image directly — bypasses resolveScreenshotForVisualAsk
  // so the AI receives the design thumbnail rather than a fresh live capture.
  // match-codebase includes full import graph + file content — use the strongest model.
  await submitCommand(prompt, null, {
    presetImageDataUrl: capture.imageDataUrl,
    codeFilePath: filePath ?? undefined,
    designAction: action,
    designStack: stack,
    designCaptureId: feedItemId,
    taskComplexity: action === "match-codebase" ? "deep" : "standard",
  });

  // Phase: done — mark the card so renderer can show the response link
  if (state.designCaptures?.[feedItemId]) {
    state.designCaptures[feedItemId].phase = "done";
    state.designCaptures[feedItemId].statusLine = undefined;
    state.designCaptures[feedItemId].pendingRefinementFeedback = undefined;
    push();
  }
}

/**
 * Walk up from the directory containing `filePath` to find the nearest project root
 * that has a tsconfig.json or a package.json with a "build" script.
 *
 * Returns { cmd, cwd } or null if nothing is found.
 */
async function resolveBuildCommand(
  filePath: string,
): Promise<{ cmd: string; cwd: string } | null> {
  const { promises: fsp, existsSync } = await import("node:fs");
  const nodePath = await import("node:path");

  const expandedPath = filePath.startsWith("~/")
    ? nodePath.join(process.env.HOME ?? "", filePath.slice(2))
    : filePath;
  let dir = nodePath.dirname(nodePath.resolve(expandedPath));

  const home = process.env.HOME ?? "";
  // Walk up to home dir — don't escape it
  for (let depth = 0; depth < 12; depth++) {
    // Check for tsconfig.json → use tsc --noEmit
    if (existsSync(nodePath.join(dir, "tsconfig.json"))) {
      // Prefer "npm run build" if package.json has a build script, else tsc --noEmit
      const pkgPath = nodePath.join(dir, "package.json");
      if (existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(await fsp.readFile(pkgPath, "utf8")) as { scripts?: Record<string, string> };
          if (pkg.scripts?.["build"]) {
            return { cmd: "npm run build", cwd: dir };
          }
          if (pkg.scripts?.["typecheck"] ?? pkg.scripts?.["type-check"]) {
            const scriptKey = pkg.scripts?.["typecheck"] !== undefined ? "typecheck" : "type-check";
            return { cmd: `npm run ${scriptKey}`, cwd: dir };
          }
        } catch {
          /* parse error — fall through to tsc */
        }
      }
      return { cmd: "npx tsc --noEmit", cwd: dir };
    }
    // Check for package.json with a build script
    const pkgPath = nodePath.join(dir, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(await fsp.readFile(pkgPath, "utf8")) as { scripts?: Record<string, string> };
        if (pkg.scripts?.["build"]) {
          return { cmd: "npm run build", cwd: dir };
        }
      } catch {
        /* parse error — continue */
      }
    }
    const parent = nodePath.dirname(dir);
    if (parent === dir || (home && !dir.startsWith(home))) break;
    dir = parent;
  }
  return null;
}

/**
 * Spawn a silent background build to detect success or failure,
 * then update buildVerifications accordingly.
 * The user can already watch output in the dock terminal (where the same command runs).
 */
async function checkBuildSuccess(
  feedItemId: string,
  buildCmd: { cmd: string; cwd: string },
): Promise<void> {
  const { parseTerminalOutput, extractErrorFileRefs } =
    await import("../shared/terminalEvents.ts");

  return new Promise<void>((resolve) => {
    let output = "";
    runShellCommand(
      `cd ${JSON.stringify(buildCmd.cwd)} && ${buildCmd.cmd} 2>&1`,
      (chunk) => { output += chunk; },
      (exitCode) => {
        if (appIsQuitting) { resolve(); return; }
        if (!state.buildVerifications) state.buildVerifications = {};
        const events = parseTerminalOutput(output, { source: "verify-build" });
        const hasError =
          exitCode !== 0 ||
          events.some((e) => e.type === "build_error" || e.type === "test_failure");

        state.buildVerifications[feedItemId] = {
          feedItemId,
          status: hasError ? "failed" : "ok",
          command: buildCmd.cmd,
        };
        if (hasError) {
          const fileRefs = extractErrorFileRefs(output);
          const snippet = events.find((e) => e.type === "build_error" || e.type === "test_failure")?.snippet
            ?? output.trim().split("\n").slice(-3).join("\n");
          // Dedup: skip if the PTY build monitor already surfaced the same error
          // (same fingerprint = same leading 80 chars of snippet)
          const verifyFp = `verify:${snippet.slice(0, 80)}`;
          const termId = state.glassDockTerminalId ?? "";
          if (buildMonitorLastFingerprint.get(termId) !== verifyFp) {
            buildMonitorLastFingerprint.set(termId, verifyFp);
            pushFeed(
              createCommandFeedItem("build-error", snippet, {
                title: "Build error",
                errorText: output.slice(-2000),
                errorFilePaths: fileRefs,
              }),
            );
          }
        }
        push();
        resolve();
      },
    );
  });
}

// ── Clipboard Intelligence handler ────────────────────────────────────────────

async function handleClipboardIntelligence(
  text: string,
  cls: import("./clipboardIntelligence.ts").ClipboardClassification,
): Promise<void> {
  const isError = cls.kind === "error";

  // Push a thinking card so the user sees Glass is responding
  pushFeed(
    createCommandFeedItem(
      "thinking",
      isError
        ? "Glass noticed an error in your clipboard — diagnosing…"
        : "Glass noticed code in your clipboard — reviewing…",
    ),
  );
  push();

  try {
    const prompt = isError
      ? buildErrorPrompt(text)
      : buildCodePrompt(text, cls.language);

    const response = await askIivoGlass(config, { prompt, modelPurpose: "default" });
    const answer = response.answer?.trim() ?? "";
    if (!answer) return;

    // Mark fired BEFORE pushing card so a rapid re-copy during AI call doesn't double-fire
    clipboardIntelGate.markFired(text);

    pushFeed(
      createCommandFeedItem("response", answer, {
        title: isError ? "Glass · Clipboard error" : "Glass · Clipboard review",
        fullBody: answer,
        prompt,
      }),
    );
    push();
  } catch (err) {
    console.warn("[clipboard-intel] AI call failed:", err);
    // Do NOT markFired on error so the next identical copy can retry
  }
}

function persistCopilotConfig(config: GlassCopilotConfig): void {
  glassUserSettings = { ...glassUserSettings, copilot: config };
  state.glassSettings = glassUserSettings;
  copilot.setConfig(config);
  void persistGlassUserSettings(glassUserSettings);
}

/** Build a deterministic debrief, optionally enriched by a direct (non-Council) AI pass. */
async function maybeSemanticRefineForDebrief(): Promise<void> {
  if (copilot.isSessionTypeRefined()) return;
  const windowCtx = getCachedWindowContext();
  const signals = {
    appName: windowCtx.appName,
    windowTitle: windowCtx.windowTitle,
    transcript: state.transcript,
    recentCommands: copilotRecentCommands,
  };
  if (
    !canSemanticRefineOnDebrief({
      setting: copilot.getConfig().sessionType,
      detection: copilot.getSessionTypeDetection(),
      alreadyRefined: copilot.isSessionTypeRefined(),
      signals,
    })
  ) {
    return;
  }
  await refineSessionTypeSemantic();
}

async function refineSessionTypeSemantic(): Promise<void> {
  if (!sessionIsLive()) return;
  const windowCtx = getCachedWindowContext();
  const signals = {
    appName: windowCtx.appName,
    windowTitle: windowCtx.windowTitle,
    transcript: state.transcript,
    recentCommands: copilotRecentCommands,
  };
  const detection = copilot.getSessionTypeDetection();
  copilot.setSessionTypeRefining(true);
  push();
  try {
    if (process.env.IIVO_GLASS_E2E === "1") {
      state.lastNotice = "Session type refine skipped in E2E.";
      return;
    }
    const prompt = buildSemanticSessionTypePrompt(signals, detection);
    const response = await askIivoGlass(config, {
      prompt,
      session: buildGlassAskSessionPayload(),
      responseStyle: "overlay",
      modelPurpose: "semantic",
    });
    const parsed = parseSemanticSessionTypeResponse(response.answer);
    if (parsed) {
      copilot.applySemanticClassification(parsed);
      state.lastNotice = `Session type refined: ${SESSION_TYPE_LABELS[parsed.primaryType]}.`;
    } else {
      state.lastNotice = "Could not refine session type — keeping auto detection.";
    }
  } catch {
    state.lastNotice = "Session type refine unavailable — keeping auto detection.";
  } finally {
    copilot.setSessionTypeRefining(false);
    syncCopilotToSession();
    await persistSessions(sessions);
    push();
  }
}

async function runCopilotDiagnosis(resolution: CopilotResolution): Promise<void> {
  const packet = resolution.intervention?.diagnosticPacket;
  if (!packet) {
    state.lastNotice = "No diagnostic context available.";
    return;
  }
  const idFactory = () => {
    try {
      if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
    } catch {
      /* ignore */
    }
    return `diag-${Date.now()}`;
  };
  const id = idFactory();
  const createdAt = new Date().toISOString();
  const windowCtx = getCachedWindowContext();
  const analysisContext = {
    transcript: state.transcript,
    recentCommands: [...copilotRecentCommands],
    recentResponses: [...copilotRecentResponses],
    sourceApp: windowCtx.appName,
    sourceTitle: windowCtx.windowTitle,
  };

  copilot.setDiagnosticAnalyzing(true);
  push();

  let result;
  try {
    if (process.env.IIVO_GLASS_E2E === "1") {
      result = buildDeterministicDiagnosticFallback(packet, id, createdAt);
    } else {
      const prompt = buildDiagnosticAnalysisPrompt(packet, analysisContext);
      let latestScreenshotPayload: import("../shared/glassAskTypes.ts").GlassAskLatestScreenshot | undefined;
      try {
        const captureOutcome = await resolveScreenshotForVisualAsk({
          config,
          glassSettings: state.glassSettings,
          sessions,
          sessionIsLive,
          latestScreenshot: state.latestScreenshot,
          pendingCaptureDataUrl: state.pendingCaptureDataUrl,
          resolveCaptureTarget: () => resolveCaptureDisplay(state.glassSettings.displayTarget),
          eventContextFields,
          prompt,
        });
        if (captureOutcome.ok) {
          latestScreenshotPayload = captureOutcome.payload;
          state.latestScreenshot = captureOutcome.latestState;
        }
      } catch {
        /* screenshot optional */
      }
      const response = await askIivoGlass(config, {
        prompt,
        session: buildGlassAskSessionPayload(),
        latestScreenshot: latestScreenshotPayload,
        visualIntent: true,
        responseStyle: "overlay",
        modelPurpose: "diagnostic",
      });
      result = parseDiagnosticAnalysisResponse(response.answer, id, createdAt);
    }
  } catch {
    result = buildDeterministicDiagnosticFallback(packet, id, createdAt);
  }

  copilot.setDiagnosticResult(result);
  copilot.setDiagnosticAnalyzing(false);

  if (sessionIsLive()) {
    sessions.addEvent({
      kind: "copilot_diagnostic_result",
      title: result.rootCauseSummary,
      text: result.fullMarkdown,
      ...eventContextFields(),
      metadata: {
        diagnosticId: result.id,
        aiEnhanced: result.aiEnhanced,
        probableRootCause: result.probableRootCause,
      },
    });
    pushFeed(
      createCommandFeedItem("response", result.rootCauseSummary, {
        title: "Diagnostic result",
        fullBody: result.fullMarkdown,
      }),
    );
  }
  syncCopilotToSession();
  await persistSessions(sessions);
  state.lastNotice = result.aiEnhanced ? "Diagnostic complete." : "Diagnostic summary (offline fallback).";
  push();
}

/** Build a deterministic debrief, optionally enriched by a direct (non-Council) AI pass. */
async function generateCopilotDebrief(): Promise<void> {
  // Show loading state immediately so the overlay appears right away while the AI runs.
  state.lastNotice = "Generating debrief…";
  push();

  await maybeSemanticRefineForDebrief();
  const session = sessions.current();
  if (!session) {
    state.lastNotice = "No session to debrief.";
    return;
  }
  const idFactory = () => {
    try {
      if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
    } catch {
      /* ignore */
    }
    return `debrief-${Date.now()}`;
  };
  const debriefOptions = {
    sessionType: copilot.getSessionType(),
    sessionTypeDetection: copilot.getSessionTypeDetection(),
    reportStyle: copilot.getConfig().reportStyle,
    listenMoments: listenMomentRuntime.moments,
    mediaContext: state.mediaContext,
    // Include meeting intel when this was a meeting session.
    // isMeetingsModeActive() returns false after session-end (sessionIsLive() is false
    // by the time auto-debrief runs), so check sessionType directly instead.
    meetingIntelligence: copilot.getSessionType() === "meeting_call" ? meetingIntelState : undefined,
  };
  const debrief = buildSessionDebrief(
    session,
    copilot.getInsights(),
    { idFactory, clock: () => new Date().toISOString() },
    debriefOptions,
  );

  // Optional direct-AI enrichment (never Council). Best-effort; deterministic on
  // failure. Skipped under E2E so the deterministic debrief stays assertable.
  if (process.env.IIVO_GLASS_E2E !== "1") {
    try {
      const aiPrompt = buildDebriefAiPrompt(session, copilot.getInsights(), debriefOptions);
      const response = await askIivoGlass(config, {
        prompt: aiPrompt,
        session: buildGlassAskSessionPayload(),
        responseStyle: "overlay",
        suppressUserProfile: true,
      });
      if (response.answer?.trim()) {
        debrief.markdown = response.answer.trim();
        debrief.aiEnhanced = true;
      }
    } catch {
      // keep deterministic debrief
    }
  }

  copilot.setDebrief(debrief);
  syncCopilotToSession();
  state.lastNotice = undefined;

  // Send meeting report to IIVO as a standalone context item (best-effort, fire-and-forget).
  const meetingIntel = debriefOptions.meetingIntelligence;
  if (meetingIntel && meetingIntel.moments.length > 0) {
    try {
      const report = buildMeetingReport(meetingIntel, {
        sessionTitle: session.title ?? undefined,
        sessionDate: session.startedAt,
      });
      const payload = buildTextContextPayload({
        title: `Meeting Report — ${MEETING_SUB_TYPE_LABELS[report.subType]} — ${new Date(session.startedAt).toLocaleString()}`,
        text: report.markdown,
        kind: "note",
        capturedAt: session.startedAt,
      });
      createContextItem(config, payload).catch(() => {/* best-effort */});
    } catch {
      // never block the debrief
    }
  }
  push();
}

async function maybeAutoDebriefOnEnd(): Promise<void> {
  const cfg = copilot.getConfig();
  if (!cfg.autoDebriefOnEnd || !copilotModeIsActive(cfg.mode)) return;
  await generateCopilotDebrief();
}

/** Handle copilot-* commands. Returns true when the command was a copilot command. */
async function handleCopilotCommand(command: GlassCommand): Promise<boolean> {
  switch (command.type) {
    case "copilot-set-mode": {
      const next = withCopilotConfig(copilot.getConfig(), { mode: command.mode });
      persistCopilotConfig(next);
      copilot.setOffer(null);
      copilotOffered = true;
      if (command.mode === "off") {
        setListenNotesPadVisible(false);
      }
      if (copilotModeIsActive(next.mode) && sessionIsLive()) {
        bindCopilotToSession();
        refreshCopilotLoop();
      } else {
        stopCopilotLoop();
      }
      push();
      return true;
    }
    case "copilot-set-config": {
      const next = withCopilotConfig(copilot.getConfig(), command.patch);
      persistCopilotConfig(next);
      refreshCopilotLoop();
      push();
      return true;
    }
    case "copilot-set-muted": {
      const next = withCopilotConfig(copilot.getConfig(), { muteSuggestions: command.muted });
      persistCopilotConfig(next);
      push();
      return true;
    }
    case "copilot-accept-offer": {
      const next = withCopilotConfig(copilot.getConfig(), { mode: command.mode });
      persistCopilotConfig(next);
      copilot.setOffer(null);
      copilotOffered = true;
      if (sessionIsLive()) {
        bindCopilotToSession();
        refreshCopilotLoop();
      }
      push();
      return true;
    }
    case "copilot-dismiss-offer": {
      copilot.setOffer(null);
      copilotOffered = true;
      push();
      return true;
    }
    case "copilot-card-action": {
      const resolution = copilot.resolveIntervention(command.id, command.action);
      await applyCopilotEffect(resolution);
      copilot.clearIntervention(command.id);
      syncCopilotToSession();
      await persistSessions(sessions);
      push();
      return true;
    }
    case "copilot-generate-debrief":
      await generateCopilotDebrief();
      await persistSessions(sessions);
      push();
      return true;
    case "copilot-dismiss-debrief":
      copilot.setDebrief(null);
      syncCopilotToSession();
      await persistSessions(sessions);
      push();
      return true;
    case "copilot-open-debrief-in-iivo": {
      const debrief = copilot.getDebrief();
      const session = sessions.current();
      if (debrief && session) {
        await sendSessionText(`IIVO Glass Session Debrief — ${session.title}`, debrief.markdown);
      }
      return true;
    }
    case "copilot-dismiss-silence-warning":
      copilot.dismissSilenceWarning();
      push();
      return true;
    case "copilot-pause-system-audio":
      broadcastTranscriptionControl({ type: "stop" });
      dispatchPrivacy({ type: "PAUSE", at: new Date().toISOString() });
      systemAudioLastSignalMs = undefined;
      resetListeningLimitTracking();
      state.lastNotice = "System listening paused.";
      push();
      return true;
    case "copilot-listening-limit-continue":
      listeningLimitState = extendListeningLimit(listeningLimitState);
      clearListeningLimitAutoStopTimer();
      push();
      return true;
    case "copilot-listening-limit-stop":
      await stopListeningFromLimit("user");
      return true;
    case "copilot-refine-session-type":
      await refineSessionTypeSemantic();
      return true;
    case "copilot-dismiss-diagnostic-result":
      copilot.setDiagnosticResult(null);
      syncCopilotToSession();
      push();
      return true;
    case "copilot-open-diagnostic-in-iivo": {
      const diagnostic = copilot.getDiagnosticResult();
      if (diagnostic) {
        await sendSessionText("IIVO Glass Diagnostic", diagnostic.fullMarkdown);
      }
      return true;
    }
    case "copilot-save-diagnostic-result": {
      const diagnostic = copilot.getDiagnosticResult();
      if (diagnostic) {
        moments.add({ kind: "note", note: diagnostic.fullMarkdown });
        await persistMoments(moments);
        if (sessionIsLive()) {
          sessions.addEvent({
            kind: "saved_moment",
            title: "Saved diagnostic",
            text: diagnostic.rootCauseSummary,
          });
        }
        state.lastNotice = "Saved diagnostic to moments.";
        await persistSessions(sessions);
        push();
      }
      return true;
    }
    default:
      return false;
  }
}

/** Execute the side effect of a resolved copilot card. */
async function applyCopilotEffect(
  resolution: import("../shared/copilotController.ts").CopilotResolution,
): Promise<void> {
  const { effect, insight } = resolution;
  const windowCtx = getCachedWindowContext();
  const usingCursor = `${windowCtx.appName ?? ""} ${windowCtx.windowTitle ?? ""}`
    .toLowerCase()
    .includes("cursor");
  const promptNoun = usingCursor ? "Cursor prompt" : "AI prompt";
  switch (effect) {
    case "cursor_prompt":
      if (insight) {
        pushFeed(
          createCommandFeedItem("response", insight.text, {
            title: `${promptNoun} candidate`,
            prompt: insight.text,
            fullBody: insight.text,
          }),
        );
        state.lastNotice = `Saved as a ${promptNoun} candidate.`;
      }
      break;
    case "action_steps":
      if (insight) {
        const body = `Next steps from “${insight.title}”:\n${insight.text}`;
        pushFeed(
          createCommandFeedItem("response", body, {
            title: "Action items",
            fullBody: body,
          }),
        );
        moments.add({ kind: "note", note: `Action: ${insight.text}` });
        await persistMoments(moments);
        if (sessionIsLive()) sessions.addEvent({ kind: "saved_moment", title: insight.title });
        state.lastNotice = "Turned into action items.";
      }
      break;
    case "save":
      if (insight) {
        moments.add({ kind: "note", note: insight.text });
        await persistMoments(moments);
        if (sessionIsLive()) sessions.addEvent({ kind: "saved_moment", title: insight.title });
        state.lastNotice = "Saved to moments.";
      }
      break;
    case "diagnose":
      await runCopilotDiagnosis(resolution);
      break;
    case "summarize-blocker":
      void submitCommand("Summarize what's blocking me right now and the main friction.", undefined, { taskComplexity: "standard" });
      break;
    case "create-fix-plan":
      void submitCommand("Create a step-by-step fix plan for what I'm stuck on.", undefined, { taskComplexity: "standard" });
      break;
    case "save-issue": {
      const note = resolution.intervention?.body ?? insight?.text ?? "Diagnostic issue saved.";
      moments.add({ kind: "note", note: `Issue: ${note}` });
      await persistMoments(moments);
      if (sessionIsLive()) {
        sessions.addEvent({ kind: "saved_moment", title: "Saved issue", text: note });
      }
      state.lastNotice = "Saved issue to moments.";
      break;
    }
    case "show-summary":
      await generateCopilotDebrief();
      break;
    case "later":
    case "dismiss":
    case "none":
    default:
      break;
  }
}

async function handleSessionCommand(command: GlassCommand): Promise<void> {
  state.lastNotice = undefined;
  switch (command.type) {
    case "session-start":
      sessions.startSession(command.title);
      bindCopilotToSession();
      startCopilotLoop();
      state.lastNotice = "Session started — Glass is collecting events locally.";
      break;
    case "session-pause":
      sessions.pauseSession();
      break;
    case "session-resume":
      sessions.resumeSession();
      // Restart audio capture if listen notes pipeline is active and audio was stopped
      // (e.g. after translate-stop paused it in a non-listen-notes session that then
      // switched, or after an explicit session-pause). Without this the Resume button
      // leaves the user in a silent state with the session technically active.
      if (shouldRunListenNotesPipeline() && !state.privacy.listening) {
        broadcastTranscriptionControl({ type: "start", mode: "system_audio" });
      }
      break;
    case "session-end":
      sessions.endSession();
      stopCopilotLoop();
      stopMeetingIntelLoop();
      await maybeAutoDebriefOnEnd();
      push();
      break;
    case "session-clear": {
      const session = sessions.current();
      if (session) await clearSessionScreenshotFolder(session.id);
      sessions.clearSession();
      copilot.bindSession(session?.id ?? null);
      copilotBoundSessionId = session?.id ?? null;
      state.latestScreenshot = null;
      state.pendingCaptureDataUrl = undefined;
      clearEphemeralVisualCapture();
      state.visualAskRetention = null;
      break;
    }
    case "session-add-note": {
      const text = command.text.trim();
      if (!text) return;
      if (sessionIsLive()) {
        const ctxFields = eventContextFields({ sourceTitle: command.sourceTitle });
        sessions.addEvent({
          kind: "manual_note",
          title: text.length > 70 ? `${text.slice(0, 69)}…` : text,
          text,
          sourceApp: ctxFields.sourceApp,
          sourceTitle: ctxFields.sourceTitle ?? command.sourceTitle,
          metadata: ctxFields.metadata,
        });
      } else {
        moments.add({ kind: "note", note: text, sourceTitle: command.sourceTitle });
        await persistMoments(moments);
        state.lastNotice = "Saved as a moment. Start a session to keep notes in the timeline.";
      }
      break;
    }
    case "session-capture": {
      if (!sessionIsLive()) {
        state.lastNotice = "Start a session first to add captures to the timeline.";
        state.operationDiagnostics = recordOperation(state.operationDiagnostics, "session-capture", "error", state.lastNotice);
        push();
        break;
      }
      const session = sessions.current();
      if (!session) break;
      state.lastError = undefined;
      const captureTarget = resolveCaptureDisplay(state.glassSettings.displayTarget);
      state.operationDiagnostics = {
        ...recordOperation(state.operationDiagnostics, "session-capture", "pending"),
        captureStatus: `Capturing ${captureTarget.label}`,
      };
      dispatchPrivacy({ type: "CAPTURE_START", at: new Date().toISOString() });
      push();
      try {
        const result = await captureDisplayById(captureTarget.id, captureTarget.label);
        const ctxFields = eventContextFields({ captureSource: result.sourceName });
        const event = sessions.addEvent({
          kind: "screen_capture",
          title: `Screen capture · ${result.displayLabel} (${result.width}×${result.height})`,
          sourceApp: ctxFields.sourceApp,
          sourceTitle: ctxFields.sourceTitle ?? result.sourceName,
          importance: "medium",
          metadata: ctxFields.metadata,
        });
        if (event) {
          const refs = await saveSessionScreenshot(session.id, event.id, result.imageDataUrl);
          event.screenshotPath = refs.screenshotPath;
          event.thumbnailPath = refs.thumbnailPath;
          event.screenshotMimeType = refs.screenshotMimeType;
          event.screenshotSizeBytes = refs.screenshotSizeBytes;
          state.pendingCaptureDataUrl = result.imageDataUrl;
          await registerLatestGlassCapture({
            imageDataUrl: result.imageDataUrl,
            displayLabel: result.displayLabel,
            displayId: result.displayId,
            sourceTitle: ctxFields.sourceTitle ?? result.sourceName,
            sessionId: session.id,
            eventId: event.id,
            screenshotPath: event.screenshotPath,
            thumbnailPath: event.thumbnailPath,
            mimeType: event.screenshotMimeType,
          });
        }
        state.lastNotice = `${CAPTURE_SESSION_SUCCESS_MESSAGE} (${result.displayLabel})`;
        state.operationDiagnostics = diagnosticsForCapture(
          state.operationDiagnostics,
          true,
          undefined,
          result.displayLabel,
        );
      } catch (err) {
        const message = captureErrorMessage(err);
        state.lastError = message;
        state.operationDiagnostics = diagnosticsForCapture(state.operationDiagnostics, false, message);
      }
      dispatchPrivacy({ type: "CAPTURE_DONE", at: new Date().toISOString() });
      break;
    }
    case "session-extract-insights": {
      const session = sessions.current();
      if (!session) {
        state.lastNotice = "No active session to analyze.";
        break;
      }
      const noteTexts = session.events
        .filter((e) => e.kind === "manual_note" || e.kind === "transcript_note")
        .map((e) => e.text ?? e.title);
      const candidates = extractSessionIntelligence({
        transcript: state.transcript,
        notes: noteTexts,
        events: session.events,
      });
      const fresh = selectNewInsights(session.insights, candidates);
      for (const c of fresh) {
        sessions.addInsight({
          type: c.type,
          title: c.title,
          text: c.text,
          sourceEventIds: c.sourceEventIds,
          importance: c.importance,
        });
      }
      state.lastNotice =
        fresh.length > 0
          ? `Extracted ${fresh.length} new insight${fresh.length === 1 ? "" : "s"}.`
          : "No new insights found.";
      break;
    }
    case "session-accept-insight":
      sessions.updateInsight(command.id, { accepted: true });
      break;
    case "session-dismiss-insight":
      sessions.deleteInsight(command.id);
      break;
    case "session-delete-event": {
      const session = sessions.current();
      const event = session?.events.find((e) => e.id === command.id);
      if (event) await deleteScreenshotFiles(event);
      sessions.deleteEvent(command.id);
      break;
    }
    case "session-save-insight-moment": {
      const insight = sessions.current()?.insights.find((i) => i.id === command.id);
      if (insight) {
        moments.add({ kind: "note", note: insight.text });
        await persistMoments(moments);
        if (sessionIsLive()) sessions.addEvent({ kind: "saved_moment", title: insight.text });
      }
      break;
    }
    case "session-send":
      await sendSession(false);
      break;
    case "session-open-in-iivo":
    case "session-analyze-council":
      await sendSession(true);
      break;
    case "session-analyze-now":
      await analyzeSessionNow();
      break;
    case "view-council-on-web":
      await openRunHistoryOnWeb(command.runId);
      break;
    case "session-send-event":
      await sendSessionEvent(command.id);
      break;
    case "session-send-insight": {
      const insight = sessions.current()?.insights.find((i) => i.id === command.id);
      if (insight) await sendSessionText(`IIVO Glass insight (${insight.type})`, insight.text);
      break;
    }
    case "session-send-summary": {
      const session = sessions.current();
      if (session) await sendSessionText(`IIVO Glass Session — ${session.title}`, buildSessionSummary(session));
      break;
    }
    default:
      break;
  }
  syncCopilotToSession();
  await persistSessions(sessions);
  push();
}

async function sendSession(forCouncilAnalysis: boolean): Promise<void> {
  const session = sessions.current();
  if (!session) {
    state.lastNotice = "No session to send.";
    return;
  }
  state.lastError = undefined;
  state.sessionActionStatus = "preparing";
  push();
  state.sessionActionStatus = "sending";
  dispatchPrivacy({ type: "SEND_START", at: new Date().toISOString() });
  push();
  try {
    const { payload, truncated, eventCount, insightCount } = buildSessionContextPayload(session, {
      forCouncilAnalysis,
    });
    const item = await createContextItem(config, payload);
    sessions.addEvent({
      kind: "iivo_sent",
      title: forCouncilAnalysis
        ? `Session opened in IIVO (${eventCount} events, ${insightCount} insights)`
        : `Session sent to IIVO (${eventCount} events, ${insightCount} insights)`,
    });
    state.iivoAnalysis = { ...state.iivoAnalysis, contextId: item.id };
    await openHandoff(item.id);
    state.sessionActionStatus = "opened";
    state.lastNotice = forCouncilAnalysis
      ? truncated
        ? "Opened in IIVO (timeline truncated)."
        : "Opened in IIVO with session context."
      : truncated
        ? "Session sent to IIVO (timeline truncated for size)."
        : "Session sent to IIVO.";
    dispatchPrivacy({ type: "SEND_DONE", at: new Date().toISOString() });
  } catch (err) {
    state.lastError = err instanceof Error ? err.message : "Send session failed";
    state.sessionActionStatus = "failed";
    dispatchPrivacy({ type: "CAPTURE_DONE", at: new Date().toISOString() });
  }
}

async function analyzeSessionNow(): Promise<void> {
  const session = sessions.current();
  if (!session) {
    state.lastNotice = "No session to analyze.";
    push();
    return;
  }
  state.lastError = undefined;
  state.iivoAnalysis = { status: "running", updatedAt: new Date().toISOString() };
  push();

  const estimate = await estimateCouncilCredits(config, buildSessionAnalysisPrompt());
  if (estimate) {
    state.iivoAnalysis = {
      ...state.iivoAnalysis,
      estimatedCredits: estimate.estimatedCredits,
    };
    state.lastNotice = `Analyze Now may use ~${estimate.estimatedCredits} credits (${estimate.currentCredits} remaining).`;
    push();
  }

  try {
    const result = await runCouncilAnalysis(config, buildCouncilRunRequest(session));
    state.iivoAnalysis = {
      status: "done",
      text: result.answer,
      runId: result.runId,
      updatedAt: new Date().toISOString(),
    };
    sessions.addEvent({
      kind: "iivo_analysis",
      title: "IIVO Council analysis",
      text: result.answer,
      importance: "high",
    });
    state.lastNotice = "Analysis complete — see IIVO Analysis below.";
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Analysis failed";
    state.iivoAnalysis = {
      status: "failed",
      error: msg,
      updatedAt: new Date().toISOString(),
    };
    state.lastError = buildAnalysisFailureNotice(msg);
  }
}

async function sendSessionEvent(id: string): Promise<void> {
  const event = sessions.current()?.events.find((e) => e.id === id);
  if (!event) return;
  state.lastError = undefined;
  dispatchPrivacy({ type: "SEND_START", at: new Date().toISOString() });
  push();
  try {
    const dataUrl =
      event.screenshotDataUrl ?? (await readScreenshotDataUrl(event));
    if (dataUrl) {
      const payload = buildScreenshotContextPayload({
        title: event.title,
        sourceTitle: event.sourceTitle,
      });
      const item = await createScreenshotContext(config, payload, dataUrl);
      await openHandoff(item.id);
    } else {
      const payload = buildTextContextPayload({
        title: event.title,
        text: event.text ?? event.title,
        kind: "note",
      });
      const item = await createContextItem(config, payload);
      await openHandoff(item.id);
    }
    dispatchPrivacy({ type: "SEND_DONE", at: new Date().toISOString() });
  } catch (err) {
    state.lastError = err instanceof Error ? err.message : "Send event failed";
    dispatchPrivacy({ type: "CAPTURE_DONE", at: new Date().toISOString() });
  }
}

async function sendSessionText(title: string, text: string): Promise<void> {
  if (!text.trim()) return;
  state.lastError = undefined;
  dispatchPrivacy({ type: "SEND_START", at: new Date().toISOString() });
  push();
  try {
    const payload = buildTextContextPayload({ title, text, kind: "note" });
    const item = await createContextItem(config, payload);
    await openHandoff(item.id);
    dispatchPrivacy({ type: "SEND_DONE", at: new Date().toISOString() });
  } catch (err) {
    state.lastError = err instanceof Error ? err.message : "Send failed";
    dispatchPrivacy({ type: "CAPTURE_DONE", at: new Date().toISOString() });
  }
}

function registerScreenshotProtocol(): void {
  protocol.registerFileProtocol("glass-screenshot", (request, callback) => {
    const urlPath = request.url.replace(/^glass-screenshot:\/\//, "");
    const filePath = resolveThumbnailFilePath(`/${urlPath}`);
    if (filePath) {
      callback({ path: filePath });
    } else {
      callback({ error: -6 }); // FILE_NOT_FOUND
    }
  });
}

function isOverlayIpcSender(sender: Electron.WebContents): boolean {
  const overlay = getWindows()?.overlay;
  if (!overlay || overlay.isDestroyed()) return false;
  return sender.id === overlay.webContents.id;
}

function isTerminalIpcSender(sender: Electron.WebContents): boolean {
  const terminal = getWindows()?.terminal;
  if (!terminal || terminal.isDestroyed()) return false;
  return sender.id === terminal.webContents.id;
}

/** Floating terminal window or Glass IDE embedded terminal in the overlay. */
function isTerminalPanelSender(sender: Electron.WebContents): boolean {
  if (isTerminalIpcSender(sender)) return true;
  return isOverlayIpcSender(sender) && state.glassIdeActive;
}

function showGlassTerminalWindowUnlessIde(): void {
  if (state.glassIdeActive) return;
  showGlassTerminalWindow();
}

let ideTerminalCwdRoot: string | null = null;

function cdPtyToDirectory(termId: string, dir: string): void {
  const q = dir.replace(/'/g, "'\\''");
  writePtyInput(termId, `cd '${q}'\n`);
}

function ensureIdeTerminalSession(): void {
  dismissGlassTerminalWindow();
  const termId = ensureGlassTerminalSession();
  state.glassDockTerminalOpen = true;
  const root = state.glassSettings.agentCodeWorkspaceRoot?.trim();
  if (root && ideTerminalCwdRoot !== root) {
    cdPtyToDirectory(termId, expandTildePath(root));
    ideTerminalCwdRoot = root;
  }
}

function bumpIdePreviewReload(): void {
  state.glassIdePreviewReloadNonce = (state.glassIdePreviewReloadNonce ?? 0) + 1;
}

function maybeSetIdePreviewUrlFromTerminal(data: string): void {
  if (!state.glassIdeActive) return;
  const detected = parseDevServerUrl(data);
  if (!detected || detected === state.glassIdePreviewUrl) return;
  void stopStaticPreviewServer();
  state.glassIdePreviewUrl = detected;
  dispatchIdeChromeSignal({ kind: "dev-server-detected" });
  push();
}

let coderLaunchNonce = 0;

function isValidPtySessionId(termId: unknown): termId is string {
  return typeof termId === "string" && getActivePtySessionIds().includes(termId);
}

function enableCompanionModeForAgent(): void {
  if (state.companionModeActive) return;
  state.companionModeActive = true;
  state.companionModeToggleNonce += 1;
  broadcastTranscriptionControl({ type: "stop" });
  state.companionWarmupPhase = "none";
  warmOmniParserSidecarWithCallbacks({
    onWarming: () => {
      state.companionWarmupPhase = "warming";
      state.companionWarmupSpeakNonce += 1;
      push();
    },
    onReady: () => {
      state.companionWarmupPhase = "ready";
      state.companionWarmupSpeakNonce += 1;
      push();
    },
  });
  push();
}

function syncAgentRunFromEvent(ev: AgentEvent): boolean {
  const status =
    ev.kind === "done" ? "done"
    : ev.kind === "error" ? "error"
    : ev.kind === "cancelled" ? "cancelled"
    : "running";
  const prev = state.agentRun;
  const savedFilePath = ev.savedFilePath ?? prev?.savedFilePath;
  const changed =
    !prev ||
    prev.runId !== ev.runId ||
    prev.agentId !== ev.agentId ||
    prev.status !== status ||
    prev.savedFilePath !== savedFilePath;
  state.agentRun = {
    runId: ev.runId,
    agentId: ev.agentId,
    status,
    updatedAt: Date.now(),
    prompt: prev?.prompt,
    savedFilePath,
  };
  return changed;
}

function agentCompletionNotice(savedFilePath?: string): string {
  if (savedFilePath) {
    const name = savedFilePath.split(/[/\\]/).pop() ?? "file";
    return `Agent finished — saved ${name}. Open from the Answer Panel or Finder.`;
  }
  return "Agent finished — check the Answer Panel.";
}

function registerIpc(): void {
  ipcMain.handle(IPC.writeClipboard, (event, text: string) => {
    if (!isOverlayIpcSender(event.sender) && !isTerminalIpcSender(event.sender)) return false;
    if (typeof text !== "string" || !text.trim()) return false;
    clipboard.writeText(text);
    return true;
  });

  // ── API Key Manager ────────────────────────────────────────────────────────
  ipcMain.handle(IPC.apiKeyList, (event) => {
    if (!isOverlayIpcSender(event.sender)) {
      return { keys: [], error: "Unauthorized" };
    }
    try {
      return {
        keys: listApiKeys(),
        encryptionAvailable: isApiKeyEncryptionAvailable(),
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : "List failed";
      return { keys: [], error, encryptionAvailable: isApiKeyEncryptionAvailable() };
    }
  });

  ipcMain.handle(IPC.apiKeyGetValue, (event, id: string) => {
    if (!isOverlayIpcSender(event.sender)) {
      return { value: null };
    }
    const normalizedId = normalizeApiKeyId(id);
    if (!normalizedId) return { value: null };
    try {
      const value = getApiKeyValue(normalizedId);
      if (value !== null) touchApiKey(normalizedId);
      return { value };
    } catch {
      return { value: null };
    }
  });

  ipcMain.handle(IPC.apiKeySave, (event, payload: ApiKeySaveRequest) => {
    if (!isOverlayIpcSender(event.sender)) {
      return { ok: false, error: "Unauthorized" };
    }
    const meta = normalizeApiKeyMeta(payload?.meta);
    const value = normalizeApiKeyValue(payload?.value);
    if (!meta || !value) {
      return { ok: false, error: "Invalid key data" };
    }
    try {
      saveApiKey(meta, value);
      return { ok: true };
    } catch (err) {
      const error = err instanceof Error ? err.message : "Save failed";
      return { ok: false, error };
    }
  });

  ipcMain.handle(IPC.apiKeyDelete, (event, id: string) => {
    if (!isOverlayIpcSender(event.sender)) {
      return { ok: false, error: "Unauthorized" };
    }
    const normalizedId = normalizeApiKeyId(id);
    if (!normalizedId) {
      return { ok: false, error: "Invalid key id" };
    }
    try {
      deleteApiKey(normalizedId);
      return { ok: true };
    } catch (err) {
      const error = err instanceof Error ? err.message : "Delete failed";
      return { ok: false, error };
    }
  });

  // ── Glass Command Palette (Task #66) ─────────────────────────────────────────
  ipcMain.handle(
    IPC.paletteGetSections,
    (event, _payload: PaletteGetSectionsRequest): PaletteGetSectionsResponse => {
      if (!isOverlayIpcSender(event.sender)) {
        return { sections: [], error: "Unauthorized" };
      }
      try {
        const freq: PaletteFrequencyMap = loadPaletteFrequency();

        // ── Built-in Glass commands ────────────────────────────────────────
        const sectionByCommandId = new Map(
          PALETTE_COMMAND_REGISTRY.map((entry) => [entry.commandId, entry.section]),
        );

        const commandItems: GlassCommandItem[] = PALETTE_COMMAND_REGISTRY.map((entry) => ({
          id: `command:${entry.commandId}`,
          type: "command",
          title: entry.title,
          subtitle:
            entry.commandId === "open-answer-panel" && !state.lastAskResponse
              ? "Ask in the command bar first — reopens formatted answers after you ask"
              : entry.subtitle,
          icon: entry.icon,
          badge: entry.badge,
          shortcutHint: entry.shortcutHint,
          action: entry.action,
          secondaryAction: entry.secondaryAction,
          score: 0,
          commandId: entry.commandId,
          contextTags: entry.contextTags,
          keywords: entry.keywords,
          useCount: freq[`command:${entry.commandId}`] ?? 0,
        }));

        // ── Stored API keys ────────────────────────────────────────────────
        let apiKeyItems: ApiKeyItem[] = [];
        try {
          apiKeyItems = listApiKeys().map((meta) => ({
            id: `api-key:${meta.id}`,
            type: "api-key",
            title: meta.label || meta.service,
            subtitle: `${meta.service} · ${meta.environment}`,
            icon: "🔑",
            badge: meta.environment,
            action: { kind: "copy-api-key", payload: meta.id },
            score: 0,
            keyId: meta.id,
            service: meta.service,
            label: meta.label,
            environment: meta.environment,
            maskedValue: "••••" + meta.id.slice(-4),
          }));
        } catch {
          apiKeyItems = [];
        }

        const terminalHistoryItems: import("../shared/paletteTypes.ts").TerminalHistoryItem[] =
          getRecentTerminalContextBlocks()
            .slice(-12)
            .reverse()
            .map((block, idx) => ({
              id: `terminal-history:${idx}-${block.command.slice(0, 24)}`,
              type: "terminal-history" as const,
              title: block.command.slice(0, 80) || "Command",
              subtitle: block.output.slice(0, 100) || undefined,
              icon: block.status === "error" ? "✗" : block.status === "success" ? "✓" : "○",
              score: 0,
              action: {
                kind: "inject-pty",
                payload: block.command,
              },
              command: block.command,
              outputPreview: block.output.slice(0, 200),
              exitCode: block.exitCode ?? null,
              status: block.status,
              finishedAt: Date.now() - idx * 1000,
              durationLabel: block.durationMs != null
                ? `${(block.durationMs / 1000).toFixed(1)}s`
                : undefined,
              ptySessionId: state.glassDockTerminalId ?? null,
            }));

        const sections: PaletteSection[] = [
          {
            id: "quick-actions",
            label: "Quick Actions",
            items: [],
            maxVisible: 4,
            order: 0,
          },
          ...buildCommandPaletteSections(commandItems, sectionByCommandId),
          {
            id: "terminal-history",
            label: "Terminal History",
            items: terminalHistoryItems,
            maxVisible: 5,
            order: 10,
          },
          {
            id: "api-keys",
            label: "API Keys",
            items: apiKeyItems,
            maxVisible: 5,
            order: 11,
          },
        ];

        return { sections };
      } catch (err) {
        const error = err instanceof Error ? err.message : "Failed to build palette";
        return { sections: [], error };
      }
    },
  );

  ipcMain.handle(
    IPC.paletteRecordUse,
    (event, payload: PaletteRecordUseRequest): { ok: boolean } => {
      if (!isOverlayIpcSender(event.sender)) return { ok: false };
      const itemId = typeof payload?.itemId === "string" ? payload.itemId : "";
      if (!itemId) return { ok: false };
      recordPaletteUse(itemId);
      return { ok: true };
    },
  );

  // ── Glass Agents ───────────────────────────────────────────────────────────
  let activeAgentRun: { controller: AbortController; runId: string; agentId: GlassAgentId } | null = null;
  let projectMemoryRunning = false;
  let projectMemoryAbort: AbortController | null = null;
  const approvalResolvers = new Map<string, (approved: boolean) => void>();
  const coderPostRunScheduler = new CoderPostRunScheduler();

  const isCoderRunCurrentForPostRun = (runId: string): boolean =>
    isCoderRunEligibleForPostRun(runId, state.agentRun ?? null);

  const resolveCoderNarrateRunId = (): string | undefined =>
    state.qaPipelineState?.runId
    ?? state.coderVerifyState?.runId
    ?? state.coderReviewState?.runId
    ?? state.agentRun?.runId
    ?? undefined;

  const broadcastCoderNarrate = (text: string, runId?: string): void => {
    const trimmed = text.trim();
    const rid = runId ?? resolveCoderNarrateRunId();
    if (!trimmed) return;
    if (!rid) {
      console.warn("[coder-narrate] dropped — no runId:", trimmed.slice(0, 80));
      return;
    }
    broadcast(IPC.agentEvent, {
      runId: rid,
      agentId: "coder",
      kind: "narrate",
      text: trimmed,
    });
  };

  const coderBuildLoopHost: CoderBuildLoopHost = {
    getSettings: () => state.glassSettings,
    getChangeLog: () => state.agentChangeLog ?? [],
    getVerifyState: () => state.coderVerifyState,
    setVerifyState: (v) => { state.coderVerifyState = v; },
    getReviewState: () => state.coderReviewState,
    setReviewState: (v) => { state.coderReviewState = v; },
    setProjectMemoryState: (v) => { state.projectMemoryState = v; },
    setLastNotice: (notice) => { state.lastNotice = notice; },
    narrate: (text) => { broadcastCoderNarrate(text); },
    push,
    broadcastOpenCoder: (payload) => {
      state.glassIdeActive = true;
      syncIdeChromeFromState();
      try {
        ensureIdeTerminalSession();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        state.lastError = message;
        state.glassDockTerminalOpen = false;
      }
      push();
      broadcast(IPC.openCoderWithPrompt, { ...payload, launchNonce: ++coderLaunchNonce });
    },
    getConfig: () => config,
    isAgentActive: () => Boolean(activeAgentRun) || projectMemoryRunning,
    getLoopIteration: () => state.coderLoopIteration,
    setLoopIteration: (iteration) => { state.coderLoopIteration = iteration; },
    isCoderRunCurrent: isCoderRunCurrentForPostRun,
  };

  let qaNotificationShownThisSession = false;
  let previewProbeResolve: ((errors: string[] | null) => void) | null = null;

  const qaPipelineHost: QaPipelineHost = {
    getSettings: () => state.glassSettings,
    getChangeLog: () => state.agentChangeLog ?? [],
    getConfig: () => config,
    getPipelineState: () => state.qaPipelineState,
    setPipelineState: (pipeline) => { state.qaPipelineState = pipeline; },
    setLastNotice: (notice) => { state.lastNotice = notice; },
    narrate: (text) => { broadcastCoderNarrate(text); },
    push,
    isCoderRunCurrent: isCoderRunCurrentForPostRun,
    requestPreviewProbe: () => new Promise<string[] | null>((resolve) => {
      if (!state.glassIdePreviewUrl?.trim()) {
        resolve(null);
        return;
      }
      const overlay = getWindows()?.overlay;
      if (!overlay || overlay.isDestroyed()) {
        resolve(null);
        return;
      }
      const timer = setTimeout(() => {
        if (previewProbeResolve) {
          previewProbeResolve = null;
          resolve(null);
        }
      }, 8000);
      previewProbeResolve = (errors) => {
        clearTimeout(timer);
        previewProbeResolve = null;
        resolve(errors);
      };
      overlay.webContents.send(IPC.idePreviewProbe);
    }),
    broadcastOpenCoder: (payload) => {
      state.glassIdeActive = true;
      syncIdeChromeFromState();
      push();
      broadcast(IPC.openCoderWithPrompt, { ...payload, launchNonce: ++coderLaunchNonce });
    },
    getLoopIteration: () => state.coderLoopIteration,
    setLoopIteration: (iteration) => { state.coderLoopIteration = iteration; },
    onShellCheckStart: () => {
      if (state.glassIdeActive) {
        dispatchIdeChromeSignal({ kind: "qa-shell-check-start" });
      }
    },
    onPipelineComplete: (hasFail) => {
      if (state.glassIdeActive) {
        dispatchIdeChromeSignal({
          kind: "post-run-complete",
          success: !hasFail,
        });
      }
    },
  };

  const coderPostRunHost: CoderPostRunOrchestrationHost = {
    getPendingApproval: () => state.agentPendingApproval,
    getApprovalKeys: () => approvalResolvers.keys(),
    getAgentRun: () => state.agentRun ?? null,
    getAgentHistory: () => state.agentHistory ?? [],
    getProjectRoot: () => state.glassSettings.agentCodeWorkspaceRoot?.trim() || null,
    isQaModeEnabled: () => state.glassSettings.qaModeEnabled === true,
    runQaPipeline: (runId, projectRoot) => runQaPipeline(runId, projectRoot, qaPipelineHost),
    orchestrateAfterCoderDone: async (runId, projectRoot) => {
      await orchestrateAfterCoderDone(runId, projectRoot, coderBuildLoopHost);
      if (!state.glassIdeActive) return;
      const verifyFailed =
        state.coderVerifyState?.runId === runId
        && state.coderVerifyState?.status === "fail";
      dispatchIdeChromeSignal({
        kind: "post-run-complete",
        success: !verifyFailed,
      });
    },
  };

  const rejectApprovalsForRun = (runId: string): void => {
    coderPostRunScheduler.clear(runId);
    for (const [key, resolve] of approvalResolvers.entries()) {
      if (key.startsWith(`${runId}:`)) {
        resolve(false);
        approvalResolvers.delete(key);
      }
    }
    if (state.agentPendingApproval?.runId === runId) {
      state.agentPendingApproval = null;
    }
  };

  const deactivateCoderWorkspace = (): void => {
    if (!state.coderWorkspaceActive) return;
    state.coderWorkspaceActive = false;
    syncIdeChromeFromState();
  };

  const ensureIndexWatcher = (projectRoot: string): void => {
    if (!hasIndex(projectRoot)) return;
    startWatching(projectRoot, (changedPath) => {
      void indexFile(projectRoot, changedPath);
    });
  };

  const runProjectIndex = (projectRoot: string, reindex = false): void => {
    const root = projectRoot.trim();
    if (!root) return;
    if (state.indexState.status === "indexing" && state.indexState.projectRoot === root) return;

    void (async () => {
      state.ollamaAvailable = await checkOllamaAvailable();
      const startedAt = Date.now();
      stopWatching(root);

      state.indexState = {
        projectRoot: root,
        status: "indexing",
        progress: { processed: 0, indexed: 0, total: 0, phase: "embedding" },
      };
      push();
      broadcast(IPC.indexProgress, state.indexState.progress);

      const onProgress = (progress: import("./glassIndex.ts").GlassIndexProgress): void => {
        state.indexState = {
          ...state.indexState,
          status: "indexing",
          progress,
        };
        push();
        broadcast(IPC.indexProgress, progress);
      };

      const result = reindex
        ? await reindexProject(root, onProgress)
        : await indexProject(root, onProgress);

      if (result.error) {
        state.indexState = {
          projectRoot: root,
          status: "error",
          error: result.error,
        };
        push();
        broadcast(IPC.indexError, { error: result.error });
        if (hasIndex(root)) ensureIndexWatcher(root);
        return;
      }

      const fileCount = getIndexFileCount(root);
      state.indexState = {
        projectRoot: root,
        status: "ready",
        fileCount,
        lastIndexedAt: Date.now(),
      };
      push();
      broadcast(IPC.indexDone, {
        fileCount,
        durationMs: Date.now() - startedAt,
      });
      ensureIndexWatcher(root);
    })();
  };

  const createApprovalGate = (runId: string, agentId: GlassAgentId) => {
    return async (request: ApprovalGateRequest): Promise<boolean> => {
      return new Promise((resolve) => {
        const key = `${runId}:${request.toolUseId}`;
        approvalResolvers.set(key, (approved) => {
          approvalResolvers.delete(key);
          if (state.agentPendingApproval?.runId === runId) {
            state.agentPendingApproval = null;
          }
          push();
          resolve(approved);
          coderPostRunScheduler.notifyRunProgress(runId, coderPostRunHost);
        });
        state.agentPendingApproval = {
          runId,
          agentId,
          pendingToolId: request.toolUseId,
          pendingToolName: request.toolName,
          ...request.approval,
        };
        push();
        relayAgentEvent({
          runId,
          agentId,
          kind: "approval-required",
          pendingToolId: request.toolUseId,
          pendingToolName: request.toolName,
          pendingToolInput: request.toolInput,
          pendingApproval: request.approval,
        });
        relayAgentEvent({
          runId,
          agentId,
          kind: "narrate",
          text: "Review the change.",
        });
      });
    };
  };

  const relayAgentEvent = (ev: AgentEvent): void => {
    if (activeAgentRun?.runId !== ev.runId) return;
    const stateChanged = syncAgentRunFromEvent(ev);
    let shouldPush = stateChanged;

    if (ev.kind === "tool-done" && ev.savedFilePath) {
      state.agentHistory = updateAgentHistoryRun(ev.runId, {
        savedFilePath: ev.savedFilePath,
      });
      shouldPush = true;
    }

    if (ev.kind === "tool-done" && ev.changeLogEntry) {
      const entry = ev.changeLogEntry;
      state.agentChangeLog = [...(state.agentChangeLog ?? []), entry];
      if (entry.action === "applied" && state.glassIdeActive) {
        bumpIdePreviewReload();
      }
      const paths = state.agentHistory
        .find((h) => h.runId === ev.runId)
        ?.changedFiles ?? [];
      const nextPaths = entry.action === "applied" || entry.action === "deleted"
        ? [...paths, entry.path]
        : paths;
      state.agentHistory = updateAgentHistoryRun(ev.runId, {
        changedFiles: nextPaths.length > 0 ? nextPaths : undefined,
      });
      shouldPush = true;
    }

    if (ev.kind === "tool-done" && ev.agentId === "coder" && ev.changeLogEntry) {
      coderPostRunScheduler.notifyRunProgress(ev.runId, coderPostRunHost);
    }

    if (state.glassIdeActive && ev.agentId === "coder") {
      if (ev.kind === "tool-start") {
        dispatchIdeChromeSignal({
          kind: "agent-tool-start",
          toolName: ev.toolName ?? "",
        });
      } else if (ev.kind === "error") {
        dispatchIdeChromeSignal({ kind: "agent-error" });
      } else if (ev.kind === "done" || ev.kind === "cancelled") {
        ideAletheiaAdvisory.onRunPhaseChange();
      }
    }

    if (ev.kind === "approval-required") {
      shouldPush = true;
    }

    if (ev.kind === "done") {
      const path = state.agentRun?.savedFilePath;
      if (ev.agentId === "coder") {
        state.lastNotice = "Glass Coder finished — review changes in the Coder panel.";
      } else {
        state.lastNotice = agentCompletionNotice(path);
      }
      state.agentHistory = updateAgentHistoryRun(ev.runId, {
        status: "done",
        finishedAt: Date.now(),
        savedFilePath: path,
      });
      shouldPush = true;
      if (ev.agentId === "coder") {
        coderPostRunScheduler.requestPostRun(ev.runId, coderPostRunHost);
      }
    } else if (ev.kind === "error") {
      state.lastNotice = ev.error ?? "Agent failed.";
      if (ev.agentId === "coder") {
        coderPostRunScheduler.clear(ev.runId);
      }
      state.agentHistory = updateAgentHistoryRun(ev.runId, {
        status: "error",
        finishedAt: Date.now(),
        error: ev.error,
      });
      shouldPush = true;
    } else if (ev.kind === "cancelled") {
      state.lastNotice = "Agent stopped.";
      rejectApprovalsForRun(ev.runId);
      if (ev.agentId === "coder") {
        deactivateCoderWorkspace();
      }
      state.agentHistory = updateAgentHistoryRun(ev.runId, {
        status: "cancelled",
        finishedAt: Date.now(),
      });
      shouldPush = true;
    }

    if (shouldPush) push();
    broadcast(IPC.agentEvent, ev);
  };

  ipcMain.handle(
    IPC.agentRun,
    async (event, payload: AgentRunRequest): Promise<AgentRunResponse> => {
      if (!isOverlayIpcSender(event.sender)) return { started: false, error: "Unauthorized" };

      const agentId = payload?.agentId;
      const prompt = typeof payload?.prompt === "string" ? payload.prompt.trim() : "";
      const runId = typeof payload?.runId === "string" ? payload.runId.trim() : "";
      const loopAutoTrigger = payload?.loopAutoTrigger === true;
      const enrichedPrompt = enrichAgentPromptForIde(prompt, state.glassIdeActive === true);
      if (!isGlassAgentId(agentId)) return { started: false, error: "Invalid agentId" };
      if (!prompt) return { started: false, error: "prompt is required" };
      if (!runId) return { started: false, error: "runId is required" };

      if (agentId === "coder" && !state.glassSettings.agentCodeWorkspaceRoot?.trim()) {
        return { started: false, error: "Set a project folder before running Glass Coder." };
      }

      if (projectMemoryRunning) {
        return { started: false, error: "Project memory generation is in progress." };
      }

      activeAgentRun?.controller.abort();
      rejectApprovalsForRun(activeAgentRun?.runId ?? "");
      if (activeAgentRun?.runId) {
        coderPostRunScheduler.clear(activeAgentRun.runId);
      }
      const controller = new AbortController();
      activeAgentRun = { controller, runId, agentId };

      enableCompanionModeForAgent();

      const outputDir = resolveAgentOutputFolder(state.glassSettings);
      const codeWorkspaceRoot = state.glassSettings.agentCodeWorkspaceRoot?.trim() || undefined;
      const screenContext = sanitizeAgentScreenContext(
        payload?.agentScreenContext,
        codeWorkspaceRoot ?? "",
      );

      if (agentId === "coder") {
        state.coderWorkspaceActive = true;
        state.glassIdeActive = true;
        state.agentChangeLog = [];
        syncIdeChromeFromState();
        if (!loopAutoTrigger) {
          state.coderLoopSessionId = runId;
          state.coderLoopIteration = 1;
          state.coderVerifyState = null;
          state.coderReviewState = null;
        }
      }

      let coderBootstrapContext: string | undefined;
      if (agentId === "coder" && codeWorkspaceRoot) {
        const wCtx = getCachedWindowContext();
        let preSeedRelPaths: string[] = [];
        if (state.glassSettings.indexEnabled !== false) {
          state.ollamaAvailable = await checkOllamaAvailable();
          if (hasIndex(codeWorkspaceRoot)) {
            const results = await searchIndex(codeWorkspaceRoot, prompt, 12);
            preSeedRelPaths = filterExistingRelPaths(
              codeWorkspaceRoot,
              results.map((r) => r.relPath),
            );
            ensureIndexWatcher(codeWorkspaceRoot);
          } else if (state.glassSettings.indexAutoOnOpen !== false && state.indexState.status !== "indexing") {
            runProjectIndex(codeWorkspaceRoot);
          }
        }
        const screenFilePath = screenContext?.detectedFilePath;
        const editorFilePath = getGlassIdeEditorContext().relativePath ?? undefined;
        if (editorFilePath && codeWorkspaceRoot && state.glassIdeActive) {
          const [validatedEditor] = filterExistingRelPaths(codeWorkspaceRoot, [editorFilePath]);
          if (validatedEditor && !preSeedRelPaths.includes(validatedEditor)) {
            preSeedRelPaths.unshift(validatedEditor);
          }
        }
        if (screenFilePath && codeWorkspaceRoot) {
          const resolved = resolveProjectFilePath(codeWorkspaceRoot, screenFilePath);
          if (resolved) {
            const root = resolve(expandTildePath(codeWorkspaceRoot));
            const rel = relative(root, resolved);
            const [validated] = filterExistingRelPaths(codeWorkspaceRoot, [rel]);
            if (validated && !preSeedRelPaths.includes(validated)) {
              preSeedRelPaths.unshift(validated);
            }
          }
        }
        coderBootstrapContext = await buildCoderBootstrapContext({
          projectRoot: codeWorkspaceRoot,
          appName: wCtx.status === "available" ? wCtx.appName : null,
          windowTitle: wCtx.status === "available" ? wCtx.windowTitle : null,
          preSeedFiles: preSeedRelPaths,
          screenContext,
          includeFileWalk: preSeedRelPaths.length === 0,
          prompt: enrichedPrompt,
        });
      }

      state.agentRun = {
        runId,
        agentId,
        status: "running",
        updatedAt: Date.now(),
        prompt: enrichedPrompt,
      };
      state.agentHistory = appendAgentHistory({
        runId,
        agentId,
        prompt: enrichedPrompt,
        startedAt: Date.now(),
        status: "running",
      });
      push();

      void runAgent({
        agentId,
        prompt: enrichedPrompt,
        runId,
        outputDir,
        codeWorkspaceRoot,
        projectRoot: agentId === "coder" ? codeWorkspaceRoot : undefined,
        coderBootstrapContext,
        approvalGate: agentId === "coder" ? createApprovalGate(runId, agentId) : undefined,
        signal: controller.signal,
        onEvent: relayAgentEvent,
      })
        .catch((err: unknown) => {
          if (activeAgentRun?.runId !== runId) return;
          relayAgentEvent({
            runId,
            agentId,
            kind: "error",
            error: err instanceof Error ? err.message : "Agent crashed",
          });
        })
        .finally(() => {
          if (activeAgentRun?.runId === runId) {
            activeAgentRun = null;
          }
        });

      return { started: true, runId };
    },
  );

  ipcMain.on(IPC.agentStop, (event) => {
    if (!isOverlayIpcSender(event.sender)) return;
    const current = activeAgentRun;
    if (!current) return;
    rejectApprovalsForRun(current.runId);
    current.controller.abort();
    if (current.agentId === "coder") {
      deactivateCoderWorkspace();
    }
    relayAgentEvent({
      runId: current.runId,
      agentId: current.agentId,
      kind: "cancelled",
    });
  });

  ipcMain.handle(
    IPC.agentApprove,
    (event, payload: AgentApproveRequest): AgentApproveResponse => {
      if (!isOverlayIpcSender(event.sender)) {
        return { ok: false, error: "Unauthorized" };
      }
      const runId = typeof payload?.runId === "string" ? payload.runId.trim() : "";
      const pendingToolId = typeof payload?.pendingToolId === "string" ? payload.pendingToolId.trim() : "";
      if (!runId || !pendingToolId) {
        return { ok: false, error: "runId and pendingToolId are required" };
      }
      const key = `${runId}:${pendingToolId}`;
      const resolve = approvalResolvers.get(key);
      if (!resolve) {
        return { ok: false, error: "No pending approval for this tool" };
      }
      resolve(payload.approved === true);
      return { ok: true };
    },
  );

  ipcMain.on(IPC.coderWorkspaceClose, (event) => {
    if (!isOverlayIpcSender(event.sender)) return;
    deactivateCoderWorkspace();
    push();
  });

  ipcMain.on(IPC.glassIdeOpen, (event) => {
    if (!isOverlayIpcSender(event.sender)) return;
    state.glassIdeActive = true;
    state.coderWorkspaceActive = true;
    if (
      state.agentPendingApproval?.agentId === "coder"
      && !(state.agentRun?.agentId === "coder" && state.agentRun.status === "running")
    ) {
      state.agentPendingApproval = null;
    }
    syncIdeChromeFromState();
    ideChromeOrchestrator.resetForIdeOpen();
    ideAletheiaAdvisory.resetForIdeOpen();
    try {
      ensureIdeTerminalSession();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      state.lastError = message;
      state.glassDockTerminalOpen = false;
    }
    void (async () => {
      if (state.glassIdePreviewUrl) return;
      const projectRoot = state.glassSettings.agentCodeWorkspaceRoot?.trim();
      if (!projectRoot) return;
      try {
        const url = await maybeStartStaticIdePreview(projectRoot);
        if (url && !state.glassIdePreviewUrl) {
          state.glassIdePreviewUrl = url;
          push();
        }
      } catch {
        // static preview is best-effort
      }
    })();
    push();
  });

  ipcMain.on(IPC.glassIdeClose, (event) => {
    if (!isOverlayIpcSender(event.sender)) return;
    state.glassIdeActive = false;
    state.glassIdePreviewUrl = null;
    clearGlassIdeEditorContext();
    void stopStaticPreviewServer();
    ideChromeOrchestrator.resetForIdeClose();
    ideAletheiaAdvisory.resetForIdeClose();
    const coderBusy =
      (state.agentRun?.agentId === "coder" && state.agentRun.status === "running")
      || state.agentPendingApproval?.agentId === "coder";
    if (!coderBusy) {
      state.coderWorkspaceActive = false;
    }
    syncIdeChromeFromState();
    push();
  });

  ipcMain.on(IPC.glassIdePreviewSetUrl, (event, rawUrl: string) => {
    if (!isOverlayIpcSender(event.sender)) return;
    const normalized = normalizePreviewUrl(typeof rawUrl === "string" ? rawUrl : "");
    if (!normalized || !isAllowedPreviewUrl(normalized)) return;
    state.glassIdePreviewUrl = normalized;
    push();
  });

  ipcMain.on(IPC.glassIdePreviewReload, (event) => {
    if (!isOverlayIpcSender(event.sender)) return;
    if (!state.glassIdePreviewUrl) return;
    bumpIdePreviewReload();
    push();
  });

  ipcMain.handle(IPC.glassIdeListProject, async (event) => {
    if (!isOverlayIpcSender(event.sender)) {
      return { ok: false, error: "Unauthorized" };
    }
    const projectRoot = state.glassSettings.agentCodeWorkspaceRoot?.trim() ?? "";
    return listGlassIdeProjectFiles(projectRoot);
  });

  ipcMain.handle(IPC.glassIdeReadProjectFile, async (event, relativePath: string) => {
    if (!isOverlayIpcSender(event.sender)) {
      return { ok: false, error: "Unauthorized" };
    }
    const projectRoot = state.glassSettings.agentCodeWorkspaceRoot?.trim() ?? "";
    const rel = typeof relativePath === "string" ? relativePath : "";
    return readGlassIdeProjectFile(projectRoot, rel);
  });

  ipcMain.handle(
    IPC.glassIdeWriteProjectFile,
    async (event, relativePath: string, content: string) => {
      if (!isOverlayIpcSender(event.sender)) {
        return { ok: false, error: "Unauthorized" };
      }
      const projectRoot = state.glassSettings.agentCodeWorkspaceRoot?.trim() ?? "";
      const rel = typeof relativePath === "string" ? relativePath : "";
      const body = typeof content === "string" ? content : "";
      return writeGlassIdeProjectFile(projectRoot, rel, body);
    },
  );

  ipcMain.handle(IPC.glassIdeReadTsConfig, async (event) => {
    if (!isOverlayIpcSender(event.sender)) {
      return { ok: false, error: "Unauthorized" };
    }
    const projectRoot = state.glassSettings.agentCodeWorkspaceRoot?.trim() ?? "";
    return readGlassIdeTsConfig(projectRoot);
  });

  ipcMain.on(IPC.glassIdeEditorContextUpdate, (event, ctx: import("../shared/glassIdeEditorContext.ts").GlassIdeEditorContext) => {
    if (!isOverlayIpcSender(event.sender)) return;
    if (!ctx || typeof ctx !== "object") return;
    setGlassIdeEditorContext(ctx);
    ideAletheiaAdvisory.onEditorActivity();
  });

  ipcMain.on(IPC.qaModeToggle, (event) => {
    if (!isOverlayIpcSender(event.sender)) return;
    const next = !state.glassSettings.qaModeEnabled;
    state.glassSettings = { ...state.glassSettings, qaModeEnabled: next };
    glassUserSettings = state.glassSettings;
    void persistGlassUserSettings(state.glassSettings);
    if (next && !qaNotificationShownThisSession) {
      qaNotificationShownThisSession = true;
      state.qaNotificationVisible = true;
      broadcast(IPC.showQaModeNotification, {});
    }
    if (!next) {
      state.qaPipelineState = null;
    }
    push();
  });

  ipcMain.on(IPC.qaAutoFixToggle, (event) => {
    if (!isOverlayIpcSender(event.sender)) return;
    const next = !state.glassSettings.qaAutoFix;
    state.glassSettings = { ...state.glassSettings, qaAutoFix: next };
    glassUserSettings = state.glassSettings;
    void persistGlassUserSettings(state.glassSettings);
    push();
  });

  ipcMain.on(IPC.dismissQaModeNotification, (event) => {
    if (!isOverlayIpcSender(event.sender)) return;
    state.qaNotificationVisible = false;
    push();
  });

  ipcMain.on(IPC.idePreviewProbeResult, (event, payload: { errors?: string[]; skipped?: boolean }) => {
    if (!isOverlayIpcSender(event.sender)) return;
    if (payload?.skipped) {
      previewProbeResolve?.(null);
      previewProbeResolve = null;
      return;
    }
    const errors = Array.isArray(payload?.errors)
      ? payload.errors.filter((e): e is string => typeof e === "string")
      : [];
    previewProbeResolve?.(errors);
    previewProbeResolve = null;
  });

  ipcMain.handle(IPC.qaPipelineFixAll, async (event, payload: { runId?: string }) => {
    if (!isOverlayIpcSender(event.sender)) {
      return { ok: false, error: "Unauthorized" };
    }
    const runId = typeof payload?.runId === "string" ? payload.runId.trim() : "";
    const pipeline = state.qaPipelineState;
    if (!runId || !pipeline || pipeline.runId !== runId) {
      return { ok: false, error: "No QA pipeline for this run." };
    }
    const started = triggerQaFixAll(runId, pipeline.checks, qaPipelineHost);
    return { ok: started };
  });

  ipcMain.on(IPC.glassIdeLayoutSet, (event, partial: GlassIdeLayoutSettings) => {
    if (!isOverlayIpcSender(event.sender)) return;
    if (!partial || typeof partial !== "object") return;
    const next = { ...state.glassSettings };
    if (typeof partial.glassIdeTreeWidthPx === "number" && Number.isFinite(partial.glassIdeTreeWidthPx)) {
      next.glassIdeTreeWidthPx = clampGlassIdeTreeWidthPx(partial.glassIdeTreeWidthPx);
    }
    if (typeof partial.glassIdeStreamWidthPx === "number" && Number.isFinite(partial.glassIdeStreamWidthPx)) {
      next.glassIdeStreamWidthPx = clampGlassIdeStreamWidthPx(partial.glassIdeStreamWidthPx);
    }
    if (typeof partial.glassIdeEditorSplitRatio === "number" && Number.isFinite(partial.glassIdeEditorSplitRatio)) {
      next.glassIdeEditorSplitRatio = clampGlassIdeEditorSplitRatio(partial.glassIdeEditorSplitRatio);
    }
    state.glassSettings = next;
    glassUserSettings = state.glassSettings;
    void persistGlassUserSettings(state.glassSettings);
    push();
  });

  ipcMain.on(IPC.coderPanelSetWidth, (event, widthPx: number) => {
    if (!isOverlayIpcSender(event.sender)) return;
    if (typeof widthPx !== "number" || !Number.isFinite(widthPx)) return;
    const clamped = Math.min(2400, Math.max(380, Math.round(widthPx)));
    state.glassSettings = { ...state.glassSettings, coderPanelWidthPx: clamped };
    glassUserSettings = state.glassSettings;
    void persistGlassUserSettings(state.glassSettings);
    push();
  });

  ipcMain.handle(IPC.generateProjectMemory, async (event): Promise<{ ok: boolean; error?: string }> => {
    if (!isOverlayIpcSender(event.sender)) return { ok: false, error: "Unauthorized" };
    const projectRoot = state.glassSettings.agentCodeWorkspaceRoot?.trim();
    if (!projectRoot) {
      state.lastNotice = "Set a project folder first.";
      push();
      return { ok: false, error: "Set a project folder first." };
    }
    if (coderBuildLoopHost.isAgentActive()) {
      state.projectMemoryState = { status: "error", error: "An agent is already running." };
      push();
      return { ok: false, error: "An agent is already running." };
    }
    if (projectMemoryRunning) {
      state.projectMemoryState = { status: "error", error: "Project memory generation is already in progress." };
      push();
      return { ok: false, error: "Project memory generation is already in progress." };
    }
    projectMemoryRunning = true;
    projectMemoryAbort = new AbortController();
    try {
      await generateProjectMemory(projectRoot, coderBuildLoopHost, projectMemoryAbort.signal);
      return { ok: state.projectMemoryState?.status === "done" };
    } finally {
      projectMemoryRunning = false;
      projectMemoryAbort = null;
    }
  });

  ipcMain.on(IPC.cancelProjectMemory, (event) => {
    if (!isOverlayIpcSender(event.sender)) return;
    if (!projectMemoryRunning || !projectMemoryAbort) return;
    projectMemoryAbort.abort();
  });

  ipcMain.handle(
    IPC.coderVerifyFix,
    async (
      event,
      payload: { runId?: string; errorOutput?: string },
    ): Promise<{ ok: boolean; error?: string }> => {
      if (!isOverlayIpcSender(event.sender)) return { ok: false, error: "Unauthorized" };
      const errorOutput = typeof payload?.errorOutput === "string" ? payload.errorOutput.trim() : "";
      if (!errorOutput) return { ok: false, error: "No error output" };

      if (!canStartLoopFix(coderBuildLoopHost)) {
        const capLine = narrateToolStart("coder-loop-cap", {});
        state.lastNotice = capLine;
        broadcastCoderNarrate(capLine, payload?.runId);
        push();
        return { ok: false, error: `Coder has iterated ${CODER_LOOP_MAX_ITERATIONS} times. Review manually.` };
      }
      incrementLoopForFix(coderBuildLoopHost);

      state.coderVerifyState = null;
      push();

      coderBuildLoopHost.broadcastOpenCoder({
        prompt: buildVerifyFixPrompt(errorOutput),
        autoRun: true,
        screenContext: null,
        loopAutoTrigger: true,
      });
      return { ok: true };
    },
  );

  ipcMain.handle(
    IPC.coderReviewFix,
    async (
      event,
      payload: { runId?: string; findings?: string },
    ): Promise<{ ok: boolean; error?: string }> => {
      if (!isOverlayIpcSender(event.sender)) return { ok: false, error: "Unauthorized" };
      const findings = typeof payload?.findings === "string" ? payload.findings.trim() : "";
      if (!findings) return { ok: false, error: "No findings" };

      if (!canStartLoopFix(coderBuildLoopHost)) {
        const capLine = narrateToolStart("coder-loop-cap", {});
        state.lastNotice = capLine;
        broadcastCoderNarrate(capLine, payload?.runId);
        push();
        return { ok: false, error: `Coder has iterated ${CODER_LOOP_MAX_ITERATIONS} times. Review manually.` };
      }
      incrementLoopForFix(coderBuildLoopHost);

      state.coderReviewState = null;
      push();

      coderBuildLoopHost.broadcastOpenCoder({
        prompt: buildReviewFixPrompt(findings),
        autoRun: true,
        screenContext: null,
        loopAutoTrigger: true,
      });
      return { ok: true };
    },
  );

  ipcMain.on(IPC.coderReviewDismiss, (event) => {
    if (!isOverlayIpcSender(event.sender)) return;
    state.coderReviewState = null;
    push();
  });

  ipcMain.handle(
    IPC.indexStart,
    async (event, projectRoot: string): Promise<{ ok: boolean; error?: string }> => {
      if (!isOverlayIpcSender(event.sender)) return { ok: false, error: "Unauthorized" };
      const root = typeof projectRoot === "string" ? projectRoot.trim() : "";
      if (!root) return { ok: false, error: "projectRoot is required" };
      if (state.indexState.status === "indexing") {
        return { ok: false, error: "Index already running" };
      }
      runProjectIndex(root, true);
      return { ok: true };
    },
  );

  ipcMain.handle(
    IPC.indexStatus,
    async (event): Promise<import("../shared/ipc.ts").GlassIndexState> => {
      if (!isOverlayIpcSender(event.sender)) {
        return { projectRoot: "", status: "idle" };
      }
      const root = state.glassSettings.agentCodeWorkspaceRoot?.trim() ?? "";
      if (root && state.indexState.projectRoot !== root) {
        return {
          projectRoot: root,
          status: hasIndex(root) ? "ready" : "idle",
          fileCount: hasIndex(root) ? getIndexFileCount(root) : undefined,
        };
      }
      return state.indexState;
    },
  );

  ipcMain.handle(
    IPC.detectScreenFile,
    async (event): Promise<import("../shared/ipc.ts").AgentScreenContext> => {
      if (!isOverlayIpcSender(event.sender)) {
        return { confidence: "low" };
      }
      if (state.glassSettings.screenContextEnabled === false) {
        return { confidence: "low" };
      }
      const workspaceRoot = state.glassSettings.agentCodeWorkspaceRoot?.trim();
      try {
        const result = await detectAgentScreenContextFromCapture(async () => {
          const display = screen.getPrimaryDisplay();
          return captureDisplayById(display.id, "Primary Display");
        }, SCREEN_DETECT_TIMEOUT_MS);
        const sanitized = workspaceRoot
          ? sanitizeAgentScreenContext(result, workspaceRoot)
          : result;
        broadcast(IPC.screenFileResult, sanitized ?? { confidence: "low" });
        return sanitized ?? { confidence: "low" };
      } catch (err) {
        const fallback = { confidence: "low" as const };
        broadcast(IPC.screenFileResult, fallback);
        return fallback;
      }
    },
  );

  ipcMain.handle(
    IPC.agentPickOutputFolder,
    async (event): Promise<AgentPickOutputFolderResponse> => {
      if (!isOverlayIpcSender(event.sender)) {
        return { ok: false, error: "Unauthorized" };
      }
      const result = await dialog.showOpenDialog({
        properties: ["openDirectory", "createDirectory"],
        defaultPath: resolveAgentOutputFolder(state.glassSettings),
        title: "Choose agent output folder",
      });
      if (result.canceled || !result.filePaths[0]) {
        return { ok: false, cancelled: true };
      }
      const folder = result.filePaths[0];
      state.glassSettings = { ...state.glassSettings, agentOutputFolder: folder };
      glassUserSettings = state.glassSettings;
      await persistGlassUserSettings(state.glassSettings);
      push();
      return { ok: true, folder };
    },
  );

  ipcMain.handle(
    IPC.agentPickWorkspaceRoot,
    async (event): Promise<AgentPickOutputFolderResponse> => {
      if (!isOverlayIpcSender(event.sender)) {
        return { ok: false, error: "Unauthorized" };
      }
      const result = await dialog.showOpenDialog({
        properties: ["openDirectory"],
        defaultPath: state.glassSettings.agentCodeWorkspaceRoot ?? app.getPath("home"),
        title: "Choose code workspace root",
      });
      if (result.canceled || !result.filePaths[0]) {
        return { ok: false, cancelled: true };
      }
      const folder = result.filePaths[0];
      const prevRoot = state.glassSettings.agentCodeWorkspaceRoot?.trim();
      if (prevRoot && prevRoot !== folder) {
        stopWatching(prevRoot);
      }
      state.glassSettings = { ...state.glassSettings, agentCodeWorkspaceRoot: folder };
      glassUserSettings = state.glassSettings;
      state.indexState = {
        projectRoot: folder,
        status: hasIndex(folder) ? "ready" : "idle",
        fileCount: hasIndex(folder) ? getIndexFileCount(folder) : undefined,
      };
      state.ollamaAvailable = await checkOllamaAvailable();
      await persistGlassUserSettings(state.glassSettings);
      if (state.glassIdeActive && state.glassDockTerminalId) {
        cdPtyToDirectory(state.glassDockTerminalId, folder);
        ideTerminalCwdRoot = folder;
      }
      push();
      return { ok: true, folder };
    },
  );

  ipcMain.handle(
    IPC.agentOpenPath,
    async (event, filePath: string): Promise<AgentPathResponse> => {
      if (!isOverlayIpcSender(event.sender)) {
        return { ok: false, error: "Unauthorized" };
      }
      const path = typeof filePath === "string" ? filePath.trim() : "";
      if (!path) return { ok: false, error: "path is required" };
      const err = await shell.openPath(path);
      if (err) return { ok: false, error: err };
      return { ok: true };
    },
  );

  ipcMain.handle(
    IPC.agentRevealPath,
    async (event, filePath: string): Promise<AgentPathResponse> => {
      if (!isOverlayIpcSender(event.sender)) {
        return { ok: false, error: "Unauthorized" };
      }
      const path = typeof filePath === "string" ? filePath.trim() : "";
      if (!path) return { ok: false, error: "path is required" };
      shell.showItemInFolder(path);
      return { ok: true };
    },
  );

  ipcMain.handle(
    IPC.agentRestoreBackup,
    async (event, filePath: string): Promise<AgentPathResponse> => {
      if (!isOverlayIpcSender(event.sender)) {
        return { ok: false, error: "Unauthorized" };
      }
      const path = typeof filePath === "string" ? filePath.trim() : "";
      if (!path) return { ok: false, error: "path is required" };
      const result = await restoreBackup(path);
      if (result.ok) {
        state.lastNotice = result.message;
        push();
      }
      return { ok: result.ok, error: result.ok ? undefined : result.message };
    },
  );

  // ── Power Prompt Generator ─────────────────────────────────────────────────
  ipcMain.handle(IPC.promptGenerate, async (event, payload: PromptGenerateRequest) => {
    if (!isOverlayIpcSender(event.sender)) {
      return { error: "Unauthorized" };
    }
    const intent = typeof payload?.intent === "string" ? payload.intent.trim() : "";
    if (!intent) return { error: "Intent is required" };
    const target = payload?.target ?? "general";
    const mode = payload?.mode ?? "build";

    // Prefer user-edited context over auto-detected; fall back to Glass state.
    const userContextRaw = typeof payload?.userContext === "string" ? payload.userContext.trim() : "";
    const workingContext = userContextRaw || state.workingContext;
    const activeApp = state.activeApp;

    const metaPrompt = buildMetaPrompt({ intent, target, mode, workingContext, activeApp });

    try {
      const response = await askIivoGlass(config, {
        prompt: metaPrompt,
        responseStyle: "full",
      });
      return {
        result: response.answer?.trim() ?? "",
        usedContext: workingContext,
        usedApp: activeApp,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : "Prompt generation failed";
      return { error };
    }
  });

  // ── AI Spend Tracker ───────────────────────────────────────────────────────
  ipcMain.handle(IPC.spendGet, async (event): Promise<SpendSnapshot> => {
    if (!isOverlayIpcSender(event.sender)) {
      return { providers: [], totalTodayUSD: 0, totalMonthUSD: 0, refreshedAt: 0 };
    }
    return getSpendSnapshot();
  });

  ipcMain.handle(IPC.spendRefresh, async (event): Promise<SpendSnapshot> => {
    if (!isOverlayIpcSender(event.sender)) {
      return { providers: [], totalTodayUSD: 0, totalMonthUSD: 0, refreshedAt: 0 };
    }
    return refreshSpendSnapshot();
  });

  ipcMain.handle(IPC.spendCustomFetch, async (event, payload: SpendCustomFetchRequest): Promise<SpendCustomFetchResponse> => {
    if (!isOverlayIpcSender(event.sender)) return { ok: false, error: "Unauthorized" };

    const { url, authStyle, customHeaderName, queryParamName, keyId } = payload ?? {};
    if (!url || !keyId) return { ok: false, error: "url and keyId are required" };

    const apiKey = getApiKeyValue(keyId);
    if (!apiKey) return { ok: false, error: "Key not found or could not decrypt" };

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      let fetchUrl = url;

      if (authStyle === "bearer") {
        headers["Authorization"] = `Bearer ${apiKey}`;
      } else if (authStyle === "token") {
        headers["Authorization"] = `Token ${apiKey}`;
      } else if (authStyle === "custom-header" && customHeaderName) {
        headers[customHeaderName] = apiKey;
      } else if (authStyle === "query-param" && queryParamName) {
        const sep = url.includes("?") ? "&" : "?";
        fetchUrl = `${url}${sep}${encodeURIComponent(queryParamName)}=${encodeURIComponent(apiKey)}`;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12_000);
      let res: Response;
      try {
        res = await fetch(fetchUrl, { headers, signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }

      const body = await res.json().catch(() => null);
      return { ok: res.ok, status: res.status, body };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Fetch failed" };
    }
  });

  ipcMain.handle(IPC.spendHistoryGet, (event, days?: number) => {
    if (!isOverlayIpcSender(event.sender)) return { entries: [], allTimeTotal: 0, since: null };
    const entries = getSpendHistory(typeof days === "number" ? days : 90);
    const { totalUSD: allTimeTotal, since } = getAllTimeTotal();
    return { entries, allTimeTotal, since };
  });

  // ── Terminal AI: Explain Last Error ────────────────────────────────────────
  ipcMain.handle(IPC.terminalExplain, async (event, payload: TerminalExplainRequest): Promise<TerminalExplainResponse> => {
    if (!isTerminalPanelSender(event.sender)) return { error: "Unauthorized" };

    const command = typeof payload?.command === "string" ? payload.command.trim() : "";
    const output = typeof payload?.output === "string" ? payload.output.slice(0, 8000) : "";

    if (!command && !output) return { error: "No command or output provided" };

    const exitInfo = payload?.exitCode != null ? ` (exit code ${payload.exitCode})` : "";
    const prompt = [
      `The user ran this shell command${exitInfo}:`,
      `\`\`\``,
      command || "(unknown command)",
      `\`\`\``,
      "",
      output ? `It produced this output:\n\`\`\`\n${output}\n\`\`\`` : "It produced no output.",
      "",
      "In 2–3 sentences maximum: explain what went wrong and give one specific fix. Be direct and technical. Use inline code backticks for commands and paths. Do NOT restate the question.",
    ].join("\n");

    try {
      const response = await askIivoGlass(config, {
        prompt,
        responseStyle: "full",
      });
      const explanation = response.answer?.trim() ?? "";
      if (!explanation) return { error: "No explanation returned" };
      return { explanation };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Explanation failed" };
    }
  });

  // ── Screen-Aware Terminal Assistant (Task #45) ──────────────────────────────
  // ⌘+Shift+E in the terminal: capture the full screen here in main, package it
  // with terminal context, and analyze via Claude Vision. The renderer sends only
  // text context — the screenshot never crosses the IPC boundary.
  ipcMain.handle(
    IPC.terminalVisionAnalyze,
    async (event, payload: TerminalVisionRequest): Promise<TerminalVisionResponse> => {
      const terminalWindow = getWindows()?.terminal;
      if (!terminalWindow || event.sender !== terminalWindow.webContents) {
        return { error: "Unauthorized" };
      }

      const terminalContext =
        typeof payload?.terminalContext === "string"
          ? payload.terminalContext.slice(0, 6000)
          : "";
      const lastCommand = typeof payload?.lastCommand === "string" ? payload.lastCommand : undefined;
      const lastOutput = typeof payload?.lastOutput === "string" ? payload.lastOutput : undefined;

      // Capture the user's chosen display at native resolution. Hide overlay chrome
      // but keep the terminal window visible so Claude can read on-screen errors.
      let screenshotBase64 = "";
      try {
        hideGlassWindowsForCapture(terminalWindow.webContents);
        await new Promise((resolve) => setTimeout(resolve, 150));
        const captureTarget = resolveCaptureDisplay(state.glassSettings.displayTarget);
        const capture = await captureDisplayById(captureTarget.id, captureTarget.label);
        const dataUrlMatch = capture.imageDataUrl.match(/^data:image\/\w+;base64,(.+)$/);
        screenshotBase64 = dataUrlMatch?.[1] ?? "";
        if (!screenshotBase64) {
          return { error: "Screen capture returned no image data" };
        }
      } catch (err) {
        return { error: err instanceof Error ? `Screen capture failed: ${err.message}` : "Screen capture failed" };
      } finally {
        restoreGlassWindowsAfterCapture();
      }

      const prompt = [
        "You are an expert terminal debugging assistant with full context of what's on the user's screen.",
        "",
        "The user pressed ⌘+Shift+E in their terminal. The attached screenshot shows their current screen state.",
        "",
        "Terminal session context (last commands):",
        terminalContext || "(no recent terminal context)",
        "",
        `Last command run: ${lastCommand ?? "unknown"}`,
        `Last output: ${lastOutput ?? "(see screenshot)"}`,
        "",
        "Analyze what's happening — focusing on errors, warnings, or issues visible in the terminal and on screen. Provide a concise explanation of what went wrong and specific steps to fix it. Be direct and actionable.",
      ].join("\n");

      try {
        // The IIVO Glass ask API supports native vision via `latestScreenshot`
        // (imageBase64 + mimeType) combined with visualIntent. Pass the capture
        // as a proper image block rather than embedding base64 in the text.
        const response = await askIivoGlass(config, {
          prompt,
          latestScreenshot: {
            imageBase64: screenshotBase64,
            imageDataUrl: `data:image/png;base64,${screenshotBase64}`,
            mimeType: "image/png",
            capturedAt: new Date().toISOString(),
            sourceTitle: "Glass Terminal — full screen",
          },
          visualIntent: true,
          responseStyle: "full",
        });
        const analysis = response.answer?.trim() ?? "";
        if (!analysis) return { error: "No analysis returned" };
        return { analysis };
      } catch (err) {
        return { error: err instanceof Error ? err.message : "Vision analysis failed" };
      }
    },
  );

  // ── AI Command Suggestions (Task #46) ───────────────────────────────────────
  // After a command finishes in the built-in terminal, suggest 3 useful next
  // commands. Non-streaming, same pattern as terminalExplain. Silent failure on
  // the renderer side — bad JSON or errors just don't surface a bar.
  ipcMain.handle(
    IPC.terminalSuggest,
    async (event, payload: TerminalSuggestRequest): Promise<TerminalSuggestResponse> => {
      const terminalWindow = getWindows()?.terminal;
      if (!terminalWindow || event.sender !== terminalWindow.webContents) {
        return { error: "Unauthorized" };
      }

      try {
        const lastCommand = typeof payload?.lastCommand === "string" ? payload.lastCommand.trim() : "";
        const lastStatus =
          payload?.lastStatus === "error" || payload?.lastStatus === "success"
            ? payload.lastStatus
            : "unknown";
        const cwd = typeof payload?.cwd === "string" && payload.cwd ? payload.cwd : "~";
        const recentCommands = Array.isArray(payload?.recentCommands)
          ? payload.recentCommands.filter((c): c is string => typeof c === "string").slice(-5)
          : [];

        if (!lastCommand) return { error: "No command provided" };

        const prompt = [
          "You are a terminal assistant. Based on the last command and working directory, suggest 3 useful next commands the developer might want to run.",
          "",
          `Working directory: ${cwd}`,
          `Last command: ${lastCommand}`,
          `Status: ${lastStatus === "error" ? "FAILED" : "succeeded"}`,
          `Recent commands: ${recentCommands.join(", ")}`,
          "",
          "Respond with ONLY valid JSON — an array of exactly 3 objects:",
          `[{"command": "...", "why": "one short sentence"}, ...]`,
          "",
          "Rules:",
          "- Make suggestions specific to the actual command and directory context",
          "- If the last command FAILED, prioritize debug/fix suggestions",
          "- Commands must be real, runnable shell commands",
          `- Keep "why" under 8 words`,
          "- No markdown, no explanation outside the JSON array",
        ].join("\n");

        const response = await askIivoGlass(config, { prompt, responseStyle: "full" });
        let raw = response.answer?.trim() ?? "";
        if (!raw) return { error: "No suggestions returned" };

        // Strip markdown code fences if the model wrapped the JSON.
        raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          return { error: "Could not parse suggestions" };
        }

        if (!Array.isArray(parsed)) return { error: "Could not parse suggestions" };

        const suggestions: TerminalSuggestion[] = parsed
          .filter(
            (s): s is { command: unknown; why: unknown } =>
              !!s && typeof s === "object",
          )
          .map((s) => ({
            command: typeof s.command === "string" ? s.command.trim() : "",
            why: typeof s.why === "string" ? s.why.trim() : "",
          }))
          .filter((s) => s.command.length > 0)
          .slice(0, 3);

        if (suggestions.length === 0) return { error: "Could not parse suggestions" };
        return { suggestions };
      } catch (err) {
        return { error: err instanceof Error ? err.message : "Suggestion failed" };
      }
    },
  );

  // ── Terminal AI: Natural Language → Shell command (Task #40) ────────────────
  ipcMain.handle(IPC.nlToShell, async (event, payload: NlToShellRequest): Promise<NlToShellResponse> => {
    if (!isTerminalPanelSender(event.sender)) return { error: "Unauthorized" };
    const userPrompt = typeof payload?.prompt === "string" ? payload.prompt.trim() : "";
    if (!userPrompt) return { error: "No prompt provided" };

    // Build context from recent commands
    const context = payload.recentCommands?.length
      ? `\nRecent commands:\n${payload.recentCommands.slice(-5).map((c) => `  ${c}`).join("\n")}`
      : "";

    const prompt = [
      "Convert the following natural language description into a single shell command for macOS/zsh.",
      "Rules:",
      "- Output ONLY the shell command, nothing else — no explanation, no markdown, no quotes, no backticks",
      "- If multiple commands are needed, join with && or | as appropriate",
      "- Prefer standard Unix tools (find, grep, awk, sed, ls, etc.)",
      "- Make the command safe — no destructive operations unless explicitly requested",
      context,
      "",
      `Task: ${userPrompt}`,
    ].join("\n");

    try {
      const response = await askIivoGlass(config, { prompt, responseStyle: "full" });
      const command = response.answer?.trim().replace(/^`+|`+$/g, "").trim() ?? "";
      if (!command) return { error: "No command returned" };
      return { command };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Conversion failed" };
    }
  });

  // ── Voice → Shell: Deepgram transcription (Task #44) ────────────────────────
  // The terminal renderer records mic audio and posts the buffer here; we send
  // it to Deepgram's pre-recorded REST API and return the transcript. The NL→
  // shell conversion is handled separately by the existing nlToShell IPC.
  ipcMain.handle(
    IPC.voiceShellTranscribe,
    async (event, payload: VoiceShellTranscribeRequest): Promise<VoiceShellTranscribeResponse> => {
      if (!isTerminalPanelSender(event.sender)) {
        return { error: "Unauthorized" };
      }

      const dgKey = process.env.DEEPGRAM_API_KEY?.trim();
      if (!dgKey) {
        return { error: "DEEPGRAM_API_KEY is not configured — add it to desktop-glass/.env and restart." };
      }

      const rawBuffer = payload?.buffer;
      const mimeType = typeof payload?.mimeType === "string" ? payload.mimeType : "audio/webm";
      if (!rawBuffer) {
        return { error: "No audio buffer provided" };
      }

      try {
        // The ArrayBuffer arrives as a plain object after IPC serialization;
        // Buffer.from(new Uint8Array(...)) handles both ArrayBuffer and Buffer.
        const audioBuffer = Buffer.isBuffer(rawBuffer)
          ? rawBuffer
          : Buffer.from(new Uint8Array(rawBuffer as ArrayBuffer));

        if (audioBuffer.byteLength === 0) {
          return { error: "No audio captured" };
        }

        const MAX_VOICE_AUDIO_BYTES = 5 * 1024 * 1024;
        if (audioBuffer.byteLength > MAX_VOICE_AUDIO_BYTES) {
          return { error: "Recording too long — try a shorter command." };
        }

        const dgLang = deepgramLanguageCode(parseUiLocale(state.glassSettings?.uiLocale));

        // Deepgram pre-recorded transcription REST API.
        // https://developers.deepgram.com/docs/getting-started-with-pre-recorded-audio
        const url =
          "https://api.deepgram.com/v1/listen" +
          `?model=nova-3&smart_format=true&punctuate=true&language=${encodeURIComponent(dgLang)}`;

        const response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Token ${dgKey}`,
            "Content-Type": mimeType,
          },
          body: audioBuffer,
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => response.statusText);
          return { error: `Deepgram API error ${response.status}: ${errText.slice(0, 200)}` };
        }

        const data = (await response.json()) as {
          results?: {
            channels?: Array<{
              alternatives?: Array<{ transcript?: string }>;
            }>;
          };
        };

        const transcript =
          data?.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? "";

        if (!transcript) {
          return { error: "No speech detected" };
        }

        return { transcript };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Transcription failed";
        return { error: message };
      }
    },
  );

  // ── Built-in terminal AI context (Task #41) ───────────────────────────────
  // Fire-and-forget: renderer pushes its rolling command blocks; the AI ask
  // path reads them via getTerminalContextString().
  ipcMain.on(IPC.terminalContextPush, (event, blocks: TerminalContextBlock[]): void => {
    if (!isTerminalPanelSender(event.sender)) return;
    if (!Array.isArray(blocks)) return;
    if (blocks.length === 0) {
      clearTerminalContext();
      return;
    }
    const normalized = normalizeTerminalContextBlocks(blocks);
    if (normalized.length === 0) {
      clearTerminalContext();
      return;
    }
    pushTerminalContext(normalized);
  });

  // ── Persistent Smart Scrollback (Task #47) ────────────────────────────────
  // Fire-and-forget: terminal renderer persists finished command blocks to the
  // encrypted SQLite store. Command + output are encrypted at rest; a short
  // plaintext command summary is kept for natural-language search.
  ipcMain.on(IPC.scrollbackWrite, (event, blocks: ScrollbackWriteBlock[]): void => {
    const terminalWindow = getWindows()?.terminal;
    if (!terminalWindow || event.sender !== terminalWindow.webContents) return;
    if (!Array.isArray(blocks) || blocks.length === 0) return;
    const normalized = normalizeScrollbackWriteBlocks(blocks);
    if (normalized.length === 0) return;
    writeScrollbackBlocks(normalized);
  });

  // Natural-language search over the encrypted command history. Claude ranks the
  // recent plaintext summaries by relevance to the query; matching rows are then
  // decrypted and returned. Bad JSON / no matches degrade gracefully.
  ipcMain.handle(
    IPC.scrollbackSearch,
    async (event, payload: ScrollbackSearchRequest): Promise<ScrollbackSearchResponse> => {
      const terminalWindow = getWindows()?.terminal;
      if (!terminalWindow || event.sender !== terminalWindow.webContents) {
        return { error: "Unauthorized" };
      }

      const query = typeof payload?.query === "string" ? payload.query.trim() : "";
      if (!query) return { results: [] };

      // Plaintext command summaries for Claude to rank (output stays encrypted).
      const summary = getScrollbackRecentSummary(200);
      if (summary.length === 0) return { results: [] };

      const summaryText = summary
        .map((row) => {
          const date = new Date(row.started_at).toISOString().slice(0, 16);
          const statusMark = row.status === "error" ? "✗" : "✓";
          return `[id:${row.id}] ${date} ${statusMark} ${row.cwd ?? "~"} $ ${row.command_plain}`;
        })
        .join("\n");

      const prompt = [
        "You are searching a user's terminal command history.",
        "",
        "Command history (most recent first):",
        summaryText,
        "",
        `User query: "${query}"`,
        "",
        "Return ONLY a JSON array of the IDs (integers) of the commands that best match the query. Return at most 5 IDs, most relevant first. If nothing matches, return [].",
        "",
        "Example: [42, 17, 8]",
      ].join("\n");

      let raw = "";
      try {
        const response = await askIivoGlass(config, { prompt, responseStyle: "full" });
        raw = response.answer?.trim() ?? "";
      } catch (err) {
        return { error: err instanceof Error ? err.message : "Search failed" };
      }
      if (!raw) return { results: [] };

      let ids: number[] = [];
      try {
        const stripped = raw.replace(/```[a-z]*\n?/gi, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(stripped);
        ids = parseScrollbackSearchIds(parsed);
      } catch {
        return { error: "Could not parse search results" };
      }

      const rows = getScrollbackByIdsInOrder(ids);
      return { results: rows };
    },
  );

  // ── Extract & Build Mode ───────────────────────────────────────────────────
  ipcMain.handle(IPC.extractDetect, async (event, payload: ExtractDetectRequest): Promise<ExtractDetectResponse> => {
    if (!isOverlayIpcSender(event.sender)) return { label: null, error: "Unauthorized" };
    const transcript = typeof payload?.transcript === "string" ? payload.transcript.trim() : "";
    if (!transcript) return { label: null };
    try {
      const response = await askIivoGlass(config, {
        prompt: buildDetectionPrompt(transcript),
        modelPurpose: "default",
        responseStyle: "full",
      });
      const raw = response.answer?.trim() ?? "";
      const label = parseExtractDetectLabel(raw);
      return { label };
    } catch (err) {
      return { label: null, error: err instanceof Error ? err.message : "Detection failed" };
    }
  });

  ipcMain.handle(IPC.extractGenerate, async (event, payload: ExtractGenerateRequest): Promise<ExtractGenerateResponse> => {
    if (!isOverlayIpcSender(event.sender)) return { error: "Unauthorized" };
    const transcript = typeof payload?.transcript === "string" ? payload.transcript.trim() : "";
    if (!transcript) return { error: "Transcript is required" };
    try {
      const response = await askIivoGlass(config, {
        prompt: buildGenerationPrompt(transcript, payload?.detectedLabel),
        modelPurpose: "diagnostic",
        responseStyle: "full",
      });
      return { prompt: response.answer?.trim() ?? "" };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Generation failed" };
    }
  });

  ipcMain.handle(
    IPC.extractBuildHandoff,
    async (event, payload: ExtractBuildHandoffRequest): Promise<ExtractBuildHandoffResponse> => {
      if (!isOverlayIpcSender(event.sender)) {
        return { ok: false, pasted: false, error: "Unauthorized" };
      }
      const target = payload?.target;
      const prompt = typeof payload?.prompt === "string" ? payload.prompt.trim() : "";
      const result = await runExtractBuildHandoff(target, prompt);
      let openedAccessibilitySettings = false;
      if (result.needsAccessibilitySettings) {
        const opened = await openGlassSystemSettings("accessibility");
        openedAccessibilitySettings = opened.ok;
        state.lastNotice = opened.ok
          ? `${result.error ?? "Paste blocked."} Opened Accessibility settings — enable IIVO Glass, then try again.`
          : (result.error ?? EXTRACT_BUILD_MACOS_PERMISSION_EXPLAIN);
        push();
      } else if (!result.pasted && result.error && (target === "cursor" || target === "claude")) {
        state.lastNotice = `${result.error} ${EXTRACT_BUILD_MACOS_PERMISSION_EXPLAIN}`;
        push();
      } else if (result.notice ?? result.error) {
        state.lastNotice = result.notice ?? result.error;
        push();
      }
      return {
        ok: result.ok,
        pasted: result.pasted,
        notice: result.notice,
        error: result.error,
        openedAccessibilitySettings,
      };
    },
  );

  // ── Terminal Auto Fix (Task #65) ──────────────────────────────────────────
  ipcMain.handle(
    IPC.terminalFix,
    async (_event, payload: TerminalFixRequest): Promise<TerminalFixResponse> => {
      const command = typeof payload?.command === "string" ? payload.command.trim() : "";
      const output = typeof payload?.output === "string" ? payload.output.trim() : "";
      const exitCode = typeof payload?.exitCode === "number" ? payload.exitCode : 1;
      if (!command) return { error: "command is required" };
      try {
        const prompt = buildTerminalFixPrompt(command, output, exitCode, payload?.context);
        const response = await askIivoGlass(config, {
          prompt,
          modelPurpose: "default",
          responseStyle: "full",
        });
        const raw = response.answer?.trim() ?? "";
        if (!raw) return { error: "Empty response from AI" };
        const parsed = parseTerminalFixResponse(raw);
        if (!parsed.fixedCommand) {
          return {
            error: "No fix found",
            diagnosis: parsed.diagnosis ?? undefined,
          };
        }
        return {
          fixedCommand: parsed.fixedCommand,
          diagnosis: parsed.diagnosis ?? undefined,
          whatChanged: parsed.whatChanged ?? undefined,
        };
      } catch (err) {
        return { error: err instanceof Error ? err.message : "Terminal fix failed" };
      }
    },
  );

  ipcMain.handle(IPC.getState, () => snapshot());
  ipcMain.handle(IPC.saveGlassMemory, async (_event, input: SaveGlassMemoryRequest) => {
    try {
      await saveResponseToMemoryVault({
        apiUrl: config.iivoApiUrl,
        content: input.content,
        prompt: input.prompt,
        runId: input.runId,
      });
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Memory save failed";
      return { ok: false, error: message };
    }
  });
  ipcMain.handle(IPC.windowContextGet, () => getCurrentWindowContext());
  ipcMain.handle(IPC.lensCapture, async () => {
    if (process.env.IIVO_GLASS_E2E === "1") {
      const { glassLensCaptureForE2e } = await import("./glassLensE2eStubs.ts");
      return glassLensCaptureForE2e();
    }
    return captureGlassLensPage(state.glassSettings.displayTarget);
  });
  ipcMain.handle(IPC.lensScreenshot, async () => {
    if (process.env.IIVO_GLASS_E2E === "1") {
      const { glassLensScreenshotForE2e } = await import("./glassLensE2eStubs.ts");
      return glassLensScreenshotForE2e();
    }
    return captureGlassLensScreenshot(state.glassSettings.displayTarget, {
      hideForCapture: async () => {
        hideGlassWindowsForCapture();
      },
      restoreAfterCapture: async () => {
        restoreGlassWindowsAfterCapture();
      },
    });
  });
  ipcMain.handle(IPC.hideForCapture, (event) => {
    hideGlassWindowsForCapture(event.sender);
  });
  ipcMain.handle(IPC.restoreAfterCapture, () => {
    restoreGlassWindowsAfterCapture();
  });
  ipcMain.handle(IPC.sttProcessChunk, async (_event, payload: SttProcessChunkPayload) => {
    const result = await processSttChunk(payload, {
      userDataPath: app.getPath("userData"),
      glassConfig: config,
      sessions,
      sessionIsLive,
      eventContextFields,
      persistSessions,
      appendTranscript(text: string) {
        state.transcript = appendTranscriptDeduped(state.transcript, text);
      },
      getSttState: () => state.stt,
      setSttState(next: GlassSttState) {
        state.stt = next;
      },
      setLastNotice(msg) {
        state.lastNotice = msg;
      },
      setLastError(msg) {
        if (!state.privacy.listening) return;
        // When translate is active, Deepgram handles audio — suppress all non-hard
        // errors from the old Whisper/server STT path so they don't show as red cards.
        if (isTranslateActive() && !isTranslateHardError(msg)) return;
        if (shouldSuppressTranslateStartupErrors(msg)) return;
        state.lastError = msg;
      },
      shouldReportSttErrors: () => state.privacy.listening,
      shouldSuppressNoSignalErrors: () =>
        isTranslateActive() || Date.now() < translateGraceUntilMs,
      shouldSuppressTranslateStartupErrors: () => shouldSuppressTranslateStartupErrors(),
      push,
    });
    if (result.ok && result.text?.trim()) {
      const tags = payload.source === "system_audio" ? ["system_audio"] : ["microphone"];
      maybeShowActiveListeningProactive(result.text.trim(), tags);
      void ingestTranslateChunk(result.text.trim(), { tags });
    }
    return result;
  });

  ipcMain.on(IPC.deepgramAudioChunk, (_event, buffer: ArrayBuffer) => {
    const buf = Buffer.from(buffer);
    // Forward to translate, listen-mode, and companion diarization sessions.
    deepgramSession?.sendAudio(buf);
    listenDeepgramSession?.sendAudio(buf);
    companionDeepgramSession?.sendAudio(buf);
  });

  ipcMain.on(IPC.command, (event, command: GlassCommand) => {
    void handleCommand(command, event.sender).catch((err) => {
      // Report unexpected IPC handler crashes to Sentry (production only).
      // Expected user-facing errors are set on state.lastError via handleCommand directly.
      Sentry.captureException(err, {
        extra: { commandType: (command as { type?: string }).type ?? "unknown" },
      });
      state.lastError = err instanceof Error ? err.message : String(err);
      push();
    });
  });

  ipcMain.on(IPC.setIgnoreMouse, (event, ignore: boolean) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    logGlassClickDebug("IPC setIgnoreMouse", { ignore: !!ignore, webContentsId: event.sender.id });
    setIgnoreMouseFromWindow(win, !!ignore);
  });
  ipcMain.on(IPC.overlayNotificationActive, (_event, active: boolean) => {
    overlayRendererNotificationActive = active;
    const updatePhase = state.appUpdate.phase;
    const appUpdateVisible =
      updatePhase === "available" || updatePhase === "downloading" || updatePhase === "installing";
    syncOverlayPresentationRaised(
      shouldRaiseOverlayForNotifications({
        lastError: state.lastError,
        lastNotice: state.lastNotice,
        rendererNotificationActive: overlayRendererNotificationActive,
        appUpdateVisible,
      }),
    );
  });
  ipcMain.on(IPC.overlayPointerOverNotification, (_event, over: boolean) => {
    setOverlayPointerOverNotification(!!over);
  });

  ipcMain.on(IPC.overlayPointerOverDebriefPanel, (_event, over: boolean) => {
    setOverlayPointerOverDebriefPanel(!!over);
  });

  ipcMain.on(IPC.builderStripVisible, (_event, visible: boolean) => {
    setBuilderStripVisible(!!visible);
  });

  ipcMain.on(IPC.overlayPointerOverBuilderStrip, (_event, over: boolean) => {
    setOverlayPointerOverBuilderStrip(!!over);
  });

  ipcMain.on(IPC.overlayPointerOverIde, (_event, over: boolean) => {
    setOverlayPointerOverIde(!!over);
  });

  ipcMain.on(IPC.builderStripPanelOpen, (_event, open: boolean) => {
    setBuilderStripPanelOpen(!!open);
  });

  ipcMain.on(IPC.responsePanelOpen, (_event, open: boolean) => {
    setResponsePanelOpen(!!open);
  });

  ipcMain.on(IPC.copilotOverlayCardOpen, (_event, open: boolean) => {
    setCopilotOverlayCardOpen(!!open);
  });

  ipcMain.on(IPC.resizeDock, (_event, width: number, height: number) => {
    if (typeof width === "number" && typeof height === "number") {
      const vertical = glassUserSettings.dockOrientation === "vertical";
      resizeDockWindow(
        width,
        height,
        vertical ? { minWidth: DOCK_MIN_WIDTH_VERTICAL, vertical: true } : undefined,
      );
    }
  });

  ipcMain.on(IPC.resizeTerminal, (event, width: number, height: number) => {
    if (!isTerminalPanelSender(event.sender)) return;
    resizeGlassTerminalWindow(width, height);
  });

  ipcMain.on(IPC.dismissTerminalWindow, (event) => {
    if (!isTerminalPanelSender(event.sender)) return;
    dismissGlassTerminalWindow();
  });

  if (process.env.IIVO_GLASS_E2E === "1") {
    ipcMain.handle(IPC.e2eGetExternalUrls, () => getE2eExternalUrls());
    ipcMain.handle(IPC.e2eResetExternalUrls, () => {
      resetE2eExternalUrls();
    });
    ipcMain.handle(IPC.e2eGetWindowMetadata, () => getGlassE2eWindowMetadata());
    ipcMain.handle(IPC.e2eGetCaptureTarget, () =>
      resolveCaptureDisplay(glassUserSettings.displayTarget),
    );
    ipcMain.handle(IPC.e2eSimulateCaptureFail, () => {
      process.env.IIVO_GLASS_E2E_CAPTURE_FAIL = "1";
      return { ok: true };
    });
    ipcMain.handle(IPC.e2eSimulateScreenEnumFail, () => {
      process.env.IIVO_GLASS_E2E_SCREEN_ENUM_FAIL = "1";
      return { ok: true };
    });
    ipcMain.handle(IPC.e2eSimulateSystemAudioEnumFail, () => {
      process.env.IIVO_GLASS_E2E_SYSTEM_AUDIO_ENUM_FAIL = "1";
      return { ok: true };
    });
  }

  // ── Built-in terminal raw channels (high-frequency, bypasses state) ─────────
  ipcMain.on(IPC.ptyInput, (event, termId: string, data: string) => {
    if (!isTerminalPanelSender(event.sender)) return;
    if (!isValidPtySessionId(termId) || typeof data !== "string") return;
    writePtyInput(termId, data);
  });
  ipcMain.on(IPC.ptyResize, (event, termId: string, cols: number, rows: number) => {
    if (!isTerminalPanelSender(event.sender)) return;
    if (!isValidPtySessionId(termId)) return;
    if (typeof cols !== "number" || typeof rows !== "number") return;
    resizePty(termId, cols, rows);
  });
  ipcMain.handle(IPC.ptyReplay, (event, termId: string, fromByte?: number) => {
    if (!isTerminalPanelSender(event.sender)) return "";
    if (!isValidPtySessionId(termId)) return "";
    if (typeof fromByte === "number" && fromByte >= 0) {
      return getPtyReplayBufferFrom(termId, fromByte);
    }
    return getPtyReplayBuffer(termId);
  });
  ipcMain.handle(IPC.ptyReplayLength, (event, termId: string) => {
    if (!isTerminalPanelSender(event.sender)) return 0;
    return isValidPtySessionId(termId) ? getPtyReplayBufferLength(termId) : 0;
  });
}

function registerGlobalHotkeys(): void {
  const status = registerCommandBarHotkeys(state.glassSettings.hotkeyPreset);
  state.operationDiagnostics = {
    ...state.operationDiagnostics,
    hotkeyStatus: status,
  };
  // ⌘⇧G — Glass Command Palette (Task #66)
  registerContextAskHotkey(() => {
    void handleCommand({ type: "toggle-command-palette" });
  });
  // ⌘⇧P — Glass Powers Menu
  registerPowersMenuHotkey(() => {
    void handleCommand({ type: "toggle-powers-menu" });
  });

  // #165 — Custom slash commands: load + hot-reload ~/.iivo/glass-commands.json
  watchCustomCommands(({ commands, warnings }) => {
    state.customCommands = commands;
    state.customCommandsWarnings = warnings.length > 0 ? warnings : undefined;
    push();
    if (warnings.length > 0) {
      console.warn("[custom-commands] Warnings:", warnings.join("; "));
    }
    if (commands.length > 0) {
      console.log(`[custom-commands] Loaded ${commands.length} command(s):`, commands.map((c) => c.name).join(", "));
    }
  });
}

app.whenReady().then(async () => {
  if (process.env.IIVO_GLASS_DIAGNOSE === "1") {
    glassUserSettings = await loadGlassUserSettings();
    refreshAppIdentityState();
    const report = await runCaptureDiagnosticsReport({
      displayTarget: glassUserSettings.displayTarget,
    });
    console.log(JSON.stringify(report, null, 2));
    app.quit();
    return;
  }

  refreshAppIdentityState();

  const showSplash =
    process.env.IIVO_GLASS_E2E !== "1" && isBootSplashBundlePresent(mainDir);
  if (showSplash) {
    beginGlassBootSequence();
    createSplashWindow();
  }
  const splashMinDisplay = showSplash
    ? new Promise<void>((resolve) => setTimeout(resolve, GLASS_BOOT_DURATION_MS))
    : Promise.resolve();

  registerScreenshotProtocol();
  registerSystemAudioHandler();
  moments = await loadMoments();
  sessions = await loadSessions();
  glassUserSettings = await loadGlassUserSettings();
  state.agentHistory = loadAgentHistory();

  // Check GitHub PAT at startup (silent — never throws)
  try {
    const { isPATConfigured } = await import("./githubService.ts");
    githubPATState = await isPATConfigured();
  } catch {
    // safeStorage unavailable or file unreadable — stay at defaults
  }
  if (!app.isPackaged && process.env.IIVO_GLASS_E2E !== "1") {
    glassUserSettings = { ...glassUserSettings, displayTarget: "primary" };
  }
  let glassOnboardingState = await loadGlassOnboardingState();
  if (process.env.IIVO_GLASS_E2E === "1") {
    glassOnboardingState = { ...glassOnboardingState, completed: true };
    glassUserSettings = { ...glassUserSettings, onboardingComplete: true };
    state.e2eFastOnboarding = true;
  }
  // Legacy users who finished the old overlay — skip Sorting Hat on upgrade.
  if (glassOnboardingState.completed && !glassUserSettings.onboardingComplete) {
    glassUserSettings = { ...glassUserSettings, onboardingComplete: true };
    await persistGlassUserSettings(glassUserSettings);
  }
  const needsSortingHat = !glassUserSettings.onboardingComplete;
  state.glassUserProfile = glassOnboardingState.profile;
  state.iivoAccountLink = await loadIivoAccountLink();
  if (needsSortingHat) {
    setOnboardingPending(true);
  }
  // Keep Sorting Hat out of the overlay until boot splash fully finishes.
  state.onboardingOpen = false;
  if (showSplash) {
    state.glassBootComplete = false;
    setGlassBootSequenceCompleteHandler(() => {
      state.glassBootComplete = true;
      push();
    });
  } else {
    state.glassBootComplete = true;
    setGlassBootSequenceCompleteHandler(null);
  }
  glassContextProfile = await loadGlassContextProfile();
  const sanitizedTarget = sanitizeDisplayTarget(glassUserSettings.displayTarget);
  if (sanitizedTarget !== glassUserSettings.displayTarget) {
    glassUserSettings = { ...glassUserSettings, displayTarget: sanitizedTarget };
    await persistGlassUserSettings(glassUserSettings);
  }
  if (process.env.IIVO_GLASS_E2E === "1") {
    glassUserSettings = { ...glassUserSettings, hotkeyPreset: "disabled" };
  }
  state.glassSettings = glassUserSettings;
  state.onboardingComplete = state.glassSettings.onboardingComplete ?? false;
  state.persona = state.glassSettings.persona;
  state.ollamaAvailable = await checkOllamaAvailable();
  const bootWorkspaceRoot = state.glassSettings.agentCodeWorkspaceRoot?.trim();
  if (bootWorkspaceRoot) {
    state.indexState = {
      projectRoot: bootWorkspaceRoot,
      status: hasIndex(bootWorkspaceRoot) ? "ready" : "idle",
      fileCount: hasIndex(bootWorkspaceRoot) ? getIndexFileCount(bootWorkspaceRoot) : undefined,
    };
  }
  if (!app.isPackaged && state.onboardingComplete && !state.persona) {
    state.persona = "developer";
    glassUserSettings = { ...glassUserSettings, persona: "developer" };
    state.glassSettings = glassUserSettings;
    void persistGlassUserSettings(glassUserSettings);
  }
  syncBuilderStripLayoutReserve();
  // Apply any persisted server URL overrides to config at boot.
  if (glassUserSettings.iivoApiUrl) config.iivoApiUrl = glassUserSettings.iivoApiUrl;
  if (glassUserSettings.iivoWebUrl) config.iivoWebUrl = glassUserSettings.iivoWebUrl;
  state.selectedVirtualAudioDeviceId = glassUserSettings.selectedVirtualAudioDeviceId;
  copilot.setConfig(glassUserSettings.copilot);
  bindCopilotToSession();
  // Copilot never auto-starts listening; only resume its loop if a session is
  // already live (restored) and the user previously enabled an active mode.
  if (sessionIsLive() && copilotModeIsActive(copilot.getConfig().mode)) {
    startCopilotLoop();
  }
  state.windowContext = await getCurrentWindowContext();
  setChromeLayoutPersistHandler((partial) => {
    glassUserSettings = { ...glassUserSettings, ...partial };
    state.glassSettings = glassUserSettings;
    void persistGlassUserSettings(glassUserSettings);
  });
  registerIpc();

  // AI Spend Tracker — 15-min background polling (initial fetch delayed 10 s)
  startSpendPolling();

  // Live terminal widget — always-on polling starts at app launch
  startLiveTerminalPolling();

  // Perception loop — clipboard + app-switch events
  startPerceptionLoop();

  // Ambient screen intelligence — passive 60 s digest loop
  startScreenDigestLoop({
    resolveCaptureTarget: () => resolveCaptureDisplay(state.glassSettings.displayTarget),
    getConfig: () => config,
    onDigest: (result) => {
      latestDigest = result;
      state.workingContext = result.text;
      state.workingContextAge = result.capturedAt;
      push();
    },
    onError: () => {
      /* silent — screen recording permission may not be granted */
    },
  });

  // QA HTTP bridge — only when IIVO_GLASS_TEST=1, never in production
  if (process.env.IIVO_GLASS_TEST === "1") {
    const { startGlassQaBridge } = await import("./glassQaBridge.ts");
    startGlassQaBridge({
      secret: process.env.GLASS_API_SECRET ?? "",
      getState: snapshot,
      runCommand: (cmd) => handleCommand(cmd, undefined),
    });
  }

  setCommandBarLayoutChangedHandler(() => {
    if (refreshCommandBarOverlayClearance()) {
      push();
    }
  });
  createWindows(config, glassUserSettings.displayTarget);
  applyGlassUserSettings(glassUserSettings);
  void restoreMacOutputFromSettings(glassUserSettings);
  broadcastStartupAudioRestore();
  registerGlobalHotkeys();
  if (needsSortingHat) {
    setOnboardingEmergencyHandler(() => {
      void finishSortingHatOnboarding();
    });
    registerOnboardingEmergencyShortcut();
  } else {
    setOnboardingEmergencyHandler(null);
  }
  refreshSetupCapabilities();
  push();
  scheduleInitialSetupCheck();
  initGlassAutoUpdater((patch) => {
    state.appUpdate = {
      ...state.appUpdate,
      ...patch,
      currentVersion: app.getVersion(),
    };
    push();
  }, config.iivoApiUrl);
  scheduleGlassUpdateChecks();

  if (showSplash) {
    const readyWindows = getWindows();
    const windowsReady = readyWindows ? whenGlassWindowsReady(readyWindows) : Promise.resolve();
    void Promise.all([windowsReady, splashMinDisplay]).then(() => finishSplash());
  }

  app.on("activate", () => {
    if (getWindows() === null) {
      createWindows(config, glassUserSettings.displayTarget);
      applyGlassUserSettings(glassUserSettings);
      registerGlobalHotkeys();
      push();
    }
  });
});

app.on("will-quit", () => {
  appIsQuitting = true; // guard PTY onExit callbacks from calling push() on destroyed windows
  stopAllWatchers();
  closeAllIndexDbs();
  unregisterCommandBarHotkeys();
  if (glassUpdateCheckTimer) clearInterval(glassUpdateCheckTimer);
  // Task #42: clear title-poll intervals before killing sessions.
  // onExit early-returns when appIsQuitting=true, so we must clear here.
  for (const id of [...titlePollIntervals.keys()]) stopTitlePolling(id);
  // Task #47: close the encrypted scrollback SQLite connection cleanly.
  closeScrollbackDb();
  killAllPtySessions();
  disposeWindows();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
