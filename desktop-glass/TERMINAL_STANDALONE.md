# IIVO Terminal (Standalone) — Product Notes & Glass Boundary

*Paused June 2026. Primary focus remains **IIVO Glass** (overlay + copilot). This doc captures decisions, pricing options, and the hard line between standalone download vs terminal-inside-Glass.*

Related: [`TERMINAL_RESEARCH.md`](./TERMINAL_RESEARCH.md) (feature build log, competitive research).

---

## Status

**Paused.** Standalone is buildable (`npm run dev:terminal`, `electron-builder-standalone.yml`) but not a launch priority while Glass ships.

**Why pause:** Glass already includes the same terminal panel (`GlassTerminalPanel`) wired to the overlay, IIVO Ask panel, and screen capture. Shipping a second surface duplicates work (onboarding, pricing, support) without changing the core Glass story.

---

## Two products, one engine

| | **IIVO Glass** | **IIVO Terminal (standalone)** |
|---|---|---|
| **Entry** | `src/main/index.ts` | `src/main/terminalStandalone.ts` |
| **Renderer** | Overlay + dock/terminal window | `src/renderer/terminal-standalone/` |
| **Window** | Always-on-top overlay + optional terminal window | Normal macOS app (Dock icon, one window) |
| **Role** | AI overlay + command layer of the desktop | Downloadable terminal app (Ghostty-like distribution) |
| **App ID / data** | `com.iivo.glass` → `~/Library/Application Support/IIVO Glass/` | `com.iivo.terminal` → `~/Library/Application Support/IIVO Terminal/` |

Both reuse:

- `GlassTerminalPanel.tsx` — xterm.js UI, blocks, hotkeys
- `glassTerminal.ts` — node-pty sessions
- `askIivoGlass()` — AI calls to IIVO server (`IIVO_API_URL`, `IIVO_GLASS_API_SECRET`)
- Scrollback store, terminal fix engine, block parser, etc.

Standalone intentionally registers **only** terminal IPC channels — not overlay, listen, capture, copilot, or palette.

---

## The rule: what standalone may vs must not do

### Standalone **may** include (terminal-native)

These work without overlay, screen capture, or Glass UI:

- Real local shell (PTY, tabs, scrollback, xterm addons)
- Command blocks, copy, auto tab titles
- Explain last error (⌘E)
- Natural language → shell (⌃Space)
- Voice → shell (⌘⇧V) — Deepgram key in Settings / env
- AI command suggestions after each command
- Inline auto-fix on error blocks (`terminalFix` IPC)
- Encrypted persistent scrollback + NL search (⌘⇧F)

AI for the above goes through **IIVO server** today (`askIivoGlass`), same as Glass terminal features — not direct Anthropic BYOK unless wired later.

### **Glass-only** — standalone must not expose or imply

These require overlay architecture, screen capture, or Glass main process (`src/main/index.ts`):

| Feature | Why Glass-only |
|---|---|
| **Screen-aware terminal assistant (⌘⇧E)** | Full display capture + vision; overlay hide/show during capture; `captureDisplayById` in Glass main |
| **Terminal context → IIVO Ask panel** | `terminalContextPush` feeds `getTerminalContextString()` when user asks in **overlay** command bar — no panel in standalone |
| **Overlay auto-fix cards** | On PTY exit, Glass pushes `terminal-fix` into overlay command feed; standalone uses **inline** Fix in the panel instead |
| **⌘⇧P Glass Power Palette** | Dispatches `glassTerminalPendingAction` from overlay |
| **Listen mode, copilot, meeting intel, lens, agent proxy** | Not in `terminalStandalone.ts` at all |
| **Screen recording / diagnostics / multi-window overlay** | Glass app only |

**Product promise:** Only the terminal **inside Glass** (connected to overlay + doc + screen context) gets screen-aware and cross-surface intelligence. Standalone is a **terminal app**, not a lite Glass.

---

## Current leaks (fix before any public standalone release)

Backend is mostly correct; **shared UI still advertises Glass-only or dock-only behavior.**

