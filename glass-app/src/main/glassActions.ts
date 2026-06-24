/**
 * IIVO Glass — Action Execution Engine
 *
 * Provides three action primitives the AI can invoke:
 *   1. runShellCommand  — spawn a bash command with streaming stdout/stderr
 *   2. writeFile        — write content to a user path (home dir / /tmp only)
 *   3. injectKeystrokes — type text into the currently active macOS app
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Safe path allowlist — only allow writes under home dir or /tmp,
 * never into system paths.
 */
function isSafePath(filePath: string): boolean {
  const resolved = path.resolve(filePath);
  const home = os.homedir();
  const tmp = os.tmpdir();
  const blocked = ['/System', '/usr', '/bin', '/sbin', '/Library/LaunchDaemons'];
  const inAllowedRoot =
    resolved.startsWith(home)
    || resolved.startsWith('/tmp')
    || resolved.startsWith(tmp);
  if (!inAllowedRoot) return false;
  return !blocked.some((b) => resolved.startsWith(b));
}

/**
 * Write content to a file at the given path.
 * Creates parent directories as needed.
 * Rejects paths outside the user's home dir and /tmp.
 */
export async function writeFile(
  filePath: string,
  content: string,
): Promise<{ ok: boolean; message: string }> {
  const expandedPath = filePath.startsWith('~/')
    ? path.join(os.homedir(), filePath.slice(2))
    : filePath;
  if (!isSafePath(expandedPath)) {
    return { ok: false, message: `Path not allowed: ${filePath}` };
  }
  try {
    const resolved = path.resolve(expandedPath);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, content, 'utf8');
    return { ok: true, message: `Written to ${expandedPath}` };
  } catch (e: unknown) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Type text into the currently active application using AppleScript
 * keystroke injection via System Events.
 */
export async function injectKeystrokes(
  text: string,
): Promise<{ ok: boolean; message: string }> {
  // Escape text for AppleScript string literal
  const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  try {
    await execFileAsync('osascript', [
      '-e',
      `tell application "System Events" to keystroke "${escaped}"`,
    ]);
    return { ok: true, message: `Typed ${text.length} characters` };
  } catch (e: unknown) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Read a file for diff preview purposes.
 * Returns the file content, whether it existed, and a sha256 hash of the
 * raw content (used for on-disk drift detection at apply time).
 *
 * Same path allowlist as writeFile/applyCodeToFile.
 */
export async function readFileForDiff(filePath: string): Promise<{
  ok: boolean;
  content: string;
  existed: boolean;
  hash: string;
  message?: string;
}> {
  const expandedPath = filePath.startsWith('~/')
    ? path.join(os.homedir(), filePath.slice(2))
    : filePath;
  if (!isSafePath(expandedPath)) {
    return { ok: false, content: '', existed: false, hash: '', message: `Path not allowed: ${filePath}` };
  }
  const resolved = path.resolve(expandedPath);
  try {
    const content = await fs.readFile(resolved, 'utf8');
    const hash = createHash('sha256').update(content).digest('hex');
    return { ok: true, content, existed: true, hash };
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      // New file — treat as empty content; all lines will appear as additions
      const hash = createHash('sha256').update('').digest('hex');
      return { ok: true, content: '', existed: false, hash };
    }
    return { ok: false, content: '', existed: false, hash: '', message: err.message ?? String(e) };
  }
}

/**
 * Apply AI-generated code to an existing file with safety guarantees:
 * 1. If `expectedHash` is provided, re-reads the file and verifies it hasn't
 *    changed on disk since the diff preview was shown. Returns driftDetected:true
 *    on mismatch so the caller can re-generate the diff.
 * 2. Creates a timestamped backup alongside the original before overwriting.
 * 3. Writes via a temp file + atomic rename so a crash mid-write never leaves
 *    a truncated source file.
 *
 * Path allowlist is the same as `writeFile` (home dir + /tmp only).
 */
