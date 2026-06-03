/**
 * Optional live provider smoke — skipped unless IMAGE_QA_LIVE=1
 */

import { test, expect } from "@playwright/test";

test.describe("IIVO Image Studio live provider", () => {
  test.skip(!process.env.IMAGE_QA_LIVE, "Set IMAGE_QA_LIVE=1 to run live provider smoke");

  test("config reports live provider when configured", async ({ request }) => {
    const res = await request.get("/api/images/config");
    expect(res.ok()).toBeTruthy();
    const config = await res.json();
    expect(config.enabled).toBeTruthy();
    expect(config.configured).toBeTruthy();
  });
});
