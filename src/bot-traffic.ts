import { MathUtils } from 'three';
import type { DrivingMap, RaceBotOptions, VehicleState } from './race-bot';

const { clamp, lerp, smoothstep, euclideanModulo: wrap } = MathUtils;
const angle = (value: number) => Math.atan2(Math.sin(value), Math.cos(value));

export function createTrafficPlanner(
  map: DrivingMap,
  dimensions: { halfWidth: number; halfLength: number; wheelbase: number },
  options: RaceBotOptions,
  { lateralAcceleration, braking }: { lateralAcceleration: number; braking: number },
) {
  const { centers, rights, samples, spacing } = map;
  const margin = lerp(0.8, 0.4, options.aggression);
  const roadLimit = map.definition.width / 2 - dimensions.halfWidth - 0.5;
  let lane: number | null = null;
  let active = false;
  let stuck = 0;
  let cooldown = 0;
  let recovery: { x: number; z: number; heading: number; time: number } | null = null;
  let passingVehicle: number | null = null;
  const result = {
    x: 0,
    z: 0,
    speedLimit: Infinity,
    curvature: 0,
    reverse: false,
    avoiding: false,
  };

  function overlaps(x: number, z: number, heading: number, other: VehicleState, time = 0) {
    const dx = other.x + other.vx * time - x;
    const dz = other.z + other.vz * time - z;
    const sin = Math.sin(heading);
    const cos = Math.cos(heading);
    const otherSin = Math.sin(other.heading);
    const otherCos = Math.cos(other.heading);
    const relativeCos = Math.abs(Math.cos(heading - other.heading));
    const relativeSin = Math.abs(Math.sin(heading - other.heading));
    const width = dimensions.halfWidth + margin;
    const length = dimensions.halfLength + margin;
    return (
      Math.abs(dx * cos - dz * sin) <
        dimensions.halfWidth + width * relativeCos + length * relativeSin &&
      Math.abs(dx * sin + dz * cos) <
        dimensions.halfLength + length * relativeCos + width * relativeSin &&
      Math.abs(dx * otherCos - dz * otherSin) <
        width + dimensions.halfWidth * relativeCos + dimensions.halfLength * relativeSin &&
      Math.abs(dx * otherSin + dz * otherCos) <
        length + dimensions.halfLength * relativeCos + dimensions.halfWidth * relativeSin
    );
  }

  function reset() {
    lane = null;
    active = false;
    stuck = cooldown = 0;
    recovery = null;
    passingVehicle = null;
  }

  function update(
    state: VehicleState,
    index: number,
    lateral: number,
    targetIndex: number,
    dt: number,
    traffic: readonly VehicleState[],
  ) {
    const base = samples[targetIndex];
    Object.assign(result, {
      x: base.x,
      z: base.z,
      speedLimit: Infinity,
      curvature: samples[index].curvature,
      reverse: false,
      avoiding: false,
    });
    cooldown = Math.max(0, cooldown - dt);
    const horizon = Math.max(35, Math.min(100, state.speed * 3 + 15));
    const nearby = traffic.filter(
      (other) =>
        other !== state &&
        Math.hypot(other.x - state.x, other.z - state.z) < horizon + dimensions.halfLength * 2,
    );
    // The car ahead owns its line; only cars ahead shape the path, cars behind only matter when reversing.
    const trackSin = Math.sin(samples[index].heading);
    const trackCos = Math.cos(samples[index].heading);
    const ahead = nearby.filter(
      (other) => (other.x - state.x) * trackSin + (other.z - state.z) * trackCos > 0,
    );
    const offsetAt = (i: number) =>
      (samples[i].x - centers[i].x) * rights[i].x + (samples[i].z - centers[i].z) * rights[i].z;
    if (!ahead.length && !active) return result;
    if (!ahead.length && Math.abs(lateral - offsetAt(index)) < 0.25) {
      reset();
      return result;
    }

    function rearClear() {
      for (let distance = 1; distance <= 7; distance++) {
        const x = state.x - Math.sin(state.heading) * distance;
        const z = state.z - Math.cos(state.heading) * distance;
        const i = wrap(index - Math.round(distance / spacing), samples.length);
        const offset = (x - centers[i].x) * rights[i].x + (z - centers[i].z) * rights[i].z;
        if (
          Math.abs(offset) > roadLimit ||
          nearby.some((other) => overlaps(x, z, state.heading, other))
        )
          return false;
      }
      return true;
    }

    if (recovery) {
      recovery.time += dt;
      const backed =
        -(state.x - recovery.x) * Math.sin(recovery.heading) -
        (state.z - recovery.z) * Math.cos(recovery.heading);
      if (backed < dimensions.halfLength * 6 && recovery.time < 14 && rearClear()) {
        result.reverse = true;
        result.speedLimit = 0;
        return result;
      }
      recovery = null;
      cooldown = 8;
    }

    const longitudinal =
      (state.x - centers[index].x) * -rights[index].z +
      (state.z - centers[index].z) * rights[index].x;
    // Paths may begin where the car already is (the racing line runs near the edge); they only
    // fail by heading further outside than that.
    const stateHeading = state.heading - samples[index].heading;
    const roadEdge = Math.max(
      map.definition.width / 2 - 0.25,
      Math.abs(lateral) +
        Math.abs(Math.cos(stateHeading)) * dimensions.halfWidth +
        Math.abs(Math.sin(stateHeading)) * dimensions.halfLength,
    );
    if (passingVehicle !== null) {
      const other = traffic[passingVehicle];
      if (
        !other ||
        (other.x - state.x) * Math.sin(samples[index].heading) +
          (other.z - state.z) * Math.cos(samples[index].heading) <
          -(dimensions.halfLength * 2 + 3)
      )
        passingVehicle = null;
    }

    function transitionLength(candidate: number | null) {
      const shift = Math.abs((candidate ?? offsetAt(targetIndex)) - lateral);
      return Math.max(
        8,
        Math.sqrt((6 * shift) / 0.18),
        state.speed * Math.sqrt((6 * shift) / lateralAcceleration),
      );
    }

    function pathOffset(i: number, distance: number, candidate: number | null, length: number) {
      return lerp(lateral, candidate ?? offsetAt(i), smoothstep(distance, 0, length));
    }

    function evaluate(candidate: number | null, instant = false) {
      const length = instant ? 0 : transitionLength(candidate);
      let previousX =
        state.x + (instant ? ((candidate ?? lateral) - lateral) * rights[index].x : 0);
      let previousZ =
        state.z + (instant ? ((candidate ?? lateral) - lateral) * rights[index].z : 0);
      let previousHeading = samples[index].heading;
      let speedLimit = Infinity;
      let curvature = samples[index].curvature;
      for (let step = 1; step <= Math.ceil(horizon / spacing); step++) {
        const i = wrap(index + step, samples.length);
        const distance = step * spacing - longitudinal;
        const offset = instant
          ? (candidate ?? offsetAt(i))
          : pathOffset(i, distance, candidate, length);
        const x = centers[i].x + rights[i].x * offset;
        const z = centers[i].z + rights[i].z * offset;
        const heading = Math.atan2(x - previousX, z - previousZ);
        const relativeHeading = heading - samples[i].heading;
        const footprint =
          Math.abs(Math.cos(relativeHeading)) * dimensions.halfWidth +
          Math.abs(Math.sin(relativeHeading)) * dimensions.halfLength;
        const outside = Math.abs(offset) + footprint > roadEdge;
        const time = Math.min(2, distance / Math.max(5, state.speed));
        const blocker = ahead.find((other) => overlaps(x, z, heading, other, time));
        if (outside || blocker)
          return {
            candidate,
            blocker,
            blockerOffset: blocker
              ? offset +
                (blocker.x + blocker.vx * time - x) * rights[i].x +
                (blocker.z + blocker.vz * time - z) * rights[i].z
              : 0,
            freeDistance: Math.max(0, distance - spacing),
            speedLimit,
            curvature,
          };
        const bend =
          angle(heading - previousHeading) / Math.max(1, Math.hypot(x - previousX, z - previousZ));
        if (step === 2) curvature = bend;
        if (step > 1)
          speedLimit = Math.min(
            speedLimit,
            Math.sqrt(
              lateralAcceleration / Math.max(0.0005, Math.abs(bend)) +
                2 * braking * Math.max(0, distance - spacing),
            ),
          );
        previousX = x;
        previousZ = z;
        previousHeading = heading;
      }
      return {
        candidate,
        blocker: undefined,
        blockerOffset: 0,
        freeDistance: Infinity,
        speedLimit,
        curvature,
      };
    }

    const ideal = offsetAt(targetIndex);
    const separation = dimensions.halfWidth * 2 + margin + 0.5;
    const candidates = [
      null,
      lane,
      clamp(ideal - separation, -roadLimit, roadLimit),
      clamp(ideal + separation, -roadLimit, roadLimit),
      -roadLimit,
      roadLimit,
    ];
    const racingPlan = evaluate(null);
    if (racingPlan.blocker)
      candidates.push(
        clamp(racingPlan.blockerOffset - separation, -roadLimit, roadLimit),
        clamp(racingPlan.blockerOffset + separation, -roadLimit, roadLimit),
      );
    const plans = [
      racingPlan,
      ...[...new Set(candidates.slice(1))].map((candidate) => evaluate(candidate)),
    ];
    const score = (candidate: number | null) =>
      Math.abs((candidate ?? ideal) - ideal) * 0.15 +
      (candidate === lane ? 0 : 0.25) -
      (candidate === null && passingVehicle === null ? 0.5 : 0);
    const clear = plans.filter((plan) => plan.freeDistance === Infinity);
    let selected = clear.reduce(
      (best, plan) => (score(plan.candidate) < score(best.candidate) ? plan : best),
      clear[0] ?? plans[0],
    );
    const committed = clear.find((plan) => plan.candidate === lane);
    if (passingVehicle !== null && lane !== null && committed) selected = committed;
    if (selected.candidate !== null && plans[0].blocker && passingVehicle === null)
      passingVehicle = traffic.indexOf(plans[0].blocker);
    lane = selected.candidate;
    active = true;
    const distance = Math.max(
      0,
      wrap(targetIndex - index, samples.length) * spacing - longitudinal,
    );
    const offset = pathOffset(targetIndex, distance, lane, transitionLength(lane));
    result.x = centers[targetIndex].x + rights[targetIndex].x * offset;
    result.z = centers[targetIndex].z + rights[targetIndex].z * offset;
    result.curvature = selected.curvature;
    result.avoiding = lane !== null;
    result.speedLimit = Math.min(
      selected.candidate === null && Math.abs(lateral - offsetAt(index)) < 0.5
        ? Infinity
        : selected.speedLimit,
      Math.sqrt(2 * braking * Math.max(0, selected.freeDistance - 1)),
    );
    const blocked = selected.freeDistance < 10;
    stuck = blocked && state.speed < 0.8 ? stuck + dt : 0;
    // Back up only if the blockage can actually be passed once there is steering room.
    if (
      stuck > 1.5 &&
      cooldown === 0 &&
      rearClear() &&
      candidates.some(
        (candidate) => candidate !== null && evaluate(candidate, true).freeDistance === Infinity,
      )
    ) {
      recovery = { x: state.x, z: state.z, heading: state.heading, time: 0 };
      lane = null;
      passingVehicle = null;
      stuck = 0;
      result.reverse = true;
      result.speedLimit = 0;
    }
    return result;
  }

  return { update, reset };
}
