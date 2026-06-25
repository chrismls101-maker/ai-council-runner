import { useEffect, useState } from "react";
import { GLASS_LATEST_VERSION } from "../utils/glassRelease";

export type GlassLatestRelease = {
  version: string;
  loading: boolean;
};

/** Fetches the live Glass version from GitHub via the IIVO server. */
export function useGlassLatestRelease(): GlassLatestRelease {
  const [version, setVersion] = useState(GLASS_LATEST_VERSION);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch("/api/glass/download/latest");
        if (!res.ok) return;
        const data = (await res.json()) as { ok?: boolean; version?: string };
        if (!cancelled && data.ok && data.version?.trim()) {
          setVersion(data.version.trim());
        }
      } catch {
        /* keep fallback version */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { version, loading };
}
