import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  getFeatureFlags,
  isFeatureFlagKey,
  updateFeatureFlags,
} from "../../src/server/founder/featureFlags.ts";
import { normalizeUserRole } from "../../src/server/auth/userRoles.ts";

test("normalizeUserRole defaults unknown values to user", () => {
  assert.equal(normalizeUserRole("founder"), "founder");
  assert.equal(normalizeUserRole("admin"), "admin");
  assert.equal(normalizeUserRole("bogus"), "user");
  assert.equal(normalizeUserRole(undefined), "user");
});

test("isFeatureFlagKey recognizes founder levers", () => {
  assert.equal(isFeatureFlagKey("aiCallsEnabled"), true);
  assert.equal(isFeatureFlagKey("notAFlag"), false);
});

test("updateFeatureFlags persists toggles", async () => {
  const dir = await mkdtemp(join(tmpdir(), "iivo-flags-"));
  const flagsFile = join(dir, "feature-flags.json");
  process.env.FOUNDER_FLAGS_FILE = flagsFile;

  await writeFile(
    flagsFile,
    JSON.stringify({
      overlayDemoEnabled: true,
      terminalAutoFixEnabled: true,
      coderBuildLoopEnabledForNewUsers: true,
      aiCallsEnabled: true,
      updatedAt: new Date(0).toISOString(),
    }),
  );

  const updated = await updateFeatureFlags(
    { aiCallsEnabled: false, overlayDemoEnabled: false },
    "founder@test.dev",
  );
  assert.equal(updated.aiCallsEnabled, false);
  assert.equal(updated.overlayDemoEnabled, false);
  assert.equal(updated.updatedBy, "founder@test.dev");

  const reloaded = await getFeatureFlags();
  assert.equal(reloaded.aiCallsEnabled, false);

  delete process.env.FOUNDER_FLAGS_FILE;
});
