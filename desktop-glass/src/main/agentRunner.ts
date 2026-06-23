/**
 * Glass Agent Runner
 *
 * Runs a simple agentic loop using the Anthropic Messages API (streaming).
 *
 * Supported tools (per-agent):
 *   research  — web_search (server-side), write_file
 *   code      — read_file, list_directory, search_files, write_file
 *   writing   — web_search (server-side), write_file
 *   coder     — read_file, list_directory, search_files, edit_file, create_file, delete_file (approval-gated)
 *
 * The loop broadcasts AgentEvent payloads via the IPC `agentEvent` channel so
 * any renderer window can subscribe and display live progress.
 */

import { execFile, spawn } from "node:child_process";
import { mkdir, open, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { promisify } from "node:util";
import { listApiKeys, getApiKeyValue } from "./apiKeyStore.ts";
import { AGENT_SYSTEM_PROMPTS, AGENT_TOOLS } from "./agents/definitions.ts";
import { applyCodeToFile, readFileForDiff } from "./glassActions.ts";
import { verifyAppliedFile } from "./agentBuildVerify.ts";
import {
  assertPathInProjectRoot,
  expandAgentPath,
  proposeCreateContent,
  proposeDeleteContent,
  proposeEditContent,
  relativePathFromRoot,
} from "./agentCoderTools.ts";
import type {
  AgentEvent,
  AgentEventKind,
  AgentPendingApprovalPayload,
  GlassAgentId,
} from "../shared/ipc.ts";
import {
  narrateAgentDone,
  narrateAgentStarting,
  narrateToolStart,
} from "../shared/agentNarration.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MODEL = "claude-opus-4-6";
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

function resolveAnthropicKey(): string | null {
  const keys = listApiKeys();
  for (const meta of keys) {
    if (meta.service.toLowerCase().includes("anthropic")) {
      const value = getApiKeyValue(meta.id);
      if (value) return value;
    }
  }
  return process.env.ANTHROPIC_API_KEY?.trim() ?? null;
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
  const pathErr = assertPathInProjectRoot(filePath, projectRoot);
  if (pathErr) return { text: `Error: ${pathErr}` };

  const read = await readFileForDiff(filePath);
  if (!read.ok) return { text: `Error: ${read.message ?? "Failed to read file"}` };
  if (!read.existed) return { text: "Error: file does not exist — use create_file for new files" };

  const proposal = proposeEditContent(
    filePath,
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
  const pathErr = assertPathInProjectRoot(filePath, projectRoot);
  if (pathErr) return { text: `Error: ${pathErr}` };

  const resolved = expandAgentPath(filePath);
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
  const pathErr = assertPathInProjectRoot(filePath, projectRoot);
  if (pathErr) return { text: `Error: ${pathErr}` };

  const read = await readFileForDiff(filePath);
  if (!read.ok) return { text: `Error: ${read.message ?? "Failed to read file"}` };
  if (!read.existed) return { text: "Error: file does not exist" };

  const proposal = proposeDeleteContent(
    filePath,
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
  options: Pick<AgentRunOptions, "projectRoot" | "approvalGate">,
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
  onEvent: AgentEventCallback;
  signal?: AbortSignal;
}

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
): boolean {
  if (!signal?.aborted) return false;
  emit(onEvent, runId, agentId, "cancelled");
  return true;
}

/**
 * Run the agent loop. Resolves when the agent finishes or errors.
 */
export async function runAgent(options: AgentRunOptions): Promise<void> {
  const { runId, agentId, prompt, onEvent, signal } = options;
  const outputDir = options.outputDir ?? FALLBACK_OUTPUT_DIR;

  const apiKey = resolveAnthropicKey();
  if (!apiKey) {
    emit(onEvent, runId, agentId, "error", {
      error: "No Anthropic API key found. Add one in the API Key Manager.",
    });
    return;
  }

  emitNarrate(onEvent, runId, agentId, narrateAgentStarting(agentId));

  const systemPrompt = AGENT_SYSTEM_PROMPTS[agentId];
  const toolDefs     = AGENT_TOOLS[agentId];
  const messages: AnthropicMessage[] = [{
    role: "user",
    content: buildInitialUserMessage(
      agentId,
      prompt,
      options.codeWorkspaceRoot,
      options.coderBootstrapContext,
    ),
  }];

  for (let iteration = 0; iteration < MAX_LOOP_ITERATIONS; iteration++) {
    if (emitCancelled(onEvent, runId, agentId, signal)) return;

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
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: systemPrompt,
          tools: toolDefs,
          stream: true,
          messages: trimmedMessages,
        }),
        signal,
      });
    } catch (err) {
      if (emitCancelled(onEvent, runId, agentId, signal)) return;
      const msg = err instanceof Error ? err.message : String(err);
      emit(onEvent, runId, agentId, "error", { error: `Network error: ${msg}` });
      return;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      emit(onEvent, runId, agentId, "error", {
        error: `Anthropic API error ${response.status}: ${body.slice(0, 200)}`,
      });
      return;
    }

    const assistantBlocks: ContentBlock[] = [];

    let currentBlockType: string | null = null;
    let currentBlockId: string | null = null;
    let currentBlockName: string | null = null;
    let currentTextAccum = "";
    let currentJsonAccum = "";
    let stopReason: string | null = null;

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
      if (emitCancelled(onEvent, runId, agentId, signal)) return;
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
      }
    }

    flushCurrentBlock();

    if (stopReason === "end_turn") {
      emitNarrate(onEvent, runId, agentId, narrateAgentDone());
      emit(onEvent, runId, agentId, "done");
      return;
    }

    if (stopReason === "tool_use") {
      const toolUseBlocks = assistantBlocks.filter(
        (b): b is ToolUseBlock => b.type === "tool_use",
      );
      const toolResults: ToolResultBlock[] = [];

      for (const block of toolUseBlocks) {
        if (emitCancelled(onEvent, runId, agentId, signal)) return;

        emit(onEvent, runId, agentId, "tool-start", {
          toolName: block.name,
          toolInput: block.input,
        });
        if (!CODER_WRITE_TOOLS.has(block.name)) {
          emitNarrate(onEvent, runId, agentId, narrateToolStart(block.name, block.input));
        }

        if (SERVER_SIDE_TOOLS.has(block.name)) {
          emit(onEvent, runId, agentId, "tool-done", {
            toolName: block.name,
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
          });
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") {
            if (emitCancelled(onEvent, runId, agentId, signal)) return;
            result = { text: "Tool cancelled." };
          } else {
            result = { text: `Tool error: ${err instanceof Error ? err.message : String(err)}` };
          }
        }

        emit(onEvent, runId, agentId, "tool-done", {
          toolName: block.name,
          toolResult: result.text,
          savedFilePath: result.savedFilePath,
          changeLogEntry: result.changeLogEntry
            ? { ...result.changeLogEntry, runId }
            : undefined,
        });

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
      emit(onEvent, runId, agentId, "error", {
        error: "Response reached the token limit before completing.",
      });
      return;
    }

    if (stopReason == null) {
      emit(onEvent, runId, agentId, "error", {
        error: "Stream ended unexpectedly before the model finished.",
      });
      return;
    }

    emit(onEvent, runId, agentId, "done");
    return;
  }

  emit(onEvent, runId, agentId, "error", {
    error: "Agent exceeded maximum loop iterations. Stopping.",
  });
}
