/**
 * Custom commands loader for IIVO Glass (#165).
 *
 * Reads ~/.iivo/glass-commands.json on startup and hot-reloads it whenever
 * the file changes. Invalid entries are skipped; errors are logged to the
 * Glass console but never crash the app.
 */

import fsp from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  validateCustomCommands,
  CUSTOM_COMMANDS_DIR,
  CUSTOM_COMMANDS_FILENAME,
  type CustomCommand,
} from "../shared/customCommands.ts";

// ── Config path ───────────────────────────────────────────────────────────────

export function getCustomCommandsPath(): string {
  return path.join(os.homedir(), CUSTOM_COMMANDS_DIR, CUSTOM_COMMANDS_FILENAME);
}

// ── Load ──────────────────────────────────────────────────────────────────────

export interface LoadResult {
  commands: CustomCommand[];
  /** Validation warnings/errors (non-fatal — valid commands still loaded). */
  warnings: string[];
}

/**
 * Read and validate the custom commands config file.
 * Returns { commands: [], warnings: [] } if the file does not exist (not an error).
 * Never throws.
 */
export async function loadCustomCommands(): Promise<LoadResult> {
  const filePath = getCustomCommandsPath();

  let raw: string;
  try {
    raw = await fsp.readFile(filePath, "utf-8");
  } catch (err: unknown) {
    // File not found is normal — user hasn't created it yet
    if (isNodeError(err) && err.code === "ENOENT") {
      return { commands: [], warnings: [] };
    }
    return {
      commands: [],
      warnings: [`Could not read ${filePath}: ${String(err)}`],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      commands: [],
      warnings: [`${filePath} is not valid JSON — custom commands not loaded`],
    };
  }

  const { valid, errors } = validateCustomCommands(parsed);
  return { commands: valid, warnings: errors };
}

// ── Watch ─────────────────────────────────────────────────────────────────────

/**
 * Watch ~/.iivo/glass-commands.json for changes.
 * Calls onChange(result) immediately on start (to populate initial state)
 * and again whenever the file is created, modified, or deleted.
 *
 * Returns a cleanup function that stops watching.
 * Never throws — errors are silently absorbed.
 */
export function watchCustomCommands(
  onChange: (result: LoadResult) => void,
): () => void {
  const filePath = getCustomCommandsPath();
  const dir = path.dirname(filePath);

  // Load immediately
  void loadCustomCommands().then(onChange);

  // Ensure the ~/.iivo directory exists before watching it
  // (fs.watch on a nonexistent dir would throw)
  let watcher: fs.FSWatcher | null = null;

  ensureDirExists(dir)
    .then(() => {
      try {
        // Watch the directory so we catch file creation too
        watcher = fs.watch(dir, { persistent: false }, (eventType, filename) => {
          if (filename !== CUSTOM_COMMANDS_FILENAME) return;
          // Debounce — editors may fire multiple events on a single save
          void debounceLoad(onChange);
        });
        watcher.on("error", () => {
          // Silently ignore watch errors (permissions, unmount, etc.)
        });
      } catch {
        // fs.watch unavailable (some sandboxed environments) — degraded to load-once
      }
    })
    .catch(() => {
      // dir creation failed — no hot-reload, but initial load still happened
    });

  return () => {
    watcher?.close();
    watcher = null;
    clearDebounce();
  };
}

// ── Debounce ──────────────────────────────────────────────────────────────────

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 300;

function debounceLoad(onChange: (result: LoadResult) => void): Promise<void> {
  if (debounceTimer !== null) clearTimeout(debounceTimer);
  return new Promise((resolve) => {
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void loadCustomCommands().then((result) => {
        onChange(result);
        resolve();
      });
    }, DEBOUNCE_MS);
  });
}

function clearDebounce(): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function ensureDirExists(dir: string): Promise<void> {
  try {
    await fsp.mkdir(dir, { recursive: true });
  } catch {
    // Already exists or permission error — either way continue
  }
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return typeof err === "object" && err !== null && "code" in err;
}
