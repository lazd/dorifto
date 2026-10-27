import { MathUtils } from 'three';
import type { BotThinking, DrivingMap, VehicleState } from './race-bot';

export function createTrafficPlanner(
  map: DrivingMap,
  dimensions: { halfWidth: number; halfLength: number },
) {
  const result: { x: number; z: number; curvature: number; maneuver: BotThinking['maneuver'] } = {
    x: 0,
    z: 0,
    curvature: 0,
    maneuver: 'racing-line',
  };
  let headingAdjustment = 0;

  function reset() {
    headingAdjustment = 0;
  }

  function adjustedTarget(state: VehicleState) {
    if (headingAdjustment === 0) return result;
    if (result.maneuver !== 'attacking') result.maneuver = 'returning';
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
    racePosition: number | null = null,
  ) {
    headingAdjustment = MathUtils.lerp(headingAdjustment, 0, 1 - Math.exp(-dt / 0.4));
    if (Math.abs(headingAdjustment) < 0.0001) headingAdjustment = 0;
    const targetStart = Math.floor(targetIndex);
    const targetEnd =
      map.definition.closed === false
        ? Math.min(targetStart + 1, map.samples.length - 1)
        : (targetStart + 1) % map.samples.length;
    const fraction = targetIndex - targetStart;
    const target = map.samples[targetStart];
    const next = map.samples[targetEnd];
    result.x = MathUtils.lerp(target.x, next.x, fraction);
    result.z = MathUtils.lerp(target.z, next.z, fraction);
    result.curvature = map.samples[index].curvature;
    result.maneuver = racePosition !== null && racePosition > 1 ? 'chasing' : 'racing-line';
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
    result.maneuver = 'attacking';
    const center = map.centers[index];
    const opponentOffset = (opponent.x - center.x) * right.x + (opponent.z - center.z) * right.z;
    // Positive curvature turns toward the map's right vector.
    const inside = Math.sign(bend);
    const targetRightX = MathUtils.lerp(
      map.rights[targetStart].x,
      map.rights[targetEnd].x,
      fraction,
    );
    const targetRightZ = MathUtils.lerp(
      map.rights[targetStart].z,
      map.rights[targetEnd].z,
      fraction,
    );
    const targetCenterX = MathUtils.lerp(
      map.centers[targetStart].x,
      map.centers[targetEnd].x,
      fraction,
    );
    const targetCenterZ = MathUtils.lerp(
      map.centers[targetStart].z,
      map.centers[targetEnd].z,
      fraction,
    );
    const ideal =
      (result.x - targetCenterX) * targetRightX + (result.z - targetCenterZ) * targetRightZ;
    const desired = inside * (Math.max(inside * ideal, inside * opponentOffset) + separation);
    const roadLimit = map.definition.width / 2 + 0.8;
    const blend =
      1 - MathUtils.smoothstep(nearest, dimensions.halfLength * 2, dimensions.halfLength * 2 + 3);
    const offset = MathUtils.lerp(ideal, MathUtils.clamp(desired, -roadLimit, roadLimit), blend);
    const dx = result.x - state.x;
    const dz = result.z - state.z;
    const heading = Math.atan2(dx, dz);
    const insideHeading = Math.atan2(
      targetCenterX + targetRightX * offset - state.x,
      targetCenterZ + targetRightZ * offset - state.z,
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
