/** Persisted workspace preset selection (Configure pill). */

export const SELECTED_PRESET_STORAGE_KEY = "iivo_selected_preset_v2";
const LEGACY_PRESET_STORAGE_KEY = "iivo_selected_preset";
const PRESET_MIGRATION_KEY = "iivo_preset_neutral_migration_v1";

export type SelectedPresetId = "none" | "ai-front-desk-sales-test";

const VALID_PRESETS = new Set<string>(["none", "ai-front-desk-sales-test"]);

export function normalizePresetId(raw: string | null | undefined): SelectedPresetId {
  if (!raw || raw === "none") return "none";
  if (raw === "ai-front-desk-sales-test") return "ai-front-desk-sales-test";
  return "none";
}

/** One-time migration: old app defaulted to AI Front Desk in memory without user intent. */
function runStaleFrontDeskMigration(): void {
  try {
    if (localStorage.getItem(PRESET_MIGRATION_KEY) === "1") return;
    localStorage.setItem(PRESET_MIGRATION_KEY, "1");

    const v2 = localStorage.getItem(SELECTED_PRESET_STORAGE_KEY);
    const legacy = localStorage.getItem(LEGACY_PRESET_STORAGE_KEY);
    const shouldReset =
      v2 === "ai-front-desk-sales-test" ||
      legacy === "ai-front-desk-sales-test" ||
      (v2 == null && legacy == null);

    if (shouldReset) {
      localStorage.setItem(SELECTED_PRESET_STORAGE_KEY, "none");
      localStorage.removeItem(LEGACY_PRESET_STORAGE_KEY);
    }
  } catch {
    /* storage unavailable */
  }
}

export function loadSelectedPreset(): SelectedPresetId {
  try {
    runStaleFrontDeskMigration();
    const stored = localStorage.getItem(SELECTED_PRESET_STORAGE_KEY);
    if (stored != null && VALID_PRESETS.has(stored)) {
      return normalizePresetId(stored);
    }
    const legacy = localStorage.getItem(LEGACY_PRESET_STORAGE_KEY);
    if (legacy != null && VALID_PRESETS.has(legacy)) {
      const normalized = normalizePresetId(legacy);
      saveSelectedPreset(normalized);
      return normalized;
    }
  } catch {
    /* ignore */
  }
  return "none";
}

export function saveSelectedPreset(preset: string): void {
  try {
    const normalized = normalizePresetId(preset);
    localStorage.setItem(SELECTED_PRESET_STORAGE_KEY, normalized);
    localStorage.removeItem(LEGACY_PRESET_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function clearSelectedPreset(): void {
  saveSelectedPreset("none");
}

/** Playwright / QA: force neutral preset before navigation. */
export function qaNeutralPresetInitScript(): void {
  try {
    localStorage.setItem(SELECTED_PRESET_STORAGE_KEY, "none");
    localStorage.setItem(PRESET_MIGRATION_KEY, "1");
    localStorage.removeItem(LEGACY_PRESET_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
