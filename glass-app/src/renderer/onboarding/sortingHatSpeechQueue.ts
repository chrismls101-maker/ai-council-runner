/**
 * Serializes onboarding TTS so only one line is in flight at a time.
 * Prevents overlapping speech when multiple scheduleAfterLine chains run.
 */

import {
  SORTING_HAT_PAUSE_AFTER_LINE_MS,
  SORTING_HAT_TTS_GUARD_MS,
} from "./sortingHatTiming.ts";

export type SpeakLineOptions = {
  visible?: boolean;
  onStart?: () => void;
  pauseAfterMs?: number;
};

export type SpeakLineFn = (text: string, opts?: SpeakLineOptions) => void;

export type WaitForLineFn = (pauseMs: number, maxWaitMs: number) => Promise<void>;

export interface SpeechQueue {
  speak: (text: string, opts?: SpeakLineOptions) => Promise<void>;
  script: (steps: Array<{ text: string } & SpeakLineOptions>) => Promise<void>;
  cancel: () => void;
}

export function createSpeechQueue(
  speakLine: SpeakLineFn,
  waitForLineDone: WaitForLineFn,
  chainRef: { current: number },
): SpeechQueue {
  let tail: Promise<void> = Promise.resolve();

  const isStale = (gen: number): boolean => gen !== chainRef.current;

  const runStep = async (
    gen: number,
    text: string,
    opts?: SpeakLineOptions,
  ): Promise<void> => {
    if (isStale(gen)) return;
    const pause = opts?.pauseAfterMs ?? SORTING_HAT_PAUSE_AFTER_LINE_MS;
    speakLine(text, opts);
    await waitForLineDone(pause, SORTING_HAT_TTS_GUARD_MS);
  };

  return {
    cancel(): void {
      chainRef.current += 1;
      tail = Promise.resolve();
    },

    speak(text, opts): Promise<void> {
      const gen = chainRef.current;
      const task = tail.then(() => runStep(gen, text, opts));
      tail = task.catch(() => {});
      return task;
    },

    script(steps): Promise<void> {
      const gen = chainRef.current;
      const task = tail.then(async () => {
        for (const step of steps) {
          if (isStale(gen)) return;
          await runStep(gen, step.text, step);
        }
      });
      tail = task.catch(() => {});
      return task;
    },
  };
}
