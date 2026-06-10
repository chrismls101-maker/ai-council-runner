/**
 * Memory Vault — E2E Tests
 *
 * Tests the full memory CRUD flow:
 *   - Memory vault renders with empty state when no memories exist
 *   - "Create memory" button opens the save modal
 *   - Filling the form and submitting saves a memory (mocked POST)
 *   - Saved memory appears in the list
 *   - Delete button triggers confirmation and removes the memory (mocked DELETE)
 *
 * All API calls are mocked — no live server required.
 *
 * Requirements:
 *   - Dev client at http://localhost:5173 (npm run dev:client)
 *
 * Run:
 *   npx playwright test tests/e2e/memory-vault.spec.ts --project=chromium
 */

import { test, expect, type Page } from "@playwright/test";

const BASE = "http://localhost:5173";

/** Skip onboarding and landing gate. */
async function skipToComposer(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("iivo_landing_gate_unlocked", "1");
    localStorage.setItem("iivo_legal_accepted", "1");
    localStorage.setItem("iivo_onboarding_v1_completed", "true");
  });
}

function fakeMemoory(id: string, title = "Test fact", content = "Test content"): object {
  return {
    id,
    type: "project_fact",
    projectName: "E2E Project",
    title,
    content,
    tags: ["e2e"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/** Stub dashboard APIs plus memory endpoints. Optionally seed initial memories. */
async function stubApis(page: Page, initialMemories: object[] = []): Promise<void> {
  await page.route("**/api/history**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.route("**/api/user-profile**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ profile: null }),
    }),
  );
  await page.route("**/api/workflows**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.route("**/api/usage**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ credits: 100, used: 0 }),
    }),
  );
  await page.route("**/api/health**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }),
  );

  // GET /api/memory — return seeded list
  await page.route("**/api/memory", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ memories: initialMemories, projectNames: ["E2E Project"] }),
      });
    } else if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { title?: string; content?: string };
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(
          fakeMemoory("new-mem-001", body?.title ?? "New fact", body?.content ?? ""),
        ),
      });
    } else {
      await route.continue();
    }
  });

  // DELETE /api/memory/:id
  await page.route("**/api/memory/**", async (route) => {
    if (route.request().method() === "DELETE") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    } else {
      await route.continue();
    }
  });
}

/** Open the Memory Vault panel from the sidebar. */
async function openMemoryVault(page: Page): Promise<void> {
  // Try sidebar nav item first
  const navItem = page.locator(
    '[data-testid="sidebar-nav-memory"], [data-testid="memory-vault-panel"] >> visible=true',
  ).first();
  const navVisible = await navItem.isVisible().catch(() => false);
  if (navVisible) {
    await navItem.click();
  }
  // Memory vault may already be in view in some layouts — just wait for it
  await expect(page.getByTestId("memory-vault")).toBeVisible({ timeout: 10_000 });
}

// ─── Empty state ───────────────────────────────────────────────────────────────

test.describe("Memory Vault — empty state", () => {
  test("shows empty state when no memories exist", async ({ page }) => {
    await skipToComposer(page);
    await stubApis(page, []);
    await page.goto(BASE + "/dashboard");
    await expect(page.getByTestId("composer-input")).toBeVisible({ timeout: 15_000 });

    await openMemoryVault(page);

    await expect(page.getByTestId("memory-empty-state")).toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId("memory-card-list")).not.toBeVisible();
  });

  test("Create memory button is visible in empty state", async ({ page }) => {
    await skipToComposer(page);
    await stubApis(page, []);
    await page.goto(BASE + "/dashboard");
    await expect(page.getByTestId("composer-input")).toBeVisible({ timeout: 15_000 });

    await openMemoryVault(page);

    await expect(page.getByTestId("memory-create-btn")).toBeVisible({ timeout: 8_000 });
  });
});

// ─── Populated state ───────────────────────────────────────────────────────────

test.describe("Memory Vault — populated state", () => {
  const seedMemories = [
    fakeMemoory("mem-001", "Deploy checklist", "Never skip staging."),
    fakeMemoory("mem-002", "Team agreement", "All PRs need two reviews."),
  ];

  test("renders memory cards when memories exist", async ({ page }) => {
    await skipToComposer(page);
    await stubApis(page, seedMemories);
    await page.goto(BASE + "/dashboard");
    await expect(page.getByTestId("composer-input")).toBeVisible({ timeout: 15_000 });

    await openMemoryVault(page);

    const cards = page.getByTestId("memory-card");
    await expect(cards.first()).toBeVisible({ timeout: 8_000 });
    const count = await cards.count();
    expect(count).toBe(2);
  });

  test("each memory card has Edit and Delete buttons", async ({ page }) => {
    await skipToComposer(page);
    await stubApis(page, seedMemories);
    await page.goto(BASE + "/dashboard");
    await expect(page.getByTestId("composer-input")).toBeVisible({ timeout: 15_000 });

    await openMemoryVault(page);

    const firstCard = page.getByTestId("memory-card").first();
    await expect(firstCard).toBeVisible({ timeout: 8_000 });
    await expect(firstCard.getByTestId("memory-edit-btn")).toBeVisible();
    await expect(firstCard.getByTestId("memory-delete-btn")).toBeVisible();
  });

  test("search input filters visible cards", async ({ page }) => {
    await skipToComposer(page);
    await stubApis(page, seedMemories);
    await page.goto(BASE + "/dashboard");
    await expect(page.getByTestId("composer-input")).toBeVisible({ timeout: 15_000 });

    await openMemoryVault(page);
    await expect(page.getByTestId("memory-card").first()).toBeVisible({ timeout: 8_000 });

    // Type a search that matches only one card
    await page.getByTestId("memory-search").fill("Deploy");

    // Only the matching card should be visible
    await expect(page.getByTestId("memory-card")).toHaveCount(1);
  });
});

