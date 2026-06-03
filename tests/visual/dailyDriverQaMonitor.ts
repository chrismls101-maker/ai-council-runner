/**
 * Daily Driver QA monitor — standalone Agent Mind panel + navigation persistence.
 */

import type { Page } from "@playwright/test";
import { initQaMonitor } from "./qaMonitor.js";
import { isWatchMode, qaLog } from "./qaEnv.js";
import type { DailyDriverReport } from "./dailyDriverReport.js";

export type FrictionSeverityLabel = "none" | "minor" | "major" | "blocker";

export interface DailyAgentMindPanelState {
  scenarioIndex?: number;
  scenarioTotal?: number;
  scenarioTitle?: string;
  plan?: string;
  why?: string;
  goodAnswer?: string;
  badAnswer?: string;
  now?: string;
  observation?: string;
  evaluation?: string;
  routeObserved?: string;
  answerLength?: number;
  latencySec?: number;
  issues?: string;
  verdict?: string;
  frictionSeverity?: FrictionSeverityLabel;
  frictionReason?: string;
  next?: string;
  /** Append one line to the rolling timeline (max 12). */
  timelineEntry?: string;
}

const AGENT_MIND_ROOT_ID = "iivo-daily-agent-mind-root";

const AGENT_MIND_CSS = `
#${AGENT_MIND_ROOT_ID} {
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 2147483647;
  width: min(420px, calc(100vw - 24px));
  max-height: 75vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.45;
  color: #eef4ff;
  background: rgba(8, 14, 24, 0.94);
  border: 2px solid rgba(120, 175, 255, 0.55);
  border-radius: 14px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255,255,255,0.06) inset;
  backdrop-filter: blur(12px);
  pointer-events: none;
  user-select: none;
}
#${AGENT_MIND_ROOT_ID}.watch-mode {
  border-color: rgba(130, 200, 255, 0.85);
  box-shadow: 0 20px 56px rgba(40, 90, 160, 0.35), 0 0 24px rgba(100, 160, 255, 0.2);
}
#${AGENT_MIND_ROOT_ID} .qa-agent-mind-header {
  padding: 10px 14px 8px;
  border-bottom: 1px solid rgba(255,255,255,0.1);
  background: rgba(20, 40, 70, 0.45);
}
#${AGENT_MIND_ROOT_ID} .qa-agent-mind-title {
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.04em;
  color: #b8dcff;
}
#${AGENT_MIND_ROOT_ID} .qa-agent-scenario {
  margin-top: 4px;
  font-size: 12px;
  font-weight: 700;
  color: #ffffff;
}
#${AGENT_MIND_ROOT_ID} .qa-agent-mind-body {
  padding: 10px 14px 12px;
  overflow-y: auto;
  flex: 1;
}
#${AGENT_MIND_ROOT_ID} .qa-agent-row {
  margin: 5px 0;
  color: #c5d4ea;
}
#${AGENT_MIND_ROOT_ID} .qa-agent-row strong {
  color: #e8f2ff;
  font-weight: 700;
}
#${AGENT_MIND_ROOT_ID} .qa-agent-row.is-latest {
  background: rgba(60, 120, 200, 0.18);
  border-left: 3px solid #7eb8ff;
  padding: 4px 8px;
  margin-left: -8px;
  border-radius: 4px;
}
#${AGENT_MIND_ROOT_ID} .qa-agent-timeline {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px dashed rgba(255,255,255,0.12);
}
#${AGENT_MIND_ROOT_ID} .qa-agent-timeline-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #8eb8e8;
  margin-bottom: 6px;
  font-weight: 700;
}
#${AGENT_MIND_ROOT_ID} .qa-agent-timeline ol {
  margin: 0;
  padding-left: 18px;
  color: #a8bdd6;
}
#${AGENT_MIND_ROOT_ID} .qa-agent-timeline li {
  margin: 3px 0;
}
#${AGENT_MIND_ROOT_ID} .qa-agent-timeline li.is-latest {
  color: #ffffff;
  font-weight: 600;
}
#${AGENT_MIND_ROOT_ID} .qa-agent-friction.none strong { color: #6fd893; }
#${AGENT_MIND_ROOT_ID} .qa-agent-friction.minor strong { color: #ffcc66; }
#${AGENT_MIND_ROOT_ID} .qa-agent-friction.major strong { color: #ff9966; }
#${AGENT_MIND_ROOT_ID} .qa-agent-friction.blocker strong { color: #ff7b7b; }
#iivo-visual-qa-monitor {
  z-index: 2147483646 !important;
}
`;

