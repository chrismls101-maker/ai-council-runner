/**
 * Glass Agent Runner
 *
 * Runs a simple agentic loop using the Anthropic Messages API (streaming).
 *
 * Supported tools (per-agent):
 *   research  — web_search (server-side), write_file
 *   code      — read_file, list_directory, search_files, write_file
 *   writing   — web_search (server-side), write_file
 *   coder     — read_file, list_directory, search_files, run_project_command, edit_file, create_file, delete_file (approval-gated)
 *
 * The loop broadcasts AgentEvent payloads via the IPC `agentEvent` channel so
 * any renderer window can subscribe and display live progress.
 */

import { execFile, spawn } from "node:child_process";
import { mkdir, open, readdir, stat, writeFile } from "node:fs/promises";
import { join, resolve as pathResolve } from "node:path";
import { homedir } from "node:os";
import { promisify } from "node:util";
import { listApiKeys, getApiKeyValue } from "./apiKeyStore.ts";
import { agentBus, AgentBus, agentLifecycleEventType } from "./agentEventBus.ts";
import {
  agentRunCancelled,
  agentRunDone,
  agentRunError,
  type AgentChainMetadata,
  type AgentRunResult,
} from "./agentRunLifecycle.ts";
import { AGENT_SYSTEM_PROMPTS, AGENT_TOOLS } from "./agents/definitions.ts";
import { enrichGlassAskRequestWithMemory } from "./glassMemoryHelpers.ts";
import { resolveAgentSessionId } from "./glassMemoryPure.ts";
import { buildSystemPrompt } from "./glassSystemPrompt.ts";
import { applyCodeToFile, readFileForDiff, runShellCommand } from "./glassActions.ts";
import { verifyAppliedFile } from "./agentBuildVerify.ts";
import {
  assertPathInProjectRoot,
  expandAgentPath,
  proposeCreateContent,
  proposeDeleteContent,
  proposeEditContent,
  relativePathFromRoot,
  resolveProjectPath,
} from "./agentCoderTools.ts";
import type {
  AgentEvent,
  AgentEventKind,
  AgentPendingApprovalPayload,
  GlassAgentId,
} from "../shared/ipc.ts";
import type { CoderAgentModelId } from "../shared/coderAgentModels.ts";
import {
  estimateCoderRunCostUsd,
  resolveCoderAgentApiModel,
  resolveCoderAgentModelId,
  resolveCoderAgentProvider,
} from "../shared/coderAgentModels.ts";
import { recordModelCall } from "./modelCallStore.ts";
import {
  CODER_PLAN_MODE_SYSTEM_APPENDIX,
  CODER_PLAN_MODE_TOOL_NAMES,
  parseGlassCoderComposerMode,
  type GlassCoderComposerMode,
} from "../shared/glassComposerMode.ts";
import {
  narrateAgentDone,
  narrateAgentStarting,
  narrateToolStart,
} from "../shared/agentNarration.ts";
import { buildWriteToolStartPreview } from "./agentWriteToolPreview.ts";
import { isAllowedCoderProjectCommand } from "../shared/coderShellAllowlist.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 8192;
/** Stop after this many agent loop iterations to prevent runaway loops. */
const MAX_LOOP_ITERATIONS = 14;

/** Default output directory when caller does not pass outputDir. */
const FALLBACK_OUTPUT_DIR = join(homedir(), "Desktop", "IIVO Research");

// Max bytes read from a single file to avoid flooding context.
const MAX_FILE_READ_BYTES = 60_000;
// Max grep results returned.
const MAX_SEARCH_RESULTS = 40;
/** Keep the initial prompt plus this many follow-up messages (assistant + user pairs). */
const MAX_CONVERSATION_MESSAGES = 20;
/** Approximate character budget for the rolling messages array sent to Anthropic. */
const MAX_MESSAGES_CHARS = 140_000;
/** Cap each tool_result string stored in conversation history. */
const MAX_TOOL_RESULT_CHARS = 16_000;

const SERVER_SIDE_TOOL_RESULT = "(handled server-side)";

// ---------------------------------------------------------------------------
// Types (internal — Anthropic API shapes)
// ---------------------------------------------------------------------------

interface TextBlock {
  type: "text";
  text: string;
}

interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
}

type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock | { type: string };

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

// ---------------------------------------------------------------------------
// API key resolution
// ---------------------------------------------------------------------------

import { resolveAnthropicApiKey } from "./anthropicKeyStore.ts";

function resolvePerplexityKey(): string | null {
  const keys = listApiKeys();
  for (const meta of keys) {
    const svc = (meta.service ?? "").toLowerCase();
    const lbl = (meta.label  ?? "").toLowerCase();
    if (svc.includes("perplexity") || lbl.includes("perplexity") || svc.includes("pplx")) {
      const value = getApiKeyValue(meta.id);
      if (value) return value;
    }
  }
  return process.env.PERPLEXITY_API_KEY?.trim() ?? null;
}

function resolveOpenAIKey(): string | null {
  const keys = listApiKeys();
  for (const meta of keys) {
    const svc = (meta.service ?? "").toLowerCase();
    const lbl = (meta.label ?? "").toLowerCase();
    if (svc.includes("openai") || lbl.includes("openai")) {
      const value = getApiKeyValue(meta.id);
      if (value) return value;
    }
  }
  return process.env.IIVO_GLASS_OPENAI_API_KEY?.trim()
    ?? process.env.OPENAI_API_KEY?.trim()
    ?? null;
}

// ---------------------------------------------------------------------------
// Conversation history trimming
// ---------------------------------------------------------------------------

function messageContentChars(content: AnthropicMessage["content"]): number {
  if (typeof content === "string") return content.length;
  let total = 0;
  for (const block of content) {
    if (block.type === "text" && "text" in block) {
      total += String(block.text).length;
    } else if (block.type === "tool_use" && "name" in block) {
      const toolBlock = block as ToolUseBlock;
      total += toolBlock.name.length + JSON.stringify(toolBlock.input ?? {}).length;
    } else if (block.type === "tool_result" && "content" in block) {
      total += String(block.content).length;
    }
  }
  return total;
}

function truncateToolResult(text: string): string {
  if (text.length <= MAX_TOOL_RESULT_CHARS) return text;
  return (
    text.slice(0, MAX_TOOL_RESULT_CHARS) +
    `\n\n[...truncated — ${text.length - MAX_TOOL_RESULT_CHARS} more chars...]`
  );
}

/** Drop oldest follow-up turns so the agent loop stays within context limits. */
function trimMessages(messages: AnthropicMessage[]): AnthropicMessage[] {
  if (messages.length <= 1) return messages;

  const first = messages[0];
  let rest = messages.slice(1);

  if (rest.length > MAX_CONVERSATION_MESSAGES) {
    rest = rest.slice(-MAX_CONVERSATION_MESSAGES);
  }

  const trimmed: AnthropicMessage[] = [first, ...rest];
  while (estimateMessagesChars(trimmed) > MAX_MESSAGES_CHARS && trimmed.length > 2) {
    trimmed.splice(1, 1);
  }
  return trimmed;
}

function estimateMessagesChars(messages: AnthropicMessage[]): number {
  return messages.reduce((sum, msg) => sum + messageContentChars(msg.content), 0);
}

function abortIfNeeded(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
}

// ---------------------------------------------------------------------------
// SSE stream parser
// ---------------------------------------------------------------------------

interface SseEvent {
  event?: string;
  data: string;
}

