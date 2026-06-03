import { useEffect, useRef } from "react";
import {
  attachedFromSavedItem,
  buildAskIivoPrompt,
  buildAskIivoScreenshotPrompt,
  isScreenshotContextItem,
  type AttachedContextItem,
} from "../types/contextBridge";
import { fetchContextItem } from "./contextBridgeApi";
import {
  clearLensHandoffParams,
  LENS_HANDOFF_ATTACH_ERROR,
  readPendingLensHandoff,
  type PendingLensHandoff,
} from "./lensHandoff";

interface UseLensHandoffOptions {
  /** App bootstrap finished (API reachable, workflows loaded). */
  enabled: boolean;
  /** When true, defer attach until onboarding is dismissed. */
  onboardingOpen: boolean;
  visionConfigured?: boolean;
  onAttach: (item: AttachedContextItem) => void;
  onSetPrompt: (prompt: string) => void;
  onFeedback: (message: string) => void;
  onError?: (message: string) => void;
}

/**
 * When IIVO opens from IIVO Lens (?lensContextId / ?lensAsk), fetch and attach context once.
 * Captures URL params on first render so cleanup/re-renders do not lose the handoff.
 */
export function useLensHandoff({
  enabled,
  onboardingOpen,
  visionConfigured = false,
  onAttach,
  onSetPrompt,
  onFeedback,
  onError,
}: UseLensHandoffOptions): void {
  const pendingRef = useRef<PendingLensHandoff | null | undefined>(undefined);
  const completedRef = useRef(false);
  const inFlightRef = useRef(false);

  const callbacksRef = useRef({ onAttach, onSetPrompt, onFeedback, onError, visionConfigured });
  callbacksRef.current = { onAttach, onSetPrompt, onFeedback, onError, visionConfigured };

  if (pendingRef.current === undefined) {
    pendingRef.current = readPendingLensHandoff();
  }

  useEffect(() => {
    if (!enabled || onboardingOpen || completedRef.current) return;

    const pending = pendingRef.current;
    if (!pending || inFlightRef.current) return;

    inFlightRef.current = true;
    let cancelled = false;

    void (async () => {
      try {
        const item = await fetchContextItem(pending.contextId);
        if (cancelled) return;

        const { onAttach: attach, onSetPrompt: setPrompt, onFeedback: feedback } =
          callbacksRef.current;

        attach(attachedFromSavedItem(item));

        if (pending.lensAsk) {
          const prompt = isScreenshotContextItem(item)
            ? buildAskIivoScreenshotPrompt(item, {
                visionConfigured: callbacksRef.current.visionConfigured,
              })
            : buildAskIivoPrompt(item.sourceUrl);
          setPrompt(prompt);
          feedback("IIVO Lens context attached — review the prompt and send when ready.");
        } else {
          feedback("IIVO Lens context attached.");
        }

        completedRef.current = true;
        pendingRef.current = null;
        clearLensHandoffParams();
      } catch {
        if (!cancelled) {
          callbacksRef.current.onError?.(LENS_HANDOFF_ATTACH_ERROR);
          completedRef.current = true;
          pendingRef.current = null;
          clearLensHandoffParams();
        }
      } finally {
        inFlightRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
      inFlightRef.current = false;
    };
  }, [enabled, onboardingOpen]);
}
