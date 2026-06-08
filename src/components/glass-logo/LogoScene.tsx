import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer, OrbitControls, PerspectiveCamera } from "@react-three/drei";
import type { IivoGlassLogoProps, ShatterPhase, ShardState } from "./types.ts";
import { DEFAULT_GLASS_LOGO_PROPS } from "./types.ts";
import { resolveGlassProps, isLightBackground } from "./glassPresets.ts";
import { getIivoLogoLetters, invalidateLogoLetterCache } from "./parseLogoShapes.ts";

if (import.meta.hot) {
  import.meta.hot.accept(() => invalidateLogoLetterCache());
}
import {
  buildShardsForLetter,
  impulseShards,
  shardsSettled,
  stepShards,
} from "./shatterShards.ts";
import { LetterGlassGroup } from "./GlassExtrudeMesh.tsx";

interface SceneProps extends Required<
  Pick<
    IivoGlassLogoProps,
    | "logoSize"
    | "depth"
    | "bevelSize"
    | "bevelSegments"
    | "glassOpacity"
    | "glassTint"
    | "roughness"
    | "transmission"
    | "thickness"
    | "ior"
    | "shatterEnabled"
    | "shatterStrength"
    | "shatterSpread"
    | "shatterSpeed"
    | "shatterDamping"
    | "shatterRecoveryMs"
    | "idleFloatEnabled"
    | "parallaxStrength"
    | "shatterOnHover"
  >
> {
  pointerRef: React.MutableRefObject<THREE.Vector2>;
  reducedMotion: boolean;
  lightBackground: boolean;
  onImpact?: (point: THREE.Vector3) => void;
}

function LogoRig({
  logoSize,
  depth,
  bevelSize,
  bevelSegments,
  glassOpacity,
  glassTint,
  roughness,
  transmission,
  thickness,
  ior,
  shatterEnabled,
  shatterStrength,
  shatterSpread,
  shatterSpeed,
  shatterDamping,
  shatterRecoveryMs,
  idleFloatEnabled,
  parallaxStrength,
  shatterOnHover,
  pointerRef,
  reducedMotion,
  lightBackground,
  onImpact,
}: SceneProps) {
  const groupRef = useRef<THREE.Group>(null);
  const letters = useMemo(() => getIivoLogoLetters(), []);
  const [phase, setPhase] = useState<ShatterPhase>("idle");
  const [shatterVisible, setShatterVisible] = useState(false);
  const [shards, setShards] = useState<ShardState[]>(() =>
    letters.flatMap((l) => buildShardsForLetter(l)),
  );
  const recoveryTimer = useRef<number | null>(null);
  const { camera } = useThree();

  const materialProps = useMemo(
    () => ({
      glassTint,
      glassOpacity,
      roughness,
      transmission,
      thickness,
      ior,
      lightBackground,
    }),
    [glassTint, glassOpacity, roughness, transmission, thickness, ior, lightBackground],
  );

  const triggerShatter = useCallback(
    (worldPoint: THREE.Vector3) => {
      if (!shatterEnabled || reducedMotion || phase !== "idle") return;
      onImpact?.(worldPoint.clone());
      const local = groupRef.current?.worldToLocal(worldPoint.clone()) ?? worldPoint;
      setShards((prev) => impulseShards(prev, local, shatterStrength, shatterSpread * 0.08));
      setShatterVisible(true);
      setPhase("shattering");
      if (recoveryTimer.current) window.clearTimeout(recoveryTimer.current);
      recoveryTimer.current = window.setTimeout(() => {
        setPhase("recovering");
      }, shatterRecoveryMs);
    },
    [
      shatterEnabled,
      reducedMotion,
      phase,
      onImpact,
      shatterStrength,
      shatterSpread,
      shatterRecoveryMs,
    ],
  );

  useEffect(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return;

    const onPointerDown = (e: PointerEvent) => {
      if (shatterOnHover) return;
      const rect = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -(((e.clientY - rect.top) / rect.height) * 2 - 1),
      );
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, camera);
      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
      const hit = new THREE.Vector3();
      ray.ray.intersectPlane(plane, hit);
      if (hit) triggerShatter(hit);
    };

    const onPointerEnter = (e: PointerEvent) => {
      if (!shatterOnHover) return;
      onPointerDown(e);
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    if (shatterOnHover) canvas.addEventListener("pointerenter", onPointerEnter);
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      if (shatterOnHover) canvas.removeEventListener("pointerenter", onPointerEnter);
      if (recoveryTimer.current) window.clearTimeout(recoveryTimer.current);
    };
  }, [camera, triggerShatter, shatterOnHover]);

  useFrame((state, dt) => {
    const g = groupRef.current;
    if (!g) return;

    const t = state.clock.elapsedTime;
    const px = pointerRef.current.x;
    const py = pointerRef.current.y;

    if (!reducedMotion) {
      const targetRotY = px * 0.38 * parallaxStrength;
      const targetRotX = -py * 0.22 * parallaxStrength;
      g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, targetRotY, 0.08);
      g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, targetRotX, 0.08);
      if (idleFloatEnabled && phase === "idle") {
        g.position.y = Math.sin(t * 0.9) * 0.035;
      } else {
        g.position.y = THREE.MathUtils.lerp(g.position.y, 0, 0.1);
      }
    }

    if (phase === "shattering" || phase === "recovering") {
      setShards((prev) => {
        const next = stepShards(
          prev,
          Math.min(dt, 0.032),
          phase,
          shatterDamping,
          shatterSpeed,
        );
        if (phase === "recovering" && shardsSettled(next)) {
          setPhase("idle");
          setShatterVisible(false);
        }
        return next;
      });
    }
  });

  return (
    <group ref={groupRef} scale={logoSize} position={[0, lightBackground ? 0.08 : 0, 0]}>
      {letters.map((letter) => (
        <LetterGlassGroup
          key={letter.id}
          letter={letter}
          shards={shards}
          shatterVisible={shatterVisible}
          depth={depth}
          bevelSize={bevelSize}
          bevelSegments={bevelSegments}
          materialProps={materialProps}
        />
      ))}
    </group>
  );
}

