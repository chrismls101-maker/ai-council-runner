/**
 * Pure PTY → command-block parser (OSC 133 + heuristic fallback).
 * Used by useTerminalBlocks; exported for unit tests.
 */

export type BlockStatus = "running" | "success" | "error" | "unknown";

export interface TerminalBlock {
  id: string;
  command: string;
  output: string;
  outputRaw: string;
  status: BlockStatus;
  exitCode?: number;
  startedAt: number;
  finishedAt?: number;
}

const ANSI_RE = /\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\))/g;
const OSC133_RE = /\x1b\]133;([A-D])(?:;(-?\d+))?(?:\x07|\x1b\\)/g;

const PROMPT_ENDINGS = [
  /\$\s+$/,
  /(?<!\d)%\s*$/,
  /#\s+$/,
  /❯\s*$/,
  /➜\s*$/,
];

export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

function chunkHasOsc133(chunk: string): boolean {
  OSC133_RE.lastIndex = 0;
  return OSC133_RE.test(chunk);
}

function looksLikePromptLine(line: string): boolean {
  const s = stripAnsi(line).trimEnd();
  if (s.length > 200) return false;
  return PROMPT_ENDINGS.some((re) => re.test(s));
}

let blockSeq = 0;
export function nextBlockId(): string {
  return `blk-${Date.now()}-${++blockSeq}`;
}

/** Reset block id sequence between tests. */
export function resetBlockIdSequence(): void {
  blockSeq = 0;
}

type ParserMode = "idle" | "prompt" | "command" | "output";

export interface ParserState {
  mode: ParserMode;
  currentBlock: Partial<TerminalBlock> | null;
  lineBuffer: string;
  useOsc133: boolean | null;
  osc133Seen: boolean;
}

export function createParserState(): ParserState {
  return {
    mode: "idle",
    currentBlock: null,
    lineBuffer: "",
    useOsc133: null,
    osc133Seen: false,
  };
}

function finalizeBlock(partial: Partial<TerminalBlock>): TerminalBlock {
  return {
    id: partial.id ?? nextBlockId(),
    command: partial.command ?? "",
    output: stripAnsi(partial.outputRaw ?? "").trim(),
    outputRaw: partial.outputRaw ?? "",
    status: partial.status ?? "unknown",
    exitCode: partial.exitCode,
    startedAt: partial.startedAt ?? Date.now(),
    finishedAt: partial.finishedAt,
  };
}

function appendCommandSegment(segment: string, ps: ParserState): void {
  if (!segment || !ps.currentBlock) return;
  const cmd = stripAnsi(segment).replace(/[\x00-\x1f]/g, " ");
  if (cmd) ps.currentBlock.command = (ps.currentBlock.command ?? "") + cmd;
}

function accumulateOscSegment(segment: string, ps: ParserState): void {
  if (!segment || !ps.currentBlock) return;
  if (ps.mode === "command") {
    appendCommandSegment(segment, ps);
  } else if (ps.mode === "output") {
    ps.currentBlock.outputRaw = (ps.currentBlock.outputRaw ?? "") + segment;
  }
}

function applyOsc133Transition(
  ps: ParserState,
  type: string,
  exitCode: number | undefined,
  pushBlock: (block: TerminalBlock) => void,
): void {
  if (type === "A") {
    if (ps.currentBlock && ps.mode === "output") {
      pushBlock(finalizeBlock({ ...ps.currentBlock, finishedAt: Date.now() }));
      ps.currentBlock = null;
    }
    ps.mode = "prompt";
    ps.currentBlock = { id: nextBlockId(), command: "", outputRaw: "", startedAt: Date.now(), status: "running" };
  } else if (type === "B") {
    ps.mode = "command";
  } else if (type === "C") {
    ps.mode = "output";
  } else if (type === "D") {
    if (ps.currentBlock) {
      ps.currentBlock.exitCode = exitCode;
      ps.currentBlock.status = exitCode === 0 ? "success" : exitCode != null ? "error" : "unknown";
      ps.currentBlock.finishedAt = Date.now();
      pushBlock(finalizeBlock(ps.currentBlock));
      ps.currentBlock = null;
    }
    ps.mode = "idle";
  }
}

function processOsc133Chunk(
  chunk: string,
  ps: ParserState,
  pushBlock: (block: TerminalBlock) => void,
): void {
  ps.useOsc133 = true;
  ps.osc133Seen = true;

  OSC133_RE.lastIndex = 0;
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = OSC133_RE.exec(chunk)) !== null) {
    accumulateOscSegment(chunk.slice(lastIdx, match.index), ps);
    const exitCode = match[2] != null ? parseInt(match[2], 10) : undefined;
    applyOsc133Transition(ps, match[1], exitCode, pushBlock);
    lastIdx = match.index + match[0].length;
  }
  accumulateOscSegment(chunk.slice(lastIdx), ps);
}

function feedHeuristicChunk(
  chunk: string,
  ps: ParserState,
  pushBlock: (block: TerminalBlock) => void,
): void {
  ps.lineBuffer += chunk;
  const lines = ps.lineBuffer.split(/\r?\n/);
  ps.lineBuffer = lines.pop() ?? "";

  for (const line of lines) {
    if (looksLikePromptLine(line)) {
      if (ps.currentBlock && ps.mode === "output") {
        pushBlock(finalizeBlock({ ...ps.currentBlock, finishedAt: Date.now(), status: "unknown" }));
      }
      ps.currentBlock = { id: nextBlockId(), command: "", outputRaw: "", startedAt: Date.now(), status: "running" };
      ps.mode = "prompt";
    } else if (ps.mode === "prompt" && ps.currentBlock) {
      const cmdLine = stripAnsi(line).trim();
      if (cmdLine) {
        ps.currentBlock.command = cmdLine;
        ps.mode = "output";
      }
    } else if (ps.mode === "output" && ps.currentBlock) {
      ps.currentBlock.outputRaw = (ps.currentBlock.outputRaw ?? "") + line + "\n";
    }
  }
}

/** Feed one PTY chunk into the parser; calls onPush for each completed block. */
export function feedParserChunk(
  ps: ParserState,
  chunk: string,
  onPush: (block: TerminalBlock) => void,
): void {
  const pushBlock = (block: TerminalBlock): void => {
    if (!block.command.trim()) return;
    onPush(block);
  };

  const hasOsc = chunkHasOsc133(chunk);
  if (ps.useOsc133 === true || hasOsc) {
    if (hasOsc) {
      processOsc133Chunk(chunk, ps, pushBlock);
    } else {
      accumulateOscSegment(chunk, ps);
    }
    return;
  }

  feedHeuristicChunk(chunk, ps, pushBlock);
}

export function resetParserState(ps: ParserState): void {
  ps.mode = "idle";
  ps.currentBlock = null;
  ps.lineBuffer = "";
  ps.useOsc133 = null;
  ps.osc133Seen = false;
}

/** Build OSC 133 sequence for tests. ST = BEL */
export function osc133(type: "A" | "B" | "C" | "D", exitCode?: number): string {
  const suffix = type === "D" && exitCode != null ? `;${exitCode}` : "";
  return `\x1b]133;${type}${suffix}\x07`;
}
