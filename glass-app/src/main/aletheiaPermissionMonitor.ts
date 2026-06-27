/**
 * Live permission monitor — detects revocations and surfaces degraded narration (P0.4).
 */

import type { AletheiaPermissionControlPlaneSnapshot } from "../shared/aletheiaPermissionControlPlane.ts";
import {
  detectPermissionRevocations,
  permissionSnapshotsEqual,
} from "../shared/aletheiaPermissionControlPlane.ts";

export interface PermissionMonitorHost {
  getSnapshot: () => AletheiaPermissionControlPlaneSnapshot | undefined;
  setSnapshot: (snapshot: AletheiaPermissionControlPlaneSnapshot) => void;
  onRevocation: (events: ReturnType<typeof detectPermissionRevocations>) => void;
  refreshSnapshot: () => AletheiaPermissionControlPlaneSnapshot;
  push: () => void;
}

export class AletheiaPermissionMonitor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private companionActive = false;
  private readonly host: PermissionMonitorHost;

  private static readonly ACTIVE_POLL_MS = 5_000;
  private static readonly IDLE_POLL_MS = 15_000;

  constructor(host: PermissionMonitorHost) {
    this.host = host;
  }

  start(): void {
    if (this.timer) return;
    this.refreshNow({ forcePush: true });
    this.timer = setInterval(() => this.tick(), AletheiaPermissionMonitor.IDLE_POLL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  setCompanionActive(active: boolean): void {
    if (this.companionActive === active) return;
    this.companionActive = active;
    this.restartPollTimer();
  }

  refreshNow(options: { forcePush?: boolean } = {}): AletheiaPermissionControlPlaneSnapshot {
    const previous = this.host.getSnapshot();
    const current = this.host.refreshSnapshot();
    this.host.setSnapshot(current);
    const events = detectPermissionRevocations(previous, current);
    if (events.length > 0) {
      this.host.onRevocation(events);
    }
    if (options.forcePush || events.length > 0 || !permissionSnapshotsEqual(previous, current)) {
      this.host.push();
    }
    return current;
  }

  private tick(): void {
    this.refreshNow();
  }

  private restartPollTimer(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    const interval = this.companionActive
      ? AletheiaPermissionMonitor.ACTIVE_POLL_MS
      : AletheiaPermissionMonitor.IDLE_POLL_MS;
    this.timer = setInterval(() => this.tick(), interval);
  }
}
