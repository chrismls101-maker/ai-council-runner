import type { ColorRepresentation } from "three";

export interface IivoGlassLogoProps {
  /** Overall scale of the logo group. Default 1 */
  logoSize?: number;
  /** Extrusion depth. Default 0.42 */
  depth?: number;
  /** Bevel size on extruded edges. Default 0.06 */
  bevelSize?: number;
  /** Bevel segment count. Default 3 */
  bevelSegments?: number;
  /** Glass opacity / material opacity. Default 1 */
  glassOpacity?: number;
  /** Cool tint for transmission material. Default #c8e8ff */
  glassTint?: ColorRepresentation;
  /** Surface roughness. Default 0.08 */
  roughness?: number;
  /** Light transmission. Default 1 */
  transmission?: number;
  /** Glass thickness for refraction. Default 1.2 */
  thickness?: number;
  /** Index of refraction. Default 1.45 */
  ior?: number;
  /** Enable click/hover shatter. Default true */
  shatterEnabled?: boolean;
  /** Outward impulse on shatter. Default 1 */
  shatterStrength?: number;
  /** Max shard travel distance. Default 1.35 */
  shatterSpread?: number;
  /** Shatter animation speed. Default 1 */
  shatterSpeed?: number;
  /** Spring damping (0–1, higher = less bounce). Default 0.78 */
  shatterDamping?: number;
  /** Time to hold shattered state before reform (ms). Default 900 */
  shatterRecoveryMs?: number;
  /** Subtle idle float. Default true */
  idleFloatEnabled?: boolean;
  /** Canvas / scene background. Default #ffffff */
  backgroundColor?: string;
  /** Pointer parallax strength. Default 1 */
  parallaxStrength?: number;
  /** Trigger shatter on hover instead of click. Default false */
  shatterOnHover?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /** Called when WebGL fallback is used */
  onFallback?: () => void;
}

export const DEFAULT_GLASS_LOGO_PROPS = {
  logoSize: 1.05,
  depth: 0.58,
  bevelSize: 0.095,
  bevelSegments: 4,
  glassOpacity: 1,
  glassTint: "#e8f4ff",
  roughness: 0.04,
  transmission: 0.88,
  thickness: 3.2,
  ior: 1.52,
  shatterEnabled: true,
  shatterStrength: 1,
  shatterSpread: 1.35,
  shatterSpeed: 1,
  shatterDamping: 0.78,
  shatterRecoveryMs: 900,
  idleFloatEnabled: true,
  backgroundColor: "#ffffff",
  parallaxStrength: 1,
  shatterOnHover: false,
} as const satisfies Partial<IivoGlassLogoProps>;

export interface LetterShapeData {
  id: string;
  shape: import("three").Shape;
  center: [number, number];
}

export interface ShardState {
  id: string;
  letterId: string;
  restPosition: [number, number, number];
  position: [number, number, number];
  velocity: [number, number, number];
  rotation: [number, number, number];
  restRotation: [number, number, number];
  scale: number;
}

export type ShatterPhase = "idle" | "shattering" | "recovering";