// ─── Create flow ───────────────────────────────────────────────────────────────

test.describe("Memory Vault — create flow", () => {
  test("clicking Create opens the Save Memory modal", async ({ page }) => {
    await skipToComposer(page);
    await stubApis(page, []);
    await page.goto(BASE + "/dashboard");
    await expect(page.getByTestId("composer-input")).toBeVisible({ timeout: 15_000 });

    await openMemoryVault(page);
    await expect(page.getByTestId("memory-create-btn")).toBeVisible({ timeout: 8_000 });
    await page.getByTestId("memory-create-btn").click();

    await expect(page.getByTestId("save-memory-modal")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId("memory-type-select")).toBeVisible();
    await expect(page.getByTestId("memory-title-input")).toBeVisible();
    await expect(page.getByTestId("memory-content-input")).toBeVisible();
    await expect(page.getByTestId("memory-modal-save")).toBeVisible();
    await expect(page.getByTestId("memory-modal-cancel")).toBeVisible();
  });

  test("Cancel button closes the modal", async ({ page }) => {
    await skipToComposer(page);
    await stubApis(page, []);
    await page.goto(BASE + "/dashboard");
    await expect(page.getByTestId("composer-input")).toBeVisible({ timeout: 15_000 });

    await openMemoryVault(page);
    await expect(page.getByTestId("memory-create-btn")).toBeVisible({ timeout: 8_000 });
    await page.getByTestId("memory-create-btn").click();
    await expect(page.getByTestId("save-memory-modal")).toBeVisible({ timeout: 5_000 });

    await page.getByTestId("memory-modal-cancel").click();
    await expect(page.getByTestId("save-memory-modal")).not.toBeVisible();
  });

  test("filling the form and saving calls POST /api/memory", async ({ page }) => {
    await skipToComposer(page);

    let postCalled = false;
    let postBody: unknown = null;

    // Override memory POST to capture the request
    await page.route("**/api/memory", async (route) => {
      if (route.request().method() === "POST") {
        postCalled = true;
        postBody = route.request().postDataJSON();
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify(fakeMemoory("new-001", "My new fact", "Important content")),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ memories: [], projectNames: [] }),
        });
      }
    });
    await stubApis(page, []);

    await page.goto(BASE + "/dashboard");
    await expect(page.getByTestId("composer-input")).toBeVisible({ timeout: 15_000 });

    await openMemoryVault(page);
    await page.getByTestId("memory-create-btn").click();
    await expect(page.getByTestId("save-memory-modal")).toBeVisible({ timeout: 5_000 });

    await page.getByTestId("memory-title-input").fill("My new fact");
    await page.getByTestId("memory-content-input").fill("Important content");
    await page.getByTestId("memory-modal-save").click();

    // Modal closes after save
    await expect(page.getByTestId("save-memory-modal")).not.toBeVisible({ timeout: 8_000 });
    expect(postCalled, "POST /api/memory was not called").toBe(true);
    expect((postBody as { title?: string })?.title).toBe("My new fact");
  });
});

// ─── Delete flow ───────────────────────────────────────────────────────────────

test.describe("Memory Vault — delete flow", () => {
  const seedMemory = fakeMemoory("del-mem-001", "To be deleted", "Ephemeral content");

  test("clicking Delete calls DELETE /api/memory/:id after confirmation", async ({ page }) => {
    await skipToComposer(page);

    let deleteCalled = false;
    await page.route("**/api/memory/del-mem-001", async (route) => {
      if (route.request().method() === "DELETE") {
        deleteCalled = true;
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      } else {
        await route.continue();
      }
    });
    await stubApis(page, [seedMemory]);

    // Auto-accept the confirm dialog
    page.on("dialog", (dialog) => dialog.accept().catch(() => {}));

    await page.goto(BASE + "/dashboard");
    await expect(page.getByTestId("composer-input")).toBeVisible({ timeout: 15_000 });

    await openMemoryVault(page);
    const card = page.getByTestId("memory-card").first();
    await expect(card).toBeVisible({ timeout: 8_000 });
    await card.getByTestId("memory-delete-btn").click();

    // Wait for the DELETE call to have been made
    await page.waitForTimeout(500);
    expect(deleteCalled, "DELETE /api/memory/:id was not called").toBe(true);
  });
});
