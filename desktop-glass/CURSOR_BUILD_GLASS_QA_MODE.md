# Glass QA Mode — Build Prompt (B7)

**Paste into Cursor Agent. Read `GLASS_CONTEXT.md` and `GLASS_BUILD_IDE_TIER_B.md` first.**

---

## What this builds

**QA Mode** is a toggleable mode inside the Glass IDE. When on, every Glass Coder run is followed by a full automated quality pipeline — types, tests, lint, live preview smoke test, and a two-pass AI review. Nothing slips through.

This is not the default experience. It is a deliberate choice the user makes when they want maximum confidence in what they're shipping. When they toggle it on, they are told exactly what they are entering.

---

## The entry moment — most important part of this build

When the user toggles QA Mode on, a **full-overlay notification card** appears before the pipeline runs for the first time. This is not a toast. It is not a small banner. It is a deliberate, premium Glass-styled moment that tells the user exactly what mode they have entered.

### Notification design

The card appears centered in the Glass IDE stream pane (or overlay center if IDE is not active), with a brief animation in, and auto-dismisses after 6 seconds or on click.

```
┌─────────────────────────────────────────────────┐
│                                                 │
│   ◈  QA Mode                                   │
│                                                 │
│   Every Coder run now triggers a full           │
│   quality pipeline before anything ships:       │
│                                                 │
│   ✓  Types & build                             │
│   ✓  Tests                                     │
│   ✓  Lint                                      │
│   ✓  Live preview — console error scan         │
│   ◎  Two-pass AI review                        │
│      Pass 1 — correctness                      │
│      Pass 2 — what breaks in production        │
│                                                 │
│   Nothing leaves this session with a           │
│   known issue.                                 │
│                                                 │
│   [ Got it ]                          6s ░░░░  │
└─────────────────────────────────────────────────┘
```

**Styling rules:**
- Glass dark background, `backdrop-filter: blur`, border with glass accent color
- Icon `◈` in the accent color (same as Glass Coder icon style)
- The checklist items fade in sequentially (100ms stagger) as the card appears
- Countdown bar at the bottom animates from full to empty over 6 seconds
- "Got it" button dismisses immediately
- The card does **not** reappear on subsequent toggles in the same session — only on first toggle per app launch

### What triggers it

```typescript
// Only show on first QA Mode activation per session
let qaNotificationShownThisSession = false;

function onQaModeToggled(enabled: boolean): void {
  if (enabled && !qaNotificationShownThisSession) {
    qaNotificationShownThisSession = true;
    broadcast(IPC.showQaModeNotification, {});
  }
}
```

---

## QA Mode toggle

### Location

In the Glass IDE toolbar (top bar of `GlassIdeShell`), alongside the existing controls:

```
[Exit IDE]  [File Tree]  [Preview]  ···  [◈ QA Mode ○]
```

The toggle is on the right side of the toolbar. When off: muted, labelled "QA Mode". When on: accent color, pulsing dot indicator, labelled "QA Mode ●".

### State — `src/shared/ipc.ts`

Add to `GlassUserSettings`:
```typescript
qaModeEnabled?: boolean;   // default: false — user explicitly opts in
```

Add to `GlassState`:
```typescript
qaPipelineState?: {
  runId: string;
  status: "idle" | "running" | "done";
  checks: QaCheck[];
  autoFix: boolean;
} | null;

qaNotificationVisible?: boolean;
```

Add `QaCheck` type:
```typescript
export interface QaCheck {
  id: "types" | "tests" | "lint" | "preview" | "review-1" | "review-2";
  label: string;
  status: "pending" | "running" | "pass" | "warn" | "fail" | "skipped";
  detail?: string;   // e.g. "26 passed, 0 failed" / "2 warnings" / "0 console errors"
  fixPrompt?: string; // what to pass to Coder if this check fails
}
```

### New IPC channels — `src/shared/ipc.ts`

```typescript
qaModeToggle:            "glass:qa-mode-toggle",           // renderer → main
showQaModeNotification:  "glass:show-qa-notification",     // main → renderer
dismissQaModeNotification: "glass:dismiss-qa-notification", // renderer → main
qaPipelineUpdate:        "glass:qa-pipeline-update",       // main → renderer: QaCheck[]
qaPipelineFixAll:        "glass:qa-pipeline-fix-all",      // renderer → main
```

