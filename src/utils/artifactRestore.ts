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
): Promise<IivoArtifact | null> {
  try {
    const res = await fetch(`/api/history/${encodeURIComponent(artifactId)}`);
    if (!res.ok) return null;
    const entry = (await res.json()) as { artifact?: IivoArtifact };
    return entry.artifact ?? null;
  } catch {
    return null;
  }
}
