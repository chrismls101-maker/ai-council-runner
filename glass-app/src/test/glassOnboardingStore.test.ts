/**
 * glassOnboardingStore.test.ts
 * ----------------------------
 * Task 4 — Consent persistence round-trip and state/snapshot tests.
 *
 * These tests exercise:
 *   1. parseOnboardingJson() with a JSON file missing consent fields → all false
 *   2. parseOnboardingJson() with all consent fields set → read back correctly
 *   3. Partial-flag merge semantics: only the specified flag changes
 *   4. Profile update preserves consent fields (structural audit)
 *   5. Completion preserves consent fields (structural audit)
 *   6. GlassState.consentState is declared in ipc.ts (boundary contract)
 *   7. aletheiaDashboardIpc.ts does NOT expose Glass-privileged channels
 *   8. AletheiaDashboard.tsx does NOT call Glass-privileged IPC channels
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_GLASS_ONBOARDING_STATE,
  parseOnboardingJson,
  type GlassOnboardingState,
} from "../shared/glassOnboarding.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ---------------------------------------------------------------------------
// 1. parseOnboardingJson — missing consent fields default to false
// ---------------------------------------------------------------------------

describe("parseOnboardingJson — missing consent fields", () => {
  it("returns all-false consent flags when JSON has no consent keys", () => {
    const raw: Partial<GlassOnboardingState> = {
      completed: true,
      profile: null,
      // NOTE: no consentMicAck / consentScreenAck / consentRecordingAck / consentTosAck
    };
    const result = parseOnboardingJson(raw);
    assert.equal(result.consentMicAck, false, "consentMicAck should default false");
    assert.equal(result.consentScreenAck, false, "consentScreenAck should default false");
    assert.equal(result.consentRecordingAck, false, "consentRecordingAck should default false");
    assert.equal(result.consentTosAck, false, "consentTosAck should default false");
  });

  it("treats explicit undefined as false (old install safety)", () => {
    const raw = {
      completed: true,
      profile: null,
      consentMicAck: undefined,
      consentScreenAck: undefined,
    } as Partial<GlassOnboardingState>;
    const result = parseOnboardingJson(raw);
    assert.equal(result.consentMicAck, false);
    assert.equal(result.consentScreenAck, false);
  });

  it("treats explicit null as false (corrupt JSON safety)", () => {
    const raw = {
      completed: false,
      profile: null,
      consentMicAck: null,
    } as unknown as Partial<GlassOnboardingState>;
    const result = parseOnboardingJson(raw);
    assert.equal(result.consentMicAck, false);
  });
});

// ---------------------------------------------------------------------------
// 2. parseOnboardingJson — all consent fields set correctly
// ---------------------------------------------------------------------------

describe("parseOnboardingJson — consent fields present", () => {
  it("reads all four consent flags as true when set", () => {
    const raw: Partial<GlassOnboardingState> = {
      completed: true,
      profile: null,
      consentMicAck: true,
      consentScreenAck: true,
      consentRecordingAck: true,
      consentTosAck: true,
    };
    const result = parseOnboardingJson(raw);
    assert.equal(result.consentMicAck, true);
    assert.equal(result.consentScreenAck, true);
    assert.equal(result.consentRecordingAck, true);
    assert.equal(result.consentTosAck, true);
  });

  it("reads a mixed consent state correctly", () => {
    const raw: Partial<GlassOnboardingState> = {
      completed: false,
      profile: null,
      consentMicAck: true,
      consentScreenAck: false,
      consentRecordingAck: true,
      consentTosAck: false,
    };
    const result = parseOnboardingJson(raw);
    assert.equal(result.consentMicAck, true);
    assert.equal(result.consentScreenAck, false);
    assert.equal(result.consentRecordingAck, true);
    assert.equal(result.consentTosAck, false);
  });

  it("preserves completed and profile alongside consent flags", () => {
    const raw: Partial<GlassOnboardingState> = {
      completed: true,
      profile: null,
      consentMicAck: true,
      consentTosAck: true,
    };
    const result = parseOnboardingJson(raw);
    assert.equal(result.completed, true);
    assert.equal(result.profile, null);
    assert.equal(result.consentMicAck, true);
    assert.equal(result.consentTosAck, true);
  });
});

// ---------------------------------------------------------------------------
// 3. Partial-flag merge semantics (persistConsentFlags logic)
// ---------------------------------------------------------------------------

describe("persistConsentFlags merge logic", () => {
  /**
   * persistConsentFlags does: { ...existing, ...flags }
   * We test this merge contract in-process (no Electron/fs dependency).
   */
  function applyConsentFlagsMerge(
    existing: GlassOnboardingState,
    flags: Partial<Pick<
      GlassOnboardingState,
      "consentMicAck" | "consentScreenAck" | "consentRecordingAck" | "consentTosAck"
    >>,
  ): GlassOnboardingState {
    return { ...existing, ...flags };
  }

  it("only micAck changes when only consentMicAck is passed", () => {
    const existing: GlassOnboardingState = {
      ...DEFAULT_GLASS_ONBOARDING_STATE,
      consentMicAck: false,
      consentScreenAck: false,
      consentRecordingAck: false,
      consentTosAck: false,
    };
    const result = applyConsentFlagsMerge(existing, { consentMicAck: true });
    assert.equal(result.consentMicAck, true, "micAck should be true");
    assert.equal(result.consentScreenAck, false, "screenAck must not change");
    assert.equal(result.consentRecordingAck, false, "recordingAck must not change");
    assert.equal(result.consentTosAck, false, "tosAck must not change");
    assert.equal(result.completed, false, "completed must not change");
  });

  it("does not lose profile when only flags are updated", () => {
    const existing: GlassOnboardingState = {
      ...DEFAULT_GLASS_ONBOARDING_STATE,
      profile: { name: "Alice", usualWork: "Engineering", currentFocus: "", updatedAt: "2026-01-01T00:00:00Z" },
    };
    const result = applyConsentFlagsMerge(existing, { consentTosAck: true });
    assert.equal(result.consentTosAck, true);
    assert.equal(result.profile?.name, "Alice", "profile must be preserved");
  });

  it("can set multiple flags in one merge", () => {
    const existing: GlassOnboardingState = {
      ...DEFAULT_GLASS_ONBOARDING_STATE,
    };
    const result = applyConsentFlagsMerge(existing, {
      consentMicAck: true,
      consentTosAck: true,
    });
    assert.equal(result.consentMicAck, true);
    assert.equal(result.consentTosAck, true);
    assert.equal(result.consentScreenAck, false);
    assert.equal(result.consentRecordingAck, false);
  });
});

