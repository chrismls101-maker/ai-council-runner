// SwarmScene
// ----------
// Self-contained R3F Canvas that assembles the full GPGPU particle swarm scene.
// This is the component SortingHatScreen imports — it receives the three
// controller instances and renders the complete onboarding visual.

import { Canvas } from '@react-three/fiber';
import LightingRig from './LightingRig';
import EnvReflections from './EnvReflections';
import CameraRig from './CameraRig';
import SubstrateParticles from './SubstrateParticles';
import Effects from './Effects';
import type { ModeController } from './ModeController';
import type { VoiceController } from './VoiceController';
import type { PresenceStateMachine } from './PresenceStateMachine';
import { SWARM_CONFIG } from './swarmConfig';

import type { SwarmCameraLayout } from './CameraRig';

interface SwarmSceneProps {
  controller: ModeController;
  voice: VoiceController;
  presence: PresenceStateMachine;
  /** When true, skip post-FX so the Electron overlay stays transparent over the desktop. */
  transparentOverlay?: boolean;
  /** Camera framing — boot splash uses closer/larger substrate. */
  layout?: SwarmCameraLayout;
}

export default function SwarmScene({
  controller,
  voice,
  presence,
  transparentOverlay = false,
  layout,
}: SwarmSceneProps): JSX.Element {
  const cameraLayout = layout ?? (transparentOverlay ? "onboarding" : "default");
  const fov = cameraLayout === "boot" ? 33 : transparentOverlay ? 36 : 32;

  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: 'high-performance', alpha: true, premultipliedAlpha: false }}
      camera={{
        position: SWARM_CONFIG.cameraPos as [number, number, number],
        fov,
        near: 0.1,
        far: 50,
      }}
      onCreated={({ gl, scene }) => {
        gl.setClearColor(0x000000, 0);
        if (transparentOverlay) {
          scene.background = null;
        }
      }}
      style={{ position: 'absolute', inset: 0, background: 'transparent', pointerEvents: 'none' }}
    >
      <LightingRig transparentBackground={transparentOverlay} />
      <EnvReflections />
      <CameraRig controller={controller} layout={cameraLayout} />
      <SubstrateParticles controller={controller} voice={voice} presence={presence} />
      {!transparentOverlay && <Effects />}
    </Canvas>
  );
}
