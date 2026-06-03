import { useEffect, useState } from "react";
import type { ArtifactSnapshot } from "../utils/artifactSnapshot.ts";
import { snapshotToInlineArtifact } from "../utils/artifactSnapshot.ts";
import { fetchArtifactByReference } from "../utils/artifactRestore.ts";
import type { IivoArtifact } from "../types/artifacts";

export function useResolvedArtifact(
  artifact?: IivoArtifact | null,
  artifactSnapshot?: ArtifactSnapshot,
): {
  artifact: IivoArtifact | undefined;
  loading: boolean;
  missing: boolean;
  isReference: boolean;
} {
  const [resolved, setResolved] = useState<IivoArtifact | undefined>(
    artifact ?? snapshotToInlineArtifact(artifactSnapshot),
  );
  const [loading, setLoading] = useState(false);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (artifact) {
      setResolved(artifact);
      setLoading(false);
      setMissing(false);
      return;
    }
    const inline = snapshotToInlineArtifact(artifactSnapshot);
    if (inline) {
      setResolved(inline);
      setLoading(false);
      setMissing(false);
      return;
    }
    if (artifactSnapshot?.mode === "reference") {
      setLoading(true);
      setMissing(false);
      void fetchArtifactByReference(artifactSnapshot.artifactId).then((loaded) => {
        setLoading(false);
        if (loaded) {
          setResolved(loaded);
          setMissing(false);
        } else {
          setResolved(undefined);
          setMissing(true);
        }
      });
      return;
    }
    setResolved(undefined);
    setLoading(false);
    setMissing(false);
  }, [artifact, artifactSnapshot]);

  return {
    artifact: resolved,
    loading,
    missing,
    isReference: artifactSnapshot?.mode === "reference",
  };
}