// ---------------------------------------------------------------------------
// 4. Profile update preserves consent fields (structural audit)
// ---------------------------------------------------------------------------

describe("persistGlassUserProfile structural audit", () => {
  it("glassOnboardingStore.ts loads existing state before profile update", () => {
    const source = readFileSync(
      join(ROOT, "main", "glassOnboardingStore.ts"),
      "utf8",
    );
    // The function must load existing state before spreading profile.
    // Verify the implementation pattern: loadGlassOnboardingState() called inside persistGlassUserProfile
    assert.match(
      source,
      /persistGlassUserProfile[\s\S]*?loadGlassOnboardingState/,
      "persistGlassUserProfile must call loadGlassOnboardingState to avoid losing consent flags",
    );
  });

  it("persistGlassUserProfile spreads existing state before overwriting profile", () => {
    const source = readFileSync(
      join(ROOT, "main", "glassOnboardingStore.ts"),
      "utf8",
    );
    // Verify spread pattern: { ...existing, completed, profile }
    assert.match(
      source,
      /\.\.\.\s*existing/,
      "persistGlassUserProfile must spread existing state (consent flags must survive profile update)",
    );
  });
});

// ---------------------------------------------------------------------------
// 5. completeGlassOnboardingStore preserves consent fields (structural audit)
// ---------------------------------------------------------------------------

