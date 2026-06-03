import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import type {
  UsageEvent,
  UsageEventsFile,
  UsageEventType,
  UsagePlanId,
  UsageState,
} from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USAGE_DIR = path.resolve(__dirname, "../../../data/usage");
const STATE_FILE = path.join(USAGE_DIR, "usage-state.json");
const EVENTS_FILE = path.join(USAGE_DIR, "usage-events.json");

const DEFAULT_PLAN: UsagePlanId = "local_free";
const DEFAULT_MONTHLY_CREDITS = 100;

function defaultState(now = new Date()): UsageState {
  const iso = now.toISOString();
  return {
    planId: DEFAULT_PLAN,
    currentCredits: DEFAULT_MONTHLY_CREDITS,
    monthlyCredits: DEFAULT_MONTHLY_CREDITS,
    usedCreditsThisMonth: 0,
    resetDate: nextResetDate(now),
    createdAt: iso,
    updatedAt: iso,
  };
}

function nextResetDate(from: Date): string {
  const next = new Date(from);
  next.setUTCMonth(next.getUTCMonth() + 1, 1);
  next.setUTCHours(0, 0, 0, 0);
  return next.toISOString();
}

function maybeRollMonthlyPeriod(state: UsageState, now = new Date()): UsageState {
  if (now.toISOString() < state.resetDate) return state;
  return {
    ...state,
    currentCredits: state.monthlyCredits,
    usedCreditsThisMonth: 0,
    resetDate: nextResetDate(now),
    updatedAt: now.toISOString(),
  };
}

async function ensureUsageDir(): Promise<void> {
  await fs.mkdir(USAGE_DIR, { recursive: true });
}

async function readStateFile(): Promise<UsageState> {
  await ensureUsageDir();
  try {
    const raw = await fs.readFile(STATE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as UsageState;
    return maybeRollMonthlyPeriod({
      ...defaultState(),
      ...parsed,
    });
  } catch {
    const initial = defaultState();
    await writeStateFile(initial);
    return initial;
  }
}

async function writeStateFile(state: UsageState): Promise<void> {
  await ensureUsageDir();
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

async function readEventsFile(): Promise<UsageEventsFile> {
  await ensureUsageDir();
  try {
    const raw = await fs.readFile(EVENTS_FILE, "utf-8");
    const parsed = JSON.parse(raw) as UsageEventsFile;
    return { events: parsed.events ?? [] };
  } catch {
    return { events: [] };
  }
}

async function writeEventsFile(file: UsageEventsFile): Promise<void> {
  await ensureUsageDir();
  await fs.writeFile(EVENTS_FILE, JSON.stringify(file, null, 2));
}

function sanitizeMetadata(value?: string): string | undefined {
  if (!value?.trim()) return undefined;
  return value.trim().slice(0, 300);
}

export async function getUsageState(): Promise<UsageState> {
  const state = await readStateFile();
  await writeStateFile(state);
  return state;
}

export async function appendUsageEvent(input: {
  eventType: UsageEventType;
  runId?: string;
  workflowId?: string;
  tokenMode?: string;
  credits?: number;
  balanceAfter?: number;
  metadata?: string;
}): Promise<UsageEvent> {
  const file = await readEventsFile();
  const entry: UsageEvent = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    eventType: input.eventType,
    runId: input.runId,
    workflowId: input.workflowId,
    tokenMode: input.tokenMode,
    credits: input.credits,
    balanceAfter: input.balanceAfter,
    metadata: sanitizeMetadata(input.metadata),
  };
  file.events.push(entry);
  if (file.events.length > 5000) {
    file.events = file.events.slice(-5000);
  }
  await writeEventsFile(file);
  return entry;
}

export async function listUsageEvents(limit = 100): Promise<UsageEvent[]> {
  const file = await readEventsFile();
  return file.events
    .slice()
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, limit);
}

export async function exportUsageEvents(): Promise<UsageEventsFile> {
  return readEventsFile();
}

export async function deductCredits(input: {
  credits: number;
  runId?: string;
  workflowId?: string;
  tokenMode?: string;
  metadata?: string;
}): Promise<UsageState> {
  const state = await readStateFile();
  const nextCredits = Math.max(0, state.currentCredits - input.credits);
  const next: UsageState = {
    ...state,
    currentCredits: nextCredits,
    usedCreditsThisMonth: state.usedCreditsThisMonth + input.credits,
    updatedAt: new Date().toISOString(),
  };
  await writeStateFile(next);
  await appendUsageEvent({
    eventType: "credits_deducted",
    runId: input.runId,
    workflowId: input.workflowId,
    tokenMode: input.tokenMode,
    credits: input.credits,
    balanceAfter: nextCredits,
    metadata: input.metadata,
  });
  return next;
}

export async function refundCredits(input: {
  credits: number;
  runId?: string;
  workflowId?: string;
  tokenMode?: string;
  metadata?: string;
}): Promise<UsageState> {
  if (input.credits <= 0) return readStateFile();
  const state = await readStateFile();
  const nextCredits = Math.min(
    state.monthlyCredits,
    state.currentCredits + input.credits,
  );
  const next: UsageState = {
    ...state,
    currentCredits: nextCredits,
    usedCreditsThisMonth: Math.max(0, state.usedCreditsThisMonth - input.credits),
    updatedAt: new Date().toISOString(),
  };
  await writeStateFile(next);
  await appendUsageEvent({
    eventType: "credits_refunded",
    runId: input.runId,
    workflowId: input.workflowId,
    tokenMode: input.tokenMode,
    credits: input.credits,
    balanceAfter: nextCredits,
    metadata: input.metadata,
  });
  return next;
}

export async function resetLocalCredits(): Promise<UsageState> {
  const now = new Date();
  const next = defaultState(now);
  await writeStateFile(next);
  await appendUsageEvent({
    eventType: "local_credits_reset",
    credits: next.currentCredits,
    balanceAfter: next.currentCredits,
    metadata: "Reset to local free defaults",
  });
  return next;
}

export async function addLocalCredits(credits: number): Promise<UsageState> {
  const amount = Math.max(0, Math.floor(credits));
  const state = await readStateFile();
  const nextCredits = state.currentCredits + amount;
  const next: UsageState = {
    ...state,
    currentCredits: nextCredits,
    updatedAt: new Date().toISOString(),
  };
  await writeStateFile(next);
  await appendUsageEvent({
    eventType: "local_credits_added",
    credits: amount,
    balanceAfter: nextCredits,
    metadata: `Added ${amount} local credits`,
  });
  return next;
}

/** Local QA/dev utility — set exact credit balance for tests. */
export async function setLocalCredits(credits: number): Promise<UsageState> {
  const amount = Math.max(0, Math.floor(credits));
  const state = await readStateFile();
  const next: UsageState = {
    ...state,
    currentCredits: amount,
    updatedAt: new Date().toISOString(),
  };
  await writeStateFile(next);
  await appendUsageEvent({
    eventType: "local_credits_added",
    credits: amount,
    balanceAfter: amount,
    metadata: `Set local credits to ${amount} (QA utility)`,
  });
  return next;
}

export async function getUsageSummary(limit = 25): Promise<{
  state: UsageState;
  recentUsage: UsageEvent[];
}> {
  const state = await getUsageState();
  const recentUsage = await listUsageEvents(limit);
  return { state, recentUsage };
}