let persistenceRegistered = false;

/** Install Agent Mind panel on every document load (survives page.goto). */
export async function registerDailyDriverMonitorPersistence(
  page: Page,
  options?: { totalScenarios?: number },
): Promise<void> {
  const total = options?.totalScenarios ?? 10;
  const watch = isWatchMode();

  await page.addInitScript(
    ({ rootId, totalScenarios, watchMode }) => {
      const install = () => {
        if (!document.getElementById(rootId)) {
          const root = document.createElement("div");
          root.id = rootId;
          if (watchMode) root.classList.add("watch-mode");
          root.setAttribute("data-testid", "daily-agent-mind-panel");
          root.innerHTML = `
            <div class="qa-agent-mind-header">
              <div class="qa-agent-mind-title">Daily Driver Agent Mind</div>
              <div class="qa-agent-scenario" data-testid="daily-agent-scenario-label">Scenario —</div>
            </div>
            <div class="qa-agent-mind-body">
              <div class="qa-agent-row" data-field="plan"><strong>About to ask:</strong> <span data-testid="daily-agent-current-plan"></span></div>
              <div class="qa-agent-row" data-field="why"><strong>Why testing:</strong> <span></span></div>
              <div class="qa-agent-row" data-field="good"><strong>Good answer:</strong> <span></span></div>
              <div class="qa-agent-row" data-field="bad"><strong>Bad / friction:</strong> <span></span></div>
              <div class="qa-agent-row is-latest" data-field="now"><strong>Status:</strong> <span></span></div>
              <div class="qa-agent-row" data-field="route"><strong>Route:</strong> <span></span></div>
              <div class="qa-agent-row" data-field="metrics"><strong>Answer:</strong> <span></span></div>
              <div class="qa-agent-row" data-field="observation"><strong>Received:</strong> <span data-testid="daily-agent-current-observation"></span></div>
              <div class="qa-agent-row" data-field="evaluation"><strong>Evaluation:</strong> <span data-testid="daily-agent-current-evaluation"></span></div>
              <div class="qa-agent-row" data-field="issues"><strong>Detected issues:</strong> <span></span></div>
              <div class="qa-agent-row qa-agent-friction none" data-field="friction"><strong>Friction:</strong> <span data-testid="daily-agent-friction"></span></div>
              <div class="qa-agent-row" data-field="verdict"><strong>Verdict:</strong> <span></span></div>
              <div class="qa-agent-row" data-field="next"><strong>Next:</strong> <span data-testid="daily-agent-next"></span></div>
              <div class="qa-agent-timeline">
                <div class="qa-agent-timeline-label">Agent timeline</div>
                <ol data-testid="daily-agent-timeline"></ol>
              </div>
            </div>
          `;
          document.body.appendChild(root);

          const agentState = {
            scenarioIndex: 0,
            scenarioTotal: totalScenarios,
            scenarioTitle: "",
            plan: "",
            why: "",
            goodAnswer: "",
            badAnswer: "",
            now: "Initializing…",
            observation: "",
            evaluation: "",
            routeObserved: "",
            answerLength: 0,
            latencySec: 0,
            issues: "",
            verdict: "",
            frictionSeverity: "none",
            frictionReason: "",
            next: "",
            timeline: [] as string[],
            latestField: "now",
          };

          const render = () => {
            const panel = document.getElementById(rootId);
            if (!panel) return;
            const label = panel.querySelector("[data-testid=daily-agent-scenario-label]");
            if (label) {
              const idx = agentState.scenarioIndex;
              const tot = agentState.scenarioTotal;
              const title = agentState.scenarioTitle || "—";
              label.textContent =
                idx > 0 ? `Scenario ${idx}/${tot} — ${title}` : `Scenario — ${title}`;
            }
            const setField = (name: string, text: string, isLatest = false) => {
              const row = panel.querySelector(`[data-field="${name}"]`);
              if (!row) return;
              row.classList.toggle("is-latest", isLatest);
              const span = row.querySelector("span");
              if (span) span.textContent = text || "—";
            };
            setField("plan", agentState.plan, agentState.latestField === "plan");
            setField("why", agentState.why, agentState.latestField === "why");
            setField("good", agentState.goodAnswer, agentState.latestField === "good");
            setField("bad", agentState.badAnswer, agentState.latestField === "bad");
            setField("now", agentState.now, agentState.latestField === "now");
            setField(
              "route",
              agentState.routeObserved || "—",
              agentState.latestField === "route",
            );
            const metrics =
              agentState.answerLength > 0 || agentState.latencySec > 0
                ? `${agentState.answerLength} chars · ${agentState.latencySec}s`
                : "—";
            setField("metrics", metrics, agentState.latestField === "metrics");
            setField("observation", agentState.observation, agentState.latestField === "observation");
            setField("evaluation", agentState.evaluation, agentState.latestField === "evaluation");
            setField("issues", agentState.issues, agentState.latestField === "issues");
            const fr = panel.querySelector("[data-field=friction]") as HTMLElement | null;
            if (fr) {
              fr.className = `qa-agent-row qa-agent-friction ${agentState.frictionSeverity || "none"}`;
              const span = fr.querySelector("[data-testid=daily-agent-friction], span");
              if (span) {
                span.textContent =
                  agentState.frictionSeverity === "none"
                    ? agentState.frictionReason || "None"
                    : `${agentState.frictionSeverity}: ${agentState.frictionReason || "—"}`;
              }
            }
            setField("verdict", agentState.verdict, agentState.latestField === "verdict");
            setField("next", agentState.next, agentState.latestField === "next");

            const ol = panel.querySelector("[data-testid=daily-agent-timeline]");
            if (ol) {
              ol.innerHTML = "";
              const items = agentState.timeline.slice(-12);
              items.forEach((line, i) => {
                const li = document.createElement("li");
                li.textContent = line;
                if (i === items.length - 1) li.classList.add("is-latest");
                ol.appendChild(li);
              });
            }
          };

          (window as unknown as { __IIVO_AGENT_MIND__?: typeof agentState & { render: () => void } })
            .__IIVO_AGENT_MIND__ = Object.assign(agentState, { render });
          render();

          const global = (window as unknown as {
            __IIVO_DAILY_QA__?: { reattachCount: number; lastVisibleAt: string };
          }).__IIVO_DAILY_QA__;
          if (global) {
            global.reattachCount += 1;
            global.lastVisibleAt = new Date().toISOString();
          } else {
            (window as unknown as { __IIVO_DAILY_QA__?: { reattachCount: number; lastVisibleAt: string } })
              .__IIVO_DAILY_QA__ = {
              reattachCount: 1,
              lastVisibleAt: new Date().toISOString(),
            };
          }
        }
      };

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", install);
      } else {
        install();
      }
    },
    { rootId: AGENT_MIND_ROOT_ID, totalScenarios: total, watchMode: watch },
  );

  persistenceRegistered = true;
}

