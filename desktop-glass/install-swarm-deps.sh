#!/bin/bash
# Run this once to install the Three.js / R3F packages for the swarm onboarding.
cd "$(dirname "$0")"
npm install three @react-three/fiber @react-three/drei @react-three/postprocessing
npm install --save-dev @types/three
echo "Done. Run: npm run typecheck"
