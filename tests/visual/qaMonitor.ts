/**
 * Playwright-only QA Monitor overlay — injected at runtime, never in production.
 */

import type { Locator, Page } from "@playwright/test";
import { isStepMode, isWatchMode, pauseMs, qaLog } from "./qaEnv.js";

export type QaCheckState = "pending" | "active" | "pass" | "fail";

export interface QaCheck {
  label: string;
  state: QaCheckState;
}

export interface QaMonitorUpdate {
  step?: string;
  status?: string;
  checks?: QaCheck[];
  warning?: string | null;
  nextAction?: string | null;
}

export interface QaFailInfo {
  expected?: string;
  actual?: string;
  suggestion?: string;
}

const MONITOR_ROOT_ID = "iivo-visual-qa-monitor";

const OVERLAY_CSS = `
#${MONITOR_ROOT_ID} {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 2147483646;
  width: min(340px, calc(100vw - 32px));
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.45;
  color: #e8eef7;
  background: rgba(12, 18, 28, 0.92);
  border: 1px solid rgba(120, 160, 220, 0.35);
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(10px);
  pointer-events: none;
  user-select: none;
}
#${MONITOR_ROOT_ID}.qa-success {
  border-color: rgba(80, 200, 120, 0.65);
  box-shadow: 0 12px 40px rgba(40, 120, 80, 0.25);
}
#${MONITOR_ROOT_ID}.qa-fail {
  border-color: rgba(240, 90, 90, 0.75);
  box-shadow: 0 12px 40px rgba(160, 40, 40, 0.3);
}
#${MONITOR_ROOT_ID} .qa-head {
  padding: 10px 12px 6px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
#${MONITOR_ROOT_ID} .qa-title {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: #9ec5ff;
}
#${MONITOR_ROOT_ID} .qa-step {
  margin-top: 4px;
  font-weight: 600;
  color: #f3f6fb;
}
#${MONITOR_ROOT_ID} .qa-status {
  margin-top: 2px;
  color: #b8c5d9;
}
#${MONITOR_ROOT_ID} .qa-status.qa-status-live {
  color: #c5dcff;
  animation: qa-status-soft-pulse 1.5s ease-in-out infinite alternate;
}
#${MONITOR_ROOT_ID} .qa-pulse-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: rgba(155, 195, 245, 0.95);
  box-shadow: 0 0 0 0 rgba(130, 175, 230, 0.15);
  animation: qa-processing-glow 1.4s ease-in-out infinite alternate;
  vertical-align: middle;
}
#${MONITOR_ROOT_ID} .qa-check.active .qa-check-label {
  color: #dceaff;
}
@keyframes qa-processing-glow {
  0% { opacity: 0.45; transform: scale(0.9); box-shadow: 0 0 0 0 rgba(130, 175, 230, 0.12); }
  100% { opacity: 1; transform: scale(1.15); box-shadow: 0 0 10px 2px rgba(155, 195, 245, 0.32); }
}
@keyframes qa-status-soft-pulse {
  0% { opacity: 0.82; }
  100% { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  #${MONITOR_ROOT_ID} .qa-pulse-dot,
  #${MONITOR_ROOT_ID} .qa-status.qa-status-live {
    animation: none !important;
  }
  #${MONITOR_ROOT_ID} .qa-pulse-dot {
    opacity: 0.85;
    box-shadow: 0 0 6px 1px rgba(155, 195, 245, 0.22);
  }
}
#${MONITOR_ROOT_ID} .qa-elapsed {
  margin-top: 2px;
  color: #8aa0be;
  font-size: 11px;
}
#${MONITOR_ROOT_ID} .qa-warning {
  margin: 8px 12px 0;
  padding: 6px 8px;
  border-radius: 8px;
  background: rgba(255, 180, 60, 0.12);
  border: 1px solid rgba(255, 180, 60, 0.35);
  color: #ffd699;
}
#${MONITOR_ROOT_ID} .qa-next {
  margin: 8px 12px 0;
  padding: 6px 8px;
  border-radius: 8px;
  background: rgba(100, 160, 255, 0.1);
  border: 1px dashed rgba(100, 160, 255, 0.35);
  color: #b9d4ff;
}
#${MONITOR_ROOT_ID} .qa-checks {
  padding: 8px 12px 12px;
}
#${MONITOR_ROOT_ID} .qa-checks-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #7d91ad;
  margin-bottom: 6px;
}
#${MONITOR_ROOT_ID} .qa-check {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin: 3px 0;
}
#${MONITOR_ROOT_ID} .qa-check-icon {
  width: 14px;
  flex-shrink: 0;
  text-align: center;
}
#${MONITOR_ROOT_ID} .qa-check.pass .qa-check-icon { color: #6fd893; }
#${MONITOR_ROOT_ID} .qa-check.active .qa-check-icon { color: #ffcc66; }
#${MONITOR_ROOT_ID} .qa-check.fail .qa-check-icon { color: #ff7b7b; }
#${MONITOR_ROOT_ID} .qa-check.pending .qa-check-icon { color: #6b7c94; }
#${MONITOR_ROOT_ID} .qa-fail-detail {
  margin: 8px 12px 12px;
  padding: 8px;
  border-radius: 8px;
  background: rgba(240, 90, 90, 0.08);
  border: 1px solid rgba(240, 90, 90, 0.25);
  color: #ffc9c9;
  white-space: pre-wrap;
}
#${MONITOR_ROOT_ID} .qa-success-list {
  margin: 0;
  padding: 0 12px 12px 24px;
  color: #c8f0d4;
}
`;

