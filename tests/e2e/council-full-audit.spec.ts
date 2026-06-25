/**
 * Council Web App — Full E2E Audit
 *
 * Audits every public-facing page and the dashboard shell.
 * Does NOT call live AI providers — all checks are structural/UI only.
 *
 * Pages covered:
 *   /           → GlassLandingPage (via LandingGate)
 *   /install    → GlassInstallPage
 *   /privacy    → GlassPrivacyPage
 *   /terms      → GlassTermsPage
 *   /dashboard  → App dashboard shell
 *
 * Requirements:
 *   - Dev client running at http://localhost:5173 (npm run dev:client)
 *   - Server NOT required for public pages; dashboard uses graceful degradation
 *
 * Run:
 *   npx playwright test tests/e2e/council-full-audit.spec.ts --project=chromium
 */

import { test, expect, type Page } from "@playwright/test";

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE = "http://localhost:5173";
const SERVER_BASE = "http://localhost:3001";

/** Bypass the LandingGate password screen by setting the storage key directly. */
async function unlockGate(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("iivo_landing_gate_unlocked", "1");
  });
}

/** Collect only meaningful console errors (ignore known benign noise). */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    // Ignore known dev-mode noise
    if (
      text.includes("favicon.ico") ||
      text.includes("net::ERR_") ||
      text.includes("ResizeObserver") ||
      text.includes("Non-Error promise rejection") ||
      text.includes("Download the React DevTools") ||
      text.includes("IIVO_GLASS_API_SECRET") // dev env missing key — not a bug
    ) return;
    errors.push(text);
  });
  return errors;
}

// ─── Public page tests ────────────────────────────────────────────────────────

test.describe("Landing page (/)", () => {
  test("loads without console errors", async ({ page }) => {
    const errors = collectErrors(page);
    await unlockGate(page);
    await page.goto(BASE + "/");
    await expect(page.getByTestId("glass-public-landing")).toBeVisible({ timeout: 15_000 });
    expect(errors, `Console errors: ${errors.join("\n")}`).toHaveLength(0);
  });

  test("shows Glass branding headline", async ({ page }) => {
    await unlockGate(page);
    await page.goto(BASE + "/");
    await expect(page.getByTestId("glass-public-landing")).toBeVisible();
    const heading = page.locator("h1, .glass-landing__hero-title, .glass-landing__title");
    await expect(heading.first()).toBeVisible();
    const text = await heading.first().textContent();
    expect(text?.length ?? 0).toBeGreaterThan(0);
  });

  test("Download button is present and has valid href", async ({ page }) => {
    await unlockGate(page);
    await page.goto(BASE + "/");
    await expect(page.getByTestId("glass-public-landing")).toBeVisible();
    const btn = page.getByTestId("glass-landing-download");
    await expect(btn).toBeVisible();
    const href = await btn.getAttribute("href");
    expect(href).toBeTruthy();
    expect(href).toMatch(/https?:\/\//);
  });

  test("Install Guide link navigates to /install", async ({ page }) => {
    await unlockGate(page);
    await page.goto(BASE + "/");
    await expect(page.getByTestId("glass-public-landing")).toBeVisible();
    const installLink = page.locator('a[href="/install"]').first();
    await expect(installLink).toBeVisible();
    await installLink.click();
    await expect(page).toHaveURL(/\/install/);
    await expect(page.getByTestId("glass-install-page")).toBeVisible({ timeout: 10_000 });
  });

  test("footer Privacy link navigates to /privacy", async ({ page }) => {
    await unlockGate(page);
    await page.goto(BASE + "/");
    await expect(page.getByTestId("glass-public-landing")).toBeVisible();
    const footer = page.getByTestId("glass-landing-footer");
    await expect(footer).toBeVisible();
    const privacyLink = page.getByTestId("glass-landing-privacy-link");
    await expect(privacyLink).toBeVisible();
    await privacyLink.click();
    await expect(page).toHaveURL(/\/privacy/);
    await expect(page.getByTestId("glass-privacy-page")).toBeVisible({ timeout: 10_000 });
  });

  test("footer Terms link navigates to /terms", async ({ page }) => {
    await unlockGate(page);
    await page.goto(BASE + "/");
    await expect(page.getByTestId("glass-public-landing")).toBeVisible();
    const termsLink = page.getByTestId("glass-landing-terms-link");
    await expect(termsLink).toBeVisible();
    await termsLink.click();
    await expect(page).toHaveURL(/\/terms/);
    await expect(page.getByTestId("glass-terms-page")).toBeVisible({ timeout: 10_000 });
  });

  test("renders correctly at 390px mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await unlockGate(page);
    await page.goto(BASE + "/");
    await expect(page.getByTestId("glass-public-landing")).toBeVisible();
    // No horizontal scroll
    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const clientWidth = await page.evaluate(() => document.body.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2); // 2px tolerance
  });
});

// ─── LandingGate tests ────────────────────────────────────────────────────────

