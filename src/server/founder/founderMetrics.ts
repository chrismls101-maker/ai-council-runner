import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "node:url";
import type { AuditLogEntry } from "../audit/types.js";
import type { UsageEvent } from "../usage/types.js";
import { getGlassBrowseStats, type GlassBrowseStats } from "../landing/glassBrowseAnalytics.js";
import { getFeatureFlags, type FeatureFlags } from "./featureFlags.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = path.resolve(__dirname, "../../../data");

type WindowCounts = { last24h: number; last7d: number };

function sinceHours(hours: number): number {
  return Date.now() - hours * 60 * 60 * 1000;
}

function countInWindows(timestamps: number[]): WindowCounts {
  const h24 = sinceHours(24);
  const d7 = sinceHours(24 * 7);
  let last24h = 0;
  let last7d = 0;
  for (const ts of timestamps) {
    if (ts >= d7) last7d += 1;
    if (ts >= h24) last24h += 1;
  }
  return { last24h, last7d };
}

async function readJsonlTimestamps(filePath: string, eventFilter?: string): Promise<number[]> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const out: number[] = [];
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line) as { timestamp?: string; event?: string };
        if (eventFilter && parsed.event !== eventFilter) continue;
        const ts = Date.parse(parsed.timestamp ?? "");
        if (!Number.isNaN(ts)) out.push(ts);
      } catch {
        /* skip */
      }
    }
    return out;
  } catch {
    return [];
  }
}

async function readAuditEntries(): Promise<AuditLogEntry[]> {
  try {
    const raw = await fs.readFile(path.join(DATA_ROOT, "audit/audit-log.json"), "utf8");
    const parsed = JSON.parse(raw) as { entries?: AuditLogEntry[] };
    return parsed.entries ?? [];
  } catch {
    return [];
  }
}

async function readUsageEvents(): Promise<UsageEvent[]> {
  try {
    const raw = await fs.readFile(path.join(DATA_ROOT, "usage/usage-events.json"), "utf8");
    const parsed = JSON.parse(raw) as { events?: UsageEvent[] };
    return parsed.events ?? [];
  } catch {
    return [];
  }
}

function healthStatus(errorRate24h: number): "green" | "yellow" | "red" {
  if (errorRate24h < 0.02) return "green";
  if (errorRate24h < 0.08) return "yellow";
  return "red";
}

export type FounderDashboardPayload = {
  health: {
    sessions: WindowCounts;
    errors: WindowCounts;
    errorRate24h: number;
    status: "green" | "yellow" | "red";
  };
  usage: {
    estimatedSpendUsd24h: number;
    estimatedSpendUsd7d: number;
    topSessions: Array<{ label: string; credits: number }>;
    topSessionsNote: string;
  };
  glassBrowse: GlassBrowseStats & { enterRate: number | null };
  flags: FeatureFlags;
};

export type FounderGlassSummary = {
  flags: Pick<
    FeatureFlags,
    "aiCallsEnabled" | "overlayDemoEnabled" | "terminalAutoFixEnabled" | "coderBuildLoopEnabledForNewUsers"
  >;
  apiHealth: "ok" | "degraded";
  glassBrowse: {
    entered: WindowCounts;
    commands: WindowCounts;
    autoExit: WindowCounts;
  };
  buildLoopRuns24h: number | null;
  buildLoopRunsNote: string;
};

export async function getFounderDashboardMetrics(): Promise<FounderDashboardPayload> {
  const [audit, usageEvents, flags, browseStats] = await Promise.all([
    readAuditEntries(),
    readUsageEvents(),
    getFeatureFlags(),
    getGlassBrowseStats(),
  ]);

  const sessionTimestamps = audit
    .filter((e) => e.eventType === "run_started" || e.eventType === "app_started")
    .map((e) => Date.parse(e.timestamp));

  const errorTimestamps = audit
    .filter((e) => e.eventType === "run_failed" || e.eventType === "benchmark_failed")
    .map((e) => Date.parse(e.timestamp));

  const sessions = countInWindows(sessionTimestamps);
  const errors = countInWindows(errorTimestamps);
  const errorRate24h = sessions.last24h > 0 ? errors.last24h / sessions.last24h : 0;

  const h24 = sinceHours(24);
  const d7 = sinceHours(24 * 7);
  let spend24h = 0;
  let spend7d = 0;
  const byRun = new Map<string, number>();

  for (const event of usageEvents) {
    const ts = Date.parse(event.timestamp);
    if (Number.isNaN(ts)) continue;
    const credits = event.credits ?? 0;
    if (ts >= d7) spend7d += credits;
    if (ts >= h24) spend24h += credits;
    if (event.runId) {
      byRun.set(event.runId, (byRun.get(event.runId) ?? 0) + credits);
    }
  }

  const topSessions = [...byRun.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, credits]) => ({ label, credits }));

  return {
    health: {
      sessions,
      errors,
      errorRate24h,
      status: healthStatus(errorRate24h),
    },
    usage: {
      estimatedSpendUsd24h: Math.round(spend24h * 100) / 100,
      estimatedSpendUsd7d: Math.round(spend7d * 100) / 100,
      topSessions,
      topSessionsNote:
        topSessions.length > 0
          ? "Credits by run ID (local usage ledger)."
          : "Coming soon — per-user token attribution needs linked-account billing.",
    },
    glassBrowse: {
      ...browseStats,
      enterRate: browseStats.pageViews > 0 ? browseStats.entered / browseStats.pageViews : null,
    },
    flags,
  };
}

export async function getFounderGlassSummary(): Promise<FounderGlassSummary> {
  const [flags, entered, commands, autoExit] = await Promise.all([
    getFeatureFlags(),
    readJsonlTimestamps(path.join(DATA_ROOT, "landing/glass-browse-events.jsonl"), "entered"),
    readJsonlTimestamps(path.join(DATA_ROOT, "landing/glass-browse-events.jsonl"), "command"),
    readJsonlTimestamps(path.join(DATA_ROOT, "landing/glass-browse-events.jsonl"), "auto_exit"),
  ]);

  return {
    flags: {
      aiCallsEnabled: flags.aiCallsEnabled,
      overlayDemoEnabled: flags.overlayDemoEnabled,
      terminalAutoFixEnabled: flags.terminalAutoFixEnabled,
      coderBuildLoopEnabledForNewUsers: flags.coderBuildLoopEnabledForNewUsers,
    },
    apiHealth: flags.aiCallsEnabled ? "ok" : "degraded",
    glassBrowse: {
      entered: countInWindows(entered),
      commands: countInWindows(commands),
      autoExit: countInWindows(autoExit),
    },
    buildLoopRuns24h: null,
    buildLoopRunsNote: "Coming soon — aggregate Glass desktop build-loop runs via linked sessions.",
  };
}
