/**
 * aletheiaAuthority.ts
 * ---------------------
 * Explicit allowlist of every IPC command the Aletheia dashboard UI
 * may dispatch. All Aletheia dashboard buttons and actions MUST call
 * through `dispatchAletheiaCommand()` — never raw `send()`.
 *
 * Architecture law (Glass_Architecture_Verification_Report.md):
 *   - Aletheia is the public identity and session/control surface.
 *   - Glass is infrastructure and system ops.
 *   - No Aletheia surface may invoke Glass-privileged actions (keys,
 *     spend, council, agents, terminal execution, memory admin).
 *
 * Authority levels:
 *   L0 — observe only (no dispatch)
 *   L1 — surface/suggest (read-only state queries)
 *   L2 — act with per-action user initiation (explicit button press)
 *   L3 — act within active session (user has already activated)
 *   BLOCKED — never callable from Aletheia public UI
 */

/** Commands the Aletheia UI is allowed to dispatch. */
export const ALETHEIA_ALLOWED_COMMANDS = new Set([
  // Session control — L2/L3
  "toggle-companion-mode",      // Activate / Deactivate
  "stop-everything",            // Emergency stop (when agent running)
  "companion-privacy-start",    // Start timed privacy pause
  "companion-privacy-end",      // End privacy pause

  // Navigation — L2 (opens Glass surfaces, never executes privileged ops)
  "open-glass-setup",           // Deep-link to Glass System → Setup
  "open-glass-memory",          // Deep-link to Glass System → Memory

  // B2.1 — advise-then-wait queue (session control, not Glass infra)
  "approve-aletheia-advice",    // User tapped approve on pending advice card
  "dismiss-aletheia-advice",    // User tapped dismiss on pending advice card

  // B2.2 — act-with-confirmation (orchestrator pipeline control)
  "confirm-aletheia-action",    // User confirmed a pending action intent
  "reject-aletheia-action",     // User rejected a pending action intent
  "modify-aletheia-action",     // User revised a pending action before confirm

  // B3.3 — delegated loop decision (session control during multi-step loop)
  "continue-aletheia-loop",     // User chose to continue after a decision point
  "cancel-aletheia-loop",       // User chose to stop the loop

  // B3.4 — research conversation follow-up (session control, not Glass infra)
  "aletheia-research-follow-up", // Summarize / compare / draft from research thread

  // B4.2 — Aletheia session notes (session memory, not Glass admin)
  "add-aletheia-note",
  "update-aletheia-note",
  "delete-aletheia-note",

  // B7 — security hive containment hold (session control, not Glass infra)
  "dismiss-aletheia-security-containment",
] as const);

export type AletheiaAllowedCommand = typeof ALETHEIA_ALLOWED_COMMANDS extends Set<infer T>
  ? T
  : never;

/**
 * Commands that are explicitly BLOCKED from Aletheia surfaces.
 * Listed here for documentation and negative-test coverage.
 * These are Glass-privileged actions; they must never be triggered
 * from the Aletheia dashboard or strip menu.
 */
export const ALETHEIA_BLOCKED_COMMANDS = new Set([
  // Glass infrastructure — never Aletheia
  "save-api-key",
  "delete-api-key",
  "get-api-keys",
  "get-spend-summary",
  "get-model-calls",
  "get-user-context",
  "delete-user-context-key",
  "get-recent-sessions",
  "get-session-messages",
  "get-last-council-run",
  "agent-run",
  "agent-cancel",
  "terminal-execute",           // Terminal command execution — L4, never public
  "coder-apply-diff",
  "toggle-founder-mode",
  "set-server-runtime-flag",
  "get-agent-runs-by-correlation",
] as const);

/**
 * Validates whether a command string is on the Aletheia allowed list.
 * Returns true if allowed, false if blocked or unknown.
 */
export function isAletheiaAllowed(command: string): boolean {
  return ALETHEIA_ALLOWED_COMMANDS.has(command as AletheiaAllowedCommand);
}

/**
 * Validates a command and throws a descriptive error if it is not
 * on the Aletheia allowlist. Use in dashboard IPC handlers.
 */
export function assertAletheiaAllowed(command: string): void {
  if (!isAletheiaAllowed(command)) {
    const blocked = ALETHEIA_BLOCKED_COMMANDS.has(command as never);
    throw new Error(
      blocked
        ? `[aletheiaAuthority] "${command}" is a Glass-privileged command and is blocked from Aletheia surfaces.`
        : `[aletheiaAuthority] "${command}" is not on the Aletheia allowed command list.`
    );
  }
}

/**
 * Type-safe command dispatcher for the Aletheia dashboard.
 * Call this instead of raw `send()` from any Aletheia UI surface.
 *
 * Validates at runtime in ALL builds (dev + production). The TypeScript
 * `AletheiaAllowedCommand` type provides compile-time safety; this runtime
 * check is the second layer that catches any `as unknown as` casts or
 * dynamic-string callers that bypass the type system.
 */
export function dispatchAletheiaCommand(
  command: AletheiaAllowedCommand,
  payload?: Record<string, unknown>
): void {
  // Runtime guard — always on, not dev-only.
  assertAletheiaAllowed(command);
  // Delegate to the sealed renderer-side dispatcher registered at mount.
  // (imported at call site from useGlassState to avoid circular deps)
  if (typeof window !== "undefined" && window.__aletheiaDispatch) {
    window.__aletheiaDispatch(command, payload);
  }
}

// ---------------------------------------------------------------------------
// Window augmentation for renderer-side dispatch registration
// ---------------------------------------------------------------------------
declare global {
  interface Window {
    /** Registered by AletheiaDashboard's renderer at mount time. */
    __aletheiaDispatch?: (command: string, payload?: Record<string, unknown>) => void;
  }
}
