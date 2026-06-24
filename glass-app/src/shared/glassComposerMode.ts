/**
 * Glass Coder composer mode — Agent (writes) vs Plan (read-only exploration).
 */

export type GlassCoderComposerMode = "agent" | "plan";

export const DEFAULT_GLASS_CODER_COMPOSER_MODE: GlassCoderComposerMode = "agent";

export interface GlassCoderComposerModeDef {
  id: GlassCoderComposerMode;
  label: string;
  tooltip: string;
}

export const GLASS_CODER_COMPOSER_MODES: GlassCoderComposerModeDef[] = [
  {
    id: "agent",
    label: "Agent",
    tooltip: "Explore the codebase and apply edits with your approval.",
  },
  {
    id: "plan",
    label: "Plan",
    tooltip: "Read-only exploration — produce an implementation plan without writing files.",
  },
];

export function parseGlassCoderComposerMode(value: unknown): GlassCoderComposerMode {
  return value === "plan" ? "plan" : DEFAULT_GLASS_CODER_COMPOSER_MODE;
}

/** Appended to the coder system prompt in Plan mode. */
export const CODER_PLAN_MODE_SYSTEM_APPENDIX = `
PLAN MODE — read-only:
- Do not call edit_file, create_file, or delete_file.
- Use list_directory, search_files, and read_file to understand the codebase.
- You may run allowlisted verify commands (typecheck, test) when needed to inform the plan.
- End with a structured plan: goal, steps, files to touch, risks, and suggested follow-ups.
- Tell the user they can switch to Agent mode to execute the plan.`.trim();

/** Coder tools available in Plan mode. */
export const CODER_PLAN_MODE_TOOL_NAMES = new Set([
  "read_file",
  "list_directory",
  "search_files",
  "run_project_command",
]);
