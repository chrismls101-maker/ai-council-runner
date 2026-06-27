/**
 * AletheiaAuthorityGate — pure scope + confirmation checks (P0.1 Binding).
 *
 * Every action must pass scope validation and explicit user confirmation
 * before the execution layer runs. No side effects; safe to unit test.
 */

import type { ActionConfirmation, ActionIntent } from "./aletheiaExecution.ts";
import * as path from "node:path";
import * as os from "node:os";

export type AuthorityGateResult =
  | { ok: true }
  | { ok: false; reason: string };

function expandPath(filePath: string): string {
  if (filePath.startsWith("~/")) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  return filePath;
}

/** Enforce declared scope boundaries on the intent payload. */
export function validateActionScope(intent: ActionIntent): AuthorityGateResult {
  const { scope, payload, kind } = intent;

  if (kind === "file-write" || kind === "file-apply") {
    const targetPath = typeof payload.path === "string" ? payload.path : "";
    if (!targetPath.trim()) {
      return { ok: false, reason: "File action missing target path." };
    }
    const resolved = path.resolve(expandPath(targetPath));
    if (scope.allowedPaths?.length) {
      const allowed = scope.allowedPaths.some((p) => {
        const rp = path.resolve(expandPath(p));
        return resolved === rp || resolved.startsWith(rp + path.sep);
      });
      if (!allowed) {
        return { ok: false, reason: `Path ${targetPath} is outside the declared action scope.` };
      }
    }
    if (scope.allowedPrefixes?.length) {
      const allowed = scope.allowedPrefixes.some((prefix) => resolved.startsWith(expandPath(prefix)));
      if (!allowed) {
        return { ok: false, reason: `Path ${targetPath} is outside allowed prefixes.` };
      }
    }
  }

  if (kind === "keystroke") {
    const text = typeof payload.text === "string" ? payload.text : "";
    if (!text.length) {
      return { ok: false, reason: "Keystroke action missing text payload." };
    }
    const maxChars = typeof payload.maxChars === "number" ? payload.maxChars : 50_000;
    if (text.length > maxChars) {
      return { ok: false, reason: `Keystroke payload exceeds scope limit (${maxChars} chars).` };
    }
    if (scope.targetApp && payload.targetApp && scope.targetApp !== payload.targetApp) {
      return { ok: false, reason: `Target app ${String(payload.targetApp)} is outside declared scope.` };
    }
  }

  if (kind === "shell") {
    const cmd = typeof payload.command === "string" ? payload.command : "";
    if (!cmd.trim()) {
      return { ok: false, reason: "Shell action missing command." };
    }
  }

  return { ok: true };
}

/** Require explicit confirmation before execution. */
export function assertConfirmedForExecution(
  intent: ActionIntent,
  confirmation: ActionConfirmation | undefined,
): AuthorityGateResult {
  if (!confirmation) {
    return { ok: false, reason: "Action awaiting user confirmation." };
  }
  if (confirmation.intentId !== intent.id) {
    return { ok: false, reason: "Confirmation does not match this action intent." };
  }
  return { ok: true };
}

/** Full gate: scope + confirmation. Deployed Execution accepts founder-auto confirmation. */
export function passAuthorityGate(
  intent: ActionIntent,
  confirmation: ActionConfirmation | undefined,
  options?: { deployedExecutionActive?: boolean },
): AuthorityGateResult {
  const scope = validateActionScope(intent);
  if (!scope.ok) return scope;

  if (confirmation?.confirmedBy === "founder-auto") {
    if (!options?.deployedExecutionActive) {
      return { ok: false, reason: "Founder-auto confirmation requires Deployed Execution." };
    }
    if (confirmation.intentId !== intent.id) {
      return { ok: false, reason: "Confirmation does not match this action intent." };
    }
    return { ok: true };
  }

  return assertConfirmedForExecution(intent, confirmation);
}
