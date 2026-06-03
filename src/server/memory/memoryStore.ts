import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import { findRelevantMemories, searchMemories } from "./relevance.js";
import type {
  Memory,
  MemorySearchInput,
  MemoryStoreFile,
  MemoryType,
  RelevantMemoryInput,
  ProjectFactMemory,
  DecisionMemory,
  OutcomeMemory,
  PreferenceMemory,
  EvidenceMemory,
} from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEMORY_DIR = path.resolve(__dirname, "../../../data/memory");
const MEMORY_FILE = path.join(MEMORY_DIR, "memories.json");

async function ensureMemoryDir(): Promise<void> {
  await fs.mkdir(MEMORY_DIR, { recursive: true });
}

async function readStore(): Promise<MemoryStoreFile> {
  await ensureMemoryDir();
  try {
    const raw = await fs.readFile(MEMORY_FILE, "utf-8");
    const parsed = JSON.parse(raw) as MemoryStoreFile;
    return { memories: parsed.memories ?? [] };
  } catch {
    return { memories: [] };
  }
}

async function writeStore(store: MemoryStoreFile): Promise<void> {
  await ensureMemoryDir();
  await fs.writeFile(MEMORY_FILE, JSON.stringify(store, null, 2));
}

export async function listMemories(): Promise<Memory[]> {
  const store = await readStore();
  return store.memories.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getMemory(id: string): Promise<Memory | null> {
  const store = await readStore();
  return store.memories.find((m) => m.id === id) ?? null;
}

export async function createMemory(input: CreateMemoryPayload): Promise<Memory> {
  const store = await readStore();
  const now = new Date().toISOString();
  const memory = {
    ...input,
    id: uuidv4(),
    createdAt: now,
    updatedAt: now,
  } as Memory;
  store.memories.push(memory);
  await writeStore(store);
  return memory;
}

export async function updateMemory(
  id: string,
  patch: Partial<Omit<Memory, "id" | "type" | "createdAt">>,
): Promise<Memory | null> {
  const store = await readStore();
  const index = store.memories.findIndex((m) => m.id === id);
  if (index < 0) return null;
  const updated = {
    ...store.memories[index],
    ...patch,
    updatedAt: new Date().toISOString(),
  } as Memory;
  store.memories[index] = updated;
  await writeStore(store);
  return updated;
}

export async function deleteMemory(id: string): Promise<boolean> {
  const store = await readStore();
  const next = store.memories.filter((m) => m.id !== id);
  if (next.length === store.memories.length) return false;
  await writeStore({ memories: next });
  return true;
}

export async function exportAllMemories(): Promise<MemoryStoreFile> {
  return readStore();
}

export async function deleteAllMemories(): Promise<number> {
  const store = await readStore();
  const count = store.memories.length;
  await writeStore({ memories: [] });
  return count;
}

export async function searchMemoriesApi(input: MemorySearchInput): Promise<Memory[]> {
  const store = await readStore();
  return searchMemories(store.memories, input);
}

export async function findRelevantMemoriesApi(
  input: RelevantMemoryInput,
): Promise<Memory[]> {
  const store = await readStore();
  return findRelevantMemories(store.memories, input);
}

export function listProjectNames(memories: Memory[]): string[] {
  const names = new Set<string>();
  for (const memory of memories) {
    if (memory.type === "project_fact" || memory.type === "decision" || memory.type === "outcome") {
      if (memory.projectName.trim()) names.add(memory.projectName.trim());
    }
    if (memory.type === "preference" && memory.projectName?.trim()) {
      names.add(memory.projectName.trim());
    }
    if (memory.type === "evidence" && memory.projectName?.trim()) {
      names.add(memory.projectName.trim());
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

export type CreateMemoryPayload =
  | Omit<ProjectFactMemory, "id" | "createdAt" | "updatedAt">
  | Omit<DecisionMemory, "id" | "createdAt" | "updatedAt">
  | Omit<OutcomeMemory, "id" | "createdAt" | "updatedAt">
  | Omit<PreferenceMemory, "id" | "createdAt" | "updatedAt">
  | Omit<EvidenceMemory, "id" | "createdAt" | "updatedAt">;

export function validateMemoryPayload(body: Record<string, unknown>): CreateMemoryPayload | null {
  const type = body.type;
  if (typeof type !== "string") return null;
  const allowed: MemoryType[] = [
    "project_fact",
    "decision",
    "outcome",
    "preference",
    "evidence",
  ];
  if (!allowed.includes(type as MemoryType)) return null;
  return body as CreateMemoryPayload;
}
