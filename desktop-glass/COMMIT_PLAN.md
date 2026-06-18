# GitHub Commit Plan — v0.6.0

Everything since `583a807` (v0.5.0 release) broken into 5 logical commits.
Run these in Cursor's Source Control panel (stage the listed files, then commit).

---

## Commit 1 — Glass Foundation (WIP branch merge)

**Message:** `feat: Glass foundation — PTY terminal, actions engine, powers palette, code context (#WIP)`

Stage these files:

```
# New source files
desktop-glass/src/main/glassActions.ts
desktop-glass/src/main/glassTerminal.ts
desktop-glass/src/main/glassTerminalWindow.ts
desktop-glass/src/main/codeContextReader.ts
desktop-glass/src/main/clipboardIntelligence.ts
desktop-glass/src/main/glassMemory.ts
desktop-glass/src/main/glassScreenDigest.ts
desktop-glass/src/renderer/command/GlassAwarenessStrip.tsx
desktop-glass/src/renderer/command/GlassPowersPalette.tsx
desktop-glass/src/renderer/components/CopyButton.tsx
desktop-glass/src/renderer/components/GlassMarkdown.tsx
desktop-glass/src/renderer/dock/GlassTerminalPanel.tsx
desktop-glass/src/renderer/dock/glassTerminalLayout.ts
desktop-glass/src/renderer/dock/useTerminalPanelResize.ts
desktop-glass/src/renderer/terminal/           ← entire directory
desktop-glass/src/renderer/overlay/TerminalFeedWidget.tsx
desktop-glass/src/renderer/useCopyToClipboard.ts
desktop-glass/src/shared/diff.ts
desktop-glass/src/shared/markdownCode.ts
desktop-glass/src/types/                        ← entire directory (xterm/node-pty stubs)
desktop-glass/src/test/clipboardIntelligence.test.ts
desktop-glass/src/test/diff.test.ts
desktop-glass/src/test/markdownCode.test.ts

# Modified files (WIP changes only — these also contain #161-165 changes
# but commit them here; the history won't be perfect but is readable)
desktop-glass/src/main/glassAskClient.ts
desktop-glass/src/main/glassAutoUpdater.ts
desktop-glass/src/main/glassLayoutManager.ts
desktop-glass/src/main/glassSettingsPersistence.ts
desktop-glass/src/main/windows.ts
desktop-glass/src/preload/index.ts
desktop-glass/src/renderer/ChromeRepositionOverlay.tsx
desktop-glass/src/renderer/command/CommandBar.tsx
desktop-glass/src/renderer/components/IivoAnalysisPanel.tsx
desktop-glass/src/renderer/dock/Dock.tsx
desktop-glass/src/renderer/dock/dockLabels.ts
desktop-glass/src/renderer/dock/useDockResize.ts
desktop-glass/src/renderer/overlay/GlassNotificationHost.tsx
desktop-glass/src/renderer/overlay/GlassUpdateOverlay.tsx
desktop-glass/src/renderer/overlay/Overlay.tsx
desktop-glass/src/renderer/overlay/useGlassNotification.ts
desktop-glass/src/renderer/panel/CopilotPanel.tsx
desktop-glass/src/renderer/panel/Panel.tsx
desktop-glass/src/renderer/panel/WingmanPanel.tsx
desktop-glass/src/renderer/useChromeLockToggle.ts
desktop-glass/src/renderer/useGlassState.ts
desktop-glass/src/shared/commandFeed.ts
desktop-glass/src/shared/glassErrorFAQ.ts
desktop-glass/src/shared/glassLayoutMath.ts
desktop-glass/src/shared/glassNotifications.ts
desktop-glass/src/shared/glassSettings.ts
desktop-glass/src/shared/terminalEvents.ts
desktop-glass/src/shared/wingmanSession.ts
desktop-glass/src/test/glassE2eSmoke.test.ts
desktop-glass/src/test/glassLayoutManager.test.ts
desktop-glass/src/test/glassNotifications.test.ts
desktop-glass/src/test/glassWindowLayout.test.ts
desktop-glass/tests/e2e/glass-meeting-intel.spec.ts
desktop-glass/tests/e2e/glass-wingman-ui.spec.ts
```

---

## Commit 2 — #161 Diff Preview + #162 Build Monitoring

