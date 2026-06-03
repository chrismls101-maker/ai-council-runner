import type { IivoArtifact } from "../types/artifacts";

const PREFIX = "iivo_child_artifact_";

export function cacheChildArtifact(artifact: IivoArtifact): void {
  try {
    localStorage.setItem(`${PREFIX}${artifact.id}`, JSON.stringify(artifact));
  } catch {
    /* quota */
  }
}

export function loadCachedChildArtifact(childId: string): IivoArtifact | null {
  try {
    const raw = localStorage.getItem(`${PREFIX}${childId}`);
    if (!raw) return null;
    return JSON.parse(raw) as IivoArtifact;
  } catch {
    return null;
  }
}
