import type { IivoGlassLogoProps } from "./types.ts";

/** Tuned for legible frosted glass on white / light hero backgrounds. */
export const WHITE_BACKGROUND_GLASS_PRESET: Required<
  Pick<
    IivoGlassLogoProps,
    | "depth"
    | "bevelSize"
    | "bevelSegments"
    | "glassOpacity"
    | "glassTint"
    | "roughness"
    | "transmission"
    | "thickness"
    | "ior"
  >
> = {
  depth: 0.58,
  bevelSize: 0.095,
  bevelSegments: 4,
  glassOpacity: 1,
  glassTint: "#e8f4ff",
  roughness: 0.04,
  transmission: 0.88,
  thickness: 3.2,
  ior: 1.52,
};

export const GLASS_SHADER_TUNING = {
  chromaticAberration: 0.12,
  anisotropy: 0.25,
  distortion: 0.14,
  distortionScale: 0.35,
  temporalDistortion: 0.02,
  attenuationColor: "#5a8ec4",
  attenuationDistance: 0.85,
  clearcoat: 1,
  clearcoatRoughness: 0.06,
  samples: 8,
  resolution: 768,
  edgeShellScale: [1.022, 1.022, 1.015] as [number, number, number],
  edgeShellOpacity: 0.22,
  edgeShellColor: "#1e3550",
  specularShellOpacity: 0.35,
} as const;

export function isLightBackground(color?: string): boolean {
  if (!color) return true;
  const hex = color.trim().replace("#", "");
  if (hex.length !== 6) return true;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.72;
}

export function resolveGlassProps(
  props: IivoGlassLogoProps,
): IivoGlassLogoProps & { lightBackground: boolean } {
  const lightBackground = isLightBackground(props.backgroundColor);
  if (!lightBackground) {
    return { ...props, lightBackground: false };
  }
  return {
    ...WHITE_BACKGROUND_GLASS_PRESET,
    ...props,
    lightBackground: true,
  };
}
