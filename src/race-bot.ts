import * as THREE from 'three';
import { courseRoute, courseSpawn, type CourseDefinition } from './courses';
import { driveModes } from './drive-modes';
import { createTrafficPlanner } from './bot-traffic';
import { optimizeRacingLine } from './racing-line';
import { defaultTuningPresets } from './configuration-state';
import { vehicleSettings } from './vehicle-settings';
import type {
  PhysicsConfiguration,
  PhysicsControls,
  createVehiclePhysics,
} from './vehicle-physics';

export const raceBotVersion = 5;
export const raceBotGridSpacing = 12;
export const maxRaceBots = 8;
const raceGridLaneOffset = 2.5;

export function raceGridSpawn(definition: CourseDefinition, slot: number) {
  const row = Math.floor(slot / 2);
  const lateralOffset = slot % 2 === 0 ? -raceGridLaneOffset : raceGridLaneOffset;
  return courseSpawn(definition, 30 + row * raceBotGridSpacing, lateralOffset);
}

export const raceBotPresets = ['grip-default', 'grip-fast'] as const;
export type RaceBotPreset = (typeof raceBotPresets)[number];
export interface RaceBotTuning {
  /** Cornering limit on asphalt, m/s² per unit of tire grip. */
  corneringGrip: number;
  /** Straight-line braking limit, m/s². */
  brakingLimit: number;
  /** Speed drops (m/s) small enough to coast into rather than brake for. */
  smallSpeedDrop: number;
  /** Deceleration beyond coasting (m/s²) worth touching the brakes for. */
  brakeThreshold: number;
  /** Steering lookahead, seconds of travel beyond a fixed 5 m. */
  lookaheadTime: number;
  /** Gap kept between the car body and the road edge on the racing line, m. */
  edgeMargin: number;
  /** Body slip (rad) beyond which the front wheels are pointed along the car's velocity. */
  countersteerSlip: number;
}
/**
 * Driver model constants per car setup; `scripts/optimize-race-bot.mjs --preset <id>` searches
 * them for lap time.
 */
export const raceBotTunings: Record<RaceBotPreset, RaceBotTuning> = {
  'grip-default': {
    corneringGrip: 16.476164224906046,
    brakingLimit: 6.208698803289554,
    smallSpeedDrop: 8.876687770098055,
    brakeThreshold: 3.6034957972955155,
    lookaheadTime: 0.12265988193447282,
    edgeMargin: 1.1168628157972,
    countersteerSlip: 0.06274067759987546,
  },
  'grip-fast': {
    corneringGrip: 14.48,
    brakingLimit: 5.89,
    smallSpeedDrop: 4.5,
    brakeThreshold: 2.29,
    lookaheadTime: 0.106,
    edgeMargin: 0.64,
    countersteerSlip: 0.092,
  },
};
/** Acceleration the speed profile and throttle assume at full throttle, m/s². */
const driveAcceleration = 5;
export const trainingCourses = { race: 'hillside', drift: 'sweeper' } as const;
export type VehicleState = ReturnType<ReturnType<typeof createVehiclePhysics>['readState']>;

export interface RaceBotOptions {
  skill: number;
  aggression: number;
  learning: boolean;
  /** Built-in car setup the bot drives; defaults to Grip / Fast. */
  preset?: RaceBotPreset;
}

export const defaultRaceBotOptions: RaceBotOptions = {
  skill: 0.8,
  aggression: 0.4,
  learning: false,
  preset: 'grip-default',
};

export function raceBotConfiguration(
  configuration: PhysicsConfiguration,
  id: RaceBotPreset = 'grip-fast',
): PhysicsConfiguration {
  const preset = defaultTuningPresets().find((preset) => preset.id === id);
  if (!preset || preset.mode !== 'grip') throw new Error(`Missing built-in ${id} preset`);
  return {
    ...configuration,
    driveMode: 'grip',
    profiles: { ...configuration.profiles, grip: { ...preset.tuning } },
  };
}

