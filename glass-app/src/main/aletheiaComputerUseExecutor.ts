/**
 * Aletheia Computer-Use Router — tier executors (P0.2 Body).
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { injectKeystrokes } from "./glassActions.ts";
import { probeAletheiaOsPermissions } from "./aletheiaPermissionProbe.ts";
import {
  formatComputerUseRouteNarration,
  selectComputerUseRoute,
  type ComputerUseExecutionResult,
  type ComputerUseOperation,
  type ComputerUseRouteDecision,
  type ComputerUseTier,
} from "../shared/aletheiaComputerUseRouter.ts";

const execFileAsync = promisify(execFile);

function isAccessibilityDenied(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /not authorized|assistive access|1002|-1743|-25211/i.test(msg);
}

async function activateAppAppleScript(appName: string): Promise<void> {
  await execFileAsync("osascript", ["-e", `tell application "${appName}" to activate`]);
  await delay(400);
}

async function pressShortcutAppleScript(appName: string, shortcut: string): Promise<void> {
  const processName = appName.replace(/"/g, '\\"');
  if (shortcut === "composer" || shortcut === "cmd-i") {
    await execFileAsync("osascript", [
      "-e",
      `tell application "System Events" to tell process "${processName}" to keystroke "i" using command down`,
    ]);
    return;
  }
  if (shortcut === "cmd-v") {
    await execFileAsync("osascript", [
      "-e",
      `tell application "System Events" to tell process "${processName}" to keystroke "v" using command down`,
    ]);
    return;
  }
  throw new Error(`Unsupported shortcut: ${shortcut}`);
}

async function clickAtCoordinates(x: number, y: number): Promise<void> {
  await execFileAsync("osascript", [
    "-e",
    `tell application "System Events" to click at {${Math.round(x)}, ${Math.round(y)}}`,
  ]);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function executeTier(
  tier: ComputerUseTier,
  input: {
    operation: ComputerUseOperation;
    targetApp?: string;
    text?: string;
    shortcut?: string;
    clickX?: number;
    clickY?: number;
    axLabel?: string;
  },
): Promise<ComputerUseExecutionResult> {
  const methodBase = selectComputerUseRoute({
    operation: input.operation,
    targetApp: input.targetApp,
    accessibilityGranted: probeAletheiaOsPermissions().accessibilityGranted,
    hasAxTarget: Boolean(input.axLabel),
    hasVisionTarget: input.clickX != null && input.clickY != null,
    isPlainText: Boolean(input.text),
  }).method;

  try {
    switch (tier) {
      case "applescript": {
        if (input.targetApp && input.operation !== "click_target") {
          await activateAppAppleScript(input.targetApp);
        }
        if (input.operation === "press_shortcut" && input.targetApp && input.shortcut) {
          await pressShortcutAppleScript(input.targetApp, input.shortcut);
          return {
            ok: true,
            message: `Sent ${input.shortcut} to ${input.targetApp}.`,
            tier,
            method: methodBase,
          };
        }
        if (input.operation === "type_text" && input.text != null) {
          const typed = await injectKeystrokes(input.text);
          return {
            ok: typed.ok,
            message: typed.message,
            tier: "cgevent",
            method: "AppleScript activate + CGEvent type",
          };
        }
        if (input.operation === "activate_app") {
          return {
            ok: true,
            message: input.targetApp ? `Activated ${input.targetApp}.` : "Activate sent.",
            tier,
            method: methodBase,
          };
        }
        break;
      }
      case "cgevent": {
        if (input.operation === "type_text" && input.text != null) {
          if (input.targetApp) {
            try {
              await activateAppAppleScript(input.targetApp);
            } catch {
              /* continue typing into front app */
            }
          }
          const typed = await injectKeystrokes(input.text);
          return {
            ok: typed.ok,
            message: typed.message,
            tier,
            method: "System Events keystroke",
          };
        }
        if (input.operation === "click_target" && input.clickX != null && input.clickY != null) {
          await clickAtCoordinates(input.clickX, input.clickY);
          return {
            ok: true,
            message: `Clicked at (${input.clickX}, ${input.clickY}).`,
            tier,
            method: "Screen coordinate click",
          };
        }
        if (input.operation === "press_shortcut" && input.shortcut) {
          await pressShortcutAppleScript(input.targetApp ?? "System Events", input.shortcut);
          return {
            ok: true,
            message: `Shortcut ${input.shortcut} sent.`,
            tier,
            method: "System Events keystroke",
          };
        }
        break;
      }
      case "accessibility": {
        if (input.operation === "click_target" && input.axLabel) {
          const script = `
tell application "System Events"
  tell (first application process whose frontmost is true)
    try
      click (first UI element of front window whose name contains "${input.axLabel.replace(/"/g, '\\"')}")
      return "ok"
    end try
  end tell
end tell
return "miss"
`;
          const { stdout } = await execFileAsync("osascript", ["-e", script], { timeout: 2500 });
          const ok = stdout.trim() === "ok";
          return {
            ok,
            message: ok ? `Clicked AX target "${input.axLabel}".` : `AX target "${input.axLabel}" not found.`,
            tier,
            method: "AX element click",
          };
        }
        break;
      }
      case "vision": {
        if (input.clickX != null && input.clickY != null) {
          await clickAtCoordinates(input.clickX, input.clickY);
          return {
            ok: true,
            message: `Vision mark click at (${input.clickX}, ${input.clickY}).`,
            tier,
            method: "OmniParser coordinate click",
          };
        }
        return {
          ok: false,
          message: "Vision fallback requires screen coordinates from OmniParser marks.",
          tier,
          method: "OmniParser coordinate click",
        };
      }
      default:
        break;
    }
    return {
      ok: false,
      message: `No executor for tier ${tier} on operation ${input.operation}.`,
      tier,
      method: methodBase,
    };
  } catch (err) {
    const denied = isAccessibilityDenied(err);
    return {
      ok: false,
      message: denied
        ? "macOS Accessibility permission required for computer control."
        : err instanceof Error
          ? err.message
          : String(err),
      tier,
      method: methodBase,
    };
  }
}

export async function executeComputerUse(input: {
  operation: ComputerUseOperation;
  targetApp?: string;
  text?: string;
  shortcut?: string;
  clickX?: number;
  clickY?: number;
  axLabel?: string;
}): Promise<ComputerUseExecutionResult> {
  const accessibilityGranted = probeAletheiaOsPermissions().accessibilityGranted;
  const decision = selectComputerUseRoute({
    operation: input.operation,
    targetApp: input.targetApp,
    accessibilityGranted,
    hasAxTarget: Boolean(input.axLabel),
    hasVisionTarget: input.clickX != null && input.clickY != null,
    isPlainText: Boolean(input.text),
  });

  const primary = await executeTier(decision.tier, input);
  if (primary.ok || !decision.fallbackTier) {
    return primary;
  }

  const fallback = await executeTier(decision.fallbackTier, input);
  return {
    ...fallback,
    fallbackUsed: true,
    message: `${fallback.message} (after ${decision.tier} failed: ${primary.message})`,
  };
}

export async function routeAndTypeText(input: {
  text: string;
  targetApp?: string;
}): Promise<ComputerUseExecutionResult> {
  return executeComputerUse({
    operation: "type_text",
    targetApp: input.targetApp,
    text: input.text,
  });
}

export { formatComputerUseRouteNarration, selectComputerUseRoute };
export type { ComputerUseRouteDecision, ComputerUseExecutionResult };
