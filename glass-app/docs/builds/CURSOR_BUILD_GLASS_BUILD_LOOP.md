# Glass Build Loop — Locked Implementation Prompt

**Paste into Cursor Agent. This is the highest-leverage build in the Glass roadmap.**

Read `GLASS_CONTEXT.md` first before touching any file.

---

## Mission

Build a **multi-agent autonomous coding loop** inside Glass. When the user asks Glass Coder to build something, Glass doesn't stop at applying diffs — it verifies the build, reviews its own work, fixes issues, and iterates until clean. The user approves diffs but never has to manually copy errors back and forth.

This closes the gap between Glass Coder and professional coding workflows by making Glass operate like a senior engineer: build → check → review → fix → repeat.

---

## What this builds (4 phases)

| Phase | Feature | What it does |
|-------|---------|--------------|
| 1 | **GLASS_CONTEXT.md injection** | Glass Coder reads project memory on every run — architecture, patterns, decisions |
| 2 | **Auto-verify** | After all diffs applied, Glass auto-runs `tsc --noEmit` in terminal, shows result in Coder panel |
| 3 | **Review handoff** | Code Analyst automatically reviews what Glass Coder changed, produces structured findings |
| 4 | **Fix loop** | Analyst findings feed back into Glass Coder as a new run — iterate until clean |

Build in order. Each phase is independently shippable and valuable.

---

## Phase 0 — Generate Project Memory Button

### What
Add a **"Generate Project Memory"** button to the Glass Settings panel under the Glass Coder / Index section. When clicked, Glass Coder's Code Analyst analyzes the user's project root and writes a `GLASS_CONTEXT.md` file tailored to their codebase. This is a one-time setup step — after that, Glass Coder reads it automatically on every run.

`GLASS_CONTEXT.md` is **per-project and user-generated**. It is never shipped with Glass. Every user generates their own for their own project.

### New IPC channels — `src/shared/ipc.ts`

```typescript
generateProjectMemory: "glass:generate-project-memory",       // renderer → main: start generation
generateProjectMemoryDone: "glass:generate-project-memory-done", // main → renderer: done or error
```

Add to `GlassState`:
```typescript
projectMemoryState?: {
  status: "idle" | "generating" | "done" | "error";
  error?: string;
} | null;
```

### Main process — `src/main/index.ts`

```typescript
ipcMain.handle(IPC.generateProjectMemory, async () => {
  const projectRoot = state.glassSettings.agentCodeWorkspaceRoot?.trim();
  if (!projectRoot) {
    state.lastNotice = "Set a project folder first.";
    push();
    return;
  }

  state.projectMemoryState = { status: "generating" };
  push();

  try {
    // Use Code Analyst to analyze the project and produce GLASS_CONTEXT.md
    const analysisPrompt = [
      `Analyze the project at: ${projectRoot}`,
      "",
      "Produce a GLASS_CONTEXT.md file for this project. It will be read by Glass Coder at the start of every run to understand the codebase without re-exploring it each time.",
      "",
      "The file must include:",
      "1. **What this project is** — one paragraph, purpose and tech stack",
      "2. **Architecture** — how the codebase is structured, key directories, data flow",
      "3. **Key files map** — the 10-20 most important files with one-line descriptions",
      "4. **Coding patterns** — conventions, how to add features, patterns to follow",
      "5. **Build & test commands** — how to build, run, and test the project",
      "6. **What's been built** — major features and their status",
      "7. **Out of scope** — things explicitly not in this project",
      "",
      "Use list_directory and read_file to explore the project. Read the README, package.json, and key source files.",
      "Write the result to GLASS_CONTEXT.md at the project root using create_file.",
      "Keep it under 600 lines — dense and useful, not exhaustive.",
    ].join("\n");

    // Run as a Code Analyst agent run (read-only exploration + write_file)
    // Wire this to the existing agentRun infrastructure with agentId: "code"
    // but override the output path to write GLASS_CONTEXT.md at projectRoot instead of ~/Desktop/IIVO Research
    // After the run completes successfully:
    state.projectMemoryState = { status: "done" };
    state.lastNotice = "Project memory generated — Glass Coder will use it on every run.";
    push();
  } catch (err) {
    state.projectMemoryState = { status: "error", error: err instanceof Error ? err.message : String(err) };
    push();
  }
});
```

