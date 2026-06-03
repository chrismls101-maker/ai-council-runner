import type {
  ArtifactRenderMode,
  ArtifactType,
  IivoArtifact,
} from "../types/artifacts";

export const INLINE_ARTIFACT_SNAPSHOT_MAX_BYTES = 25 * 1024;

export type ArtifactSnapshot =
  | { mode: "inline"; artifact: IivoArtifact }
  | {
      mode: "reference";
      artifactId: string;
      title: string;
      type: ArtifactType;
      renderMode: ArtifactRenderMode;
      sizeBytes: number;
    };

export function estimateArtifactSizeBytes(artifact: IivoArtifact): number {
  try {
    return new TextEncoder().encode(JSON.stringify(artifact)).length;
  } catch {
    return JSON.stringify(artifact).length;
  }
}

export function shouldStoreArtifactByReference(artifact: IivoArtifact): boolean {
  if (artifact.renderMode === "canvas") return true;
  return estimateArtifactSizeBytes(artifact) > INLINE_ARTIFACT_SNAPSHOT_MAX_BYTES;
}

export function createArtifactSnapshot(
  artifact: IivoArtifact,
  _runId?: string | null,
): ArtifactSnapshot {
  if (shouldStoreArtifactByReference(artifact)) {
    return {
      mode: "reference",
      artifactId: artifact.id,
      title: artifact.title,
      type: artifact.type,
      renderMode: artifact.renderMode,
      sizeBytes: estimateArtifactSizeBytes(artifact),
    };
  }
  return {
    mode: "inline",
    artifact: { ...artifact, sections: [...artifact.sections] },
  };
}

export function snapshotToInlineArtifact(
  snapshot: ArtifactSnapshot | undefined,
): IivoArtifact | undefined {
  if (!snapshot) return undefined;
  if (snapshot.mode === "inline") return snapshot.artifact;
  return undefined;
}

export function isArtifactReference(
  snapshot: ArtifactSnapshot | undefined,
): snapshot is Extract<ArtifactSnapshot, { mode: "reference" }> {
  return snapshot?.mode === "reference";
}
