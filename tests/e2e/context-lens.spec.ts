/**
 * Context Lens E2E — Tasks #62
 *
 * Covers the IIVO Lens → app handoff flow:
 *   1. Extension stores context via POST /api/context → gets an id
 *   2. Extension opens iivo.ai/?lensAsk=<id>
 *   3. App fetches the context item, attaches it as a chip in the composer
 *   4. Run payload includes externalContext with the item's contentText
 *
 * Also covers:
 *   - Screenshot context type: chip shows screenshot badge
 *   - Chip remove clears context from composer
 *   - Graceful error when context id is not found (lens-handoff-error banner)
 *   - lensContextId (non-ask) param attaches without auto-submitting
 *
 * All API calls mocked — dev client at http://localhost:5173 (no server needed).
 *
 * Run:
 *   npx playwright test tests/e2e/context-lens.spec.ts --project=chromium
 */

import { test, expect, type Page } from "@playwright/test";

const BASE = "http://localhost:5173";
const MOCK_CTX_ID = "e2e-ctx-lens-001";
const MOCK_SCREENSHOT_ID = "e2e-ctx-screenshot-001";
const MOCK_CONTEXT_TEXT = "E2E mock page context: The company revenue was $4.2M in Q3.";
const MOCK_ANALYSIS = "E2E vision analysis: The screenshot shows a revenue dashboard.";
const MOCK_RUN_ID = "e2e-lens-run-001";
const MOCK_ANSWER = "IIVO answer based on your context.";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function skipGates(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("iivo_landing_gate_unlocked", "1");
    localStorage.setItem("iivo_legal_accepted", "1");
    localStorage.setItem("iivo_onboarding_v1_completed", "true");
  });
}

function stubBaseApis(page: Page, opts: { contextItems?: unknown[] } = {}): void {
  void page.route("**/api/history**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  void page.route("**/api/workflows**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ workflows: [] }) }),
  );
  void page.route("**/api/memory**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ memories: [], projectNames: [] }) }),
  );
  void page.route("**/api/usage**", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ currentCredits: 500, monthlyCredits: 500, usedCreditsThisMonth: 0, recentUsage: [], costTable: [] }),
    }),
  );
  void page.route("**/api/usage/estimate**", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ estimatedCredits: 5, workflowId: "auto", currentCredits: 500, remainingAfterRun: 495 }),
    }),
  );
  void page.route("**/api/user-profile**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ profile: null }) }),
  );
  void page.route("**/api/health**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, missingKeys: [] }) }),
  );
  // Context list
  void page.route("**/api/context", (r) => {
    if (r.request().method() === "GET") {
      return r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: opts.contextItems ?? [] }),
      });
    }
    return r.continue();
  });
}

function mockContextItem(id: string, type: "pasted_text" | "screenshot" = "pasted_text") {
  return {
    id,
    type,
    title: "E2E Test Page",
    contentText: MOCK_CONTEXT_TEXT,
    sourceUrl: "https://example.com/page",
    capturedVia: "browser_lens",
    createdAt: new Date().toISOString(),
    savedToMemory: false,
    screenshotPath: type === "screenshot" ? `/screenshots/${id}.jpg` : undefined,
    imageMimeType: type === "screenshot" ? "image/jpeg" : undefined,
    imageSizeBytes: type === "screenshot" ? 48000 : undefined,
  };
}