| Issue | Location | Fix when resuming |
|---|---|---|
| ⌘⇧E / “Screen analysis” still in UI | `GlassTerminalPanel.tsx` welcome + hotkeys + `VisionOverlay` | Hide when `standalone` mode; backend already returns error in `terminalStandalone.ts` |
| Welcome branding “IIVO Glass” | `TerminalWelcome` in `GlassTerminalPanel.tsx` | “IIVO Terminal” in standalone |
| “Hide terminal panel” | Header control | Hide in standalone (no dock to collapse into) |
| Dock resize handles (E/S/SE) | `GlassTerminalPanel.tsx` | Hide in standalone; panel should fill window |
| `resizeTerminal` IPC | Called from panel; not wired in standalone | Hide handles or wire window resize |
| “Ask Glass to fix this error” | Block fix button tooltip | Neutral copy in standalone |
| Header “Glass Terminal” | Tab bar fallback title | “IIVO Terminal” |
| First-run API key screen | `FirstRunSetup.tsx` | Revisit: optional; conflicts with “Ghostty open → shell” story (see pricing section) |
| `terminalContextPush` | Still runs in standalone | Optional: no-op or skip push (nothing reads it) |

Suggested implementation: pass `variant: "glass" | "standalone"` from `terminal-standalone/main.tsx` (context or prop) and gate UI + welcome shortcuts in one place.

---

## Product & pricing options (not decided)

No requirement to charge for standalone. Glass is the primary product; standalone was exploratory (“downloadable terminal like Ghostty”).

### Reference: Warp (2025–2026)

- **Terminal:** free
- **AI:** credit-limited free tier; **~$18–20/mo Build** for serious usage; BYOK optional on paid tiers
- **Model:** account + their cloud AI by default

### Options for IIVO (pick later)

| Model | User experience | Your cost / revenue |
|---|---|---|
| **A. Free terminal, no AI billing** | Open → shell; AI off or server-backed with limits | You pay inference if AI enabled |
| **B. Free download, AI via IIVO server (Glass model)** | Same as Glass terminal features; optional sign-in later | Hosted; you control models |
| **C. BYOK in Settings only** | User pays Anthropic/OpenAI; you pay little for LLM | Harder onboarding; dev-friendly |
| **D. Paid standalone later** | Warp-like credits or subscription | Only if distribution justifies it |

**Current code reality (June 2026):**

- First-run setup collects an AI provider key → Keychain, but **terminal AI still calls IIVO server**, not that key (except **Deepgram** for voice).
- CONNECT saves keys locally; it does not “connect to Anthropic” for LLM features today.

**Recommendation when resuming:** Default to **A or B** — no key gate on first launch; align copy with actual backend (server vs BYOK). Pricing can wait until Glass + standalone audience is clear.

---

## Architecture: AI path

```
Local shell (always)
  Mac ← node-pty ← zsh/bash
  Works offline. No keys required.

Terminal AI features (optional, network)
  GlassTerminalPanel → IPC → terminalStandalone.ts (or index.ts)
    → askIivoGlass() → IIVO server (/api/glass/ask)
    → Auth: IIVO_GLASS_API_SECRET (build/env)

Voice → shell
  Mic → Deepgram (user/env key) → nlToShell → IIVO server

Glass-only vision (⌘⇧E)
  Glass main only → captureDisplayById → vision ask with screenshot
  Standalone: stub error — must not show in UI when shipping standalone
```

---

## Dev commands (when resuming)

```bash
cd desktop-glass
npm run dev:terminal
# Entry: dist-standalone/main/terminalStandalone.js (port 5174, strictPort)

# Package (separate from Glass DMG)
# electron-builder -c electron-builder-standalone.yml
```

Key files:

| File | Purpose |
|---|---|
| `src/main/terminalStandalone.ts` | Standalone main; minimal IPC; vision stub |
| `src/renderer/terminal-standalone/main.tsx` | App shell, first-run gate |
| `src/renderer/dock/GlassTerminalPanel.tsx` | Shared terminal UI (needs variant gating) |
| `electron-builder-standalone.yml` | `com.iivo.terminal` packaging |
| `electron-vite.standalone.config.ts` | Standalone build output → `dist-standalone/` |

---

## Resume checklist

1. [ ] Add `standalone` variant; hide Glass-only UI (vision, hide panel, dock resize)
2. [ ] Rebrand copy (IIVO Terminal, not Glass)
3. [ ] Decide first-run: remove key screen or defer keys to Settings
4. [ ] Align AI story: server-backed vs BYOK vs AI-off-by-default
5. [ ] Smoke test standalone without enabling any Glass-only shortcuts
6. [ ] Optional: stop `terminalContextPush` in standalone main

---

## One-line positioning (draft)

**IIVO Glass:** Always-on AI overlay; terminal is the command layer wired to screen, doc, and Ask panel.

**IIVO Terminal (standalone):** Free Mac terminal with built-in explain, voice, fix, and history search — **without** overlay or screen-aware analysis. For full desktop intelligence, use Glass.
