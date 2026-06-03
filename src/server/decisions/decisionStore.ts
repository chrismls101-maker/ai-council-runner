import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import type { OutcomeStatus } from "../decisionQuality/types.js";
import type {
  DecisionLearningStats,
  DecisionRecord,
  DecisionRecordsFile,
} from "./types.js";
import { buildLearningSummary } from "./learningSummary.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DECISIONS_DIR = path.resolve(__dirname, "../../../data/decisions");
const DECISIONS_FILE = path.join(DECISIONS_DIR, "decision-records.json");

async function ensureDecisionsDir(): Promise<void> {
  await fs.mkdir(DECISIONS_DIR, { recursive: true });
}

async function readStore(): Promise<DecisionRecordsFile> {
  await ensureDecisionsDir();
  try {
    const raw = await fs.readFile(DECISIONS_FILE, "utf-8");
    const parsed = JSON.parse(raw) as DecisionRecordsFile;
    return { records: parsed.records ?? [] };
  } catch {
    return { records: [] };
  }
}

async function writeStore(store: DecisionRecordsFile): Promise<void> {
  await ensureDecisionsDir();
  await fs.writeFile(DECISIONS_FILE, JSON.stringify(store, null, 2));
}

export async function listDecisionRecords(): Promise<DecisionRecord[]> {
  const store = await readStore();
  return store.records.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export async function getDecisionRecord(id: string): Promise<DecisionRecord | null> {
  const store = await readStore();
  return store.records.find((r) => r.id === id) ?? null;
}

export async function getDecisionRecordByRunId(
  runId: string,
): Promise<DecisionRecord | null> {
  const store = await readStore();
  return store.records.find((r) => r.runId === runId) ?? null;
}

export async function saveDecisionRecord(record: DecisionRecord): Promise<DecisionRecord> {
  const store = await readStore();
  const idx = store.records.findIndex((r) => r.id === record.id);
  if (idx >= 0) {
    store.records[idx] = record;
  } else {
    store.records.push(record);
  }
  await writeStore(store);
  return record;
}

export async function createDecisionRecord(
  draft: Omit<DecisionRecord, "id" | "updatedAt"> & { id?: string },
): Promise<DecisionRecord> {
  const now = new Date().toISOString();
  const record: DecisionRecord = {
    ...draft,
    id: draft.id ?? uuidv4(),
    riskFlags: draft.riskFlags ?? [],
    sourcesUsed: draft.sourcesUsed ?? [],
    includedMemoryIds: draft.includedMemoryIds ?? [],
    outcomeStatus: draft.outcomeStatus ?? "not_started",
    updatedAt: now,
  };
  return saveDecisionRecord(record);
}

export type DecisionRecordExecutionPatch = {
  actionTaken?: string;
  expectedOutcome?: string;
  actualOutcome?: string;
  outcomeStatus?: OutcomeStatus;
  resultMetric?: string;
  lessonsLearned?: string;
  nextTimeRecommendation?: string;
};

export async function updateDecisionRecordExecution(
  id: string,
  patch: DecisionRecordExecutionPatch,
): Promise<DecisionRecord | null> {
  const record = await getDecisionRecord(id);
  if (!record) return null;

  const updated: DecisionRecord = {
    ...record,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  if (patch.lessonsLearned?.trim() && !patch.nextTimeRecommendation?.trim()) {
    updated.nextTimeRecommendation = buildLearningSummary(updated);
  }

  return saveDecisionRecord(updated);
}

export async function updateDecisionRecordByRunId(
  runId: string,
  patch: DecisionRecordExecutionPatch,
): Promise<DecisionRecord | null> {
  const record = await getDecisionRecordByRunId(runId);
  if (!record) return null;
  return updateDecisionRecordExecution(record.id, patch);
}

export async function getDecisionLearningStats(): Promise<DecisionLearningStats> {
  const records = await listDecisionRecords();
  const projectCounts = new Map<string, number>();

  for (const r of records) {
    const name = r.projectName?.trim() || "General";
    projectCounts.set(name, (projectCounts.get(name) ?? 0) + 1);
  }

  const topProjects = [...projectCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const recentLessons = records
    .filter((r) => r.lessonsLearned?.trim() || r.outcomeStatus !== "not_started")
    .slice(0, 8)
    .map((r) => ({
      recordId: r.id,
      title: r.decisionTitle,
      lesson: buildLearningSummary(r),
      updatedAt: r.updatedAt,
    }));

  const outcomesLogged = records.filter(
    (r) => r.outcomeStatus !== "not_started" || Boolean(r.actionTaken?.trim()),
  ).length;

  return {
    totalDecisions: records.length,
    outcomesLogged,
    workedCount: records.filter((r) => r.outcomeStatus === "worked").length,
    didNotWorkCount: records.filter((r) => r.outcomeStatus === "did_not_work").length,
    needsRevisionCount: records.filter((r) => r.outcomeStatus === "needs_revision").length,
    withoutOutcomes: records.filter(
      (r) => r.outcomeStatus === "not_started" && !r.actionTaken?.trim(),
    ).length,
    topProjects,
    recentLessons,
  };
}
