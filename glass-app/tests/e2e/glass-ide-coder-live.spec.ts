/**
 * Glass IDE — live Coder proof (real Anthropic API).
 *
 * Verifies the agent actually writes a file to disk, not just UI chrome.
 * Skips when no ANTHROPIC_API_KEY is available (CI / sandbox).
 */

import { test, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  closeGlassApp,
  getElectronE2eSkipReason,
  getGlassWindows,
  GLASS_ROOT,
  launchGlassApp,
  readGlassState,
  type LaunchedGlass,
} from "./helpers/electronApp.ts";
import { logE2eFailureDiagnostics } from "./helpers/e2eFailureDiagnostics.ts";
import { resetE2eSetupState } from "./helpers/e2eSetupReset.ts";

function hasAnthropicKey(): boolean {
  if (process.env.ANTHROPIC_API_KEY?.trim()) return true;
  for (const rel of [".env", "../.env"]) {
    const file = path.join(GLASS_ROOT, rel);
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, "utf8");
    if (/^ANTHROPIC_API_KEY=\S+/m.test(content)) return true;
  }
  return false;
}

const LIVE_SKIP = hasAnthropicKey()
  ? null
  : "Skipped — ANTHROPIC_API_KEY not set (live Coder proof needs a real key).";

let app: LaunchedGlass;
let overlayPage: import("@playwright/test").Page;

test.beforeAll(async () => {
  const skipReason = getElectronE2eSkipReason();
  test.skip(!!skipReason, skipReason ?? undefined);
  test.skip(!!LIVE_SKIP, LIVE_SKIP ?? undefined);

  app = await launchGlassApp();
  const { overlay } = await getGlassWindows(app.browser);
  overlayPage = overlay;
});

test.afterAll(async () => {
  if (app) await closeGlassApp(app);
});

test.afterEach(async ({}, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    await logE2eFailureDiagnostics(app, overlayPage, testInfo.title);
  }
});

