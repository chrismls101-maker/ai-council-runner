# Glass Index + Screen-Aware Coder — Build Prompt

**Paste into Cursor Agent. Build in order — each phase is independently shippable.**

---

## What this builds

Four features that together make Glass Coder screen-aware, voice-triggered, and indexed — capabilities Cursor structurally cannot offer because it's an editor, not an overlay.

| Feature | What it does |
|---|---|
| **Codebase Indexer** | Embeds your project files locally via Ollama; Glass Coder finds relevant files semantically instead of blind-grepping |
| **Screen-Aware Context** | OmniParser reads what editor + file is open when you invoke Glass Coder; pre-seeds context automatically |
| **Voice → Glass Coder** | Aletheia voice commands trigger Glass Coder with screen context; no typing, no switching windows |
| **File Watcher** | Keeps the index fresh; re-indexes changed files on save |

---

## Prerequisites

Ollama must be running locally (`localhost:11434`). The user already has it installed.

On first Glass Coder use (or via Settings), check if `nomic-embed-text` is available:

```typescript
// Check: GET http://localhost:11434/api/tags
// If "nomic-embed-text" not in models list, pull it:
// POST http://localhost:11434/api/pull { "name": "nomic-embed-text" }
// This is a 274MB download — show progress in Glass Settings UI
```

---

## Phase 1 — Codebase Indexer

### New file: `src/main/glassIndex.ts`

This module manages the embedding index for a project root. It runs entirely in the main process.

**Storage**: SQLite database at `{projectRoot}/.glass-index/index.db` (add to `.gitignore` automatically on creation).

**Schema**:
```sql
CREATE TABLE IF NOT EXISTS file_index (
  path TEXT PRIMARY KEY,
  rel_path TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  embedding TEXT NOT NULL,   -- JSON array of floats
  indexed_at INTEGER NOT NULL
);
```

**Embed function** — calls Ollama locally:
```typescript
async function embedText(text: string): Promise<number[]> {
  const res = await fetch("http://localhost:11434/api/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "nomic-embed-text", prompt: text }),
  });
  const json = await res.json();
  return json.embedding as number[];
}
```

**Cosine similarity**:
```typescript
function cosineSim(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] ** 2;
    magB += b[i] ** 2;
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}
```

**What gets indexed**:
- Source files only: `.ts`, `.tsx`, `.js`, `.jsx`, `.py`, `.go`, `.rs`, `.swift`, `.kt`, `.java`, `.c`, `.cpp`, `.h`, `.css`, `.md`
- Skip: `node_modules`, `.git`, `dist`, `build`, `.glass-index`, binary files, files > 200KB
- Index content: first 8000 characters of the file (enough for embedding context)

**Exported functions**:

```typescript
// Index entire project — called on first open or manual re-index
export async function indexProject(
  projectRoot: string,
  onProgress?: (indexed: number, total: number) => void,
): Promise<void>

// Re-index a single file (called by file watcher)
export async function indexFile(projectRoot: string, filePath: string): Promise<void>

// Remove a file from index (called when file is deleted)
export async function removeFromIndex(projectRoot: string, filePath: string): Promise<void>

// Semantic search — returns top N most relevant file paths
export async function searchIndex(
  projectRoot: string,
  query: string,
  topN: number = 12,
): Promise<Array<{ path: string; relPath: string; score: number }>>

// Returns true if an index exists for this project root
export function hasIndex(projectRoot: string): boolean

// Wipe and rebuild index
export async function reindexProject(projectRoot: string): Promise<void>
```

**Error handling**: if Ollama is not running, `searchIndex` returns empty array (falls back to grep-based search). Never throw — log the error and degrade gracefully.

### Wire into Glass Coder agent start (`src/main/index.ts`)

When `agentId === "coder"` and an index exists for `projectRoot`:

```typescript
// Before starting the coder agent loop, run semantic search
const indexResults = await searchIndex(projectRoot, prompt, 12);
const preSeedFiles = indexResults.map(r => r.path);
// Pass preSeedFiles into AgentRunOptions
```

In `agentRunner.ts`, when `preSeedFiles` is provided, inject them into the first user message:

```
Project root: {projectRoot}

Relevant files identified by semantic search (read these first):
- src/main/agentRunner.ts
- src/shared/ipc.ts
...

Task: {userPrompt}
```

This means Glass Coder starts with context instead of listing directories blindly.

### New IPC channels (`src/shared/ipc.ts`)

```typescript
indexStart: "glass:index-start",        // renderer → main: start indexing project
indexProgress: "glass:index-progress",  // main → renderer: { indexed, total, phase }
indexDone: "glass:index-done",          // main → renderer: { fileCount, durationMs }
indexError: "glass:index-error",        // main → renderer: { error }
indexStatus: "glass:index-status",      // renderer → main: get current status
```

