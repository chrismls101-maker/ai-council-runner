/**
 * spendOverview.test.ts
 * ---------------------
 * L3.3 — AI Spend in Glass Overview
 *
 * Architecture laws under test:
 *   1. SpendTrackerPanel.onClose is optional (no crash when omitted in dashboard).
 *   2. Glass Overview section includes SpendTrackerPanel (≤2 clicks from Overview nav).
 *   3. AletheiaDashboard has NO spend surface (spend is Glass-only).
 *   4. The spend section in Glass Overview has NO minimalPublic flag gate.
 *
 * Strategy: source-file text assertions (readFileSync) matching the project
 * pattern used in glassBranchHygiene.test.ts, aletheiaAuthority.test.ts, etc.
 * No React rendering required — structural guarantees are provable from source.
 *
 * Run with:
 *   node --experimental-strip-types --test src/test/spendOverview.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, "..");

const spendPanelSrc = readFileSync(
  join(srcRoot, "renderer/builder/SpendTrackerPanel.tsx"),
  "utf8",
);

const glassDashboardSrc = readFileSync(
  join(srcRoot, "renderer/dashboard/GlassDashboard.tsx"),
  "utf8",
);

const aletheiaDashboardPath = join(srcRoot, "renderer/dashboard/AletheiaDashboard.tsx");
const aletheiaDashboardSrc = readFileSync(aletheiaDashboardPath, "utf8");

// ---------------------------------------------------------------------------
// SpendTrackerPanel — prop interface
// ---------------------------------------------------------------------------

describe("SpendTrackerPanel prop interface", () => {
  test("onClose prop is declared optional (?) in the component signature", () => {
    // The signature must be: { onClose?: () => void }
    // An optional prop allows the component to be used in the dashboard without
    // passing onClose, satisfying the dashboard embed contract.
    assert.ok(
      spendPanelSrc.includes("onClose?: () => void"),
      "Expected SpendTrackerPanel to declare onClose as optional (onClose?: () => void). " +
        "Found signature does not contain the optional marker.",
    );
  });

  test("close button is conditionally rendered only when onClose is provided", () => {
    // Must guard the close button: {onClose && <button ... onClick={onClose}>}
    // This prevents a broken onClick={undefined} in the dashboard embed context.
    assert.ok(
      spendPanelSrc.includes("onClose &&"),
      "Expected SpendTrackerPanel close button to be gated on onClose truthiness. " +
        'Missing: {onClose && ...} guard before the "✕" button.',
    );
  });

  test("SpendTrackerPanel is exported (importable by GlassDashboard)", () => {
    assert.ok(
      spendPanelSrc.includes("export function SpendTrackerPanel"),
      "SpendTrackerPanel must be a named export so GlassDashboard can import it.",
    );
  });
});

// ---------------------------------------------------------------------------
// GlassDashboard — Overview section includes spend
// ---------------------------------------------------------------------------

describe("GlassDashboard Overview section", () => {
  test("GlassDashboard imports SpendTrackerPanel", () => {
    assert.ok(
      glassDashboardSrc.includes("SpendTrackerPanel"),
      "GlassDashboard.tsx must import SpendTrackerPanel to embed it in Overview.",
    );
  });

  test("SpendTrackerPanel is rendered inside the overview nav branch", () => {
    // The overview branch is: if (activeNav === "overview") { ... }
    // We verify SpendTrackerPanel appears after that guard in the same file.
    const overviewIdx = glassDashboardSrc.indexOf('activeNav === "overview"');
    assert.ok(overviewIdx !== -1, 'GlassDashboard must contain activeNav === "overview" branch.');

    const spendIdx = glassDashboardSrc.indexOf("SpendTrackerPanel", overviewIdx);
    assert.ok(
      spendIdx !== -1,
      "SpendTrackerPanel must appear after the activeNav === \"overview\" branch in GlassDashboard.tsx. " +
        "Spend is unreachable from Glass Overview.",
    );
  });

  test("Overview spend section has a testid for validation", () => {
    assert.ok(
      glassDashboardSrc.includes("glass-dashboard-spend-overview"),
      'Expected data-testid="glass-dashboard-spend-overview" on the spend section wrapper.',
    );
  });

  test("Overview spend section has a human-readable section label", () => {
    // Matches either <p className="glass-dashboard__section-label">AI Spend</p>
    // or an equivalent heading element.
    assert.ok(
      glassDashboardSrc.includes("AI Spend"),
      'Glass Overview must include an "AI Spend" section label so users can identify the spend section.',
    );
  });

  test("SpendTrackerPanel in Overview is NOT gated behind minimalPublic flag", () => {
    // Spend in the Overview must always be visible regardless of the
    // glass.strip.minimalPublic flag — that flag only hides the strip shortcut.
    // Strategy: find the spend section block and confirm minimalPublic does NOT
    // appear between the section opening tag and SpendTrackerPanel.
    const sectionStart = glassDashboardSrc.indexOf("glass-dashboard__spend-overview");
    assert.ok(sectionStart !== -1, "Spend overview section must exist.");

    const panelEnd = glassDashboardSrc.indexOf("SpendTrackerPanel", sectionStart);
    assert.ok(panelEnd !== -1, "SpendTrackerPanel must appear after section start.");

    const sectionSlice = glassDashboardSrc.slice(sectionStart, panelEnd);
    assert.ok(
      !sectionSlice.includes("minimalPublic"),
      "The Glass Overview spend section must NOT be gated behind minimalPublic. " +
        "The flag only hides the strip tab, not the dashboard section.",
    );
  });
});

// ---------------------------------------------------------------------------
// AletheiaDashboard — negative test: no spend surface
// ---------------------------------------------------------------------------

describe("AletheiaDashboard spend isolation (negative tests)", () => {
  test("AletheiaDashboard does not import SpendTrackerPanel", () => {
    assert.ok(
      !aletheiaDashboardSrc.includes("SpendTrackerPanel"),
      "AletheiaDashboard must NOT import or reference SpendTrackerPanel. " +
        "Spend data is Glass-only per architecture law.",
    );
  });

  test("AletheiaDashboard does not reference spendGet IPC channel", () => {
    assert.ok(
      !aletheiaDashboardSrc.includes("spendGet"),
      "AletheiaDashboard must NOT call spendGet. Spend IPC channels are Glass-privileged.",
    );
  });

  test("AletheiaDashboard does not reference spendRefresh IPC channel", () => {
    assert.ok(
      !aletheiaDashboardSrc.includes("spendRefresh"),
      "AletheiaDashboard must NOT call spendRefresh. Spend IPC channels are Glass-privileged.",
    );
  });

  test("AletheiaDashboard does not reference spendHistoryGet IPC channel", () => {
    assert.ok(
      !aletheiaDashboardSrc.includes("spendHistoryGet"),
      "AletheiaDashboard must NOT call spendHistoryGet. Spend IPC channels are Glass-privileged.",
    );
  });

  test("AletheiaDashboard does not contain any 'spend' UI surface", () => {
    // Catch-all: no class names, testids, or text related to spend tracking.
    const spendMatches = [
      "sp-panel",
      "sp-header",
      "AI Spend",
      "SpendTracker",
      "spendCustomFetch",
    ];
    for (const marker of spendMatches) {
      assert.ok(
        !aletheiaDashboardSrc.includes(marker),
        `AletheiaDashboard must NOT contain spend UI marker: "${marker}". ` +
          "Spend is strictly Glass-only.",
      );
    }
  });
});
