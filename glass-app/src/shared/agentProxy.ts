/**
 * IIVO Glass — Agent API Interception (shared logic)
 *
 * When a Wingman session has agent interception enabled, Glass runs a local
 * HTTP proxy on localhost. AI coding tools (Claude Code, Cursor, etc.) are
 * pointed at this proxy via ANTHROPIC_BASE_URL. Glass forwards all traffic
 * to the real Anthropic API and captures a minimal summary of each call.
 *
 * Privacy contract — enforced in this module, not just documented:
 *   1. API keys are stripped before ANYTHING is logged. Glass never stores
 *      or sees the user's Anthropic API key.
 *   2. Only snippets are captured — system prompt ≤200 chars, user message
 *      ≤300 chars, response ≤300 chars. Full content is never stored.
 *   3. Tool call INPUTS and OUTPUTS are never captured — they may contain
 *      file contents, environment variables, or secrets.
 *   4. Tool NAMES are captured (safe: just identifiers like "read_file").
 *   5. All captured data is on-device only. Nothing is sent to any server.
 *   6. Data is session-scoped. When the session ends, the proxy stops and
 *      the in-memory data is cleared (unless the user saves the session).
 *
 * Pure module — no Electron/fs/net imports. All I/O happens in
 * src/main/agentProxyServer.ts. This file: types, sanitization, analysis.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum characters to capture from the system prompt. */
export const SYSTEM_PROMPT_SNIPPET_LEN = 200;

/** Maximum characters to capture from the user message. */
export const USER_MESSAGE_SNIPPET_LEN = 300;

/** Maximum characters to capture from the AI response. */
export const RESPONSE_SNIPPET_LEN = 300;

/** Maximum agent calls shown in prompt output. */
export const MAX_CALLS_IN_PROMPT = 10;

/** Headers that must always be stripped before logging. */
const SENSITIVE_HEADERS = new Set([
  "x-api-key",
  "authorization",
  "x-auth-token",
  "api-key",
  "openai-api-key",
  "anthropic-api-key",
  "x-goog-api-key",
  "x-deepseek-api-key",
]);

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A single AI agent API call, minimized for privacy.
 * Full content is never stored — only truncated snippets.
 */
export interface AgentCallSummary {
  id: string;
  timestamp: number;
  /** Model name, e.g. "claude-opus-4-5" */
  model: string;
  /**
   * First ≤200 chars of the system prompt.
   * Undefined if no system prompt was present.
   */
  systemPromptSnippet?: string;
  /**
   * First ≤300 chars of the last user message in the conversation.
   * This is the most recent "what did the agent ask for" signal.
   */
  userMessageSnippet: string;
  /**
   * First ≤300 chars of the AI response text.
   * For streaming calls, accumulated from text_delta events.
   */
  responseSnippet: string;
  /** Token counts from the response, when available. */
  inputTokens?: number;
  outputTokens?: number;
  /** True if the response included tool use blocks. */
  hasToolUse: boolean;
  /**
   * Names of tools the agent attempted to call.
   * Inputs/outputs are never captured — names only.
   */
  toolNames: string[];
  /** Whether this was a streaming request (stream: true). */
  wasStreaming: boolean;
}

/** How well agent activity matches the session goal. */
export type AgentScopeHint =
  | "on-track"       // agent requests appear related to goal
  | "possible-drift" // some requests appear unrelated
  | "significant-drift" // most requests appear unrelated
  | "unknown";       // not enough signal

export interface AgentScopeResult {
  scopeHint: AgentScopeHint;
  scopeNote: string;
}

// ─── Header sanitization ──────────────────────────────────────────────────────

/**
 * Remove all authentication and secret headers from a headers object.
 * Returns a new object — never mutates the input.
 *
 * This is the FIRST thing called on any incoming request data before
 * any other processing. The API key never touches our capture logic.
 */
export function sanitizeHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string | string[] | undefined> {
  const safe: Record<string, string | string[] | undefined> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!SENSITIVE_HEADERS.has(key.toLowerCase())) {
      safe[key] = value;
    }
  }
  return safe;
}

// ─── Request body parsing ─────────────────────────────────────────────────────

/**
 * Extract a snippet from a parsed Anthropic API request body.
 *
 * Handles the Anthropic Messages API shape:
 *   { model, system?, messages: [{role, content}], stream? }
 *
 * Tool call inputs are explicitly excluded.
 */
