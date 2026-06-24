/**
 * IIVO Glass — GitHub Service (main process)
 *
 * Responsible for:
 *   1. PAT storage — encrypts/decrypts via Electron safeStorage (macOS Keychain-backed)
 *   2. Git remote detection — runs `git remote get-url origin` to find the GitHub remote
 *   3. Current branch detection — runs `git rev-parse --abbrev-ref HEAD`
 *   4. PR context fetch — wraps githubClient with PAT loading + error handling
 *
 * Privacy + security:
 *   - PAT is stored as an AES-encrypted blob at ~/.iivo-glass/github.enc
 *   - The decrypted token is NEVER stored in GlassState or logged
 *   - The token is passed to githubClient functions only and discarded after the call
 *   - On 401, `tokenInvalid` is set in GlassState so the UI can prompt re-entry
 *
 * This module intentionally has no renderer/IPC imports.
 * The caller (index.ts) handles wiring results into GlassState.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { safeStorage } from "electron";
import {
  parseGitHubRemote,
  GITHUB_API_BASE,
  type GitHubRepoInfo,
  type GitHubPRContext,
  type GitHubPATState,
} from "../shared/githubTypes.ts";
import { fetchPRContext, GitHubAuthError } from "../shared/githubClient.ts";

const execFileAsync = promisify(execFile);

// ─── PAT storage ──────────────────────────────────────────────────────────────

const PAT_STORE_PATH = join(homedir(), ".iivo-glass", "github.enc");
const EXEC_TIMEOUT_MS = 5_000;

/**
 * Save a PAT, encrypted via safeStorage.
 * Throws if safeStorage is not available (non-macOS or sandbox restrictions).
 */
export async function savePAT(token: string): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Secure storage is not available on this system.");
  }
  const encrypted = safeStorage.encryptString(token);
  await mkdir(dirname(PAT_STORE_PATH), { recursive: true });
  await writeFile(PAT_STORE_PATH, encrypted);
}

/**
 * Load and decrypt the stored PAT.
 * Returns null if no PAT is saved or decryption fails.
 */
export async function loadPAT(): Promise<string | null> {
  if (!existsSync(PAT_STORE_PATH)) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;

  try {
    const encrypted = await readFile(PAT_STORE_PATH);
    return safeStorage.decryptString(encrypted);
  } catch {
    return null;
  }
}

/**
 * Delete the stored PAT file.
 */
export async function clearPAT(): Promise<void> {
  if (existsSync(PAT_STORE_PATH)) {
    await unlink(PAT_STORE_PATH);
  }
}

/**
 * Check whether a PAT is stored and decryptable (does not validate with GitHub).
 *
 * Checks file existence first to avoid an unnecessary safeStorage decrypt on
 * every startup / status check when no PAT has ever been configured.
 */
export async function isPATConfigured(): Promise<GitHubPATState> {
  if (!existsSync(PAT_STORE_PATH)) {
    return { configured: false, tokenInvalid: false };
  }
  const token = await loadPAT();
  return {
    configured: token !== null && token.length > 0,
    tokenInvalid: false,
  };
}

// ─── Git remote + branch detection ───────────────────────────────────────────

/**
 * Run `git remote get-url origin` in the repo and parse the result.
 * Returns null if the repo has no origin remote or it's not a GitHub URL.
 */
export async function detectGitHubRemote(
  repoPath: string,
): Promise<GitHubRepoInfo | null> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["remote", "get-url", "origin"],
      { cwd: repoPath, timeout: EXEC_TIMEOUT_MS },
    );
    const remoteUrl = stdout.trim();
    return parseGitHubRemote(remoteUrl);
  } catch {
    return null;
  }
}

/**
 * Get the current branch name using `git rev-parse --abbrev-ref HEAD`.
 * Returns null if not in a git repo or the HEAD is detached.
 */
export async function detectCurrentBranch(
  repoPath: string,
): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["rev-parse", "--abbrev-ref", "HEAD"],
      { cwd: repoPath, timeout: EXEC_TIMEOUT_MS },
    );
    const branch = stdout.trim();
    // Detached HEAD
    if (!branch || branch === "HEAD") return null;
    return branch;
  } catch {
    return null;
  }
}

// ─── Combined fetch ───────────────────────────────────────────────────────────

export interface FetchPRResult {
  context: GitHubPRContext | null;
  /** Set to true if the PAT was rejected — prompt the user to re-enter. */
  tokenInvalid: boolean;
  /** Human-readable error if something went wrong (other than auth). */
  error?: string;
}

/**
 * Full PR context fetch for a session end:
 *   1. Load PAT
 *   2. Detect GitHub remote
 *   3. Detect current branch
 *   4. Call fetchPRContext
 *
 * Never throws. Returns FetchPRResult with context=null on any failure.
 */
export async function fetchSessionPRContext(
  repoPath: string,
): Promise<FetchPRResult> {
  const token = await loadPAT();
  if (!token) {
    return { context: null, tokenInvalid: false, error: "No PAT configured" };
  }

  const repoInfo = await detectGitHubRemote(repoPath);
  if (!repoInfo) {
    return { context: null, tokenInvalid: false, error: "No GitHub remote detected" };
  }

  const branch = await detectCurrentBranch(repoPath);
  if (!branch) {
    return { context: null, tokenInvalid: false, error: "Could not determine current branch" };
  }

  const config = { token, apiBase: GITHUB_API_BASE };

  try {
    const context = await fetchPRContext(config, repoInfo, branch);
    return { context, tokenInvalid: false };
  } catch (err) {
    if (err instanceof GitHubAuthError) {
      return { context: null, tokenInvalid: true, error: "GitHub PAT is invalid or revoked" };
    }
    return {
      context: null,
      tokenInvalid: false,
      error: err instanceof Error ? err.message : "Unknown GitHub API error",
    };
  }
}
