/**
 * Allowlisted shell commands for Glass Coder `run_project_command` tool.
 */

const ALLOWED_PATTERNS: RegExp[] = [
  /^npm run typecheck$/,
  /^npm run build$/,
  /^npm test$/,
  /^npm run test$/,
  /^npm run lint$/,
  /^npx tsc --noEmit$/,
  /^git status$/,
  /^git diff$/,
  /^git diff --stat$/,
  /^git diff HEAD$/,
  /^git diff --stat HEAD$/,
];

export function isAllowedCoderProjectCommand(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed || trimmed.length > 200) return false;
  if (/[;&|><`$]/.test(trimmed)) return false;
  return ALLOWED_PATTERNS.some((re) => re.test(trimmed));
}