---

## The QA Pipeline

Runs automatically after a Coder run completes (all diffs applied/skipped) when `qaModeEnabled === true`. Runs checks sequentially in this order.

### New file: `src/main/coderQaPipeline.ts`

```typescript
/**
 * Glass QA Pipeline — full quality check sequence for Glass Coder runs.
 * Runs when QA Mode is enabled, after all diffs are applied.
 *
 * Checks in order:
 *   1. Types/build    — tsc / npm run build
 *   2. Tests          — detected from package.json
 *   3. Lint           — detected from eslint config
 *   4. Preview smoke  — console error scan via webview probe
 *   5. Review pass 1  — AI correctness review of changed files
 *   6. Review pass 2  — AI "what breaks in production?" review
 */
```

#### Check 1 — Types/build (reuse existing)

Reuse `runCoderVerify()` from `coderBuildLoop.ts`. Map its result to a `QaCheck`.

#### Check 2 — Tests

```typescript
async function detectTestCommand(projectRoot: string): Promise<string | null> {
  // Read package.json, check scripts for: test, vitest, jest
  // Return the first one found, or null if none
}

async function runTestsCheck(projectRoot: string): Promise<QaCheck> {
  const cmd = await detectTestCommand(projectRoot);
  if (!cmd) return { id: "tests", label: "Tests", status: "skipped", detail: "No test script found" };

  const result = await runShellWithTimeout(cmd, projectRoot, 120_000);

  // Parse output for pass/fail counts
  // Vitest: "✓ 26 tests passed" / Jest: "Tests: 26 passed, 0 failed"
  const passMatch = result.output.match(/(\d+)\s+(?:tests?\s+)?passed/i);
  const failMatch = result.output.match(/(\d+)\s+(?:tests?\s+)?failed/i);
  const passed = passMatch ? parseInt(passMatch[1]) : null;
  const failed = failMatch ? parseInt(failMatch[1]) : 0;

  if (result.exitCode !== 0 || (failed && failed > 0)) {
    return {
      id: "tests",
      label: "Tests",
      status: "fail",
      detail: failed ? `${failed} failed` : "Test run failed",
      fixPrompt: `Tests are failing:\n\n${result.output.slice(-2000)}\n\nFix all failing tests.`,
    };
  }

  return {
    id: "tests",
    label: "Tests",
    status: "pass",
    detail: passed ? `${passed} passed` : "All passed",
  };
}
```

#### Check 3 — Lint

```typescript
async function detectLintCommand(projectRoot: string): Promise<string | null> {
  // Check package.json scripts for: lint, eslint
  // Check for .eslintrc.* / eslint.config.* at project root
  // Return "npm run lint" or "npx eslint src" accordingly, or null
}

async function runLintCheck(projectRoot: string): Promise<QaCheck> {
  const cmd = await detectLintCommand(projectRoot);
  if (!cmd) return { id: "lint", label: "Lint", status: "skipped", detail: "No lint config found" };

  const result = await runShellWithTimeout(cmd, projectRoot, 60_000);

  const errorMatch = result.output.match(/(\d+)\s+error/i);
  const warnMatch  = result.output.match(/(\d+)\s+warning/i);
  const errors   = errorMatch ? parseInt(errorMatch[1]) : 0;
  const warnings = warnMatch  ? parseInt(warnMatch[1])  : 0;

  if (errors > 0) {
    return {
      id: "lint",
      label: "Lint",
      status: "fail",
      detail: `${errors} error${errors > 1 ? "s" : ""}${warnings > 0 ? `, ${warnings} warning${warnings > 1 ? "s" : ""}` : ""}`,
      fixPrompt: `Lint errors found:\n\n${result.output.slice(-2000)}\n\nFix all lint errors.`,
    };
  }

  if (warnings > 0) {
    return {
      id: "lint",
      label: "Lint",
      status: "warn",
      detail: `${warnings} warning${warnings > 1 ? "s" : ""}`,
    };
  }

  return { id: "lint", label: "Lint", status: "pass", detail: "Clean" };
}
```

#### Check 4 — Preview smoke test