**Implementation note on the agent run:** The simplest approach is to fire a standard `agentRun` with `agentId: "code"` and a custom output directory set to `projectRoot` so `write_file` drops `GLASS_CONTEXT.md` there instead of `~/Desktop/IIVO Research`. Check how `outputDir` is passed in `AgentRunOptions` in `agentRunner.ts` and wire accordingly. If that's complex, use `askIivoGlass` directly with the same prompt and write the file in the IPC handler after getting the response.

### Settings UI — `src/renderer/panel/Panel.tsx`

In the Glass Agents / Coder section, after the Index Now button, add:

```tsx
<div className="panel-setting-row">
  <div>
    <div className="panel-setting-label">Project Memory</div>
    <div className="panel-setting-hint">
      Generates GLASS_CONTEXT.md — Glass Coder reads this on every run to understand your project.
      Re-generate any time your architecture changes.
    </div>
  </div>
  <button
    type="button"
    className="gbtn gbtn--secondary"
    disabled={state.projectMemoryState?.status === "generating" || !state.glassSettings.agentCodeWorkspaceRoot}
    onClick={() => window.glass.generateProjectMemory()}
  >
    {state.projectMemoryState?.status === "generating"
      ? "Generating…"
      : state.projectMemoryState?.status === "done"
      ? "Regenerate"
      : "Generate"}
  </button>
</div>

{state.projectMemoryState?.status === "done" && (
  <p className="panel-setting-hint panel-setting-hint--success">
    ✓ GLASS_CONTEXT.md saved to your project root
  </p>
)}
{state.projectMemoryState?.status === "error" && (
  <p className="panel-setting-hint panel-setting-hint--error">
    ✗ {state.projectMemoryState.error ?? "Generation failed"}
  </p>
)}
```

Wire in preload:
```typescript
generateProjectMemory: () => ipcRenderer.invoke(IPC.generateProjectMemory),
```

---

## Phase 1 — GLASS_CONTEXT.md Injection

### What
When Glass Coder starts a run, if `GLASS_CONTEXT.md` exists at the project root, read it and inject it into the first user message before the prompt. This gives Glass Coder the full architectural context on every run without the user having to explain anything.

### Where
`src/main/agentCoderBootstrap.ts` — the file that builds the first user message for Glass Coder runs.

### How

In the function that builds the initial user message (look for where `preSeedRelPaths` and `screenContext` are assembled into the opening message), add:

```typescript
import { readFile, access } from "node:fs/promises";
import { join } from "node:path";

async function readGlassContext(projectRoot: string): Promise<string | null> {
  const contextPath = join(projectRoot, "GLASS_CONTEXT.md");
  try {
    await access(contextPath);
    const content = await readFile(contextPath, "utf-8");
    // Cap at 12K chars so it doesn't dominate context
    return content.length > 12_000
      ? content.slice(0, 12_000) + "\n\n[...GLASS_CONTEXT.md truncated at 12K chars...]"
      : content;
  } catch {
    return null; // File doesn't exist — proceed without it
  }
}
```

Inject before the user prompt in the first message:

```
[GLASS_CONTEXT.md — Project memory. Read this before touching any file.]

{glassContextContent}

---

Project root: {projectRoot}

Relevant files identified by semantic search (read these first):
{preSeedFiles}

{screenContextSection}

Task: {userPrompt}
```

Rules:
- Only inject if file exists — never fail if missing
- Always inject **before** the user prompt, not after
- Cap at 12K chars
- Add `---` separator between context sections for Claude to parse cleanly
- Do not inject into research, writing, or code analyst runs — coder only

---

## Phase 2 — Auto-Verify After Apply

### What
After Glass Coder completes a run (all diffs approved/skipped, agent loop finished), automatically run `npm run typecheck` in the Glass terminal. Show the result in the Glass Coder panel — pass or fail. If it fails, offer a "Fix errors" button that re-runs Glass Coder with the typecheck output as the prompt.

### New state fields — `src/shared/ipc.ts`

Add to `GlassState`:
```typescript
coderVerifyState?: {
  status: "idle" | "running" | "pass" | "fail";
  output?: string;        // typecheck output on failure
  runId: string;          // which coder run triggered this
} | null;
```

### New IPC channels — `src/shared/ipc.ts`

```typescript
coderVerifyStart: "glass:coder-verify-start",   // main → renderer: verification started
coderVerifyDone:  "glass:coder-verify-done",    // main → renderer: { pass, output, runId }
coderVerifyFix:   "glass:coder-verify-fix",     // renderer → main: re-run Coder with error prompt
```

### Main process — `src/main/index.ts`

