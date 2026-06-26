/**
 * aletheiaAuthority.test.ts
 * --------------------------
 * Unit tests for the Aletheia authority allowlist.
 *
 * Covers:
 *   - Every ALETHEIA_ALLOWED_COMMANDS entry passes isAletheiaAllowed()
 *   - Every ALETHEIA_BLOCKED_COMMANDS entry fails isAletheiaAllowed()
 *   - Unknown commands fail isAletheiaAllowed()
 *   - assertAletheiaAllowed() throws on blocked commands (with "Glass-privileged" message)
 *   - assertAletheiaAllowed() throws on unknown commands (with different message text)
 *   - assertAletheiaAllowed() does NOT throw on allowed commands
 *   - Message text distinction: blocked vs unknown
 *
 * Run with: node --experimental-strip-types --test src/test/aletheiaAuthority.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALETHEIA_ALLOWED_COMMANDS,
  ALETHEIA_BLOCKED_COMMANDS,
  isAletheiaAllowed,
  assertAletheiaAllowed,
} from "../shared/aletheiaAuthority.ts";

// ---------------------------------------------------------------------------
// isAletheiaAllowed — allowed commands
// ---------------------------------------------------------------------------

test("isAletheiaAllowed returns true for every command in ALETHEIA_ALLOWED_COMMANDS", () => {
  for (const cmd of ALETHEIA_ALLOWED_COMMANDS) {
    assert.equal(
      isAletheiaAllowed(cmd),
      true,
      `Expected isAletheiaAllowed("${cmd}") to return true`,
    );
  }
});

test("isAletheiaAllowed returns true for toggle-companion-mode", () => {
  assert.equal(isAletheiaAllowed("toggle-companion-mode"), true);
});

test("isAletheiaAllowed returns true for stop-everything", () => {
  assert.equal(isAletheiaAllowed("stop-everything"), true);
});

test("isAletheiaAllowed returns true for companion-privacy-start", () => {
  assert.equal(isAletheiaAllowed("companion-privacy-start"), true);
});

test("isAletheiaAllowed returns true for companion-privacy-end", () => {
  assert.equal(isAletheiaAllowed("companion-privacy-end"), true);
});

test("isAletheiaAllowed returns true for open-glass-setup", () => {
  assert.equal(isAletheiaAllowed("open-glass-setup"), true);
});

test("isAletheiaAllowed returns true for open-glass-memory", () => {
  assert.equal(isAletheiaAllowed("open-glass-memory"), true);
});

// ---------------------------------------------------------------------------
// isAletheiaAllowed — blocked commands
// ---------------------------------------------------------------------------

test("isAletheiaAllowed returns false for every command in ALETHEIA_BLOCKED_COMMANDS", () => {
  for (const cmd of ALETHEIA_BLOCKED_COMMANDS) {
    assert.equal(
      isAletheiaAllowed(cmd),
      false,
      `Expected isAletheiaAllowed("${cmd}") to return false`,
    );
  }
});

test("isAletheiaAllowed returns false for save-api-key", () => {
  assert.equal(isAletheiaAllowed("save-api-key"), false);
});

test("isAletheiaAllowed returns false for delete-api-key", () => {
  assert.equal(isAletheiaAllowed("delete-api-key"), false);
});

test("isAletheiaAllowed returns false for get-api-keys", () => {
  assert.equal(isAletheiaAllowed("get-api-keys"), false);
});

test("isAletheiaAllowed returns false for get-spend-summary", () => {
  assert.equal(isAletheiaAllowed("get-spend-summary"), false);
});

test("isAletheiaAllowed returns false for get-model-calls", () => {
  assert.equal(isAletheiaAllowed("get-model-calls"), false);
});

test("isAletheiaAllowed returns false for get-user-context", () => {
  assert.equal(isAletheiaAllowed("get-user-context"), false);
});

test("isAletheiaAllowed returns false for delete-user-context-key", () => {
  assert.equal(isAletheiaAllowed("delete-user-context-key"), false);
});

test("isAletheiaAllowed returns false for get-recent-sessions", () => {
  assert.equal(isAletheiaAllowed("get-recent-sessions"), false);
});

test("isAletheiaAllowed returns false for get-session-messages", () => {
  assert.equal(isAletheiaAllowed("get-session-messages"), false);
});

test("isAletheiaAllowed returns false for get-last-council-run", () => {
  assert.equal(isAletheiaAllowed("get-last-council-run"), false);
});

test("isAletheiaAllowed returns false for agent-run", () => {
  assert.equal(isAletheiaAllowed("agent-run"), false);
});

test("isAletheiaAllowed returns false for agent-cancel", () => {
  assert.equal(isAletheiaAllowed("agent-cancel"), false);
});

test("isAletheiaAllowed returns false for terminal-execute", () => {
  assert.equal(isAletheiaAllowed("terminal-execute"), false);
});

test("isAletheiaAllowed returns false for coder-apply-diff", () => {
  assert.equal(isAletheiaAllowed("coder-apply-diff"), false);
});

test("isAletheiaAllowed returns false for toggle-founder-mode", () => {
  assert.equal(isAletheiaAllowed("toggle-founder-mode"), false);
});

test("isAletheiaAllowed returns false for set-server-runtime-flag", () => {
  assert.equal(isAletheiaAllowed("set-server-runtime-flag"), false);
});

test("isAletheiaAllowed returns false for get-agent-runs-by-correlation", () => {
  assert.equal(isAletheiaAllowed("get-agent-runs-by-correlation"), false);
});

// ---------------------------------------------------------------------------
// isAletheiaAllowed — unknown commands
// ---------------------------------------------------------------------------

test("isAletheiaAllowed returns false for unknown command strings", () => {
  assert.equal(isAletheiaAllowed(""), false);
  assert.equal(isAletheiaAllowed("glass:command"), false);
  assert.equal(isAletheiaAllowed("open-glass-dashboard"), false);
  assert.equal(isAletheiaAllowed("agent-stop"), false);
  assert.equal(isAletheiaAllowed("session-start"), false);
  assert.equal(isAletheiaAllowed("some-random-command"), false);
});

test("isAletheiaAllowed returns false for commands that look almost right", () => {
  // Ensure no prefix/suffix bypasses the exact-match check
  assert.equal(isAletheiaAllowed("toggle-companion-mode-extra"), false);
  assert.equal(isAletheiaAllowed(" toggle-companion-mode"), false);
  assert.equal(isAletheiaAllowed("toggle-companion-mode "), false);
  assert.equal(isAletheiaAllowed("TOGGLE-COMPANION-MODE"), false);
});

// ---------------------------------------------------------------------------
// assertAletheiaAllowed — allowed commands (must not throw)
// ---------------------------------------------------------------------------

test("assertAletheiaAllowed does not throw for any command in ALETHEIA_ALLOWED_COMMANDS", () => {
  for (const cmd of ALETHEIA_ALLOWED_COMMANDS) {
    assert.doesNotThrow(
      () => assertAletheiaAllowed(cmd),
      `assertAletheiaAllowed("${cmd}") should not throw`,
    );
  }
});

test("assertAletheiaAllowed does not throw for toggle-companion-mode", () => {
  assert.doesNotThrow(() => assertAletheiaAllowed("toggle-companion-mode"));
});

test("assertAletheiaAllowed does not throw for stop-everything", () => {
  assert.doesNotThrow(() => assertAletheiaAllowed("stop-everything"));
});

test("assertAletheiaAllowed does not throw for companion-privacy-start", () => {
  assert.doesNotThrow(() => assertAletheiaAllowed("companion-privacy-start"));
});

test("assertAletheiaAllowed does not throw for companion-privacy-end", () => {
  assert.doesNotThrow(() => assertAletheiaAllowed("companion-privacy-end"));
});

test("assertAletheiaAllowed does not throw for open-glass-setup", () => {
  assert.doesNotThrow(() => assertAletheiaAllowed("open-glass-setup"));
});

test("assertAletheiaAllowed does not throw for open-glass-memory", () => {
  assert.doesNotThrow(() => assertAletheiaAllowed("open-glass-memory"));
});

// ---------------------------------------------------------------------------
// assertAletheiaAllowed — blocked commands (must throw with "Glass-privileged")
// ---------------------------------------------------------------------------

test("assertAletheiaAllowed throws for every command in ALETHEIA_BLOCKED_COMMANDS", () => {
  for (const cmd of ALETHEIA_BLOCKED_COMMANDS) {
    assert.throws(
      () => assertAletheiaAllowed(cmd),
      (err: unknown) => err instanceof Error,
      `assertAletheiaAllowed("${cmd}") should throw`,
    );
  }
});

test("assertAletheiaAllowed throws an Error (not a string) for blocked commands", () => {
  assert.throws(
    () => assertAletheiaAllowed("save-api-key"),
    (err: unknown) => err instanceof Error,
  );
});

test('assertAletheiaAllowed error message contains "Glass-privileged" for blocked commands', () => {
  for (const cmd of ALETHEIA_BLOCKED_COMMANDS) {
    try {
      assertAletheiaAllowed(cmd);
      assert.fail(`assertAletheiaAllowed("${cmd}") should have thrown`);
    } catch (err) {
      assert.ok(
        err instanceof Error && err.message.includes("Glass-privileged"),
        `Blocked command "${cmd}" error should mention "Glass-privileged", got: ${String(err)}`,
      );
    }
  }
});

test('assertAletheiaAllowed blocked error message includes the command name', () => {
  const cmd = "terminal-execute";
  try {
    assertAletheiaAllowed(cmd);
    assert.fail("should have thrown");
  } catch (err) {
    assert.ok(err instanceof Error && err.message.includes(cmd));
  }
});

// ---------------------------------------------------------------------------
// assertAletheiaAllowed — unknown commands (must throw with DIFFERENT message)
// ---------------------------------------------------------------------------

test("assertAletheiaAllowed throws for unknown commands", () => {
  assert.throws(() => assertAletheiaAllowed("some-unknown-command"));
  assert.throws(() => assertAletheiaAllowed(""));
  assert.throws(() => assertAletheiaAllowed("open-glass-dashboard"));
});

test('assertAletheiaAllowed unknown command error does NOT contain "Glass-privileged"', () => {
  const unknownCmds = [
    "some-unknown-command",
    "",
    "open-glass-dashboard",
    "agent-stop",
  ];
  for (const cmd of unknownCmds) {
    try {
      assertAletheiaAllowed(cmd);
      assert.fail(`assertAletheiaAllowed("${cmd}") should have thrown`);
    } catch (err) {
      assert.ok(
        err instanceof Error && !err.message.includes("Glass-privileged"),
        `Unknown command "${cmd}" error should NOT say "Glass-privileged", got: ${String(err)}`,
      );
    }
  }
});

test("assertAletheiaAllowed blocked and unknown errors have different message text", () => {
  let blockedMsg = "";
  let unknownMsg = "";

  try {
    assertAletheiaAllowed("save-api-key"); // known blocked
  } catch (err) {
    blockedMsg = err instanceof Error ? err.message : String(err);
  }

  try {
    assertAletheiaAllowed("some-totally-unknown-command"); // not in either set
  } catch (err) {
    unknownMsg = err instanceof Error ? err.message : String(err);
  }

  assert.ok(blockedMsg.length > 0, "blocked command should throw");
  assert.ok(unknownMsg.length > 0, "unknown command should throw");
  assert.notEqual(
    blockedMsg,
    unknownMsg,
    "blocked and unknown error messages must be distinct",
  );
});

// ---------------------------------------------------------------------------
// ALETHEIA_BLOCKED_COMMANDS — completeness spot-checks against IPC constants
// ---------------------------------------------------------------------------
// These tests ensure that Glass-privileged IPC keys the product team has
// identified (council run, spend, agent bus health) are in the blocked set.
// They do NOT import from ipc.ts to avoid cross-module dependencies in tests.

test("ALETHEIA_BLOCKED_COMMANDS includes Glass-privileged spend commands", () => {
  // get-spend-summary and get-model-calls are the blocked aliases
  assert.ok(
    ALETHEIA_BLOCKED_COMMANDS.has("get-spend-summary"),
    "get-spend-summary must be blocked",
  );
  assert.ok(
    ALETHEIA_BLOCKED_COMMANDS.has("get-model-calls"),
    "get-model-calls must be blocked",
  );
});

test("ALETHEIA_BLOCKED_COMMANDS includes council run", () => {
  assert.ok(
    ALETHEIA_BLOCKED_COMMANDS.has("get-last-council-run"),
    "get-last-council-run must be blocked",
  );
});

test("ALETHEIA_BLOCKED_COMMANDS includes agent runs", () => {
  assert.ok(
    ALETHEIA_BLOCKED_COMMANDS.has("agent-run"),
    "agent-run must be blocked",
  );
  assert.ok(
    ALETHEIA_BLOCKED_COMMANDS.has("agent-cancel"),
    "agent-cancel must be blocked",
  );
  assert.ok(
    ALETHEIA_BLOCKED_COMMANDS.has("get-agent-runs-by-correlation"),
    "get-agent-runs-by-correlation must be blocked",
  );
});

test("ALETHEIA_BLOCKED_COMMANDS includes user context delete", () => {
  assert.ok(
    ALETHEIA_BLOCKED_COMMANDS.has("delete-user-context-key"),
    "delete-user-context-key must be blocked",
  );
});

test("ALETHEIA_BLOCKED_COMMANDS includes terminal execution", () => {
  assert.ok(
    ALETHEIA_BLOCKED_COMMANDS.has("terminal-execute"),
    "terminal-execute must be blocked",
  );
});

test("ALETHEIA_BLOCKED_COMMANDS includes API key operations", () => {
  assert.ok(ALETHEIA_BLOCKED_COMMANDS.has("save-api-key"), "save-api-key must be blocked");
  assert.ok(ALETHEIA_BLOCKED_COMMANDS.has("delete-api-key"), "delete-api-key must be blocked");
  assert.ok(ALETHEIA_BLOCKED_COMMANDS.has("get-api-keys"), "get-api-keys must be blocked");
});

test("ALETHEIA_BLOCKED_COMMANDS includes founder mode and runtime flag", () => {
  assert.ok(
    ALETHEIA_BLOCKED_COMMANDS.has("toggle-founder-mode"),
    "toggle-founder-mode must be blocked",
  );
  assert.ok(
    ALETHEIA_BLOCKED_COMMANDS.has("set-server-runtime-flag"),
    "set-server-runtime-flag must be blocked",
  );
});

// ---------------------------------------------------------------------------
// Allowlist/blocklist are disjoint — belt-and-suspenders invariant
// ---------------------------------------------------------------------------

test("ALETHEIA_ALLOWED_COMMANDS and ALETHEIA_BLOCKED_COMMANDS are disjoint", () => {
  for (const cmd of ALETHEIA_ALLOWED_COMMANDS) {
    assert.equal(
      ALETHEIA_BLOCKED_COMMANDS.has(cmd as never),
      false,
      `"${cmd}" appears in both ALLOWED and BLOCKED — sets must be disjoint`,
    );
  }
});

// ---------------------------------------------------------------------------
// dispatchAletheiaCommand delegates to window.__aletheiaDispatch (registered in
// registerAletheiaDispatch.ts). assertAletheiaAllowed() runs in all builds.

test("ALETHEIA_ALLOWED_COMMANDS set is non-empty", () => {
  assert.ok(ALETHEIA_ALLOWED_COMMANDS.size > 0, "allowlist must not be empty");
});

test("ALETHEIA_BLOCKED_COMMANDS set is non-empty", () => {
  assert.ok(ALETHEIA_BLOCKED_COMMANDS.size > 0, "blocked list must not be empty");
});

test("ALETHEIA_BLOCKED_COMMANDS is larger than ALETHEIA_ALLOWED_COMMANDS (Glass owns more commands)", () => {
  assert.ok(
    ALETHEIA_BLOCKED_COMMANDS.size > ALETHEIA_ALLOWED_COMMANDS.size,
    `Expected more blocked (${ALETHEIA_BLOCKED_COMMANDS.size}) than allowed (${ALETHEIA_ALLOWED_COMMANDS.size}) commands`,
  );
});
