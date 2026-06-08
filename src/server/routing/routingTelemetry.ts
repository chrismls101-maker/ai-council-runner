import { appendFile, mkdir } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import type { ExecutionMode } from "../executionMode/executionMode.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROUTING_LOG_PATH = path.resolve(__dirname, "../../../data/routing-log.jsonl");

export type RoutingDecidingLayer =
  | "fast_direct"
  | "heuristic"
  | "llm_router"
  | "user_override";

export interface RoutingTelemetryEntry {
  timestamp: string;
  runId?: string;
  promptSnippet: string;
  decidedRoute: string;
  decidingLayer: RoutingDecidingLayer;
  executionMode: ExecutionMode;
  routeOverride: boolean;
}

export async function appendRoutingTelemetry(
  entry: RoutingTelemetryEntry,
): Promise<void> {
  try {
    await mkdir(path.dirname(ROUTING_LOG_PATH), { recursive: true });
    await appendFile(ROUTING_LOG_PATH, `${JSON.stringify(entry)}\n`, "utf8");
  } catch {
    /* observation only — never fail the run */
  }
}
