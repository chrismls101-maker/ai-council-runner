import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import type { AuditEventType, AuditLogEntry, AuditLogFile } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUDIT_DIR = path.resolve(__dirname, "../../../data/audit");
const AUDIT_FILE = path.join(AUDIT_DIR, "audit-log.json");

const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9]{10,}/i,
  /api[_-]?key/i,
  /password/i,
  /secret/i,
  /Bearer\s+/i,
];

function sanitizeMetadata(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  let text = value.trim().slice(0, 500);
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(text)) {
      return "[redacted]";
    }
  }
  return text;
}

async function ensureAuditDir(): Promise<void> {
  await fs.mkdir(AUDIT_DIR, { recursive: true });
}

async function readLog(): Promise<AuditLogFile> {
  await ensureAuditDir();
  try {
    const raw = await fs.readFile(AUDIT_FILE, "utf-8");
    const parsed = JSON.parse(raw) as AuditLogFile;
    return { entries: parsed.entries ?? [] };
  } catch {
    return { entries: [] };
  }
}

async function writeLog(file: AuditLogFile): Promise<void> {
  await ensureAuditDir();
  await fs.writeFile(AUDIT_FILE, JSON.stringify(file, null, 2));
}

export async function appendAuditEvent(input: {
  eventType: AuditEventType;
  runId?: string;
  memoryId?: string;
  metadata?: string;
}): Promise<AuditLogEntry> {
  const file = await readLog();
  const entry: AuditLogEntry = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    eventType: input.eventType,
    runId: input.runId,
    memoryId: input.memoryId,
    metadata: sanitizeMetadata(input.metadata),
  };
  file.entries.push(entry);
  if (file.entries.length > 5000) {
    file.entries = file.entries.slice(-5000);
  }
  await writeLog(file);
  return entry;
}

export async function listAuditEvents(limit = 500): Promise<AuditLogEntry[]> {
  const file = await readLog();
  return file.entries
    .slice()
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, limit);
}

export async function exportAuditLog(): Promise<AuditLogFile> {
  return readLog();
}

export async function clearAuditLog(): Promise<number> {
  const file = await readLog();
  const count = file.entries.length;
  await writeLog({ entries: [] });
  return count;
}

export const CLIENT_AUDIT_EVENTS: AuditEventType[] = [
  "settings_updated",
  "decision_review_started",
  "usage_exported",
];

export function isClientAuditEvent(type: string): type is AuditEventType {
  return CLIENT_AUDIT_EVENTS.includes(type as AuditEventType);
}
