# Cursor Code Review — Glass Agent Feature

Please review the following files that implement the **Glass Agent** feature in IIVO Glass (Electron + React + TypeScript, v0.7.0). The goal is to find bugs, edge cases, type-safety issues, architectural problems, or anything that could fail at runtime. Be thorough and specific — include file, line, and a fix suggestion for every issue found.

## Files to review

### 1. `src/shared/ipc.ts`
Look for: any additions to the `IPC` constant object (keys `agentRun`, `agentStop`, `agentEvent`), and the types at the bottom of the file:
- `GlassAgentId`
- `AgentRunRequest`
- `AgentRunResponse`
- `AgentEventKind`
- `AgentEvent`

Check: Are the types complete? Is `GlassAgentId` consistent everywhere it's referenced?

---

### 2. `src/main/agentRunner.ts` *(new file)*
This is the core agent loop engine. Review the entire file. Key areas:

**API key resolution** (`resolveAnthropicKey`):
- Does it safely fall back from keychain → env var?
- Could `listApiKeys()` or `getApiKeyValue()` throw?

**SSE parser** (`parseSse`):
- Does it handle partial chunks correctly?
- What happens if the stream closes mid-event?
- Is the reader lock always released?

**Tool executor** (`executeTool` + individual executors):
- `executeReadFile`: Does the truncation sentinel make sense? What if the path is a directory?
- `executeListDirectory`: Any symlink edge cases?
- `executeSearchFiles`: Uses `execFile("grep", ...)`. What if `grep` is not available? What if `directory` contains shell-unsafe chars? (Note: `execFile` does not use a shell, so injection is not possible — confirm this is safe.)
- `executeWriteFile`: Is filename sanitization sufficient? Any TOCTOU issues with `mkdir + writeFile`?

**Agent loop** (`runAgent`):
- Is the `AbortSignal` checked frequently enough?
- Are there any infinite-loop conditions? The server-side-only branch just `continue`s — could this loop forever if the model keeps calling web_search?
- When `stopReason` is neither `"end_turn"` nor `"tool_use"` (e.g. `"max_tokens"`), it falls through to a "done" emit — is that correct?
- Is `flushCurrentBlock` called at the right points? Can it miss the last block?
- The `messages` array grows each iteration. Is there a risk of hitting context limits?
- Tool results from server-side tools use `"(handled server-side)"` as placeholder content — could this confuse the model?

**Per-agent tool sets** (`AGENT_TOOLS`):
- Do the tool definitions match what `executeTool` can handle?
- `web_search` has `max_uses: 8` — is this the right shape for the Anthropic API?
- `write_file` is a custom tool (no `type` field) — does the API accept this alongside a server-side tool that uses `type: "web_search_20250305"`?

---

### 3. `src/main/index.ts` — agent IPC handlers
Look for the `ipcMain.handle(IPC.agentRun, ...)` and `ipcMain.on(IPC.agentStop, ...)` blocks.

Check:
- Is `isOverlayIpcSender` guard correct and present on both handlers?
- Dynamic `import("./agentRunner.ts")` — does this work with electron-vite in both dev and production builds? Should it be a static import?
- The `activeAgentAbort` is a module-level variable — is there a race condition if two renders both call `agentRun` simultaneously?
- If `runAgent` throws (uncaught), does the error surface anywhere?

---

### 4. `src/preload/index.ts` — bridge methods
Look for `agentRun`, `agentStop`, `onAgentEvent` on the `glassApi` object.

Check:
- Is the return type of `agentRun` correctly cast?
- Does `onAgentEvent` properly return the unsubscribe function?
- Is the `removeListener` cleanup call correct (matching the `handler` reference)?

---

### 5. `src/renderer/builder/GlassAgentPanel.tsx` *(new file)*
Full review. Key areas:

**State management**:
- `runs` is a `Map<GlassAgentId, AgentRun>` in React state. Is mutating a copy of the Map and returning it the correct pattern? (`new Map(prev)` — yes, but double-check)
- Is there any risk of stale closure in the `onAgentEvent` callback?

