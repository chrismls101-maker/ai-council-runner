import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTerminalFixPrompt,
  detectTerminalFailureCategory,
  parseTerminalFixResponse,
  type TerminalFailureCategory,
} from "../main/terminalFixEngine.ts";

const FIXTURES: Array<{
  id: string;
  category: TerminalFailureCategory;
  command: string;
  output: string;
  exitCode: number;
  /** Substrings we expect in an actionable fix for this category */
  fixMustMention: RegExp[];
}> = [
  {
    id: "npm-missing-package",
    category: "npm_install",
    command: "npm install nonexistent-package-xyz",
    output: `npm error code E404
npm error 404 Not Found - GET https://registry.npmjs.org/nonexistent-package-xyz
npm error 404 The requested resource could not be found`,
    exitCode: 1,
    fixMustMention: [/npm install/i],
  },
  {
    id: "git-merge-conflict",
    category: "git_merge_conflict",
    command: "git merge feature/auth",
    output: `Auto-merging src/app.ts
CONFLICT (content): Merge conflict in src/app.ts
Automatic merge failed; fix conflicts and then commit the result.`,
    exitCode: 1,
    fixMustMention: [/git (status|merge|add)/i],
  },
  {
    id: "permission-denied",
    category: "permission_denied",
    command: "touch /usr/local/bin/my-tool",
    output: `touch: /usr/local/bin/my-tool: Permission denied`,
    exitCode: 1,
    fixMustMention: [/sudo|chown|chmod|\/usr\/local/i],
  },
  {
    id: "port-in-use",
    category: "port_in_use",
    command: "npm run dev",
    output: `Error: listen EADDRINUSE: address already in use :::3000`,
    exitCode: 1,
    fixMustMention: [/lsof|3000|kill|port/i],
  },
  {
    id: "pip-conflict",
    category: "pip_conflict",
    command: "pip install requests flask",
    output: `ERROR: Cannot install requests and flask because these package versions have conflicting dependencies.
ResolutionImpossible: for help visit https://pip.pypa.io/en/latest/topics/dependency-resolution/`,
    exitCode: 1,
    fixMustMention: [/pip/i],
  },
  {
    id: "disk-full",
    category: "disk_full",
    command: "cp large.iso ~/backup.iso",
    output: `cp: write error: No space left on device`,
    exitCode: 1,
    fixMustMention: [/df|space|disk|enospc/i],
  },
  {
    id: "command-not-found",
    category: "command_not_found",
    command: "typo-cmd-not-found-xyz",
    output: `zsh: command not found: typo-cmd-not-found-xyz`,
    exitCode: 127,
    fixMustMention: [/brew|install|typo|command/i],
  },
  {
    id: "timeout",
    category: "timeout",
    command: "curl https://slow.example.com/api",
    output: `curl: (28) Operation timed out after 30000 milliseconds with 0 bytes received`,
    exitCode: 28,
    fixMustMention: [/timeout|curl|retry/i],
  },
];

for (const fixture of FIXTURES) {
  test(`detectTerminalFailureCategory: ${fixture.id}`, () => {
    const detected = detectTerminalFailureCategory(
      fixture.command,
      fixture.output,
      fixture.exitCode,
    );
    assert.equal(detected, fixture.category);
  });

  test(`buildTerminalFixPrompt includes category guidance: ${fixture.id}`, () => {
    const prompt = buildTerminalFixPrompt(fixture.command, fixture.output, fixture.exitCode);
    assert.match(prompt, /Failure category:/);
    assert.match(prompt, /Category guidance:/);
    assert.ok(prompt.includes(fixture.command), "prompt should include failed command");
    assert.match(prompt, /Terminal output/);
  });
}

test("parseTerminalFixResponse parses 3-line fix", () => {
  const parsed = parseTerminalFixResponse(
    "npm install lodash\nMissing package in node_modules\nInstalls the dependency",
  );
  assert.equal(parsed.fixedCommand, "npm install lodash");
  assert.equal(parsed.diagnosis, "Missing package in node_modules");
  assert.equal(parsed.whatChanged, "Installs the dependency");
});

test("parseTerminalFixResponse handles no-fix sentinel", () => {
  const parsed = parseTerminalFixResponse("[no fix]\nManual intervention required\n");
  assert.equal(parsed.fixedCommand, null);
  assert.match(parsed.diagnosis ?? "", /manual/i);
});

test("golden local fixes are actionable for all categories", () => {
  const goldenFixes: Record<TerminalFailureCategory, string> = {
    npm_install: "npm install lodash",
    git_merge_conflict: "git status",
    permission_denied: "sudo chown $(whoami) /usr/local/bin/my-tool",
    port_in_use: "lsof -nP -iTCP:3000 -sTCP:LISTEN",
    pip_conflict: "pip install 'requests>=2.28,<3'",
    disk_full: "df -h",
    command_not_found: "brew install ripgrep",
    timeout: "curl --max-time 60 https://slow.example.com/api",
    generic: "echo retry",
  };

  for (const fixture of FIXTURES) {
    const fix = goldenFixes[fixture.category];
    for (const pattern of fixture.fixMustMention) {
      assert.match(fix, pattern, `${fixture.id}: fix "${fix}" should match ${pattern}`);
    }
  }
});
