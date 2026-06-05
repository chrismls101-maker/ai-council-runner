#!/usr/bin/env node
/**
 * Glass git guard — path patterns, content scan, size limits, branch policy.
 *
 * Usage:
 *   node scripts/glass-git-guard.mjs
 *   node scripts/glass-git-guard.mjs --working-tree
 *   node scripts/glass-git-guard.mjs --working-tree --strict
 *   node scripts/glass-git-guard.mjs --release
 *   node scripts/glass-git-guard.mjs --include-ignored
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const glassRoot = path.resolve(__dirname, "..");
const allowlistPath = path.join(glassRoot, "git-guard.allowlist.json");

export const STABLE_BRANCH = "cleanup/focused-iivo-lens-core";
const WARN_ASSET_BYTES = 2 * 1024 * 1024;
const FAIL_BINARY_BYTES = 2 * 1024 * 1024;

const BLOCKED_PATH_RE =
  /(?:^|\/)(?:release|out|node_modules|test-results|playwright-report)(?:\/|$)/i;
const BLOCKED_EXT_RE = /\.(?:app|dmg|zip|blockmap)$/i;
const SESSION_ARTIFACT_RE =
  /(?:session[-_]?data|session-screenshots|session-audio|glass-sessions\.json|session[-_]?recordings?)/i;
const BINARY_EXT_RE = /\.(?:png|jpe?g|gif|webp|icns|ico|wav|mp3|mp4|mov|pdf|woff2?|ttf|eot)$/i;
const TEXT_SCAN_EXT_RE = /\.(?:ts|tsx|js|mjs|cjs|json|md|html|css|yml|yaml|env|txt|svg|plist)$/i;

/** WIP-only paths — fail on stable branch when staged. */
const WIP_ONLY_PATTERNS = [
  /(?:^|\/)src\/renderer\/splash\//,
  /(?:^|\/)splash(?:-background)?\.html$/,
  /sound-prototype\.html$/,
  /(?:^|\/)src\/main\/startupAudioRestore\.ts$/,
  /(?:^|\/)src\/main\/macAudioOutput\.ts$/,
  /(?:^|\/)src\/shared\/audioRoutingReady\.ts$/,
  /(?:^|\/)src\/renderer\/panel\/PermissionsPanel\.tsx$/,
  /(?:^|\/)src\/renderer\/panel\/SystemAudioLiveMeter\.tsx$/,
  /(?:^|\/)src\/renderer\/dock\/dockLabels\.ts$/,
  /(?:^|\/)browser-extension\/prototype-/,
  /(?:^|\/)scripts\/generate-glass-(?:boot|lift)/,
  /(?:^|\/)vite\.sound-lab\.config\.ts$/,
];