### Add to `GlassState`

```typescript
indexState?: {
  projectRoot: string;
  status: "idle" | "indexing" | "ready" | "error";
  fileCount?: number;
  progress?: { indexed: number; total: number };
  lastIndexedAt?: number;
  error?: string;
};
```

### Settings UI

In the Glass Agents settings section, add an "Index" subsection:
- Status indicator: "Not indexed" / "Indexing (42/380)" / "Ready — 380 files"
- **Index Now** button — triggers full re-index
- **Auto-index on project open** toggle (default: true)
- Small note: "Uses Ollama (nomic-embed-text) running locally — free, offline"

If Ollama is not detected, show: "Ollama not running — start it to enable semantic search. Glass Coder will fall back to file search."

---

## Phase 2 — Screen-Aware Context

### New file: `src/main/screenContext.ts`

This module detects the active file in whatever editor the user is using.

**Strategy**: Take a screenshot via OmniParser (which Glass already has). Send the screenshot to Claude with a focused prompt asking specifically for the active file path. This is faster and more reliable than trying to parse editor-specific UI patterns.

```typescript
export interface ScreenFileContext {
  filePath: string | null;        // absolute path if detected, null if can't determine
  editorName: string | null;      // "VS Code", "Xcode", "Sublime Text", etc.
  lineNumber?: number;            // if visible in editor
  visibleErrors?: string[];       // any red squiggles or error messages visible
  confidence: "high" | "low";
}

export async function detectActiveFile(
  screenshotBase64: string,
): Promise<ScreenFileContext>
```

**Claude prompt for file detection** (use Haiku, not Opus — fast and cheap):
```
Look at this screenshot of a macOS screen. 

Identify:
1. What editor/IDE is open (VS Code, Xcode, Sublime Text, JetBrains, Vim, etc.)
2. The full file path of the currently active/focused file tab (look at the tab bar, title bar, or breadcrumb)
3. Any visible error messages or red squiggles

Respond in JSON only:
{
  "editor": "VS Code" | null,
  "filePath": "/absolute/path/to/file.ts" | null,
  "lineNumber": 42 | null,
  "errors": ["error text"] | [],
  "confidence": "high" | "low"
}

If the file path shown is relative, try to infer the absolute path from any project name visible in the sidebar or title bar. If you cannot determine it with confidence, set filePath to null.
```

**Important**: use `claude-haiku-4-5-20251001` for this call — it's near-instant and costs fractions of a cent. Not Opus.

### Wire into Glass Coder card (`src/renderer/builder/GlassAgentPanel.tsx`)

When the user opens the Glass Coder card (card expands), immediately:
1. Trigger a screenshot + screen context detection in the background
2. If a file is detected, show a small "Detected: `src/main/index.ts`" chip below the textarea with a ✕ to dismiss
3. Pre-fill the agent's context with this file when Run is pressed

When Run is pressed with a detected file:
- The screen context (filePath, visible errors) is sent to main alongside the prompt
- Main injects it into the first user message: `"Detected active file: {filePath}. Errors visible: {errors}. Task: {prompt}"`

**Don't block** — if screen detection fails or takes too long (>2s), proceed without it.

### New IPC channels

```typescript
detectScreenFile: "glass:detect-screen-file",    // renderer → main: take screenshot + analyze
screenFileResult: "glass:screen-file-result",    // main → renderer: ScreenFileContext
```

Add `agentScreenContext` to `AgentRunRequest`:
```typescript
agentScreenContext?: {
  detectedFilePath?: string;
  visibleErrors?: string[];
  editorName?: string;
}
```

---

## Phase 3 — Voice → Glass Coder

### Extend Aletheia voice command routing (`src/shared/companionActions.ts` or wherever voice commands are dispatched)

Add Glass Coder intent detection. When Aletheia transcribes speech, before submitting as a regular question, check if the text matches a coder intent pattern:

**Coder intent patterns** (check with a simple Claude Haiku call OR regex — regex first for speed):

```typescript
const CODER_PATTERNS = [
  /^fix (the |this |that )?(error|bug|issue|problem|crash)/i,
  /^refactor (this|that|the)/i,
  /^add (error handling|types|tests|comments|logging)/i,
  /^(extract|move|rename) (this|the|that)/i,
  /^make (this|that|the) (function|component|class|file)/i,
  /^(clean up|simplify|optimize) (this|the|that)/i,
  /^(delete|remove) (this|the|that)/i,
  /glass coder[,:]? /i,
];

function isCoderIntent(text: string): boolean {
  return CODER_PATTERNS.some(p => p.test(text.trim()));
}
```

