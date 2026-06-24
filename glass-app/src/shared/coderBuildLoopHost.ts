/**
 * Host interface for Glass Build Loop orchestration in main process.
 */

import type {
  AgentChangeLogEntry,
  CoderReviewState,
  CoderVerifyState,
  OpenCoderWithPromptPayload,
  ProjectMemoryState,
} from "./ipc.ts";
import type { GlassUserSettings } from "./glassSettings.ts";
import type { GlassConfig } from "./config.ts";

export interface CoderBuildLoopHost {
  getSettings: () => GlassUserSettings;
  getChangeLog: () => AgentChangeLogEntry[];
  getVerifyState: () => CoderVerifyState | null | undefined;
  setVerifyState: (state: CoderVerifyState | null) => void;
  getReviewState: () => CoderReviewState | null | undefined;
  setReviewState: (state: CoderReviewState | null) => void;
  setProjectMemoryState: (state: ProjectMemoryState) => void;
  setLastNotice: (notice: string) => void;
  /** Spoken TTS cue (overlay narration queue) — independent of lastNotice UI. */
  narrate?: (text: string) => void;
  push: () => void;
  broadcastOpenCoder: (payload: OpenCoderWithPromptPayload) => void;
  getConfig: () => GlassConfig;
  isAgentActive: () => boolean;
  getLoopIteration: () => number | undefined;
  setLoopIteration: (iteration: number) => void;
  /** True when this coder runId is still the active run (not superseded). */
  isCoderRunCurrent: (runId: string) => boolean;
}
