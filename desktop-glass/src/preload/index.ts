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
  setIgnoreMouse(ignore: boolean): void {
    ipcRenderer.send(IPC.setIgnoreMouse, ignore);
  },
  setOverlayNotificationActive(active: boolean): void {
    ipcRenderer.send(IPC.overlayNotificationActive, active);
  },
  resizeDock(width: number, height: number): void {
    ipcRenderer.send(IPC.resizeDock, width, height);
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
  setE2eCaptureProbes(payload: {
    screenCaptureProbe?: import("../shared/captureSourceEnumeration.ts").ScreenCaptureProbeStatus;
    screenCaptureDetail?: string;
    windowCaptureProbe?: import("../shared/captureSourceEnumeration.ts").WindowCaptureProbeStatus;
    systemAudioStatus?: import("../shared/systemAudioTypes.ts").SystemAudioStatus;
    systemAudioDetail?: string;
  }): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke(IPC.e2eSetCaptureProbes, payload) as Promise<{ ok: boolean }>;
  },
};

export type GlassApi = typeof glassApi;

contextBridge.exposeInMainWorld("glass", glassApi);
