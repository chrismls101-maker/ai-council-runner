/**
 * Preload bridge. Exposes a minimal, typed `window.glass` API to the renderers.
 * The renderer never gets direct Node/Electron access.
 */

import { contextBridge, ipcRenderer } from "electron";
import { IPC, type GlassCommand, type GlassState, type SttProcessChunkRequest, type SttProcessChunkResponse } from "../shared/ipc.ts";
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
  setIgnoreMouse(ignore: boolean): void {
    ipcRenderer.send(IPC.setIgnoreMouse, ignore);
  },
  resizeDock(width: number, height: number): void {
    ipcRenderer.send(IPC.resizeDock, width, height);
  },
};

export type GlassApi = typeof glassApi;

contextBridge.exposeInMainWorld("glass", glassApi);
