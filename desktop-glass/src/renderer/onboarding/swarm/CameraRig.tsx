// CameraRig
// --------
// Pulls the camera straight back as the REASONING bloom grows, so the expanding
// structure stays in frame and you feel it "still going, getting bigger". Any
// other mode eases back to the resting distance. Pure dolly on Z — the symbol
// stays pose-locked and centred.

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { SWARM_CONFIG } from './swarmConfig';
import type { ModeController } from './ModeController';

const BASE_Z = SWARM_CONFIG.cameraPos[2]; // resting distance
/** Boot splash — large substrate centered in the upper band above copy. */
const BOOT_BASE_Z = 4.88;
const BOOT_CAM_Y = -0.50;
const BOOT_LOOK_Y = 0.11;
/** Post-boot onboarding — pull back so manifestations stay in frame. */
const ONBOARDING_BASE_Z = 6.05;
const MAX_PULL = 7.5;
const ONBOARDING_CAM_Y = -0.48;
const ONBOARDING_LOOK_Y = 0.08;

export type SwarmCameraLayout = "default" | "boot" | "onboarding";

function cameraTargets(layout: SwarmCameraLayout): { baseZ: number; camY: number; lookY: number } {
  switch (layout) {
    case "boot":
      return { baseZ: BOOT_BASE_Z, camY: BOOT_CAM_Y, lookY: BOOT_LOOK_Y };
    case "onboarding":
      return { baseZ: ONBOARDING_BASE_Z, camY: ONBOARDING_CAM_Y, lookY: ONBOARDING_LOOK_Y };
    default:
      return { baseZ: BASE_Z, camY: 0, lookY: 0 };
  }
}

interface CameraRigProps {
  controller: ModeController;
  layout?: SwarmCameraLayout;
}

export default function CameraRig({ controller, layout = "default" }: CameraRigProps): null {
  const targets = cameraTargets(layout);
  const baseZ = targets.baseZ;
  const z = useRef(baseZ);
  const camY = useRef(targets.camY);
  const lookY = useRef(targets.lookY);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useFrame(({ camera }: any, delta: number) => {
    const dt = Math.min(0.05, delta);
    const targetZ = baseZ + Math.min(controller.grow || 0, 1.6) * MAX_PULL;
    z.current += (targetZ - z.current) * (1 - Math.pow(0.12, dt)); // smooth dolly
    const targetCamY = targets.camY;
    const targetLookY = targets.lookY;
    camY.current += (targetCamY - camY.current) * (1 - Math.pow(0.12, dt));
    lookY.current += (targetLookY - lookY.current) * (1 - Math.pow(0.12, dt));
    camera.position.set(0, camY.current, z.current);
    camera.lookAt(0, lookY.current, 0);
  });
  return null;
}
