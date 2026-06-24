import { useEffect, useRef, useState } from "react";
import { send } from "../useGlassState.ts";
import { computeRmsFromSamples } from "../../shared/virtualAudioCapture.ts";
import { stopMediaStreamState } from "../../shared/systemAudioCapture.ts";
import { mapPermissionsApiToMic } from "../../shared/glassCapabilities.ts";

const BAR_COUNT = 24;
const TICK_MS = 60;

export function MicLiveMeter({ active }: { active: boolean }): JSX.Element | null {
  const [levels, setLevels] = useState<number[]>(() => Array(BAR_COUNT).fill(0));
  const [status, setStatus] = useState<string>("Speak now — meter shows microphone levels.");
  const stoppedRef = useRef(false);

  useEffect(() => {
    if (!active) return;
    stoppedRef.current = false;
    let stream: MediaStream | null = null;
    let audioContext: AudioContext | null = null;
    let timer = 0;

    const run = async (): Promise<void> => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("Microphone capture unavailable in this environment.");
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (navigator.permissions?.query) {
          try {
            const result = await navigator.permissions.query({
              name: "microphone" as PermissionName,
            });
            send({
              type: "report-mic-permission",
              status: mapPermissionsApiToMic(result.state),
            });
          } catch {
            /* Permissions API unavailable */
          }
        }

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

        const tick = (): void => {
          if (stoppedRef.current) return;
          analyser.getByteFrequencyData(freq);
          analyser.getFloatTimeDomainData(time);
          const rms = computeRmsFromSamples(time);
          const slice = Math.floor(freq.length / BAR_COUNT);
          setLevels(
            Array.from({ length: BAR_COUNT }, (_, i) => {
              const start = i * slice;
              let sum = 0;
              for (let j = start; j < start + slice; j++) sum += freq[j] ?? 0;
              const bar = Math.min(1, (sum / slice) / 110);
              return Math.max(bar, rms * 28);
            }),
          );
          if (rms > 0.01) {
            setStatus("Microphone signal detected.");
          }
          timer = window.setTimeout(tick, TICK_MS);
        };
        tick();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setStatus(`Could not open microphone: ${message}`);
        send({ type: "report-mic-permission", status: "denied" });
      }
    };

    void run();

    return () => {
      stoppedRef.current = true;
      if (timer) window.clearTimeout(timer);
      if (stream) stopMediaStreamState(stream.getTracks());
      if (audioContext) void audioContext.close().catch(() => undefined);
    };
  }, [active]);

  if (!active) return null;

  return (
    <div className="audio-live-meter" data-testid="glass-mic-live-meter">
      <div className="audio-live-meter__bars" aria-hidden="true">
        {levels.map((level, index) => (
          <span
            key={index}
            className="audio-live-meter__bar audio-live-meter__bar--mic"
            style={{ height: `${Math.max(8, Math.round(level * 100))}%` }}
          />
        ))}
      </div>
      <p className="audio-live-meter__status" data-testid="glass-mic-live-meter-status">
        {status}
      </p>
    </div>
  );
}
