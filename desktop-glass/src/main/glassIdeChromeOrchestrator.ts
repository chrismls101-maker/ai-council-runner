/**
 * Main-process IDE chrome orchestrator — applies policy and manages collapse timers.
 */

import {
  applyIdeChromeSignal,
  GLASS_IDE_TERMINAL_AUTO_COLLAPSE_MS,
  initialIdeChromeOrchestratorState,
  shouldAutoCollapseNow,
  type IdeChromeOrchestratorState,
  type IdeChromeSignal,
} from "../shared/glassIdeChromeOrchestrator.ts";

export interface IdeChromeOrchestratorHost {
  isIdeActive: () => boolean;
  getExpanded: () => boolean;
  setExpanded: (expanded: boolean) => void;
  push: () => void;
}

export class IdeChromeOrchestrator {
  private state: IdeChromeOrchestratorState = initialIdeChromeOrchestratorState();
  private collapseTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly host: IdeChromeOrchestratorHost) {}

  onSignal(signal: IdeChromeSignal): void {
    if (!this.host.isIdeActive() && signal.kind !== "ide-closed") return;

    const now = Date.now();
    const effect = applyIdeChromeSignal(this.state, signal, now);

    this.state = {
      expanded: effect.expanded,
      lastTerminalInteractionAt: effect.lastTerminalInteractionAt,
      manualOverrideUntil: effect.manualOverrideUntil,
      runFailed: effect.runFailed,
    };

    if (effect.cancelAutoCollapse) {
      this.clearCollapseTimer();
    }

    const prevExpanded = this.host.getExpanded();
    if (prevExpanded !== effect.expanded) {
      this.host.setExpanded(effect.expanded);
      this.host.push();
    } else if (
      signal.kind === "terminal-interaction"
      || signal.kind === "agent-error"
      || signal.kind === "post-run-complete"
    ) {
      this.host.push();
    }

    if (effect.scheduleAutoCollapse) {
      this.scheduleCollapse();
    }
  }

  resetForIdeOpen(): void {
    this.onSignal({ kind: "ide-opened" });
    this.host.setExpanded(false);
    this.host.push();
  }

  resetForIdeClose(): void {
    this.onSignal({ kind: "ide-closed" });
    this.host.setExpanded(false);
    this.host.push();
  }

  getLastTerminalInteractionAt(): number {
    return this.state.lastTerminalInteractionAt;
  }

  private scheduleCollapse(): void {
    this.clearCollapseTimer();
    this.collapseTimer = setTimeout(() => {
      this.collapseTimer = null;
      if (!this.host.isIdeActive()) return;
      const now = Date.now();
      if (!shouldAutoCollapseNow(this.state, now)) {
        const remaining = this.state.lastTerminalInteractionAt > 0
          ? GLASS_IDE_TERMINAL_AUTO_COLLAPSE_MS - (now - this.state.lastTerminalInteractionAt)
          : 0;
        if (remaining > 0 && this.state.expanded && !this.state.runFailed) {
          this.collapseTimer = setTimeout(() => {
            this.collapseTimer = null;
            this.tryAutoCollapse();
          }, remaining);
        }
        return;
      }
      this.tryAutoCollapse();
    }, GLASS_IDE_TERMINAL_AUTO_COLLAPSE_MS);
  }

  private tryAutoCollapse(): void {
    if (!shouldAutoCollapseNow(this.state, Date.now())) return;
    this.state = { ...this.state, expanded: false };
    this.host.setExpanded(false);
    this.host.push();
  }

  private clearCollapseTimer(): void {
    if (this.collapseTimer) {
      clearTimeout(this.collapseTimer);
      this.collapseTimer = null;
    }
  }
}
