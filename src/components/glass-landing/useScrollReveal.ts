import { useEffect, useRef, useState } from "react";

export function useScrollReveal<T extends HTMLElement = HTMLElement>(
  options?: IntersectionObserverInit,
): { ref: React.RefObject<T | null>; visible: boolean } {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.classList.add("is-visible");
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          el.classList.add("is-visible");
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "-6% 0px", ...options },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [options]);

  return { ref, visible };
}