/** Identifies a bot driver in saved runs; the hash changes whenever its preset's values do. */
export function raceBotDriverName({ preset = 'grip-fast', skill }: RaceBotOptions) {
  let hash = 0;
  for (const char of JSON.stringify(raceBotTunings[preset]))
    hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0;
  const id = (hash >>> 0).toString(36).slice(-4);
  return `bot v${raceBotVersion} ${preset} ${id} skill ${skill}`;
}

function readBotLearning(value: string) {
  if (value === '1') return true;
  if (value === '0') return false;
  throw new Error('bot-learning must be 0 or 1');
}

/** Reads a parameter holding one value for every bot or one comma-separated value per bot. */
function readPerBot<Key extends keyof RaceBotOptions>(
  parameters: URLSearchParams,
  name: string,
  key: Key,
  count: number,
  parse: (value: string) => RaceBotOptions[Key],
) {
  const parameter = parameters.get(name);
  const values =
    parameter === null
      ? [defaultRaceBotOptions[key]]
      : parameter.split(',').map((value) => parse(value.trim()));
  for (const value of values) validateRaceBotOptions({ ...defaultRaceBotOptions, [key]: value });
  if (values.length !== 1 && values.length !== count)
    throw new Error(`${name} must be one value or one comma-separated value per bot`);
  return Array.from({ length: count }, (_, index) => values[values.length === 1 ? 0 : index]);
}

export function readRaceBots(parameters: URLSearchParams): RaceBotOptions[] {
  const count = Number(parameters.get('bots') ?? (readBotsOnly(parameters) ? 1 : 2));
  if (!Number.isInteger(count) || count < 0 || count > maxRaceBots)
    throw new Error(`Bot count must be an integer from 0 to ${maxRaceBots}`);
  if (readBotsOnly(parameters) && count === 0)
    throw new Error('Bots-only mode requires at least one bot');
  const number = (value: string) => (value ? Number(value) : NaN);
  const skills = readPerBot(parameters, 'bot-skill', 'skill', count, number);
  const aggressions = readPerBot(parameters, 'bot-aggression', 'aggression', count, number);
  const learning = readPerBot(parameters, 'bot-learning', 'learning', count, readBotLearning);
  const presets = readPerBot(
    parameters,
    'bot-preset',
    'preset',
    count,
    (value) => value as RaceBotPreset,
  );
  return skills.map((skill, index) => ({
    skill,
    aggression: aggressions[index],
    learning: learning[index],
    preset: presets[index],
  }));
}

/** Writes bots in the comma-separated URL form that `readRaceBots` reads. */
export function writeRaceBots(
  parameters: URLSearchParams,
  bots: readonly RaceBotOptions[],
  botsOnly: boolean,
) {
  const lists = {
    'bot-skill': bots.map((bot) => bot.skill),
    'bot-aggression': bots.map((bot) => bot.aggression),
    'bot-preset': bots.map((bot) => bot.preset ?? defaultRaceBotOptions.preset),
    'bot-learning': bots.map((bot) => (bot.learning ? 1 : 0)),
  };
  for (const name of ['bots', 'bots-only', ...Object.keys(lists)]) parameters.delete(name);
  parameters.set('bots', String(bots.length));
  if (!bots.length) return;
  for (const [name, values] of Object.entries(lists)) parameters.set(name, values.join(','));
  if (botsOnly) parameters.set('bots-only', '1');
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
  if (options.preset !== undefined && !raceBotPresets.includes(options.preset))
    throw new Error(`Race bot preset must be one of ${raceBotPresets.join(', ')}`);
}

export function createDrivingMap(
  definition: CourseDefinition,
  terrain: {
    heightAt(x: number, z: number): number;
    normalAt(x: number, z: number): THREE.Vector3;
  },
  halfWidth: number,
  edgeMargin = raceBotTunings['grip-fast'].edgeMargin,
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
  const clearance = definition.width / 2 - halfWidth - edgeMargin;
  if (clearance <= 0) throw new Error('Course is too narrow for this vehicle');
  const line = optimizeRacingLine(centers, clearance);
  const at = (i: number) => line[wrap(i, count)];
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
  // Crests (negative) unload the tires; dips (positive) load them.
  const verticalCurvatures = samples.map(
    (_, i) =>
      (samples[(i + 1) % samples.length].grade -
        samples[(i - 1 + samples.length) % samples.length].grade) /
      (2 * spacing),
  );
  return { definition, length, spacing, centers, rights, samples, verticalCurvatures };
}