test.describe("LandingGate", () => {
  test("shows loading state briefly then resolves", async ({ page }) => {
    // Don't unlock — let it go through natural flow
    await page.goto(BASE + "/");
    // Should eventually resolve to either gate or content (not stay loading)
    await Promise.race([
      expect(page.getByTestId("glass-landing-gate")).toBeVisible({ timeout: 10_000 }),
      expect(page.getByTestId("glass-public-landing")).toBeVisible({ timeout: 10_000 }),
    ]).catch(() => {
      // One or the other must be visible
      throw new Error("Neither gate nor landing content appeared within 10s");
    });
  });

  test("bypasses gate when localStorage key is set", async ({ page }) => {
    await unlockGate(page);
    await page.goto(BASE + "/");
    await expect(page.getByTestId("glass-public-landing")).toBeVisible({ timeout: 15_000 });
    // Gate screen must not be visible
    await expect(page.getByTestId("glass-landing-gate")).not.toBeVisible();
  });

  test("gate password form has correct fields and submit button", async ({ page }) => {
    // Force gate visible by clearing localStorage and faking gate=locked response
    await page.route("**/api/landing-gate/status", (route) => {
      void route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: true }) });
    });
    await page.goto(BASE + "/");
    const gate = page.getByTestId("glass-landing-gate");
    await expect(gate).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("landing-gate-password")).toBeVisible();
    await expect(page.getByTestId("landing-gate-submit")).toBeVisible();
    await expect(page.getByTestId("landing-gate-password-reveal")).toBeVisible();
  });
});

// ─── /install ─────────────────────────────────────────────────────────────────

test.describe("Install page (/install)", () => {
  test("loads and shows install page content", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(BASE + "/install");
    await expect(page.getByTestId("glass-install-page")).toBeVisible({ timeout: 15_000 });
    expect(errors, `Console errors: ${errors.join("\n")}`).toHaveLength(0);
  });

  test("has Installation Guide heading or title text", async ({ page }) => {
    await page.goto(BASE + "/install");
    await expect(page.getByTestId("glass-install-page")).toBeVisible();
    const heading = page.locator("h1");
    await expect(heading.first()).toBeVisible();
    const text = await heading.first().textContent();
    expect(text?.toLowerCase()).toMatch(/install|guide|beta/);
  });

  test("direct download link is present and external", async ({ page }) => {
    await page.goto(BASE + "/install");
    await expect(page.getByTestId("glass-install-page")).toBeVisible();
    const dmgLink = page.locator('a[href*="/api/glass/download/"], a[href*=".dmg"], a[href*="releases"]').first();
    await expect(dmgLink).toBeVisible();
  });

  test("renders correctly at 390px mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(BASE + "/install");
    await expect(page.getByTestId("glass-install-page")).toBeVisible();
    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const clientWidth = await page.evaluate(() => document.body.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
  });
});

// ─── /privacy ─────────────────────────────────────────────────────────────────

test.describe("Privacy page (/privacy)", () => {
  test("loads and shows privacy page content", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(BASE + "/privacy");
    await expect(page.getByTestId("glass-privacy-page")).toBeVisible({ timeout: 15_000 });
    expect(errors, `Console errors: ${errors.join("\n")}`).toHaveLength(0);
  });

  test("contains Privacy Policy heading", async ({ page }) => {
    await page.goto(BASE + "/privacy");
    await expect(page.getByTestId("glass-privacy-page")).toBeVisible();
    await expect(page.getByRole("heading", { name: /privacy/i }).first()).toBeVisible();
  });

  test("renders correctly at 390px mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(BASE + "/privacy");
    await expect(page.getByTestId("glass-privacy-page")).toBeVisible();
    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const clientWidth = await page.evaluate(() => document.body.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
  });
});

// ─── /terms ───────────────────────────────────────────────────────────────────

test.describe("Terms page (/terms)", () => {
  test("loads and shows terms page content", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(BASE + "/terms");
    await expect(page.getByTestId("glass-terms-page")).toBeVisible({ timeout: 15_000 });
    expect(errors, `Console errors: ${errors.join("\n")}`).toHaveLength(0);
  });

  test("contains Terms of Service heading", async ({ page }) => {
    await page.goto(BASE + "/terms");
    await expect(page.getByTestId("glass-terms-page")).toBeVisible();
    await expect(page.getByRole("heading", { name: /terms/i }).first()).toBeVisible();
  });

  test("renders correctly at 390px mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(BASE + "/terms");
    await expect(page.getByTestId("glass-terms-page")).toBeVisible();
    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const clientWidth = await page.evaluate(() => document.body.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
  });
});

// ─── /dashboard ───────────────────────────────────────────────────────────────