After the agent loop emits `done` status for a coder run, auto-trigger verify:

```typescript
async function runCoderVerify(runId: string, projectRoot: string): Promise<void> {
  state.coderVerifyState = { status: "running", runId };
  push();

  try {
    const { stdout, stderr } = await execAsync(
      "npx tsc --noEmit 2>&1",
      { cwd: projectRoot, timeout: 60_000 }
    );
    const output = (stdout + stderr).trim();
    const pass = !output.includes("error TS") && !output.includes(" error");

    state.coderVerifyState = {
      status: pass ? "pass" : "fail",
      output: pass ? undefined : output.slice(0, 4000),
      runId,
    };
    push();
  } catch (err) {
    const output = err instanceof Error ? err.message : String(err);
    state.coderVerifyState = { status: "fail", output: output.slice(0, 4000), runId };
    push();
  }
}
```

Wire `runCoderVerify` to fire automatically when:
- `agentRun.agentId === "coder"` AND
- `agentRun.status` transitions to `"done"` AND
- `state.glassSettings.agentCodeWorkspaceRoot` is set AND
- `state.coderVerifyState?.runId !== runId` (don't re-run for same run)

Handle `IPC.coderVerifyFix`:
```typescript
ipcMain.handle(IPC.coderVerifyFix, async (_, { runId, errorOutput }) => {
  const projectRoot = state.glassSettings.agentCodeWorkspaceRoot?.trim();
  if (!projectRoot || !errorOutput) return;

  const fixPrompt = [
    "The TypeScript compiler produced these errors after your last changes:",
    "",
    "```",
    errorOutput.slice(0, 3000),
    "```",
    "",
    "Fix all type errors. Read each referenced file before editing.",
  ].join("\n");

  // Reset verify state
  state.coderVerifyState = null;
  push();

  // Open Glass Coder with the fix prompt, auto-run
  broadcast(IPC.openCoderWithPrompt, {
    prompt: fixPrompt,
    autoRun: true,
    screenContext: null,
  });
});
```

### Renderer — `src/renderer/overlay/GlassCoderPanel.tsx`

Add a verify section below the answer/change log:

```tsx
// Show after agent is done (not while running or waiting for approval)
{state.coderVerifyState?.runId === activeRunId && (
  <div className="gcp-verify">
    {state.coderVerifyState.status === "running" && (
      <span className="gcp-verify__status gcp-verify__status--running">
        ⟳ Checking types…
      </span>
    )}
    {state.coderVerifyState.status === "pass" && (
      <span className="gcp-verify__status gcp-verify__status--pass">
        ✓ TypeScript clean
      </span>
    )}
    {state.coderVerifyState.status === "fail" && (
      <>
        <span className="gcp-verify__status gcp-verify__status--fail">
          ✗ Type errors found
        </span>
        <pre className="gcp-verify__output">{state.coderVerifyState.output}</pre>
        <button
          type="button"
          className="gbtn gbtn--primary"
          {...interactivePointerProps()}
          onClick={() => window.glass.coderVerifyFix({
            runId: activeRunId!,
            errorOutput: state.coderVerifyState!.output ?? "",
          })}
        >
          Fix errors
        </button>
      </>
    )}
  </div>
)}
```

Add styles to `GlassCoderPanel.css`:
- `.gcp-verify` — padding, border-top separator
- `.gcp-verify__status--running` — muted colour, spinning animation
- `.gcp-verify__status--pass` — green accent
- `.gcp-verify__status--fail` — red/amber accent
- `.gcp-verify__output` — monospace, small font, max-height 200px, overflow scroll, glass dark background

Wire `coderVerifyFix` in preload (`src/preload/index.ts`):
```typescript
coderVerifyFix: (payload) => ipcRenderer.invoke(IPC.coderVerifyFix, payload),
```

---

## Phase 3 — Code Analyst Review Handoff

### What
After verify passes (or after a Coder run if verify is not available), Code Analyst automatically reviews the files Glass Coder changed. It produces structured findings — bugs, pattern violations, missing error handling — and presents them in the Coder panel as a review card. User can dismiss or trigger Glass Coder to fix the findings.

### New state fields — `src/shared/ipc.ts`

Add to `GlassState`:
```typescript
coderReviewState?: {
  status: "idle" | "running" | "done" | "dismissed";
  runId: string;
  findings?: string;    // Code Analyst markdown output
  fileCount?: number;
} | null;
```

### New IPC channels — `src/shared/ipc.ts`

```typescript
coderReviewStart: "glass:coder-review-start",   // main → renderer: review started
coderReviewDone:  "glass:coder-review-done",    // main → renderer: { findings, fileCount, runId }
coderReviewFix:   "glass:coder-review-fix",     // renderer → main: run Coder with findings
coderReviewDismiss: "glass:coder-review-dismiss", // renderer → main: user dismissed
```

### Main process — `src/main/index.ts`

After `runCoderVerify` completes with `pass` (or if verify is skipped), trigger review:

```typescript
async function runCoderReview(
  runId: string,
  projectRoot: string,
  changedPaths: string[],
): Promise<void> {
  if (!changedPaths.length) return;

  state.coderReviewState = { status: "running", runId };
  push();

  try {
    // Build review context — read the changed files (up to 5, max 4KB each)
    const fileSections: string[] = [];
    for (const filePath of changedPaths.slice(0, 5)) {
      const result = await readFileForDiff(filePath);
      if (result.ok && result.existed && result.content) {
        const snippet = result.content.length > 4096
          ? result.content.slice(0, 4096) + "\n…(truncated)"
          : result.content;
        fileSections.push(`### ${filePath.replace(projectRoot + "/", "")}\n\`\`\`typescript\n${snippet}\n\`\`\``);
      }
    }

    if (!fileSections.length) {
      state.coderReviewState = null;
      push();
      return;
    }

    const reviewPrompt = [
      "You are a senior code reviewer. Glass Coder just applied changes to the following files.",
      "Review them for: bugs, type issues, missing error handling, pattern violations, or anything that could break at runtime.",
      "Be specific — name the file, line area, and what to fix.",
      "If the code looks correct, say so briefly. Do not invent problems.",
      "",
      "Files changed:",
      ...fileSections,
      "",
      "Respond in markdown. Keep it under 400 words.",
    ].join("\n");

    const response = await askIivoGlass(config, {
      prompt: reviewPrompt,
      modelPurpose: "default",
      responseStyle: "full",
    });

    const findings = response.answer?.trim() ?? "";
    const isClean = /looks? (good|correct|clean|fine)|no (issues?|bugs?|problems?)/i.test(findings);

    state.coderReviewState = {
      status: "done",
      runId,
      findings,
      fileCount: changedPaths.length,
    };
    push();

    // If clean — auto-dismiss after 3 seconds
    if (isClean) {
      setTimeout(() => {
        if (state.coderReviewState?.runId === runId) {
          state.coderReviewState = { ...state.coderReviewState, status: "dismissed" };
          push();
        }
      }, 3000);
    }
  } catch (err) {
    console.warn("[coder-review] failed:", err);
    state.coderReviewState = null;
    push();
  }
}
```

Track `changedPaths` from the agent change log — collect all entries with `action === "applied"` from the current run. Pass them to `runCoderReview`.

Handle `IPC.coderReviewFix`:
```typescript
ipcMain.handle(IPC.coderReviewFix, async (_, { runId, findings }) => {
  const projectRoot = state.glassSettings.agentCodeWorkspaceRoot?.trim();
  if (!projectRoot || !findings) return;

  const fixPrompt = [
    "A code review identified the following issues in your last changes:",
    "",
    findings.slice(0, 3000),
    "",
    "Address each issue. Read the relevant files before editing.",
  ].join("\n");

  state.coderReviewState = null;
  push();

  broadcast(IPC.openCoderWithPrompt, {
    prompt: fixPrompt,
    autoRun: true,
    screenContext: null,
  });
});
```

Handle `IPC.coderReviewDismiss`:
```typescript
ipcMain.on(IPC.coderReviewDismiss, () => {
  state.coderReviewState = null;
  push();
});
```

### Renderer — `src/renderer/overlay/GlassCoderPanel.tsx`

Add a review card below the verify section:

```tsx
{state.coderReviewState?.runId === activeRunId &&
 state.coderReviewState.status !== "dismissed" && (
  <div className="gcp-review">
    <div className="gcp-review__header">
      <span className="gcp-review__icon">◎</span>
      <span className="gcp-review__label">
        {state.coderReviewState.status === "running"
          ? "Reviewing changes…"
          : `Code Review — ${state.coderReviewState.fileCount ?? 0} file(s)`}
      </span>
    </div>

    {state.coderReviewState.status === "done" && state.coderReviewState.findings && (
      <>
        <div
          className="gcp-review__body glass-selectable-text"
          dangerouslySetInnerHTML={{ __html: parseMarkdown(state.coderReviewState.findings) }}
        />
        <div className="gcp-review__actions">
          <button
            type="button"
            className="gbtn gbtn--primary"
            {...interactivePointerProps()}
            onClick={() => window.glass.coderReviewFix({
              runId: activeRunId!,
              findings: state.coderReviewState!.findings!,
            })}
          >
            Fix with Glass
          </button>
          <button
            type="button"
            className="gbtn gbtn--ghost"
            {...interactivePointerProps()}
            onClick={() => window.glass.coderReviewDismiss()}
          >
            Dismiss
          </button>
        </div>
      </>
    )}
  </div>
)}
```

Add styles in `GlassCoderPanel.css` following the same glassmorphism pattern as other panel sections.

Wire new IPC in preload:
```typescript
coderReviewFix:     (payload) => ipcRenderer.invoke(IPC.coderReviewFix, payload),
coderReviewDismiss: ()        => ipcRenderer.send(IPC.coderReviewDismiss),
```

---

## Phase 4 — The Full Loop (Orchestration)

### What
Wire phases 1–3 into a seamless sequence. When Glass Coder finishes:

```
Coder applies diffs
  → Auto-verify (tsc --noEmit)
    → PASS: Code Analyst review runs
      → CLEAN: "✓ Done — TypeScript clean, code looks good"
      → ISSUES: Review card shown → user clicks "Fix with Glass" → Coder runs again → loop
    → FAIL: "Fix errors" button → Coder runs again → loop
