import {
  buildVirtualAudioInputConstraints,
  computeRmsFromSamples,
  evaluateVirtualAudioProbe,
  type VirtualAudioProbeResult,
} from "../../shared/virtualAudioCapture.ts";
import { stopMediaStreamState } from "../../shared/systemAudioCapture.ts";
import { mapSystemAudioStreamResultDetail } from "../../shared/systemAudioCapture.ts";
import type { SystemAudioStatus } from "../../shared/audioCaptureTypes.ts";

export async function sampleStreamRms(
  stream: MediaStream,
  sampleMs = 400,
): Promise<number> {
  const AudioCtx = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return 0;

  const audioContext = new AudioCtx();
  try {
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    const buffer = new Float32Array(analyser.fftSize);
    await new Promise((resolve) => setTimeout(resolve, sampleMs));
    analyser.getFloatTimeDomainData(buffer);
    return computeRmsFromSamples(buffer);
  } finally {
    try {
      await audioContext.close();
    } catch {
      /* ignore */
    }
  }
}

export async function probeNativeDisplayMediaAudio(): Promise<{
  status: SystemAudioStatus;
  detail?: string;
  trackCount: number;
}> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    return { status: "unsupported", detail: "Display media capture is not available.", trackCount: 0 };
  }
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  for (const track of stream.getVideoTracks()) {
    track.stop();
    stream.removeTrack(track);
  }
  const trackCount = stream.getAudioTracks().length;
  stopMediaStreamState(stream.getTracks());
  const mapped = mapSystemAudioStreamResultDetail(trackCount);
  return { status: mapped.status, detail: mapped.detail, trackCount };
}

export async function probeVirtualAudioInput(
  deviceId: string,
  deviceLabel?: string,
): Promise<VirtualAudioProbeResult> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return {
      status: "unsupported",
      detail: "Audio input API is not available.",
      trackCount: 0,
      hasActivity: false,
    };
  }
  const stream = await navigator.mediaDevices.getUserMedia(
    buildVirtualAudioInputConstraints(deviceId),
  );
  const trackCount = stream.getAudioTracks().length;
  if (trackCount === 0) {
    stopMediaStreamState(stream.getTracks());
    return evaluateVirtualAudioProbe({ trackCount: 0, deviceLabel });
  }
  const rms = await sampleStreamRms(stream);
  stopMediaStreamState(stream.getTracks());
  return evaluateVirtualAudioProbe({ trackCount, rms, deviceLabel });
}

export async function openVirtualAudioInputStream(
  deviceId: string,
): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia(buildVirtualAudioInputConstraints(deviceId));
}
