/**
 * Listen mode — rolling transcript from small system-audio fragments.
 *
 * Interim fragments update in place; final fragments replace interim and merge
 * related tail text. Pure — no electron / fs.
 */

import { appendTranscriptDeduped, normalizeTranscriptText } from "./transcriptDedupe.ts";

export type ListenTranscriptSource = "system_audio";

export interface ListenTranscriptFragment {
  id: string;
  text: string;
  source: ListenTranscriptSource;
  isInterim: boolean;
  updatedAtMs: number;
}

export interface ListenRollingTranscriptState {
  fragments: ListenTranscriptFragment[];
  /** Finalized + current interim merged for moment evaluation. */
  rollingText: string;
  interimFragmentId?: string;
  finalFragmentCount: number;
  duplicateFragmentCount: number;
}

export function initialListenRollingTranscript(): ListenRollingTranscriptState {
  return {
    fragments: [],
    rollingText: "",
    finalFragmentCount: 0,
    duplicateFragmentCount: 0,
  };
}

export interface ApplyListenTranscriptFragmentInput {
  text: string;
  source?: ListenTranscriptSource;
  isInterim?: boolean;
  nowMs?: number;
  idFactory?: () => string;
}

function rebuildRollingText(fragments: ListenTranscriptFragment[]): string {
  let rolling = "";
  for (const f of fragments) {
    if (!f.text.trim()) continue;
    if (f.isInterim) {
      rolling = appendTranscriptDeduped(rolling, f.text);
    } else {
      rolling = appendTranscriptDeduped(rolling, f.text);
    }
  }
  return rolling.trim();
}

function isExtensionOf(prev: string, next: string): boolean {
  const p = normalizeTranscriptText(prev);
  const n = normalizeTranscriptText(next);
  if (!p || !n) return false;
  if (n.startsWith(p) || p.startsWith(n)) return true;
  const pBase = p.replace(/[.!?…]+$/, "").trim();
  if (pBase.length >= 12 && (n.startsWith(pBase) || pBase.startsWith(n))) return true;
  return false;
}

/** Apply a transcript fragment — interim updates in place, final replaces interim. */
export function applyListenTranscriptFragment(
  state: ListenRollingTranscriptState,
  input: ApplyListenTranscriptFragmentInput,
): ListenRollingTranscriptState {
  const text = normalizeTranscriptText(input.text);
  if (!text) return state;

  const nowMs = input.nowMs ?? Date.now();
  const source: ListenTranscriptSource = input.source ?? "system_audio";
  const idFactory = input.idFactory ?? (() => `lf-${nowMs}`);
  const fragments = [...state.fragments];
  let duplicateFragmentCount = state.duplicateFragmentCount;
  let interimFragmentId = state.interimFragmentId;
  let finalFragmentCount = state.finalFragmentCount;

  const lastFinal = [...fragments].reverse().find((f) => !f.isInterim);
  if (lastFinal && normalizeTranscriptText(lastFinal.text) === text) {
    return { ...state, duplicateFragmentCount: duplicateFragmentCount + 1 };
  }
  if (
    lastFinal &&
    !input.isInterim &&
    isExtensionOf(lastFinal.text, text) &&
    text.length > lastFinal.text.length
  ) {
    const idx = fragments.findIndex((f) => f.id === lastFinal.id);
    if (idx >= 0) {
      fragments[idx] = { ...fragments[idx]!, text, updatedAtMs: nowMs };
      return {
        fragments,
        rollingText: rebuildRollingText(fragments),
        interimFragmentId,
        finalFragmentCount,
        duplicateFragmentCount,
      };
    }
  }

  if (input.isInterim) {
    const interimIdx = interimFragmentId
      ? fragments.findIndex((f) => f.id === interimFragmentId)
      : -1;
    if (interimIdx >= 0) {
      fragments[interimIdx] = {
        ...fragments[interimIdx]!,
        text,
        updatedAtMs: nowMs,
      };
    } else {
      const id = idFactory();
      fragments.push({ id, text, source, isInterim: true, updatedAtMs: nowMs });
      interimFragmentId = id;
    }
  } else {
    const interimIdx = interimFragmentId
      ? fragments.findIndex((f) => f.id === interimFragmentId)
      : -1;
    if (interimIdx >= 0) {
      fragments[interimIdx] = {
        ...fragments[interimIdx]!,
        text,
        isInterim: false,
        updatedAtMs: nowMs,
      };
      interimFragmentId = undefined;
      finalFragmentCount += 1;
    } else if (lastFinal && isExtensionOf(lastFinal.text, text)) {
      const idx = fragments.findIndex((f) => f.id === lastFinal.id);
      if (idx >= 0) {
        fragments[idx] = { ...fragments[idx]!, text, updatedAtMs: nowMs };
      }
    } else {
      fragments.push({
        id: idFactory(),
        text,
        source,
        isInterim: false,
        updatedAtMs: nowMs,
      });
      finalFragmentCount += 1;
    }
  }

  return {
    fragments,
    rollingText: rebuildRollingText(fragments),
    interimFragmentId,
    finalFragmentCount,
    duplicateFragmentCount,
  };
}

/** Recent rolling window for live note refresh (default ~3 min of speech). */
export function rollingTranscriptWindow(
  state: ListenRollingTranscriptState,
  maxChars = 2_400,
): string {
  const text = state.rollingText.trim();
  if (text.length <= maxChars) return text;
  return text.slice(-maxChars);
}

/** Final-only fragments for display / checkpoint anchors. */
export function finalizedTranscriptFragments(state: ListenRollingTranscriptState): string[] {
  return state.fragments.filter((f) => !f.isInterim && f.text.trim()).map((f) => f.text);
}
