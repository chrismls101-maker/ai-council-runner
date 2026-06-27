import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  buildAletheiaDependencyManifest,
  dependencyManifestBlocksAletheia,
  formatAletheiaBootstrapNarration,
  listMissingDependencies,
  dependencyManifestSnapshotsEqual,
} from "../shared/aletheiaDependencyManifest.ts";

describe("buildAletheiaDependencyManifest", () => {
  test("bootstrap complete when only optional items missing", () => {
    const snapshot = buildAletheiaDependencyManifest([
      { id: "anthropicApi", status: "ready" },
      { id: "elevenLabsApi", status: "optional_missing" },
      { id: "blackhole", status: "optional_missing" },
      { id: "deepgramApi", status: "optional_missing" },
      { id: "openAiFallback", status: "optional_missing" },
      { id: "omniparser", status: "optional_missing" },
      { id: "pythonSidecar", status: "optional_missing" },
      { id: "ollama", status: "optional_missing" },
      { id: "switchAudioSource", status: "optional_missing" },
      { id: "nodePty", status: "ready" },
      { id: "accessibility", status: "ready" },
      { id: "screenRecording", status: "ready" },
    ]);
    assert.equal(snapshot.bootstrapComplete, true);
    assert.ok(snapshot.missingCount > 0);
  });

  test("bootstrap incomplete when anthropic missing", () => {
    const snapshot = buildAletheiaDependencyManifest([
      { id: "anthropicApi", status: "missing" },
      { id: "elevenLabsApi", status: "ready" },
      { id: "blackhole", status: "ready" },
      { id: "deepgramApi", status: "ready" },
      { id: "openAiFallback", status: "ready" },
      { id: "omniparser", status: "ready" },
      { id: "pythonSidecar", status: "ready" },
      { id: "ollama", status: "ready" },
      { id: "switchAudioSource", status: "ready" },
      { id: "nodePty", status: "ready" },
      { id: "accessibility", status: "ready" },
      { id: "screenRecording", status: "ready" },
    ]);
    assert.equal(snapshot.bootstrapComplete, false);
    assert.equal(snapshot.criticalMissingCount, 1);
    assert.match(snapshot.aletheiaNarration, /Anthropic API/i);
  });
});

describe("formatAletheiaBootstrapNarration", () => {
  test("ready narration when everything installed", () => {
    const text = formatAletheiaBootstrapNarration({
      bootstrapComplete: true,
      criticalMissing: [],
      optionalMissing: [],
    });
    assert.match(text, /Everything I need is online/i);
  });
});

describe("dependencyManifestBlocksAletheia", () => {
  test("returns narration when bootstrap incomplete", () => {
    const snapshot = buildAletheiaDependencyManifest([{ id: "anthropicApi", status: "missing" }]);
    assert.ok(dependencyManifestBlocksAletheia(snapshot));
  });

  test("blocks when manifest not ready yet", () => {
    assert.match(dependencyManifestBlocksAletheia(undefined) ?? "", /still running/i);
  });

  test("returns null when bootstrap complete", () => {
    const snapshot = buildAletheiaDependencyManifest([{ id: "anthropicApi", status: "ready" }]);
    assert.equal(dependencyManifestBlocksAletheia(snapshot), null);
  });
});

describe("listMissingDependencies", () => {
  test("includes optional_missing rows", () => {
    const snapshot = buildAletheiaDependencyManifest([
      { id: "anthropicApi", status: "ready" },
      { id: "ollama", status: "optional_missing" },
    ]);
    const missing = listMissingDependencies(snapshot);
    assert.ok(missing.some((row) => row.id === "ollama"));
  });
});

describe("dependencyManifestSnapshotsEqual", () => {
  test("detects status change", () => {
    const a = buildAletheiaDependencyManifest([{ id: "anthropicApi", status: "ready" }]);
    const b = buildAletheiaDependencyManifest([{ id: "anthropicApi", status: "missing" }]);
    assert.equal(dependencyManifestSnapshotsEqual(a, b), false);
    assert.equal(dependencyManifestSnapshotsEqual(a, a), true);
  });
});