function SceneLighting({ lightBackground }: { lightBackground: boolean }) {
  if (lightBackground) {
    return (
      <>
        <ambientLight intensity={0.55} color="#f0f6ff" />
        <directionalLight
          position={[3, 8, 6]}
          intensity={1.6}
          color="#ffffff"
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-bias={-0.0002}
        />
        <directionalLight position={[-5, 3, 4]} intensity={0.45} color="#8eb8ff" />
        <directionalLight position={[0, -2, 5]} intensity={0.25} color="#c8dcff" />
        <spotLight
          position={[4, 6, 8]}
          angle={0.42}
          penumbra={0.85}
          intensity={1.4}
          color="#ffffff"
        />
        <spotLight
          position={[-4, 2, 6]}
          angle={0.5}
          penumbra={1}
          intensity={0.35}
          color="#5a80c0"
        />
        <Environment resolution={512} frames={1} background={false}>
          <Lightformer
            form="rect"
            intensity={3.5}
            color="#ffffff"
            rotation={[0, 0, 0]}
            position={[0, 0, 8]}
            scale={[14, 10, 1]}
          />
          <Lightformer
            form="rect"
            intensity={1.8}
            color="#1a2840"
            rotation={[0, 0.4, 0]}
            position={[-4, 2, 3]}
            scale={[2.5, 5, 1]}
          />
          <Lightformer
            form="rect"
            intensity={1.8}
            color="#1a2840"
            rotation={[0, -0.4, 0]}
            position={[4, 1, 3]}
            scale={[2.5, 5, 1]}
          />
          <Lightformer
            form="ring"
            intensity={2.2}
            color="#b8dcff"
            rotation={[Math.PI / 2, 0, 0]}
            position={[0, 5, 4]}
            scale={[6, 6, 1]}
          />
        </Environment>
        <ContactShadows
          position={[0, -0.72, 0]}
          opacity={0.28}
          scale={12}
          blur={2.8}
          far={3.5}
          color="#1a3050"
          resolution={512}
        />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.74, 0]} receiveShadow>
          <planeGeometry args={[20, 20]} />
          <shadowMaterial transparent opacity={0.12} />
        </mesh>
      </>
    );
  }

  return (
    <>
      <ambientLight intensity={0.15} color="#8eb8ff" />
      <directionalLight
        position={[4, 6, 8]}
        intensity={1.35}
        color="#eef6ff"
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight position={[-6, 2, -4]} intensity={0.55} color="#5a90ff" />
      <pointLight position={[0, -2, 6]} intensity={0.45} color="#a8d4ff" />
      <spotLight
        position={[2, 8, 5]}
        angle={0.35}
        penumbra={0.8}
        intensity={1.1}
        color="#ffffff"
      />
      <Environment resolution={256} frames={1} background={false}>
        <Lightformer
          form="ring"
          intensity={2.5}
          color="#cfe8ff"
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, 4, 6]}
          scale={[8, 8, 1]}
        />
        <Lightformer
          form="rect"
          intensity={1.2}
          color="#4060a0"
          rotation={[0, Math.PI, 0]}
          position={[-5, 1, -2]}
          scale={[6, 3, 1]}
        />
      </Environment>
    </>
  );
}

export interface LogoCanvasProps extends IivoGlassLogoProps {
  pointerRef: React.MutableRefObject<THREE.Vector2>;
  reducedMotion: boolean;
  webglSupported: boolean;
}

export function LogoCanvas({
  pointerRef,
  reducedMotion,
  webglSupported,
  ...props
}: LogoCanvasProps) {
  const merged = resolveGlassProps({ ...DEFAULT_GLASS_LOGO_PROPS, ...props });
  const lightBackground = merged.lightBackground ?? isLightBackground(merged.backgroundColor);

  if (!webglSupported) return null;

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      }}
      style={{ width: "100%", height: "100%" }}
    >
      <PerspectiveCamera makeDefault position={[0, 0, 6.2]} fov={38} />
      <SceneLighting lightBackground={lightBackground} />
      <Suspense fallback={null}>
        <LogoRig
          logoSize={merged.logoSize!}
          depth={merged.depth!}
          bevelSize={merged.bevelSize!}
          bevelSegments={merged.bevelSegments ?? 4}
          glassOpacity={merged.glassOpacity!}
          glassTint={merged.glassTint!}
          roughness={merged.roughness!}
          transmission={merged.transmission!}
          thickness={merged.thickness!}
          ior={merged.ior!}
          shatterEnabled={merged.shatterEnabled!}
          shatterStrength={merged.shatterStrength!}
          shatterSpread={merged.shatterSpread!}
          shatterSpeed={merged.shatterSpeed!}
          shatterDamping={merged.shatterDamping!}
          shatterRecoveryMs={merged.shatterRecoveryMs!}
          idleFloatEnabled={merged.idleFloatEnabled!}
          parallaxStrength={merged.parallaxStrength!}
          shatterOnHover={merged.shatterOnHover!}
          pointerRef={pointerRef}
          reducedMotion={reducedMotion}
          lightBackground={lightBackground}
        />
      </Suspense>
      <OrbitControls enablePan={false} enableZoom={false} enableRotate={false} />
    </Canvas>
  );
}