async function injectAgentMindStyles(page: Page): Promise<void> {
  const has = await page.evaluate(
    () => document.querySelector("[data-iivo-daily-agent-mind-styles]") !== null,
  );
  if (!has) {
    await page.addStyleTag({ content: AGENT_MIND_CSS });
    await page.evaluate(() => {
      const tags = document.querySelectorAll("style");
      const last = tags[tags.length - 1];
      if (last) last.setAttribute("data-iivo-daily-agent-mind-styles", "1");
    });
  }
}

async function injectAgentMindPanelNow(page: Page, total: number): Promise<void> {
  await injectAgentMindStyles(page);
  const watch = isWatchMode();
  await page.evaluate(
    ({ rootId, totalScenarios, watchMode }) => {
      const prev = (window as unknown as {
        __IIVO_AGENT_MIND__?: {
          timeline?: string[];
          scenarioIndex?: number;
          scenarioTitle?: string;
          plan?: string;
          why?: string;
        };
      }).__IIVO_AGENT_MIND__;
      const savedTimeline = prev?.timeline ?? [];

      const existing = document.getElementById(rootId);
      if (existing) existing.remove();

      const root = document.createElement("div");
      root.id = rootId;
      if (watchMode) root.classList.add("watch-mode");
      root.setAttribute("data-testid", "daily-agent-mind-panel");
      root.innerHTML = `
        <div class="qa-agent-mind-header">
          <div class="qa-agent-mind-title">Daily Driver Agent Mind</div>
          <div class="qa-agent-scenario" data-testid="daily-agent-scenario-label">Scenario —</div>
        </div>
        <div class="qa-agent-mind-body">
          <div class="qa-agent-row" data-field="plan"><strong>About to ask:</strong> <span data-testid="daily-agent-current-plan"></span></div>
          <div class="qa-agent-row" data-field="why"><strong>Why testing:</strong> <span></span></div>
          <div class="qa-agent-row" data-field="good"><strong>Good answer:</strong> <span></span></div>
          <div class="qa-agent-row" data-field="bad"><strong>Bad / friction:</strong> <span></span></div>
          <div class="qa-agent-row is-latest" data-field="now"><strong>Status:</strong> <span></span></div>
          <div class="qa-agent-row" data-field="route"><strong>Route:</strong> <span></span></div>
          <div class="qa-agent-row" data-field="metrics"><strong>Answer:</strong> <span></span></div>
          <div class="qa-agent-row" data-field="observation"><strong>Received:</strong> <span data-testid="daily-agent-current-observation"></span></div>
          <div class="qa-agent-row" data-field="evaluation"><strong>Evaluation:</strong> <span data-testid="daily-agent-current-evaluation"></span></div>
          <div class="qa-agent-row" data-field="issues"><strong>Detected issues:</strong> <span></span></div>
          <div class="qa-agent-row qa-agent-friction none" data-field="friction"><strong>Friction:</strong> <span data-testid="daily-agent-friction"></span></div>
          <div class="qa-agent-row" data-field="verdict"><strong>Verdict:</strong> <span></span></div>
          <div class="qa-agent-row" data-field="next"><strong>Next:</strong> <span data-testid="daily-agent-next"></span></div>
          <div class="qa-agent-timeline">
            <div class="qa-agent-timeline-label">Agent timeline</div>
            <ol data-testid="daily-agent-timeline"></ol>
          </div>
        </div>`;
      document.body.appendChild(root);

      const agentState = {
        scenarioIndex: prev?.scenarioIndex ?? 0,
        scenarioTotal: totalScenarios,
        scenarioTitle: prev?.scenarioTitle ?? "",
        plan: prev?.plan ?? "",
        why: prev?.why ?? "",
        goodAnswer: "",
        badAnswer: "",
        now: "Panel attached",
        observation: "",
        evaluation: "",
        routeObserved: "",
        answerLength: 0,
        latencySec: 0,
        issues: "",
        verdict: "",
        frictionSeverity: "none",
        frictionReason: "",
        next: "",
        timeline: savedTimeline,
        latestField: "now",
      };

      const render = () => {
        const panel = document.getElementById(rootId);
        if (!panel) return;
        const label = panel.querySelector("[data-testid=daily-agent-scenario-label]");
        if (label) {
          const idx = agentState.scenarioIndex;
          const tot = agentState.scenarioTotal;
          const title = agentState.scenarioTitle || "—";
          label.textContent =
            idx > 0 ? `Scenario ${idx}/${tot} — ${title}` : `Scenario — ${title}`;
        }
        const setField = (name: string, text: string, isLatest = false) => {
          const row = panel.querySelector(`[data-field="${name}"]`);
          if (!row) return;
          row.classList.toggle("is-latest", isLatest);
          const span = row.querySelector("span");
          if (span) span.textContent = text || "—";
        };
        setField("plan", agentState.plan, agentState.latestField === "plan");
        setField("why", agentState.why, agentState.latestField === "why");
        setField("good", agentState.goodAnswer, agentState.latestField === "good");
        setField("bad", agentState.badAnswer, agentState.latestField === "bad");
        setField("now", agentState.now, agentState.latestField === "now");
        setField("route", agentState.routeObserved || "—", agentState.latestField === "route");
        const metrics =
          agentState.answerLength > 0 || agentState.latencySec > 0
            ? `${agentState.answerLength} chars · ${agentState.latencySec}s`
            : "—";
        setField("metrics", metrics, agentState.latestField === "metrics");
        setField("observation", agentState.observation, agentState.latestField === "observation");
        setField("evaluation", agentState.evaluation, agentState.latestField === "evaluation");
        setField("issues", agentState.issues, agentState.latestField === "issues");
        const fr = panel.querySelector("[data-field=friction]") as HTMLElement | null;
        if (fr) {
          fr.className = `qa-agent-row qa-agent-friction ${agentState.frictionSeverity || "none"}`;
          const span = fr.querySelector("[data-testid=daily-agent-friction], span");
          if (span) {
            span.textContent =
              agentState.frictionSeverity === "none"
                ? agentState.frictionReason || "None"
                : `${agentState.frictionSeverity}: ${agentState.frictionReason || "—"}`;
          }
        }
        setField("verdict", agentState.verdict, agentState.latestField === "verdict");
        setField("next", agentState.next, agentState.latestField === "next");
        const ol = panel.querySelector("[data-testid=daily-agent-timeline]");
        if (ol) {
          ol.innerHTML = "";
          agentState.timeline.slice(-12).forEach((line, i, arr) => {
            const li = document.createElement("li");
            li.textContent = line;
            if (i === arr.length - 1) li.classList.add("is-latest");
            ol.appendChild(li);
          });
        }
      };

      (window as unknown as { __IIVO_AGENT_MIND__?: typeof agentState & { render: () => void } })
        .__IIVO_AGENT_MIND__ = Object.assign(agentState, { render });
      render();
    },
    { rootId: AGENT_MIND_ROOT_ID, totalScenarios: total, watchMode: watch },
  );
}

