import { useEffect, useRef, useState } from "react";
import { send } from "../useGlassState.ts";
import {
  computeRmsFromSamples,
  evaluateVirtualAudioProbe,
  pickPreferredVirtualAudioDevice,
} from "../../shared/virtualAudioCapture.ts";
import { stopMediaStreamState } from "../../shared/systemAudioCapture.ts";
import { detectVirtualAudioDevices } from "../../shared/virtualAudioDevices.ts";
import { openVirtualAudioInputStream } from "./virtualAudioProbe.ts";
import { reportVirtualAudioDevices } from "./virtualAudioScan.ts";

const BAR_COUNT = 24;
const MONITOR_MS = 6000;
const TICK_MS = 60;

export function SystemAudioLiveMeter({
  deviceId,
  onDone,
  keepMonitoring = true,
}: {
  deviceId?: string;
  onDone?: () => void;
  keepMonitoring?: boolean;
}): JSX.Element {
  const [levels, setLevels] = useState<number[]>(() => Array(BAR_COUNT).fill(0));
  const [phase, setPhase] = useState<"listening" | "done">("listening");
  const [result, setResult] = useState<string>("Play music now — meter shows live levels from BlackHole.");
  const stoppedRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    stoppedRef.current = false;
    let stream: MediaStream | null = null;
    let audioContext: AudioContext | null = null;
    let timer = 0;
    let peakRms = 0;
    let deviceLabel = "BlackHole";

    const finish = (message: string): void => {
      setPhase("done");
      setResult(message);
      if (!keepMonitoring) onDoneRef.current?.();
    };

    const run = async (): Promise<void> => {
      let targetId = deviceId?.trim();
      if (!targetId) {
        if (navigator.mediaDevices?.enumerateDevices) {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const inputs = devices
            .filter((d) => d.kind === "audioinput")
            .map((d) => ({ deviceId: d.deviceId, label: d.label }));
          void reportVirtualAudioDevices();
          const virtual = detectVirtualAudioDevices(inputs);
          const preferred = pickPreferredVirtualAudioDevice(virtual);
          targetId = preferred?.deviceId;
          deviceLabel = preferred?.label ?? deviceLabel;
        }
      }
      if (!targetId) {
        finish("No BlackHole device found — tap Detect Devices first.");
        return;
      }

      try {
        stream = await openVirtualAudioInputStream(targetId);
        const AudioCtx =
          window.AudioContext ??
          (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) throw new Error("AudioContext unavailable");
        audioContext = new AudioCtx();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.65;
        source.connect(analyser);
        const freq = new Uint8Array(analyser.frequencyBinCount);
        const time = new Float32Array(analyser.fftSize);
        const started = Date.now();

        const tick = (): void => {
          if (stoppedRef.current) return;
          analyser.getByteFrequencyData(freq);
          analyser.getFloatTimeDomainData(time);
          const rms = computeRmsFromSamples(time);
          peakRms = Math.max(peakRms, rms);

          const slice = Math.floor(freq.length / BAR_COUNT);
          const next = Array.from({ length: BAR_COUNT }, (_, i) => {
            const start = i * slice;
            let sum = 0;
            for (let j = start; j < start + slice; j++) sum += freq[j] ?? 0;
            return Math.min(1, (sum / slice) / 110);
          });
          setLevels(next);

          const elapsed = Date.now() - started;
          if (elapsed < MONITOR_MS) {
            timer = window.setTimeout(tick, TICK_MS);
          } else {
            const probe = evaluateVirtualAudioProbe({
              trackCount: stream?.getAudioTracks().length ?? 0,
              rms: peakRms,
              deviceLabel,
            });
            send({
              type: "system-audio-set-status",
              status: probe.status,
              detail: probe.detail,
            });
            finish(
              probe.hasActivity
                ? `Signal detected (${deviceLabel}) — mean level OK.`
                : probe.detail,
            );
            if (keepMonitoring && probe.hasActivity) {
              const loop = (): void => {
                if (stoppedRef.current || !stream) return;
                analyser.getByteFrequencyData(freq);
                const sliceSize = Math.floor(freq.length / BAR_COUNT);
                setLevels(
                  Array.from({ length: BAR_COUNT }, (_, i) => {
                    const s = i * sliceSize;
                    let sum = 0;
                    for (let j = s; j < s + sliceSize; j++) sum += freq[j] ?? 0;
                    return Math.min(1, (sum / sliceSize) / 110);
                  }),
                );
                timer = window.setTimeout(loop, TICK_MS);
              };
              loop();
            }
          }
        };
        tick();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        finish(`Could not open audio input: ${message}`);
      }
    };

    void run();

    return () => {
      stoppedRef.current = true;
      if (timer) window.clearTimeout(timer);
      if (stream) stopMediaStreamState(stream.getTracks());
      if (audioContext) void audioContext.close().catch(() => undefined);
    };
  }, [deviceId, keepMonitoring]);

  return (
    <div className="system-audio-live-meter" data-testid="glass-system-audio-live-meter">
      <div className="system-audio-live-meter__bars" aria-hidden="true">
        {levels.map((level, index) => (
          <span
            key={index}
            className="system-audio-live-meter__bar"
            style={{ height: `${Math.max(8, Math.round(level * 100))}%` }}
          />
        ))}
      </div>
      <p
        className={`system-audio-live-meter__status system-audio-live-meter__status--${phase}`}
        data-testid="glass-system-audio-live-meter-status"
      >
        {phase === "listening" ? "Listening… " : ""}
        {result}
      </p>
    </div>
  );
}
