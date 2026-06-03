import type { IivoArtifact } from "./artifactTypes.js";
import { getChildArtifact } from "./artifactRelationshipStore.js";
import { getSavedArtifact } from "./artifactSaveStore.js";
import { getRunHistory } from "../history/runHistory.js";

/** Resolve artifact content from saved library, child store, or run history. */
export async function resolveArtifactById(
  artifactId: string,
  runId?: string,
): Promise<IivoArtifact | null> {
  try {
    const saved = await getSavedArtifact(artifactId);
    if (saved?.artifact) return saved.artifact;
  } catch {
    /* optional */
  }

  try {
    const child = await getChildArtifact(artifactId);
    if (child) return child;
  } catch {
    /* optional */
  }

  if (runId) {
    try {
      const entry = await getRunHistory(runId);
      if (entry?.artifact?.id === artifactId) return entry.artifact;
      if (entry?.artifact && !artifactId.includes("-")) {
        return entry.artifact;
      }
    } catch {
      /* optional */
    }
  }

  try {
    const entry = await getRunHistory(artifactId);
    if (entry?.artifact) return entry.artifact;
  } catch {
    /* optional */
  }

  return null;
}
