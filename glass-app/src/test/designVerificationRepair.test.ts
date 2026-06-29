import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldTriggerDesignRepair } from "../shared/designToCode.ts";

test("shouldTriggerDesignRepair for severe and minor when prompt exists", () => {
  assert.equal(
    shouldTriggerDesignRepair({ ok: false, severity: "severe", issues: ["x"] }, true),
    true,
  );
  assert.equal(
    shouldTriggerDesignRepair({ ok: false, severity: "minor", issues: ["x"] }, true),
    true,
  );
});

test("shouldTriggerDesignRepair skips when ok, no prompt, or none severity", () => {
  assert.equal(
    shouldTriggerDesignRepair({ ok: true, severity: "none", issues: [] }, true),
    false,
  );
  assert.equal(
    shouldTriggerDesignRepair({ ok: false, severity: "minor", issues: ["x"] }, false),
    false,
  );
  assert.equal(
    shouldTriggerDesignRepair({ ok: false, severity: "none", issues: ["x"] }, true),
    false,
  );
});
