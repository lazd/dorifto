import * as THREE from 'three';
import { courseRoute, type CourseDefinition } from './courses';
import { driveModes } from './drive-modes';
import { createTrafficPlanner } from './bot-traffic';
import { defaultTuningPresets } from './configuration-state';
import type {
  PhysicsConfiguration,
  PhysicsControls,
  createVehiclePhysics,
} from './vehicle-physics';

export const raceBotVersion = 3;
export const raceBotGridSpacing = 12;
export const trainingCourses = { race: 'hillside', drift: 'sweeper' } as const;
export type VehicleState = ReturnType<ReturnType<typeof createVehiclePhysics>['readState']>;

export interface RaceBotOptions {
  skill: number;
  aggression: number;
  learning: boolean;
}

export const defaultRaceBotOptions: RaceBotOptions = {
  skill: 0.8,
  aggression: 0.4,
  learning: true,
};

export function raceBotConfiguration(configuration: PhysicsConfiguration): PhysicsConfiguration {
  const preset = defaultTuningPresets().find(({ id }) => id === 'grip-fast');
  if (!preset || preset.mode !== 'grip') throw new Error('Missing built-in grip-fast preset');
  return {
    ...configuration,
    driveMode: 'grip',
    profiles: { ...configuration.profiles, grip: { ...preset.tuning } },
  };
}

export function readRaceBots(parameters: URLSearchParams): RaceBotOptions[] {
  const count = Number(parameters.get('bots') ?? (readBotsOnly(parameters) ? 1 : 0));
  if (!Number.isInteger(count) || count < 0 || count > 4)
    throw new Error('Bot count must be an integer from 0 to 4');
  const skills = (parameters.get('bot-skill') ?? String(defaultRaceBotOptions.skill))
    .split(',')
    .map((value) => (value.trim() ? Number(value) : NaN));
  if (skills.length !== 1 && skills.length !== count)
    throw new Error('bot-skill must be one skill or one comma-separated skill per bot');
  const options = {
    skill: skills[0],
    aggression: parameters.has('bot-aggression')
      ? Number(parameters.get('bot-aggression'))
      : defaultRaceBotOptions.aggression,
    learning: true,
  };
  for (const skill of skills) validateRaceBotOptions({ ...options, skill });
  if (readBotsOnly(parameters) && count === 0)
    throw new Error('Bots-only mode requires at least one bot');
  return Array.from({ length: count }, (_, index) => ({
    ...options,
    skill: skills[skills.length === 1 ? 0 : index],
  }));
}

export function readBotsOnly(parameters: URLSearchParams) {
  const value = parameters.get('bots-only');
  if (value === null || value === '0') return false;
  if (value === '1') return true;
  throw new Error('bots-only must be 0 or 1');
}

export interface RaceExperience {
  version: number;
  key: string;
  pace: number[];
  visits: number[];
}

const clamp = THREE.MathUtils.clamp;
const approach = (value: number, target: number, amount: number) =>
  value + clamp(target - value, -amount, amount);
const wrap = THREE.MathUtils.euclideanModulo;
const angle = (value: number) => Math.atan2(Math.sin(value), Math.cos(value));

export function validateRaceBotOptions(options: RaceBotOptions) {
  for (const key of ['skill', 'aggression'] as const) {
    if (!Number.isFinite(options[key]) || options[key] < 0 || options[key] > 1)
      throw new Error(`Race bot ${key} must be between 0 and 1`);
  }
  if (typeof options.learning !== 'boolean') throw new Error('Invalid race bot learning option');
}

