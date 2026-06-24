/**
 * Module-level store for Extract & Build Mode state.
 *
 * Both ExtractModePanel (BuilderStrip tab) and ExtractBuildCard (overlay card)
 * live in the same renderer process, so we share state here without IPC.
 */

type ExtractModeListener = () => void;

export interface ExtractModeState {
  /** Whether Extract Mode is actively listening */
  active: boolean;
  /** Short label detected by Stage-1 Haiku (null = none yet) */
  detectedLabel: string | null;
  /** Full transcript accumulated while mode is active */
  transcript: string;
  /** Stage-2 grand master prompt (null = not generated yet) */
  masterPrompt: string | null;
  /** Whether Stage-2 generation is in flight */
  generating: boolean;
  /** Whether stage-1 detection API call is in flight */
  detecting: boolean;
}

const initialState: ExtractModeState = {
  active: false,
  detectedLabel: null,
  transcript: "",
  masterPrompt: null,
  generating: false,
  detecting: false,
};

let _state: ExtractModeState = { ...initialState };
const _listeners = new Set<ExtractModeListener>();

export function getExtractModeState(): ExtractModeState {
  return _state;
}

export function setExtractModeState(patch: Partial<ExtractModeState>): void {
  _state = { ..._state, ...patch };
  _listeners.forEach((fn) => fn());
}

export function resetExtractModeState(): void {
  _state = { ...initialState };
  _listeners.forEach((fn) => fn());
}

export function subscribeExtractMode(listener: ExtractModeListener): () => void {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}
