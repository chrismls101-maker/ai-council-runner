/**
 * Aletheia sidecar supervisor — health polling, restart, degraded alerts (P0.3).
 */

import {
  buildAletheiaSidecarManagerSnapshot,
  detectSidecarDegradation,
  shouldAttemptSidecarRestart,
  sidecarSnapshotsEqual,
  type AletheiaSidecarManagerSnapshot,
  type SidecarServiceId,
} from "../shared/aletheiaSidecarManager.ts";

export interface SidecarRestartHandlers {
  omniparser?: () => Promise<boolean>;
  stt?: () => Promise<boolean>;
  observation?: () => Promise<boolean>;
}

export interface SidecarProbeHost {
  probeAll: () => Promise<AletheiaSidecarManagerSnapshot>;
}

export interface SidecarManagerHost {
  getSnapshot: () => AletheiaSidecarManagerSnapshot | undefined;
  setSnapshot: (snapshot: AletheiaSidecarManagerSnapshot) => void;
  refreshSnapshot: () => Promise<AletheiaSidecarManagerSnapshot>;
  onDegradation: (events: ReturnType<typeof detectSidecarDegradation>) => void;
  restartHandlers: SidecarRestartHandlers;
  push: () => void;
}

export class AletheiaSidecarManager {
  private timer: ReturnType<typeof setInterval> | null = null;
  private restartCounts: Partial<Record<SidecarServiceId, number>> = {};
  private lastRestartAt: Partial<Record<SidecarServiceId, number>> = {};
  private companionActive = false;
  private readonly host: SidecarManagerHost;

  private static readonly ACTIVE_POLL_MS = 5_000;
  private static readonly IDLE_POLL_MS = 15_000;

  constructor(host: SidecarManagerHost) {
    this.host = host;
  }

  start(): void {
    if (this.timer) return;
    void this.refreshNow({ forcePush: true });
    this.timer = setInterval(() => {
      void this.tick();
    }, AletheiaSidecarManager.IDLE_POLL_MS);
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

  async refreshNow(options: { forcePush?: boolean } = {}): Promise<AletheiaSidecarManagerSnapshot> {
    const previous = this.host.getSnapshot();
    const current = await this.host.refreshSnapshot();
    this.attachRestartMeta(current);
    this.host.setSnapshot(current);
    const events = detectSidecarDegradation(previous, current);
    if (events.length > 0) {
      this.host.onDegradation(events);
    }
    if (options.forcePush || events.length > 0 || !sidecarSnapshotsEqual(previous, current)) {
      this.host.push();
    }
    return current;
  }

  async runBootCheck(): Promise<AletheiaSidecarManagerSnapshot> {
    const snapshot = await this.refreshNow({ forcePush: true });
    for (const row of snapshot.services) {
      if (row.status === "failed" || row.status === "starting") {
        await this.tryRestart(row.id);
      }
    }
    return this.refreshNow({ forcePush: true });
  }

  private async tick(): Promise<void> {
    const snapshot = await this.refreshNow();
    if (!this.companionActive) return;
    for (const row of snapshot.services) {
      if (shouldAttemptSidecarRestart({
        status: row.status,
        restartCount: row.restartCount,
        lastRestartAt: row.lastRestartAt,
      })) {
        await this.tryRestart(row.id);
      }
    }
  }

  private attachRestartMeta(snapshot: AletheiaSidecarManagerSnapshot): void {
    for (const row of snapshot.services) {
      row.restartCount = this.restartCounts[row.id] ?? 0;
      row.lastRestartAt = this.lastRestartAt[row.id] ?? null;
    }
  }

  private async tryRestart(id: SidecarServiceId): Promise<void> {
    const handler = this.host.restartHandlers[id];
    if (!handler) return;
    const count = (this.restartCounts[id] ?? 0) + 1;
    this.restartCounts[id] = count;
    this.lastRestartAt[id] = Date.now();
    try {
      await handler();
    } catch {
      // refresh cycle will surface failed state
    }
  }

  resetRestartStateForTests(): void {
    this.restartCounts = {};
    this.lastRestartAt = {};
  }

  private restartPollTimer(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    const interval = this.companionActive
      ? AletheiaSidecarManager.ACTIVE_POLL_MS
      : AletheiaSidecarManager.IDLE_POLL_MS;
    this.timer = setInterval(() => {
      void this.tick();
    }, interval);
  }
}

export type { AletheiaSidecarManagerSnapshot };
