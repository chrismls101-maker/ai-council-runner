/**
 * L2.3 Integration tests — agentsAutoActivate flag gate
 *
 * These tests verify the architecture-law described in src/main/index.ts:
 *
 *   "Coder in IDE uses agent narrate without toggling Aletheia companion on.
 *    agentsAutoActivate flag (default: false) guards public builds from
 *    auto-activating companion mode. Must be explicitly enabled server-side."
 *
 * The production code path (index.ts) is too deeply coupled to Electron to
 * unit-test directly, so we test:
 *   1. ServerRuntimeFlags type guarantees — agentsAutoActivate defaults false.
 *   2. The gate predicate logic (extracted below) as a pure function.
 *   3. GlassOnboardingState consent default values (all false).
 *   4. The persistConsentFlags helper merges flags correctly (no store I/O).
 *
 * For the behaviour tests we inline a minimal model of the production code:
 *
 *   function resolveCompanionActivation(agentId, flags) → boolean
 *
 * This is the exact logic on lines 11136-11139 of src/main/index.ts:
 *
 *   if (agentId !== "coder" && state.serverRuntimeFlags?.agentsAutoActivate === true) {
 *     enableCompanionModeForAgent();
 *   }
 *
 * Testing the predicate in isolation gives us fast, deterministic coverage
 * without the Electron boot sequence.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import type { ServerRuntimeFlags } from "../shared/serverRuntimeFlags.ts";
import {
  canActivateMicRecording,
  type GlassConsentSnapshot,
} from "../shared/glassConsentGates.ts";
import {
  DEFAULT_GLASS_ONBOARDING_STATE,
  type GlassOnboardingState,
} from "../shared/glassOnboarding.ts";

// ---------------------------------------------------------------------------
// Minimal model — mirrors the production gate in index.ts lines 11136-11139
// ---------------------------------------------------------------------------

type AgentId = string;

/**
 * Returns true when companion mode SHOULD auto-activate on agent start.
 *
 * Mirrors:
 *   if (agentId !== "coder" && state.serverRuntimeFlags?.agentsAutoActivate === true)
 *     enableCompanionModeForAgent();
 */
function shouldCompanionActivate(
  agentId: AgentId,
  flags: ServerRuntimeFlags | null | undefined,
  consent: GlassConsentSnapshot | null | undefined,
): boolean {
  return (
    agentId !== "coder"
    && flags?.agentsAutoActivate === true
    && canActivateMicRecording(consent)
  );
}

const fullConsent: GlassConsentSnapshot = {
  micAck: true,
  screenAck: true,
  recordingAck: true,
  tosAck: true,
};

function simulateAgentStart(
  agentId: AgentId,
  flags: ServerRuntimeFlags | null | undefined,
  companionAlreadyActive: boolean,
  consent: GlassConsentSnapshot | null | undefined = fullConsent,
): { companionModeActive: boolean; enableCalled: boolean } {
  let companionModeActive = companionAlreadyActive;
  let enableCalled = false;

  if (shouldCompanionActivate(agentId, flags, consent)) {
    if (!companionAlreadyActive) {
      companionModeActive = true;
      enableCalled = true;
    }
  }

  return { companionModeActive, enableCalled };
}

