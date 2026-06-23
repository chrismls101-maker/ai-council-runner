/**
 * IIVO Terminal — standalone Electron main process.
 *
 * Ships the IIVO Glass built-in terminal (GlassTerminalPanel) as a normal macOS
 * desktop app: one regular window, Dock icon, native title bar — no overlay, no
 * transparency, no always-on-top.
 *
 * It reuses the existing Glass modules (PTY manager, API-key store, AI ask
 * client, scrollback store, terminal-context buffer, terminal-fix engine) and
 * the existing preload bridge, so the renderer talks to it through the exact
 * same `window.glass` API. Only the handful of IPC channels the terminal panel
 * actually uses are wired here — none of the overlay / Glass-specific channels.
 */

import { app, BrowserWindow, clipboard, ipcMain, screen } from "electron";
import path from "node:path";
import { homedir } from "node:os";

import { IPC } from "../shared/ipc.ts";
import type {
  GlassState,
  GlassCommand,
  ApiKeySaveRequest,
  TerminalExplainRequest,
  TerminalExplainResponse,
  NlToShellRequest,
  NlToShellResponse,
  VoiceShellTranscribeRequest,
  VoiceShellTranscribeResponse,
  TerminalVisionRequest,
  TerminalVisionResponse,
  TerminalSuggestRequest,
  TerminalSuggestResponse,
  TerminalSuggestion,
  TerminalContextBlock,
  ScrollbackWriteBlock,
  ScrollbackSearchRequest,
  ScrollbackSearchResponse,
  TerminalFixRequest,
  TerminalFixResponse,
} from "../shared/ipc.ts";
import { resolveConfig } from "../shared/config.ts";
import { loadGlassEnv } from "./loadGlassEnv.ts";
import { askIivoGlass } from "./glassAskClient.ts";
import {
  createPtySession,
  writePtyInput,
  resizePty,
  killPtySession,
  killAllPtySessions,
  getPtyReplayBuffer,
  getPtyReplayBufferFrom,
  getPtyReplayBufferLength,
  getForegroundProcessName,
  getActivePtySessionIds,
} from "./glassTerminal.ts";
import {
  registerSession as registerScrollbackSession,
  writeBlocks as writeScrollbackBlocks,
  getRecentSummary as getScrollbackRecentSummary,
  getByIdsInOrder as getScrollbackByIdsInOrder,
  closeDb as closeScrollbackDb,
} from "./scrollbackStore.ts";
import {
  normalizeScrollbackWriteBlocks,
  parseScrollbackSearchIds,
} from "./scrollbackValidation.ts";
import {
  normalizeTerminalContextBlocks,
  pushTerminalContext,
  clearTerminalContext,
} from "./terminalContext.ts";
import { buildTerminalFixPrompt, parseTerminalFixResponse } from "./terminalFixEngine.ts";
import {
  isApiKeyEncryptionAvailable,
  listApiKeys,
  getApiKeyValue,
  saveApiKey,
  deleteApiKey,
  touchApiKey,
} from "./apiKeyStore.ts";
import { fallbackState } from "../renderer/useGlassState.ts";

loadGlassEnv();

function seedEnvKeysFromEnv(): void {
  if (!isApiKeyEncryptionAvailable()) return;
  try {
    const existing = new Set(listApiKeys().map((k) => k.id));

    const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (anthropicKey && !existing.has("key_anthropic_standalone")) {
      saveApiKey(
        {
          id: "key_anthropic_standalone",
          service: "Anthropic",
          label: "API Key",
          environment: "prod",
          createdAt: Date.now(),
          lastUsedAt: null,
        },
        anthropicKey,
      );
    }

    const deepgramKey = process.env.DEEPGRAM_API_KEY?.trim();
    if (deepgramKey && !existing.has("key_deepgram_standalone")) {
      saveApiKey(
        {
          id: "key_deepgram_standalone",
          service: "Deepgram",
          label: "API Key",
          environment: "prod",
          createdAt: Date.now(),
          lastUsedAt: null,
        },
        deepgramKey,
      );
    }
  } catch (err) {
    console.warn("[IIVO Terminal] Could not seed API keys from .env:", err);
  }
}

const config = resolveConfig(process.env);

// ---------------------------------------------------------------------------
// Minimal state — only the fields the terminal renderer reads. We start from
// the shared renderer fallback (a fully-typed GlassState with safe defaults)
// and override the terminal-relevant bits.
// ---------------------------------------------------------------------------