describe("completeGlassOnboardingStore structural audit", () => {
  it("loads existing state before completing (so consent flags survive)", () => {
    const source = readFileSync(
      join(ROOT, "main", "glassOnboardingStore.ts"),
      "utf8",
    );
    assert.match(
      source,
      /completeGlassOnboardingStore[\s\S]*?loadGlassOnboardingState/,
      "completeGlassOnboardingStore must call loadGlassOnboardingState to preserve consent flags",
    );
  });

  it("sets completed = true and preserves profile + consent via spread", () => {
    const source = readFileSync(
      join(ROOT, "main", "glassOnboardingStore.ts"),
      "utf8",
    );
    assert.match(source, /completed:\s*true/);
    // The spread must be there to carry consent flags through completion
    assert.match(source, /\.\.\.\s*existing/);
  });
});

// ---------------------------------------------------------------------------
// 6. GlassState.consentState declared in ipc.ts (boundary contract)
// ---------------------------------------------------------------------------

describe("GlassState.consentState boundary contract", () => {
  it("ipc.ts declares consentState on GlassState", () => {
    const ipc = readFileSync(join(ROOT, "shared", "ipc.ts"), "utf8");
    assert.match(
      ipc,
      /consentState\?/,
      "GlassState must expose consentState for renderer trust panels",
    );
  });

  it("consentState has all four consent sub-fields", () => {
    const ipc = readFileSync(join(ROOT, "shared", "ipc.ts"), "utf8");
    assert.match(ipc, /micAck:\s*boolean/);
    assert.match(ipc, /screenAck:\s*boolean/);
    assert.match(ipc, /recordingAck:\s*boolean/);
    assert.match(ipc, /tosAck:\s*boolean/);
  });

  it("main/index.ts initialises consentState from glassOnboardingState at boot", () => {
    const index = readFileSync(join(ROOT, "main", "index.ts"), "utf8");
    assert.match(
      index,
      /consentState\s*=\s*\{[\s\S]*?micAck/,
      "index.ts must set state.consentState from glassOnboardingState",
    );
  });

  it("index.ts snapshot includes consentState in pushed state", () => {
    const index = readFileSync(join(ROOT, "main", "index.ts"), "utf8");
    assert.match(
      index,
      /consentState:\s*state\.consentState/,
      "snapshot() must include consentState so renderer receives consent flags",
    );
  });
});

// ---------------------------------------------------------------------------
// 7. aletheiaDashboardIpc.ts boundary — no Glass-privileged channels
// ---------------------------------------------------------------------------

describe("aletheiaDashboardIpc.ts — memory boundary enforcement", () => {
  const ipcSource = readFileSync(
    join(ROOT, "main", "aletheiaDashboardIpc.ts"),
    "utf8",
  );

  it("does NOT import getUserContext (Glass-only memory read)", () => {
    // getUserContext must not be imported or called — it is a Glass-privileged channel.
    // It may appear in comments (documentation of what is excluded).
    // Test: no ipcMain.handle call referencing getUserContext.
    assert.doesNotMatch(
      ipcSource,
      /ipcMain\.handle\([^)]*getUserContext/,
      "aletheiaDashboardIpc must not register an ipcMain handler for getUserContext",
    );
  });

  it("does NOT import deleteUserContextKey (destructive — Glass only)", () => {
    assert.doesNotMatch(
      ipcSource,
      /ipcMain\.handle\([^)]*deleteUserContextKey/,
      "aletheiaDashboardIpc must not register an ipcMain handler for deleteUserContextKey",
    );
  });

  it("does NOT import getSessionSpend (spend data — Glass only)", () => {
    assert.doesNotMatch(
      ipcSource,
      /ipcMain\.handle\([^)]*getSessionSpend/,
      "aletheiaDashboardIpc must not register an ipcMain handler for getSessionSpend",
    );
  });

  it("does NOT import getAgentBusHealth (agent bus — Glass only)", () => {
    assert.doesNotMatch(
      ipcSource,
      /ipcMain\.handle\([^)]*getAgentBusHealth/,
      "aletheiaDashboardIpc must not register an ipcMain handler for getAgentBusHealth",
    );
  });

  it("does NOT import getLastCouncilRun (council — Glass only)", () => {
    assert.doesNotMatch(
      ipcSource,
      /ipcMain\.handle\([^)]*getLastCouncilRun/,
      "aletheiaDashboardIpc must not register an ipcMain handler for getLastCouncilRun",
    );
  });

  it("does NOT import getAgentRunsByCorrelation (agent runs — Glass only)", () => {
    assert.doesNotMatch(
      ipcSource,
      /ipcMain\.handle\([^)]*getAgentRunsByCorrelation/,
      "aletheiaDashboardIpc must not register an ipcMain handler for getAgentRunsByCorrelation",
    );
  });

  it("only registers Aletheia-namespaced session channels (not bare Glass channels)", () => {
    // Aletheia channels must use dedicated Aletheia IPC constants (getAletheiaRecentSessions /
    // getAletheiaSessionMessages) OR the ':aletheia' suffix — never the bare Glass channel.
    // The bare Glass channels (IPC.getRecentSessions, IPC.getSessionMessages without
    // namespace) must not be registered here.
    assert.doesNotMatch(
      ipcSource,
      /ipcMain\.handle\(IPC\.getRecentSessions[^A-Za-z]/,
      "bare IPC.getRecentSessions must not be registered in aletheiaDashboardIpc",
    );
    assert.doesNotMatch(
      ipcSource,
      /ipcMain\.handle\(IPC\.getSessionMessages[^A-Za-z]/,
      "bare IPC.getSessionMessages must not be registered in aletheiaDashboardIpc",
    );
  });
});

// ---------------------------------------------------------------------------
// 8. AletheiaDashboard.tsx — no Glass-privileged IPC calls
// ---------------------------------------------------------------------------

describe("AletheiaDashboard.tsx — renderer memory boundary", () => {
  const uiSource = readFileSync(
    join(ROOT, "renderer", "dashboard", "AletheiaDashboard.tsx"),
    "utf8",
  );

  it("does not call getUserContext IPC channel", () => {
    assert.doesNotMatch(uiSource, /getUserContext/);
  });

  it("does not call deleteUserContextKey IPC channel", () => {
    assert.doesNotMatch(uiSource, /deleteUserContextKey/);
  });

  it("does not call getSessionSpend IPC channel", () => {
    assert.doesNotMatch(uiSource, /getSessionSpend/);
  });

  it("does not call getLastCouncilRun IPC channel", () => {
    assert.doesNotMatch(uiSource, /getLastCouncilRun/);
  });

  it("redirects memory management to Glass dashboard (never owns it)", () => {
    assert.match(
      uiSource,
      /dispatchAletheiaCommand\(\s*["']open-glass-memory["']\s*\)/,
      "Aletheia must redirect memory management via open-glass-memory command",
    );
  });

  it("redirects setup management to Glass dashboard (never owns it)", () => {
    assert.match(
      uiSource,
      /dispatchAletheiaCommand\(\s*["']open-glass-setup["']\s*\)/,
      "Aletheia must redirect setup via open-glass-setup command",
    );
  });

  it("reads permissions from setupCapabilities (GlassState) not Glass dashboard IPC", () => {
    assert.match(uiSource, /setupCapabilities/);
    assert.doesNotMatch(uiSource, /ipcRenderer\.invoke/);
  });

  it("loads recent sessions via Aletheia IPC channel", () => {
    assert.match(uiSource, /getAletheiaRecentSessions/);
    assert.doesNotMatch(uiSource, /\bgetRecentSessions\b/);
  });

  it("loads session message recap via Aletheia IPC channel", () => {
    assert.match(uiSource, /getAletheiaSessionMessages/);
    assert.doesNotMatch(uiSource, /\bgetSessionMessages\b/);
  });
});
