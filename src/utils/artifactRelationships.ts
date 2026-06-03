import type { ArtifactRelationship, IivoArtifact } from "../types/artifacts";

const LOCAL_REL_PREFIX = "iivo_artifact_relationships_";

export function loadLocalRelationships(parentId: string): ArtifactRelationship[] {
  try {
    const raw = localStorage.getItem(`${LOCAL_REL_PREFIX}${parentId}`);
    if (!raw) return [];
    return JSON.parse(raw) as ArtifactRelationship[];
  } catch {
    return [];
  }
}

export function saveLocalRelationship(rel: ArtifactRelationship): void {
  try {
    const prev = loadLocalRelationships(rel.parentArtifactId);
    if (prev.some((r) => r.childArtifactId === rel.childArtifactId)) return;
    localStorage.setItem(
      `${LOCAL_REL_PREFIX}${rel.parentArtifactId}`,
      JSON.stringify([...prev, rel]),
    );
  } catch {
    /* quota */
  }
}

export function transformTypeLabel(transformType: string): string {
  return transformType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function fetchArtifactRelationships(
  artifactId: string,
): Promise<ArtifactRelationship[]> {
  try {
    const res = await fetch(`/api/artifacts/${artifactId}/relationships`);
    if (!res.ok) return loadLocalRelationships(artifactId);
    const data = (await res.json()) as { relationships?: ArtifactRelationship[] };
    const server = data.relationships ?? [];
    const local = loadLocalRelationships(artifactId);
    const merged = [...server];
    for (const r of local) {
      if (!merged.some((m) => m.childArtifactId === r.childArtifactId)) merged.push(r);
    }
    return merged;
  } catch {
    return loadLocalRelationships(artifactId);
  }
}

export async function fetchChildArtifact(childId: string): Promise<IivoArtifact | null> {
  try {
    const res = await fetch(`/api/artifacts/children/${childId}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { artifact?: IivoArtifact };
    return data.artifact ?? null;
  } catch {
    return null;
  }
}
