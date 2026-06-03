import type { ArtifactSnapshot } from "./artifactSnapshot.ts";
import type { IivoArtifact } from "../types/artifacts";

export type ArtifactRestoreState =
  | { status: "idle" }
  | { status: "loading"; snapshot: Extract<ArtifactSnapshot, { mode: "reference" }> }
  | { status: "loaded"; artifact: IivoArtifact }
  | { status: "missing"; snapshot: Extract<ArtifactSnapshot, { mode: "reference" }> }
  | { status: "error"; message: string };

export async function fetchArtifactByReference(
  artifactId: string,
  runId?: string | null,
): Promise<IivoArtifact | null> {
  try {
    const qs = runId ? `?runId=${encodeURIComponent(runId)}` : "";
    const res = await fetch(`/api/artifacts/${encodeURIComponent(artifactId)}/content${qs}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { artifact?: IivoArtifact };
    return data.artifact ?? null;
  } catch {
    return null;
  }
}
