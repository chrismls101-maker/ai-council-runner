import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clearIivoServerDegraded,
  clearIivoServerDegradedSources,
  getIivoServerDegradedReason,
  getIivoServerDegradedSource,
  markIivoServerDegraded,
} from "../main/iivoServerDegradedMain.ts";

test("per-source degraded state keeps feature failures when health recovers", () => {
  clearIivoServerDegraded();
  markIivoServerDegraded("translate", "Translation server unavailable.");
  markIivoServerDegraded("health", "Ping failed.");
  assert.equal(getIivoServerDegradedSource(), "translate");

  clearIivoServerDegradedSources(["health", "setup"]);
  assert.equal(getIivoServerDegradedSource(), "translate");
  assert.match(getIivoServerDegradedReason() ?? "", /Translation server unavailable/i);

  clearIivoServerDegradedSources(["translate"]);
  assert.equal(getIivoServerDegradedReason(), undefined);
});

test("setup and health clear without touching stt or memory marks", () => {
  clearIivoServerDegraded();
  markIivoServerDegraded("stt", "STT offline");
  markIivoServerDegraded("setup", "Server unreachable");

  clearIivoServerDegradedSources(["setup", "health"]);
  assert.equal(getIivoServerDegradedSource(), "stt");
  assert.match(getIivoServerDegradedReason() ?? "", /STT offline/i);
});
