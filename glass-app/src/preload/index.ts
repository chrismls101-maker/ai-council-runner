/**
 * Preload bridge. Exposes a minimal, typed `window.glass` API to the renderers.
 * The renderer never gets direct Node/Electron access.
 */

import { contextBridge, ipcRenderer } from "electron";

// Dashboard + overlay + dock each subscribe to state; avoid dev MaxListeners warnings.
ipcRenderer.setMaxListeners(25);

import {
  IPC,
  type GlassCommand,
  type GlassState,
  type SaveGlassMemoryRequest,
  type SaveGlassMemoryResponse,
  type SttProcessChunkRequest,
  type SttProcessChunkResponse,
  type ApiKeyMeta,
  type ApiKeyListResponse,
  type ApiKeyValueResponse,
  type ApiKeyMutateResponse,
  type ApiKeySaveRequest,
  type PromptGenerateRequest,
  type PromptGenerateResponse,
  type SpendSnapshot,
  type SpendCustomFetchRequest,
  type SpendCustomFetchResponse,
  type SpendDaySummary,
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
  type AgentRunRequest,
  type AgentRunResponse,
  type AgentEvent,
  type AgentPickOutputFolderResponse,
  type AgentPathResponse,
  type AgentApproveRequest,
  type AgentApproveResponse,
  type AgentSetApprovalModeRequest,
  type AgentSetApprovalModeResponse,
  type GlassIdeGhostSuggestRequest,
  type GlassIdeGhostSuggestResponse,
  type GlassIdeProjectLibsResponse,
  type GlassIdeSelectWorkspaceRequest,
  type GlassIdeSelectWorkspaceResponse,
  type CoderRollbackCheckpointRequest,
  type CoderRollbackCheckpointResponse,
  type   AgentScreenContext,
  type OpenCoderWithPromptPayload,
  type GlassIndexState,
  type RetentionSummary,
} from "../shared/ipc.ts";
import type {
  GlassIdeListProjectResponse,
  GlassIdeReadProjectFileResponse,
  GlassIdeWriteProjectFileResponse,
} from "../shared/glassIdeProject.ts";
import type { GlassIdeTsConfigResponse } from "../shared/glassIdeTsConfig.ts";
import type { GlassIdeEditorContext } from "../shared/glassIdeEditorContext.ts";
import type { GlassIdeLayoutSettings } from "../shared/glassIdeLayout.ts";
import type { WindowContext } from "../shared/windowContextTypes.ts";

