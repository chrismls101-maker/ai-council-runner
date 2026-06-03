import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import type { BenchmarkRunRecord, BenchmarkRunSummary, BenchmarkRunsFile } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BENCHMARKS_DIR = path.resolve(__dirname, "../../../data/benchmarks");
const RUNS_FILE = path.join(BENCHMARKS_DIR, "benchmark-runs.json");

async function ensureDir(): Promise<void> {
  await fs.mkdir(BENCHMARKS_DIR, { recursive: true });
}

async function readFile(): Promise<BenchmarkRunsFile> {
  await ensureDir();
  try {
    const raw = await fs.readFile(RUNS_FILE, "utf-8");
    const parsed = JSON.parse(raw) as BenchmarkRunsFile;
    return { runs: parsed.runs ?? [] };
  } catch {
    return { runs: [] };
  }
}

async function writeFile(data: BenchmarkRunsFile): Promise<void> {
  await ensureDir();
  await fs.writeFile(RUNS_FILE, JSON.stringify(data, null, 2), "utf-8");
}

export function toBenchmarkSummary(record: BenchmarkRunRecord): BenchmarkRunSummary {
  return {
    id: record.id,
    timestamp: record.timestamp,
    promptPreview: record.prompt.slice(0, 120),
    benchmarkMode: record.benchmarkMode,
    winner: record.winner,
    scoreDifference: record.scoreDifference,
    totalCredits: record.totalCredits,
    iivoWorkflowId: record.iivoWorkflowId,
  };
}

export async function listBenchmarkRuns(): Promise<BenchmarkRunSummary[]> {
  const data = await readFile();
  return data.runs
    .slice()
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .map(toBenchmarkSummary);
}

export async function getBenchmarkRun(id: string): Promise<BenchmarkRunRecord | null> {
  const data = await readFile();
  return data.runs.find((r) => r.id === id) ?? null;
}

export async function saveBenchmarkRun(
  record: Omit<BenchmarkRunRecord, "id" | "timestamp" | "createdAt" | "updatedAt"> & {
    id?: string;
  },
): Promise<BenchmarkRunRecord> {
  const data = await readFile();
  const now = new Date().toISOString();
  const next: BenchmarkRunRecord = {
    ...record,
    id: record.id ?? uuidv4(),
    timestamp: now,
    createdAt: now,
    updatedAt: now,
  };
  data.runs.unshift(next);
  await writeFile(data);
  return next;
}

export async function updateBenchmarkRun(
  id: string,
  patch: Partial<Pick<BenchmarkRunRecord, "notes">>,
): Promise<BenchmarkRunRecord | null> {
  const data = await readFile();
  const idx = data.runs.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  const updated: BenchmarkRunRecord = {
    ...data.runs[idx]!,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  data.runs[idx] = updated;
  await writeFile(data);
  return updated;
}

export async function deleteBenchmarkRun(id: string): Promise<boolean> {
  const data = await readFile();
  const before = data.runs.length;
  data.runs = data.runs.filter((r) => r.id !== id);
  if (data.runs.length === before) return false;
  await writeFile(data);
  return true;
}
