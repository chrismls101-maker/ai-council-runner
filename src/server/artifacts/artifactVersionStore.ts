import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { ArtifactSection } from "./artifactTypes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VERSIONS_DIR = path.resolve(__dirname, "../../../data/artifact-versions");

export type PersistedArtifactSectionVersion = {
  id: string;
  artifactId: string;
  sectionId: string;
  createdAt: string;
  source: "original" | "edit" | "regenerate" | "variant" | "transform";
  instruction?: string;
  variantType?: string;
  content: ArtifactSection["content"];
};

function versionsPath(artifactId: string): string {
  return path.join(VERSIONS_DIR, `${artifactId}.json`);
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(VERSIONS_DIR, { recursive: true });
}

export async function listArtifactVersions(
  artifactId: string,
): Promise<PersistedArtifactSectionVersion[]> {
  try {
    await ensureDir();
    const raw = await fs.readFile(versionsPath(artifactId), "utf-8");
    const parsed = JSON.parse(raw) as PersistedArtifactSectionVersion[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function appendArtifactVersion(
  version: PersistedArtifactSectionVersion,
): Promise<PersistedArtifactSectionVersion[]> {
  await ensureDir();
  const existing = await listArtifactVersions(version.artifactId);
  if (existing.some((v) => v.id === version.id)) {
    return existing;
  }
  const next = [...existing, version];
  await fs.writeFile(versionsPath(version.artifactId), JSON.stringify(next, null, 2));
  return next;
}

export async function getArtifactVersion(
  artifactId: string,
  versionId: string,
): Promise<PersistedArtifactSectionVersion | null> {
  const all = await listArtifactVersions(artifactId);
  return all.find((v) => v.id === versionId) ?? null;
}
