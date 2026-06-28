/**
 * Session authority for bounded computer-operator loops.
 */

import { randomUUID } from "node:crypto";
import type { ComputerOperatorPlan } from "./aletheiaConversationPlanner.ts";
import { formatComputerOperatorPlanDeclaration } from "./aletheiaConversationPlanner.ts";
import type { OperatorAction, OperatorActionKind } from "./aletheiaComputerOperatorTypes.ts";

export interface ComputerOperatorSessionGrant {
  grantId: string;
  loopId: string;
  declaration: string;
  targetApps: string[];
  allowedActions: OperatorActionKind[];
  maxSteps: number;
  forbiddenPatterns: string[];
  grantedAt?: number;
  grantedBy?: string;
}

export interface ComputerOperatorPersistentGrant {
  id: string;
  targetApp: string;
  allowedActions: OperatorActionKind[];
  scope: string;
  maxSteps: number;
  declaration: string;
  createdAt: number;
}

/** Always enforced — persisted grants cannot override these. */
export const COMPUTER_OPERATOR_FORBIDDEN_PATTERNS = [
  "send",
  "delete",
  "remove",
  "post",
  "submit",
  "pay",
  "purchase",
  "close",
  "shutdown",
  "erase",
  "format",
  "uninstall",
] as const;

const DEFAULT_FORBIDDEN = [...COMPUTER_OPERATOR_FORBIDDEN_PATTERNS];

export function primaryTargetApp(plan: ComputerOperatorPlan): string {
  return plan.targetApps[0] ?? "frontmost app";
}

export function buildSessionGrantFromPlan(
  plan: ComputerOperatorPlan,
  loopId: string,
): ComputerOperatorSessionGrant {
  return {
    grantId: randomUUID(),
    loopId,
    declaration: formatComputerOperatorPlanDeclaration(plan),
    targetApps: [...plan.targetApps],
    allowedActions: [...plan.allowedActions],
    maxSteps: plan.stepBudget,
    forbiddenPatterns: [...DEFAULT_FORBIDDEN],
  };
}

export function grantComputerOperatorSession(
  grant: ComputerOperatorSessionGrant,
  grantedBy: string,
): ComputerOperatorSessionGrant {
  return {
    ...grant,
    grantedAt: Date.now(),
    grantedBy,
  };
}

export function isSessionGrantActive(grant: ComputerOperatorSessionGrant | undefined): boolean {
  return Boolean(grant?.grantedAt);
}

export function buildPersistentGrantFromPlan(
  plan: ComputerOperatorPlan,
): Omit<ComputerOperatorPersistentGrant, "id" | "createdAt"> {
  return {
    targetApp: primaryTargetApp(plan),
    allowedActions: [...plan.allowedActions],
    scope: plan.scope,
    maxSteps: plan.stepBudget,
    declaration: formatComputerOperatorPlanDeclaration(plan),
  };
}

/** Match a saved always-allow grant to the current plan (exact scope, same primary app). */
export function findMatchingPersistentGrant(
  plan: ComputerOperatorPlan,
  grants: ComputerOperatorPersistentGrant[],
): ComputerOperatorPersistentGrant | undefined {
  if (!plan.targetApps.length) return undefined;
  return grants.find((grant) => persistentGrantMatchesPlan(plan, grant));
}

export function persistentGrantMatchesPlan(
  plan: ComputerOperatorPlan,
  grant: ComputerOperatorPersistentGrant,
): boolean {
  if (grant.scope !== plan.scope) return false;
  if (grant.maxSteps < plan.stepBudget) return false;
  const appMatch = plan.targetApps.some(
    (app) =>
      app.toLowerCase() === grant.targetApp.toLowerCase()
      || app.toLowerCase().includes(grant.targetApp.toLowerCase())
      || grant.targetApp.toLowerCase().includes(app.toLowerCase()),
  );
  if (!appMatch) return false;
  return plan.allowedActions.every((action) => grant.allowedActions.includes(action));
}

function actionTextForPolicy(action: OperatorAction): string {
  return [
    action.kind,
    action.app ?? "",
    action.text ?? "",
    action.url ?? "",
    action.keys ?? "",
    action.reason ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

/** Enforce bounded session rules before executing an operator action. */
export function isOperatorActionAllowedByGrant(
  action: OperatorAction,
  grant: ComputerOperatorSessionGrant,
): { ok: true } | { ok: false; reason: string } {
  if (!grant.grantedAt) {
    return { ok: false, reason: "Computer operator session not granted yet." };
  }

  if (!grant.allowedActions.includes(action.kind)) {
    return { ok: false, reason: `Action ${action.kind} is outside the granted action set.` };
  }

  if (action.app && grant.targetApps.length > 0) {
    const allowed = grant.targetApps.some(
      (app) =>
        action.app!.toLowerCase().includes(app.toLowerCase())
        || app.toLowerCase().includes(action.app!.toLowerCase()),
    );
    if (!allowed) {
      return { ok: false, reason: `App ${action.app} is outside session target apps.` };
    }
  }

  const blob = actionTextForPolicy(action);
  for (const pattern of COMPUTER_OPERATOR_FORBIDDEN_PATTERNS) {
    if (blob.includes(pattern.toLowerCase())) {
      return { ok: false, reason: `Action blocked by session policy (forbidden: ${pattern}).` };
    }
  }

  return { ok: true };
}
