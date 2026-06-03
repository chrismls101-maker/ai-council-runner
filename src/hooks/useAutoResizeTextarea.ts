import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

/** Desktop cap — internal scroll only after this. */
export const COMPOSER_TEXTAREA_MAX_HEIGHT_DESKTOP = 180;
/** Mobile cap. */
export const COMPOSER_TEXTAREA_MAX_HEIGHT_MOBILE = 140;

export function getComposerTextareaMaxHeight(): number {
  if (typeof window === "undefined") return COMPOSER_TEXTAREA_MAX_HEIGHT_DESKTOP;
  return window.matchMedia("(max-width: 640px)").matches
    ? COMPOSER_TEXTAREA_MAX_HEIGHT_MOBILE
    : COMPOSER_TEXTAREA_MAX_HEIGHT_DESKTOP;
}

/** Resize textarea to content; returns applied height in px. */
export function resizeComposerTextarea(el: HTMLTextAreaElement | null): number {
  if (!el) return 0;

  el.style.height = "auto";
  const maxHeight = getComposerTextareaMaxHeight();
  const scrollHeight = el.scrollHeight;
  const next = Math.min(scrollHeight, maxHeight);
  el.style.height = `${next}px`;
  el.style.overflowY = scrollHeight > maxHeight ? "auto" : "hidden";
  return next;
}

/** Keeps composer textarea height in sync with `value` (including external clears). */
export function useAutoResizeTextarea(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const syncHeight = useCallback(() => resizeComposerTextarea(ref.current), []);

  useLayoutEffect(() => {
    syncHeight();
  }, [value, syncHeight]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const onViewportChange = () => syncHeight();
    window.addEventListener("resize", onViewportChange);
    mq.addEventListener("change", onViewportChange);
    return () => {
      window.removeEventListener("resize", onViewportChange);
      mq.removeEventListener("change", onViewportChange);
    };
  }, [syncHeight]);

  return { ref, syncHeight };
}