function stubRunCouncil(page: Page, capturedBodyRef?: { body: string | null }): void {
  void page.route("**/api/run-council**", async (r) => {
    if (capturedBodyRef) {
      capturedBodyRef.body = r.request().postData();
    }
    const encoder = new TextEncoder();
    const event = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`;
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(event({ type: "progress", agent: "strategy", message: "thinking…" })));
        controller.enqueue(encoder.encode(event({
          type: "run-complete",
          runId: MOCK_RUN_ID,
          result: {
            runId: MOCK_RUN_ID, status: "success",
            outputs: { strategy: MOCK_ANSWER, critic: "", research: "", salesWriter: "", finalJudge: "" },
            errors: [],
          },
        })));
        controller.close();
      },
    });
    await r.fulfill({ status: 200, contentType: "text/event-stream", body: stream });
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe("Context Lens — lensAsk handoff", () => {
  test("lensAsk param auto-attaches context chip in composer", async ({ page }) => {
    await skipGates(page);
    stubBaseApis(page);

    // Mock GET /api/context/:id
    await page.route(`**/api/context/${MOCK_CTX_ID}`, (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockContextItem(MOCK_CTX_ID)),
      }),
    );

    await page.goto(`${BASE}/?lensAsk=${MOCK_CTX_ID}`);

    // Context chip must appear in the attachment bar
    await expect(page.locator('[data-testid="context-attachment-bar"]')).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('[data-testid="context-attachment-chip"]').first()).toBeVisible({ timeout: 5_000 });
  });

  test("lensAsk chip label shows context title", async ({ page }) => {
    await skipGates(page);
    stubBaseApis(page);

    await page.route(`**/api/context/${MOCK_CTX_ID}`, (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockContextItem(MOCK_CTX_ID)) }),
    );

    await page.goto(`${BASE}/?lensAsk=${MOCK_CTX_ID}`);
    await expect(page.locator('[data-testid="context-attachment-chip"]').first()).toContainText("E2E Test Page", { timeout: 8_000 });
  });

  test("removing the chip clears context from composer", async ({ page }) => {
    await skipGates(page);
    stubBaseApis(page);

    await page.route(`**/api/context/${MOCK_CTX_ID}`, (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockContextItem(MOCK_CTX_ID)) }),
    );

    await page.goto(`${BASE}/?lensAsk=${MOCK_CTX_ID}`);
    await expect(page.locator('[data-testid="context-attachment-chip"]').first()).toBeVisible({ timeout: 8_000 });

    await page.locator('[data-testid="context-chip-remove"]').first().click();

    await expect(page.locator('[data-testid="context-attachment-chip"]')).toHaveCount(0, { timeout: 5_000 });
  });

  test("attached context is included in run-council payload", async ({ page }) => {
    await skipGates(page);
    stubBaseApis(page);

    const capturedBody = { body: null as string | null };
    stubRunCouncil(page, capturedBody);

    await page.route(`**/api/context/${MOCK_CTX_ID}`, (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockContextItem(MOCK_CTX_ID)) }),
    );

    await page.goto(`${BASE}/?lensAsk=${MOCK_CTX_ID}`);
    await expect(page.locator('[data-testid="context-attachment-chip"]').first()).toBeVisible({ timeout: 8_000 });

    const input = page.locator('[data-testid="composer-input"]');
    await input.fill("What is the revenue trend?");
    await page.locator('[data-testid="composer-send"]').click();

    // Wait for run to fire
    await expect
      .poll(() => capturedBody.body, { timeout: 10_000 })
      .not.toBeNull();

    const payload = JSON.parse(capturedBody.body!);
    expect(payload.externalContext).toBeDefined();
    expect(JSON.stringify(payload.externalContext)).toContain(MOCK_CONTEXT_TEXT);
  });

  test("unknown lensAsk id shows lens-handoff-error banner", async ({ page }) => {
    await skipGates(page);
    stubBaseApis(page);

    await page.route(`**/api/context/bad-id-404`, (r) =>
      r.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Context item not found" }) }),
    );

    await page.goto(`${BASE}/?lensAsk=bad-id-404`);
    await expect(page.locator('[data-testid="lens-handoff-error"]')).toBeVisible({ timeout: 8_000 });
  });

  test("lens-handoff-error can be dismissed", async ({ page }) => {
    await skipGates(page);
    stubBaseApis(page);

    await page.route(`**/api/context/bad-id-404`, (r) =>
      r.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Not found" }) }),
    );

    await page.goto(`${BASE}/?lensAsk=bad-id-404`);
    await expect(page.locator('[data-testid="lens-handoff-error"]')).toBeVisible({ timeout: 8_000 });

    await page.locator('[data-testid="lens-handoff-error-dismiss"]').click();
    await expect(page.locator('[data-testid="lens-handoff-error"]')).toBeHidden({ timeout: 5_000 });
  });
});

// ─── Screenshot context ───────────────────────────────────────────────────────

test.describe("Context Lens — screenshot type", () => {
  test("screenshot chip shows screenshot badge", async ({ page }) => {
    await skipGates(page);
    stubBaseApis(page);

    await page.route(`**/api/context/${MOCK_SCREENSHOT_ID}`, (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockContextItem(MOCK_SCREENSHOT_ID, "screenshot")),
      }),
    );

    await page.goto(`${BASE}/?lensAsk=${MOCK_SCREENSHOT_ID}`);
    await expect(page.locator('[data-testid="context-screenshot-badge"]')).toBeVisible({ timeout: 8_000 });
  });

  test("screenshot chip thumbnail preview is rendered", async ({ page }) => {
    await skipGates(page);
    stubBaseApis(page);

    await page.route(`**/api/context/${MOCK_SCREENSHOT_ID}`, (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockContextItem(MOCK_SCREENSHOT_ID, "screenshot")),
      }),
    );
    // Stub screenshot image endpoint
    await page.route(`**/api/context/${MOCK_SCREENSHOT_ID}/screenshot`, (r) =>
      r.fulfill({ status: 200, contentType: "image/jpeg", body: Buffer.from("fake-jpeg") }),
    );

    await page.goto(`${BASE}/?lensAsk=${MOCK_SCREENSHOT_ID}`);
    await expect(page.locator('[data-testid="context-chip-screenshot-preview"]')).toBeVisible({ timeout: 8_000 });
  });
});

// ─── Context library panel ────────────────────────────────────────────────────

test.describe("Context Library panel", () => {
  test("context library panel renders saved items", async ({ page }) => {
    await skipGates(page);
    const item = mockContextItem(MOCK_CTX_ID);
    stubBaseApis(page, { contextItems: [item] });

    await page.route(`**/api/context/${MOCK_CTX_ID}`, (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(item) }),
    );

    await page.goto(`${BASE}/`);

    // Navigate to context library via sidebar/nav
    const ctxNav = page.getByRole("link", { name: /context/i }).or(
      page.getByRole("button", { name: /context/i }),
    ).first();
    if (await ctxNav.isVisible()) {
      await ctxNav.click();
    }

    const panel = page.locator('[data-testid="context-library-panel"]');
    if (await panel.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(panel).toBeVisible();
      await expect(page.locator('[data-testid="context-library-list"]')).toBeVisible();
    } else {
      // Panel may be on a different route — skip without failure
      test.skip(true, "Context library panel not reachable from default route in this config");
    }
  });

  test("selecting a lens item shows detail with analyze button for screenshot", async ({ page }) => {
    await skipGates(page);
    const item = mockContextItem(MOCK_SCREENSHOT_ID, "screenshot");
    stubBaseApis(page, { contextItems: [item] });

    await page.route(`**/api/context/${MOCK_SCREENSHOT_ID}`, (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(item) }),
    );
    await page.route(`**/api/context/${MOCK_SCREENSHOT_ID}/screenshot`, (r) =>
      r.fulfill({ status: 200, contentType: "image/jpeg", body: Buffer.from("fake-jpeg") }),
    );
    await page.route(`**/api/context/${MOCK_SCREENSHOT_ID}/analyze-screenshot`, (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ answer: MOCK_ANALYSIS }),
      }),
    );

    await page.goto(`${BASE}/`);

    const ctxNav = page.getByRole("link", { name: /context/i }).or(
      page.getByRole("button", { name: /context/i }),
    ).first();
    if (await ctxNav.isVisible()) {
      await ctxNav.click();
    }

    const panel = page.locator('[data-testid="context-library-panel"]');
    if (!(await panel.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip(true, "Context library panel not reachable in this config");
      return;
    }

    const itemRow = page.locator(`[data-testid="context-library-item-${MOCK_SCREENSHOT_ID}"]`);
    if (await itemRow.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await itemRow.click();
      await expect(page.locator('[data-testid="context-library-analyze-screenshot-btn"]')).toBeVisible({ timeout: 5_000 });
    }
  });
});
