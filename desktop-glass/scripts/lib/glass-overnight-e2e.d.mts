export type PlaywrightE2eStats = {
  passed: number;
  failed: number;
  skipped: number;
  running: number | null;
  executed: number;
  allSkipped: boolean;
  noTestsExecuted: boolean;
};

export type E2eStepStatus = "pass" | "fail" | "timeout" | "e2e_skipped";

export declare function parsePlaywrightE2eOutput(text: string): PlaywrightE2eStats;

export declare function buildE2eStepEnv(baseEnv?: NodeJS.ProcessEnv): NodeJS.ProcessEnv;

export declare function buildStepEnv(
  baseEnv?: NodeJS.ProcessEnv,
  opts?: { category?: string },
): NodeJS.ProcessEnv;

export declare function resolveE2eStepStatus(input: {
  exitCode: number | null;
  timedOut: boolean;
  logText: string;
  requireRealE2e?: boolean;
}): { status: E2eStepStatus; parsed: PlaywrightE2eStats; reason?: string };

export declare function accumulateE2eStats(
  stats: Record<string, number>,
  parsed: PlaywrightE2eStats,
  status: E2eStepStatus,
): void;