async function* parseSse(response: Response): AsyncGenerator<SseEvent> {
  if (!response.body) return;

  const reader = (response.body as unknown as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent: string | undefined;
  let currentData: string | undefined;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          currentData = line.slice(6).trim();
        } else if (line === "" && currentData !== undefined) {
          yield { event: currentEvent, data: currentData };
          currentEvent = undefined;
          currentData = undefined;
        }
      }
    }

    // Stream closed without a trailing blank line — emit the pending event.
    if (currentData !== undefined) {
      yield { event: currentEvent, data: currentData };
    }
  } finally {
    reader.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Tool executors (client-side tools)
// ---------------------------------------------------------------------------

interface ToolExecutionResult {
  text: string;
  savedFilePath?: string;
  appliedPath?: string;
  skipped?: boolean;
  changeLogEntry?: import("../shared/ipc.ts").AgentChangeLogEntry;
  /** Diff preview for IDE transcript (create / edit / delete proposals). */
  changePreview?: import("../shared/ipc.ts").AgentPendingApprovalPayload;
  commandReceipt?: import("../shared/ipc.ts").CoderCommandReceipt;
}

const CODER_WRITE_TOOLS = new Set(["edit_file", "create_file", "delete_file"]);
const execFileAsync = promisify(execFile);

async function appendBuildVerifyResult(baseText: string, filePath: string): Promise<string> {
  const verify = await verifyAppliedFile(filePath);
  if (!verify) return baseText;
  return `${baseText}\n\nBuild check (${verify.command}): ${verify.summary}`;
}

async function moveFileToTrash(absPath: string): Promise<{ ok: boolean; message: string }> {
  if (process.platform !== "darwin") {
    return { ok: false, message: "Trash is only supported on macOS" };
  }
  try {
    await execFileAsync("osascript", [
      "-e",
      `tell application "Finder" to delete POSIX file ${JSON.stringify(absPath)}`,
    ]);
    return { ok: true, message: "Moved to Trash" };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export interface ApprovalGateRequest {
  toolUseId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  approval: AgentPendingApprovalPayload;
}

async function executeEditFile(
  input: Record<string, unknown>,
  projectRoot: string,
  toolUseId: string,
  approvalGate: (request: ApprovalGateRequest) => Promise<boolean>,
): Promise<ToolExecutionResult> {
  const filePath = String(input.path ?? "").trim();
  const oldString = String(input.old_string ?? "");
  const newString = String(input.new_string ?? "");
  const description = String(input.description ?? "").trim();

  if (!filePath) return { text: "Error: path is required" };
  const resolved = resolveProjectPath(filePath, projectRoot);
  const pathErr = assertPathInProjectRoot(resolved, projectRoot);
  if (pathErr) return { text: `Error: ${pathErr}` };

  const read = await readFileForDiff(resolved);
  if (!read.ok) return { text: `Error: ${read.message ?? "Failed to read file"}` };
  if (!read.existed) return { text: "Error: file does not exist — use create_file for new files" };

  const proposal = proposeEditContent(
    resolved,
    read.content,
    read.hash,
    read.existed,
    projectRoot,
    oldString,
    newString,
    description,
  );
  if (!proposal.ok) return { text: `Error: ${proposal.error}` };

  const approved = await approvalGate({
    toolUseId,
    toolName: "edit_file",
    toolInput: input,
    approval: proposal.approval,
  });
  if (!approved) {
    const rel = relativePathFromRoot(proposal.approval.filePath, projectRoot);
    return {
      text: "User skipped this change.",
      skipped: true,
      changePreview: proposal.approval,
      changeLogEntry: {
        runId: "",
        path: proposal.approval.filePath,
        relativePath: rel,
        action: "skipped",
        description: description || "edit",
        at: Date.now(),
      },
    };
  }

  const apply = await applyCodeToFile(proposal.approval.filePath, proposal.proposedContent, read.hash);
  if (!apply.ok) {
    if (apply.driftDetected) {
      return {
        text: "Error: file changed on disk since preview — read_file again and retry",
        changePreview: proposal.approval,
        changeLogEntry: {
          runId: "",
          path: proposal.approval.filePath,
          relativePath: relativePathFromRoot(proposal.approval.filePath, projectRoot),
          action: "failed",
          description: description || "edit",
          at: Date.now(),
          error: apply.message,
        },
      };
    }
    return {
      text: `Error applying edit: ${apply.message}`,
      changePreview: proposal.approval,
      changeLogEntry: {
        runId: "",
        path: proposal.approval.filePath,
        relativePath: relativePathFromRoot(proposal.approval.filePath, projectRoot),
        action: "failed",
        description: description || "edit",
        at: Date.now(),
        error: apply.message,
      },
    };
  }

  const rel = relativePathFromRoot(proposal.approval.filePath, projectRoot);
  const baseText = `Applied ${rel} — ${description || "edit"}`;
  return {
    text: await appendBuildVerifyResult(baseText, proposal.approval.filePath),
    appliedPath: proposal.approval.filePath,
    changePreview: proposal.approval,
    changeLogEntry: {
      runId: "",
      path: proposal.approval.filePath,
      relativePath: rel,
      action: "applied",
      description: description || "edit",
      at: Date.now(),
      backupPath: apply.backupPath,
    },
  };
}

async function executeCreateFile(
  input: Record<string, unknown>,
  projectRoot: string,
  toolUseId: string,
  approvalGate: (request: ApprovalGateRequest) => Promise<boolean>,
): Promise<ToolExecutionResult> {
  const filePath = String(input.path ?? "").trim();
  const content = String(input.content ?? "");
  const description = String(input.description ?? "").trim();

  if (!filePath) return { text: "Error: path is required" };
  const resolved = resolveProjectPath(filePath, projectRoot);
  const pathErr = assertPathInProjectRoot(resolved, projectRoot);
  if (pathErr) return { text: `Error: ${pathErr}` };

  const read = await readFileForDiff(resolved);
  if (!read.ok) return { text: `Error: ${read.message ?? "Failed to check file"}` };

  const proposal = proposeCreateContent(
    resolved,
    content,
    projectRoot,
    description,
    read.existed,
  );
  if (!proposal.ok) return { text: `Error: ${proposal.error}` };

  const approved = await approvalGate({
    toolUseId,
    toolName: "create_file",
    toolInput: input,
    approval: proposal.approval,
  });
  if (!approved) {
    const rel = relativePathFromRoot(proposal.approval.filePath, projectRoot);
    return {
      text: "User skipped this change.",
      skipped: true,
      changePreview: proposal.approval,
      changeLogEntry: {
        runId: "",
        path: proposal.approval.filePath,
        relativePath: rel,
        action: "skipped",
        description: description || "create",
        at: Date.now(),
      },
    };
  }

  const apply = await applyCodeToFile(proposal.approval.filePath, proposal.proposedContent, read.hash);
  if (!apply.ok) {
    return {
      text: `Error creating file: ${apply.message}`,
      changePreview: proposal.approval,
      changeLogEntry: {
        runId: "",
        path: proposal.approval.filePath,
        relativePath: relativePathFromRoot(proposal.approval.filePath, projectRoot),
        action: "failed",
        description: description || "create",
        at: Date.now(),
        error: apply.message,
      },
    };
  }

  const rel = relativePathFromRoot(proposal.approval.filePath, projectRoot);
  const baseText = `Created ${rel} — ${description || "new file"}`;
  return {
    text: await appendBuildVerifyResult(baseText, proposal.approval.filePath),
    appliedPath: proposal.approval.filePath,
    changePreview: proposal.approval,
    changeLogEntry: {
      runId: "",
      path: proposal.approval.filePath,
      relativePath: rel,
      action: "applied",
      description: description || "create",
      at: Date.now(),
      backupPath: apply.backupPath,
    },
  };
}

async function executeDeleteFile(
  input: Record<string, unknown>,
  projectRoot: string,
  toolUseId: string,
  approvalGate: (request: ApprovalGateRequest) => Promise<boolean>,
): Promise<ToolExecutionResult> {
  const filePath = String(input.path ?? "").trim();
  const description = String(input.description ?? "").trim();

  if (!filePath) return { text: "Error: path is required" };
  const resolved = resolveProjectPath(filePath, projectRoot);
  const pathErr = assertPathInProjectRoot(resolved, projectRoot);
  if (pathErr) return { text: `Error: ${pathErr}` };

  const read = await readFileForDiff(resolved);
  if (!read.ok) return { text: `Error: ${read.message ?? "Failed to read file"}` };
  if (!read.existed) return { text: "Error: file does not exist" };

  const proposal = proposeDeleteContent(
    resolved,
    read.content,
    read.hash,
    projectRoot,
    description,
  );
  if (!proposal.ok) return { text: `Error: ${proposal.error}` };

  const approved = await approvalGate({
    toolUseId,
    toolName: "delete_file",
    toolInput: input,
    approval: proposal.approval,
  });
  if (!approved) {
    const rel = relativePathFromRoot(proposal.approval.filePath, projectRoot);
    return {
      text: "User skipped this change.",
      skipped: true,
      changePreview: proposal.approval,
      changeLogEntry: {
        runId: "",
        path: proposal.approval.filePath,
        relativePath: rel,
        action: "skipped",
        description: description || "delete",
        at: Date.now(),
      },
    };
  }

  const fresh = await readFileForDiff(filePath);
  if (!fresh.ok || !fresh.existed) {
    return { text: "Error: file no longer exists" };
  }
  if (fresh.hash !== proposal.approval.contentHash) {
    return {
      text: "Error: file changed on disk since preview — read_file again and retry",
      changeLogEntry: {
        runId: "",
        path: proposal.approval.filePath,
        relativePath: relativePathFromRoot(proposal.approval.filePath, projectRoot),
        action: "failed",
        description: description || "delete",
        at: Date.now(),
        error: "File changed on disk since preview",
      },
    };
  }

  const trash = await moveFileToTrash(proposal.approval.filePath);
  if (!trash.ok) {
    return {
      text: `Error deleting file: ${trash.message}`,
      changeLogEntry: {
        runId: "",
        path: proposal.approval.filePath,
        relativePath: relativePathFromRoot(proposal.approval.filePath, projectRoot),
        action: "failed",
        description: description || "delete",
        at: Date.now(),
        error: trash.message,
      },
    };
  }

  const rel = relativePathFromRoot(proposal.approval.filePath, projectRoot);
  return {
    text: `Deleted ${rel} — moved to Trash`,
    changePreview: proposal.approval,
    changeLogEntry: {
      runId: "",
      path: proposal.approval.filePath,
      relativePath: rel,
      action: "deleted",
      description: description || "delete",
      at: Date.now(),
    },
  };
}

async function executeWriteFile(
  input: Record<string, unknown>,
  outputDir: string,
): Promise<ToolExecutionResult> {
  let filename = String(input.filename ?? "")
    .replace(/[/\\:*?"<>|]/g, "-")
    .trim();
  if (!filename || /^\.+$/.test(filename)) {
    filename = `output-${Date.now()}.md`;
  }
  if (!filename.includes(".")) {
    filename += ".md";
  }
  const content = String(input.content ?? "");

  await mkdir(outputDir, { recursive: true });
  const filePath = join(outputDir, filename);
  await writeFile(filePath, content, "utf-8");

  const displayPath = filePath.replace(homedir(), "~");
  return { text: `Saved to ${displayPath}`, savedFilePath: filePath };
}

async function executeReadFile(
  input: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<string> {
  const filePath = String(input.path ?? "").trim();
  if (!filePath) return "Error: path is required";
  abortIfNeeded(signal);
  try {
    const info = await stat(filePath);
    if (info.isDirectory()) {
      return "Error: path is a directory, not a file. Use list_directory instead.";
    }
    if (!info.isFile()) {
      return "Error: path is not a readable file.";
    }

    const handle = await open(filePath, "r");
    try {
      const buf = Buffer.alloc(MAX_FILE_READ_BYTES);
      const { bytesRead } = await handle.read(buf, 0, MAX_FILE_READ_BYTES, 0);
      abortIfNeeded(signal);
      const raw = buf.subarray(0, bytesRead).toString("utf-8");
      const suffix = info.size > MAX_FILE_READ_BYTES
        ? `\n\n[...truncated — ${info.size - MAX_FILE_READ_BYTES} more bytes...]`
        : "";
      return raw + suffix;
    } finally {
      await handle.close();
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    return `Error reading file: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function executeListDirectory(input: Record<string, unknown>): Promise<string> {
  const dirPath = String(input.path ?? "").trim();
  if (!dirPath) return "Error: path is required";
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    if (entries.length === 0) return "(empty directory)";
    const lines = entries
      .sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .map((e) => `${e.isDirectory() ? "[dir]" : "[file]"} ${e.name}`);
    return lines.join("\n");
  } catch (err) {
    return `Error listing directory: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function execErrorCode(err: unknown): string | number | undefined {
  if (err && typeof err === "object" && "code" in err) {
    return (err as { code?: string | number }).code;
  }
  return undefined;
}

function runGrep(args: string[], signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    abortIfNeeded(signal);

    const child = spawn("grep", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    const onAbort = (): void => {
      child.kill("SIGTERM");
      reject(new DOMException("Aborted", "AbortError"));
    };

    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }

    const cleanup = (): void => {
      signal?.removeEventListener("abort", onAbort);
    };

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      cleanup();
      reject(err);
    });
    child.on("close", (code) => {
      cleanup();
      if (code === 0) resolve(stdout);
      else if (code === 1) resolve("");
      else reject(new Error(stderr.trim() || `grep exited with code ${code ?? "unknown"}`));
    });
  });
}

async function executeSearchFiles(
  input: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<string> {
  const directory = String(input.directory ?? "").trim();
  const pattern   = String(input.pattern ?? "").trim();
  const ext       = String(input.file_extension ?? "").trim();
  const useRegex  = input.use_regex === true;

  if (!directory || !pattern) return "Error: directory and pattern are required";

  try {
    const includeGlob = ext ? `*.${ext}` : "*";
    const args = ["-r", "-l", "--no-dereference", "--include", includeGlob];
    if (useRegex) args.push("-E");
    args.push("--", pattern, directory);

    const stdout = await runGrep(args, signal);
    const matches = stdout.trim().split("\n").filter(Boolean).slice(0, MAX_SEARCH_RESULTS);
    if (matches.length === 0) return "No matches found.";
    const suffix = matches.length === MAX_SEARCH_RESULTS ? `\n[... and possibly more — refine your search]` : "";
    return matches.join("\n") + suffix;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    const code = execErrorCode(err);
    if (code === "ENOENT") {
      return "Error: grep is not available on this system.";
    }
    return `Error searching files: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function resolveTerminalCwdAfterCommand(currentCwd: string, command: string): string {
  const cdMatch = command.match(/^\s*cd\s+([^;&|]+)/);
  if (!cdMatch?.[1]) return currentCwd;
  const target = cdMatch[1].trim().replace(/^["']|["']$/g, "");
  if (!target) return currentCwd;
  if (target.startsWith("/")) return pathResolve(target);
  return pathResolve(currentCwd, target);
}

async function executeRunProjectCommand(
  input: Record<string, unknown>,
  projectRoot: string,
  signal?: AbortSignal,
  terminalCwd?: { get: () => string; set: (cwd: string) => void },
): Promise<ToolExecutionResult> {
  const command = String(input.command ?? "").trim();
  if (!command) return { text: "Error: command is required" };
  if (!isAllowedCoderProjectCommand(command)) {
    return {
      text: "Error: command not allowlisted. Allowed: npm run typecheck|build|test|lint, npx tsc --noEmit, git status, git diff",
    };
  }
  const cwd = terminalCwd?.get() ?? expandAgentPath(projectRoot);
  const startedAt = Date.now();
  return new Promise((resolve) => {
    let output = "";
    let settled = false;
    const finish = (exitCode: number | null): void => {
      if (settled) return;
      settled = true;
      const trimmed = output.trim().slice(0, 8_192);
      const code = exitCode ?? 1;
      const durationMs = Date.now() - startedAt;
      const receipt: import("../shared/ipc.ts").CoderCommandReceipt = {
        command,
        cwd,
        exitCode: code,
        durationMs,
        output: trimmed || "(no output)",
      };
      resolve({
        text: code === 0
          ? `Exit 0\n${trimmed || "(no output)"}`
          : `Exit ${code}\n${trimmed || "(no output)"}`,
        commandReceipt: receipt,
      });
      if (terminalCwd) {
        terminalCwd.set(resolveTerminalCwdAfterCommand(terminalCwd.get(), command));
      }
    };
    abortIfNeeded(signal);
    const cancel = runShellCommand(
      `cd ${JSON.stringify(cwd)} && ${command} 2>&1`,
      (chunk) => { output += chunk; },
      (exitCode) => finish(exitCode),
    );
    signal?.addEventListener("abort", () => {
      cancel();
      finish(1);
    }, { once: true });
  });
}

// ---------------------------------------------------------------------------
// Tool dispatcher
// ---------------------------------------------------------------------------

const SERVER_SIDE_TOOLS = new Set(["web_search"]);

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  outputDir: string,
  signal: AbortSignal | undefined,
  toolUseId: string,
  options: Pick<AgentRunOptions, "projectRoot" | "approvalGate" | "terminalCwd">,
): Promise<ToolExecutionResult> {
  abortIfNeeded(signal);
  switch (name) {
    case "write_file":     return executeWriteFile(input, outputDir);
    case "read_file":      return { text: await executeReadFile(input, signal) };
    case "list_directory": return { text: await executeListDirectory(input) };
    case "search_files":   return { text: await executeSearchFiles(input, signal) };
    case "edit_file": {
      if (!options.projectRoot?.trim() || !options.approvalGate) {
        return { text: "Error: Glass Coder project root or approval gate not configured" };
      }
      return executeEditFile(input, options.projectRoot, toolUseId, options.approvalGate);
    }
    case "create_file": {
      if (!options.projectRoot?.trim() || !options.approvalGate) {
        return { text: "Error: Glass Coder project root or approval gate not configured" };
      }
      return executeCreateFile(input, options.projectRoot, toolUseId, options.approvalGate);
    }
    case "delete_file": {
      if (!options.projectRoot?.trim() || !options.approvalGate) {
        return { text: "Error: Glass Coder project root or approval gate not configured" };
      }
      return executeDeleteFile(input, options.projectRoot, toolUseId, options.approvalGate);
    }
    case "run_project_command": {
      if (!options.projectRoot?.trim()) {
        return { text: "Error: Glass Coder project root not configured" };
      }
      return executeRunProjectCommand(input, options.projectRoot, signal, options.terminalCwd);
    }
    default:               return { text: `Unknown tool: ${name}` };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type AgentEventCallback = (event: AgentEvent) => void;

export interface AgentRunOptions {
  runId: string;
  agentId: GlassAgentId;
  prompt: string;
  outputDir?: string;
  /** Injected into the code/coder agent's first user message when set. */
  codeWorkspaceRoot?: string;
  /** Glass Coder — sandbox root for writes. */
  projectRoot?: string;
  /** Glass Coder — file index + editor context injected into the first user message. */
  coderBootstrapContext?: string;
  approvalGate?: (request: ApprovalGateRequest) => Promise<boolean>;
  /** Glass Coder — per-run shell cwd continuity for run_project_command. */
  terminalCwd?: { get: () => string; set: (cwd: string) => void };
  /** Anthropic model id, e.g. claude-sonnet-4-6 */
  anthropicModel: string;
  /** For usage/cost reporting in the IDE footer. */
  coderModelId?: CoderAgentModelId;
  /** Agent vs Plan — Plan restricts coder to read-only tools. */
  coderComposerMode?: GlassCoderComposerMode;
  onEvent: AgentEventCallback;
  signal?: AbortSignal;
  /**
   * Agent Event Bus chain tracking.
   * Set by the chain system when this run was triggered by another agent.
   * If absent, runAgent generates a new correlationId for a fresh chain.
   */
  correlationId?: string;
  sessionId?: string;
  /** Chain flags forwarded to bus complete events (e.g. draftAfter for Research→Writing). */
  chainMetadata?: AgentChainMetadata;
}

export type { AgentRunResult, AgentChainMetadata } from "./agentRunLifecycle.ts";

function buildInitialUserMessage(
  agentId: GlassAgentId,
  prompt: string,
  codeWorkspaceRoot?: string,
  coderBootstrapContext?: string,
): string {
  const root = codeWorkspaceRoot?.trim();
  if ((agentId === "code" || agentId === "coder") && root) {
    const role =
      agentId === "coder"
        ? "Project root (read and write here after approval):"
        : "Default workspace root:";
    const browse =
      agentId === "coder"
        ? "Use list_directory, search_files, and read_file under this path. edit_file, create_file, and delete_file require user approval before writing.\n\n"
        : "Start with list_directory on this path. Use search_files and read_file under it unless the user names another path.\n\n";
    const bootstrap = coderBootstrapContext?.trim()
      ? `${coderBootstrapContext.trim()}\n\n`
      : "";
    return `${role} ${root}\n\n${browse}${bootstrap}Task:\n${prompt}`;
  }
  return prompt;
}

type AgentToolDef = Record<string, unknown>;

function resolveAgentSystemAndTools(
  agentId: GlassAgentId,
  composerMode: GlassCoderComposerMode,
): { systemPrompt: string; toolDefs: AgentToolDef[] } {
  let systemPrompt = AGENT_SYSTEM_PROMPTS[agentId];
  let toolDefs: AgentToolDef[] = AGENT_TOOLS[agentId];
  if (agentId === "coder" && composerMode === "plan") {
    systemPrompt = `${systemPrompt}\n\n${CODER_PLAN_MODE_SYSTEM_APPENDIX}`;
    toolDefs = toolDefs.filter((tool) => CODER_PLAN_MODE_TOOL_NAMES.has(String(tool.name)));
  }
  return { systemPrompt, toolDefs };
}

function memoryAgentType(agentId: GlassAgentId): string {
  if (agentId === "coder" || agentId === "code") return "coding";
  if (agentId === "writing") return "writing";
  if (agentId === "research") return "research";
  return agentId;
}

function appendPassiveUserContext(userMessage: string, passiveContext?: string): string {
  const ctx = passiveContext?.trim();
  if (!ctx) return userMessage;
  return `${userMessage}\n\n--- Passive context ---\n${ctx}`;
}

async function systemPromptWithMemory(
  basePrompt: string,
  userPrompt: string,
  agentId: GlassAgentId,
): Promise<{ systemPrompt: string; passiveUserContext?: string }> {
  try {
    const enriched = await enrichGlassAskRequestWithMemory(
      { prompt: userPrompt, responseStyle: "full" },
      memoryAgentType(agentId),
    );
    const systemPrompt = enriched.memoryContext
      ? buildSystemPrompt(basePrompt, enriched.memoryContext)
      : basePrompt;
    return { systemPrompt, passiveUserContext: enriched.userContext };
  } catch (err) {
    console.error(`[memory] ${agentId} enrich failed:`, err);
    return { systemPrompt: basePrompt };
  }
}

function anthropicToolsToOpenAI(tools: AgentToolDef[]): Array<Record<string, unknown>> {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: String(tool.name),
      description: String(tool.description ?? ""),
      parameters: tool.input_schema ?? { type: "object", properties: {} },
    },
  }));
}

interface OpenAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

type OpenAIChatMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: OpenAIToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

function emit(
  onEvent: AgentEventCallback,
  runId: string,
  agentId: GlassAgentId,
  kind: AgentEventKind,
  extra?: Partial<Omit<AgentEvent, "runId" | "agentId" | "kind">>,
): void {
  onEvent({ runId, agentId, kind, ...extra });
}

function emitNarrate(
  onEvent: AgentEventCallback,
  runId: string,
  agentId: GlassAgentId,
  text: string,
): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  emit(onEvent, runId, agentId, "narrate", { text: trimmed });
}

function emitCancelled(
  onEvent: AgentEventCallback,
  runId: string,
  agentId: GlassAgentId,
  signal?: AbortSignal,
): AgentRunResult | null {
  if (!signal?.aborted) return null;
  emit(onEvent, runId, agentId, "cancelled");
  return agentRunCancelled();
}

function finishAgentError(
  onEvent: AgentEventCallback,
  runId: string,
  agentId: GlassAgentId,
  error: string,
  recoverable?: boolean,
): AgentRunResult {
  emit(onEvent, runId, agentId, "error", { error });
  return agentRunError(error, recoverable);
}

function finishAgentDone(
  onEvent: AgentEventCallback,
  runId: string,
  agentId: GlassAgentId,
  summary?: string,
  outputPath?: string,
  outputExcerpt?: string,
): AgentRunResult {
  emitNarrate(onEvent, runId, agentId, narrateAgentDone());
  emit(onEvent, runId, agentId, "done");
  return agentRunDone(summary, outputPath, outputExcerpt, outputExcerpt);
}

function extractTextBlocks(blocks: ContentBlock[]): string {
  return blocks
    .filter((block): block is TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function lastAssistantTextFromAnthropicMessages(messages: AnthropicMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "assistant") continue;
    const content = msg.content;
    if (typeof content === "string" && content.trim()) {
      return content.trim();
    }
    if (Array.isArray(content)) {
      const text = extractTextBlocks(content);
      if (text) return text;
    }
  }
  return "";
}

function lastAssistantTextFromOpenAIMessages(messages: OpenAIChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "assistant") continue;
    if (typeof msg.content === "string" && msg.content.trim()) {
      return msg.content.trim();
    }
  }
  return "";
}

function finishAgentDoneWithCapturedOutput(
  onEvent: AgentEventCallback,
  runId: string,
  agentId: GlassAgentId,
  summary: string,
  outputPath: string | undefined,
  outputExcerpt: string | undefined,
): AgentRunResult {
  if (outputExcerpt?.trim() || outputPath) {
    return finishAgentDone(onEvent, runId, agentId, summary, outputPath, outputExcerpt);
  }
  return finishAgentError(onEvent, runId, agentId, summary, false);
}

// ---------------------------------------------------------------------------
// Perplexity Research Runner
// ---------------------------------------------------------------------------

const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";
const PERPLEXITY_MODEL   = "sonar-pro";

const PERPLEXITY_RESEARCH_SYSTEM = `You are Aletheia, a research intelligence agent embedded in IIVO Glass on macOS.

Your job: research the user's question thoroughly using your real-time web access, then write a high-quality structured report followed by a styled HTML delivery card.

## Report format
Write clear, specific prose with evidence. Use these exact section headers:

## Overview
2-3 sentence executive summary.

## Key Findings
5-7 bullet points. Each one specific with data, quotes, or named sources.

## Analysis
Deep dive. Multiple subheadings as needed. Cite sources inline [1][2].

## Sources
Numbered list with titles and URLs.

## HTML Delivery Card
After the report, write a styled HTML delivery block that visually summarises the research for the question type. Wrap it exactly like this:

---ALETHEIA_HTML_START---
<style>
  .al-wrap { font-family: -apple-system, sans-serif; color: rgba(255,255,255,0.82); -webkit-font-smoothing: antialiased; }
  .al-section-head { font-size: 9px; font-weight: 700; letter-spacing: 0.22em; text-transform: uppercase; color: rgba(96,165,250,0.7); margin: 28px 0 14px; }
  .al-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; padding: 18px 20px; margin-bottom: 12px; }
  .al-tag { display: inline-block; font-size: 8px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; border-radius: 10px; padding: 3px 10px; margin-bottom: 10px; }
  .al-tag.confirmed { background: rgba(34,197,94,0.12); color: #22c55e; border: 1px solid rgba(34,197,94,0.25); }
  .al-tag.likely    { background: rgba(96,165,250,0.12); color: #60a5fa; border: 1px solid rgba(96,165,250,0.25); }
  .al-tag.possible  { background: rgba(251,191,36,0.12); color: #fbbf24; border: 1px solid rgba(251,191,36,0.25); }
  .al-tag.avoid     { background: rgba(239,68,68,0.12);  color: #ef4444; border: 1px solid rgba(239,68,68,0.25); }
  .al-claim { font-size: 14px; font-weight: 400; line-height: 1.6; color: rgba(255,255,255,0.82); margin-bottom: 8px; }
  .al-evidence { font-size: 11px; color: rgba(255,255,255,0.38); line-height: 1.5; }
  .al-table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  .al-table th { font-size: 9px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: rgba(96,165,250,0.7); padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.08); text-align: left; }
  .al-table td { font-size: 13px; color: rgba(255,255,255,0.7); padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,0.04); line-height: 1.5; }
  .al-table tr:last-child td { border-bottom: none; }
  .al-metric { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin: 16px 0; }
  .al-metric-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 14px 16px; }
  .al-metric-label { font-size: 8px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: rgba(255,255,255,0.3); margin-bottom: 6px; }
  .al-metric-value { font-size: 22px; font-weight: 300; color: #60a5fa; letter-spacing: -0.03em; }
  .al-metric-sub   { font-size: 10px; color: rgba(255,255,255,0.35); margin-top: 2px; }
  .al-step { display: flex; gap: 14px; margin-bottom: 14px; align-items: flex-start; }
  .al-step-num { flex-shrink: 0; width: 24px; height: 24px; border-radius: 50%; background: rgba(96,165,250,0.15); border: 1px solid rgba(96,165,250,0.3); display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; color: #60a5fa; }
  .al-step-body { flex: 1; }
  .al-step-title { font-size: 13px; font-weight: 500; color: rgba(255,255,255,0.82); margin-bottom: 4px; }
  .al-step-desc { font-size: 12px; color: rgba(255,255,255,0.45); line-height: 1.5; }
  .al-timeline { border-left: 1px solid rgba(255,255,255,0.1); padding-left: 20px; margin-left: 8px; }
  .al-timeline-item { position: relative; margin-bottom: 20px; }
  .al-timeline-item::before { content: ""; position: absolute; left: -25px; top: 4px; width: 8px; height: 8px; border-radius: 50%; background: #60a5fa; }
  .al-timeline-date { font-size: 9px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(96,165,250,0.6); margin-bottom: 4px; }
  .al-timeline-text { font-size: 13px; color: rgba(255,255,255,0.72); line-height: 1.5; }
  .al-pros-cons { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 16px 0; }
  .al-pros { background: rgba(34,197,94,0.05); border: 1px solid rgba(34,197,94,0.15); border-radius: 10px; padding: 14px; }
  .al-cons { background: rgba(239,68,68,0.05); border: 1px solid rgba(239,68,68,0.15); border-radius: 10px; padding: 14px; }
  .al-pros-head { font-size: 8px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: #22c55e; margin-bottom: 10px; }
  .al-cons-head { font-size: 8px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: #ef4444; margin-bottom: 10px; }
  .al-list-item { font-size: 12px; color: rgba(255,255,255,0.65); line-height: 1.6; margin-bottom: 6px; padding-left: 12px; position: relative; }
  .al-list-item::before { content: "-"; position: absolute; left: 0; color: rgba(255,255,255,0.25); }
  .al-source-row { display: flex; gap: 10px; align-items: center; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
  .al-source-num { font-size: 9px; font-weight: 700; color: rgba(96,165,250,0.5); width: 20px; flex-shrink: 0; }
  .al-source-text { font-size: 11px; color: rgba(255,255,255,0.45); }
</style>
<div class="al-wrap">
  <!-- Choose the format that fits the question. Examples:
       - Key judgments: use .al-card with .al-tag + .al-claim + .al-evidence
       - Comparison: use .al-table
       - Step-by-step guide: use .al-step items
       - Timeline: use .al-timeline
       - Data overview: use .al-metric grid
       - Pros/Cons: use .al-pros-cons
       Mix and match. Every question type gets its own best format. -->
</div>
---ALETHEIA_HTML_END---

Rules:
- HTML inside the block must be valid and self-contained. No external CSS, no scripts.
- Use only the class names defined in the <style> block above.
- All strings must be plain ASCII (no smart quotes, em-dashes, or special symbols).
- The delivery card should be the definitive, scannable answer to the question - the thing the user screenshots and keeps.
- Match the format to the question: a comparison question gets a table, a process question gets steps, an intelligence question gets judgment cards, etc.`;

/**
 * Run a research session using Perplexity Sonar Pro.
 * Streams text-delta events, then saves the report and emits done.
 */
async function runResearchWithPerplexity(options: AgentRunOptions): Promise<AgentRunResult> {
  const { runId, agentId, prompt, onEvent, signal } = options;
  const outputDir = options.outputDir ?? FALLBACK_OUTPUT_DIR;

  const key = resolvePerplexityKey();
  if (!key) {
    return finishAgentError(
      onEvent,
      runId,
      agentId,
      "Perplexity API key not found. Add it in Glass Settings > API Keys.",
      false,
    );
  }

  emitNarrate(onEvent, runId, agentId, "Searching the web...");
  emit(onEvent, runId, agentId, "tool-start", {
    toolName: "web_search",
    toolInput: { query: prompt },
  });

  let researchSystem = PERPLEXITY_RESEARCH_SYSTEM;
  let researchUserPrompt = prompt;
  try {
    const enriched = await enrichGlassAskRequestWithMemory(
      { prompt, responseStyle: "full" },
      "research",
    );
    if (enriched.memoryContext) {
      researchSystem = buildSystemPrompt(PERPLEXITY_RESEARCH_SYSTEM, enriched.memoryContext);
    }
    researchUserPrompt = appendPassiveUserContext(prompt, enriched.userContext);
  } catch (err) {
    console.error("[memory] research enrich failed:", err);
  }

  let response: Response;
  try {
    response = await fetch(PERPLEXITY_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: PERPLEXITY_MODEL,
        messages: [
          { role: "system", content: researchSystem },
          { role: "user",   content: prompt },
        ],
        stream: true,
        temperature: 0.2,
        search_context_size: "high",
      }),
      signal,
    });
  } catch (err) {
    if (signal?.aborted) {
      emit(onEvent, runId, agentId, "cancelled");
      return agentRunCancelled();
    }
    return finishAgentError(
      onEvent,
      runId,
      agentId,
      `Network error: ${String(err).slice(0, 120)}`,
      false,
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return finishAgentError(
      onEvent,
      runId,
      agentId,
      `Perplexity API error (${response.status}): ${body.slice(0, 120)}`,
      false,
    );
  }

  // Stream the response
  const reader  = response.body!.getReader();
  const decoder = new TextDecoder();
  let fullText    = "";
  let citations: string[] = [];
  let buffer      = "";

  try {
    while (true) {
      if (signal?.aborted) {
        emit(onEvent, runId, agentId, "cancelled");
        return agentRunCancelled();
      }
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (payload === "[DONE]") continue;
        try {
          const chunk = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string } }>;
            citations?: string[];
          };
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) {
            fullText += delta;
            emit(onEvent, runId, agentId, "text-delta", { text: delta });
          }
          if (Array.isArray(chunk.citations) && chunk.citations.length > citations.length) {
            citations = chunk.citations as string[];
          }
        } catch { /* malformed chunk — skip */ }
      }
    }
  } catch (err) {
    if (signal?.aborted) {
      emit(onEvent, runId, agentId, "cancelled");
      return agentRunCancelled();
    }
    return finishAgentError(
      onEvent,
      runId,
      agentId,
      `Stream error: ${String(err).slice(0, 120)}`,
      false,
    );
  }

  // Emit citations to left torrent column
  if (citations.length > 0) {
    const citationText = citations
      .map((url, i) => `[${i + 1}] ${url}`)
      .join("\n");
    emit(onEvent, runId, agentId, "tool-done", {
      toolName: "web_search",
      toolResult: citationText,
    });
  } else {
    emit(onEvent, runId, agentId, "tool-done", {
      toolName: "web_search",
      toolResult: "Search complete.",
    });
  }

  // Save report to disk
  emitNarrate(onEvent, runId, agentId, "Saving report...");
  const slug     = prompt.slice(0, 48).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const filename = `${slug || "research"}.md`;
  const filePath = join(outputDir, filename);

  emit(onEvent, runId, agentId, "tool-start", {
    toolName: "write_file",
    toolInput: { filename, content: fullText },
  });

  try {
    await mkdir(outputDir, { recursive: true });
    await writeFile(filePath, fullText, "utf-8");
  } catch (err) {
    return finishAgentError(
      onEvent,
      runId,
      agentId,
      `Failed to save report: ${String(err).slice(0, 80)}`,
      false,
    );
  }

  emit(onEvent, runId, agentId, "tool-done", {
    toolName: "write_file",
    savedFilePath: filePath,
    toolResult:    `Saved to ${filePath}`,
  });

  emitNarrate(onEvent, runId, agentId, "Research complete.");
  emit(onEvent, runId, agentId, "done");
  return agentRunDone("Research complete", filePath, fullText);
}

/**
 * Run the agent loop. Resolves with an outcome and publishes agent lifecycle events to the bus.
 */
export async function runAgent(options: AgentRunOptions): Promise<AgentRunResult> {
  const correlationId = options.correlationId ?? AgentBus.newCorrelationId();
  const sessionId = resolveAgentSessionId(options.sessionId);
  const busCtx = {
    runId: options.runId,
    sessionId,
    correlationId,
    sourceAgentId: options.agentId,
  };
  const chainMeta = options.chainMetadata;

  const started = agentBus.publish(
    agentLifecycleEventType(options.agentId, "started"),
    { agentId: options.agentId, prompt: options.prompt.slice(0, 240) },
    busCtx,
  );

  const trackedOnEvent: AgentEventCallback = (ev) => {
    options.onEvent({
      ...ev,
      correlationId,
      sequence: started.sequence,
    });
  };

  const trackedOptions: AgentRunOptions = { ...options, sessionId, onEvent: trackedOnEvent };

  let result: AgentRunResult;
  try {
    if (options.agentId === "research") {
      result = await runResearchWithPerplexity(trackedOptions);
    } else {
      result = await runAgentLoop(trackedOptions);
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    result = agentRunError(error, false);
    emit(trackedOnEvent, options.runId, options.agentId, "error", { error });
  }

  switch (result.outcome) {
    case "done":
      agentBus.publish(
        agentLifecycleEventType(options.agentId, "complete"),
        {
          agentId: options.agentId,
          summary: result.summary ?? `${options.agentId} agent finished`,
          outputPath: result.outputPath,
          draftAfter: chainMeta?.draftAfter,
          draftPrompt: chainMeta?.draftPrompt,
          researchExcerpt: result.outputExcerpt ?? result.researchExcerpt,
          outputExcerpt: result.outputExcerpt ?? result.researchExcerpt,
        },
        busCtx,
      );
      break;
    case "error":
      agentBus.publish(
        agentLifecycleEventType(options.agentId, "error"),
        {
          agentId: options.agentId,
          error: result.error ?? "Unknown agent error",
          recoverable: result.recoverable ?? false,
        },
        busCtx,
      );
      break;
    case "cancelled":
      break;
  }

  return result;
}

/**
 * OpenAI chat completions loop for Glass Coder (GPT 5.5).
 */
async function runOpenAICoderLoop(options: AgentRunOptions): Promise<AgentRunResult> {
  const { runId, agentId, prompt, onEvent, signal } = options;
  const outputDir = options.outputDir ?? FALLBACK_OUTPUT_DIR;
  const openaiModel = options.anthropicModel?.trim() || "gpt-5.5";
  const coderModelId = options.coderModelId ?? resolveCoderAgentModelId(undefined);
  const composerMode = parseGlassCoderComposerMode(options.coderComposerMode);
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  const emitUsage = (roundIn: number, roundOut: number): void => {
    if (roundIn <= 0 && roundOut <= 0) return;
    totalInputTokens += roundIn;
    totalOutputTokens += roundOut;
    emit(onEvent, runId, agentId, "usage", {
      usageInputTokens: totalInputTokens,
      usageOutputTokens: totalOutputTokens,
      usageModelId: coderModelId,
      usageApiModel: openaiModel,
      usageEstimatedUsd: estimateCoderRunCostUsd(
        coderModelId,
        totalInputTokens,
        totalOutputTokens,
        prompt,
      ),
    });
    recordModelCall({
      sessionId: options.sessionId,
      source: "coder",
      provider: "openai",
      model: openaiModel,
      agentId,
      runId,
      correlationId: options.correlationId,
      inputTokens: roundIn,
      outputTokens: roundOut,
      estimatedUsd: estimateCoderRunCostUsd(coderModelId, roundIn, roundOut, prompt),
    });
  };

  const apiKey = resolveOpenAIKey();
  if (!apiKey) {
    return finishAgentError(
      onEvent,
      runId,
      agentId,
      "No OpenAI API key found. Add one in the API Key Manager or set OPENAI_API_KEY.",
      false,
    );
  }

  emitNarrate(onEvent, runId, agentId, narrateAgentStarting(agentId));

  const { systemPrompt: baseSystemPrompt, toolDefs } = resolveAgentSystemAndTools(agentId, composerMode);
  const { systemPrompt, passiveUserContext } = await systemPromptWithMemory(
    baseSystemPrompt,
    prompt,
    agentId,
  );
  const openaiTools = anthropicToolsToOpenAI(toolDefs);
  const messages: OpenAIChatMessage[] = [{
    role: "user",
    content: appendPassiveUserContext(
      buildInitialUserMessage(
        agentId,
        prompt,
        options.codeWorkspaceRoot,
        options.coderBootstrapContext,
      ),
      passiveUserContext,
    ),
  }];

  let runOutputPath: string | undefined;
  let runOutputText = "";

  for (let iteration = 0; iteration < MAX_LOOP_ITERATIONS; iteration++) {
    const _cancelled = emitCancelled(onEvent, runId, agentId, signal);
    if (_cancelled) return _cancelled;

    let response: Response;
    try {
      response = await fetch(OPENAI_CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: openaiModel,
          max_tokens: MAX_TOKENS,
          stream: true,
          messages: [{ role: "system", content: systemPrompt }, ...messages],
          tools: openaiTools,
        }),
        signal,
      });
    } catch (err) {
      const _cancelled = emitCancelled(onEvent, runId, agentId, signal);
    if (_cancelled) return _cancelled;
      const msg = err instanceof Error ? err.message : String(err);
      return finishAgentError(onEvent, runId, agentId, `Network error: ${msg}`, false);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return finishAgentError(
        onEvent,
        runId,
        agentId,
        `OpenAI API error ${response.status}: ${body.slice(0, 200)}`,
        false,
      );
    }

    let textAccum = "";
    let finishReason: string | null = null;
    const toolCallsByIndex = new Map<number, OpenAIToolCall>();
    let roundInputTokens = 0;
    let roundOutputTokens = 0;

    for await (const sse of parseSse(response)) {
      const _cancelled = emitCancelled(onEvent, runId, agentId, signal);
    if (_cancelled) return _cancelled;
      if (!sse.data || sse.data === "[DONE]") continue;

      let parsed: Record<string, unknown>;
      try { parsed = JSON.parse(sse.data) as Record<string, unknown>; } catch { continue; }

      const usage = parsed.usage as Record<string, unknown> | undefined;
      const input = usage?.prompt_tokens;
      const output = usage?.completion_tokens;
      if (typeof input === "number" && Number.isFinite(input)) roundInputTokens = input;
      if (typeof output === "number" && Number.isFinite(output)) roundOutputTokens = output;

      const choice = (parsed.choices as Array<Record<string, unknown>> | undefined)?.[0];
      if (!choice) continue;

      finishReason = (choice.finish_reason as string | null) ?? finishReason;
      const delta = choice.delta as Record<string, unknown> | undefined;
      if (!delta) continue;

      const contentDelta = delta.content;
      if (typeof contentDelta === "string" && contentDelta) {
        textAccum += contentDelta;
        emit(onEvent, runId, agentId, "text-delta", { text: contentDelta });
      }

      const toolDeltas = delta.tool_calls as Array<Record<string, unknown>> | undefined;
      if (toolDeltas) {
        for (const toolDelta of toolDeltas) {
          const index = typeof toolDelta.index === "number" ? toolDelta.index : 0;
          const existing = toolCallsByIndex.get(index) ?? {
            id: "",
            type: "function" as const,
            function: { name: "", arguments: "" },
          };
          if (typeof toolDelta.id === "string") existing.id = toolDelta.id;
          const fn = toolDelta.function as Record<string, unknown> | undefined;
          if (fn) {
            if (typeof fn.name === "string") existing.function.name = fn.name;
            if (typeof fn.arguments === "string") {
              existing.function.arguments += fn.arguments;
            }
          }
          toolCallsByIndex.set(index, existing);
        }
      }
    }

    if (roundInputTokens > 0 || roundOutputTokens > 0) {
      emitUsage(roundInputTokens, roundOutputTokens);
    }

    const toolCalls = [...toolCallsByIndex.values()].filter((call) => call.id && call.function.name);

    if (finishReason === "stop" || (finishReason == null && toolCalls.length === 0)) {
      if (textAccum.trim()) {
        runOutputText = textAccum.trim();
      }
      return finishAgentDone(onEvent, runId, agentId, undefined, runOutputPath, runOutputText || undefined);
    }

    if (finishReason === "tool_calls" || toolCalls.length > 0) {
      const assistantMessage: OpenAIChatMessage = {
        role: "assistant",
        content: textAccum || null,
        tool_calls: toolCalls,
      };
      messages.push(assistantMessage);

      for (const call of toolCalls) {
        const _cancelled = emitCancelled(onEvent, runId, agentId, signal);
    if (_cancelled) return _cancelled;

        let toolInput: Record<string, unknown> = {};
        try {
          toolInput = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
        } catch { /* ok */ }

        const startPreview = CODER_WRITE_TOOLS.has(call.function.name) && options.projectRoot?.trim()
          ? await buildWriteToolStartPreview(call.function.name, toolInput, options.projectRoot)
          : undefined;

        emit(onEvent, runId, agentId, "tool-start", {
          toolName: call.function.name,
          toolInput,
          pendingToolId: call.id,
          pendingApproval: startPreview,
        });
        if (!CODER_WRITE_TOOLS.has(call.function.name)) {
          emitNarrate(onEvent, runId, agentId, narrateToolStart(call.function.name, toolInput));
        }

        let result: ToolExecutionResult;
        try {
          result = await executeTool(call.function.name, toolInput, outputDir, signal, call.id, {
            projectRoot: options.projectRoot,
            approvalGate: options.approvalGate,
            terminalCwd: options.terminalCwd,
          });
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") {
            const _cancelled = emitCancelled(onEvent, runId, agentId, signal);
    if (_cancelled) return _cancelled;
            result = { text: "Tool cancelled." };
          } else {
            result = { text: `Tool error: ${err instanceof Error ? err.message : String(err)}` };
          }
        }

        emit(onEvent, runId, agentId, "tool-done", {
          toolName: call.function.name,
          toolInput,
          pendingToolId: call.id,
          toolResult: result.text,
          pendingApproval: result.changePreview,
          savedFilePath: result.savedFilePath,
          changeLogEntry: result.changeLogEntry
            ? { ...result.changeLogEntry, runId }
            : undefined,
          commandReceipt: result.commandReceipt,
        });
        if (result.savedFilePath) {
          runOutputPath = result.savedFilePath;
        }

        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: truncateToolResult(result.text),
        });
      }
      continue;
    }

    if (finishReason === "length") {
      return finishAgentError(
        onEvent,
        runId,
        agentId,
        "Response reached the token limit before completing.",
        false,
      );
    }

    return finishAgentError(
      onEvent,
      runId,
      agentId,
      "Stream ended unexpectedly before the model finished.",
      false,
    );
  }

  return finishAgentDoneWithCapturedOutput(
    onEvent,
    runId,
    agentId,
    "Agent exceeded maximum loop iterations. Stopping.",
    runOutputPath,
    runOutputText || lastAssistantTextFromOpenAIMessages(messages) || undefined,
  );
}

/**
 * Internal loop — called by runAgent after bus context is set up.
 */
async function runAgentLoop(options: AgentRunOptions): Promise<AgentRunResult> {

  const { runId, agentId, prompt, onEvent, signal } = options;
  const outputDir = options.outputDir ?? FALLBACK_OUTPUT_DIR;
  const coderModelId = options.coderModelId ?? resolveCoderAgentModelId(undefined);
  const anthropicModel = options.anthropicModel?.trim()
    || resolveCoderAgentApiModel(coderModelId, prompt);
  const composerMode = parseGlassCoderComposerMode(options.coderComposerMode);
  const provider = resolveCoderAgentProvider(coderModelId, prompt);

  if (provider === "openai") {
    return runOpenAICoderLoop(options);
  }

  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  const emitUsage = (roundIn: number, roundOut: number): void => {
    if (roundIn <= 0 && roundOut <= 0) return;
    totalInputTokens += roundIn;
    totalOutputTokens += roundOut;
    emit(onEvent, runId, agentId, "usage", {
      usageInputTokens: totalInputTokens,
      usageOutputTokens: totalOutputTokens,
      usageModelId: coderModelId,
      usageApiModel: anthropicModel,
      usageEstimatedUsd: estimateCoderRunCostUsd(
        coderModelId,
        totalInputTokens,
        totalOutputTokens,
        prompt,
      ),
    });
    recordModelCall({
      sessionId: options.sessionId,
      source: "coder",
      provider: "anthropic",
      model: anthropicModel,
      agentId,
      runId,
      correlationId: options.correlationId,
      inputTokens: roundIn,
      outputTokens: roundOut,
      estimatedUsd: estimateCoderRunCostUsd(coderModelId, roundIn, roundOut, prompt),
    });
  };

  const apiKey = resolveAnthropicApiKey();
  if (!apiKey) {
    return finishAgentError(
      onEvent,
      runId,
      agentId,
      "No Anthropic API key found. Add one in the API Key Manager.",
      false,
    );
  }

  emitNarrate(onEvent, runId, agentId, narrateAgentStarting(agentId));

  const { systemPrompt: baseSystemPrompt, toolDefs } = resolveAgentSystemAndTools(agentId, composerMode);
  const { systemPrompt, passiveUserContext } = await systemPromptWithMemory(
    baseSystemPrompt,
    prompt,
    agentId,
  );
  const messages: AnthropicMessage[] = [{
    role: "user",
    content: appendPassiveUserContext(
      buildInitialUserMessage(
        agentId,
        prompt,
        options.codeWorkspaceRoot,
        options.coderBootstrapContext,
      ),
      passiveUserContext,
    ),
  }];
  let runOutputPath: string | undefined;
  let runOutputText = "";

  for (let iteration = 0; iteration < MAX_LOOP_ITERATIONS; iteration++) {
    const _cancelled = emitCancelled(onEvent, runId, agentId, signal);
    if (_cancelled) return _cancelled;

    const trimmedMessages = trimMessages(messages);

    let response: Response;
    try {
      response = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: anthropicModel,
          max_tokens: MAX_TOKENS,
          system: systemPrompt,
          tools: toolDefs,
          stream: true,
          messages: trimmedMessages,
        }),
        signal,
      });
    } catch (err) {
      const _cancelled = emitCancelled(onEvent, runId, agentId, signal);
    if (_cancelled) return _cancelled;
      const msg = err instanceof Error ? err.message : String(err);
      return finishAgentError(onEvent, runId, agentId, `Network error: ${msg}`, false);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return finishAgentError(
        onEvent,
        runId,
        agentId,
        `Anthropic API error ${response.status}: ${body.slice(0, 200)}`,
        false,
      );
    }

    const assistantBlocks: ContentBlock[] = [];

    let currentBlockType: string | null = null;
    let currentBlockId: string | null = null;
    let currentBlockName: string | null = null;
    let currentTextAccum = "";
    let currentJsonAccum = "";
    let stopReason: string | null = null;
    let roundInputTokens = 0;
    let roundOutputTokens = 0;

    const flushCurrentBlock = (): void => {
      if (currentBlockType === "text" && currentTextAccum) {
        assistantBlocks.push({ type: "text", text: currentTextAccum });
      } else if (currentBlockType === "tool_use" && currentBlockId && currentBlockName) {
        let input: Record<string, unknown> = {};
        try { input = JSON.parse(currentJsonAccum) as Record<string, unknown>; } catch { /* ok */ }
        assistantBlocks.push({ type: "tool_use", id: currentBlockId, name: currentBlockName, input });
      }
      currentBlockType = null;
      currentBlockId = null;
      currentBlockName = null;
      currentTextAccum = "";
      currentJsonAccum = "";
    };

    for await (const sse of parseSse(response)) {
      const _cancelled = emitCancelled(onEvent, runId, agentId, signal);
    if (_cancelled) return _cancelled;
      if (!sse.data || sse.data === "[DONE]") continue;

      let parsed: Record<string, unknown>;
      try { parsed = JSON.parse(sse.data) as Record<string, unknown>; } catch { continue; }

      const type = parsed.type as string | undefined;

      if (type === "content_block_start") {
        flushCurrentBlock();
        const block = parsed.content_block as Record<string, unknown> | undefined;
        currentBlockType  = (block?.type as string)  ?? null;
        currentBlockId    = (block?.id as string)    ?? null;
        currentBlockName  = (block?.name as string)  ?? null;
        currentTextAccum  = (block?.text as string)  ?? "";
        currentJsonAccum  = "";
      } else if (type === "message_start") {
        const message = parsed.message as Record<string, unknown> | undefined;
        const usage = message?.usage as Record<string, unknown> | undefined;
        const input = usage?.input_tokens;
        if (typeof input === "number" && Number.isFinite(input)) {
          roundInputTokens = input;
        }
      } else if (type === "content_block_delta") {
        const delta     = parsed.delta as Record<string, unknown> | undefined;
        const deltaType = delta?.type as string | undefined;
        if (deltaType === "text_delta") {
          const chunk = (delta?.text as string) ?? "";
          currentTextAccum += chunk;
          emit(onEvent, runId, agentId, "text-delta", { text: chunk });
        } else if (deltaType === "input_json_delta") {
          currentJsonAccum += (delta?.partial_json as string) ?? "";
        }
      } else if (type === "content_block_stop") {
        flushCurrentBlock();
      } else if (type === "message_delta") {
        const delta = parsed.delta as Record<string, unknown> | undefined;
        stopReason = (delta?.stop_reason as string) ?? null;
        const usage = parsed.usage as Record<string, unknown> | undefined;
        const output = usage?.output_tokens;
        if (typeof output === "number" && Number.isFinite(output)) {
          roundOutputTokens = output;
        }
      }
    }

    flushCurrentBlock();

    if (roundInputTokens > 0 || roundOutputTokens > 0) {
      emitUsage(roundInputTokens, roundOutputTokens);
    }

    if (stopReason === "end_turn") {
      const turnText = extractTextBlocks(assistantBlocks);
      if (turnText) {
        runOutputText = turnText;
      }
      return finishAgentDone(onEvent, runId, agentId, undefined, runOutputPath, runOutputText || undefined);
    }

    if (stopReason === "tool_use") {
      const toolUseBlocks = assistantBlocks.filter(
        (b): b is ToolUseBlock => b.type === "tool_use",
      );
      const toolResults: ToolResultBlock[] = [];

      for (const block of toolUseBlocks) {
        const _cancelled = emitCancelled(onEvent, runId, agentId, signal);
    if (_cancelled) return _cancelled;

        const toolInput = block.input as Record<string, unknown>;
        const startPreview = CODER_WRITE_TOOLS.has(block.name) && options.projectRoot?.trim()
          ? await buildWriteToolStartPreview(block.name, toolInput, options.projectRoot)
          : undefined;

        emit(onEvent, runId, agentId, "tool-start", {
          toolName: block.name,
          toolInput: block.input,
          pendingToolId: block.id,
          pendingApproval: startPreview,
        });
        if (!CODER_WRITE_TOOLS.has(block.name)) {
          emitNarrate(onEvent, runId, agentId, narrateToolStart(block.name, block.input));
        }

        if (SERVER_SIDE_TOOLS.has(block.name)) {
          emit(onEvent, runId, agentId, "tool-done", {
            toolName: block.name,
            toolInput: block.input,
            pendingToolId: block.id,
            toolResult: "Searching the web…",
          });
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: SERVER_SIDE_TOOL_RESULT,
          });
          continue;
        }

        let result: ToolExecutionResult;
        try {
          result = await executeTool(block.name, block.input, outputDir, signal, block.id, {
            projectRoot: options.projectRoot,
            approvalGate: options.approvalGate,
            terminalCwd: options.terminalCwd,
          });
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") {
            const _cancelled = emitCancelled(onEvent, runId, agentId, signal);
    if (_cancelled) return _cancelled;
            result = { text: "Tool cancelled." };
          } else {
            result = { text: `Tool error: ${err instanceof Error ? err.message : String(err)}` };
          }
        }

        emit(onEvent, runId, agentId, "tool-done", {
          toolName: block.name,
          toolInput: block.input,
          pendingToolId: block.id,
          toolResult: result.text,
          pendingApproval: result.changePreview,
          savedFilePath: result.savedFilePath,
          changeLogEntry: result.changeLogEntry
            ? { ...result.changeLogEntry, runId }
            : undefined,
          commandReceipt: result.commandReceipt,
        });
        if (result.savedFilePath) {
          runOutputPath = result.savedFilePath;
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: truncateToolResult(result.text),
        });
      }

      messages.push({ role: "assistant", content: assistantBlocks });
      if (toolResults.length > 0) {
        messages.push({ role: "user", content: toolResults });
      }
      if (messages.length > MAX_CONVERSATION_MESSAGES + 1) {
        const kept = trimMessages(messages);
        messages.length = 0;
        messages.push(...kept);
      }
      continue;
    }

    if (stopReason === "max_tokens") {
      return finishAgentError(
        onEvent,
        runId,
        agentId,
        "Response reached the token limit before completing.",
        false,
      );
    }

    if (stopReason == null) {
      return finishAgentError(
        onEvent,
        runId,
        agentId,
        "Stream ended unexpectedly before the model finished.",
        false,
      );
    }

    emit(onEvent, runId, agentId, "done");
    return finishAgentDone(
      onEvent,
      runId,
      agentId,
      undefined,
      runOutputPath,
      runOutputText || lastAssistantTextFromAnthropicMessages(messages) || undefined,
    );
  }

  return finishAgentDoneWithCapturedOutput(
    onEvent,
    runId,
    agentId,
    "Agent exceeded maximum loop iterations. Stopping.",
    runOutputPath,
    runOutputText || lastAssistantTextFromAnthropicMessages(messages) || undefined,
  );
}
