import * as THREE from "three";
import type { LetterShapeData, ShardState } from "./types.ts";

/** Build shard states that tile each letter bounding box. */
export function buildShardsForLetter(
  letter: LetterShapeData,
  shardCount = 7,
): ShardState[] {
  const points = letter.shape.getPoints(32);
  const box = new THREE.Box2();
  for (const p of points) box.expandByPoint(p);

  const size = new THREE.Vector2();
  box.getSize(size);
  const min = box.min;
  const shards: ShardState[] = [];

  const cols = shardCount <= 4 ? 2 : 3;
  const rows = Math.ceil(shardCount / cols);
  const cellW = size.x / cols;
  const cellH = size.y / rows;

  let index = 0;
  for (let row = 0; row < rows && index < shardCount; row++) {
    for (let col = 0; col < cols && index < shardCount; col++) {
      const cx = min.x + cellW * (col + 0.5);
      const cy = min.y + cellH * (row + 0.5);
      const jitterX = (Math.random() - 0.5) * cellW * 0.15;
      const jitterY = (Math.random() - 0.5) * cellH * 0.15;
      const rest: [number, number, number] = [cx, cy, 0];
      const rot: [number, number, number] = [
        (Math.random() - 0.5) * 0.08,
        (Math.random() - 0.5) * 0.08,
        (Math.random() - 0.5) * 0.12,
      ];
      shards.push({
        id: `${letter.id}-shard-${index}`,
        letterId: letter.id,
        restPosition: [rest[0] + jitterX, rest[1] + jitterY, rest[2]],
        position: [...rest],
        velocity: [0, 0, 0],
        rotation: [...rot],
        restRotation: [...rot],
        scale: 0.88 + Math.random() * 0.18,
      });
      index++;
    }
  }

  return shards;
}

export function impulseShards(
  shards: ShardState[],
  impact: THREE.Vector3,
  strength: number,
  spread: number,
): ShardState[] {
  return shards.map((shard) => {
    const pos = new THREE.Vector3(...shard.restPosition);
    const dir = pos.clone().sub(impact);
    if (dir.lengthSq() < 1e-6) {
      dir.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
    }
    dir.normalize();
    const falloff = 0.55 + Math.random() * 0.65;
    const impulse = strength * spread * falloff;
    return {
      ...shard,
      velocity: [
        dir.x * impulse + (Math.random() - 0.5) * 0.15,
        dir.y * impulse + (Math.random() - 0.5) * 0.15,
        dir.z * impulse * 0.35 + (Math.random() - 0.5) * 0.08,
      ],
      rotation: [
        shard.restRotation[0] + (Math.random() - 0.5) * 0.6,
        shard.restRotation[1] + (Math.random() - 0.5) * 0.6,
        shard.restRotation[2] + (Math.random() - 0.5) * 0.9,
      ],
    };
  });
}

export function stepShards(
  shards: ShardState[],
  dt: number,
  phase: "shattering" | "recovering",
  damping: number,
  speed: number,
): ShardState[] {
  const stiff = phase === "recovering" ? 14 : 2.2;
  const damp = phase === "recovering" ? damping : 0.92;

  return shards.map((shard) => {
    const px = shard.position[0];
    const py = shard.position[1];
    const pz = shard.position[2];
    let vx = shard.velocity[0];
    let vy = shard.velocity[1];
    let vz = shard.velocity[2];

    const tx = shard.restPosition[0];
    const ty = shard.restPosition[1];
    const tz = shard.restPosition[2];

    vx += (tx - px) * stiff * dt * speed;
    vy += (ty - py) * stiff * dt * speed;
    vz += (tz - pz) * stiff * dt * speed;

    vx *= damp;
    vy *= damp;
    vz *= damp;

    const rx = shard.rotation[0];
    const ry = shard.rotation[1];
    const rz = shard.rotation[2];
    let rvx = (shard.restRotation[0] - rx) * stiff * dt * speed;
    let rvy = (shard.restRotation[1] - ry) * stiff * dt * speed;
    let rvz = (shard.restRotation[2] - rz) * stiff * dt * speed;

    return {
      ...shard,
      position: [px + vx * dt, py + vy * dt, pz + vz * dt],
      velocity: [vx, vy, vz],
      rotation: [rx + rvx, ry + rvy, rz + rvz],
    };
  });
}

export function shardsSettled(shards: ShardState[], epsilon = 0.012): boolean {
  return shards.every((s) => {
    const dx = s.position[0] - s.restPosition[0];
    const dy = s.position[1] - s.restPosition[1];
    const dz = s.position[2] - s.restPosition[2];
    return dx * dx + dy * dy + dz * dz < epsilon * epsilon;
  });
}
