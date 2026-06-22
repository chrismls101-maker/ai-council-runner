# IIVO Glass — Changelog

## v0.7.0 — 2025-06-19

### Glass Terminal (complete rebuild)
- Replaced emoji control buttons with proper SVG icon components
- Warp-style welcome state on first open: keyboard shortcut cheat sheet (⌘Space, ⌘⇧V, ⌘E, ⌘⇧E, ⌘⇧F)
- Natural Language bar permanently at bottom (always visible, Warp-style)
- xterm.js scrollback bumped to 50,000 lines
- Persistent Smart Scrollback: SQLite-backed encrypted session log with natural language search via Claude
- Screen-Aware Terminal Assistant (⌘⇧E → Claude Vision analysis of current screen)
- AI Command Suggestions: auto-surfaced after each command based on cwd + last output
- Voice → Shell: speak a command, Claude converts it, injects into PTY
- Natural Language → Shell (⌘Space in terminal)
- Explain Last Error (⌘E → Claude analysis)
- Command block grouping with one-click copy
- Cmd+K clear, Cmd+F search hotkeys
- Auto-title terminal tabs from foreground process name
- Inline image rendering (SIXEL + iTerm2 IIP)

### Builder Strip
- Power Prompt Generator — intent + target + mode → structured AI prompt
- API Key Manager — safeStorage-backed key vault with add/edit/delete
- AI Spend Tracker — live usage polling across Anthropic/OpenAI/etc., day history, custom providers
- **Extract & Build Mode** (new) — passive ambient audio listener that detects "how to build X" content:
  - Stage-1 detection (every 30s, fast model): extracts 4-6 word label
  - Stage-2 generation (on demand, Opus): produces full sectioned grand master build prompt
  - Ambient BUILD card overlay (bottom-right): shows `● BUILD → <label>` with destination menu
  - Panel: transcript display, detection badge, Generate button, copy-ready output

### Overlay & Onboarding
- Boot splash redesign
- SortingHat onboarding screen updates
- SubstrateParticles GPGPU swarm (24,000 particles) ported to landing page

### IPC / Architecture
- All new features use `ipcMain.handle` / `ipcRenderer.invoke` pattern
- Module-level store (`extractModeStore.ts`) for cross-component state sharing within same renderer
- `shared/extractModeLogic.ts`, `shared/extractBuildHandoff.ts` — phase logic and build targets
- New IPC channels: `glass:extract-detect`, `glass:extract-generate`
- `src/main/extractMode.ts` — standalone prompt builder module

### Infra
- 7 stacked PRs merged into `feat/glass-v0.7`
- Backup branch: `backup/glass-wip-20250618`
- tsc --noEmit clean (pre-existing GlassUserProfile / SortingHatScreen errors excluded)
- 1735 tests passing

---

## v0.6.1 — prior

- Terminal foundation: PTY, xterm.js, command blocks
- BuilderStrip scaffolding
- Wingman Mode: session engine, screen inspection, agent proxy intercept, git diff, claim verification
- Meeting Intelligence: audio classifier, extraction, live panel, session reports
- Cross-session memory vault
- Deepgram streaming STT + BlackHole system audio capture
- Custom slash commands via `~/.iivo/glass-commands.json`
- Design-to-code screenshot capture
- Diff preview before AI code apply
- Build output monitoring

---

## v0.5.0

- Glass foundation release
- Transparent macOS overlay (Electron)
- Powers palette
- Actions engine
- Code context (import-aware)
