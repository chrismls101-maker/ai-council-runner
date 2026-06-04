import { useEffect, useRef } from "react";
import {
  clearRunIdParam,
  readPendingRunIdHandoff,
  RUN_ID_HANDOFF_ERROR,
} from "./runIdHandoff";

interface UseRunIdHandoffOptions {
  enabled: boolean;
  onboardingOpen: boolean;
  activeRunId: string | null;
  archivedRunId: string | null;
  onLoadRun: (runId: string) => Promise<boolean>;
  onError: (message: string) => void;
  onFeedback?: (message: string) => void;
}

/**
 * When IIVO opens with ?runId=, load that history run once.
 * Preserves lensAsk / lensContextId handoff (handled separately).
 */
export function useRunIdHandoff({
  enabled,
  onboardingOpen,
  activeRunId,
  archivedRunId,
  onLoadRun,
  onError,
  onFeedback,
}: UseRunIdHandoffOptions): void {
  const pendingRef = useRef<string | null | undefined>(undefined);
  const completedRef = useRef(false);
  const inFlightRef = useRef(false);

  const callbacksRef = useRef({ onLoadRun, onError, onFeedback });
  callbacksRef.current = { onLoadRun, onError, onFeedback };

  if (pendingRef.current === undefined) {
    pendingRef.current = readPendingRunIdHandoff();
  }

  useEffect(() => {
    if (!enabled || onboardingOpen || completedRef.current) return;

    const pending = pendingRef.current;
    if (!pending || inFlightRef.current) return;

    if (activeRunId === pending || archivedRunId === pending) {
      completedRef.current = true;
      pendingRef.current = null;
      clearRunIdParam();
      return;
    }

    inFlightRef.current = true;
    let cancelled = false;

    void (async () => {
      try {
        const ok = await callbacksRef.current.onLoadRun(pending);
        if (cancelled) return;

        if (ok) {
          callbacksRef.current.onFeedback?.("Opened saved run from link.");
          completedRef.current = true;
          pendingRef.current = null;
          clearRunIdParam();
        } else {
          callbacksRef.current.onError(RUN_ID_HANDOFF_ERROR);
          completedRef.current = true;
          pendingRef.current = null;
          clearRunIdParam();
        }
      } catch {
        if (!cancelled) {
          callbacksRef.current.onError(RUN_ID_HANDOFF_ERROR);
          completedRef.current = true;
          pendingRef.current = null;
          clearRunIdParam();
        }
      } finally {
        inFlightRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
      inFlightRef.current = false;
    };
  }, [enabled, onboardingOpen, activeRunId, archivedRunId]);
}
