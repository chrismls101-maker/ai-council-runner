import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { CouncilRunResult } from "../types/index.js";
import type { RouterDecision } from "../agents/routerAgent.js";
import type { DecisionOutcome } from "../decisionQuality/types.js";
import { generateDecisionTitle } from "./decisionTitle.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_DIR = path.resolve(__dirname, "../../../data/history");

export interface RunHistoryEntry extends CouncilRunResult {
  timestamp: string;
  prompt: string;
  preset: string;
  workflowId: string;
  workflowName: string;
  title?: string;
  routerDecision?: RouterDecision;
  benchmarkEnabled?: boolean;
  benchmarkAnswer?: string;
  researchSources?: string[];
}

export interface RunHistorySummary {
  runId: string;
  timestamp: string;
  title: string;
  workflowId: string;
  workflowName: string;
  preset: string;
  prompt: string;
  promptPreview: string;
  status: string;
  tokenMode?: string;
  totalEstimatedCostUsd: number | null;
  sourceCount: number;
  benchmarkEnabled: boolean;
  hasFinalPlan: boolean;
  hasResearchOutput: boolean;
  finalPlanPreview: string;
  confidence?: string;
  riskLevel?: string;
  decisionScore?: number;
  outcomeStatus?: string;
}

async function ensureHistoryDir(): Promise<void> {
  await fs.mkdir(HISTORY_DIR, { recursive: true });
}

function historyPath(runId: string): string {
  return path.join(HISTORY_DIR, `${runId}.json`);
}

function entryToSummary(entry: RunHistoryEntry): RunHistorySummary {
  const title =
    entry.title ??
    generateDecisionTitle(
      entry.preset,
      entry.workflowId,
      entry.workflowName,
      entry.prompt,
    );

  return {
    runId: entry.runId,
    timestamp: entry.timestamp,
    title,
    workflowId: entry.workflowId,
    workflowName: entry.workflowName,
    preset: entry.preset,
    prompt: entry.prompt,
    promptPreview: entry.prompt.slice(0, 120),
    status: entry.status,
    tokenMode: entry.tokenMode,
    totalEstimatedCostUsd: entry.costSummary?.totalEstimatedCostUsd ?? null,
    sourceCount: entry.researchSources?.length ?? 0,
    benchmarkEnabled: Boolean(entry.benchmarkEnabled),
    hasFinalPlan: Boolean(entry.outputs.finalJudge?.trim()),
    hasResearchOutput: Boolean(entry.outputs.research?.trim()),
    finalPlanPreview: entry.outputs.finalJudge?.slice(0, 500) ?? "",
    confidence: entry.decisionQuality?.confidence,
    riskLevel: entry.decisionQuality?.riskLevel,
    decisionScore: entry.decisionQuality?.decisionScore,
    outcomeStatus: entry.outcome?.status,
  };
}

export async function saveRunHistory(entry: RunHistoryEntry): Promise<void> {
  await ensureHistoryDir();
  const withTitle: RunHistoryEntry = {
    ...entry,
    title:
      entry.title ??
      generateDecisionTitle(
        entry.preset,
        entry.workflowId,
        entry.workflowName,
        entry.prompt,
      ),
  };
  await fs.writeFile(
    historyPath(entry.runId),
    JSON.stringify(withTitle, null, 2),
  );
}

export async function listRunHistory(): Promise<RunHistorySummary[]> {
  await ensureHistoryDir();
  let files: string[];
  try {
    files = await fs.readdir(HISTORY_DIR);
  } catch {
    return [];
  }

  const summaries: RunHistorySummary[] = [];
  for (const file of files.filter((f) => f.endsWith(".json"))) {
    try {
      const raw = await fs.readFile(path.join(HISTORY_DIR, file), "utf-8");
      const entry = JSON.parse(raw) as RunHistoryEntry;
      summaries.push(entryToSummary(entry));
    } catch {
      /* skip corrupt entries */
    }
  }

  return summaries.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

export async function getRunHistory(
  runId: string,
): Promise<RunHistoryEntry | null> {
  try {
    const raw = await fs.readFile(historyPath(runId), "utf-8");
    return JSON.parse(raw) as RunHistoryEntry;
  } catch {
    return null;
  }
}

export async function deleteRunHistory(runId: string): Promise<boolean> {
  try {
    await fs.unlink(historyPath(runId));
    return true;
  } catch {
    return false;
  }
}

export async function exportAllRunHistory(): Promise<RunHistoryEntry[]> {
  await ensureHistoryDir();
  let files: string[];
  try {
    files = await fs.readdir(HISTORY_DIR);
  } catch {
    return [];
  }

  const entries: RunHistoryEntry[] = [];
  for (const file of files.filter((f) => f.endsWith(".json"))) {
    try {
      const raw = await fs.readFile(path.join(HISTORY_DIR, file), "utf-8");
      entries.push(JSON.parse(raw) as RunHistoryEntry);
    } catch {
      /* skip corrupt entries */
    }
  }

  return entries.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

export async function deleteAllRunHistory(): Promise<number> {
  await ensureHistoryDir();
  let files: string[];
  try {
    files = await fs.readdir(HISTORY_DIR);
  } catch {
    return 0;
  }

  let deleted = 0;
  for (const file of files.filter((f) => f.endsWith(".json"))) {
    try {
      await fs.unlink(path.join(HISTORY_DIR, file));
      deleted += 1;
    } catch {
      /* skip */
    }
  }
  return deleted;
}

export async function patchRunArtifactTrace(
  runId: string,
  patch: { builderModeAccepted: boolean },
): Promise<RunHistoryEntry | null> {
  const entry = await getRunHistory(runId);
  if (!entry?.executionTrace) return null;

  const trace = entry.executionTrace;
  const artifactTrace = trace.artifact ?? {
    artifactType: entry.artifact?.type ?? "canvas_project",
    renderMode: entry.artifact?.renderMode ?? "canvas",
    builderModeSuggested: entry.artifact?.renderMode === "canvas",
  };

  const updated: RunHistoryEntry = {
    ...entry,
    executionTrace: {
      ...trace,
      artifact: {
        ...artifactTrace,
        builderModeAccepted: patch.builderModeAccepted,
      },
    },
  };
  await saveRunHistory(updated);
  return updated;
}

export async function updateRunOutcome(
  runId: string,
  outcome: DecisionOutcome,
): Promise<RunHistoryEntry | null> {
  const entry = await getRunHistory(runId);
  if (!entry) return null;

  const updated: RunHistoryEntry = {
    ...entry,
    outcome: {
      ...outcome,
      updatedAt: new Date().toISOString(),
    },
  };
  await saveRunHistory(updated);
  return updated;
}