function makeFlags(overrides: Partial<ServerRuntimeFlags> = {}): ServerRuntimeFlags {
  return {
    overlayDemoEnabled: true,
    terminalAutoFixEnabled: true,
    coderBuildLoopEnabledForNewUsers: true,
    aiCallsEnabled: true,
    agentsAutoActivate: false, // safe public default
    minimalPublic: false,      // L3.1: hide strip tabs in public/minimal mode
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("agentsAutoActivate flag gate", () => {
  // ── Flag OFF (public default) ───────────────────────────────────────────

  test("flag OFF: non-coder agent does NOT activate companion mode", () => {
    const flags = makeFlags({ agentsAutoActivate: false });
    const result = simulateAgentStart("research", flags, false);
    assert.equal(result.enableCalled, false, "enableCompanionModeForAgent must not be called");
    assert.equal(result.companionModeActive, false, "companionModeActive must stay false");
  });

  test("flag OFF: writing agent does NOT activate companion mode", () => {
    const flags = makeFlags({ agentsAutoActivate: false });
    const result = simulateAgentStart("writing", flags, false);
    assert.equal(result.enableCalled, false);
    assert.equal(result.companionModeActive, false);
  });

  test("flag OFF: null serverRuntimeFlags does NOT activate companion mode", () => {
    const result = simulateAgentStart("research", null, false);
    assert.equal(result.enableCalled, false);
    assert.equal(result.companionModeActive, false);
  });

  test("flag OFF: undefined serverRuntimeFlags does NOT activate companion mode", () => {
    const result = simulateAgentStart("research", undefined, false);
    assert.equal(result.enableCalled, false);
    assert.equal(result.companionModeActive, false);
  });

  // ── Flag ON ─────────────────────────────────────────────────────────────

  test("flag ON: non-coder agent DOES activate companion mode", () => {
    const flags = makeFlags({ agentsAutoActivate: true });
    const result = simulateAgentStart("research", flags, false);
    assert.equal(result.enableCalled, true, "enableCompanionModeForAgent must be called");
    assert.equal(result.companionModeActive, true, "companionModeActive must become true");
  });

  test("flag ON: design-to-code agent DOES activate companion mode", () => {
    const flags = makeFlags({ agentsAutoActivate: true });
    const result = simulateAgentStart("design-to-code", flags, false);
    assert.equal(result.enableCalled, true);
    assert.equal(result.companionModeActive, true);
  });

  // ── Coder exception ──────────────────────────────────────────────────────

  test("flag ON: coder agent NEVER activates companion mode", () => {
    const flags = makeFlags({ agentsAutoActivate: true });
    const result = simulateAgentStart("coder", flags, false);
    assert.equal(result.enableCalled, false, "coder must never call enableCompanionModeForAgent");
    assert.equal(result.companionModeActive, false, "companionModeActive must stay false for coder");
  });

  test("flag OFF: coder agent also does not activate companion mode", () => {
    const flags = makeFlags({ agentsAutoActivate: false });
    const result = simulateAgentStart("coder", flags, false);
    assert.equal(result.enableCalled, false);
    assert.equal(result.companionModeActive, false);
  });

  // ── enableCompanionModeForAgent idempotency guard ────────────────────────

  test("flag ON: companion already active — enable is not called again", () => {
    const flags = makeFlags({ agentsAutoActivate: true });
    const result = simulateAgentStart("research", flags, /* alreadyActive= */ true);
    assert.equal(result.enableCalled, false, "enable must be no-op if companion already active");
    assert.equal(result.companionModeActive, true, "companionModeActive stays true");
  });

  // ── Predicate isolation ──────────────────────────────────────────────────

  test("shouldCompanionActivate: exact boundary — non-coder + flag + consent triggers", () => {
    assert.equal(
      shouldCompanionActivate("research", makeFlags({ agentsAutoActivate: true }), fullConsent),
      true,
    );
    assert.equal(
      shouldCompanionActivate("coder", makeFlags({ agentsAutoActivate: true }), fullConsent),
      false,
    );
    assert.equal(
      shouldCompanionActivate("research", makeFlags({ agentsAutoActivate: false }), fullConsent),
      false,
    );
    assert.equal(shouldCompanionActivate("research", null, fullConsent), false);
    assert.equal(
      shouldCompanionActivate("research", makeFlags({ agentsAutoActivate: true }), { micAck: false, tosAck: true }),
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// ServerRuntimeFlags type contracts
// ---------------------------------------------------------------------------

describe("ServerRuntimeFlags defaults", () => {
  test("agentsAutoActivate defaults to false in makeFlags helper (models fetchServerRuntimeFlags)", () => {
    const flags = makeFlags();
    assert.equal(flags.agentsAutoActivate, false);
  });

  test("agentsAutoActivate must be explicitly === true to activate (not just truthy)", () => {
    // Mimic a server that sends agentsAutoActivate: 1 (wrong type — must be ignored)
    const badFlags = { ...makeFlags(), agentsAutoActivate: 1 } as unknown as ServerRuntimeFlags;
    // Our predicate (and the production code) uses === true, not truthiness
    assert.equal(badFlags.agentsAutoActivate === true, false);
    assert.equal(shouldCompanionActivate("research", badFlags, fullConsent), false);
  });
});

// ---------------------------------------------------------------------------
// GlassOnboardingState — consent defaults (L2.4 architecture law)
// ---------------------------------------------------------------------------

describe("GlassOnboardingState consent defaults", () => {
  test("DEFAULT_GLASS_ONBOARDING_STATE has all consent flags false", () => {
    const s: GlassOnboardingState = DEFAULT_GLASS_ONBOARDING_STATE;
    assert.equal(s.consentMicAck, false, "consentMicAck must default false");
    assert.equal(s.consentScreenAck, false, "consentScreenAck must default false");
    assert.equal(s.consentRecordingAck, false, "consentRecordingAck must default false");
    assert.equal(s.consentTosAck, false, "consentTosAck must default false");
  });

  test("DEFAULT state has completed: false — fresh install awaits onboarding", () => {
    assert.equal(DEFAULT_GLASS_ONBOARDING_STATE.completed, false);
  });
});

// ---------------------------------------------------------------------------
// Consent flag merging — pure-function coverage of persistConsentFlags logic
// ---------------------------------------------------------------------------

describe("consent flag merging (mirrors persistConsentFlags logic)", () => {
  /**
   * Mirrors persistConsentFlags() from glassOnboardingStore.ts without doing
   * any file I/O — tests the merge logic in isolation.
   */
  function mergeConsentFlags(
    existing: GlassOnboardingState,
    patch: Partial<Pick<GlassOnboardingState,
      "consentMicAck" | "consentScreenAck" | "consentRecordingAck" | "consentTosAck"
    >>,
  ): GlassOnboardingState {
    return { ...existing, ...patch };
  }

  test("merging micAck does not overwrite other consent flags", () => {
    const base: GlassOnboardingState = {
      ...DEFAULT_GLASS_ONBOARDING_STATE,
      consentScreenAck: true,
      consentRecordingAck: true,
    };
    const result = mergeConsentFlags(base, { consentMicAck: true });
    assert.equal(result.consentMicAck, true);
    assert.equal(result.consentScreenAck, true, "screenAck must survive mic patch");
    assert.equal(result.consentRecordingAck, true, "recordingAck must survive mic patch");
    assert.equal(result.consentTosAck, false, "tosAck stays false");
  });

  test("merging all four flags produces all-true state", () => {
    const result = mergeConsentFlags(DEFAULT_GLASS_ONBOARDING_STATE, {
      consentMicAck: true,
      consentScreenAck: true,
      consentRecordingAck: true,
      consentTosAck: true,
    });
    assert.equal(result.consentMicAck, true);
    assert.equal(result.consentScreenAck, true);
    assert.equal(result.consentRecordingAck, true);
    assert.equal(result.consentTosAck, true);
  });

  test("revoking a flag (false patch) correctly clears it", () => {
    const allTrue: GlassOnboardingState = {
      ...DEFAULT_GLASS_ONBOARDING_STATE,
      consentMicAck: true,
      consentScreenAck: true,
      consentRecordingAck: true,
      consentTosAck: true,
    };
    const result = mergeConsentFlags(allTrue, { consentTosAck: false });
    assert.equal(result.consentTosAck, false);
    assert.equal(result.consentMicAck, true, "micAck survives tos revocation");
  });

  test("merge does not mutate the source object", () => {
    const base = { ...DEFAULT_GLASS_ONBOARDING_STATE };
    const _ = mergeConsentFlags(base, { consentMicAck: true });
    assert.equal(base.consentMicAck, false, "source object must not be mutated");
  });
});

describe("agentsAutoActivate consent gate", () => {
  test("flag ON + consent NOT given → companion must stay inactive", () => {
    const flags = makeFlags({ agentsAutoActivate: true });
    const result = simulateAgentStart("research", flags, false, {
      micAck: false,
      tosAck: false,
    });
    assert.equal(result.enableCalled, false);
    assert.equal(result.companionModeActive, false);
  });

  test("flag ON + mic without tos → companion must stay inactive", () => {
    const flags = makeFlags({ agentsAutoActivate: true });
    const result = simulateAgentStart("research", flags, false, {
      micAck: true,
      tosAck: false,
    });
    assert.equal(result.enableCalled, false);
  });
});