**Message:** `feat: diff preview before AI code apply (#161) + build output monitoring (#162)`

Stage these files:

```
desktop-glass/src/test/buildMonitor.test.ts
desktop-glass/src/main/glassQaBridge.ts
desktop-glass/scripts/glass-qa-agent-proxy-live.mjs
desktop-glass/scripts/glass-qa-snapshot.mjs
desktop-glass/scripts/glass-qa-wingman-full.mjs
desktop-glass/qa-snapshot.md
```

> Note: index.ts, ipc.ts, glass.css, commandFeed.ts changes for #161+#162 will
> ride in Commit 4 with everything else — those files span all features.

---

## Commit 3 — #163 Design-to-Code + #164 Import Graph

**Message:** `feat: design-to-code with screenshot capture (#163) + import-aware codebase context (#164)`

Stage these files:

```
desktop-glass/src/shared/designToCode.ts
desktop-glass/src/renderer/command/CommandDesignIcon.tsx
desktop-glass/src/test/designToCode.test.ts
desktop-glass/src/main/importGraphReader.ts
desktop-glass/src/test/importGraphReader.test.ts
```

---

## Commit 4 — #165 Custom Slash Commands

**Message:** `feat: custom slash commands via ~/.iivo/glass-commands.json (#165)`

Stage these files:

```
desktop-glass/src/shared/customCommands.ts
desktop-glass/src/main/customCommandsLoader.ts
desktop-glass/src/test/customCommands.test.ts
```

---

## Commit 5 — Wiring, CSS, docs, misc

**Message:** `feat: wire #161–#165 into main/index.ts + ipc.ts; update baseline + package`

Stage everything remaining:

```
# The big shared files that accumulated all feature wiring
desktop-glass/src/main/index.ts
desktop-glass/src/shared/ipc.ts
desktop-glass/src/renderer/styles/glass.css
desktop-glass/src/renderer/overlay/OverlayFeedCard.tsx

# Docs and baseline
desktop-glass/tests/BASELINE_v0.6.0.md
desktop-glass/IIVO_GLASS_STRATEGY.md
desktop-glass/package.json
desktop-glass/electron-builder.yml
desktop-glass/electron.vite.config.ts
desktop-glass/glass-update-manifest.json
desktop-glass/resources/bin/iivo-audio-setup
desktop-glass/scripts/iivo-audio-setup.swift
desktop-glass/scripts/notarize-and-release.sh
desktop-glass/tests/BASELINE_v0.5.0.md   ← only if you updated it

# Web app fix
src/pages/LoginPage.tsx
src/server/agents/runVisionAnswer.ts
src/server/config/glassModels.ts
src/server/glass/glassDirectAsk.ts
src/server/glass/glassVisualDirectAsk.ts
src/server/index.ts
src/server/providers/anthropic.ts
package.json
package-lock.json
```

---

## Quick reference — git commands

If you prefer the terminal over Cursor's UI:

