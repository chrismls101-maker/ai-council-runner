import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { ArtifactType, IivoArtifact } from "./artifactTypes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAVED_DIR = path.resolve(__dirname, "../../../data/saved-artifacts");

export type SavedArtifactRecord = {
  artifactId: string;
  title: string;
  type: ArtifactType;
  savedAt: string;
  sourceRunId?: string;
  tags?: string[];
  artifact?: IivoArtifact;
};

function savePath(artifactId: string): string {
  return path.join(SAVED_DIR, `${artifactId}.json`);
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(SAVED_DIR, { recursive: true });
}

export async function getSavedArtifact(artifactId: string): Promise<SavedArtifactRecord | null> {
  try {
    await ensureDir();
    const raw = await fs.readFile(savePath(artifactId), "utf-8");
    return JSON.parse(raw) as SavedArtifactRecord;
  } catch {
    return null;
  }
}

export async function saveArtifactRecord(record: SavedArtifactRecord): Promise<SavedArtifactRecord> {
  await ensureDir();
  const payload: SavedArtifactRecord = {
    ...record,
    savedAt: record.savedAt || new Date().toISOString(),
  };
  await fs.writeFile(savePath(record.artifactId), JSON.stringify(payload, null, 2));
  return payload;
}
