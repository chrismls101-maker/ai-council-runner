import { useEffect, useState } from "react";

const MIN_SOCIAL_PROOF_COUNT = 10;

export type GlassBrowseSocialProofState = {
  entered: number | null;
  demoEnabled: boolean;
  loading: boolean;
};

export function formatGlassBrowseSocialProof(entered: number | null): string | null {
  if (entered == null || entered < MIN_SOCIAL_PROOF_COUNT) return null;
  const label = entered === 1 ? "person has" : "people have";
  return `${entered.toLocaleString()} ${label} tried this`;
}

/** Public enter count for landing social proof (no auth). */
export function useGlassBrowseSocialProof(): GlassBrowseSocialProofState {
  const [entered, setEntered] = useState<number | null>(null);
  const [demoEnabled, setDemoEnabled] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch("/api/landing/glass-browse/social-proof");
        if (!res.ok) return;
        const data = (await res.json()) as { ok?: boolean; entered?: number; demoEnabled?: boolean };
        if (!cancelled && data.ok) {
          if (typeof data.entered === "number") setEntered(data.entered);
          if (typeof data.demoEnabled === "boolean") setDemoEnabled(data.demoEnabled);
        }
      } catch {
        /* optional enhancement */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { entered, demoEnabled, loading };
}
