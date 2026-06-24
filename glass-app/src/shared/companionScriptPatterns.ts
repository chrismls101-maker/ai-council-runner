/**
 * Glass Companion — multi-step script request detection (Phase 4b).
 */

export const COMPANION_SCRIPT_REQUEST_PATTERNS: RegExp[] = [
  /\bwalk me through\b/i,
  /\bstep by step\b/i,
  /\bshow me how to\b/i,
  /\bguide me through\b/i,
  /\btake me through\b/i,
  /\bhow do i (?:submit|fill|complete|finish|send|save)\b/i,
  /\bstep[- ]by[- ]step\b/i,
];

export function promptRequestsCompanionScript(prompt: string): boolean {
  const text = prompt.trim();
  if (!text) return false;
  return COMPANION_SCRIPT_REQUEST_PATTERNS.some((re) => re.test(text));
}
