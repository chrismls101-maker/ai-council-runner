import { useCallback, useEffect, useRef, useState } from "react";
import { buildTypewriterRevealPlan, SHORT_DELAY_MS } from "../utils/typewriterChunks";

export interface UseTypewriterRevealOptions {
  enabled: boolean;
  resetKey: string;
}

export interface UseTypewriterRevealResult {
  visibleText: string;
  isTyping: boolean;
  isComplete: boolean;
  skip: () => void;
}

export function useTypewriterReveal(
  content: string,
  options: UseTypewriterRevealOptions,
): UseTypewriterRevealResult {
  const { enabled, resetKey } = options;
  const [visibleText, setVisibleText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const timerRef = useRef<number | null>(null);
  const chunkIndexRef = useRef(0);
  const chunksRef = useRef<string[]>([]);
  const delaysRef = useRef<number[]>([]);
  const skippedRef = useRef(false);
  const contentRef = useRef(content);
  const activePlanKeyRef = useRef<string | null>(null);

  contentRef.current = content;

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const skip = useCallback(() => {
    skippedRef.current = true;
    clearTimer();
    setVisibleText(contentRef.current);
    setIsTyping(false);
    setIsComplete(true);
  }, [clearTimer]);

  useEffect(() => {
    const trimmed = content.trim();
    const planKey = `${resetKey}|${trimmed}`;

    if (!trimmed) {
      clearTimer();
      activePlanKeyRef.current = null;
      skippedRef.current = false;
      chunkIndexRef.current = 0;
      chunksRef.current = [];
      delaysRef.current = [];
      setVisibleText("");
      setIsTyping(false);
      setIsComplete(false);
      return;
    }

    if (!enabled) {
      clearTimer();
      activePlanKeyRef.current = planKey;
      setVisibleText(content);
      setIsTyping(false);
      setIsComplete(true);
      return;
    }

    const samePlanInProgress =
      activePlanKeyRef.current === planKey &&
      !skippedRef.current &&
      chunkIndexRef.current > 0 &&
      chunkIndexRef.current < chunksRef.current.length;

    const samePlanFinished =
      activePlanKeyRef.current === planKey &&
      !skippedRef.current &&
      chunkIndexRef.current >= chunksRef.current.length &&
      chunksRef.current.length > 0;

    if (samePlanInProgress || samePlanFinished) {
      return;
    }

    clearTimer();
    skippedRef.current = false;
    chunkIndexRef.current = 0;
    activePlanKeyRef.current = planKey;

    const plan = buildTypewriterRevealPlan(content);
    chunksRef.current = plan.chunks;
    delaysRef.current = plan.delaysMs;
    setVisibleText("");
    setIsTyping(true);
    setIsComplete(false);

    const tick = () => {
      if (skippedRef.current) return;

      const idx = chunkIndexRef.current;
      if (idx >= chunksRef.current.length) {
        setVisibleText(contentRef.current);
        setIsTyping(false);
        setIsComplete(true);
        return;
      }

      chunkIndexRef.current = idx + 1;
      setVisibleText(chunksRef.current.slice(0, idx + 1).join(""));

      const nextDelay = delaysRef.current[idx + 1] ?? 0;
      timerRef.current = window.setTimeout(tick, nextDelay);
    };

    const initialDelay = plan.delaysMs[0] ?? SHORT_DELAY_MS;
    timerRef.current = window.setTimeout(tick, initialDelay);
    return clearTimer;
  }, [content, enabled, resetKey, clearTimer]);

  return { visibleText, isTyping, isComplete, skip };
}
