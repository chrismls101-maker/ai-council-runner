import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_GLASS_PUBLIC_ARCHITECTURE_FLAGS,
  glassPublicArchitectureFlags,
  oppositeDashboardToClose,
} from "../shared/glassPublicArchitecture.ts";

test("public architecture flags default on", () => {
  assert.deepEqual(glassPublicArchitectureFlags({}), DEFAULT_GLASS_PUBLIC_ARCHITECTURE_FLAGS);
});

test("public architecture flags opt-out via env", () => {
  assert.equal(
    glassPublicArchitectureFlags({ IIVO_GLASS_DASHBOARD_MUTUAL_EXCLUSION: "0" })
      .dashboardMutualExclusion,
    false,
  );
  assert.equal(
    glassPublicArchitectureFlags({ IIVO_ALETHEIA_STRIP_ALL_PERSONAS: "0" })
      .aletheiaStripForAllPersonas,
    false,
  );
});

test("dashboard mutual exclusion names opposite surface", () => {
  assert.equal(
    oppositeDashboardToClose("glass", DEFAULT_GLASS_PUBLIC_ARCHITECTURE_FLAGS),
    "aletheiaDashboardActive",
  );
  assert.equal(
    oppositeDashboardToClose("aletheia", DEFAULT_GLASS_PUBLIC_ARCHITECTURE_FLAGS),
    "glassDashboardActive",
  );
  assert.equal(
    oppositeDashboardToClose("glass", { ...DEFAULT_GLASS_PUBLIC_ARCHITECTURE_FLAGS, dashboardMutualExclusion: false }),
    null,
  );
});
