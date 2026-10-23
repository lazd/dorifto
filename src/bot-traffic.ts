import { MathUtils } from 'three';
import type { DrivingMap, VehicleState } from './race-bot';

export function createTrafficPlanner(
  map: DrivingMap,
  dimensions: { halfWidth: number; halfLength: number },
) {
  const result = { x: 0, z: 0, curvature: 0, attacking: false };
  let headingAdjustment = 0;

  function reset() {
    headingAdjustment = 0;
  }

  function adjustedTarget(state: VehicleState) {
    if (headingAdjustment === 0) return result;
    const dx = result.x - state.x;
    const dz = result.z - state.z;
    const heading = Math.atan2(dx, dz) + headingAdjustment;
    const distance = Math.hypot(dx, dz);
    result.x = state.x + Math.sin(heading) * distance;
    result.z = state.z + Math.cos(heading) * distance;
    return result;
  }

  function update(
    state: VehicleState,
    index: number,
    targetIndex: number,
    traffic: readonly VehicleState[],
    dt = 1 / 120,
  ) {
    headingAdjustment = MathUtils.lerp(headingAdjustment, 0, 1 - Math.exp(-dt / 0.4));
    if (Math.abs(headingAdjustment) < 0.0001) headingAdjustment = 0;
    const target = map.samples[targetIndex];
    result.x = target.x;
    result.z = target.z;
    result.curvature = map.samples[index].curvature;
    result.attacking = false;
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
    if (!opponent) return adjustedTarget(state);
    let bend = 0;
    const bendSteps = Math.ceil(20 / map.spacing);
    for (let step = 0; step <= bendSteps; step++)
      bend += map.samples[(index + step) % map.samples.length].curvature;
    if (Math.abs(bend) / (bendSteps + 1) < 0.003) return adjustedTarget(state);
    result.attacking = true;
    const center = map.centers[index];
    const opponentOffset = (opponent.x - center.x) * right.x + (opponent.z - center.z) * right.z;
    // Positive curvature turns toward the map's right vector.
    const inside = Math.sign(bend);
    const targetRight = map.rights[targetIndex];
    const targetCenter = map.centers[targetIndex];
    const ideal =
      (target.x - targetCenter.x) * targetRight.x + (target.z - targetCenter.z) * targetRight.z;
    const desired = inside * (Math.max(inside * ideal, inside * opponentOffset) + separation);
    const roadLimit = map.definition.width / 2 + 0.8;
    const blend =
      1 - MathUtils.smoothstep(nearest, dimensions.halfLength * 2, dimensions.halfLength * 2 + 3);
    const offset = MathUtils.lerp(ideal, MathUtils.clamp(desired, -roadLimit, roadLimit), blend);
    const dx = target.x - state.x;
    const dz = target.z - state.z;
    const heading = Math.atan2(dx, dz);
    const insideHeading = Math.atan2(
      targetCenter.x + targetRight.x * offset - state.x,
      targetCenter.z + targetRight.z * offset - state.z,
    );
    const difference = Math.atan2(
      Math.sin(insideHeading - heading),
      Math.cos(insideHeading - heading),
    );
    headingAdjustment = MathUtils.clamp(difference, -0.22, 0.22);
    return adjustedTarget(state);
  }

  return { update, reset };
}
