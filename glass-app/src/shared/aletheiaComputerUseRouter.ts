/**
 * Aletheia Computer-Use Router — pure route selection (P0.2 Body).
 *
 * Tier order (best → fallback):
 *   1. accessibility — AX / System Events UI element targeting
 *   2. applescript  — app activation + app-specific automation
 *   3. cgevent      — System Events keystroke / click synthesis
 *   4. vision       — OmniParser marks when AX tree is incomplete
 */

export type ComputerUseTier = "accessibility" | "applescript" | "cgevent" | "vision";

export type ComputerUseOperation =
  | "activate_app"
  | "type_text"
  | "press_shortcut"
  | "click_target";

/** Apps with reliable AppleScript activation / automation hooks in Glass today. */
export const APPLESCRIPT_CAPABLE_APPS = new Set([
  "Google Chrome",
  "Chromium",
  "Brave Browser",
  "Microsoft Edge",
  "Safari",
  "Arc",
  "Cursor",
  "Claude",
  "Finder",
  "Mail",
  "Notes",
  "Terminal",
  "iTerm2",
  "System Settings",
  "Figma",
  "Notion",
  "Slack",
]);

export interface ComputerUseRouteInput {
  operation: ComputerUseOperation;
  targetApp?: string;
  frontApp?: string;
  accessibilityGranted: boolean | null;
  /** AX mark or element label resolved for the target. */
  hasAxTarget?: boolean;
  /** OmniParser / vision mark with screen coordinates available. */
  hasVisionTarget?: boolean;
  /** Plain-text typing (vs shortcut chord). */
  isPlainText?: boolean;
}

export interface ComputerUseRouteDecision {
  tier: ComputerUseTier;
  /** Human-readable method label for ledger narration. */
  method: string;
  reason: string;
  /** Secondary tier if primary fails at runtime. */
  fallbackTier?: ComputerUseTier;
}

export interface ComputerUseExecutionResult {
  ok: boolean;
  message: string;
  tier: ComputerUseTier;
  method: string;
  fallbackUsed?: boolean;
}

export function isAppleScriptCapableApp(appName: string | undefined): boolean {
  if (!appName?.trim()) return false;
  const normalized = appName.trim();
  if (APPLESCRIPT_CAPABLE_APPS.has(normalized)) return true;
  return [...APPLESCRIPT_CAPABLE_APPS].some(
    (name) => normalized.toLowerCase() === name.toLowerCase(),
  );
}

export function selectComputerUseRoute(input: ComputerUseRouteInput): ComputerUseRouteDecision {
  const app = input.targetApp?.trim() || input.frontApp?.trim();

  switch (input.operation) {
    case "activate_app":
      return {
        tier: "applescript",
        method: "AppleScript activate",
        reason: app
          ? `Focus ${app} via AppleScript tell application to activate.`
          : "Focus front app via AppleScript.",
        fallbackTier: input.accessibilityGranted ? "accessibility" : undefined,
      };

    case "press_shortcut":
      if (input.accessibilityGranted === true && app && isAppleScriptCapableApp(app)) {
        return {
          tier: "applescript",
          method: "AppleScript process keystroke",
          reason: `Send shortcut to ${app} via System Events process targeting.`,
          fallbackTier: "cgevent",
        };
      }
      return {
        tier: "cgevent",
        method: "System Events keystroke",
        reason: "Send shortcut via CGEvent-style keystroke synthesis.",
        fallbackTier: input.hasVisionTarget ? "vision" : undefined,
      };

    case "click_target":
      if (input.hasAxTarget && input.accessibilityGranted === true) {
        return {
          tier: "accessibility",
          method: "AX element click",
          reason: "Click resolved AX target in front window.",
          fallbackTier: input.hasVisionTarget ? "vision" : "cgevent",
        };
      }
      if (input.hasVisionTarget) {
        return {
          tier: "vision",
          method: "OmniParser coordinate click",
          reason: "AX tree incomplete — click vision mark coordinates.",
          fallbackTier: "cgevent",
        };
      }
      return {
        tier: "cgevent",
        method: "Screen coordinate click",
        reason: "No AX/vision target — attempt coordinate click via System Events.",
        fallbackTier: "vision",
      };

    case "type_text":
    default: {
      if (input.accessibilityGranted === true && app && isAppleScriptCapableApp(app)) {
        return {
          tier: "applescript",
          method: "AppleScript activate + CGEvent type",
          reason: `Activate ${app} then type via System Events keystroke injection.`,
          fallbackTier: "cgevent",
        };
      }
      if (app && isAppleScriptCapableApp(app)) {
        return {
          tier: "applescript",
          method: "AppleScript activate + CGEvent type",
          reason: `Activate ${app} via AppleScript; type text via keystroke synthesis.`,
          fallbackTier: "cgevent",
        };
      }
      return {
        tier: "cgevent",
        method: "System Events keystroke",
        reason: "Type into active app via keystroke synthesis.",
        fallbackTier: input.hasVisionTarget ? "vision" : undefined,
      };
    }
  }
}

export function formatComputerUseRouteNarration(result: ComputerUseExecutionResult): string {
  const via = result.fallbackUsed ? `${result.method} (fallback)` : result.method;
  return result.ok
    ? `Computer-use ${via} succeeded. ${result.message}`
    : `Computer-use ${via} failed. ${result.message}`;
}