If intent matches:
1. Don't submit as a regular Glass question
2. Trigger `detectScreenFile` to get current file context
3. Open Glass Coder panel (send IPC to open agents panel + select coder)
4. Pre-fill the coder prompt with the transcribed text
5. Automatically run if confidence is "high" — show the diff, wait for approval
6. Aletheia narrates: "Opening Glass Coder." then "Review the proposed change."

**If confidence is "low"** (no file detected or ambiguous): open the Glass Coder panel pre-filled but don't auto-run — let the user confirm.

### New IPC channel

```typescript
openCoderWithPrompt: "glass:open-coder-with-prompt",
// payload: { prompt: string; screenContext?: ScreenFileContext }
```

Main handles this by broadcasting to renderer to open the agents panel, select coder card, pre-fill, and optionally auto-run.

---

## Phase 4 — File Watcher

### Add to `src/main/glassIndex.ts`

```typescript
import chokidar from "chokidar";

const watchers = new Map<string, chokidar.FSWatcher>();

export function startWatching(
  projectRoot: string,
  onFileChanged: (path: string) => void,
): void {
  if (watchers.has(projectRoot)) return;

  const watcher = chokidar.watch(projectRoot, {
    ignored: [
      /node_modules/,
      /\.git/,
      /dist\//,
      /build\//,
      /\.glass-index/,
      /\.(png|jpg|jpeg|gif|ico|woff|woff2|ttf|eot|svg|mp4|mp3|wav)$/,
    ],
    persistent: true,
    ignoreInitial: true,    // don't fire for existing files on start
    awaitWriteFinish: {
      stabilityThreshold: 800,   // wait 800ms after last write before firing
      pollInterval: 100,
    },
  });

  watcher
    .on("change", onFileChanged)
    .on("add",    onFileChanged)
    .on("unlink", (path) => void removeFromIndex(projectRoot, path));

  watchers.set(projectRoot, watcher);
}

export function stopWatching(projectRoot: string): void {
  watchers.get(projectRoot)?.close();
  watchers.delete(projectRoot);
}
```

Wire in `src/main/index.ts`: when a coder workspace is set and has an index, call `startWatching`. When workspace changes or Glass quits, call `stopWatching`.

On file change: call `indexFile(projectRoot, changedPath)` — this re-embeds just that one file, typically <100ms.

**chokidar** — check if it's already in `package.json`. If not, `npm install chokidar`. It's a standard file watching library used by webpack, Vite, and most Node tools.

**better-sqlite3** — check if it's in `package.json`. If not, `npm install better-sqlite3 @types/better-sqlite3`. This is what powers the index DB. It's synchronous, fast, and works well in Electron main process.

---

## Settings additions (`src/shared/glassSettings.ts`)

```typescript
// Add to GlassUserSettings:
indexEnabled?: boolean;           // default: true
indexAutoOnOpen?: boolean;        // default: true  
screenContextEnabled?: boolean;   // default: true
voiceCoderEnabled?: boolean;      // default: true
```

---

## Narration cues (`src/shared/agentNarration.ts`)

Add:
```typescript
// Index phase
"index-start"  → "Indexing your project…"
"index-done"   → "Project indexed. {fileCount} files ready."

// Screen context
"screen-detect" → "Checking what you're looking at…"
"screen-found"  → "Found {filename}."

// Voice coder
"voice-coder-trigger" → "Opening Glass Coder."
"voice-coder-ready"   → "Review the proposed change."
```

---

## Implementation order

1. **Phase 1 first** — the index is the biggest value. Build `glassIndex.ts`, wire into Coder agent start, add settings UI, test with a real project.
2. **Phase 4 next** — file watcher is a small add-on to Phase 1. Do it immediately after so the index stays fresh.
3. **Phase 2** — screen context detection. Test by opening VS Code with a file and verifying Glass detects it correctly.
4. **Phase 3 last** — voice routing. Depends on both screen context (Phase 2) working and the Glass Coder panel (already built) being stable.

---

## Typecheck requirement

```bash
cd desktop-glass && npm run typecheck
```

Zero errors required before done.

---

## The demo this enables

User is in Xcode. A red error is visible. They say: **"Fix the error."**

Glass:
1. Transcribes via Deepgram
2. Detects coder intent
3. Takes screenshot → Claude Haiku → identifies file + error text
4. Semantic search finds 8 relevant files in the project index
5. Glass Coder opens, pre-filled, auto-runs with full context
6. Diff appears — user says "Apply"
7. File is fixed. Aletheia: "Done."

From voice to applied fix — never left Xcode.

---

## Out of scope for this build

- Training or fine-tuning any model
- VS Code extension or editor plugins
- Tab completion / inline suggestions
- Multi-project index (one project root at a time)
- Cloud sync of index