test.describe("Dashboard (/dashboard)", () => {
  test("loads the app shell without crashing", async ({ page }) => {
    const errors = collectErrors(page);
    // Intercept API calls that require live server — return minimal stubs
    await page.route("**/api/history**", (route) => {
      void route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    });
    await page.route("**/api/user-profile**", (route) => {
      void route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(null) });
    });
    await page.route("**/api/workflows**", (route) => {
      void route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    });
    await page.goto(BASE + "/dashboard");
    // App shell must be present — no blank/crashed page
    await expect(page.locator("body")).not.toBeEmpty();
    const bodyText = await page.locator("body").textContent();
    expect(bodyText?.length ?? 0).toBeGreaterThan(10);
    // No unhandled crash overlay
    await expect(page.locator("[data-testid='crash-screen'], #__vite-error-overlay")).not.toBeVisible();
    // Only log-level errors (runtime crashes) are failures — network errors are expected without server
    const runtimeErrors = errors.filter(
      (e) =>
        !e.includes("Failed to fetch") &&
        !e.includes("net::ERR_") &&
        !e.includes("localhost:3001"),
    );
    expect(runtimeErrors, `Runtime JS errors: ${runtimeErrors.join("\n")}`).toHaveLength(0);
  });

  test("renders composer input or onboarding modal", async ({ page }) => {
    await page.route("**/api/history**", (route) => {
      void route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    });
    await page.route("**/api/user-profile**", (route) => {
      void route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(null) });
    });
    await page.route("**/api/workflows**", (route) => {
      void route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    });
    await page.goto(BASE + "/dashboard");
    await expect(page.locator("body")).not.toBeEmpty();
    // Either the composer or the onboarding modal must be present
    const composerVisible = await page
      .locator('textarea, [data-testid="chat-composer"], [data-testid="composer-input"]')
      .first()
      .isVisible()
      .catch(() => false);
    const onboardingVisible = await page
      .getByTestId("onboarding-modal")
      .isVisible()
      .catch(() => false);
    expect(
      composerVisible || onboardingVisible,
      "Expected either the chat composer or onboarding modal to be visible",
    ).toBe(true);
  });

  test("renders at 390px mobile viewport without crash", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route("**/api/**", (route) => {
      void route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
    });
    await page.goto(BASE + "/dashboard");
    await expect(page.locator("body")).not.toBeEmpty();
    await expect(page.locator("[data-testid='crash-screen'], #__vite-error-overlay")).not.toBeVisible();
  });
});

// ─── Server health (informational) ───────────────────────────────────────────

test.describe("Server health (port 3001)", () => {
  test("health endpoint responds when server is running", async ({ page }) => {
    // This test is soft — skip if server is not running
    let serverRunning = false;
    try {
      const res = await page.request.get(`${SERVER_BASE}/api/health`, { timeout: 3_000 });
      serverRunning = res.ok();
    } catch {
      serverRunning = false;
    }

    if (!serverRunning) {
      test.skip(true, "Server not running at localhost:3001 — skip health check");
      return;
    }

    const res = await page.request.get(`${SERVER_BASE}/api/health`);
    expect(res.ok()).toBe(true);
    const body = await res.json().catch(() => null);
    expect(body).toBeTruthy();
  });

  test("landing-gate status endpoint responds when server is running", async ({ page }) => {
    let serverRunning = false;
    try {
      const res = await page.request.get(`${SERVER_BASE}/api/landing-gate/status`, { timeout: 3_000 });
      serverRunning = res.ok();
    } catch {
      serverRunning = false;
    }

    if (!serverRunning) {
      test.skip(true, "Server not running — skip");
      return;
    }

    const res = await page.request.get(`${SERVER_BASE}/api/landing-gate/status`);
    expect(res.ok()).toBe(true);
    const body = (await res.json()) as { enabled: boolean };
    expect(typeof body.enabled).toBe("boolean");
  });
});

// ─── Cross-page navigation ────────────────────────────────────────────────────

test.describe("Cross-page navigation", () => {
  test("all public routes return a non-empty page body", async ({ page }) => {
    const routes = ["/", "/install", "/privacy", "/terms"];
    await unlockGate(page);
    for (const route of routes) {
      await page.goto(BASE + route);
      await expect(page.locator("body")).not.toBeEmpty();
      const text = await page.locator("body").textContent();
      expect((text ?? "").trim().length, `${route} body was empty`).toBeGreaterThan(20);
    }
  });

  test("page titles are set correctly for each route", async ({ page }) => {
    await unlockGate(page);

    await page.goto(BASE + "/");
    await expect(page.getByTestId("glass-public-landing")).toBeVisible({ timeout: 10_000 });
    expect(await page.title()).toMatch(/IIVO Glass/i);

    await page.goto(BASE + "/install");
    await expect(page.getByTestId("glass-install-page")).toBeVisible({ timeout: 10_000 });
    expect(await page.title()).toMatch(/Install|IIVO Glass/i);

    await page.goto(BASE + "/privacy");
    await expect(page.getByTestId("glass-privacy-page")).toBeVisible({ timeout: 10_000 });
    expect(await page.title()).toMatch(/Privacy|IIVO Glass/i);

    await page.goto(BASE + "/terms");
    await expect(page.getByTestId("glass-terms-page")).toBeVisible({ timeout: 10_000 });
    expect(await page.title()).toMatch(/Terms|IIVO Glass/i);
  });
});
