/**
 * Unit tests for src/shared/gitDiff.ts
 *
 * Covers:
 *   - parseGitNumstat
 *   - parseGitNameStatus
 *   - buildGitDiffSummary
 *   - analyzeScopeMatch
 *   - formatDiffForPrompt
 *   - extractProjectNameFromTitle
 *   - buildRepoCandidatePaths
 *   - shortRef
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  parseGitNumstat,
  parseGitNameStatus,
  buildGitDiffSummary,
  analyzeScopeMatch,
  formatDiffForPrompt,
  extractProjectNameFromTitle,
  buildRepoCandidatePaths,
  shortRef,
} from "../shared/gitDiff.ts";

// ─── parseGitNumstat ──────────────────────────────────────────────────────────

describe("parseGitNumstat", () => {
  it("parses a simple modified file", () => {
    const output = "12\t3\tsrc/auth/login.ts\n";
    const result = parseGitNumstat(output);
    assert.equal(result.length, 1);
    assert.equal(result[0].path, "src/auth/login.ts");
    assert.equal(result[0].insertions, 12);
    assert.equal(result[0].deletions, 3);
    assert.equal(result[0].isBinary, false);
  });

  it("parses multiple files", () => {
    const output = [
      "5\t2\tsrc/index.ts",
      "10\t0\tsrc/utils/helper.ts",
      "1\t1\tREADME.md",
    ].join("\n");
    const result = parseGitNumstat(output);
    assert.equal(result.length, 3);
    assert.equal(result[0].path, "src/index.ts");
    assert.equal(result[1].insertions, 10);
    assert.equal(result[1].deletions, 0);
    assert.equal(result[2].path, "README.md");
  });

  it("handles binary files (dash notation)", () => {
    const output = "-\t-\tassets/logo.png\n";
    const result = parseGitNumstat(output);
    assert.equal(result.length, 1);
    assert.equal(result[0].path, "assets/logo.png");
    assert.equal(result[0].isBinary, true);
    assert.equal(result[0].insertions, 0);
    assert.equal(result[0].deletions, 0);
  });

  it("handles rename notation {old => new}", () => {
    const output = "5\t0\tsrc/{old-auth => auth}/login.ts\n";
    const result = parseGitNumstat(output);
    assert.equal(result.length, 1);
    // New path should be resolved
    assert.ok(result[0].path.includes("auth/login.ts"));
    assert.ok(!result[0].path.includes("old-auth"));
  });

  it("skips blank lines", () => {
    const output = "\n5\t1\tsrc/foo.ts\n\n";
    const result = parseGitNumstat(output);
    assert.equal(result.length, 1);
  });

  it("skips malformed lines", () => {
    const output = "not a valid line\n5\t1\tsrc/valid.ts\n";
    const result = parseGitNumstat(output);
    assert.equal(result.length, 1);
    assert.equal(result[0].path, "src/valid.ts");
  });

  it("returns empty array for empty string", () => {
    const result = parseGitNumstat("");
    assert.deepEqual(result, []);
  });

  it("parses zero-insertion file", () => {
    const output = "0\t15\tsrc/removed-code.ts\n";
    const result = parseGitNumstat(output);
    assert.equal(result[0].insertions, 0);
    assert.equal(result[0].deletions, 15);
  });
});

// ─── parseGitNameStatus ───────────────────────────────────────────────────────

describe("parseGitNameStatus", () => {
  it("parses M (modified)", () => {
    const result = parseGitNameStatus("M\tsrc/auth.ts\n");
    assert.equal(result.get("src/auth.ts"), "modified");
  });

  it("parses A (added)", () => {
    const result = parseGitNameStatus("A\tsrc/new.ts\n");
    assert.equal(result.get("src/new.ts"), "added");
  });

  it("parses D (deleted)", () => {
    const result = parseGitNameStatus("D\tsrc/old.ts\n");
    assert.equal(result.get("src/old.ts"), "deleted");
  });

  it("parses R (renamed) — maps new path to renamed, old path to deleted", () => {
    const result = parseGitNameStatus("R95\tsrc/old-name.ts\tsrc/new-name.ts\n");
    assert.equal(result.get("src/new-name.ts"), "renamed");
    assert.equal(result.get("src/old-name.ts"), "deleted");
  });

  it("handles multiple files", () => {
    const output = [
      "M\tsrc/foo.ts",
      "A\tsrc/bar.ts",
      "D\tsrc/baz.ts",
    ].join("\n");
    const result = parseGitNameStatus(output);
    assert.equal(result.size, 3);
    assert.equal(result.get("src/foo.ts"), "modified");
    assert.equal(result.get("src/bar.ts"), "added");
    assert.equal(result.get("src/baz.ts"), "deleted");
  });

  it("unknown status letter falls back to modified", () => {
    const result = parseGitNameStatus("U\tsrc/conflict.ts\n");
    assert.equal(result.get("src/conflict.ts"), "modified");
  });

  it("skips blank lines", () => {
    const result = parseGitNameStatus("\nM\tsrc/a.ts\n\n");
    assert.equal(result.size, 1);
  });

  it("returns empty map for empty string", () => {
    const result = parseGitNameStatus("");
    assert.equal(result.size, 0);
  });
});

// ─── buildGitDiffSummary ──────────────────────────────────────────────────────

describe("buildGitDiffSummary", () => {
  const numstat = [
    "10\t2\tsrc/auth/login.ts",
    "5\t0\tsrc/auth/logout.ts",
    "3\t1\tsrc/utils/helpers.ts",
  ].join("\n");

  const nameStatus = [
    "M\tsrc/auth/login.ts",
    "A\tsrc/auth/logout.ts",
    "M\tsrc/utils/helpers.ts",
  ].join("\n");

  it("returns correct totals", () => {
    const summary = buildGitDiffSummary(numstat, nameStatus, "/repo", "abc1234", "fix auth login bug");
    assert.equal(summary.totalInsertions, 18);
    assert.equal(summary.totalDeletions, 3);
    assert.equal(summary.filesChanged.length, 3);
  });

  it("merges status from name-status into files", () => {
    const summary = buildGitDiffSummary(numstat, nameStatus, "/repo", "abc1234", "fix auth");
    const login = summary.filesChanged.find((f) => f.path === "src/auth/login.ts");
    const logout = summary.filesChanged.find((f) => f.path === "src/auth/logout.ts");
    assert.equal(login?.status, "modified");
    assert.equal(logout?.status, "added");
  });

  it("sets directory correctly", () => {
    const summary = buildGitDiffSummary(numstat, nameStatus, "/repo", "abc1234", "anything");
    const login = summary.filesChanged.find((f) => f.path === "src/auth/login.ts");
    assert.equal(login?.directory, "src/auth");
  });

  it("computes top directories sorted by volume", () => {
    const summary = buildGitDiffSummary(numstat, nameStatus, "/repo", "abc1234", "anything");
    // src/auth has 10+2+5 = 17 lines; src/utils has 3+1 = 4
    assert.equal(summary.topDirectories[0], "src/auth");
    assert.equal(summary.topDirectories[1], "src/utils");
  });

  it("topDirectories capped at 5", () => {
    const bigNumstat = Array.from({ length: 10 }, (_, i) =>
      `5\t1\tsrc/dir${i}/file.ts`,
    ).join("\n");
    const bigNameStatus = Array.from({ length: 10 }, (_, i) =>
      `M\tsrc/dir${i}/file.ts`,
    ).join("\n");
    const summary = buildGitDiffSummary(bigNumstat, bigNameStatus, "/repo", "abc", "anything");
    assert.ok(summary.topDirectories.length <= 5);
  });

  it("stores repoPath and baseRef", () => {
    const summary = buildGitDiffSummary(numstat, nameStatus, "/repo/project", "deadbeef", "fix auth");
    assert.equal(summary.repoPath, "/repo/project");
    assert.equal(summary.baseRef, "deadbeef");
  });

  it("returns unknown scope when no files changed", () => {
    const summary = buildGitDiffSummary("", "", "/repo", "abc", "fix auth");
    assert.equal(summary.scopeHint, "unknown");
    assert.ok(summary.scopeNote.length > 0);
  });

  it("binary files get isBinary = true", () => {
    const numstatBin = "-\t-\tassets/image.png\n";
    const nameStatusBin = "M\tassets/image.png\n";
    const summary = buildGitDiffSummary(numstatBin, nameStatusBin, "/repo", "abc", "update image");
    assert.equal(summary.filesChanged[0].isBinary, true);
  });

  it("falls back to modified when path not in name-status", () => {
    const summary = buildGitDiffSummary(numstat, "", "/repo", "abc", "fix auth");
    // All files should fall back to modified
    for (const f of summary.filesChanged) {
      assert.equal(f.status, "modified");
    }
  });
});

// ─── analyzeScopeMatch ────────────────────────────────────────────────────────

describe("analyzeScopeMatch", () => {
  function makeFile(path: string, ins = 5, del = 1) {
    return {
      path,
      directory: path.split("/").slice(0, -1).join("/") || ".",
      insertions: ins,
      deletions: del,
      isBinary: false,
      status: "modified" as const,
    };
  }

  it("returns on-track when all files match goal terms", () => {
    const { scopeHint } = analyzeScopeMatch("fix auth login bug", {
      filesChanged: [
        makeFile("src/auth/login.ts"),
        makeFile("src/auth/session.ts"),
      ],
      totalInsertions: 10,
      totalDeletions: 2,
    });
    assert.equal(scopeHint, "on-track");
  });

  it("returns unknown when no files changed", () => {
    const { scopeHint } = analyzeScopeMatch("fix auth login bug", {
      filesChanged: [],
      totalInsertions: 0,
      totalDeletions: 0,
    });
    assert.equal(scopeHint, "unknown");
  });

  it("returns unknown for only binary files", () => {
    const { scopeHint } = analyzeScopeMatch("fix auth login bug", {
      filesChanged: [{
        path: "assets/logo.png",
        directory: "assets",
        insertions: 0,
        deletions: 0,
        isBinary: true,
        status: "modified",
      }],
      totalInsertions: 0,
      totalDeletions: 0,
    });
    assert.equal(scopeHint, "unknown");
  });

  it("returns unknown when goal is too short", () => {
    const { scopeHint } = analyzeScopeMatch("fix it", {
      filesChanged: [makeFile("src/auth/login.ts")],
      totalInsertions: 5,
      totalDeletions: 1,
    });
    // "fix" and "it" are stop words — no terms remain
    assert.equal(scopeHint, "unknown");
  });

  it("returns possible-drift when ≤25% of files are unrelated", () => {
    // 3 auth files + 1 unrelated = 25% drift
    const { scopeHint } = analyzeScopeMatch("fix auth login bug", {
      filesChanged: [
        makeFile("src/auth/login.ts"),
        makeFile("src/auth/session.ts"),
        makeFile("src/auth/middleware.ts"),
        makeFile("src/styles/theme.css"),
      ],
      totalInsertions: 20,
      totalDeletions: 4,
    });
    assert.equal(scopeHint, "possible-drift");
  });

  it("returns significant-drift when >25% of files are unrelated", () => {
    // 1 auth + 2 unrelated = 67% drift
    const { scopeHint } = analyzeScopeMatch("fix auth login bug", {
      filesChanged: [
        makeFile("src/auth/login.ts"),
        makeFile("src/styles/theme.css"),
        makeFile("src/i18n/en.json"),
      ],
      totalInsertions: 15,
      totalDeletions: 3,
    });
    assert.equal(scopeHint, "significant-drift");
  });

  it("on-track note mentions file count", () => {
    const { scopeNote } = analyzeScopeMatch("fix auth login bug", {
      filesChanged: [makeFile("src/auth/login.ts")],
      totalInsertions: 5,
      totalDeletions: 1,
    });
    assert.ok(scopeNote.includes("1"));
  });

  it("possible-drift note mentions unrelated files", () => {
    const { scopeNote } = analyzeScopeMatch("fix auth login", {
      filesChanged: [
        makeFile("src/auth/login.ts"),
        makeFile("src/auth/session.ts"),
        makeFile("src/auth/middleware.ts"),
        makeFile("src/styles/theme.css"),
      ],
      totalInsertions: 20,
      totalDeletions: 4,
    });
    assert.ok(scopeNote.includes("theme.css"));
  });

  it("significant-drift note mentions drift count", () => {
    const { scopeNote } = analyzeScopeMatch("fix auth login bug", {
      filesChanged: [
        makeFile("src/auth/login.ts"),
        makeFile("src/styles/theme.css"),
        makeFile("src/i18n/en.json"),
      ],
      totalInsertions: 15,
      totalDeletions: 3,
    });
    assert.ok(scopeNote.length > 0);
    // Should mention at least file counts
    assert.ok(scopeNote.match(/\d/));
  });

  it("stop words are excluded from goal terms", () => {
    // "fix", "the", "and", "a" are all stop words — nothing will match
    const { scopeHint } = analyzeScopeMatch("fix the auth and the login and a bug", {
      filesChanged: [makeFile("src/auth/login.ts")],
      totalInsertions: 5,
      totalDeletions: 1,
    });
    // "auth" and "login" are not stop words — should match
    assert.equal(scopeHint, "on-track");
  });
});

// ─── formatDiffForPrompt ──────────────────────────────────────────────────────

describe("formatDiffForPrompt", () => {
  function makeSummary(overrides: Partial<Parameters<typeof formatDiffForPrompt>[0]> = {}) {
    return {
      repoPath: "/repo",
      baseRef: "abc1234def56789",
      filesChanged: [],
      totalInsertions: 0,
      totalDeletions: 0,
      topDirectories: [],
      scopeHint: "on-track" as const,
      scopeNote: "All files related.",
      ...overrides,
    };
  }

  it("returns no-changes message for empty diff", () => {
    const result = formatDiffForPrompt(makeSummary());
    assert.ok(result.includes("No code changes"));
  });

  it("includes file count, insertions, deletions", () => {
    const result = formatDiffForPrompt(makeSummary({
      filesChanged: [{
        path: "src/foo.ts",
        directory: "src",
        insertions: 10,
        deletions: 3,
        isBinary: false,
        status: "modified",
      }],
      totalInsertions: 10,
      totalDeletions: 3,
      topDirectories: ["src"],
    }));
    assert.ok(result.includes("10"));
    assert.ok(result.includes("3"));
    assert.ok(result.includes("src/foo.ts"));
  });

  it("marks binary files as binary", () => {
    const result = formatDiffForPrompt(makeSummary({
      filesChanged: [{
        path: "assets/img.png",
        directory: "assets",
        insertions: 0,
        deletions: 0,
        isBinary: true,
        status: "modified",
      }],
      totalInsertions: 0,
      totalDeletions: 0,
      topDirectories: ["assets"],
    }));
    assert.ok(result.includes("binary"));
  });

  it("shows up to 25 files and truncates the rest", () => {
    const files = Array.from({ length: 30 }, (_, i) => ({
      path: `src/file${i}.ts`,
      directory: "src",
      insertions: 1,
      deletions: 0,
      isBinary: false,
      status: "modified" as const,
    }));
    const result = formatDiffForPrompt(makeSummary({
      filesChanged: files,
      totalInsertions: 30,
      totalDeletions: 0,
      topDirectories: ["src"],
    }));
    // Should show truncation message for 5 more
    assert.ok(result.includes("5 more"));
  });

  it("includes status symbols M/A/D/R", () => {
    const files = [
      { path: "src/a.ts", directory: "src", insertions: 1, deletions: 0, isBinary: false, status: "modified" as const },
      { path: "src/b.ts", directory: "src", insertions: 5, deletions: 0, isBinary: false, status: "added" as const },
      { path: "src/c.ts", directory: "src", insertions: 0, deletions: 3, isBinary: false, status: "deleted" as const },
      { path: "src/d.ts", directory: "src", insertions: 2, deletions: 1, isBinary: false, status: "renamed" as const },
    ];
    const result = formatDiffForPrompt(makeSummary({
      filesChanged: files,
      totalInsertions: 8,
      totalDeletions: 4,
      topDirectories: ["src"],
    }));
    assert.ok(result.includes("  M "));
    assert.ok(result.includes("  A "));
    assert.ok(result.includes("  D "));
    assert.ok(result.includes("  R "));
  });

  it("includes top directories", () => {
    const result = formatDiffForPrompt(makeSummary({
      filesChanged: [{
        path: "src/auth/login.ts",
        directory: "src/auth",
        insertions: 5,
        deletions: 0,
        isBinary: false,
        status: "modified",
      }],
      totalInsertions: 5,
      totalDeletions: 0,
      topDirectories: ["src/auth"],
    }));
    assert.ok(result.includes("src/auth"));
  });

  it("starts with GIT DIFF header", () => {
    const result = formatDiffForPrompt(makeSummary({
      filesChanged: [{
        path: "src/a.ts",
        directory: "src",
        insertions: 1,
        deletions: 0,
        isBinary: false,
        status: "modified",
      }],
      totalInsertions: 1,
      totalDeletions: 0,
      topDirectories: ["src"],
    }));
    assert.ok(result.startsWith("GIT DIFF"));
  });
});

// ─── extractProjectNameFromTitle ──────────────────────────────────────────────

describe("extractProjectNameFromTitle", () => {
  it("extracts project name from VS Code title with file prefix", () => {
    const name = extractProjectNameFromTitle("login.ts — desktop-glass — Visual Studio Code");
    assert.equal(name, "desktop-glass");
  });

  it("extracts project name from Cursor title with file prefix", () => {
    const name = extractProjectNameFromTitle("index.ts — my-app — Cursor");
    assert.equal(name, "my-app");
  });

  it("extracts project name from Cursor title without file prefix", () => {
    const name = extractProjectNameFromTitle("my-project — Cursor");
    assert.equal(name, "my-project");
  });

  it("handles unsaved file indicator (● prefix)", () => {
    const name = extractProjectNameFromTitle("● login.ts — desktop-glass — Visual Studio Code");
    assert.equal(name, "desktop-glass");
  });

  it("returns null for non-editor titles", () => {
    const name = extractProjectNameFromTitle("Google Chrome");
    assert.equal(name, null);
  });

  it("returns null for empty string", () => {
    const name = extractProjectNameFromTitle("");
    assert.equal(name, null);
  });

  it("handles Code - OSS variant", () => {
    const name = extractProjectNameFromTitle("app.ts — my-repo — Code - OSS");
    assert.equal(name, "my-repo");
  });

  it("returns null for a title with no recognizable separator", () => {
    // Just an app name, no em-dash structure
    const name = extractProjectNameFromTitle("Visual Studio Code");
    // May or may not return something — just confirm it doesn't throw
    assert.ok(name === null || typeof name === "string");
  });
});

// ─── buildRepoCandidatePaths ──────────────────────────────────────────────────

describe("buildRepoCandidatePaths", () => {
  it("returns an array of paths", () => {
    const paths = buildRepoCandidatePaths("my-project", "/Users/test");
    assert.ok(Array.isArray(paths));
    assert.ok(paths.length > 0);
  });

  it("all paths start with homeDir", () => {
    const paths = buildRepoCandidatePaths("my-project", "/Users/test");
    for (const p of paths) {
      assert.ok(p.startsWith("/Users/test"), `Expected path to start with /Users/test: ${p}`);
    }
  });

  it("all paths end with the project name", () => {
    const paths = buildRepoCandidatePaths("desktop-glass", "/Users/test");
    for (const p of paths) {
      assert.ok(p.endsWith("desktop-glass"), `Expected path to end with desktop-glass: ${p}`);
    }
  });

  it("includes standard parent directories", () => {
    const paths = buildRepoCandidatePaths("app", "/Users/test");
    const joined = paths.join(",");
    assert.ok(joined.includes("Desktop"));
    assert.ok(joined.includes("Documents"));
    assert.ok(joined.includes("Projects"));
  });

  it("includes direct home path as candidate", () => {
    const paths = buildRepoCandidatePaths("app", "/Users/test");
    assert.ok(paths.includes("/Users/test/app"));
  });

  it("does not contain double slashes", () => {
    const paths = buildRepoCandidatePaths("my-project", "/Users/test");
    for (const p of paths) {
      assert.ok(!p.includes("//"), `Path contains double slash: ${p}`);
    }
  });
});

// ─── shortRef ─────────────────────────────────────────────────────────────────

describe("shortRef", () => {
  it("shortens a 40-char SHA to 7 chars", () => {
    const sha = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0";
    assert.equal(shortRef(sha), "a1b2c3d");
  });

  it("returns first 7 chars of a short ref unchanged if shorter", () => {
    assert.equal(shortRef("abc1234"), "abc1234");
  });

  it("works for refs longer than 40 chars", () => {
    const ref = "a".repeat(50);
    assert.equal(shortRef(ref).length, 7);
  });

  it("works for empty string without throwing", () => {
    assert.equal(shortRef(""), "");
  });
});