export async function initDailyDriverQaMonitor(
  page: Page,
  options?: { totalScenarios?: number; report?: DailyDriverReport },
): Promise<void> {
  const total = options?.totalScenarios ?? 10;
  await registerDailyDriverMonitorPersistence(page, { totalScenarios: total });

  await initQaMonitor(page, {
    title: "IIVO Daily Driver QA",
    initialStep: "Agent Mind ready",
    initialStatus: "Preparing broad real-world scenario run",
  });

  await injectAgentMindStyles(page);
  await injectAgentMindPanelNow(page, total);

  options?.report?.markAgentPanelVisible();
  qaLog("Daily Driver Agent Mind panel initialized");
}

/** Re-attach QA monitor + Agent Mind after navigation (page.goto wipes injected DOM). */
export async function ensureDailyDriverQaMonitor(
  page: Page,
  options?: { totalScenarios?: number; report?: DailyDriverReport },
): Promise<void> {
  const total = options?.totalScenarios ?? 10;
  await registerDailyDriverMonitorPersistence(page, { totalScenarios: total });

  const hasMonitor = await page.getByTestId("visual-qa-monitor").count();
  if (hasMonitor === 0) {
    await initQaMonitor(page, {
      title: "IIVO Daily Driver QA",
      initialStep: "Agent Mind ready",
      initialStatus: "Running scenarios",
    });
  }

  const hasMind = await page.getByTestId("daily-agent-mind-panel").count();
  if (hasMind === 0) {
    await injectAgentMindStyles(page);
    await injectAgentMindPanelNow(page, total);
    options?.report?.recordAgentReattach();
    qaLog("Daily Driver Agent Mind panel re-attached after navigation");
  }

  options?.report?.markAgentPanelVisible();
}

