/** Pure orchestration metrics rollup (no Electron / DB). */

export interface OrchestrationMetrics {
  memoryFtsFallbackLast7Days: number;
  designRepairTriggeredLast7Days: number;
  designRepairSuccessRateLast7Days: number;
  audioCoderAutoLaunchLast7Days: number;
  audioCoderAutoLaunchWithoutWorkspaceLast7Days: number;
  coderLaunchDedupeSuppressedLast7Days: number;
}

export function rollupOrchestrationMetrics(input: {
  memoryFtsFallback: number;
  designRepairTriggered: number;
  designRepairSucceeded: number;
  audioCoderAutoLaunch: number;
  audioCoderAutoLaunchWithoutWorkspace: number;
  coderLaunchDedupeSuppressed: number;
}): OrchestrationMetrics {
  const {
    memoryFtsFallback,
    designRepairTriggered,
    designRepairSucceeded,
    audioCoderAutoLaunch,
    audioCoderAutoLaunchWithoutWorkspace,
    coderLaunchDedupeSuppressed,
  } = input;

  const designRepairSuccessRate =
    designRepairTriggered > 0
      ? Math.round((designRepairSucceeded / designRepairTriggered) * 100) / 100
      : 0;

  return {
    memoryFtsFallbackLast7Days: memoryFtsFallback,
    designRepairTriggeredLast7Days: designRepairTriggered,
    designRepairSuccessRateLast7Days: designRepairSuccessRate,
    audioCoderAutoLaunchLast7Days: audioCoderAutoLaunch,
    audioCoderAutoLaunchWithoutWorkspaceLast7Days: audioCoderAutoLaunchWithoutWorkspace,
    coderLaunchDedupeSuppressedLast7Days: coderLaunchDedupeSuppressed,
  };
}
