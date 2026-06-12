/**
 * Unit tests for src/shared/githubTypes.ts
 *
 * Covers:
 *   - parseGitHubRemote (HTTPS, SSH, GHE, non-GitHub, edge cases)
 *   - reviewDecisionLabel / reviewDecisionToken
 *   - checkRollupLabel / checkRollupToken
 *   - parseReviewDecision
 *   - deriveCheckRollupStatus
 *   - truncatePRBody
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseGitHubRemote,
  reviewDecisionLabel,
  reviewDecisionToken,
  checkRollupLabel,
  checkRollupToken,
  parseReviewDecision,
  deriveCheckRollupStatus,
  truncatePRBody,
} from "../shared/githubTypes.ts";

// ─── parseGitHubRemote — HTTPS ────────────────────────────────────────────────

test("parseGitHubRemote: HTTPS with .git suffix", () => {
  const result = parseGitHubRemote("https://github.com/owner/repo.git");
  assert.ok(result !== null);
  assert.equal(result.owner, "owner");
  assert.equal(result.repo, "repo");
  assert.equal(result.remoteUrl, "https://github.com/owner/repo");
});

test("parseGitHubRemote: HTTPS without .git suffix", () => {
  const result = parseGitHubRemote("https://github.com/iivo-labs/glass");
  assert.ok(result !== null);
  assert.equal(result.owner, "iivo-labs");
  assert.equal(result.repo, "glass");
});

test("parseGitHubRemote: HTTPS with trailing slash", () => {
  const result = parseGitHubRemote("https://github.com/owner/repo/");
  assert.ok(result !== null);
  assert.equal(result.owner, "owner");
  assert.equal(result.repo, "repo");
});

test("parseGitHubRemote: HTTPS with token in URL", () => {
  const result = parseGitHubRemote("https://token@github.com/owner/repo.git");
  assert.ok(result !== null);
  assert.equal(result.owner, "owner");
  assert.equal(result.repo, "repo");
});

// ─── parseGitHubRemote — SSH ──────────────────────────────────────────────────

test("parseGitHubRemote: SSH with .git suffix", () => {
  const result = parseGitHubRemote("git@github.com:owner/repo.git");
  assert.ok(result !== null);
  assert.equal(result.owner, "owner");
  assert.equal(result.repo, "repo");
  // SSH remoteUrl is normalised to HTTPS
  assert.ok(result.remoteUrl.startsWith("https://github.com/"));
});

test("parseGitHubRemote: SSH without .git suffix", () => {
  const result = parseGitHubRemote("git@github.com:iivo-labs/glass");
  assert.ok(result !== null);
  assert.equal(result.owner, "iivo-labs");
  assert.equal(result.repo, "glass");
});

// ─── parseGitHubRemote — non-GitHub ──────────────────────────────────────────

test("parseGitHubRemote: GitLab HTTPS returns null", () => {
  assert.equal(parseGitHubRemote("https://gitlab.com/owner/repo.git"), null);
});

test("parseGitHubRemote: Bitbucket HTTPS returns null", () => {
  assert.equal(parseGitHubRemote("https://bitbucket.org/owner/repo.git"), null);
});

test("parseGitHubRemote: empty string returns null", () => {
  assert.equal(parseGitHubRemote(""), null);
});

test("parseGitHubRemote: non-URL string returns null", () => {
  assert.equal(parseGitHubRemote("not-a-url"), null);
});

test("parseGitHubRemote: local path returns null", () => {
  assert.equal(parseGitHubRemote("/home/user/projects/repo"), null);
});

// ─── reviewDecisionLabel ──────────────────────────────────────────────────────

test("reviewDecisionLabel: approved", () => {
  assert.equal(reviewDecisionLabel("approved"), "Approved");
});

test("reviewDecisionLabel: changes_requested", () => {
  assert.equal(reviewDecisionLabel("changes_requested"), "Changes requested");
});

test("reviewDecisionLabel: review_required", () => {
  assert.equal(reviewDecisionLabel("review_required"), "Review required");
});

test("reviewDecisionLabel: dismissed", () => {
  assert.equal(reviewDecisionLabel("dismissed"), "Dismissed");
});

test("reviewDecisionLabel: unknown", () => {
  assert.equal(reviewDecisionLabel("unknown"), "No review");
});

// ─── reviewDecisionToken ─────────────────────────────────────────────────────

test("reviewDecisionToken: approved → ok", () => {
  assert.equal(reviewDecisionToken("approved"), "ok");
});

test("reviewDecisionToken: changes_requested → bad", () => {
  assert.equal(reviewDecisionToken("changes_requested"), "bad");
});

test("reviewDecisionToken: review_required → warn", () => {
  assert.equal(reviewDecisionToken("review_required"), "warn");
});

test("reviewDecisionToken: dismissed → warn", () => {
  assert.equal(reviewDecisionToken("dismissed"), "warn");
});

test("reviewDecisionToken: unknown → off", () => {
  assert.equal(reviewDecisionToken("unknown"), "off");
});

// ─── checkRollupToken ────────────────────────────────────────────────────────

test("checkRollupToken: passing → ok", () => {
  assert.equal(checkRollupToken("passing"), "ok");
});

test("checkRollupToken: failing → bad", () => {
  assert.equal(checkRollupToken("failing"), "bad");
});

test("checkRollupToken: pending → warn", () => {
  assert.equal(checkRollupToken("pending"), "warn");
});

test("checkRollupToken: none → off", () => {
  assert.equal(checkRollupToken("none"), "off");
});

// ─── checkRollupLabel ────────────────────────────────────────────────────────

test("checkRollupLabel: passing includes check count", () => {
  const label = checkRollupLabel({ status: "passing", total: 8, failingCount: 0, failingNames: [] });
  assert.ok(label.includes("8"));
  assert.ok(label.toLowerCase().includes("pass"));
});

test("checkRollupLabel: failing includes failing count", () => {
  const label = checkRollupLabel({ status: "failing", total: 8, failingCount: 2, failingNames: ["build", "test"] });
  assert.ok(label.includes("2"));
  assert.ok(label.toLowerCase().includes("fail"));
});

test("checkRollupLabel: none", () => {
  const label = checkRollupLabel({ status: "none", total: 0, failingCount: 0, failingNames: [] });
  assert.ok(label.includes("No CI"));
});

// ─── parseReviewDecision ─────────────────────────────────────────────────────

test("parseReviewDecision: APPROVED", () => {
  assert.equal(parseReviewDecision("APPROVED"), "approved");
});

test("parseReviewDecision: CHANGES_REQUESTED", () => {
  assert.equal(parseReviewDecision("CHANGES_REQUESTED"), "changes_requested");
});

test("parseReviewDecision: REVIEW_REQUIRED", () => {
  assert.equal(parseReviewDecision("REVIEW_REQUIRED"), "review_required");
});

test("parseReviewDecision: DISMISSED", () => {
  assert.equal(parseReviewDecision("DISMISSED"), "dismissed");
});

test("parseReviewDecision: null returns unknown", () => {
  assert.equal(parseReviewDecision(null), "unknown");
});

test("parseReviewDecision: undefined returns unknown", () => {
  assert.equal(parseReviewDecision(undefined), "unknown");
});

test("parseReviewDecision: empty string returns unknown", () => {
  assert.equal(parseReviewDecision(""), "unknown");
});

// ─── deriveCheckRollupStatus ─────────────────────────────────────────────────

test("deriveCheckRollupStatus: empty list → none", () => {
  const result = deriveCheckRollupStatus([]);
  assert.equal(result.status, "none");
  assert.equal(result.total, 0);
  assert.equal(result.failingCount, 0);
});

test("deriveCheckRollupStatus: all success → passing", () => {
  const result = deriveCheckRollupStatus([
    { name: "build", status: "completed", conclusion: "success" },
    { name: "test", status: "completed", conclusion: "success" },
  ]);
  assert.equal(result.status, "passing");
  assert.equal(result.total, 2);
  assert.equal(result.failingCount, 0);
});

test("deriveCheckRollupStatus: one failure → failing", () => {
  const result = deriveCheckRollupStatus([
    { name: "build", status: "completed", conclusion: "success" },
    { name: "test", status: "completed", conclusion: "failure" },
  ]);
  assert.equal(result.status, "failing");
  assert.equal(result.failingCount, 1);
  assert.deepEqual(result.failingNames, ["test"]);
});

test("deriveCheckRollupStatus: timed_out counts as failing", () => {
  const result = deriveCheckRollupStatus([
    { name: "deploy", status: "completed", conclusion: "timed_out" },
  ]);
  assert.equal(result.status, "failing");
  assert.equal(result.failingCount, 1);
});

test("deriveCheckRollupStatus: in_progress → pending", () => {
  const result = deriveCheckRollupStatus([
    { name: "build", status: "completed", conclusion: "success" },
    { name: "test", status: "in_progress", conclusion: null },
  ]);
  assert.equal(result.status, "pending");
});

test("deriveCheckRollupStatus: caps failingNames at 3", () => {
  const checks = Array.from({ length: 5 }, (_, i) => ({
    name: `check-${i}`,
    status: "completed",
    conclusion: "failure",
  }));
  const result = deriveCheckRollupStatus(checks);
  assert.equal(result.failingCount, 5);
  assert.equal(result.failingNames.length, 3);
});

// ─── truncatePRBody ───────────────────────────────────────────────────────────

test("truncatePRBody: null returns empty string", () => {
  assert.equal(truncatePRBody(null), "");
});

test("truncatePRBody: undefined returns empty string", () => {
  assert.equal(truncatePRBody(undefined), "");
});

test("truncatePRBody: short body unchanged", () => {
  assert.equal(truncatePRBody("Fix the auth bug"), "Fix the auth bug");
});

test("truncatePRBody: long body truncated with ellipsis", () => {
  const body = "x".repeat(400);
  const result = truncatePRBody(body, 300);
  assert.ok(result.length <= 300);
  assert.ok(result.endsWith("…"));
});

test("truncatePRBody: normalises \\r\\n to \\n", () => {
  const result = truncatePRBody("line one\r\nline two");
  assert.ok(!result.includes("\r"));
  assert.ok(result.includes("\n"));
});