export type DrivingMap = ReturnType<typeof createDrivingMap>;

export function createRaceBot(
  map: DrivingMap,
  configuration: PhysicsConfiguration,
  dimensions: { wheelbase: number; halfWidth: number; halfLength: number; wheelRadius: number },
  options: RaceBotOptions = defaultRaceBotOptions,
  saved?: RaceExperience,
) {
  validateRaceBotOptions(options);
  const driver = raceBotTunings[options.preset ?? 'grip-fast'];
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
  // Skill is how close to the car's limits the driver dares to run, not a different car.
  const limit = THREE.MathUtils.lerp(0.85, 1, options.skill);
  const lateralAcceleration =
    driver.corneringGrip * Math.min(tuning.frontGrip, tuning.rearGrip) * limit;
  const brakingDeceleration = driver.brakingLimit * limit;
  const { frontTorqueNm, rearTorqueNm } = vehicleSettings.brakes;
  const fullBrakeDeceleration =
    (2 * (frontTorqueNm + rearTorqueNm)) / dimensions.wheelRadius / vehicleSettings.massKg;
  const trafficPlanner = createTrafficPlanner(map, dimensions, options, {
    lateralAcceleration,
    braking: brakingDeceleration,
  });
  const sectorAt = (i: number) =>
    Math.min(sectorCount - 1, Math.floor((wrap(i, count) * sectorCount) / count));
  let index = -1;
  let sector = -1;
  let troubled = false;
  let passageTime = 0;
  let maxSlip = 0;
  let offTrackSeconds = 0;
  let saturationSeconds = 0;
  let brakeApplications = 0;
  let throttleLifts = 0;
  let elapsed = 0;
  let progress = 0;
  let targetSpeed = 0;
  let lateralError = 0;
  let braking = false;
  let slowing = false;
  let previousSpeed = 0;
  let coastDeceleration = 2;

  const cornerGrip = samples.map((sample) =>
    Math.max(2, lateralAcceleration - Math.sign(sample.curvature) * sample.bank * 9.81),
  );
  const { verticalCurvatures } = map;
  const loadAt = (i: number, speed: number) =>
    Math.max(0.2, 1 + (speed ** 2 * verticalCurvatures[i]) / 9.81);
  // Friction circle: grip spent cornering is not available for braking or accelerating.
  const remainingGrip = (i: number, speed: number) =>
    loadAt(i, speed) *
    Math.sqrt(
      Math.max(
        0.15,
        1 -
          ((speed ** 2 * Math.abs(samples[i].curvature)) / (cornerGrip[i] * loadAt(i, speed))) ** 2,
      ),
    );

  function rebuildSpeeds() {
    for (let i = 0; i < count; i++) {
      // Solves v²|κ| = grip·(1 + v²κᵥ/g) so crests lower the corner speed.
      const cornerSpeed = Math.sqrt(
        cornerGrip[i] /
          Math.max(
            Math.abs(samples[i].curvature) - (cornerGrip[i] * verticalCurvatures[i]) / 9.81,
            0.0005,
          ),
      );
      speeds[i] = Math.min(65, cornerSpeed) * experience.pace[sectorAt(i)];
    }
    // Two circular passes propagate braking across the start line.
    for (let pass = 0; pass < 2; pass++) {
      for (let i = count - 1; i >= 0; i--) {
        const next = (i + 1) % count;
        const deceleration = Math.max(
          2,
          brakingDeceleration * remainingGrip(next, speeds[next]) + samples[i].grade * 9.81,
        );
        speeds[i] = Math.min(speeds[i], Math.sqrt(speeds[next] ** 2 + 2 * deceleration * spacing));
      }
      for (let i = 0; i < count; i++) {
        const previous = wrap(i - 1, count);
        const acceleration = Math.max(
          1,
          driveAcceleration * remainingGrip(previous, speeds[previous]) - samples[i].grade * 9.81,
        );
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
    brakeApplications = throttleLifts = 0;
    targetSpeed = lateralError = 0;
    braking = slowing = false;
    previousSpeed = 0;
    coastDeceleration = 2;
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

    const lookahead = 5 + state.speed * driver.lookaheadTime;
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
    // Beyond normal cornering slip, point the front wheels along the car's velocity.
    const excessSlip =
      Math.sign(state.slipAngle) * Math.max(0, Math.abs(state.slipAngle) - driver.countersteerSlip);
    const stabilization =
      state.speed > 5 ? state.slipAngle * 0.3 + excessSlip - yawError * 0.08 : 0;
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
          lateralAcceleration /
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
    // Learn how hard the car slows off the pedals (engine braking, drag, scrub), net of grade.
    const grade = samples[index].grade * 9.81;
    if (
      previousSpeed > 10 &&
      controls.throttle === 0 &&
      controls.brake === 0 &&
      Math.abs(state.slipAngle) < 0.06
    )
      coastDeceleration = THREE.MathUtils.lerp(
        coastDeceleration,
        clamp((previousSpeed - state.speed) / dt - grade, 0.3, 6),
        Math.min(1, dt),
      );
    previousSpeed = state.speed;
    const coast = Math.max(0.3, coastDeceleration + grade);
    // One acceleration request, blended from throttle through coasting to brake. Small speed
    // drops are coasted into early; large ones are braked as late as the profile allows.
    const { smallSpeedDrop, brakeThreshold } = driver;
    let required = 0;
    let slowest = targetSpeed;
    const reach = state.speed ** 2 / (2 * coast);
    for (let k = 1; (k - fraction) * spacing < reach; k++) {
      const ahead = speeds[wrap(index + k, count)];
      if (ahead >= state.speed) continue;
      slowest = Math.min(slowest, ahead);
      required = Math.max(
        required,
        (state.speed ** 2 - ahead ** 2) / (2 * Math.max((k - fraction) * spacing, 1)),
      );
    }
    const onset = state.speed - slowest < smallSpeedDrop ? coast : brakingDeceleration * 0.9;
    slowing = required > (slowing ? coast * 0.5 : onset);
    let desired = (targetSpeed - state.speed) * 1.5;
    if (slowing) desired = Math.min(desired, -required);
    const excess = -desired - coast;
    braking = targetSpeed === 0 || excess > (braking ? 0 : brakeThreshold);
    // Friction circle on the measured cornering load, so it can't trail-brake into a slide.
    const cornering =
      (state.speed * state.yawRate) / (cornerGrip[index] * loadAt(index, state.speed));
    const brakeLimit = brakingDeceleration * Math.sqrt(Math.max(0.15, 1 - cornering ** 2));
    // Like the throttle, ease off the brakes as soon as the car starts to slide.
    const brake = braking
      ? clamp(Math.min(excess, brakeLimit) / fullBrakeDeceleration, 0, 1) *
        (1 - THREE.MathUtils.smoothstep(Math.abs(state.slipAngle), 0.06, 0.2))
      : 0;
    // Invert the drivetrain's sqrt(pedal) response so small torque requests stay small.
    let throttle = braking ? 0 : clamp((desired + coast) / driveAcceleration, 0, 1) ** 2;
    if (state.speed > 5)
      throttle *=
        1 -
        THREE.MathUtils.smoothstep(
          Math.abs(state.slipAngle),
          driver.countersteerSlip,
          driver.countersteerSlip * 2,
        );
    const { brake: previousBrake, throttle: previousThrottle } = controls;
    // Feed the throttle out before touching the brake; snapping off it unsettles the car.
    controls.throttle = approach(
      controls.throttle,
      braking ? 0 : throttle,
      dt * (throttle > controls.throttle ? 4 : 5),
    );
    controls.brake =
      targetSpeed === 0 ? 1 : controls.throttle > 0 ? 0 : approach(controls.brake, brake, dt * 8);
    if (previousBrake === 0 && controls.brake > 0) brakeApplications++;
    if (previousThrottle > 0 && controls.throttle === 0) throttleLifts++;
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
        brakeApplications,
        throttleLifts,
        targetSpeed,
        lateralError,
      };
    },
  };
}