export function extractRequestSnippets(body: unknown): {
  model: string;
  systemPromptSnippet?: string;
  userMessageSnippet: string;
  wasStreaming: boolean;
} {
  if (!body || typeof body !== "object") {
    return { model: "unknown", userMessageSnippet: "(unparseable request)", wasStreaming: false };
  }

  const b = body as Record<string, unknown>;
  const model = typeof b["model"] === "string" ? b["model"] : "unknown";
  const wasStreaming = b["stream"] === true;

  // System prompt snippet
  let systemPromptSnippet: string | undefined;
  if (typeof b["system"] === "string" && b["system"].length > 0) {
    systemPromptSnippet = b["system"].slice(0, SYSTEM_PROMPT_SNIPPET_LEN);
    if ((b["system"] as string).length > SYSTEM_PROMPT_SNIPPET_LEN) {
      systemPromptSnippet += "…";
    }
  } else if (Array.isArray(b["system"])) {
    // System can be an array of content blocks
    const text = b["system"]
      .filter((s: unknown) => typeof s === "object" && s !== null && (s as Record<string, unknown>)["type"] === "text")
      .map((s: unknown) => (s as Record<string, unknown>)["text"] as string)
      .join(" ");
    if (text.length > 0) {
      systemPromptSnippet = text.slice(0, SYSTEM_PROMPT_SNIPPET_LEN);
      if (text.length > SYSTEM_PROMPT_SNIPPET_LEN) systemPromptSnippet += "…";
    }
  }

  // User message snippet — last user turn
  let userMessageSnippet = "(no user message found)";
  if (Array.isArray(b["messages"])) {
    const userMessages = (b["messages"] as unknown[]).filter(
      (m) =>
        typeof m === "object" &&
        m !== null &&
        (m as Record<string, unknown>)["role"] === "user",
    );
    const lastUser = userMessages[userMessages.length - 1];
    if (lastUser) {
      const content = (lastUser as Record<string, unknown>)["content"];
      if (typeof content === "string") {
        userMessageSnippet = content.slice(0, USER_MESSAGE_SNIPPET_LEN);
        if (content.length > USER_MESSAGE_SNIPPET_LEN) userMessageSnippet += "…";
      } else if (Array.isArray(content)) {
        // Content blocks — extract text blocks only, skip tool_result
        const text = content
          .filter(
            (block: unknown) =>
              typeof block === "object" &&
              block !== null &&
              (block as Record<string, unknown>)["type"] === "text",
          )
          .map((block: unknown) => (block as Record<string, unknown>)["text"] as string)
          .join(" ");
        userMessageSnippet = text.slice(0, USER_MESSAGE_SNIPPET_LEN);
        if (text.length > USER_MESSAGE_SNIPPET_LEN) userMessageSnippet += "…";
      }
    }
  }

  return { model, systemPromptSnippet, userMessageSnippet, wasStreaming };
}

// ─── Response body parsing ────────────────────────────────────────────────────

/**
 * Extract a snippet and metadata from a parsed Anthropic API response body.
 *
 * Tool use INPUT blocks are skipped. Tool names are captured.
 * Tool OUTPUT (tool_result) blocks are never in a response — they appear
 * in the next user message, which is also not fully captured.
 */
export function extractResponseSnippets(body: unknown): {
  responseSnippet: string;
  inputTokens?: number;
  outputTokens?: number;
  hasToolUse: boolean;
  toolNames: string[];
} {
  if (!body || typeof body !== "object") {
    return { responseSnippet: "(unparseable response)", hasToolUse: false, toolNames: [] };
  }

  const b = body as Record<string, unknown>;
  let responseSnippet = "";
  let hasToolUse = false;
  const toolNames: string[] = [];

  // Token usage
  const usage = b["usage"] as Record<string, unknown> | undefined;
  const inputTokens =
    typeof usage?.["input_tokens"] === "number" ? usage["input_tokens"] as number : undefined;
  const outputTokens =
    typeof usage?.["output_tokens"] === "number" ? usage["output_tokens"] as number : undefined;

  // Content blocks
  if (Array.isArray(b["content"])) {
    for (const block of b["content"] as unknown[]) {
      if (typeof block !== "object" || block === null) continue;
      const blk = block as Record<string, unknown>;

      if (blk["type"] === "text" && typeof blk["text"] === "string") {
        responseSnippet += blk["text"];
      } else if (blk["type"] === "tool_use") {
        hasToolUse = true;
        // Capture name only — never the input
        if (typeof blk["name"] === "string") {
          toolNames.push(blk["name"]);
        }
      }
    }
  }

  // Truncate response
  if (responseSnippet.length > RESPONSE_SNIPPET_LEN) {
    responseSnippet = responseSnippet.slice(0, RESPONSE_SNIPPET_LEN) + "…";
  }
  if (!responseSnippet && hasToolUse) {
    responseSnippet = `(tool use: ${toolNames.join(", ")})`;
  }
  if (!responseSnippet) {
    responseSnippet = "(empty response)";
  }

  return { responseSnippet, inputTokens, outputTokens, hasToolUse, toolNames };
}