async function ensureStyles(page: Page): Promise<void> {
  const hasStyle = await page.evaluate(() =>
    Boolean(document.querySelector("[data-iivo-qa-styles]")),
  );
  if (!hasStyle) {
    await page.addStyleTag({ content: OVERLAY_CSS });
    await page.evaluate(() => {
      const tags = document.querySelectorAll("style");
      const last = tags[tags.length - 1];
      if (last) last.setAttribute("data-iivo-qa-styles", "1");
    });
  }
}

/** Inject the floating QA Monitor overlay (Playwright-only). */
export async function initQaMonitor(
  page: Page,
  options?: {
    title?: string;
    initialStep?: string;
    initialStatus?: string;
  },
): Promise<void> {
  const title = options?.title ?? "IIVO Visual QA";
  const initialStep = options?.initialStep ?? "Initializing…";
  const initialStatus = options?.initialStatus ?? "Starting test run";
  await ensureStyles(page);
  await page.evaluate(
    ({ rootId, title, initialStep, initialStatus }) => {
      if (document.getElementById(rootId)) return;

      const root = document.createElement("div");
      root.id = rootId;
      root.setAttribute("data-testid", "visual-qa-monitor");
      root.innerHTML = `
        <div class="qa-head">
          <div class="qa-title">${title}</div>
          <div class="qa-step">${initialStep}</div>
          <div class="qa-status">${initialStatus}</div>
          <div class="qa-elapsed">Elapsed: 00:00</div>
        </div>
        <div class="qa-warning" hidden></div>
        <div class="qa-next" hidden></div>
        <div class="qa-checks">
          <div class="qa-checks-label">Checks</div>
          <div class="qa-check-list"></div>
        </div>
        <div class="qa-fail-detail" hidden></div>
      `;
      document.body.appendChild(root);

      const state = {
        startedAt: Date.now(),
        monitorTitle: title,
        step: initialStep,
        status: initialStatus,
        warning: null as string | null,
        nextAction: null as string | null,
        checks: [] as Array<{ label: string; state: string }>,
        timerId: 0 as number,
        mode: "running" as "running" | "success" | "fail",
        failDetail: null as string | null,
      };

      const iconFor = (s: string) => {
        if (s === "pass") return "✓";
        if (s === "active") return '<span class="qa-pulse-dot" aria-hidden="true"></span>';
        if (s === "fail") return "✗";
        return "○";
      };

      const isWaitingStatus = (status: string, warning: string | null) =>
        Boolean(warning) ||
        /waiting|submitting|checking council|verifying/i.test(status);

      const formatElapsed = (ms: number) => {
        const total = Math.floor(ms / 1000);
        const m = Math.floor(total / 60);
        const s = total % 60;
        return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
      };

      const render = () => {
        const el = document.getElementById(rootId);
        if (!el) return;

        el.classList.toggle("qa-success", state.mode === "success");
        el.classList.toggle("qa-fail", state.mode === "fail");

        const titleEl = el.querySelector(".qa-title");
        if (titleEl) {
          titleEl.textContent =
            state.mode === "success"
              ? `${state.monitorTitle} Passed`
              : state.mode === "fail"
                ? `${state.monitorTitle} Failed`
                : state.monitorTitle;
        }

        const stepEl = el.querySelector(".qa-step");
        const statusEl = el.querySelector(".qa-status");
        const elapsedEl = el.querySelector(".qa-elapsed");
        if (stepEl) stepEl.textContent = state.step;
        if (statusEl) {
          statusEl.textContent = state.status;
          statusEl.classList.toggle(
            "qa-status-live",
            state.mode === "running" && isWaitingStatus(state.status, state.warning),
          );
        }
        if (elapsedEl) {
          elapsedEl.textContent = `Elapsed: ${formatElapsed(Date.now() - state.startedAt)}`;
        }

        const warnEl = el.querySelector(".qa-warning") as HTMLElement | null;
        if (warnEl) {
          if (state.warning) {
            warnEl.hidden = false;
            warnEl.textContent = `⚠ ${state.warning}`;
          } else {
            warnEl.hidden = true;
            warnEl.textContent = "";
          }
        }

        const nextEl = el.querySelector(".qa-next") as HTMLElement | null;
        if (nextEl) {
          if (state.nextAction) {
            nextEl.hidden = false;
            nextEl.textContent = `Next: ${state.nextAction}`;
          } else {
            nextEl.hidden = true;
            nextEl.textContent = "";
          }
        }

        const list = el.querySelector(".qa-check-list");
        if (list) {
          list.innerHTML = state.checks
            .map(
              (c) =>
                `<div class="qa-check ${c.state}"><span class="qa-check-icon">${iconFor(c.state)}</span><span class="qa-check-label">${c.label}</span></div>`,
            )
            .join("");
        }

        const failEl = el.querySelector(".qa-fail-detail") as HTMLElement | null;
        if (failEl) {
          if (state.failDetail) {
            failEl.hidden = false;
            failEl.textContent = state.failDetail;
          } else {
            failEl.hidden = true;
            failEl.textContent = "";
          }
        }
      };

      if (state.timerId) window.clearInterval(state.timerId);
      state.timerId = window.setInterval(render, 1000);

      (window as unknown as { __IIVO_QA__: typeof state & { render: () => void } }).__IIVO_QA__ =
        Object.assign(state, { render });
      render();
    },
    { rootId: MONITOR_ROOT_ID, title, initialStep, initialStatus },
  );
  qaLog(`QA Monitor overlay initialized (${title})`);
}

