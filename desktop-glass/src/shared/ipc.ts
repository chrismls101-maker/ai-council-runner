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

export const IPC = {
  /** Renderer -> main: a user-initiated command. */
  command: "glass:command",
  /** Renderer -> main (invoke): get a one-shot snapshot of state. */
  getState: "glass:get-state",
  /** Main -> renderer: full state broadcast. */
  state: "glass:state",
  /** Renderer -> main: toggle background click-through for the calling window. */
  setIgnoreMouse: "glass:set-ignore-mouse",
} as const;

export type GlassCommand =
  | { type: "capture-screen" }
  | { type: "start-listening" }
  | { type: "pause" }
  | { type: "stop" }
  | { type: "append-transcript"; text: string }
  | { type: "clear-transcript" }
  | { type: "save-moment"; note?: string; kind?: GlassMomentKind }
  | { type: "delete-moment"; id: string }
  | { type: "clear-moments" }
  | { type: "send-screenshot"; imageDataUrl?: string }
  | { type: "send-transcript" }
  | { type: "send-moment"; id: string }
  | { type: "ask-iivo" }
  | { type: "open-chat" }
  | { type: "set-tab"; tab: PanelTab }
  | { type: "toggle-panel" };

export interface GlassState {
  privacy: PrivacyState;
  transcript: string;
  notes: ExtractedNotes;
  moments: SavedMoment[];
  panelTab: PanelTab;
  config: GlassConfig;
  lastError?: string;
  lastSentUrl?: string;
}
