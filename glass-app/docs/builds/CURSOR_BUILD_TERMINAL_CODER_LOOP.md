# Glass Terminal → Coder Loop — Build Prompt

**Paste into Cursor Agent. Targeted change — no new files needed.**

---

## What this builds

Closes the build loop inside Glass:

1. Terminal runs a build → error appears
2. Glass build monitor detects it → "Fix with Glass" card appears on overlay
3. User clicks "Fix with Glass" → Glass Coder opens pre-filled with the error
4. Glass Coder reads the files, proposes a diff → user approves
5. File is fixed → user runs build again in Glass terminal

Everything is already built. This is a routing change on one button + rename.

---

## Changes required

### 1. Rename the button — `src/renderer/overlay/OverlayFeedCard.tsx`

Find (around line 407–422):
```tsx
<button
  type="button"
  className="gbtn gbtn--primary"
  data-testid="glass-build-fix-ai-btn"
  onPointerDown={ensureOverlayInteractive}
  onClick={() => {
    send({
      type: "glass-build-fix-ai",
      feedItemId: item.id,
      errorText: item.errorText ?? item.body,
      errorFilePaths: item.errorFilePaths ?? [],
    });
  }}
>
  Fix with AI
</button>
```

Change to:
```tsx
<button
  type="button"
  className="gbtn gbtn--primary"
  data-testid="glass-build-fix-glass-btn"
  onPointerDown={ensureOverlayInteractive}
  onClick={() => {
    send({
      type: "glass-build-fix-glass",
      feedItemId: item.id,
      errorText: item.errorText ?? item.body,
      errorFilePaths: item.errorFilePaths ?? [],
    });
  }}
>
  Fix with Glass
</button>
```

---

### 2. Update the command union type — `src/shared/ipc.ts`

Find the command union (search for `"glass-build-fix-ai"`). Rename the type field:

```typescript
// Before:
| { type: "glass-build-fix-ai"; feedItemId: string; errorText: string; errorFilePaths: string[] }

// After:
| { type: "glass-build-fix-glass"; feedItemId: string; errorText: string; errorFilePaths: string[] }
```

---

### 3. Reroute the handler — `src/main/index.ts`

Find the `case "glass-build-fix-ai":` block (around line 7097). Replace the entire case with `"glass-build-fix-glass"` and change the final action from `submitCommand` to opening Glass Coder.

**New handler:**

