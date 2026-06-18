/**
 * Preload bridge. Exposes a minimal, typed `window.glass` API to the renderers.
 * The renderer never gets direct Node/Electron access.
 */

import { contextBridge, ipcRenderer } from "electron";
import {
  IPC,
  type GlassCommand,
  type GlassState,
  type SaveGlassMemoryRequest,
  type SaveGlassMemoryResponse,
  type SttProcessChunkRequest,
  type SttProcessChunkResponse,
} from "../shared/ipc.ts";
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
  replayPtySession(termId: string): Promise<string> {
    return ipcRenderer.invoke(IPC.ptyReplay, termId) as Promise<string>;
  },
  writeClipboard(text: string): Promise<boolean> {
    return ipcRenderer.invoke(IPC.writeClipboard, text) as Promise<boolean>;
  },
};

export type GlassApi = typeof glassApi;

contextBridge.exposeInMainWorld("glass", glassApi);