export async function updateQaMonitor(page: Page, update: QaMonitorUpdate): Promise<void> {
  if (page.isClosed()) {
    qaLog("QA Monitor: page closed — skipping updateQaMonitor");
    return;
  }
  try {
    await page.evaluate((payload) => {
      const api = (window as unknown as { __IIVO_QA__?: Record<string, unknown> }).__IIVO_QA__;
      if (!api) return;
      if (payload.step !== undefined) api.step = payload.step;
      if (payload.status !== undefined) api.status = payload.status;
      if (payload.checks !== undefined) api.checks = payload.checks;
      if (payload.warning !== undefined) api.warning = payload.warning;
      if (payload.nextAction !== undefined) api.nextAction = payload.nextAction;
      (api.render as () => void)();
    }, update);
  } catch (err) {
    if (page.isClosed() || isClosedPageError(err)) {
      qaLog("QA Monitor: page closed during updateQaMonitor");
      return;
    }
    throw err;
  }
  await qaPauseAfterUpdate(page);
}

function isClosedPageError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("Target page, context or browser has been closed");
}

export async function markQaCheck(
  page: Page,
  label: string,
  state: QaCheckState,
): Promise<void> {
  if (page.isClosed()) return;
  try {
    await page.evaluate(
      ({ label, state }) => {
        const api = (window as unknown as {
          __IIVO_QA__?: { checks: Array<{ label: string; state: string }>; render: () => void };
        }).__IIVO_QA__;
        if (!api) return;
        const idx = api.checks.findIndex((c) => c.label === label);
        if (idx >= 0) api.checks[idx]!.state = state;
        else api.checks.push({ label, state });
        api.render();
      },
      { label, state },
    );
  } catch (err) {
    if (page.isClosed() || isClosedPageError(err)) return;
    throw err;
  }
}

