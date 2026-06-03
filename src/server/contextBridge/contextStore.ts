import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import type {
  ContextItem,
  ContextStoreFile,
  CreateContextItemInput,
  UpdateContextItemInput,
} from "./types.js";
import { deleteContextScreenshot } from "./screenshotStore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTEXT_DIR = path.resolve(__dirname, "../../../data/context");
const CONTEXT_FILE = path.join(CONTEXT_DIR, "context-items.json");

async function ensureContextDir(): Promise<void> {
  await fs.mkdir(CONTEXT_DIR, { recursive: true });
}

async function readStore(): Promise<ContextStoreFile> {
  await ensureContextDir();
  try {
    const raw = await fs.readFile(CONTEXT_FILE, "utf-8");
    const parsed = JSON.parse(raw) as ContextStoreFile;
    return { items: parsed.items ?? [] };
  } catch {
    return { items: [] };
  }
}

async function writeStore(store: ContextStoreFile): Promise<void> {
  await ensureContextDir();
  await fs.writeFile(CONTEXT_FILE, JSON.stringify(store, null, 2));
}

export async function listContextItems(): Promise<ContextItem[]> {
  const store = await readStore();
  return store.items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getContextItem(id: string): Promise<ContextItem | null> {
  const store = await readStore();
  return store.items.find((item) => item.id === id) ?? null;
}

export async function createContextItem(input: CreateContextItemInput): Promise<ContextItem> {
  const store = await readStore();
  const now = new Date().toISOString();
  const item: ContextItem = {
    id: uuidv4(),
    type: input.type,
    title: input.title.trim(),
    sourceUrl: input.sourceUrl?.trim() || undefined,
    contentText: input.contentText.trim(),
    contentSummary: input.contentSummary?.trim() || undefined,
    tags: input.tags?.map((t) => t.trim()).filter(Boolean) ?? [],
    project: input.project?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
    relatedRunId: input.relatedRunId,
    importedAt: input.importedAt,
    capturedVia: input.capturedVia,
    capturedAt: input.capturedAt,
    sourceConfidence: input.sourceConfidence,
    lensCaptureType: input.lensCaptureType,
    captureType: input.captureType,
    screenshotPath: input.screenshotPath,
    pageTitle: input.pageTitle?.trim() || undefined,
    imageMimeType: input.imageMimeType,
    imageSizeBytes: input.imageSizeBytes,
    originalTextLength: input.originalTextLength,
    sentTextLength: input.sentTextLength,
    truncated: input.truncated,
    savedToMemory: false,
    includedInRunIds: [],
  };
  store.items.push(item);
  await writeStore(store);
  return item;
}

export async function updateContextItem(
  id: string,
  patch: UpdateContextItemInput,
): Promise<ContextItem | null> {
  const store = await readStore();
  const index = store.items.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const updated: ContextItem = {
    ...store.items[index],
    ...patch,
    title: patch.title?.trim() ?? store.items[index].title,
    contentText: patch.contentText?.trim() ?? store.items[index].contentText,
    sourceUrl:
      patch.sourceUrl !== undefined
        ? patch.sourceUrl.trim() || undefined
        : store.items[index].sourceUrl,
    tags: patch.tags ?? store.items[index].tags,
    project:
      patch.project !== undefined
        ? patch.project.trim() || undefined
        : store.items[index].project,
    updatedAt: new Date().toISOString(),
  };
  store.items[index] = updated;
  await writeStore(store);
  return updated;
}

export async function deleteContextItem(id: string): Promise<boolean> {
  const store = await readStore();
  const before = store.items.length;
  const existing = store.items.find((item) => item.id === id);
  store.items = store.items.filter((item) => item.id !== id);
  if (store.items.length === before) return false;
  await writeStore(store);
  if (existing?.screenshotPath || existing?.type === "screenshot") {
    await deleteContextScreenshot(id);
  }
  return true;
}

export async function appendRunIdToContextItem(
  id: string,
  runId: string,
): Promise<ContextItem | null> {
  const item = await getContextItem(id);
  if (!item) return null;
  const includedInRunIds = [...(item.includedInRunIds ?? [])];
  if (!includedInRunIds.includes(runId)) includedInRunIds.push(runId);
  return updateContextItem(id, { includedInRunIds });
}