test.describe("Glass IDE live Coder proof", () => {
  test("writes proof.ts to the project via Sonnet", async () => {
    test.setTimeout(180_000);

    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "glass-coder-live-"));
    fs.writeFileSync(path.join(projectRoot, "package.json"), JSON.stringify({ name: "proof" }, null, 2));

    await resetE2eSetupState(overlayPage);
    await overlayPage.evaluate(() => {
      window.glass.send({ type: "stop-everything" });
      window.glass.glassIdeClose();
    });

    await overlayPage.evaluate(() => window.glass.glassIdeOpen());
    const selectRes = await overlayPage.evaluate(async (root) => {
      return window.glass.glassIdeSelectWorkspace({ folder: root });
    }, projectRoot);
    expect(selectRes.ok).toBe(true);

    await expect(overlayPage.locator('[data-testid="glass-ide-stream-composer"]')).toBeVisible({
      timeout: 15_000,
    });

    const prompt =
      "Create a new file named proof.ts in the project root with exactly this line:\n" +
      "export const GLASS_PROOF = 42;\n\n" +
      "Use create_file only. Do not run shell commands. Stop after the file is created.";

    const runResult = await overlayPage.evaluate(
      async ({ promptText }) => {
        const runId =
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `live-${Date.now()}`;

        return new Promise<{
          ok: boolean;
          runId: string;
          error?: string;
          kinds: string[];
          tools: string[];
          usage?: { inputTokens: number; outputTokens: number; estimatedUsd: number };
        }>((resolve) => {
          const kinds: string[] = [];
          const tools: string[] = [];
          const timeout = setTimeout(() => {
            unsub();
            resolve({ ok: false, runId, error: "Agent timed out after 150s", kinds, tools });
          }, 150_000);

          const unsub = window.glass.onAgentEvent((ev) => {
            if (ev.runId !== runId) return;
            kinds.push(ev.kind);
            if (ev.toolName) tools.push(ev.toolName);
            if (ev.kind === "approval-required" && ev.pendingToolId) {
              void window.glass.agentApprove({
                runId,
                pendingToolId: ev.pendingToolId,
                approved: true,
              });
            }
            if (ev.kind === "done") {
              clearTimeout(timeout);
              unsub();
              void window.glass.getState().then((state) => {
                const usage = state.coderRunUsage;
                resolve({
                  ok: true,
                  runId,
                  kinds,
                  tools,
                  usage: usage
                    ? {
                        inputTokens: usage.inputTokens,
                        outputTokens: usage.outputTokens,
                        estimatedUsd: usage.estimatedUsd,
                      }
                    : undefined,
                });
              });
            }
            if (ev.kind === "error") {
              clearTimeout(timeout);
              unsub();
              resolve({ ok: false, runId, error: ev.error ?? "Agent error", kinds, tools });
            }
          });

          void window.glass
            .agentSetApprovalMode({ runId, mode: "trust_edits" })
            .then(() => {
              window.dispatchEvent(
                new CustomEvent("glass-agent-start", {
                  detail: { agentId: "coder", prompt: promptText, runId },
                }),
              );
              return window.glass.agentRun({
                agentId: "coder",
                prompt: promptText,
                runId,
              });
            })
            .then((res) => {
              if (!res.started) {
                clearTimeout(timeout);
                unsub();
                resolve({ ok: false, runId, error: res.error ?? "agentRun did not start", kinds, tools });
              }
            });
        });
      },
      { promptText: prompt },
    );

    expect(runResult.error, `Agent failed: ${runResult.error ?? ""}`).toBeUndefined();
    expect(runResult.ok).toBe(true);
    expect(runResult.tools, `tools used: ${runResult.tools.join(", ")}`).toContain("create_file");
    expect(runResult.kinds).toContain("done");

    const proofPath = path.join(projectRoot, "proof.ts");
    await expect.poll(() => fs.existsSync(proofPath), { timeout: 15_000 }).toBe(true);

    const content = fs.readFileSync(proofPath, "utf8");
    expect(content).toMatch(/GLASS_PROOF\s*=\s*42/);

    await expect(overlayPage.locator('[data-testid="glass-ide-transcript"]')).toBeVisible({
      timeout: 10_000,
    });
    const diffCard = overlayPage.locator('[data-testid="glass-ide-transcript-diff"]');
    await expect(diffCard.first()).toBeVisible({ timeout: 30_000 });
    await expect(diffCard.first()).toContainText(/proof\.ts/i);
    await expect(diffCard.first()).toContainText(/TypeScript/i);
    await expect(diffCard.first().locator(".glass-diff__add-count")).toContainText("+1");
    await expect(diffCard.first()).toContainText(/GLASS_PROOF/);

    const state = await readGlassState(overlayPage);
    expect(state.companionModeActive).not.toBe(true);
    expect(state.coderRunUsage?.inputTokens ?? 0).toBeGreaterThan(0);
    expect(state.coderRunUsage?.outputTokens ?? 0).toBeGreaterThan(0);
    expect(state.coderRunUsage?.modelId).toBe("sonnet");

    await expect(overlayPage.locator('[data-testid="glass-ide-cost-footer"]')).toContainText(/est\./);
  });

  test("shows live edit_file diff with +/− on an existing file", async () => {
    test.setTimeout(180_000);

    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "glass-coder-edit-live-"));
    fs.writeFileSync(path.join(projectRoot, "package.json"), JSON.stringify({ name: "edit-proof" }, null, 2));
    fs.writeFileSync(path.join(projectRoot, "seed.ts"), "export const SEED = 1;\n");

    await resetE2eSetupState(overlayPage);
    await overlayPage.evaluate(() => {
      window.glass.send({ type: "stop-everything" });
      window.glass.glassIdeClose();
    });

    await overlayPage.evaluate(() => window.glass.glassIdeOpen());
    const selectRes = await overlayPage.evaluate(async (root) => {
      return window.glass.glassIdeSelectWorkspace({ folder: root });
    }, projectRoot);
    expect(selectRes.ok).toBe(true);

    await expect(overlayPage.locator('[data-testid="glass-ide-stream-composer"]')).toBeVisible({
      timeout: 15_000,
    });

    const prompt =
      "Edit seed.ts in the project root: change `export const SEED = 1;` to `export const SEED = 42;`.\n\n" +
      "Use edit_file only. Do not run shell commands. Stop after the edit is applied.";

    const runResult = await overlayPage.evaluate(
      async ({ promptText }) => {
        const runId =
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `live-edit-${Date.now()}`;

        return new Promise<{
          ok: boolean;
          runId: string;
          error?: string;
          tools: string[];
        }>((resolve) => {
          const tools: string[] = [];
          const timeout = setTimeout(() => {
            unsub();
            resolve({ ok: false, runId, error: "Agent timed out after 150s", tools });
          }, 150_000);

          const unsub = window.glass.onAgentEvent((ev) => {
            if (ev.runId !== runId) return;
            if (ev.toolName) tools.push(ev.toolName);
            if (ev.kind === "approval-required" && ev.pendingToolId) {
              void window.glass.agentApprove({
                runId,
                pendingToolId: ev.pendingToolId,
                approved: true,
              });
            }
            if (ev.kind === "done") {
              clearTimeout(timeout);
              unsub();
              resolve({ ok: true, runId, tools });
            }
            if (ev.kind === "error") {
              clearTimeout(timeout);
              unsub();
              resolve({ ok: false, runId, error: ev.error ?? "Agent error", tools });
            }
          });

          void window.glass
            .agentSetApprovalMode({ runId, mode: "trust_edits" })
            .then(() => {
              window.dispatchEvent(
                new CustomEvent("glass-agent-start", {
                  detail: { agentId: "coder", prompt: promptText, runId },
                }),
              );
              return window.glass.agentRun({
                agentId: "coder",
                prompt: promptText,
                runId,
              });
            })
            .then((res) => {
              if (!res.started) {
                clearTimeout(timeout);
                unsub();
                resolve({ ok: false, runId, error: res.error ?? "agentRun did not start", tools });
              }
            });
        });
      },
      { promptText: prompt },
    );

    expect(runResult.error, `Agent failed: ${runResult.error ?? ""}`).toBeUndefined();
    expect(runResult.ok).toBe(true);
    expect(runResult.tools, `tools used: ${runResult.tools.join(", ")}`).toContain("edit_file");

    const diffCard = overlayPage.locator('[data-testid="glass-ide-transcript-diff"]');
    await expect(diffCard.first()).toBeVisible({ timeout: 30_000 });
    await expect(diffCard.first()).toContainText(/seed\.ts/i);
    await expect(diffCard.first().locator(".glass-diff__add-count")).toContainText("+");
    await expect(diffCard.first().locator(".glass-diff__rem-count")).toContainText("−");

    const seedPath = path.join(projectRoot, "seed.ts");
    await expect.poll(() => fs.readFileSync(seedPath, "utf8"), { timeout: 15_000 }).toMatch(/SEED\s*=\s*42/);
  });

  test("multi-file run surfaces changeset panel with trust_edits", async () => {
    test.setTimeout(240_000);

    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "glass-coder-multi-"));
    fs.writeFileSync(path.join(projectRoot, "package.json"), JSON.stringify({ name: "multi-proof" }, null, 2));

    await resetE2eSetupState(overlayPage);
    await overlayPage.evaluate(() => {
      window.glass.send({ type: "stop-everything" });
      window.glass.glassIdeClose();
    });

    await overlayPage.evaluate(() => window.glass.glassIdeOpen());
    const selectRes = await overlayPage.evaluate(async (root) => {
      return window.glass.glassIdeSelectWorkspace({ folder: root });
    }, projectRoot);
    expect(selectRes.ok).toBe(true);

    await expect(overlayPage.locator('[data-testid="glass-ide-stream-composer"]')).toBeVisible({
      timeout: 15_000,
    });

    const prompt =
      "Create two new files in the project root:\n" +
      "1) alpha.ts with: export const ALPHA = 1;\n" +
      "2) beta.ts with: export const BETA = 2;\n\n" +
      "Use create_file only for both. Do not run shell commands. Stop after both files exist.";

    const runResult = await overlayPage.evaluate(
      async ({ promptText }) => {
        const runId =
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `live-multi-${Date.now()}`;

        return new Promise<{
          ok: boolean;
          runId: string;
          error?: string;
          tools: string[];
        }>((resolve) => {
          const tools: string[] = [];
          const timeout = setTimeout(() => {
            unsub();
            resolve({ ok: false, runId, error: "Agent timed out after 180s", tools });
          }, 180_000);

          const unsub = window.glass.onAgentEvent((ev) => {
            if (ev.runId !== runId) return;
            if (ev.toolName) tools.push(ev.toolName);
            if (ev.kind === "done") {
              clearTimeout(timeout);
              unsub();
              resolve({ ok: true, runId, tools });
            }
            if (ev.kind === "error") {
              clearTimeout(timeout);
              unsub();
              resolve({ ok: false, runId, error: ev.error ?? "Agent error", tools });
            }
          });

          void window.glass
            .agentSetApprovalMode({ runId, mode: "trust_edits" })
            .then(() => window.glass.agentRun({
              agentId: "coder",
              prompt: promptText,
              runId,
            }))
            .then((res) => {
              if (!res.started) {
                clearTimeout(timeout);
                unsub();
                resolve({ ok: false, runId, error: res.error ?? "agentRun did not start", tools });
              }
            });
        });
      },
      { promptText: prompt },
    );

    expect(runResult.error, `Agent failed: ${runResult.error ?? ""}`).toBeUndefined();
    expect(runResult.ok).toBe(true);
    expect(runResult.tools.filter((t) => t === "create_file").length).toBeGreaterThanOrEqual(2);

    await expect.poll(
      () => fs.existsSync(path.join(projectRoot, "alpha.ts")) && fs.existsSync(path.join(projectRoot, "beta.ts")),
      { timeout: 20_000 },
    ).toBe(true);

    const changeset = overlayPage.locator('[data-testid="glass-ide-changeset"]');
    await expect(changeset).toBeVisible({ timeout: 30_000 });
    await expect(changeset).toContainText(/alpha\.ts/i);
    await expect(changeset).toContainText(/beta\.ts/i);

    const reviewCta = overlayPage.locator('[data-testid="glass-ide-review-all-changes"]');
    await expect(reviewCta).toBeVisible({ timeout: 15_000 });
  });
});
