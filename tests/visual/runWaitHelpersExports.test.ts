/**
 * Ensures run wait helpers are exported — prevents ReferenceError at runtime.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import {
  RunWaitTimeoutError,
  collectRunDiagnostics,
  waitForRunActivityOrComplete,
  waitForRunComplete,
} from "./runWaitHelpers.js";

const helpersPath = join(dirname(fileURLToPath(import.meta.url)), "runWaitHelpers.ts");

test.describe("runWaitHelpers exports", () => {
  test("waitForRunActivityOrComplete and waitForRunComplete are exported functions", () => {
    expect(typeof waitForRunActivityOrComplete).toBe("function");
    expect(typeof waitForRunComplete).toBe("function");
    expect(typeof collectRunDiagnostics).toBe("function");
    expect(RunWaitTimeoutError).toBeTruthy();
  });

  test("runWaitHelpers.ts defines and exports waitForRunActivityOrComplete", () => {
    const src = readFileSync(helpersPath, "utf8");
    expect(src).toMatch(/export async function waitForRunActivityOrComplete/);
  });
});
