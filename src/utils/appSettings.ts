import type { MemoryMode } from "../types/memory";
import { DEFAULT_APP_SETTINGS, type AppSettings } from "../types/settings";

export const APP_SETTINGS_KEY = "iivo-app-settings";

export function loadAppSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(APP_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_APP_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      useMemoryInResponses:
        parsed.useMemoryInResponses ?? DEFAULT_APP_SETTINGS.useMemoryInResponses,
      autoIncludeRelevantMemory:
        parsed.autoIncludeRelevantMemory ?? DEFAULT_APP_SETTINGS.autoIncludeRelevantMemory,
      suggestedMemory: parsed.suggestedMemory ?? DEFAULT_APP_SETTINGS.suggestedMemory,
    };
  } catch {
    return { ...DEFAULT_APP_SETTINGS };
  }
}

export function saveAppSettings(settings: AppSettings): void {
  localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(settings));
}

export function resolveMemoryMode(settings: AppSettings): MemoryMode {
  if (!settings.useMemoryInResponses) return "off";
  if (!settings.autoIncludeRelevantMemory) return "manual";
  return "auto";
}