const state: GlassState = {
  ...fallbackState,
  config,
  iivoApiUrl: config.iivoApiUrl,
  iivoWebUrl: config.iivoWebUrl,
  glassDockTerminalOpen: true,
  glassDockTerminalId: undefined,
  glassDockTerminalTabs: [],
  glassTerminalPendingAction: undefined,
  extractBuildModeActive: false,
};

let mainWindow: BrowserWindow | null = null;
let appIsQuitting = false;

function snapshot(): GlassState {
  return state;
}

function push(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC.state, snapshot());
  }
}

// ---------------------------------------------------------------------------
// Terminal tabs (subset of the Glass logic in src/main/index.ts)
// ---------------------------------------------------------------------------

function getTerminalTabs(): Array<{ id: string }> {
  return state.glassDockTerminalTabs ?? [];
}

function setTerminalTabs(tabs: Array<{ id: string }>): void {
  state.glassDockTerminalTabs = tabs;
}

function pickLiveTerminalTabId(): string | undefined {
  const live = new Set(getActivePtySessionIds());
  const active = state.glassDockTerminalId;
  if (active && live.has(active)) return active;
  return getTerminalTabs().find((t) => live.has(t.id))?.id;
}

// ── Auto-title polling (#42) ────────────────────────────────────────────────
const titlePollIntervals = new Map<string, ReturnType<typeof setInterval>>();

function startTitlePolling(termId: string): void {
  stopTitlePolling(termId);
  const interval = setInterval(async () => {
    try {
      const title = await getForegroundProcessName(termId);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC.terminalTitleUpdate, termId, title);
      }
    } catch {
      /* ignore */
    }
  }, 2000);
  titlePollIntervals.set(termId, interval);
}

function stopTitlePolling(termId: string): void {
  const existing = titlePollIntervals.get(termId);
  if (existing) {
    clearInterval(existing);
    titlePollIntervals.delete(termId);
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC.terminalTitleUpdate, termId, null);
  }
}

function handlePtySessionData(id: string, data: string): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC.ptyData, id, data);
  }
}

function handlePtySessionExit(id: string): void {
  if (appIsQuitting) return;
  stopTitlePolling(id);
  setTerminalTabs(getTerminalTabs().filter((t) => t.id !== id));
  if (state.glassDockTerminalId === id) {
    state.glassDockTerminalId = pickLiveTerminalTabId();
  }
  push();
}

function spawnPtySession(): string {
  const termId = createPtySession({
    onData: handlePtySessionData,
    onExit: handlePtySessionExit,
  });
  setTerminalTabs([...getTerminalTabs(), { id: termId }]);
  state.glassDockTerminalId = termId;
  registerScrollbackSession(termId, homedir());
  startTitlePolling(termId);
  return termId;
}

function ensureTerminalSession(): string {
  const live = pickLiveTerminalTabId();
  if (live) {
    state.glassDockTerminalId = live;
    return live;
  }
  return spawnPtySession();
}

function isMainSender(sender: Electron.WebContents): boolean {
  return !!mainWindow && !mainWindow.isDestroyed() && sender === mainWindow.webContents;
}

// ---------------------------------------------------------------------------
// IPC — only the channels the terminal panel uses.
// ---------------------------------------------------------------------------

