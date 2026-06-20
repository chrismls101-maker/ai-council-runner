// Effects — cinematic post. Bloom makes the cyan energy emit from within;
// Depth-of-Field gives the "shot on a lens" close-up (face crisp, trails soft);
// Vignette focuses the eye and deepens the void. This is what separates a
// premium presence from a particle screensaver.

import { EffectComposer, Bloom, DepthOfField, Vignette } from '@react-three/postprocessing';
import { SWARM_CONFIG } from './swarmConfig';

export default function Effects(): JSX.Element {
  return (
    <EffectComposer multisampling={0}>
      <DepthOfField
        target={[0, -0.02, 0]}
        focalLength={SWARM_CONFIG.dof.focalLength}
        bokehScale={SWARM_CONFIG.dof.bokehScale}
      />
      <Bloom
        intensity={SWARM_CONFIG.bloom.intensity}
        luminanceThreshold={SWARM_CONFIG.bloom.luminanceThreshold}
        luminanceSmoothing={SWARM_CONFIG.bloom.luminanceSmoothing}
        mipmapBlur
      />
      <Vignette eskil={false} offset={0.2} darkness={SWARM_CONFIG.vignette} />
    </EffectComposer>
  );
}
