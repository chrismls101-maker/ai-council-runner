/**
 * Main-process Aletheia advisory for Glass IDE — flow detection, chrome gating, subtle UI.
 */

import type { GlassIdeEditorContext } from "../shared/glassIdeEditorContext.ts";
import type { GlassUserSettings } from "../shared/glassSettings.ts";
import type { IdeChromeSignal } from "../shared/glassIdeChromeOrchestrator.ts";
import {
  computeAletheiaAdvisory,
  deriveAletheiaRunPhase,
  emptyGlassIdeAletheiaSnapshot,
  gateChromeExpandSignal,
  type GlassIdeAletheiaSnapshot,
  type IdeAletheiaRunPhase,
} from "../shared/glassIdeAletheiaAdvisory.ts";

export interface IdeAletheiaAdvisoryHost {
  isIdeActive: () => boolean;
  getEditorContext: () => GlassIdeEditorContext;
  getSettings: () => GlassUserSettings;
  persistSettings: (settings: GlassUserSettings) => Promise<void>;
  getTerminalInteractionAt: () => number;
  getLoopIteration: () => number | undefined;
  getAdvisorySnapshot: () => GlassIdeAletheiaSnapshot;
  setAdvisorySnapshot: (snapshot: GlassIdeAletheiaSnapshot) => void;
  push: () => void;
  getRunSignals: () => {
    agentRunning: boolean;
    agentFailed: boolean;
    agentDone: boolean;
    qaHasFail: boolean;
    qaRunning: boolean;
    verifyFailed: boolean;
    errorHint: string | null;
  };
}

export class IdeAletheiaAdvisory {
  private runPhase: IdeAletheiaRunPhase = "idle";
  private feedLineCounter = 0;
  private lastSpokenErrorSignature: string | null = null;
  private localFirstErrorHintEmitted = false;
  private deferredExpandTimers = new Set<ReturnType<typeof setTimeout>>();

  constructor(private readonly host: IdeAletheiaAdvisoryHost) {}

  resetForIdeOpen(): void {
    this.runPhase = "idle";
    this.feedLineCounter = 0;
    this.lastSpokenErrorSignature = null;
    this.localFirstErrorHintEmitted = false;
    this.clearDeferredTimers();
    this.host.setAdvisorySnapshot(emptyGlassIdeAletheiaSnapshot());
  }

  resetForIdeClose(): void {
    this.resetForIdeOpen();
  }

  onEditorActivity(): void {
    if (!this.host.isIdeActive()) return;
    this.refresh(false);
  }

  onRunPhaseChange(): void {
    if (!this.host.isIdeActive()) return;
    this.refresh(true);
  }

  beforeChromeSignal(signal: IdeChromeSignal): { proceed: boolean; deferMs: number } {
    if (!this.host.isIdeActive()) {
      return { proceed: true, deferMs: 0 };
    }
    const ctx = this.host.getEditorContext();
    const gate = gateChromeExpandSignal({
      signal,
      now: Date.now(),
      editorUpdatedAt: ctx.updatedAt,
      terminalInteractionAt: this.host.getTerminalInteractionAt(),
    });
    return { proceed: gate.allow, deferMs: gate.deferMs };
  }

  scheduleDeferredChromeSignal(
    signal: IdeChromeSignal,
    deferMs: number,
    dispatch: (signal: IdeChromeSignal) => void,
  ): void {
    if (deferMs <= 0) {
      dispatch(signal);
      return;
    }
    const timer = setTimeout(() => {
      this.deferredExpandTimers.delete(timer);
      if (!this.host.isIdeActive()) return;
      const recheck = this.beforeChromeSignal(signal);
      if (!recheck.proceed) return;
      dispatch(signal);
    }, deferMs);
    this.deferredExpandTimers.add(timer);
  }

  private refresh(phaseMayHaveChanged: boolean): void {
    const signals = this.host.getRunSignals();
    const prevPhase = this.runPhase;
    const phase = deriveAletheiaRunPhase(signals);
    const settings = this.host.getSettings();
    const prev = this.host.getAdvisorySnapshot();

    const result = computeAletheiaAdvisory({
      now: Date.now(),
      editorUpdatedAt: this.host.getEditorContext().updatedAt,
      phase,
      prevPhase: phaseMayHaveChanged ? prevPhase : phase,
      agentRunning: signals.agentRunning,
      hasFailure: signals.agentFailed || signals.qaHasFail || signals.verifyFailed,
      loopIteration: this.host.getLoopIteration() ?? 1,
      errorHint: signals.errorHint,
      firstErrorHintShown:
        settings.glassIdeAletheiaFirstErrorHintShown === true
        || this.localFirstErrorHintEmitted,
      lastSpokenErrorSignature: this.lastSpokenErrorSignature,
      feedLineCounter: this.feedLineCounter,
      spokenNonce: prev.spokenNonce,
    });

    const snapshot: GlassIdeAletheiaSnapshot = {
      chip: result.snapshot.chip,
      feedLine: result.snapshot.feedLine ?? prev.feedLine,
      spokenText: result.snapshot.spokenText ?? prev.spokenText,
      spokenNonce: Math.max(result.snapshot.spokenNonce, prev.spokenNonce),
    };

    this.runPhase = result.nextPhase;
    this.feedLineCounter = result.feedLineCounter;
    this.lastSpokenErrorSignature = result.lastSpokenErrorSignature;

    const changed =
      prev.chip !== snapshot.chip
      || prev.feedLine?.id !== snapshot.feedLine?.id
      || prev.spokenNonce !== snapshot.spokenNonce
      || prev.spokenText !== snapshot.spokenText;

    this.host.setAdvisorySnapshot(snapshot);

    if (result.markFirstErrorHintShown) {
      this.localFirstErrorHintEmitted = true;
      if (!settings.glassIdeAletheiaFirstErrorHintShown) {
        const nextSettings = {
          ...settings,
          glassIdeAletheiaFirstErrorHintShown: true,
        };
        void this.host.persistSettings(nextSettings);
      }
    }

    if (changed) {
      this.host.push();
    }
  }

  private clearDeferredTimers(): void {
    for (const timer of this.deferredExpandTimers) {
      clearTimeout(timer);
    }
    this.deferredExpandTimers.clear();
  }
}