export async function showQaWarning(page: Page, message: string): Promise<void> {
  qaLog(`QA warning: ${message}`);
  await updateQaMonitor(page, { warning: message });
}

export async function completeQaStep(page: Page, label: string): Promise<void> {
  qaLog(`QA step complete: ${label}`);
  await updateQaMonitor(page, { status: `${label} — done`, warning: null, nextAction: null });
}

export async function failQaStep(
  page: Page,
  label: string,
  error: QaFailInfo & { message?: string },
): Promise<void> {
  const detail = [
    `Failed step: ${label}`,
    error.expected ? `Expected: ${error.expected}` : "",
    error.actual ? `Actual: ${error.actual}` : "",
    error.suggestion ? `Suggestion: ${error.suggestion}` : "",
    error.message ? `Error: ${error.message}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  qaLog(`QA step failed: ${label}`);
  qaLog(detail);

  if (page.isClosed()) {
    qaLog("QA Monitor: page already closed — logged failure to console only");
    return;
  }

  try {
    await page.evaluate(
      ({ label, detail }) => {
        const api = (window as unknown as {
          __IIVO_QA__?: {
            mode: string;
            step: string;
            status: string;
            failDetail: string | null;
            nextAction: string | null;
            warning: string | null;
            render: () => void;
          };
        }).__IIVO_QA__;
        if (!api) return;
        api.mode = "fail";
        api.step = label;
        api.status = "Test failed";
        api.failDetail = detail;
        api.nextAction = null;
        api.warning = null;
        api.render();
      },
      { label, detail },
    );
    await page.waitForTimeout(pauseMs(1500));
  } catch (err) {
    if (page.isClosed() || isClosedPageError(err)) {
      qaLog("QA Monitor: page closed during failQaStep — logged failure to console only");
      return;
    }
    throw err;
  }
}

export async function showQaSuccess(
  page: Page,
  summaryItems: string[],
  options?: { statusMessage?: string },
): Promise<void> {
  const statusMessage = options?.statusMessage ?? "All checks verified";
  qaLog("QA Monitor: showing success summary");
  await page.evaluate(
    ({ items, statusMessage }) => {
      const api = (window as unknown as {
        __IIVO_QA__?: {
          mode: string;
          step: string;
          status: string;
          checks: Array<{ label: string; state: string }>;
          warning: string | null;
          nextAction: string | null;
          failDetail: string | null;
          render: () => void;
        };
      }).__IIVO_QA__;
      if (!api) return;
      api.mode = "success";
      api.step = "All steps passed";
      api.status = statusMessage;
      api.warning = null;
      api.nextAction = null;
      api.failDetail = null;
      api.checks = items.map((label) => ({ label, state: "pass" }));
      api.render();
    },
    { items: summaryItems, statusMessage },
  );
}

export async function qaAnnounceNext(page: Page, action: string): Promise<void> {
  qaLog(`Next action: ${action}`);
  await updateQaMonitor(page, { nextAction: action });
}

export async function qaHighlight(page: Page, locator: Locator): Promise<void> {
  if (!isWatchMode() && !isStepMode()) return;
  try {
    await locator.highlight();
    await page.waitForTimeout(pauseMs(400));
  } catch {
    /* element may not be visible yet */
  }
}

export async function qaPauseAfterUpdate(page: Page, baseMs = 350): Promise<void> {
  if (page.isClosed()) return;
  if (isWatchMode() || isStepMode()) {
    await page.waitForTimeout(pauseMs(baseMs));
  }
}

export async function qaClick(page: Page, locator: Locator, nextLabel?: string): Promise<void> {
  if (page.isClosed()) {
    qaLog("QA click skipped — page already closed");
    return;
  }
  if (nextLabel) await qaAnnounceNext(page, nextLabel);
  await qaHighlight(page, locator);
  await locator.click();
}

export async function qaFill(
  page: Page,
  locator: Locator,
  value: string,
  nextLabel?: string,
): Promise<void> {
  if (nextLabel) await qaAnnounceNext(page, nextLabel);
  await qaHighlight(page, locator);
  await locator.fill(value);
}
