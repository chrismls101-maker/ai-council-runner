/**
 * blackholeRelease.ts — Version-pinned BlackHole 2ch download coordinates.
 *
 * When ExistentialAudio ships a new release:
 *   1. Bump BLACKHOLE_PKG_VERSION here.
 *   2. Also bump BLACKHOLE_PKG_VERSION in ai-council-runner/src/utils/glassRelease.ts
 *      (that file drives the web landing page copy if we ever reference it there).
 *
 * Check for new releases at:
 *   https://github.com/ExistentialAudio/BlackHole/releases
 */

export const BLACKHOLE_PKG_VERSION = "0.6.0";

export const BLACKHOLE_PKG_URL =
  `https://github.com/ExistentialAudio/BlackHole/releases/download/v${BLACKHOLE_PKG_VERSION}/BlackHole2ch.v${BLACKHOLE_PKG_VERSION}.pkg`;