const glassApi = {
  send(command: GlassCommand): void {
    ipcRenderer.send(IPC.command, command);
  },
  getState(): Promise<GlassState> {
    return ipcRenderer.invoke(IPC.getState) as Promise<GlassState>;
  },
  getWindowContext(): Promise<WindowContext> {
    return ipcRenderer.invoke(IPC.windowContextGet) as Promise<WindowContext>;
  },
  processSttChunk(payload: SttProcessChunkRequest): Promise<SttProcessChunkResponse> {
    return ipcRenderer.invoke(IPC.sttProcessChunk, payload) as Promise<SttProcessChunkResponse>;
  },
  onState(listener: (state: GlassState) => void): () => void {
    const handler = (_event: unknown, state: GlassState): void => listener(state);
    ipcRenderer.on(IPC.state, handler);
    return () => ipcRenderer.removeListener(IPC.state, handler);
  },
  onTranscriptionControl(
    listener: (command: import("../shared/ipc.ts").TranscriptionControlCommand) => void,
  ): () => void {
    const handler = (
      _event: unknown,
      command: import("../shared/ipc.ts").TranscriptionControlCommand,
    ): void => listener(command);
    ipcRenderer.on(IPC.transcriptionControl, handler);
    return () => ipcRenderer.removeListener(IPC.transcriptionControl, handler);
  },
  onCommandBarFocus(listener: () => void): () => void {
    const handler = (): void => listener();
    ipcRenderer.on(IPC.commandBarFocus, handler);
    return () => ipcRenderer.removeListener(IPC.commandBarFocus, handler);
  },
  onCommandBarPrefill(listener: (text: string) => void): () => void {
    const handler = (_event: unknown, text: string): void => listener(text);
    ipcRenderer.on(IPC.commandBarPrefill, handler);
    return () => ipcRenderer.removeListener(IPC.commandBarPrefill, handler);
  },
  setIgnoreMouse(ignore: boolean): void {
    ipcRenderer.send(IPC.setIgnoreMouse, ignore);
  },
  setOverlayNotificationActive(active: boolean): void {
    ipcRenderer.send(IPC.overlayNotificationActive, active);
  },
  setOverlayPointerOverNotification(over: boolean): void {
    ipcRenderer.send(IPC.overlayPointerOverNotification, over);
  },
  setOverlayPointerOverDebriefPanel(over: boolean): void {
    ipcRenderer.send(IPC.overlayPointerOverDebriefPanel, over);
  },
  setBuilderStripVisible(visible: boolean): void {
    ipcRenderer.send(IPC.builderStripVisible, visible);
  },
  setOverlayPointerOverBuilderStrip(over: boolean): void {
    ipcRenderer.send(IPC.overlayPointerOverBuilderStrip, over);
  },
  setOverlayPointerOverExitControl(over: boolean): void {
    ipcRenderer.send(IPC.overlayPointerOverExitControl, over);
  },
  setOverlayPointerOverIde(over: boolean): void {
    ipcRenderer.send(IPC.overlayPointerOverIde, over);
  },
  setBuilderStripPanelOpen(open: boolean): void {
    ipcRenderer.send(IPC.builderStripPanelOpen, open);
  },
  setResponsePanelOpen(open: boolean): void {
    ipcRenderer.send(IPC.responsePanelOpen, open);
  },
  setCopilotOverlayCardOpen(open: boolean): void {
    ipcRenderer.send(IPC.copilotOverlayCardOpen, open);
  },
  resizeDock(width: number, height: number): void {
    ipcRenderer.send(IPC.resizeDock, width, height);
  },
  resizeTerminal(width: number, height: number): void {
    ipcRenderer.send(IPC.resizeTerminal, width, height);
  },
  dismissTerminalWindow(): void {
    ipcRenderer.send(IPC.dismissTerminalWindow);
  },
  onTerminalWindowShown(listener: () => void): () => void {
    const handler = (): void => listener();
    ipcRenderer.on(IPC.terminalWindowShown, handler);
    return () => ipcRenderer.removeListener(IPC.terminalWindowShown, handler);
  },
  onTerminalTitleUpdate(listener: (termId: string, title: string | null) => void): () => void {
    const handler = (_event: unknown, termId: string, title: string | null): void =>
      listener(termId, title);
    ipcRenderer.on(IPC.terminalTitleUpdate, handler);
    return () => ipcRenderer.removeListener(IPC.terminalTitleUpdate, handler);
  },
  getE2eExternalUrls(): Promise<string[]> {
    return ipcRenderer.invoke(IPC.e2eGetExternalUrls) as Promise<string[]>;
  },
  resetE2eExternalUrls(): Promise<void> {
    return ipcRenderer.invoke(IPC.e2eResetExternalUrls) as Promise<void>;
  },
  getE2eWindowMetadata(): Promise<import("../shared/glassE2eTypes.ts").GlassE2eWindowMetadata[]> {
    return ipcRenderer.invoke(IPC.e2eGetWindowMetadata) as Promise<
      import("../shared/glassE2eTypes.ts").GlassE2eWindowMetadata[]
    >;
  },
  getE2eCaptureTarget(): Promise<{ id: number; label: string }> {
    return ipcRenderer.invoke(IPC.e2eGetCaptureTarget) as Promise<{ id: number; label: string }>;
  },
  simulateE2eCaptureFail(): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke(IPC.e2eSimulateCaptureFail) as Promise<{ ok: boolean }>;
  },
  simulateE2eScreenEnumFail(): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke(IPC.e2eSimulateScreenEnumFail) as Promise<{ ok: boolean }>;
  },
  simulateE2eSystemAudioEnumFail(): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke(IPC.e2eSimulateSystemAudioEnumFail) as Promise<{ ok: boolean }>;
  },
  saveGlassMemory(payload: SaveGlassMemoryRequest): Promise<SaveGlassMemoryResponse> {
    return ipcRenderer.invoke(IPC.saveGlassMemory, payload) as Promise<SaveGlassMemoryResponse>;
  },
  captureLens(): Promise<import("../shared/glassLensContext.ts").GlassLensCaptureResult> {
    return ipcRenderer.invoke(IPC.lensCapture) as Promise<
      import("../shared/glassLensContext.ts").GlassLensCaptureResult
    >;
  },
  captureLensScreenshot(): Promise<import("../shared/glassLensContext.ts").GlassLensScreenshotResult> {
    return ipcRenderer.invoke(IPC.lensScreenshot) as Promise<
      import("../shared/glassLensContext.ts").GlassLensScreenshotResult
    >;
  },
  hideForCapture(): Promise<void> {
    return ipcRenderer.invoke(IPC.hideForCapture) as Promise<void>;
  },
  restoreAfterCapture(): Promise<void> {
    return ipcRenderer.invoke(IPC.restoreAfterCapture) as Promise<void>;
  },
  sendDeepgramAudioChunk(buffer: ArrayBuffer): void {
    ipcRenderer.send(IPC.deepgramAudioChunk, buffer);
  },
  onCompanionPrivacyResumed(listener: () => void): () => void {
    const handler = (): void => listener();
    ipcRenderer.on(IPC.companionPrivacyResumed, handler);
    return () => ipcRenderer.removeListener(IPC.companionPrivacyResumed, handler);
  },
  onCompanionDeepgramFinal(
    listener: (payload: { text: string; speakerId?: number }) => void,
  ): () => void {
    const handler = (
      _event: unknown,
      payload: { text: string; speakerId?: number },
    ): void => listener(payload);
    ipcRenderer.on(IPC.companionDeepgramFinal, handler);
    return () => ipcRenderer.removeListener(IPC.companionDeepgramFinal, handler);
  },
  setE2eCaptureProbes(payload: {
    screenCaptureProbe?: import("../shared/captureSourceEnumeration.ts").ScreenCaptureProbeStatus;
    screenCaptureDetail?: string;
    windowCaptureProbe?: import("../shared/captureSourceEnumeration.ts").WindowCaptureProbeStatus;
    systemAudioStatus?: import("../shared/systemAudioTypes.ts").SystemAudioStatus;
    systemAudioDetail?: string;
  }): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke(IPC.e2eSetCaptureProbes, payload) as Promise<{ ok: boolean }>;
  },
  // ── Built-in terminal (PTY) ─────────────────────────────────────────────────
  /** Subscribe to PTY output data from main process. Returns unsubscribe fn. */
  onPtyData(listener: (termId: string, data: string) => void): () => void {
    const handler = (_event: unknown, termId: string, data: string): void =>
      listener(termId, data);
    ipcRenderer.on(IPC.ptyData, handler);
    return () => ipcRenderer.removeListener(IPC.ptyData, handler);
  },
  /** Send keystroke/paste data to a PTY session. High-frequency, raw channel. */
  sendPtyInput(termId: string, data: string): void {
    ipcRenderer.send(IPC.ptyInput, termId, data);
  },
  /** Notify main process that the terminal was resized. */
  sendPtyResize(termId: string, cols: number, rows: number): void {
    ipcRenderer.send(IPC.ptyResize, termId, cols, rows);
  },
  replayPtySession(termId: string, fromByte?: number): Promise<string> {
    return ipcRenderer.invoke(IPC.ptyReplay, termId, fromByte) as Promise<string>;
  },
  replayPtyByteLength(termId: string): Promise<number> {
    return ipcRenderer.invoke(IPC.ptyReplayLength, termId) as Promise<number>;
  },
  writeClipboard(text: string): Promise<boolean> {
    return ipcRenderer.invoke(IPC.writeClipboard, text) as Promise<boolean>;
  },
  // ── API Key Manager ────────────────────────────────────────────────────────
  apiKeyList(): Promise<ApiKeyListResponse> {
    return ipcRenderer.invoke(IPC.apiKeyList) as Promise<ApiKeyListResponse>;
  },
  apiKeyGetValue(id: string): Promise<ApiKeyValueResponse> {
    return ipcRenderer.invoke(IPC.apiKeyGetValue, id) as Promise<ApiKeyValueResponse>;
  },
  apiKeyGetMasked(id: string): Promise<import("../shared/ipc.ts").ApiKeyMaskedResponse> {
    return ipcRenderer.invoke(IPC.apiKeyGetMasked, id) as Promise<
      import("../shared/ipc.ts").ApiKeyMaskedResponse
    >;
  },
  apiKeySave(payload: ApiKeySaveRequest): Promise<ApiKeyMutateResponse> {
    return ipcRenderer.invoke(IPC.apiKeySave, payload) as Promise<ApiKeyMutateResponse>;
  },
  apiKeyDelete(id: string): Promise<ApiKeyMutateResponse> {
    return ipcRenderer.invoke(IPC.apiKeyDelete, id) as Promise<ApiKeyMutateResponse>;
  },
  activationConnect(apiKey: string): Promise<import("../shared/ipc.ts").ActivationConnectResponse> {
    return ipcRenderer.invoke(IPC.activationConnect, apiKey) as Promise<
      import("../shared/ipc.ts").ActivationConnectResponse
    >;
  },
  activationOpenKeysUrl(): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke(IPC.activationOpenKeysUrl) as Promise<{ ok: boolean }>;
  },
  activationQuit(): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke(IPC.activationQuit) as Promise<{ ok: boolean }>;
  },
  openDashboard(nav?: import("../shared/glassDashboardNav.ts").GlassDashboardNav): void {
    ipcRenderer.send(IPC.openGlassDashboard, nav);
  },
  closeDashboard(): void {
    ipcRenderer.send(IPC.closeGlassDashboard);
  },
  openSettings(section?: import("../shared/panelTabRouting.ts").GlassSettingsSection): void {
    ipcRenderer.send(IPC.openGlassSettings, section);
  },
  getSettingsInitialSection(): Promise<import("../shared/panelTabRouting.ts").GlassSettingsSection> {
    return ipcRenderer.invoke(IPC.getSettingsInitialSection) as Promise<
      import("../shared/panelTabRouting.ts").GlassSettingsSection
    >;
  },
  closeSettings(): void {
    ipcRenderer.send(IPC.closeGlassSettings);
  },
  getAppVersion(): Promise<string> {
    return ipcRenderer.invoke(IPC.getAppVersion) as Promise<string>;
  },
  getSentryDsn(): Promise<string | null> {
    return ipcRenderer.invoke(IPC.getSentryDsn) as Promise<string | null>;
  },
  settingsOpenExternal(url: string): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke(IPC.settingsOpenExternal, url) as Promise<{ ok: boolean }>;
  },
  notifyGlassDashboardMounted(): void {
    ipcRenderer.send(IPC.glassDashboardMounted);
  },
  onDashboardAgentEvent(
    listener: (event: import("../shared/ipc.ts").GlassDashboardAgentEvent) => void,
  ): () => void {
    const handler = (
      _event: unknown,
      payload: import("../shared/ipc.ts").GlassDashboardAgentEvent,
    ): void => listener(payload);
    ipcRenderer.on(IPC.dashboardAgentEvent, handler);
    return () => ipcRenderer.removeListener(IPC.dashboardAgentEvent, handler);
  },
  getRecentSessions(): Promise<import("../shared/ipc.ts").SessionRowWithMeta[]> {
    return ipcRenderer.invoke(IPC.getRecentSessions) as Promise<
      import("../shared/ipc.ts").SessionRowWithMeta[]
    >;
  },
  getSessionMessages(sessionId: string): Promise<import("../shared/ipc.ts").MessageRow[]> {
    return ipcRenderer.invoke(IPC.getSessionMessages, sessionId) as Promise<
      import("../shared/ipc.ts").MessageRow[]
    >;
  },
  getLastCouncilRun(): Promise<import("../shared/ipc.ts").AgentRunRow[] | null> {
    return ipcRenderer.invoke(IPC.getLastCouncilRun) as Promise<
      import("../shared/ipc.ts").AgentRunRow[] | null
    >;
  },
  getAgentRunsByCorrelation(
    correlationId: string,
  ): Promise<import("../shared/ipc.ts").AgentRunRow[]> {
    return ipcRenderer.invoke(IPC.getAgentRunsByCorrelation, correlationId) as Promise<
      import("../shared/ipc.ts").AgentRunRow[]
    >;
  },
  getUserContext(): Promise<import("../shared/ipc.ts").UserContextRow[]> {
    return ipcRenderer.invoke(IPC.getUserContext) as Promise<
      import("../shared/ipc.ts").UserContextRow[]
    >;
  },
  deleteUserContextKey(key: string): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke(IPC.deleteUserContextKey, key) as Promise<{ ok: boolean }>;
  },
  getRetentionSummary(): Promise<RetentionSummary> {
    return ipcRenderer.invoke(IPC.getRetentionSummary) as Promise<RetentionSummary>;
  },
  getAgentBusHealth(): Promise<import("../shared/ipc.ts").AgentBusHealthSnapshot> {
    return ipcRenderer.invoke(IPC.getAgentBusHealth) as Promise<
      import("../shared/ipc.ts").AgentBusHealthSnapshot
    >;
  },
  getSessionSpend(sessionId: string): Promise<{
    summary: import("../shared/glassSessionHistory.ts").SessionSpendSummary | null;
    calls: import("../shared/glassSessionHistory.ts").ModelCallRow[];
  }> {
    return ipcRenderer.invoke(IPC.getSessionSpend, sessionId) as Promise<{
      summary: import("../shared/glassSessionHistory.ts").SessionSpendSummary | null;
      calls: import("../shared/glassSessionHistory.ts").ModelCallRow[];
    }>;
  },
  activationSetPresentation(
    mode: import("../shared/ipc.ts").ActivationPresentation,
  ): Promise<{ ok: boolean; presentation?: import("../shared/ipc.ts").ActivationPresentation }> {
    return ipcRenderer.invoke(IPC.activationSetPresentation, mode) as Promise<{
      ok: boolean;
      presentation?: import("../shared/ipc.ts").ActivationPresentation;
    }>;
  },
  activationSpeak(text: string): Promise<import("../shared/ipc.ts").ActivationSpeakResponse> {
    return ipcRenderer.invoke(IPC.activationSpeak, text) as Promise<
      import("../shared/ipc.ts").ActivationSpeakResponse
    >;
  },
  activationAskHelp(question: string): Promise<import("../shared/ipc.ts").ActivationAskHelpResponse> {
    return ipcRenderer.invoke(IPC.activationAskHelp, question) as Promise<
      import("../shared/ipc.ts").ActivationAskHelpResponse
    >;
  },
  anthropicKeyConnect(apiKey: string): Promise<import("../shared/ipc.ts").ActivationConnectResponse> {
    return ipcRenderer.invoke(IPC.anthropicKeyConnect, apiKey) as Promise<
      import("../shared/ipc.ts").ActivationConnectResponse
    >;
  },
  openaiKeyConnect(apiKey: string): Promise<import("../shared/ipc.ts").ActivationConnectResponse> {
    return ipcRenderer.invoke(IPC.openaiKeyConnect, apiKey) as Promise<
      import("../shared/ipc.ts").ActivationConnectResponse
    >;
  },
  providerTestConnection(
    payload: import("../shared/ipc.ts").ProviderTestConnectionRequest,
  ): Promise<import("../shared/ipc.ts").ProviderTestConnectionResponse> {
    return ipcRenderer.invoke(IPC.providerTestConnection, payload) as Promise<
      import("../shared/ipc.ts").ProviderTestConnectionResponse
    >;
  },
  // ── Power Prompt Generator ─────────────────────────────────────────────────
  promptGenerate(payload: PromptGenerateRequest): Promise<PromptGenerateResponse> {
    return ipcRenderer.invoke(IPC.promptGenerate, payload) as Promise<PromptGenerateResponse>;
  },
  // ── AI Spend Tracker ───────────────────────────────────────────────────────
  spendGet(): Promise<SpendSnapshot> {
    return ipcRenderer.invoke(IPC.spendGet) as Promise<SpendSnapshot>;
  },
  spendRefresh(): Promise<SpendSnapshot> {
    return ipcRenderer.invoke(IPC.spendRefresh) as Promise<SpendSnapshot>;
  },
  spendCustomFetch(payload: SpendCustomFetchRequest): Promise<SpendCustomFetchResponse> {
    return ipcRenderer.invoke(IPC.spendCustomFetch, payload) as Promise<SpendCustomFetchResponse>;
  },
  spendHistoryGet(days?: number): Promise<{ entries: SpendDaySummary[]; allTimeTotal: number; since: string | null }> {
    return ipcRenderer.invoke(IPC.spendHistoryGet, days) as Promise<{
      entries: SpendDaySummary[];
      allTimeTotal: number;
      since: string | null;
    }>;
  },
  // ── Terminal AI ────────────────────────────────────────────────────────────
  terminalExplain(payload: TerminalExplainRequest): Promise<TerminalExplainResponse> {
    return ipcRenderer.invoke(IPC.terminalExplain, payload) as Promise<TerminalExplainResponse>;
  },
  nlToShell(payload: NlToShellRequest): Promise<NlToShellResponse> {
    return ipcRenderer.invoke(IPC.nlToShell, payload) as Promise<NlToShellResponse>;
  },
  voiceShellTranscribe(payload: VoiceShellTranscribeRequest): Promise<VoiceShellTranscribeResponse> {
    return ipcRenderer.invoke(IPC.voiceShellTranscribe, payload) as Promise<VoiceShellTranscribeResponse>;
  },
  terminalVisionAnalyze(payload: TerminalVisionRequest): Promise<TerminalVisionResponse> {
    return ipcRenderer.invoke(IPC.terminalVisionAnalyze, payload) as Promise<TerminalVisionResponse>;
  },
  terminalSuggest(payload: TerminalSuggestRequest): Promise<TerminalSuggestResponse> {
    return ipcRenderer.invoke(IPC.terminalSuggest, payload) as Promise<TerminalSuggestResponse>;
  },
  // ── Built-in terminal AI context (Task #41) ─────────────────────────────────
  terminalContextPush(blocks: TerminalContextBlock[]): void {
    ipcRenderer.send(IPC.terminalContextPush, blocks);
  },
  // ── Persistent Smart Scrollback (Task #47) ──────────────────────────────────
  scrollbackWrite(blocks: ScrollbackWriteBlock[]): void {
    ipcRenderer.send(IPC.scrollbackWrite, blocks);
  },
  scrollbackSearch(payload: ScrollbackSearchRequest): Promise<ScrollbackSearchResponse> {
    return ipcRenderer.invoke(IPC.scrollbackSearch, payload) as Promise<ScrollbackSearchResponse>;
  },
  // ── Extract & Build Mode ───────────────────────────────────────────────────
  extractDetect(payload: ExtractDetectRequest): Promise<ExtractDetectResponse> {
    return ipcRenderer.invoke(IPC.extractDetect, payload) as Promise<ExtractDetectResponse>;
  },
  extractGenerate(payload: ExtractGenerateRequest): Promise<ExtractGenerateResponse> {
    return ipcRenderer.invoke(IPC.extractGenerate, payload) as Promise<ExtractGenerateResponse>;
  },
  extractBuildHandoff(payload: ExtractBuildHandoffRequest): Promise<ExtractBuildHandoffResponse> {
    return ipcRenderer.invoke(IPC.extractBuildHandoff, payload) as Promise<ExtractBuildHandoffResponse>;
  },
  onExtractModeTranscript(handler: (text: string) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, text: string): void => {
      handler(text);
    };
    ipcRenderer.on(IPC.extractModeTranscript, listener);
    return () => ipcRenderer.removeListener(IPC.extractModeTranscript, listener);
  },
  // ── Terminal Auto Fix (Task #65) ──────────────────────────────────────────
  terminalFix(payload: TerminalFixRequest): Promise<TerminalFixResponse> {
    return ipcRenderer.invoke(IPC.terminalFix, payload) as Promise<TerminalFixResponse>;
  },
  // ── Glass Command Palette (Task #66) ────────────────────────────────────────
  paletteGetSections(payload: PaletteGetSectionsRequest): Promise<PaletteGetSectionsResponse> {
    return ipcRenderer.invoke(IPC.paletteGetSections, payload) as Promise<PaletteGetSectionsResponse>;
  },
  paletteRecordUse(payload: PaletteRecordUseRequest): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke(IPC.paletteRecordUse, payload) as Promise<{ ok: boolean }>;
  },
  // ── Glass Agents ────────────────────────────────────────────────────────────
  agentRun(payload: AgentRunRequest): Promise<AgentRunResponse> {
    return ipcRenderer.invoke(IPC.agentRun, payload) as Promise<AgentRunResponse>;
  },
  agentStop(): void {
    ipcRenderer.send(IPC.agentStop);
  },
  onAgentEvent(listener: (event: AgentEvent) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, ev: AgentEvent): void => {
      listener(ev);
    };
    ipcRenderer.on(IPC.agentEvent, handler);
    return () => ipcRenderer.removeListener(IPC.agentEvent, handler);
  },
  agentPickOutputFolder(): Promise<AgentPickOutputFolderResponse> {
    return ipcRenderer.invoke(IPC.agentPickOutputFolder) as Promise<AgentPickOutputFolderResponse>;
  },
  agentPickWorkspaceRoot(): Promise<AgentPickOutputFolderResponse> {
    return ipcRenderer.invoke(IPC.agentPickWorkspaceRoot) as Promise<AgentPickOutputFolderResponse>;
  },
  agentOpenPath(filePath: string): Promise<AgentPathResponse> {
    return ipcRenderer.invoke(IPC.agentOpenPath, filePath) as Promise<AgentPathResponse>;
  },
  agentRevealPath(filePath: string): Promise<AgentPathResponse> {
    return ipcRenderer.invoke(IPC.agentRevealPath, filePath) as Promise<AgentPathResponse>;
  },
  agentApprove(payload: AgentApproveRequest): Promise<AgentApproveResponse> {
    return ipcRenderer.invoke(IPC.agentApprove, payload) as Promise<AgentApproveResponse>;
  },
  agentSetApprovalMode(
    payload: AgentSetApprovalModeRequest,
  ): Promise<AgentSetApprovalModeResponse> {
    return ipcRenderer.invoke(IPC.agentSetApprovalMode, payload) as Promise<AgentSetApprovalModeResponse>;
  },
  agentRestoreBackup(filePath: string): Promise<AgentPathResponse> {
    return ipcRenderer.invoke(IPC.agentRestoreBackup, filePath) as Promise<AgentPathResponse>;
  },
  coderWorkspaceClose(): void {
    ipcRenderer.send(IPC.coderWorkspaceClose);
  },
  openResearchExplorer(question: string): void {
    ipcRenderer.send(IPC.openResearchExplorer, question);
  },
  closeResearchExplorer(): void {
    ipcRenderer.send(IPC.closeResearchExplorer);
  },
  notifyResearchExplorerMounted(): void {
    ipcRenderer.send(IPC.researchExplorerMounted);
  },
  openCodeAnalystExplorer(prompt: string): void {
    ipcRenderer.send(IPC.openCodeAnalystExplorer, prompt);
  },
  closeCodeAnalystExplorer(): void {
    ipcRenderer.send(IPC.closeCodeAnalystExplorer);
  },
  notifyCodeAnalystExplorerMounted(): void {
    ipcRenderer.send(IPC.codeAnalystExplorerMounted);
  },
  openWritingStudio(prompt: string): void {
    ipcRenderer.send(IPC.openWritingStudio, prompt);
  },
  closeWritingStudio(): void {
    ipcRenderer.send(IPC.closeWritingStudio);
  },
  notifyWritingStudioMounted(): void {
    ipcRenderer.send(IPC.writingStudioMounted);
  },
  glassIdeOpen(): void {
    ipcRenderer.send(IPC.glassIdeOpen);
  },
  glassIdeClose(): void {
    ipcRenderer.send(IPC.glassIdeClose);
  },
  glassIdePreviewSetUrl(url: string): void {
    ipcRenderer.send(IPC.glassIdePreviewSetUrl, url);
  },
  glassIdePreviewReload(): void {
    ipcRenderer.send(IPC.glassIdePreviewReload);
  },
  glassIdeListProject(): Promise<GlassIdeListProjectResponse> {
    return ipcRenderer.invoke(IPC.glassIdeListProject) as Promise<GlassIdeListProjectResponse>;
  },
  glassIdeReadProjectFile(relativePath: string): Promise<GlassIdeReadProjectFileResponse> {
    return ipcRenderer.invoke(
      IPC.glassIdeReadProjectFile,
      relativePath,
    ) as Promise<GlassIdeReadProjectFileResponse>;
  },
  glassIdeWriteProjectFile(
    relativePath: string,
    content: string,
  ): Promise<GlassIdeWriteProjectFileResponse> {
    return ipcRenderer.invoke(
      IPC.glassIdeWriteProjectFile,
      relativePath,
      content,
    ) as Promise<GlassIdeWriteProjectFileResponse>;
  },
  glassIdeReadTsConfig(): Promise<GlassIdeTsConfigResponse> {
    return ipcRenderer.invoke(IPC.glassIdeReadTsConfig) as Promise<GlassIdeTsConfigResponse>;
  },
  glassIdeSelectWorkspace(
    payload: GlassIdeSelectWorkspaceRequest,
  ): Promise<GlassIdeSelectWorkspaceResponse> {
    return ipcRenderer.invoke(
      IPC.glassIdeSelectWorkspace,
      payload,
    ) as Promise<GlassIdeSelectWorkspaceResponse>;
  },
  glassIdeCreateProject(): Promise<AgentPickOutputFolderResponse> {
    return ipcRenderer.invoke(IPC.glassIdeCreateProject) as Promise<AgentPickOutputFolderResponse>;
  },
  glassIdeProjectLibs(): Promise<GlassIdeProjectLibsResponse> {
    return ipcRenderer.invoke(IPC.glassIdeProjectLibs) as Promise<GlassIdeProjectLibsResponse>;
  },
  glassIdeGhostSuggest(
    payload: GlassIdeGhostSuggestRequest,
  ): Promise<GlassIdeGhostSuggestResponse> {
    return ipcRenderer.invoke(
      IPC.glassIdeGhostSuggest,
      payload,
    ) as Promise<GlassIdeGhostSuggestResponse>;
  },
  glassIdeEditorContextUpdate(ctx: GlassIdeEditorContext): void {
    ipcRenderer.send(IPC.glassIdeEditorContextUpdate, ctx);
  },
  qaModeToggle(): void {
    ipcRenderer.send(IPC.qaModeToggle);
  },
  qaAutoFixToggle(): void {
    ipcRenderer.send(IPC.qaAutoFixToggle);
  },
  qaSpeakProgressToggle(): void {
    ipcRenderer.send(IPC.qaSpeakProgressToggle);
  },
  coderGhostTextToggle(): void {
    ipcRenderer.send(IPC.coderGhostTextToggle);
  },
  coderRollbackCheckpoint(
    payload: CoderRollbackCheckpointRequest,
  ): Promise<CoderRollbackCheckpointResponse> {
    return ipcRenderer.invoke(
      IPC.coderRollbackCheckpoint,
      payload,
    ) as Promise<CoderRollbackCheckpointResponse>;
  },
  dismissQaModeNotification(): void {
    ipcRenderer.send(IPC.dismissQaModeNotification);
  },
  qaPipelineFixAll(payload: { runId: string }): Promise<{ ok: boolean; error?: string }> {
    return ipcRenderer.invoke(IPC.qaPipelineFixAll, payload) as Promise<{ ok: boolean; error?: string }>;
  },
  onShowQaModeNotification(listener: () => void): () => void {
    const handler = (): void => listener();
    ipcRenderer.on(IPC.showQaModeNotification, handler);
    return () => ipcRenderer.removeListener(IPC.showQaModeNotification, handler);
  },
  onIdePreviewProbe(listener: () => void): () => void {
    const handler = (): void => listener();
    ipcRenderer.on(IPC.idePreviewProbe, handler);
    return () => ipcRenderer.removeListener(IPC.idePreviewProbe, handler);
  },
  idePreviewProbeResult(payload: import("../shared/glassQaPipeline.ts").QaPreviewProbeResult): void {
    ipcRenderer.send(IPC.idePreviewProbeResult, payload);
  },
  onGlassIdeOpenFile(listener: (payload: { relativePath: string }) => void): () => void {
    const handler = (_e: unknown, payload: { relativePath: string }): void => listener(payload);
    ipcRenderer.on(IPC.glassIdeOpenFile, handler);
    return () => ipcRenderer.removeListener(IPC.glassIdeOpenFile, handler);
  },
  glassIdeLayoutSet(partial: GlassIdeLayoutSettings): void {
    ipcRenderer.send(IPC.glassIdeLayoutSet, partial);
  },
  indexStart(projectRoot: string): Promise<{ ok: boolean; error?: string }> {
    return ipcRenderer.invoke(IPC.indexStart, projectRoot) as Promise<{ ok: boolean; error?: string }>;
  },
  getIndexStatus(): Promise<GlassIndexState> {
    return ipcRenderer.invoke(IPC.indexStatus) as Promise<GlassIndexState>;
  },
  onIndexProgress(listener: (progress: GlassIndexState["progress"] & object) => void): () => void {
    const handler = (_e: unknown, progress: GlassIndexState["progress"] & object): void =>
      listener(progress);
    ipcRenderer.on(IPC.indexProgress, handler);
    return () => ipcRenderer.removeListener(IPC.indexProgress, handler);
  },
  onIndexDone(listener: (payload: { fileCount: number; durationMs: number }) => void): () => void {
    const handler = (_e: unknown, payload: { fileCount: number; durationMs: number }): void =>
      listener(payload);
    ipcRenderer.on(IPC.indexDone, handler);
    return () => ipcRenderer.removeListener(IPC.indexDone, handler);
  },
  onIndexError(listener: (payload: { error: string }) => void): () => void {
    const handler = (_e: unknown, payload: { error: string }): void => listener(payload);
    ipcRenderer.on(IPC.indexError, handler);
    return () => ipcRenderer.removeListener(IPC.indexError, handler);
  },
  detectScreenFile(): Promise<AgentScreenContext> {
    return ipcRenderer.invoke(IPC.detectScreenFile) as Promise<AgentScreenContext>;
  },
  onScreenFileResult(listener: (ctx: AgentScreenContext) => void): () => void {
    const handler = (_e: unknown, ctx: AgentScreenContext): void => listener(ctx);
    ipcRenderer.on(IPC.screenFileResult, handler);
    return () => ipcRenderer.removeListener(IPC.screenFileResult, handler);
  },
  onOpenCoderWithPrompt(
    listener: (payload: OpenCoderWithPromptPayload) => void,
  ): () => void {
    const handler = (_e: unknown, payload: OpenCoderWithPromptPayload): void => listener(payload);
    ipcRenderer.on(IPC.openCoderWithPrompt, handler);
    return () => ipcRenderer.removeListener(IPC.openCoderWithPrompt, handler);
  },
  generateProjectMemory(): Promise<{ ok: boolean; error?: string }> {
    return ipcRenderer.invoke(IPC.generateProjectMemory) as Promise<{ ok: boolean; error?: string }>;
  },
  cancelProjectMemory(): void {
    ipcRenderer.send(IPC.cancelProjectMemory);
  },
  coderVerifyFix(payload: { runId: string; errorOutput: string }): Promise<{ ok: boolean; error?: string }> {
    return ipcRenderer.invoke(IPC.coderVerifyFix, payload) as Promise<{ ok: boolean; error?: string }>;
  },
  coderReviewFix(payload: { runId: string; findings: string }): Promise<{ ok: boolean; error?: string }> {
    return ipcRenderer.invoke(IPC.coderReviewFix, payload) as Promise<{ ok: boolean; error?: string }>;
  },
  coderReviewDismiss(): void {
    ipcRenderer.send(IPC.coderReviewDismiss);
  },
};

export type GlassApi = typeof glassApi;

contextBridge.exposeInMainWorld("glass", glassApi);
