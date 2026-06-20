// LightingRig
// -----------
// The void + a couple of crisp directional lights. The beads are PBR chrome, so
// most of their look is environment reflection (see EnvReflections); these
// directional lights add sharp, moving white/steel speculars across the swarm.
// Neutral / cool-white only — no blue.

import { SWARM_CONFIG } from './swarmConfig';

interface LightingRigProps {
  /** Keep scene.background null so the Electron window stays transparent. */
  transparentBackground?: boolean;
}

export default function LightingRig({ transparentBackground = false }: LightingRigProps): JSX.Element {
  return (
    <>
      {!transparentBackground && <color attach="background" args={[SWARM_CONFIG.background]} />}
      <ambientLight intensity={0.12} color={'#aeb8c4'} />
      <directionalLight position={[-2.5, 2.0, 3.0]} intensity={2.4} color={'#eef4fb'} />
      <directionalLight position={[3.2, 0.5, 2.0]} intensity={1.8} color={'#cdd8e6'} />
      <directionalLight position={[0.0, -1.5, -3.0]} intensity={1.2} color={'#9fb0c2'} />
    </>
  );
}
