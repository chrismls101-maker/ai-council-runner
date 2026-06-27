/**
 * AletheiaActionExecutor — OS primitive adapter (P0.1 Body bridge).
 *
 * The orchestrator calls this layer only after authority gate approval.
 */

import type { ActionIntent, ActionResult } from "../shared/aletheiaExecution.ts";
import {
  formatComputerUseRouteNarration,
  routeAndTypeText,
} from "./aletheiaComputerUseExecutor.ts";
import { runShellCommand, writeFile } from "./glassActions.ts";

const SHELL_OUTPUT_MAX = 8_000;

function runShellCommandOnce(command: string): Promise<{ ok: boolean; output: string; exitCode: number | null }> {
  return new Promise((resolve) => {
    let output = "";
    const cancel = runShellCommand(
      command,
      (chunk) => {
        if (output.length < SHELL_OUTPUT_MAX) {
          output += chunk;
        }
      },
      (exitCode) => {
        const ok = exitCode === 0;
        resolve({
          ok,
          output: output.trim() || (ok ? "Command completed with no output." : "Command failed."),
          exitCode,
        });
      },
    );
  });
}

export async function executeActionIntent(intent: ActionIntent): Promise<ActionResult> {
  const started = Date.now();
  const base = {
    intentId: intent.id,
    executedAt: started,
    durationMs: 0,
    rollbackAvailable: false,
  };

  try {
    switch (intent.kind) {
      case "file-write": {
        const filePath = String(intent.payload.path ?? "");
        const content = String(intent.payload.content ?? "");
        const result = await writeFile(filePath, content);
        return {
          ...base,
          ok: result.ok,
          output: result.ok ? result.message : undefined,
          errorMessage: result.ok ? undefined : result.message,
          durationMs: Date.now() - started,
        };
      }
      case "keystroke": {
        const targetApp =
          typeof intent.payload.targetApp === "string" ? intent.payload.targetApp : undefined;
        const text = String(intent.payload.text ?? "");
        const routed = await routeAndTypeText({ text, targetApp });
        const narration = formatComputerUseRouteNarration(routed);
        return {
          ...base,
          ok: routed.ok,
          output: routed.ok ? narration : undefined,
          errorMessage: routed.ok ? undefined : narration,
          durationMs: Date.now() - started,
        };
      }
      case "shell": {
        const command = String(intent.payload.command ?? "");
        const result = await runShellCommandOnce(command);
        return {
          ...base,
          ok: result.ok,
          output: result.ok ? result.output : undefined,
          errorMessage: result.ok ? undefined : result.output,
          durationMs: Date.now() - started,
        };
      }
      default:
        return {
          ...base,
          ok: false,
          errorMessage: `Unsupported action kind for P0.1 executor: ${intent.kind}`,
          durationMs: Date.now() - started,
        };
    }
  } catch (err) {
    return {
      ...base,
      ok: false,
      errorMessage: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - started,
    };
  }
}

/** Lightweight post-execution verification for P0.1. */
export async function verifyActionResult(intent: ActionIntent, result: ActionResult): Promise<ActionResult> {
  if (!result.ok) return result;

  if (intent.kind === "file-write") {
    // writeFile already validates path + reports success — treat as verified.
    return result;
  }

  if (intent.kind === "keystroke") {
    // Keystroke injection has no durable artifact to verify — executor ok is sufficient.
    return result;
  }

  if (intent.kind === "shell") {
    return result;
  }

  return result;
}