```typescript
// IPC from renderer: probe the webview for console errors
// Renderer injects a JS listener into the webview, waits 3s, returns results
async function runPreviewSmokeCheck(): Promise<QaCheck> {
  // Main sends IPC to IDE renderer to run the probe
  // Renderer calls webview.executeJavaScript() to install error listener
  // Waits 3s, returns array of console errors
  // If no preview active → skip
}
```

New IPC for the probe:
```typescript
idePreviewProbe:       "glass:ide-preview-probe",        // main → renderer
idePreviewProbeResult: "glass:ide-preview-probe-result", // renderer → main: { errors: string[] }
```

In the IDE renderer (`GlassIdeShell` or wherever the webview lives):

```typescript
window.glass.on(IPC.idePreviewProbe, async () => {
  if (!webviewRef.current) {
    window.glass.idePreviewProbeResult({ errors: [] });
    return;
  }

  const errors: string[] = [];
  await webviewRef.current.executeJavaScript(`
    window.__glassQaErrors = [];
    const _orig = console.error.bind(console);
    console.error = (...args) => { window.__glassQaErrors.push(args.join(' ')); _orig(...args); };
    setTimeout(() => {
      require('electron').ipcRenderer.send('glass:qa-probe-done', window.__glassQaErrors);
    }, 3000);
  `);
  // Listen for probe-done, resolve with errors array
});
```

If preview is not active, return `status: "skipped"`.

#### Check 5 — AI Review Pass 1 (correctness)

```typescript
async function runReviewPass1(changedFiles: string[], projectRoot: string): Promise<QaCheck> {
  // Read changed files (up to 5, 4KB each)
  // Prompt: "Review for correctness — bugs, logic errors, null checks, missing cases"
  // Use askIivoGlass
  // Parse: is it clean or does it have actionable findings?
}
```

#### Check 6 — AI Review Pass 2 (production readiness)

```typescript
async function runReviewPass2(changedFiles: string[], projectRoot: string): Promise<QaCheck> {
  // Same files, different angle
  // Prompt: "You are reviewing for production readiness only.
  //   Ignore style and naming. Focus: what breaks at runtime?
  //   Race conditions, unhandled promise rejections, error handling gaps,
  //   edge cases that only appear under real load or with unexpected input.
  //   Be specific. If nothing is wrong, say so in one sentence."
}
```

Two separate AI calls, two separate perspectives. Both appear as distinct rows in the QA panel.

---

## QA Status Board UI

Lives in the AI stream pane of the Glass IDE, below the changelog. Appears when `qaPipelineState` is set.

```tsx
<div className="gqa-board">
  <div className="gqa-board__header">
    <span className="gqa-board__icon">◈</span>
    <span className="gqa-board__title">QA Pipeline</span>
    <span className="gqa-board__status">{overallStatus}</span>
  </div>

  <div className="gqa-board__checks">
    {checks.map(check => (
      <div key={check.id} className={`gqa-check gqa-check--${check.status}`}>
        <span className="gqa-check__indicator">{statusIcon(check.status)}</span>
        <span className="gqa-check__label">{check.label}</span>
        {check.detail && (
          <span className="gqa-check__detail">{check.detail}</span>
        )}
      </div>
    ))}
  </div>

  {hasFailures && (
    <div className="gqa-board__actions">
      <button
        className="gbtn gbtn--primary"
        onClick={() => window.glass.qaPipelineFixAll({ runId, checks })}
      >
        Fix all with Glass
      </button>
    </div>
  )}
</div>
```

Status icons:
- `pending` → `○` (muted)
- `running` → `⟳` (spinning, accent color)
- `pass` → `✓` (green)
- `warn` → `⚠` (amber)
- `fail` → `✗` (red)
- `skipped` → `–` (muted)

Each check row animates in as it becomes active. The running check has a subtle pulse.

**"Fix all with Glass"** — collects all `fixPrompt` strings from failed checks, combines them into a single Glass Coder prompt, and opens a new Coder run with `autoRun: true`. The loop session continues (increments iteration count, still capped at 4).

---

## Auto-fix setting (off by default)

In Glass IDE settings or toolbar:

```
[◈ QA Mode ●]  [Auto-fix ○]
```