**`handleRun`**:
- It's `async` but only awaits `agentRun()`. The IPC call returns quickly (just `{ started: true }`). Is there any footgun here?
- If `agentRun` returns `{ started: false }`, the error state is set correctly. But if the IPC call itself throws (network error, renderer crash), is that caught?

**`handleStop`**:
- It only marks runs as `"idle"` locally. The main process `AbortController` is called. Is there a race where the agent emits one final event after stop?

**DOM CustomEvents**:
- `glass-agent-output`, `glass-agent-start`, `glass-agent-narrate` — are these cleaned up anywhere? (They don't need to be since they're dispatched not subscribed here, but confirm.)
- `glass-agent-start` is dispatched in `handleRun` before `agentRun()` resolves — correct?

**AgentCard**:
- The stop button is nested inside a `<button>` (`gap-card__header`). Nesting buttons is invalid HTML. Fix: the outer element should be a `<div role="button">` or the stop button should be at the same level.
- `handleCardClick` is disabled when `isRunning` via `disabled={isRunning}`, but the stop `<button>` inside it uses `onPointerDown` with `e.stopPropagation()`. Does this work correctly across all pointer devices?

**Accessibility**:
- The spinner is `aria-hidden` — correct.
- Are the card header buttons labelled correctly?

---

### 6. `src/renderer/builder/GlassAgentPanel.css`
Check: does the CSS import correctly from the TSX file? Any missing class names used in TSX but not defined in CSS?

Classes used in TSX: `gap-panel`, `gap-header`, `gap-title`, `gap-close`, `gap-body`, `gap-footer`, `gap-card`, `gap-card--running`, `gap-card--done`, `gap-card--error`, `gap-card__header`, `gap-card__icon`, `gap-card__spinner`, `gap-card__meta`, `gap-card__name`, `gap-card__desc`, `gap-card__stop`, `gap-card__chevron`, `gap-card__input-area`, `gap-card__textarea`, `gap-card__input-footer`, `gap-card__hint`, `gap-card__run-btn`, `gap-card__status`, `gap-card__status--error`.

---

### 7. `src/renderer/builder/BuilderStrip.tsx` — agent tab integration
Look for the `"agents"` tab addition.

Check:
- Is `BuilderTab` union type updated to include `"agents"`?
- Is `GlassAgentPanel` imported and rendered correctly?
- Strip button placement between Aletheia and Powers Menu.

---

### 8. `src/renderer/overlay/Overlay.tsx` — Response Panel agent streaming
Look for `agentResponse` state and the CustomEvent listeners.

Check:
- `glass-agent-start` and `glass-agent-output` listeners — are they cleaned up on unmount?
- Does the synthetic `GlassLastAskResponse` object have all required fields?
- `activeResponse = agentResponse ?? lastAskResponse` — if both are non-null (agent ran, then user asks a real question), does clearing `agentResponse` work correctly?
- Is there a flicker or race when switching between agent output and real responses?

---

### 9. `src/renderer/companion/GlassCompanionProvider.tsx` — Aletheia narration
Look for the `glass-agent-narrate` event handler (`handleNarrate`) near the bottom of `useGlassCompanionSession`.

Check:
- The `useRef` pattern for `companionActiveRef` and `speakingRef` — is `speakingRef.current` always current inside the event handler?
- If Aletheia is already speaking a response and an agent narration arrives, it's skipped (`speakingRef.current` guard). Is that the right behaviour, or should it queue?
- The `useEffect` has `[tts]` in its dependency array. Will `tts` ever change identity and cause the listener to be re-registered? Check `useIivoTtsRequest` for memoisation.
- Is there any memory leak if the component unmounts while a `tts.speak()` promise is pending?

---

## What to look for (general)

- TypeScript `any` or unsafe casts
- Missing `await` on async calls that could fail silently
- Uncaught promise rejections
- IPC handler missing security guard
- React effects missing cleanup
- State updates after component unmount
- Filename/path injection risks in file-writing tools
- Infinite loop conditions in the agent loop

## Out of scope for this review

- Computer Use / screenshot tools (not yet implemented)
- The existing IIVO Glass codebase outside the agent feature files listed above

---

Please provide your findings in a structured list: **file → issue → severity (critical/high/medium/low) → suggested fix**.
