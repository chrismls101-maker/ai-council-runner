/**
 * Custom slash commands for IIVO Glass (#165).
 *
 * Pure module — no Electron/Node imports. Safe to import in renderer and tests.
 *
 * Users define commands in ~/.iivo/glass-commands.json. Glass hot-reloads the
 * file whenever it changes. Commands appear in the ⌘⇧P powers palette under
 * the "custom" category.
 *
 * Config schema:
 * ```json
 * [
 *   {
 *     "name": "deploy",
 *     "description": "Deploy to staging",
 *     "icon": "⚡",
 *     "action": { "type": "shell", "command": "npm run deploy:staging" }
 *   },
 *   {
 *     "name": "review",
 *     "description": "Review my current code",
 *     "icon": "◈",
 *     "action": { "type": "prompt", "text": "Review the code I'm looking at for bugs." }
 *   },
 *   {
 *     "name": "test",
 *     "description": "Run tests and explain failures",
 *     "icon": "⊕",
 *     "action": {
 *       "type": "shell-then-prompt",
 *       "command": "npm test",
 *       "prompt": "Explain any test failures and suggest fixes:"
 *     }
 *   }
 * ]
 * ```
 */

// ── Action types ──────────────────────────────────────────────────────────────

/** Run a shell command and show output in a Glass feed card. */
export interface CustomCommandActionShell {
  type: "shell";
  /** Shell command string to execute (runs via the user's default shell). */
  command: string;
}

/** Send a preset message to Glass AI. */
export interface CustomCommandActionPrompt {
  type: "prompt";
  /** The message text sent directly to Glass as if the user typed it. */
  text: string;
}

/**
 * Run a shell command, then pass its output to Glass AI for explanation.
 * The AI prompt is prefixed to the shell output automatically.
 */
export interface CustomCommandActionShellThenPrompt {
  type: "shell-then-prompt";
  /** Shell command to run first. */
  command: string;
  /**
   * Prompt sent to Glass after the command finishes.
   * Glass receives: `{prompt}\n\n\`\`\`\n{output}\n\`\`\``
   */
  prompt: string;
}

export type CustomCommandAction =
  | CustomCommandActionShell
  | CustomCommandActionPrompt
  | CustomCommandActionShellThenPrompt;

// ── Command type ──────────────────────────────────────────────────────────────

export interface CustomCommand {
  /**
   * Slash-command name. Used as the palette entry id.
   * Must be lowercase alphanumeric + hyphens only. E.g. "deploy", "run-tests".
   */
  name: string;
  /** One-line description shown in the palette. */
  description: string;
  /**
   * Optional single emoji or symbol displayed as the palette icon.
   * Defaults to "◆" if omitted.
   */
  icon?: string;
  action: CustomCommandAction;
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: CustomCommand[];
  errors: string[];
}

// First and last char must be alphanumeric; hyphens only allowed in the middle
const NAME_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const MAX_COMMANDS = 50;
const MAX_NAME_LEN = 40;
const MAX_DESC_LEN = 120;
const MAX_CMD_LEN = 2000;
const MAX_TEXT_LEN = 4000;

/**
 * Validate a raw parsed JSON value as a CustomCommand array.
 * Returns { valid, errors } — invalid entries are skipped with a message,
 * not a hard failure, so a bad entry doesn't block the rest.
 */
