import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { IivoArtifact } from "./artifactTypes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REL_DIR = path.resolve(__dirname, "../../../data/artifact-relationships");
const CHILDREN_DIR = path.resolve(__dirname, "../../../data/artifact-children");

export type ArtifactRelationship = {
  parentArtifactId: string;
  childArtifactId: string;
  transformType: string;
  createdAt: string;
};

export type ArtifactTransformResult = {
  artifact: IivoArtifact;
  relationship: ArtifactRelationship;
};

function relPath(parentId: string): string {
  return path.join(REL_DIR, `${parentId}.json`);
}

function childPath(childId: string): string {
  return path.join(CHILDREN_DIR, `${childId}.json`);
}

async function ensureDirs(): Promise<void> {
  await fs.mkdir(REL_DIR, { recursive: true });
  await fs.mkdir(CHILDREN_DIR, { recursive: true });
}

export async function listRelationships(parentArtifactId: string): Promise<ArtifactRelationship[]> {
  try {
    await ensureDirs();
    const raw = await fs.readFile(relPath(parentArtifactId), "utf-8");
    const parsed = JSON.parse(raw) as ArtifactRelationship[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveRelationship(
  relationship: ArtifactRelationship,
  childArtifact: IivoArtifact,
): Promise<ArtifactRelationship> {
  await ensureDirs();
  const existing = await listRelationships(relationship.parentArtifactId);
  const next = existing.some((r) => r.childArtifactId === relationship.childArtifactId)
    ? existing
    : [...existing, relationship];
  await fs.writeFile(relPath(relationship.parentArtifactId), JSON.stringify(next, null, 2));
  await fs.writeFile(childPath(childArtifact.id), JSON.stringify(childArtifact, null, 2));
  return relationship;
}

export async function getChildArtifact(childId: string): Promise<IivoArtifact | null> {
  try {
    await ensureDirs();
    const raw = await fs.readFile(childPath(childId), "utf-8");
    return JSON.parse(raw) as IivoArtifact;
  } catch {
    return null;
  }
}