export function createDrivingMap(
  definition: CourseDefinition,
  terrain: {
    heightAt(x: number, z: number): number;
    normalAt(x: number, z: number): THREE.Vector3;
  },
  halfWidth: number,
) {
  const route = courseRoute(definition);
  const length = route.getLength();
  const count = Math.ceil(length / 3);
  const spacing = length / count;
  const centers = Array.from({ length: count }, (_, i) => route.getPointAt(i / count));
  const rights = Array.from({ length: count }, (_, i) => {
    const tangent = route.getTangentAt(i / count);
    return new THREE.Vector3(tangent.z, 0, -tangent.x);
  });
  const offsets = new Float64Array(count);
  const line = centers.map((point) => point.clone());
  const clearance = definition.width / 2 - halfWidth - 0.8;
  if (clearance <= 0) throw new Error('Course is too narrow for this vehicle');
  // Minimize bending energy inside the road corridor, not just route length.
  const at = (i: number) => line[wrap(i, count)];
  const delta = new THREE.Vector3();
  for (let pass = 0; pass < 300; pass++) {
    for (let i = 0; i < count; i++) {
      delta
        .copy(at(i - 1))
        .add(at(i + 1))
        .multiplyScalar(4)
        .sub(at(i - 2))
        .sub(at(i + 2))
        .addScaledVector(at(i), -6);
      offsets[i] = clamp(offsets[i] + delta.dot(rights[i]) * 0.08, -clearance, clearance);
      line[i].copy(centers[i]).addScaledVector(rights[i], offsets[i]);
    }
  }
  const samples = line.map((point, i) => {
    const before = at(i - 1);
    const after = at(i + 1);
    const incoming = point.clone().sub(before);
    const outgoing = after.clone().sub(point);
    const distance = (incoming.length() + outgoing.length()) / 2;
    const curvature =
      angle(Math.atan2(outgoing.x, outgoing.z) - Math.atan2(incoming.x, incoming.z)) /
      Math.max(distance, 0.1);
    const tangent = after.clone().sub(before).normalize();
    const normal = terrain.normalAt(point.x, point.z);
    const grade =
      (terrain.heightAt(after.x, after.z) - terrain.heightAt(before.x, before.z)) /
      Math.max(after.distanceTo(before), 0.1);
    const bank = normal.x * tangent.z - normal.z * tangent.x;
    return {
      x: point.x,
      z: point.z,
      curvature,
      grade,
      bank,
      heading: Math.atan2(tangent.x, tangent.z),
    };
  });
  return { definition, length, spacing, centers, rights, samples };
}

export type DrivingMap = ReturnType<typeof createDrivingMap>;

