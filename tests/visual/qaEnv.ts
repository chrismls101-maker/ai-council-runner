/** Visual QA runner pacing — controlled via npm script env vars. */

export function qaLog(message: string): void {
  console.log(`[Visual QA] ${message}`);
}

export function isWatchMode(): boolean {
  return process.env.QA_VISUAL_WATCH === "1";
}

export function isStepMode(): boolean {
  return process.env.QA_VISUAL_STEP === "1";
}

export function pauseMs(baseMs: number): number {
  if (isStepMode()) return Math.max(baseMs * 2, 2000);
  if (isWatchMode()) return baseMs * 3;
  return baseMs;
}

export async function stepBoundary(label: string): Promise<void> {
  qaLog(`── ${label} ──`);
  if (isStepMode()) {
    qaLog("Step mode: pausing 4s before next action…");
    await new Promise((r) => setTimeout(r, 4000));
  }
}