```typescript
case "glass-build-fix-glass": {
  const { errorText, errorFilePaths, feedItemId } = command;

  const workspaceRoot = state.glassSettings.agentCodeWorkspaceRoot?.trim();

  // Graceful fallback: if no project root set, fall back to old AI response path
  if (!workspaceRoot) {
    // Read referenced source files (up to 3, max 4KB each)
    const fileSections: string[] = [];
    let primaryFilePath: string | null = null;
    for (const rawPath of errorFilePaths.slice(0, 3)) {
      const result = await readFileForDiff(rawPath);
      if (result.ok && result.existed && result.content) {
        const snippet = result.content.length > 4096
          ? result.content.slice(0, 4096) + "\n…(truncated)"
          : result.content;
        fileSections.push(`\`\`\`\n// ${rawPath}\n${snippet}\n\`\`\``);
        if (!primaryFilePath) {
          primaryFilePath = rawPath.startsWith("~/")
            ? join(process.env.HOME ?? "", rawPath.slice(2))
            : rawPath;
        }
      }
    }
    const fileContext = fileSections.length > 0
      ? `\nReferenced source files:\n${fileSections.join("\n\n")}`
      : "";
    const fallbackPrompt = [
      "The Glass dock terminal produced the following build error:",
      "",
      "```",
      errorText.slice(0, 2000),
      "```",
      fileContext,
      "",
      "Identify the root cause and provide the corrected code for the file that needs to be changed.",
      "Return a single fenced code block with the complete corrected file content.",
    ].join("\n");
    if (primaryFilePath) {
      pendingContextSnapshot = {
        appName: null,
        windowTitle: null,
        terminalErrors: [],
        lastCommand: null,
        capturedAt: Date.now(),
        codeContext: {
          fileName: primaryFilePath.split("/").pop() ?? "",
          language: "TypeScript",
          filePath: primaryFilePath,
          content: null,
          fileSizeBytes: null,
        },
      };
    }
    state.commandFeed = state.commandFeed.filter((f) => f.id !== feedItemId);
    void submitCommand(fallbackPrompt, undefined, { taskComplexity: "deep" });
    return;
  }

  // Remove the build-error card
  state.commandFeed = state.commandFeed.filter((f) => f.id !== feedItemId);
  push();

  // Build a Glass Coder prompt from the error
  const fileList = errorFilePaths.length > 0
    ? `\nFiles referenced in the error:\n${errorFilePaths.map((p) => `- ${p}`).join("\n")}`
    : "";

  const coderPrompt = [
    "Fix this build error from the Glass terminal:",
    "",
    "```",
    errorText.slice(0, 3000),
    "```",
    fileList,
  ].join("\n");

  // Open Glass Coder with the error pre-filled.
  // Pass errorFilePaths as preSeedFiles so Coder starts with the right files loaded.
  // autoRun: true — confidence is "high" because we have exact file refs from the build output.
  broadcast(IPC.openCoderWithPrompt, {
    prompt: coderPrompt,
    autoRun: true,
    screenContext: errorFilePaths.length > 0
      ? {
          detectedFilePath: errorFilePaths[0],
          visibleErrors: [errorText.slice(0, 500)],
          editorName: null,
          confidence: "high" as const,
        }
      : null,
  });
  return;
}
```

**Important**: delete the old `case "glass-build-fix-ai":` block entirely. Do not keep both.

---

### 4. Wire preSeedFiles from screenContext in agentRunner — `src/main/index.ts`

Find the `IPC.agentRun` handler (around line 9680). When `agentId === "coder"` and `screenContext` has `detectedFilePath`, ensure that path is included in `preSeedFiles` alongside the semantic search results.

Find the block that builds `preSeedFiles` (after `searchIndex` call). Extend it:

```typescript
// After semantic search results are filtered:
// Also include the screen-detected file if not already in the list
const screenFilePath = screenContext?.detectedFilePath;
if (
  screenFilePath &&
  !preSeedFiles.includes(screenFilePath) &&
  existsSync(screenFilePath) &&
  screenFilePath.startsWith(codeWorkspaceRoot)
) {
  preSeedFiles.unshift(screenFilePath); // put detected file first
}
```

This ensures the file Glass Coder gets is the exact file the build error pointed at, not just whatever semantic search finds.

---

### 5. Narration cue — `src/shared/agentNarration.ts`

Add a narration for when the terminal loop triggers Glass Coder:

```typescript
"terminal-coder-trigger" → "Opening Glass Coder to fix the build error."
```

Call it in the `glass-build-fix-glass` handler just before the `broadcast` call:

```typescript
broadcast(IPC.agentNarrate, narrateToolStart("terminal-coder-trigger"));
```

Only add this if `agentNarration.ts` has a `narrateToolStart` function or similar — check first before adding. If the narration system works differently, skip this step rather than guessing.

---

## What does NOT change

- The "Fix it" button on `terminal-fix` cards (command-line fix suggestion) — leave it exactly as is. That's for fixing commands, not build errors.
- The palette command `terminal-fix-last` — leave it.
- The Glass Coder panel UI, approval gate, change log — no changes needed.
- The build monitor detection logic (`checkBuildMonitor`) — no changes needed.
- `agentRunner.ts` — no changes needed.

---

## Typecheck

```bash
cd desktop-glass && npm run typecheck
```

Zero errors required. The rename from `glass-build-fix-ai` to `glass-build-fix-glass` touches three places — renderer, IPC types, main handler. Make sure all three are in sync before finishing.

---

## The loop this enables

User runs `npm run build` in Glass terminal → TypeScript error appears → "Fix with Glass" card shows on overlay → user clicks it → Glass Coder opens pre-filled with the exact error + file → diff appears → user clicks Apply → file is fixed → user runs build again.

Voice works on top: "Fix the build error" → same flow, triggered by voice instead of button click.
