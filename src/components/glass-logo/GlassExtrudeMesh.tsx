import { memo, useMemo, useRef } from "react";
import * as THREE from "three";
import { MeshTransmissionMaterial } from "@react-three/drei";
import type { LetterShapeData, ShardState } from "./types.ts";
import { GLASS_SHADER_TUNING } from "./glassPresets.ts";

export interface GlassMaterialProps {
  glassTint: THREE.ColorRepresentation;
  glassOpacity: number;
  roughness: number;
  transmission: number;
  thickness: number;
  ior: number;
  lightBackground?: boolean;
}

export interface GlassExtrudeProps extends GlassMaterialProps {
  shape: THREE.Shape;
  depth: number;
  bevelSize: number;
  bevelSegments: number;
  scale?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
}

function extrudeShape(
  shape: THREE.Shape,
  depth: number,
  bevelSize: number,
  bevelSegments: number,
): THREE.ExtrudeGeometry {
  return new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevelSize,
    bevelSize,
    bevelSegments,
    curveSegments: 20,
  });
}

export const GlassExtrudeMesh = memo(function GlassExtrudeMesh({
  shape,
  depth,
  bevelSize,
  bevelSegments,
  glassTint,
  glassOpacity,
  roughness,
  transmission,
  thickness,
  ior,
  lightBackground = true,
  scale = 1,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
}: GlassExtrudeProps) {
  const geometry = useMemo(
    () => extrudeShape(shape, depth, bevelSize, bevelSegments),
    [shape, depth, bevelSize, bevelSegments],
  );

  const tuning = GLASS_SHADER_TUNING;
  const [sx, sy, sz] = tuning.edgeShellScale;

  return (
    <group position={position} rotation={rotation} scale={scale}>
      {lightBackground ? (
        <>
          {/* Dark edge shell — defines letter silhouette on white */}
          <mesh geometry={geometry} scale={[sx, sy, sz]}>
            <meshPhysicalMaterial
              color={tuning.edgeShellColor}
              transparent
              opacity={tuning.edgeShellOpacity}
              roughness={0.35}
              metalness={0.05}
              clearcoat={0.6}
              clearcoatRoughness={0.2}
              side={THREE.BackSide}
              depthWrite={false}
            />
          </mesh>
          {/* Specular rim catch */}
          <mesh geometry={geometry} scale={[1.008, 1.008, 1.004]}>
            <meshPhysicalMaterial
              color="#ffffff"
              transparent
              opacity={tuning.specularShellOpacity}
              roughness={0.02}
              metalness={0}
              clearcoat={1}
              clearcoatRoughness={0.04}
              side={THREE.FrontSide}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        </>
      ) : null}

      <mesh geometry={geometry} castShadow receiveShadow>
        <MeshTransmissionMaterial
          transparent
          opacity={glassOpacity}
          color={glassTint}
          roughness={roughness}
          transmission={transmission}
          thickness={thickness}
          ior={ior}
          chromaticAberration={tuning.chromaticAberration}
          anisotropy={tuning.anisotropy}
          distortion={lightBackground ? tuning.distortion : tuning.distortion * 0.5}
          distortionScale={tuning.distortionScale}
          temporalDistortion={tuning.temporalDistortion}
          attenuationColor={tuning.attenuationColor}
          attenuationDistance={tuning.attenuationDistance}
          clearcoat={tuning.clearcoat}
          clearcoatRoughness={tuning.clearcoatRoughness}
          backside
          backsideThickness={thickness * 0.65}
          samples={tuning.samples}
          resolution={tuning.resolution}
        />
      </mesh>
    </group>
  );
});

export interface LetterGlassGroupProps {
  letter: LetterShapeData;
  shards: ShardState[];
  shatterVisible: boolean;
  depth: number;
  bevelSize: number;
  bevelSegments: number;
  materialProps: GlassMaterialProps;
}

export const LetterGlassGroup = memo(function LetterGlassGroup({
  letter,
  shards,
  shatterVisible,
  depth,
  bevelSize,
  bevelSegments,
  materialProps,
}: LetterGlassGroupProps) {
  const letterShards = useMemo(
    () => shards.filter((s) => s.letterId === letter.id),
    [shards, letter.id],
  );

  return (
    <group>
      {!shatterVisible ? (
        <GlassExtrudeMesh
          shape={letter.shape}
          depth={depth}
          bevelSize={bevelSize}
          bevelSegments={bevelSegments}
          {...materialProps}
        />
      ) : (
        letterShards.map((shard) => (
          <GlassExtrudeMesh
            key={shard.id}
            shape={letter.shape}
            depth={depth * 0.85}
            bevelSize={bevelSize * 0.85}
            bevelSegments={bevelSegments}
            {...materialProps}
            scale={shard.scale}
            position={shard.position}
            rotation={shard.rotation}
          />
        ))
      )}
    </group>
  );
});

export function usePointerNdc(containerRef: React.RefObject<HTMLElement | null>) {
  const pointer = useRef(new THREE.Vector2(0, 0));

  const setFromEvent = (clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    pointer.current.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.current.y = -(((clientY - rect.top) / rect.height) * 2 - 1);
  };

  return { pointer, setFromEvent };
}