```bash
# From /Users/newuser/Desktop/ai-council-runner

# Commit 1 — Foundation
git add desktop-glass/src/main/glassActions.ts \
         desktop-glass/src/main/glassTerminal.ts \
         desktop-glass/src/main/glassTerminalWindow.ts \
         desktop-glass/src/main/codeContextReader.ts \
         desktop-glass/src/main/clipboardIntelligence.ts \
         desktop-glass/src/main/glassMemory.ts \
         desktop-glass/src/main/glassScreenDigest.ts \
         desktop-glass/src/renderer/command/GlassAwarenessStrip.tsx \
         desktop-glass/src/renderer/components/CopyButton.tsx \
         desktop-glass/src/renderer/components/GlassMarkdown.tsx \
         desktop-glass/src/renderer/dock/GlassTerminalPanel.tsx \
         desktop-glass/src/renderer/dock/glassTerminalLayout.ts \
         desktop-glass/src/renderer/dock/useTerminalPanelResize.ts \
         desktop-glass/src/renderer/terminal/ \
         desktop-glass/src/renderer/overlay/TerminalFeedWidget.tsx \
         desktop-glass/src/renderer/useCopyToClipboard.ts \
         desktop-glass/src/shared/diff.ts \
         desktop-glass/src/shared/markdownCode.ts \
         desktop-glass/src/types/ \
         desktop-glass/src/test/clipboardIntelligence.test.ts \
         desktop-glass/src/test/diff.test.ts \
         desktop-glass/src/test/markdownCode.test.ts \
         desktop-glass/src/main/glassAskClient.ts \
         desktop-glass/src/main/glassAutoUpdater.ts \
         desktop-glass/src/main/glassLayoutManager.ts \
         desktop-glass/src/main/glassSettingsPersistence.ts \
         desktop-glass/src/main/windows.ts \
         desktop-glass/src/preload/index.ts \
         desktop-glass/src/renderer/ChromeRepositionOverlay.tsx \
         desktop-glass/src/renderer/command/CommandBar.tsx \
         desktop-glass/src/renderer/components/IivoAnalysisPanel.tsx \
         desktop-glass/src/renderer/dock/Dock.tsx \
         desktop-glass/src/renderer/dock/dockLabels.ts \
         desktop-glass/src/renderer/dock/useDockResize.ts \
         desktop-glass/src/renderer/overlay/GlassNotificationHost.tsx \
         desktop-glass/src/renderer/overlay/GlassUpdateOverlay.tsx \
         desktop-glass/src/renderer/overlay/Overlay.tsx \
         desktop-glass/src/renderer/overlay/useGlassNotification.ts \
         desktop-glass/src/renderer/panel/CopilotPanel.tsx \
         desktop-glass/src/renderer/panel/Panel.tsx \
         desktop-glass/src/renderer/panel/WingmanPanel.tsx \
         desktop-glass/src/renderer/useChromeLockToggle.ts \
         desktop-glass/src/renderer/useGlassState.ts \
         desktop-glass/src/shared/commandFeed.ts \
         desktop-glass/src/shared/glassErrorFAQ.ts \
         desktop-glass/src/shared/glassLayoutMath.ts \
         desktop-glass/src/shared/glassNotifications.ts \
         desktop-glass/src/shared/glassSettings.ts \
         desktop-glass/src/shared/terminalEvents.ts \
         desktop-glass/src/shared/wingmanSession.ts \
         desktop-glass/src/test/glassE2eSmoke.test.ts \
         desktop-glass/src/test/glassLayoutManager.test.ts \
         desktop-glass/src/test/glassNotifications.test.ts \
         desktop-glass/src/test/glassWindowLayout.test.ts \
         desktop-glass/tests/e2e/
git commit -m "feat: Glass foundation — PTY terminal, actions engine, powers palette, code context (#WIP)"

# Commit 2 — #161 + #162
git add desktop-glass/src/test/buildMonitor.test.ts \
         desktop-glass/src/main/glassQaBridge.ts \
         desktop-glass/scripts/glass-qa-agent-proxy-live.mjs \
         desktop-glass/scripts/glass-qa-snapshot.mjs \
         desktop-glass/scripts/glass-qa-wingman-full.mjs \
         desktop-glass/qa-snapshot.md
git commit -m "feat: diff preview before AI code apply (#161) + build output monitoring (#162)"

# Commit 3 — #163 + #164
git add desktop-glass/src/shared/designToCode.ts \
         desktop-glass/src/renderer/command/CommandDesignIcon.tsx \
         desktop-glass/src/test/designToCode.test.ts \
         desktop-glass/src/main/importGraphReader.ts \
         desktop-glass/src/test/importGraphReader.test.ts
git commit -m "feat: design-to-code with screenshot capture (#163) + import-aware codebase context (#164)"

# Commit 4 — #165
git add desktop-glass/src/shared/customCommands.ts \
         desktop-glass/src/main/customCommandsLoader.ts \
         desktop-glass/src/test/customCommands.test.ts
git commit -m "feat: custom slash commands via ~/.iivo/glass-commands.json (#165)"

# Commit 5 — Wiring + docs + misc (everything remaining)
git add -A
git commit -m "feat: wire #161–#165 into index.ts + ipc.ts; baseline v0.6.0; package bump"

# Push
git push origin main
```

---

## Notes for Cursor

In Cursor's Source Control panel (⌃⇧G), you can stage individual files by clicking the `+` next to each filename. Stage the files for Commit 1, write the message, commit — then repeat for each group. The `.release-assets.tmp` file can be safely ignored (add it to `.gitignore` if it keeps showing up).