function registerIpc(): void {
  ipcMain.handle(IPC.getState, () => snapshot());

  // ── Command stream (terminal tab lifecycle) ───────────────────────────────
  ipcMain.on(IPC.command, (event, command: GlassCommand) => {
    if (!isMainSender(event.sender)) return;
    switch (command.type) {
      case "glass-terminal-open": {
        ensureTerminalSession();
        state.glassDockTerminalOpen = true;
        push();
        return;
      }
      case "glass-terminal-new-tab": {
        try {
          spawnPtySession();
          state.glassDockTerminalOpen = true;
          push();
        } catch (err) {
          state.lastError = err instanceof Error ? err.message : String(err);
          push();
        }
        return;
      }
      case "glass-terminal-switch-tab": {
        const { termId } = command;
        if (termId && getActivePtySessionIds().includes(termId)) {
          state.glassDockTerminalId = termId;
          push();
        }
        return;
      }
      case "glass-terminal-close-tab": {
        const termId = command.termId ?? state.glassDockTerminalId;
        if (termId) {
          stopTitlePolling(termId);
          killPtySession(termId);
          if (!pickLiveTerminalTabId()) {
            clearTerminalContext();
            // Standalone: closing the last tab spawns a fresh one rather than
            // dismissing the only window.
            spawnPtySession();
          }
        }
        push();
        return;
      }
      case "glass-terminal-close": {
        // No overlay to hide back to — keep the window, just ensure a session.
        ensureTerminalSession();
        push();
        return;
      }
      case "glass-terminal-pending-action-ack": {
        state.glassTerminalPendingAction = undefined;
        push();
        return;
      }
      default:
        return;
    }
  });

  // ── PTY I/O ───────────────────────────────────────────────────────────────
  ipcMain.on(IPC.ptyInput, (event, termId: string, data: string) => {
    if (!isMainSender(event.sender)) return;
    if (!getActivePtySessionIds().includes(termId) || typeof data !== "string") return;
    writePtyInput(termId, data);
  });

  ipcMain.on(IPC.ptyResize, (event, termId: string, cols: number, rows: number) => {
    if (!isMainSender(event.sender)) return;
    if (!getActivePtySessionIds().includes(termId)) return;
    resizePty(termId, cols, rows);
  });

  ipcMain.handle(IPC.ptyReplay, (event, termId: string, fromByte?: number) => {
    if (!isMainSender(event.sender)) return "";
    if (!getActivePtySessionIds().includes(termId)) return "";
    return typeof fromByte === "number"
      ? getPtyReplayBufferFrom(termId, fromByte)
      : getPtyReplayBuffer(termId);
  });

  ipcMain.handle(IPC.ptyReplayLength, (event, termId: string) => {
    if (!isMainSender(event.sender)) return 0;
    return getActivePtySessionIds().includes(termId) ? getPtyReplayBufferLength(termId) : 0;
  });

  // ── Clipboard ─────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.writeClipboard, (event, text: string) => {
    if (!isMainSender(event.sender)) return false;
    if (typeof text !== "string" || !text.trim()) return false;
    clipboard.writeText(text);
    return true;
  });

  // ── Terminal title update is push-only (handled by polling); no inbound. ────

  // ── Explain last error ──────────────────────────────────────────────────────
  ipcMain.handle(
    IPC.terminalExplain,
    async (event, payload: TerminalExplainRequest): Promise<TerminalExplainResponse> => {
      if (!isMainSender(event.sender)) return { error: "Unauthorized" };
      const command = typeof payload?.command === "string" ? payload.command.trim() : "";
      const output = typeof payload?.output === "string" ? payload.output.slice(0, 8000) : "";
      if (!command && !output) return { error: "No command or output provided" };

      const exitInfo = payload?.exitCode != null ? ` (exit code ${payload.exitCode})` : "";
      const prompt = [
        `The user ran this shell command${exitInfo}:`,
        "```",
        command || "(unknown command)",
        "```",
        "",
        output ? `It produced this output:\n\`\`\`\n${output}\n\`\`\`` : "It produced no output.",
        "",
        "In 2–3 sentences maximum: explain what went wrong and give one specific fix. Be direct and technical. Use inline code backticks for commands and paths. Do NOT restate the question.",
      ].join("\n");

      try {
        const response = await askIivoGlass(config, { prompt, responseStyle: "full" });
        const explanation = response.answer?.trim() ?? "";
        if (!explanation) return { error: "No explanation returned" };
        return { explanation };
      } catch (err) {
        return { error: err instanceof Error ? err.message : "Explanation failed" };
      }
    },
  );

  // ── Natural language → shell ────────────────────────────────────────────────
  ipcMain.handle(
    IPC.nlToShell,
    async (event, payload: NlToShellRequest): Promise<NlToShellResponse> => {
      if (!isMainSender(event.sender)) return { error: "Unauthorized" };
      const userPrompt = typeof payload?.prompt === "string" ? payload.prompt.trim() : "";
      if (!userPrompt) return { error: "No prompt provided" };

      const context = payload.recentCommands?.length
        ? `\nRecent commands:\n${payload.recentCommands.slice(-5).map((c) => `  ${c}`).join("\n")}`
        : "";

      const prompt = [
        "Convert the following natural language description into a single shell command for macOS/zsh.",
        "Rules:",
        "- Output ONLY the shell command, nothing else — no explanation, no markdown, no quotes, no backticks",
        "- If multiple commands are needed, join with && or | as appropriate",
        "- Prefer standard Unix tools (find, grep, awk, sed, ls, etc.)",
        "- Make the command safe — no destructive operations unless explicitly requested",
        context,
        "",
        `Task: ${userPrompt}`,
      ].join("\n");

      try {
        const response = await askIivoGlass(config, { prompt, responseStyle: "full" });
        const command = response.answer?.trim().replace(/^`+|`+$/g, "").trim() ?? "";
        if (!command) return { error: "No command returned" };
        return { command };
      } catch (err) {
        return { error: err instanceof Error ? err.message : "Conversion failed" };
      }
    },
  );

  // ── Voice → shell (Deepgram transcription) ──────────────────────────────────
  ipcMain.handle(
    IPC.voiceShellTranscribe,
    async (event, payload: VoiceShellTranscribeRequest): Promise<VoiceShellTranscribeResponse> => {
      if (!isMainSender(event.sender)) return { error: "Unauthorized" };

      const dgKey =
        process.env.DEEPGRAM_API_KEY?.trim() ||
        (() => {
          // Fall back to a Deepgram key saved via the API-key manager.
          try {
            const meta = listApiKeys().find((k) => k.service.toLowerCase().includes("deepgram"));
            return meta ? getApiKeyValue(meta.id)?.trim() ?? "" : "";
          } catch {
            return "";
          }
        })();

      if (!dgKey) {
        return { error: "Deepgram API key is not configured — add it in setup or set DEEPGRAM_API_KEY." };
      }

      const rawBuffer = payload?.buffer;
      const mimeType = typeof payload?.mimeType === "string" ? payload.mimeType : "audio/webm";
      if (!rawBuffer) return { error: "No audio buffer provided" };

      try {
        const audioBuffer = Buffer.isBuffer(rawBuffer)
          ? rawBuffer
          : Buffer.from(new Uint8Array(rawBuffer as ArrayBuffer));
        if (audioBuffer.byteLength === 0) return { error: "No audio captured" };
        const MAX_VOICE_AUDIO_BYTES = 5 * 1024 * 1024;
        if (audioBuffer.byteLength > MAX_VOICE_AUDIO_BYTES) {
          return { error: "Recording too long — try a shorter command." };
        }

        const url =
          "https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&punctuate=true&language=en";

        const response = await fetch(url, {
          method: "POST",
          headers: { Authorization: `Token ${dgKey}`, "Content-Type": mimeType },
          body: audioBuffer,
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => response.statusText);
          return { error: `Deepgram API error ${response.status}: ${errText.slice(0, 200)}` };
        }

        const data = (await response.json()) as {
          results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string }> }> };
        };
        const transcript =
          data?.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? "";
        if (!transcript) return { error: "No speech detected" };
        return { transcript };
      } catch (err) {
        return { error: err instanceof Error ? err.message : "Transcription failed" };
      }
    },
  );

  // ── Screen-aware vision analysis ────────────────────────────────────────────
  // Standalone build has no screen-capture pipeline (that lives in the overlay
  // app). Degrade gracefully with a clear message rather than crashing.
  ipcMain.handle(
    IPC.terminalVisionAnalyze,
    async (event, _payload: TerminalVisionRequest): Promise<TerminalVisionResponse> => {
      if (!isMainSender(event.sender)) return { error: "Unauthorized" };
      return { error: "Screen-aware analysis is only available in IIVO Glass." };
    },
  );

  // ── AI command suggestions ──────────────────────────────────────────────────
  ipcMain.handle(
    IPC.terminalSuggest,
    async (event, payload: TerminalSuggestRequest): Promise<TerminalSuggestResponse> => {
      if (!isMainSender(event.sender)) return { error: "Unauthorized" };
      try {
        const lastCommand = typeof payload?.lastCommand === "string" ? payload.lastCommand.trim() : "";
        const lastStatus =
          payload?.lastStatus === "error" || payload?.lastStatus === "success"
            ? payload.lastStatus
            : "unknown";
        const cwd = typeof payload?.cwd === "string" && payload.cwd ? payload.cwd : "~";
        const recentCommands = Array.isArray(payload?.recentCommands)
          ? payload.recentCommands.filter((c): c is string => typeof c === "string").slice(-5)
          : [];
        if (!lastCommand) return { error: "No command provided" };

        const prompt = [
          "You are a terminal assistant. Based on the last command and working directory, suggest 3 useful next commands the developer might want to run.",
          "",
          `Working directory: ${cwd}`,
          `Last command: ${lastCommand}`,
          `Status: ${lastStatus === "error" ? "FAILED" : "succeeded"}`,
          `Recent commands: ${recentCommands.join(", ")}`,
          "",
          "Respond with ONLY valid JSON — an array of exactly 3 objects:",
          `[{"command": "...", "why": "one short sentence"}, ...]`,
          "",
          "Rules:",
          "- Make suggestions specific to the actual command and directory context",
          "- If the last command FAILED, prioritize debug/fix suggestions",
          "- Commands must be real, runnable shell commands",
          `- Keep "why" under 8 words`,
          "- No markdown, no explanation outside the JSON array",
        ].join("\n");

        const response = await askIivoGlass(config, { prompt, responseStyle: "full" });
        let raw = response.answer?.trim() ?? "";
        if (!raw) return { error: "No suggestions returned" };
        raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          return { error: "Could not parse suggestions" };
        }
        if (!Array.isArray(parsed)) return { error: "Could not parse suggestions" };

        const suggestions: TerminalSuggestion[] = parsed
          .filter((s): s is { command: unknown; why: unknown } => !!s && typeof s === "object")
          .map((s) => ({
            command: typeof s.command === "string" ? s.command.trim() : "",
            why: typeof s.why === "string" ? s.why.trim() : "",
          }))
          .filter((s) => s.command.length > 0)
          .slice(0, 3);

        if (suggestions.length === 0) return { error: "Could not parse suggestions" };
        return { suggestions };
      } catch (err) {
        return { error: err instanceof Error ? err.message : "Suggestion failed" };
      }
    },
  );

  // ── Terminal AI context buffer ──────────────────────────────────────────────
  ipcMain.on(IPC.terminalContextPush, (event, blocks: TerminalContextBlock[]): void => {
    if (!isMainSender(event.sender)) return;
    if (!Array.isArray(blocks) || blocks.length === 0) {
      clearTerminalContext();
      return;
    }
    const normalized = normalizeTerminalContextBlocks(blocks);
    if (normalized.length === 0) {
      clearTerminalContext();
      return;
    }
    pushTerminalContext(normalized);
  });

  // ── Persistent scrollback ───────────────────────────────────────────────────
  ipcMain.on(IPC.scrollbackWrite, (event, blocks: ScrollbackWriteBlock[]): void => {
    if (!isMainSender(event.sender)) return;
    if (!Array.isArray(blocks) || blocks.length === 0) return;
    const normalized = normalizeScrollbackWriteBlocks(blocks);
    if (normalized.length === 0) return;
    writeScrollbackBlocks(normalized);
  });

  ipcMain.handle(
    IPC.scrollbackSearch,
    async (event, payload: ScrollbackSearchRequest): Promise<ScrollbackSearchResponse> => {
      if (!isMainSender(event.sender)) return { error: "Unauthorized" };
      const query = typeof payload?.query === "string" ? payload.query.trim() : "";
      if (!query) return { results: [] };

      const summary = getScrollbackRecentSummary(200);
      if (summary.length === 0) return { results: [] };

      const summaryText = summary
        .map((row) => {
          const date = new Date(row.started_at).toISOString().slice(0, 16);
          const statusMark = row.status === "error" ? "✗" : "✓";
          return `[id:${row.id}] ${date} ${statusMark} ${row.cwd ?? "~"} $ ${row.command_plain}`;
        })
        .join("\n");

      const prompt = [
        "You are searching a user's terminal command history.",
        "",
        "Command history (most recent first):",
        summaryText,
        "",
        `User query: "${query}"`,
        "",
        "Return ONLY a JSON array of the IDs (integers) of the commands that best match the query. Return at most 5 IDs, most relevant first. If nothing matches, return [].",
        "",
        "Example: [42, 17, 8]",
      ].join("\n");

      let raw = "";
      try {
        const response = await askIivoGlass(config, { prompt, responseStyle: "full" });
        raw = response.answer?.trim() ?? "";
      } catch (err) {
        return { error: err instanceof Error ? err.message : "Search failed" };
      }
      if (!raw) return { results: [] };

      let ids: number[] = [];
      try {
        const stripped = raw.replace(/```[a-z]*\n?/gi, "").replace(/```/g, "").trim();
        ids = parseScrollbackSearchIds(JSON.parse(stripped));
      } catch {
        return { error: "Could not parse search results" };
      }
      return { results: getScrollbackByIdsInOrder(ids) };
    },
  );

  // ── Terminal auto-fix ───────────────────────────────────────────────────────
  ipcMain.handle(
    IPC.terminalFix,
    async (event, payload: TerminalFixRequest): Promise<TerminalFixResponse> => {
      if (!isMainSender(event.sender)) return { error: "Unauthorized" };
      const command = typeof payload?.command === "string" ? payload.command.trim() : "";
      const output = typeof payload?.output === "string" ? payload.output.trim() : "";
      const exitCode = typeof payload?.exitCode === "number" ? payload.exitCode : 1;
      if (!command) return { error: "command is required" };
      try {
        const prompt = buildTerminalFixPrompt(command, output, exitCode, payload?.context);
        const response = await askIivoGlass(config, {
          prompt,
          modelPurpose: "default",
          responseStyle: "full",
        });
        const raw = response.answer?.trim() ?? "";
        if (!raw) return { error: "Empty response from AI" };
        const parsed = parseTerminalFixResponse(raw);
        if (!parsed.fixedCommand) {
          return { error: "No fix found", diagnosis: parsed.diagnosis ?? undefined };
        }
        return {
          fixedCommand: parsed.fixedCommand,
          diagnosis: parsed.diagnosis ?? undefined,
          whatChanged: parsed.whatChanged ?? undefined,
        };
      } catch (err) {
        return { error: err instanceof Error ? err.message : "Terminal fix failed" };
      }
    },
  );

  // ── API-key manager ─────────────────────────────────────────────────────────
  ipcMain.handle(IPC.apiKeyList, (event) => {
    if (!isMainSender(event.sender)) return { keys: [], error: "Unauthorized" };
    try {
      return { keys: listApiKeys(), encryptionAvailable: isApiKeyEncryptionAvailable() };
    } catch (err) {
      return {
        keys: [],
        error: err instanceof Error ? err.message : "List failed",
        encryptionAvailable: isApiKeyEncryptionAvailable(),
      };
    }
  });

  ipcMain.handle(IPC.apiKeyGetValue, (event, id: string) => {
    if (!isMainSender(event.sender)) return { value: null };
    if (typeof id !== "string" || !id) return { value: null };
    try {
      const value = getApiKeyValue(id);
      if (value !== null) touchApiKey(id);
      return { value };
    } catch {
      return { value: null };
    }
  });

  ipcMain.handle(IPC.apiKeySave, (event, payload: ApiKeySaveRequest) => {
    if (!isMainSender(event.sender)) return { ok: false, error: "Unauthorized" };
    const meta = payload?.meta;
    const value = typeof payload?.value === "string" ? payload.value.trim() : "";
    if (!meta || !meta.id || !value) return { ok: false, error: "Invalid key data" };
    try {
      saveApiKey(meta, value);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
    }
  });

  ipcMain.handle(IPC.apiKeyDelete, (event, id: string) => {
    if (!isMainSender(event.sender)) return { ok: false, error: "Unauthorized" };
    if (typeof id !== "string" || !id) return { ok: false, error: "Invalid key id" };
    try {
      deleteApiKey(id);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Delete failed" };
    }
  });
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