/** @type {{ id: string, re: RegExp }[]} */
export const CONTENT_BLOCK_PATTERNS = [
  { id: "data-image", re: /data:image\//i },
  { id: "data-audio", re: /data:audio\//i },
  { id: "private-key", re: /-----BEGIN PRIVATE KEY-----/ },
  { id: "openai-env-key", re: /OPENAI_API_KEY\s*=\s*sk-/i },
  { id: "sk-token", re: /\bsk-[a-zA-Z0-9]{20,}\b/ },
  { id: "glass-sessions", re: /glass-sessions\.json/i },
  { id: "session-screenshots", re: /session-screenshots/i },
  { id: "session-audio-path", re: /session-audio/i },
];

/** @returns {{ paths: Set<string>, largeBinaries: Set<string> }} */
export function loadAllowlist() {
  if (!existsSync(allowlistPath)) {
    return { paths: new Set(), largeBinaries: new Set() };
  }
  try {
    const raw = JSON.parse(readFileSync(allowlistPath, "utf8"));
    return {
      paths: new Set((raw.paths ?? []).map(String)),
      largeBinaries: new Set((raw.largeBinaries ?? []).map(String)),
    };
  } catch {
    return { paths: new Set(), largeBinaries: new Set() };
  }
}

/** @param {string} file */
export function isAllowlistedPath(file, allowlist = loadAllowlist()) {
  const normalized = file.replace(/^\.\//, "");
  return allowlist.paths.has(normalized) || allowlist.largeBinaries.has(normalized);
}

/** @param {string} file @param {"staged"|"working"|"ignored"} source */
export function classifyGitPath(file, source) {
  const issues = [];
  const warnings = [];
  if (BLOCKED_PATH_RE.test(file)) issues.push(`Blocked path (${source}): ${file}`);
  if (BLOCKED_EXT_RE.test(file)) issues.push(`Packaged artifact (${source}): ${file}`);
  if (SESSION_ARTIFACT_RE.test(file)) issues.push(`Session/screenshot artifact (${source}): ${file}`);
  if (isBlockedEnvPath(file)) issues.push(`Env file (${source}): ${file}`);
  return { issues, warnings };
}

/** @param {string} file */
export function isBlockedEnvPath(file) {
  const base = path.basename(file);
  if (!/^\.env(\.|$)/.test(base)) return false;
  return base !== ".env.example";
}

/** @param {string} file */
export function isWipOnlyPath(file) {
  const normalized = file.replace(/^\.\//, "");
  return WIP_ONLY_PATTERNS.some((re) => re.test(normalized));
}

/** @param {string} content @param {string} file */
export function classifyFileContent(content, file) {
  const issues = [];
  if (!content || typeof content !== "string") return { issues };
  for (const { id, re } of CONTENT_BLOCK_PATTERNS) {
    if (re.test(content)) {
      issues.push(`Suspicious content (${id}) in ${file}`);
    }
  }
  return { issues };
}

/** @param {string} file @param {string} absPath */
export function classifyBinarySize(file, absPath, allowlist = loadAllowlist()) {
  const issues = [];
  const warnings = [];
  if (!existsSync(absPath)) return { issues, warnings };
  let size = 0;
  try {
    size = statSync(absPath).size;
  } catch {
    return { issues, warnings };
  }
  const normalized = file.replace(/^\.\//, "");
  const allowlisted = isAllowlistedPath(normalized, allowlist);
  if (size > WARN_ASSET_BYTES && !allowlisted && /(?:^|\/)src\//.test(normalized)) {
    warnings.push(`Large source asset (${Math.round(size / 1024 / 1024)}MB, ${file})`);
  }
  if (size > FAIL_BINARY_BYTES && BINARY_EXT_RE.test(normalized) && !allowlisted) {
    issues.push(`Large binary over ${FAIL_BINARY_BYTES / 1024 / 1024}MB (${file})`);
  }
  return { issues, warnings };
}

/** @param {string} file @param {"staged"|"working"|"ignored"} source @param {string} branch @param {boolean} strictMode */
export function classifyWipPathPolicy(file, source, branch, strictMode) {
  if (!isWipOnlyPath(file)) return { issues: [], warnings: [] };
  const msg = `WIP-only path (${source}): ${file}`;
  if (branch === STABLE_BRANCH) return { issues: [msg], warnings: [] };
  if (branch.startsWith("wip/")) return { issues: [], warnings: [msg] };
  if (branch.startsWith("integration/")) return { issues: [], warnings: [msg] };
  return { issues: strictMode ? [msg] : [], warnings: strictMode ? [] : [msg] };
}

function gitLines(subcommand) {
  const result = spawnSync("git", subcommand, {
    cwd: glassRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) return [];
  return result.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function currentBranch() {
  const result = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: glassRoot,
    encoding: "utf8",
  });
  return result.stdout?.trim() ?? "unknown";
}

/** @param {string} file */
function readStagedContent(file) {
  const result = spawnSync("git", ["show", `:${file}`], {
    cwd: glassRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status === 0) return result.stdout;
  return null;
}

/** @param {string} file */
function readWorkingContent(file) {
  const abs = path.join(glassRoot, file);
  if (!existsSync(abs)) return null;
  try {
    return readFileSync(abs, "utf8");
  } catch {
    return null;
  }
}

function collectFiles(scanWorkingTree, includeIgnoredFlag) {
  const staged = gitLines(["diff", "--cached", "--name-only", "--diff-filter=ACMR"]);
  const working = scanWorkingTree
    ? gitLines(["status", "--porcelain"]).map((line) =>
        line.replace(/^\?\?\s+|^[ MADRCU?!]{2}\s+/u, "").trim(),
      )
    : [];
  const ignored = includeIgnoredFlag
    ? gitLines(["ls-files", "-o", "-i", "--exclude-standard"])
    : [];
  const all = [...new Set([...staged, ...working, ...ignored])];
  return { staged, working, ignored, all };
}

/** @param {string[]} argv */
export function runGitGuardCli(argv = process.argv.slice(2)) {
  const releaseMode = argv.includes("--release");
  const scanWorkingTree = argv.includes("--working-tree") || releaseMode;
  const strict = argv.includes("--strict") || releaseMode;
  const includeIgnored = argv.includes("--include-ignored") || releaseMode;
  const scanContent = argv.includes("--content") || releaseMode || strict;

  const allowlist = loadAllowlist();
  const { staged, working, ignored, all } = collectFiles(scanWorkingTree, includeIgnored);
  const branch = currentBranch();

  const errors = [];
  const warnings = [];

  for (const file of all) {
    const sources = [];
    if (staged.includes(file)) sources.push("staged");
    if (working.includes(file)) sources.push("working");
    if (ignored.includes(file)) sources.push("ignored");

    for (const source of sources.length ? sources : ["staged"]) {
      const { issues, warnings: w } = classifyGitPath(file, source);
      if (source === "working" && !strict) {
        warnings.push(...issues);
      } else {
        errors.push(...issues);
      }
      warnings.push(...w);

      const wipPolicy = classifyWipPathPolicy(file, source, branch, strict);
      errors.push(...wipPolicy.issues);
      warnings.push(...wipPolicy.warnings);
    }

    const absPath = path.join(glassRoot, file);
    const { issues: sizeIssues, warnings: sizeWarnings } = classifyBinarySize(file, absPath, allowlist);
    errors.push(...sizeIssues);
    warnings.push(...sizeWarnings);

    if (scanContent && TEXT_SCAN_EXT_RE.test(file)) {
      const content = staged.includes(file) ? readStagedContent(file) : readWorkingContent(file);
      if (content != null) {
        const { issues: contentIssues } = classifyFileContent(content, file);
        errors.push(...contentIssues);
      }
    }
  }

  if (branch.startsWith("wip/") && !branch.includes("integration")) {
    warnings.push(
      `On WIP branch '${branch}' — do not merge directly into stable. See WIP_INTEGRATION_PLAN.md.`,
    );
  }

  if (releaseMode) {
    console.log(
      `[glass-git-guard] release mode (branch=${branch}, content=${scanContent}, ignored=${includeIgnored})`,
    );
  }

  if (warnings.length) {
    console.warn("[glass-git-guard] warnings:");
    for (const w of [...new Set(warnings)]) console.warn(`  - ${w}`);
  }

  if (errors.length) {
    console.error("[glass-git-guard] blocked:");
    for (const e of [...new Set(errors)]) console.error(`  - ${e}`);
    console.error("\nUnstage or remove these before committing to the stable Glass branch.");
    process.exit(1);
  }

  const scope = [
    `${staged.length} staged`,
    scanWorkingTree ? `${working.length} working` : null,
    includeIgnored ? `${ignored.length} ignored` : null,
  ]
    .filter(Boolean)
    .join(", ");

  if (all.length === 0) {
    console.log("[glass-git-guard] no files to scan — ok");
  } else {
    console.log(`[glass-git-guard] scan passed (${scope})`);
  }
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  runGitGuardCli();
}