export async function applyCodeToFile(
  filePath: string,
  code: string,
  expectedHash?: string,
): Promise<{ ok: boolean; message: string; driftDetected?: boolean; backupPath?: string }> {
  const expandedPath = filePath.startsWith('~/')
    ? path.join(os.homedir(), filePath.slice(2))
    : filePath;
  if (!isSafePath(expandedPath)) {
    return { ok: false, message: `Path not allowed: ${filePath}` };
  }
  const resolved = path.resolve(expandedPath);

  // Drift check: re-read the file and compare hash to what was shown at preview
  if (expectedHash !== undefined) {
    let currentContent = '';
    try {
      currentContent = await fs.readFile(resolved, 'utf8');
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException;
      if (err.code !== 'ENOENT') {
        return { ok: false, message: err.message ?? String(e) };
      }
      // ENOENT: file doesn't exist (new-file creation); hash should match sha256('')
    }
    const currentHash = createHash('sha256').update(currentContent).digest('hex');
    if (currentHash !== expectedHash) {
      return {
        ok: false,
        driftDetected: true,
        message: 'File changed on disk since preview — showing updated diff.',
      };
    }
  }

  const tmpPath = `${resolved}.glass-tmp`;
  let backupPath: string | undefined;
  try {
    try {
      await fs.access(resolved);
      backupPath = `${resolved}.glass-backup-${Date.now()}.bak`;
      await fs.copyFile(resolved, backupPath);
    } catch {
      backupPath = undefined;
    }
    // Atomic write: write to a temp path, then rename into place
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(tmpPath, code, 'utf8');
    await fs.rename(tmpPath, resolved);
    return {
      ok: true,
      message: backupPath
        ? `Applied (backup: ${path.basename(backupPath)})`
        : "Applied",
      backupPath,
    };
  } catch (e: unknown) {
    // Clean up temp file on failure (best-effort)
    fs.unlink(tmpPath).catch(() => undefined);
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Restore the most recent Glass backup for a file.
 *
 * Backups are created by applyCodeToFile as:
 *   ${resolved}.glass-backup-${Date.now()}.bak
 *
 * This function globs for all matching backups, picks the newest by
 * timestamp, and atomically copies it back over the original file.
 *
 * Same path allowlist as applyCodeToFile (home dir + /tmp only).
 */
export async function restoreBackup(
  filePath: string,
): Promise<{ ok: boolean; message: string }> {
  const expandedPath = filePath.startsWith('~/')
    ? path.join(os.homedir(), filePath.slice(2))
    : filePath;
  if (!isSafePath(expandedPath)) {
    return { ok: false, message: `Path not allowed: ${filePath}` };
  }
  const resolved = path.resolve(expandedPath);
  const dir = path.dirname(resolved);
  const base = path.basename(resolved);

  // Find all backup files for this path
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return { ok: false, message: 'Could not read directory for backup files.' };
  }

  const prefix = `${base}.glass-backup-`;
  const suffix = '.bak';
  const backups = entries
    .filter((e) => e.startsWith(prefix) && e.endsWith(suffix))
    .map((e) => {
      const ts = parseInt(e.slice(prefix.length, e.length - suffix.length), 10);
      return { name: e, ts: isNaN(ts) ? 0 : ts };
    })
    .sort((a, b) => b.ts - a.ts); // newest first

  if (backups.length === 0) {
    return { ok: false, message: 'No backup found for this file.' };
  }

  const backupPath = path.join(dir, backups[0].name);
  const tmpPath = `${resolved}.glass-restore-tmp`;
  try {
    await fs.copyFile(backupPath, tmpPath);
    await fs.rename(tmpPath, resolved);
    return { ok: true, message: `Restored from ${backups[0].name}` };
  } catch (e: unknown) {
    fs.unlink(tmpPath).catch(() => undefined);
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Spawn a shell command via bash and stream its stdout+stderr output
 * to the provided callbacks.
 *
 * Returns a cancel function that sends SIGTERM to the child process.
 */
export function runShellCommand(
  command: string,
  onData: (chunk: string) => void,
  onDone: (exitCode: number | null) => void,
): () => void {
  const proc = spawn('bash', ['-c', command], {
    env: { ...process.env, TERM: 'xterm-256color' },
    cwd: os.homedir(),
  });

  proc.stdout.on('data', (d: Buffer) => onData(d.toString()));
  proc.stderr.on('data', (d: Buffer) => onData(d.toString()));
  proc.on('close', (code) => onDone(code));

  // Return cancel function
  return () => proc.kill('SIGTERM');
}
