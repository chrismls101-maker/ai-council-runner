import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isAllowedPreviewUrl,
  normalizePreviewUrl,
  parseDevServerUrl,
} from "../shared/glassIdePreview.ts";

test("parseDevServerUrl detects Vite local URL", () => {
  const text = "  ➜  Local:   http://localhost:5173/";
  assert.equal(parseDevServerUrl(text), "http://localhost:5173/");
});

test("parseDevServerUrl detects webpack dev server", () => {
  const text = "webpack compiled — On Your Network: http://127.0.0.1:8080";
  assert.equal(parseDevServerUrl(text), "http://127.0.0.1:8080/");
});

test("parseDevServerUrl ignores non-local hosts", () => {
  const text = "Server at https://example.com:3000";
  assert.equal(parseDevServerUrl(text), null);
});

test("parseDevServerUrl strips ANSI before matching", () => {
  const text = "\x1b[32m  Local:\x1b[0m http://localhost:3000\n";
  assert.equal(parseDevServerUrl(text), "http://localhost:3000/");
});

test("normalizePreviewUrl accepts localhost http", () => {
  assert.equal(normalizePreviewUrl("http://localhost:4173"), "http://localhost:4173/");
});

test("normalizePreviewUrl rejects external hosts", () => {
  assert.equal(normalizePreviewUrl("https://google.com"), null);
});

test("isAllowedPreviewUrl allows loopback only", () => {
  assert.equal(isAllowedPreviewUrl("http://localhost:5173"), true);
  assert.equal(isAllowedPreviewUrl("http://evil.com"), false);
});
