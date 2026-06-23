// swarmConfig.ts — all tunable visual parameters for the swarm.
// MODEL_TIERS and PROVIDERS from the original config.js are not included here
// (not needed in the Glass context).

export interface SwarmBloom {
  intensity: number;
  luminanceThreshold: number;
  luminanceSmoothing: number;
}

export interface SwarmDof {
  focusDistance: number;
  focalLength: number;
  bokehScale: number;
}

export interface SwarmConfig {
  // --- particles ---
  particleCount: number;
  particleSize: number;
  featureSize: number;
  faceScale: number;

  // --- morph / motion ---
  faceResolveStrength: number;
  manifestSpeed: number;
  dissolveSpeed: number;
  swarmNoiseStrength: number;
  turbulenceAmount: number;
  trailLength: number;

  // --- voice ---
  voiceCharacter: number;
  voicePitch: number;

  // --- speech / features ---
  mouthMotionIntensity: number;
  eyeDefinition: number;

  // --- look ---
  roughness: number;
  envIntensity: number;
  rimStrength: number;
  floorGlow: number;
  colors: {
    metal: string;
  };

  // --- camera / scene ---
  cameraPos: [number, number, number];
  cameraLookAt: [number, number, number];
  background: string;

  // --- post ---
  bloom: SwarmBloom;
  dof: SwarmDof;
  vignette: number;
}

export const SWARM_CONFIG: SwarmConfig = {
  // --- particles ---
  particleCount: 120000,     // GPGPU sim (up to 120000 = face_points.bin size)
  particleSize: 0.0034,      // flat-bead size — push toward 0 for fine mist
  featureSize: 0.0060,       // FLOOR size for feature-edge beads (features read clearly)
  faceScale: 1.0,            // overall scale of the face form

  // --- morph / motion ---
  faceResolveStrength: 1.0,  // how fully particles reach the face target
  manifestSpeed: 2.0,        // ease speed idle -> face
  dissolveSpeed: 1.0,        // ease speed face -> cloud
  swarmNoiseStrength: 0.10,  // (reserved) ambient organic drift alias
  turbulenceAmount: 0.22,    // curl-noise flow amplitude (world units)
  trailLength: 0.45,         // most beads resolve onto the FACE (denser, more detail)

  // --- voice ---
  voiceCharacter: 0.55,      // 0 = pure natural .. 1 = otherworldly (shimmer + space)
  voicePitch: 0.90,          // playback rate: <1 = lower/deeper & more deliberate

  // --- speech / features ---
  mouthMotionIntensity: 1.0,
  eyeDefinition: 0.6,

  // --- look (reflective chrome, no blue) ---
  roughness: 0.13,           // low = mirror-like liquid chrome
  envIntensity: 2.8,         // strong environment reflections (the metal read)
  rimStrength: 0.70,         // silver fresnel edge so beads read on black
  floorGlow: 0.11,           // neutral floor so the whole face reads (not half-black)
  colors: {
    metal: '#10141b',        // obsidian chrome base (lifted slightly for visibility)
  },

  // --- camera / scene ---
  cameraPos: [0, 0, 5.0],
  cameraLookAt: [0, 0, 0],
  background: '#05070e',

  // --- post ---
  bloom: { intensity: 0.5, luminanceThreshold: 0.55, luminanceSmoothing: 0.4 },
  dof: { focusDistance: 0.012, focalLength: 0.05, bokehScale: 0.6 },
  vignette: 0.55,
};
