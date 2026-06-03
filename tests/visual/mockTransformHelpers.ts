/**
 * Playwright helpers for mock transform mode without restarting dev server.
 */

import type { Page } from "@playwright/test";

export const MOCK_TRANSFORM_HEADER = "x-iivo-mock-transforms";
export const MOCK_TRANSFORM_HEADER_VALUE = "1";

export const mockTransformExtraHTTPHeaders = {
  [MOCK_TRANSFORM_HEADER]: MOCK_TRANSFORM_HEADER_VALUE,
};

export async function installMockTransformHeaders(page: Page): Promise<void> {
  await page.setExtraHTTPHeaders(mockTransformExtraHTTPHeaders);
}

export function isMockTransformQaEnabled(): boolean {
  return process.env.ARTIFACT_TRANSFORM_MOCK === "1" || process.env.ARTIFACT_QA_SKIP_LIVE === "1";
}