/**
 * Extract snippets from a streamed SSE response.
 *
 * SSE events from Anthropic look like:
 *   data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}
 *   data: {"type":"content_block_delta","delta":{"type":"input_json_delta","partial_json":"..."}}
 *
 * We accumulate text_delta only, stop once we have RESPONSE_SNIPPET_LEN chars.
 * input_json_delta (tool inputs) are never captured.
 */
export function extractStreamingSnippets(rawSse: string): {
  responseSnippet: string;
  inputTokens?: number;
  outputTokens?: number;
  hasToolUse: boolean;
  toolNames: string[];
} {
  let accumulated = "";
  let hasToolUse = false;
  const toolNames: string[] = [];
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;

  for (const line of rawSse.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    const json = line.slice("data: ".length).trim();
    if (json === "[DONE]") break;

    let event: Record<string, unknown>;
    try {
      event = JSON.parse(json) as Record<string, unknown>;
    } catch {
      continue;
    }

    const type = event["type"];

    if (type === "content_block_start") {
      const block = event["content_block"] as Record<string, unknown> | undefined;
      if (block?.["type"] === "tool_use") {
        hasToolUse = true;
        if (typeof block["name"] === "string") {
          toolNames.push(block["name"]);
        }
      }
    }

    if (type === "content_block_delta") {
      const delta = event["delta"] as Record<string, unknown> | undefined;
      if (delta?.["type"] === "text_delta" && typeof delta["text"] === "string") {
        // Only accumulate up to our cap — discard the rest
        if (accumulated.length < RESPONSE_SNIPPET_LEN) {
          accumulated += delta["text"];
        }
      }
      // input_json_delta (tool inputs) — explicitly ignored
    }

    if (type === "message_delta") {
      const usage = (event["usage"] as Record<string, unknown>) ?? {};
      if (typeof usage["output_tokens"] === "number") outputTokens = usage["output_tokens"] as number;
    }

    if (type === "message_start") {
      const msg = event["message"] as Record<string, unknown> | undefined;
      const usage = msg?.["usage"] as Record<string, unknown> | undefined;
      if (typeof usage?.["input_tokens"] === "number") inputTokens = usage["input_tokens"] as number;
    }
  }

  let responseSnippet = accumulated.slice(0, RESPONSE_SNIPPET_LEN);
  if (accumulated.length > RESPONSE_SNIPPET_LEN) responseSnippet += "…";
  if (!responseSnippet && hasToolUse) responseSnippet = `(tool use: ${toolNames.join(", ")})`;
  if (!responseSnippet) responseSnippet = "(empty response)";

  return { responseSnippet, inputTokens, outputTokens, hasToolUse, toolNames };
}

// ─── Full call builder ────────────────────────────────────────────────────────

/**
 * Build a complete AgentCallSummary from parsed request + response data.
 * This is the main assembly point after sanitization + snippet extraction.
 */
export function buildAgentCallSummary(
  id: string,
  timestamp: number,
  request: ReturnType<typeof extractRequestSnippets>,
  response: ReturnType<typeof extractResponseSnippets> | ReturnType<typeof extractStreamingSnippets>,
): AgentCallSummary {
  return {
    id,
    timestamp,
    model: request.model,
    systemPromptSnippet: request.systemPromptSnippet,
    userMessageSnippet: request.userMessageSnippet,
    responseSnippet: response.responseSnippet,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
    hasToolUse: response.hasToolUse,
    toolNames: response.toolNames,
    wasStreaming: request.wasStreaming,
  };
}

// ─── Scope analysis ───────────────────────────────────────────────────────────

