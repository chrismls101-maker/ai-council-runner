import Lenis from "lenis";
import { useEffect } from "react";
import "lenis/dist/lenis.css";

/** Lenis smooth scroll — buttery inertia (Pixfield / Awwwards-style). */
export function useSmoothScroll(enabled = true): void {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const lenis = new Lenis({
      lerp: 0.1,
      duration: 1.15,
      smoothWheel: true,
      wheelMultiplier: 0.95,
      touchMultiplier: 1.4,
      autoRaf: true,
    });

    return () => {
      lenis.destroy();
    };
  }, [enabled]);
}
