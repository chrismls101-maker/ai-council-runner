import { defineConfig, devices } from "@playwright/test";

const recordMode = process.env.QA_VISUAL_RECORD === "1";

export default defineConfig({
  testDir: "tests/visual",
  fullyParallel: false,
  workers: 1,
  timeout: 600_000,
  expect: {
    timeout: 60_000,
  },
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  use: {
    baseURL: "http://localhost:5173",
    trace: recordMode ? "on" : "retain-on-failure",
    screenshot: "only-on-failure",
    video: recordMode ? "on" : "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  outputDir: "test-results",
});
