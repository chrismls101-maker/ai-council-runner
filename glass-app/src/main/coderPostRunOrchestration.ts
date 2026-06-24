/**
 * Schedules QA pipeline or legacy verify/review after Glass Coder finishes,
 * waiting until all write approvals for the run are resolved.
 */

import {
  coderPostRunBlockReason,
  countPendingCoderApprovals,
  type CoderPostRunGateInput,
  type CoderPostRunBlockReason,
  type CoderRunSnapshot,
} from "../shared/coderPostRunOrchestration.ts";

export interface CoderPostRunOrchestrationHost {
  getPendingApproval: () => { runId: string } | null | undefined;
  getApprovalKeys: () => Iterable<string>;
  getAgentRun: () => CoderRunSnapshot | null | undefined;
  getAgentHistory: () => CoderRunSnapshot[];
  getProjectRoot: () => string | null;
  isQaModeEnabled: () => boolean;
  runQaPipeline: (runId: string, projectRoot: string) => Promise<void>;
  orchestrateAfterCoderDone: (runId: string, projectRoot: string) => Promise<void>;
  onQaBlocked?: (runId: string, reason: CoderPostRunBlockReason, pendingApprovalCount: number) => void;
}

export class CoderPostRunScheduler {
  private readonly deferred = new Set<string>();
  private readonly inFlight = new Set<string>();

  requestPostRun(runId: string, host: CoderPostRunOrchestrationHost): void {
    const id = runId.trim();
    if (!id) return;
    this.deferred.add(id);
    queueMicrotask(() => {
      void this.tryRun(id, host);
    });
  }

  notifyRunProgress(runId: string, host: CoderPostRunOrchestrationHost): void {
    const id = runId.trim();
    if (!id || !this.deferred.has(id)) return;
    queueMicrotask(() => {
      void this.tryRun(id, host);
    });
  }

  clear(runId: string): void {
    const id = runId.trim();
    if (!id) return;
    this.deferred.delete(id);
    this.inFlight.delete(id);
  }

  private gateInput(runId: string, host: CoderPostRunOrchestrationHost): CoderPostRunGateInput {
    return {
      runId,
      pendingApproval: host.getPendingApproval(),
      approvalKeys: host.getApprovalKeys(),
      agentRun: host.getAgentRun(),
      agentHistory: host.getAgentHistory(),
    };
  }

  private async tryRun(runId: string, host: CoderPostRunOrchestrationHost): Promise<void> {
    if (!this.deferred.has(runId)) return;

    const gate = this.gateInput(runId, host);
    const blockReason = coderPostRunBlockReason(gate);
    if (blockReason) {
      if (host.isQaModeEnabled() && blockReason === "pending-approval") {
        host.onQaBlocked?.(
          runId,
          blockReason,
          countPendingCoderApprovals(runId, gate.pendingApproval, gate.approvalKeys),
        );
      }
      return;
    }

    const projectRoot = host.getProjectRoot();
    if (!projectRoot) {
      this.clear(runId);
      return;
    }

    if (this.inFlight.has(runId)) return;
    this.inFlight.add(runId);
    this.deferred.delete(runId);

    try {
      if (host.isQaModeEnabled()) {
        await host.runQaPipeline(runId, projectRoot);
      } else {
        await host.orchestrateAfterCoderDone(runId, projectRoot);
      }
    } finally {
      this.inFlight.delete(runId);
    }
  }
}