export function createRaceBot(
  map: DrivingMap,
  configuration: PhysicsConfiguration,
  dimensions: { wheelbase: number; halfWidth: number; halfLength: number },
  options: RaceBotOptions = defaultRaceBotOptions,
  saved?: RaceExperience,
) {
  validateRaceBotOptions(options);
  const { samples, spacing } = map;
  const count = samples.length;
  const sectorCount = Math.ceil(map.length / 25);
  const key = JSON.stringify({
    version: raceBotVersion,
    course: map.definition,
    mode: configuration.driveMode,
    tune: configuration.profiles[configuration.driveMode],
    dimensions,
    options: { skill: options.skill, aggression: options.aggression },
  });
  const experience: RaceExperience = {
    version: raceBotVersion,
    key,
    pace: Array(sectorCount).fill(0.9 + options.skill * 0.05),
    visits: Array(sectorCount).fill(0),
  };
  if (saved) {
    if (
      saved.version !== raceBotVersion ||
      saved.key !== key ||
      !Array.isArray(saved.pace) ||
      !Array.isArray(saved.visits) ||
      saved.pace.length !== sectorCount ||
      saved.visits.length !== sectorCount ||
      saved.pace.some((value) => !Number.isFinite(value) || value < 0.55 || value > 1.05) ||
      saved.visits.some((value) => !Number.isInteger(value) || value < 0)
    )
      throw new Error(
        'Race experience is invalid or incompatible with this course, setup or driver',
      );
    experience.pace = [...saved.pace];
    experience.visits = [...saved.visits];
  }
  const controls: PhysicsControls = {
    throttle: 0,
    brake: 0,
    reverse: 0,
    steer: 0,
    handbrake: false,
  };
  const speeds = new Float64Array(count);
  const tune = driveModes[configuration.driveMode];
  const tuning = configuration.profiles[configuration.driveMode];
  const trafficPlanner = createTrafficPlanner(map, dimensions, options);
  const sectorAt = (i: number) =>
    Math.min(sectorCount - 1, Math.floor((wrap(i, count) * sectorCount) / count));
  let index = -1;
  let sector = -1;
  let troubled = false;
  let passageTime = 0;
  let maxSlip = 0;
  let offTrackSeconds = 0;
  let saturationSeconds = 0;
  let elapsed = 0;
  let progress = 0;
  let targetSpeed = 0;
  let lateralError = 0;
  let braking = false;

  function rebuildSpeeds() {
    const lateralAcceleration =
      (5 + options.skill * 2) * Math.min(tuning.frontGrip, tuning.rearGrip);
    for (let i = 0; i < count; i++) {
      const sample = samples[i];
      const bankAssist = -Math.sign(sample.curvature) * sample.bank * 9.81;
      const cornerSpeed = Math.sqrt(
        Math.max(2, lateralAcceleration + bankAssist) /
          Math.max(Math.abs(sample.curvature), 0.0005),
      );
      speeds[i] = Math.min(65, cornerSpeed) * experience.pace[sectorAt(i)];
    }
    // Two circular passes propagate braking across the start line.
    for (let pass = 0; pass < 2; pass++) {
      for (let i = count - 1; i >= 0; i--) {
        const next = (i + 1) % count;
        const deceleration = Math.max(2, 5 + options.skill * 2 + samples[i].grade * 9.81);
        speeds[i] = Math.min(speeds[i], Math.sqrt(speeds[next] ** 2 + 2 * deceleration * spacing));
      }
      for (let i = 0; i < count; i++) {
        const previous = wrap(i - 1, count);
        const acceleration = Math.max(1, 5 - samples[i].grade * 9.81);
        speeds[i] = Math.min(
          speeds[i],
          Math.sqrt(speeds[previous] ** 2 + 2 * acceleration * spacing),
        );
      }
    }
  }
  rebuildSpeeds();

  function finishPassage() {
    if (!options.learning || sector < 0 || passageTime < 0.2) return;
    experience.visits[sector]++;
    experience.pace[sector] = clamp(
      experience.pace[sector] + (troubled ? -0.06 : 0.006),
      0.55,
      1.05,
    );
    rebuildSpeeds();
  }

  function reset() {
    trafficPlanner.reset();
    index = sector = -1;
    troubled = false;
    passageTime = maxSlip = offTrackSeconds = saturationSeconds = elapsed = progress = 0;
    targetSpeed = lateralError = 0;
    braking = false;
    Object.assign(controls, { throttle: 0, brake: 0, reverse: 0, steer: 0, handbrake: false });
  }

  function update(state: VehicleState, dt: number, traffic: readonly VehicleState[] = []) {
    let nearest = index;
    let bestDistance = Infinity;
    const search = index < 0 ? count : Math.min(Math.ceil(count / 2), 20);
    const start = index < 0 ? 0 : index - search;
    const end = index < 0 ? count : index + search + 1;
    for (let i = start; i < end; i++) {
      const candidate = wrap(i, count);
      const point = samples[candidate];
      const distance = (point.x - state.x) ** 2 + (point.z - state.z) ** 2;
      if (distance < bestDistance) {
        nearest = candidate;
        bestDistance = distance;
      }
    }
    if (index >= 0)
      progress += (angle(((nearest - index) * Math.PI * 2) / count) * map.length) / (Math.PI * 2);
    index = nearest;
    const nextSector = sectorAt(index);
    if (nextSector !== sector) {
      finishPassage();
      sector = nextSector;
      troubled = false;
      passageTime = 0;
    }
    passageTime += dt;
    elapsed += dt;
    const center = map.centers[index];
    const right = map.rights[index];
    lateralError = (state.x - center.x) * right.x + (state.z - center.z) * right.z;
    const roadHeading = Math.atan2(-right.z, right.x);
    const relativeHeading = state.heading - roadHeading;
    const footprint =
      Math.abs(Math.cos(relativeHeading)) * dimensions.halfWidth +
      Math.abs(Math.sin(relativeHeading)) * dimensions.halfLength;
    const outside = Math.abs(lateralError) + footprint > map.definition.width / 2;
    if (outside) offTrackSeconds += dt;
    maxSlip = Math.max(maxSlip, Math.abs(state.slipAngle));
    if (outside || (state.speed > 5 && Math.abs(state.slipAngle) > 0.18)) troubled = true;

    const lookahead = 5 + state.speed * (0.5 + options.skill * 0.15);
    const targetIndex = wrap(index + Math.max(1, Math.round(lookahead / spacing)), count);
    const target = trafficPlanner.update(state, index, lateralError, targetIndex, dt, traffic);
    const dx = target.x - state.x;
    const dz = target.z - state.z;
    const bearing = angle(Math.atan2(dx, dz) - state.heading);
    const wheelAngle = Math.atan2(
      2 * dimensions.wheelbase * Math.sin(bearing),
      Math.max(2, Math.hypot(dx, dz)),
    );
    const steeringLimit =
      THREE.MathUtils.lerp(
        tune.steeringLow,
        tune.steeringHigh,
        Math.min((state.speed * 3.6) / 140, 1),
      ) * tuning.steeringScale;
    const yawError = state.yawRate - state.speed * target.curvature;
    const stabilization = state.speed > 5 ? state.slipAngle * 0.3 - yawError * 0.08 : 0;
    controls.steer = clamp((wheelAngle + stabilization) / steeringLimit, -1, 1);
    if (Math.abs(controls.steer) > 0.95) saturationSeconds += dt;
    const sample = samples[index];
    const fraction = clamp(
      ((state.x - sample.x) * Math.sin(sample.heading) +
        (state.z - sample.z) * Math.cos(sample.heading)) /
        spacing,
      -0.5,
      0.5,
    );
    const adjacent = wrap(index + (fraction < 0 ? -1 : 1), count);
    const plannedSpeed = THREE.MathUtils.lerp(speeds[index], speeds[adjacent], Math.abs(fraction));
    const steeringSpeed = target.avoiding
      ? Math.sqrt(
          (5 + options.skill * 2) /
            Math.max(Math.abs(Math.tan(wheelAngle) / dimensions.wheelbase), 0.0005),
        )
      : Infinity;
    targetSpeed = Math.min(plannedSpeed, target.speedLimit, steeringSpeed);
    controls.reverse = 0;
    if (target.reverse) {
      controls.steer = 0;
      controls.throttle = 0;
      controls.brake = 1;
      controls.reverse = state.speed < 2 ? 0.35 : 0;
      return controls;
    }
    if (state.vx * Math.sin(state.heading) + state.vz * Math.cos(state.heading) < -0.3) {
      controls.throttle = 0;
      controls.brake = 1;
      return controls;
    }
    const speedError = targetSpeed - state.speed;
    const plannedAcceleration =
      (speeds[wrap(index + 1, count)] ** 2 - speeds[wrap(index - 1, count)] ** 2) / (4 * spacing);
    const feedForward =
      target.speedLimit < plannedSpeed
        ? 0
        : (plannedAcceleration * state.speed) / Math.max(plannedSpeed, 1);
    const acceleration = feedForward + speedError * 1.5;
    braking = targetSpeed === 0 || acceleration < (braking ? -0.15 : -0.9);
    const brake = braking ? clamp(-acceleration / 8, 0, 1) : 0;
    const brakingZone = plannedAcceleration < -0.8 && state.speed > plannedSpeed - 2;
    // Invert the drivetrain's sqrt(pedal) response so small torque requests stay small.
    let throttle = braking || brakingZone ? 0 : clamp(acceleration / 4, 0, 1) ** 2;
    if (state.speed > 5)
      throttle *= 1 - THREE.MathUtils.smoothstep(Math.abs(state.slipAngle), 0.1, 0.28);
    controls.brake = targetSpeed === 0 ? 1 : approach(controls.brake, brake, dt * 8);
    controls.throttle =
      controls.brake > 0
        ? 0
        : approach(controls.throttle, throttle, dt * (throttle > controls.throttle ? 2 : 6));
    return controls;
  }

  return {
    controls,
    update,
    reset,
    finishRun: finishPassage,
    exportExperience(): RaceExperience {
      return { ...experience, pace: [...experience.pace], visits: [...experience.visits] };
    },
    get metrics() {
      return {
        elapsed,
        progress,
        maxSlip,
        offTrackSeconds,
        saturationSeconds,
        targetSpeed,
        lateralError,
      };
    },
  };
}