When **Auto-fix** is on:
- Failed checks automatically trigger "Fix all with Glass" without the user clicking
- A 3-second countdown appears on the Fix button before it fires ("Auto-fixing in 3…")
- User can click to cancel during the countdown
- Only triggers if `qaModeEnabled === true`

Add to `GlassUserSettings`:
```typescript
qaAutoFix?: boolean;   // default: false
```

---

## QA Mode notification component

New component: `src/renderer/overlay/GlassQaModeNotification.tsx`

```tsx
export function GlassQaModeNotification({
  visible,
  onDismiss,
}: {
  visible: boolean;
  onDismiss: () => void;
}): JSX.Element {
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    if (!visible) return;
    const start = Date.now();
    const duration = 6000;
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);
      if (remaining === 0) {
        clearInterval(interval);
        onDismiss();
      }
    }, 50);
    return () => clearInterval(interval);
  }, [visible, onDismiss]);

  const checks = [
    "Types & build",
    "Tests",
    "Lint",
    "Live preview — console error scan",
    "Two-pass AI review",
  ];

  return (
    <div className={`gqa-notification${visible ? " gqa-notification--visible" : ""}`}>
      <div className="gqa-notification__icon">◈</div>
      <h2 className="gqa-notification__title">QA Mode</h2>
      <p className="gqa-notification__body">
        Every Coder run now triggers a full quality pipeline before anything ships:
      </p>
      <ul className="gqa-notification__list">
        {checks.map((check, i) => (
          <li
            key={check}
            className="gqa-notification__item"
            style={{ animationDelay: `${i * 100}ms` }}
          >
            {check}
          </li>
        ))}
      </ul>
      <p className="gqa-notification__footer">
        Nothing leaves this session with a known issue.
      </p>
      <button
        className="gbtn gbtn--primary"
        onClick={onDismiss}
      >
        Got it
      </button>
      <div className="gqa-notification__countdown">
        <div
          className="gqa-notification__countdown-bar"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
```

CSS (`GlassQaModeNotification.css`):
- Centered in the IDE stream pane, `position: absolute`, `z-index: 100`
- `backdrop-filter: blur(20px)`, dark glass background, border with `--glass-accent` color
- Entrance: `transform: translateY(12px) scale(0.97)` → `translateY(0) scale(1)`, 200ms ease-out
- `.gqa-notification__item` — fade + slide in with `animation-delay` stagger
- `.gqa-notification__countdown-bar` — `transition: width 50ms linear`, accent color, 3px height
- On exit: reverse entrance animation

---

## Narration cues — `src/shared/agentNarration.ts`

```typescript
"qa-mode-enter":     "QA Mode on. Running the full pipeline."
"qa-types-pass":     "Types clean."
"qa-types-fail":     "Type errors found."
"qa-tests-pass":     "Tests passing."
"qa-tests-fail":     "Tests failing."
"qa-lint-pass":      "Lint clean."
"qa-lint-warn":      "Lint warnings found."
"qa-preview-pass":   "Preview loaded clean."
"qa-review-1":       "Reviewing for correctness."
"qa-review-2":       "Checking production readiness."
"qa-all-pass":       "Everything passed. Ship it."
"qa-fix-trigger":    "Fixing pipeline failures."
```

---

## Implementation order

1. State + IPC channels first — `QaCheck` type, `qaPipelineState`, all new channels
2. `GlassQaModeNotification` component — get the entry moment right before anything else
3. QA toggle in IDE toolbar — wire to `qaModeEnabled` setting
4. `coderQaPipeline.ts` — checks 1–4 (skip review passes initially, test the pipeline UI)
5. Review pass 1 + pass 2 — add last, they're the slowest and need UI to be stable first
6. Auto-fix setting + countdown UI
7. Narration cues

---

## Typecheck

```bash
cd desktop-glass && npm run typecheck
```

Zero errors. New `QaCheck` type must be exported from `ipc.ts` and imported wherever used.

---

## The shift this creates

Most coding tools give you "it compiled." Glass QA Mode gives you:

- It compiled
- Tests pass
- Lint is clean
- The preview loaded without errors
- Two AI engineers reviewed it from different angles

That's the difference between "I think this works" and "I know this works." That's the QA team.
