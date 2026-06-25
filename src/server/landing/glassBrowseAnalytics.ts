import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Request } from "express";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EVENTS_FILE =
  process.env.GLASS_BROWSE_EVENTS_FILE?.trim()
  || path.resolve(__dirname, "../../../data/landing/glass-browse-events.jsonl");

export const GLASS_BROWSE_EVENT_TYPES = [
  "page_view",
  "entered",
  "command",
  "auto_exit",
  "manual_exit",
  "mobile_preview",
] as const;

export type GlassBrowseEventType = (typeof GLASS_BROWSE_EVENT_TYPES)[number];

export type GlassBrowseEvent = {
  id: string;
  timestamp: string;
  event: GlassBrowseEventType;
  metadata?: Record<string, string>;
};

export type GlassBrowseStats = {
  pageViews: number;
  entered: number;
  commanded: number;
  autoExit: number;
  manualExit: number;
  mobilePreview: number;
  commandRate: number | null;
  autoExitRate: number | null;
  manualExitRate: number | null;
};

export type GlassBrowseSocialProof = {
  entered: number;
};

export function glassBrowseStatsToken(): string | undefined {
  return process.env.GLASS_BROWSE_STATS_TOKEN?.trim() || undefined;
}

/** Full funnel stats require GLASS_BROWSE_STATS_TOKEN (Bearer or ?token=). */
export function isAuthorizedGlassBrowseStats(req: Request): boolean {
  const token = glassBrowseStatsToken();
  if (!token) return false;

  const authHeader = req.get("authorization");
  if (authHeader?.startsWith("Bearer ") && authHeader.slice(7).trim() === token) {
    return true;
  }

  const queryToken = typeof req.query.token === "string" ? req.query.token.trim() : "";
  return queryToken.length > 0 && queryToken === token;
}

export async function getGlassBrowseSocialProof(): Promise<GlassBrowseSocialProof> {
  const stats = await getGlassBrowseStats();
  return { entered: stats.entered };
}

function isGlassBrowseEventType(value: string): value is GlassBrowseEventType {
  return (GLASS_BROWSE_EVENT_TYPES as readonly string[]).includes(value);
}

async function ensureEventsFile(): Promise<void> {
  await fs.mkdir(path.dirname(EVENTS_FILE), { recursive: true });
  try {
    await fs.access(EVENTS_FILE);
  } catch {
    await fs.writeFile(EVENTS_FILE, "", "utf8");
  }
}

export async function appendGlassBrowseEvent(
  event: GlassBrowseEventType,
  metadata?: Record<string, string>,
): Promise<GlassBrowseEvent> {
  await ensureEventsFile();
  const entry: GlassBrowseEvent = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    timestamp: new Date().toISOString(),
    event,
    metadata: metadata && Object.keys(metadata).length > 0 ? metadata : undefined,
  };
  await fs.appendFile(EVENTS_FILE, `${JSON.stringify(entry)}\n`, "utf8");
  return entry;
}

export function parseGlassBrowseEventPayload(body: unknown): {
  event: GlassBrowseEventType;
  metadata?: Record<string, string>;
} | null {
  if (!body || typeof body !== "object") return null;
  const { event, metadata } = body as { event?: string; metadata?: unknown };
  if (!event || !isGlassBrowseEventType(event)) return null;

  if (metadata == null) return { event };
  if (typeof metadata !== "object" || Array.isArray(metadata)) return null;

  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim().slice(0, 120);
    if (trimmed) clean[key.slice(0, 40)] = trimmed;
  }

  return { event, metadata: Object.keys(clean).length > 0 ? clean : undefined };
}

export async function getGlassBrowseStats(): Promise<GlassBrowseStats> {
  await ensureEventsFile();
  const raw = await fs.readFile(EVENTS_FILE, "utf8");
  const counts: Record<GlassBrowseEventType, number> = {
    page_view: 0,
    entered: 0,
    command: 0,
    auto_exit: 0,
    manual_exit: 0,
    mobile_preview: 0,
  };

  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as { event?: string };
      if (parsed.event && isGlassBrowseEventType(parsed.event)) {
        counts[parsed.event] += 1;
      }
    } catch {
      /* skip malformed lines */
    }
  }

  const entered = counts.entered;
  return {
    pageViews: counts.page_view,
    entered,
    commanded: counts.command,
    autoExit: counts.auto_exit,
    manualExit: counts.manual_exit,
    mobilePreview: counts.mobile_preview,
    commandRate: entered > 0 ? counts.command / entered : null,
    autoExitRate: entered > 0 ? counts.auto_exit / entered : null,
    manualExitRate: entered > 0 ? counts.manual_exit / entered : null,
  };
}
