import { MathUtils } from 'three';
import type { DrivingMap, VehicleState } from './race-bot';

export function createTrafficPlanner(
  map: DrivingMap,
  dimensions: { halfWidth: number; halfLength: number },
) {
  const result = { x: 0, z: 0, curvature: 0, attacking: false };

  function reset() {}

  function update(
    state: VehicleState,
    index: number,
    targetIndex: number,
    traffic: readonly VehicleState[],
  ) {
    const target = map.samples[targetIndex];
    result.x = target.x;
    result.z = target.z;
    result.curvature = map.samples[index].curvature;
    const right = map.rights[index];
    const separation = dimensions.halfWidth * 2 + 0.5;
    let nearest = dimensions.halfLength * 2 + 3;
    let opponent: VehicleState | undefined;
    for (const other of traffic) {
      if (other === state) continue;
      const dx = other.x - state.x;
      const dz = other.z - state.z;
      const ahead = dx * -right.z + dz * right.x;
      if (ahead > 0 && ahead < nearest && Math.abs(dx * right.x + dz * right.z) < separation) {
        opponent = other;
        nearest = ahead;
      }
    }
    if (!opponent) return result;

    let bend = 0;
    for (let step = 0; step <= Math.ceil(20 / map.spacing); step++)
      bend += map.samples[(index + step) % map.samples.length].curvature;
    const center = map.centers[index];
    const opponentOffset = (opponent.x - center.x) * right.x + (opponent.z - center.z) * right.z;
    // Positive curvature turns toward the map's right vector; straights pass toward center.
    const inside = Math.abs(bend) > 0.01 ? Math.sign(bend) : opponentOffset > 0 ? -1 : 1;
    const targetRight = map.rights[targetIndex];
    const targetCenter = map.centers[targetIndex];
    const ideal =
      (target.x - targetCenter.x) * targetRight.x + (target.z - targetCenter.z) * targetRight.z;
    const desired = inside * (Math.max(inside * ideal, inside * opponentOffset) + separation);
    const roadLimit = Math.max(0, map.definition.width / 2 - dimensions.halfWidth - 0.25);
    const blend =
      1 - MathUtils.smoothstep(nearest, dimensions.halfLength * 2, dimensions.halfLength * 2 + 3);
    const offset = MathUtils.lerp(ideal, MathUtils.clamp(desired, -roadLimit, roadLimit), blend);
    result.x = targetCenter.x + targetRight.x * offset;
    result.z = targetCenter.z + targetRight.z * offset;
    return result;
  }

  return { update, reset };
}