/** Stop words excluded from goal term extraction. */
const STOP_WORDS = new Set([
  "fix", "the", "a", "an", "in", "on", "at", "to", "for", "of", "and", "or",
  "with", "add", "update", "change", "make", "build", "create", "write",
  "run", "debug", "check", "get", "set", "use", "from", "by", "that", "this",
  "is", "are", "was", "were", "be", "been", "have", "has", "had", "do",
  "does", "did", "not", "no", "so", "but", "if", "then", "when", "what",
  "how", "why", "which", "who", "need", "should", "would", "could", "also",
  "some", "all", "new", "old", "now", "after", "before", "just", "only",
]);

/**
 * Analyse whether the agent's calls appear related to the session goal.
 * Uses keyword matching between goal terms and user message + response snippets.
 */
export function analyzeAgentScope(
  goal: string,
  calls: AgentCallSummary[],
): AgentScopeResult {
  if (calls.length === 0) {
    return { scopeHint: "unknown", scopeNote: "No agent calls were intercepted." };
  }

  const goalTerms = goal
    .toLowerCase()
    .replace(/[^a-z0-9\s/-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));

  if (goalTerms.length === 0) {
    return {
      scopeHint: "unknown",
      scopeNote: "Goal is too short or generic to analyse agent scope.",
    };
  }

  let matched = 0;
  let total = 0;

  for (const call of calls) {
    const haystack = `${call.userMessageSnippet} ${call.responseSnippet} ${call.toolNames.join(" ")}`.toLowerCase();
    const isMatch = goalTerms.some((term) => haystack.includes(term));
    if (isMatch) matched++;
    total++;
  }

  const driftRatio = (total - matched) / total;

  if (driftRatio === 0) {
    return {
      scopeHint: "on-track",
      scopeNote: `All ${total} agent call${total === 1 ? "" : "s"} appear related to the goal.`,
    };
  }

  if (driftRatio <= 0.25) {
    return {
      scopeHint: "possible-drift",
      scopeNote: `${total - matched} of ${total} agent call${total === 1 ? "" : "s"} may be outside the goal's scope.`,
    };
  }

  return {
    scopeHint: "significant-drift",
    scopeNote: `${total - matched} of ${total} agent calls appear unrelated to the goal. Review what the agent was doing.`,
  };
}

// ─── Prompt formatter ─────────────────────────────────────────────────────────

/**
 * Format agent call summaries for inclusion in the Wingman AI report prompt.
 * Token-efficient — shows at most MAX_CALLS_IN_PROMPT calls.
 */
export function formatCallsForPrompt(calls: AgentCallSummary[]): string {
  if (calls.length === 0) {
    return "AGENT CALLS\nNo agent API calls were intercepted during this session.";
  }

  const lines: string[] = [
    "AGENT CALLS (snippets only — full content not captured for privacy)",
    `${calls.length} call${calls.length === 1 ? "" : "s"} intercepted`,
    "",
  ];

  const shown = calls.slice(0, MAX_CALLS_IN_PROMPT);
  for (const [i, call] of shown.entries()) {
    const tools = call.hasToolUse ? ` [tools: ${call.toolNames.join(", ")}]` : "";
    const tokens =
      call.inputTokens !== undefined
        ? ` (${call.inputTokens}in / ${call.outputTokens ?? "?"}out tokens)`
        : "";
    lines.push(`Call ${i + 1} [${call.model}]${tokens}${tools}`);
    if (call.systemPromptSnippet) {
      lines.push(`  System: ${call.systemPromptSnippet}`);
    }
    lines.push(`  Asked: ${call.userMessageSnippet}`);
    lines.push(`  Response: ${call.responseSnippet}`);
    lines.push("");
  }

  if (calls.length > MAX_CALLS_IN_PROMPT) {
    lines.push(`… and ${calls.length - MAX_CALLS_IN_PROMPT} more calls`);
  }

  return lines.join("\n");
}

// ─── Display helpers ──────────────────────────────────────────────────────────

/** Shorten a model name for compact display. */
export function shortModelName(model: string): string {
  // "claude-opus-4-6" → "opus 4"
  // "claude-sonnet-4-6" → "sonnet 4"
  // "claude-haiku-4-5-20251001" → "haiku 4"
  const m = model.toLowerCase().replace(/^claude-/, "");
  const parts = m.split("-");
  if (parts.length >= 2) {
    return `${parts[0]} ${parts[1]}`;
  }
  return model.slice(0, 12);
}

/** Format timestamp as HH:MM. */
export function formatCallTime(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, "0");
  const mn = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${mn}`;
}