function createWindow(): void {
  const { x: areaX, y: areaY, width: areaW, height: areaH } = screen.getPrimaryDisplay().workArea;
  const width  = Math.min(Math.round(areaW * 0.70), 960);
  const height = Math.min(Math.round(areaH * 0.58), 580);
  // Place explicitly so the title bar is always below the macOS menu bar.
  const winX = areaX + Math.round((areaW - width)  / 2);
  const winY = areaY + Math.round((areaH - height) / 2);

  const win = new BrowserWindow({
    width,
    height,
    x: winX,
    y: winY,
    minWidth: 700,
    minHeight: 400,
    show: false,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0a0c12",
    webPreferences: {
      preload: path.join(import.meta.dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    title: "IIVO Terminal",
  });

  mainWindow = win;

  win.once("ready-to-show", () => {
    win.show();
    win.focus();
  });

  // Boot a PTY session up front so the terminal has something to attach to.
  ensureTerminalSession();

  const devUrl = process.env.ELECTRON_RENDERER_URL ?? "http://localhost:5174";
  if (!app.isPackaged) {
    void win.loadURL(devUrl).catch((err) => {
      console.error("[IIVO Terminal] Failed to load renderer:", devUrl, err);
    });
  } else {
    void win.loadFile(
      path.join(import.meta.dirname, "../../dist-standalone/renderer/index.html"),
    );
  }

  win.on("closed", () => {
    mainWindow = null;
  });
}

app.on("ready", () => {
  seedEnvKeysFromEnv();
  registerIpc();
  createWindow();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  appIsQuitting = true;
  for (const termId of getActivePtySessionIds()) stopTitlePolling(termId);
  killAllPtySessions();
  closeScrollbackDb();
});
