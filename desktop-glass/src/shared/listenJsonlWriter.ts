/**
 * Append-safe JSONL record helpers for Listen QA output.
 * Pure serialization — scripts call fs append + flush.
 */

export interface JsonlAppendRecord {
  type: string;
  at: string;
  [key: string]: unknown;
}

export function serializeJsonlLine(record: JsonlAppendRecord): string {
  return `${JSON.stringify(record)}\n`;
}

export function parseJsonlLines(content: string): JsonlAppendRecord[] {
  const out: JsonlAppendRecord[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed) as JsonlAppendRecord);
    } catch {
      /* skip corrupt line — partial crash recovery */
    }
  }
  return out;
}

export function jsonlContainsRawAudioOrBase64(content: string): boolean {
  return /base64|audio\/wav|data:image/i.test(content);
}

export function countJsonlRecordsByType(
  records: JsonlAppendRecord[],
  type: string,
): number {
  return records.filter((r) => r.type === type).length;
}