export function validateCustomCommands(raw: unknown): ValidationResult {
  const errors: string[] = [];
  const valid: CustomCommand[] = [];

  if (!Array.isArray(raw)) {
    return { valid: [], errors: ["glass-commands.json must be a JSON array"] };
  }

  if (raw.length > MAX_COMMANDS) {
    errors.push(`Only the first ${MAX_COMMANDS} commands will be loaded (${raw.length} found)`);
  }

  const seen = new Set<string>();

  for (let i = 0; i < Math.min(raw.length, MAX_COMMANDS); i++) {
    const entry = raw[i] as Record<string, unknown> | null | undefined;
    const prefix = `Command [${i}]`;

    if (typeof entry !== "object" || entry === null) {
      errors.push(`${prefix}: must be an object`);
      continue;
    }

    // name
    const name = entry["name"];
    if (typeof name !== "string" || name.length === 0) {
      errors.push(`${prefix}: "name" is required and must be a non-empty string`);
      continue;
    }
    if (!NAME_RE.test(name)) {
      errors.push(`${prefix} "${name}": name must be lowercase alphanumeric/hyphens only`);
      continue;
    }
    if (name.length > MAX_NAME_LEN) {
      errors.push(`${prefix} "${name}": name too long (max ${MAX_NAME_LEN} chars)`);
      continue;
    }
    if (seen.has(name)) {
      errors.push(`${prefix}: duplicate command name "${name}" — skipping`);
      continue;
    }

    // description
    const description = entry["description"];
    if (typeof description !== "string" || description.length === 0) {
      errors.push(`${prefix} "${name}": "description" is required`);
      continue;
    }
    if (description.length > MAX_DESC_LEN) {
      errors.push(`${prefix} "${name}": description too long (max ${MAX_DESC_LEN} chars)`);
      continue;
    }

    // icon (optional)
    const icon = entry["icon"];
    if (icon !== undefined) {
      if (typeof icon !== "string") {
        errors.push(`${prefix} "${name}": "icon" must be a string if provided`);
        continue;
      }
      if (icon.length === 0) {
        errors.push(`${prefix} "${name}": "icon" must not be an empty string`);
        continue;
      }
    }

    // action
    const actionResult = validateAction(entry["action"], name, prefix);
    if (!actionResult.ok) {
      errors.push(actionResult.error);
      continue;
    }

    seen.add(name);
    valid.push({
      name,
      description,
      icon: typeof icon === "string" ? icon : undefined,
      action: actionResult.action,
    });
  }

  return { valid, errors };
}

type ActionParseResult =
  | { ok: true; action: CustomCommandAction }
  | { ok: false; error: string };

function validateAction(
  raw: unknown,
  name: string,
  prefix: string,
): ActionParseResult {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: `${prefix} "${name}": "action" is required and must be an object` };
  }

  const action = raw as Record<string, unknown>;
  const type = action["type"];

  switch (type) {
    case "shell": {
      const command = action["command"];
      if (typeof command !== "string" || command.trim().length === 0) {
        return { ok: false, error: `${prefix} "${name}": shell action requires a non-empty "command"` };
      }
      if (command.length > MAX_CMD_LEN) {
        return { ok: false, error: `${prefix} "${name}": command too long (max ${MAX_CMD_LEN} chars)` };
      }
      return { ok: true, action: { type: "shell", command: command.trim() } };
    }

    case "prompt": {
      const text = action["text"];
      if (typeof text !== "string" || text.trim().length === 0) {
        return { ok: false, error: `${prefix} "${name}": prompt action requires a non-empty "text"` };
      }
      if (text.length > MAX_TEXT_LEN) {
        return { ok: false, error: `${prefix} "${name}": prompt text too long (max ${MAX_TEXT_LEN} chars)` };
      }
      return { ok: true, action: { type: "prompt", text: text.trim() } };
    }

    case "shell-then-prompt": {
      const command = action["command"];
      const prompt = action["prompt"];
      if (typeof command !== "string" || command.trim().length === 0) {
        return { ok: false, error: `${prefix} "${name}": shell-then-prompt requires a non-empty "command"` };
      }
      if (command.length > MAX_CMD_LEN) {
        return { ok: false, error: `${prefix} "${name}": command too long (max ${MAX_CMD_LEN} chars)` };
      }
      if (typeof prompt !== "string" || prompt.trim().length === 0) {
        return { ok: false, error: `${prefix} "${name}": shell-then-prompt requires a non-empty "prompt"` };
      }
      if (prompt.length > MAX_TEXT_LEN) {
        return { ok: false, error: `${prefix} "${name}": prompt text too long (max ${MAX_TEXT_LEN} chars)` };
      }
      return {
        ok: true,
        action: { type: "shell-then-prompt", command: command.trim(), prompt: prompt.trim() },
      };
    }

    default:
      return {
        ok: false,
        error: `${prefix} "${name}": unknown action type "${String(type)}" — must be "shell", "prompt", or "shell-then-prompt"`,
      };
  }
}

// ── Helpers used by renderer ──────────────────────────────────────────────────

/** Default icon used when a custom command omits the icon field. */
export const DEFAULT_CUSTOM_ICON = "◆";

/**
 * Build the AI prompt for a shell-then-prompt command given its output.
 * Format: `{prompt}\n\n\`\`\`\n{output}\n\`\`\``
 */
export function buildShellThenPromptText(promptText: string, output: string): string {
  const trimmed = output.trim();
  if (!trimmed) {
    return promptText + "\n\n(The command produced no output.)";
  }
  return `${promptText}\n\n\`\`\`\n${trimmed}\n\`\`\``;
}

/** The path where Glass looks for custom commands. */
export const CUSTOM_COMMANDS_FILENAME = "glass-commands.json";
export const CUSTOM_COMMANDS_DIR = ".iivo";
