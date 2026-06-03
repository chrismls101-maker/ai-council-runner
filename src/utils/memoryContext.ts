import type { MemoryMode } from "../types/memory";

export const SESSION_MEMORY_MODE_KEY = "iivo-memory-mode";
export const SESSION_SELECTED_MEMORIES_KEY = "iivo-selected-memory-ids";

export function loadMemoryMode(): MemoryMode {
  try {
    const raw = localStorage.getItem(SESSION_MEMORY_MODE_KEY);
    if (raw === "off" || raw === "auto" || raw === "manual") return raw;
  } catch {
    /* ignore */
  }
  return "auto";
}

export function saveMemoryMode(mode: MemoryMode): void {
  localStorage.setItem(SESSION_MEMORY_MODE_KEY, mode);
}

export function loadSelectedMemoryIds(): string[] {
  try {
    const raw = localStorage.getItem(SESSION_SELECTED_MEMORIES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSelectedMemoryIds(ids: string[]): void {
  localStorage.setItem(SESSION_SELECTED_MEMORIES_KEY, JSON.stringify(ids));
}