```

The loop is bounded — track how many Coder runs have happened for a given "session" and cap at 4 iterations to prevent infinite loops.

### Loop session tracking — `src/shared/ipc.ts`

Add to `GlassState`:
```typescript
coderLoopIteration?: number;   // how many auto-triggered runs in current session
coderLoopSessionId?: string;   // ties verify + review + fix runs together
```

### Rules for the loop

- **User-initiated runs** start a new loop session (`coderLoopSessionId = runId`, `coderLoopIteration = 1`)
- **Auto-triggered fix runs** (from verify or review) increment `coderLoopIteration`
- **Cap at 4 iterations** — after 4, show "Coder has iterated 4 times. Review manually." and stop
- **Reset on user-initiated run** — any new prompt from the user resets the session
- Show current iteration in the Coder panel header: "Glass Coder (pass 2/4)"

### Settings toggle

Add to settings panel under Glass Coder:
- **Auto-verify after apply** toggle (default: true)
- **Auto-review after verify** toggle (default: true)

Add to `GlassUserSettings` in `src/shared/glassSettings.ts`:
```typescript
coderAutoVerify?: boolean;   // default: true
coderAutoReview?: boolean;   // default: true
```

---

## Narration cues — `src/shared/agentNarration.ts`

Add to `narrateToolStart`:
```typescript
case "coder-verify-start":  return "Checking TypeScript…";
case "coder-verify-pass":   return "TypeScript clean.";
case "coder-verify-fail":   return "Type errors found.";
case "coder-review-start":  return "Reviewing the changes…";
case "coder-review-clean":  return "Looks good.";
case "coder-review-issues": return "Found a few things to fix.";
case "coder-loop-cap":      return "Review manually — I've iterated four times.";
```

Fire narration via `state.lastNotice = narrateToolStart("coder-verify-start", {})` at each phase transition.

---

## Implementation order

1. **Phase 1 first** — GLASS_CONTEXT.md injection. Zero risk, immediate impact on every Coder run. Test: start a Coder run and verify the context file appears in the first message.
2. **Phase 2** — Auto-verify. Test: make a type error deliberately, run Coder, verify the fail card appears and "Fix errors" opens a new Coder run with the errors.
3. **Phase 3** — Review handoff. Test: make a real change, verify Code Analyst runs and produces findings.
4. **Phase 4** — Full loop + cap. Test: trigger a change that produces type errors, let the loop run to completion, verify it stops at 4 iterations.

---

## Typecheck requirement

```bash
cd desktop-glass && npm run typecheck
```

Zero errors. New IPC channels must be wired in all three places (ipc.ts, preload, main) or tsc will catch it.

---

## What this enables

The user types one prompt in Glass Coder. Glass builds it, checks it compiles, reviews it for bugs, fixes what it finds, checks again. The user approves diffs. No copy-pasting errors. No switching windows. No manual review step.

That loop — which most AI coding tools don't have — is what makes Glass a serious coding environment, not just a chat interface that writes code.