export async function updateDailyAgentMindPanel(
  page: Page,
  state: DailyAgentMindPanelState,
): Promise<void> {
  if (page.isClosed()) return;
  try {
    await page.evaluate((patch) => {
      const api = (window as unknown as {
        __IIVO_AGENT_MIND__?: Record<string, unknown> & {
          render: () => void;
          timeline: string[];
        };
      }).__IIVO_AGENT_MIND__;
      if (!api) return;

      if (patch.timelineEntry) {
        const line = String(patch.timelineEntry);
        const list = Array.isArray(api.timeline) ? api.timeline : [];
        list.push(line);
        api.timeline = list.slice(-12);
        delete patch.timelineEntry;
      }

      const fieldMap: Record<string, string> = {
        plan: "plan",
        why: "why",
        goodAnswer: "goodAnswer",
        badAnswer: "badAnswer",
        now: "now",
        observation: "observation",
        evaluation: "evaluation",
        routeObserved: "route",
        issues: "issues",
        verdict: "verdict",
        next: "next",
      };

      for (const [key, field] of Object.entries(fieldMap)) {
        if (patch[key as keyof typeof patch] !== undefined) {
          api.latestField = field;
        }
      }

      if (patch.routeObserved !== undefined) api.latestField = "route";
      if (patch.answerLength !== undefined || patch.latencySec !== undefined) {
        api.latestField = "metrics";
      }

      Object.assign(api, patch);
      api.render();
    }, state);
  } catch {
    /* page may close between scenarios */
  }
}
