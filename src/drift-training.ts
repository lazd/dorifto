import type AmmoFactory from 'ammojs-typed';
import type { CourseDefinition } from './courses';
import { vehicleDimensions } from './car-geometry';
import type { PhysicsConfiguration } from './vehicle-physics';
import { createDrivingMap, type VehicleState } from './race-bot';
import { centerlineCurvatures, createDriftBot, type DriftBotTuning } from './drift-bot';
import { createTrainingVehicle, type TrainingGeometry } from './bot-training';
import { physicsStep } from './physics-messages';
import type { CourseTerrain } from './terrain';

/** Body slip angle (rad) that counts as drifting rather than cornering. */
export const driftAngle = (15 * Math.PI) / 180;
/** Mean drift angle the score rewards most; the paper and human laps hold ~30–45°. */
export const targetDriftAngle = (35 * Math.PI) / 180;
/** Centerline curvature (1/m) within 20 m that makes a slide a corner drift, not a straight one. */
const cornerCurvature = 1 / 150;
/** Gap (s) between opposite drifts still counted as one linked transition. */
const transitionGap = 0.6;

export interface DriftRun {
  targetLaps: number;
  /** Centerline lap length, m. */
  lapLength: number;
  failure: 'timeout' | 'stuck' | 'off-track' | 'spin' | null;
  /** Valid lap times, s. */
  laps: number[];
  seconds: number;
  /** Forward distance along the centerline, m. */
  distance: number;
  /** Distance covered drifting through corners, m. */
  driftDistance: number;
  /** Seconds sliding past the drift angle on straights or below drift speed. */
  idleSlideSeconds: number;
  /** Mean body slip angle while drifting, rad. */
  meanAngle: number;
  /** Separate drifts started from grip. */
  drifts: number;
  /** Direction changes linked without regaining grip. */
  transitions: number;
  /** Seconds any tire touched dirt. */
  dirtSeconds: number;
  /** RMS yaw-rate tracking error while drifting, rad/s. */
  yawError: number;
  /** Mean steering rate, full locks per second. */
  steeringEffort: number;
}

/** One number to maximize; every term is per lap so short failed runs can't win. */
export function driftScore(run: DriftRun) {
  const laps = Math.max(run.distance / run.lapLength, 0.25);
  const coverage = run.driftDistance / Math.max(run.distance, 1);
  const angle = 1 - Math.min(1, Math.abs(run.meanAngle - targetDriftAngle) / targetDriftAngle);
  return (
    20 * Math.min(1, run.distance / (run.lapLength * run.targetLaps)) +
    100 * coverage +
    25 * angle * coverage +
    (8 * run.transitions) / laps -
    (40 * run.dirtSeconds) / laps -
    (5 * run.idleSlideSeconds) / laps -
    10 * run.yawError -
    5 * run.steeringEffort -
    (run.failure === null ? 0 : 200)
  );
}

export function runDriftBot(
  Ammo: typeof AmmoFactory,
  definition: CourseDefinition,
  terrain: CourseTerrain,
  geometry: TrainingGeometry,
  configuration: PhysicsConfiguration,
  tuning?: DriftBotTuning,
  {
    laps: lapCount = 2,
    maxSeconds = 240,
    onStep,
  }: {
    laps?: number;
    maxSeconds?: number;
    onStep?: (
      state: VehicleState,
      bot: ReturnType<typeof createDriftBot>,
      physics: ReturnType<typeof createTrainingVehicle>['physics'],
    ) => void;
  } = {},
): DriftRun {
  const dimensions = vehicleDimensions(geometry);
  const map = createDrivingMap(definition, terrain, dimensions.halfWidth);
  const curvatures = centerlineCurvatures(map);
  const reach = Math.ceil(20 / map.spacing);
  const corner = curvatures.map((_, i) => {
    for (let k = -reach; k <= reach; k++)
      if (Math.abs(curvatures[(i + k + curvatures.length) % curvatures.length]) > cornerCurvature)
        return true;
    return false;
  });
  const bot = createDriftBot(map, configuration, dimensions, { tuning });
  const { physics, laps } = createTrainingVehicle(
    Ammo,
    definition,
    terrain,
    geometry,
    configuration,
    bot.controls,
  );
  const run: DriftRun = {
    targetLaps: lapCount,
    lapLength: map.length,
    failure: 'timeout',
    laps: [],
    seconds: 0,
    distance: 0,
    driftDistance: 0,
    idleSlideSeconds: 0,
    meanAngle: 0,
    drifts: 0,
    transitions: 0,
    dirtSeconds: 0,
    yawError: 0,
    steeringEffort: 0,
  };
  let lastLap = 0;
  let stuck = 0;
  let dirt = 0;
  let slideSpeed = 0;
  let slidePeak = 0;
  let driftSeconds = 0;
  let angleSum = 0;
  let yawErrorSum = 0;
  let direction = 0;
  let sinceDrift = Infinity;
  let previousSteer = 0;
  try {
    physics.reset();
    for (let step = 0; step < maxSeconds / physicsStep; step++) {
      const state = physics.readState();
      bot.update(state, physicsStep);
      onStep?.(state, bot, physics);
      physics.step();
      const { metrics } = bot;
      const slip = state.slipAngle;
      run.seconds += physicsStep;
      run.steeringEffort += Math.abs(bot.controls.steer - previousSteer);
      previousSteer = bot.controls.steer;
      const advanced = metrics.progress - run.distance;
      run.distance = Math.max(run.distance, metrics.progress);
      if (Math.abs(slip) > driftAngle && state.speed > 10 && corner[metrics.index]) {
        const side = Math.sign(slip);
        if (side !== direction) {
          if (sinceDrift < transitionGap && direction !== 0) run.transitions++;
          else run.drifts++;
          direction = side;
        }
        sinceDrift = 0;
        driftSeconds += physicsStep;
        run.driftDistance += Math.max(0, advanced);
        angleSum += Math.abs(slip) * physicsStep;
        yawErrorSum += (state.yawRate - metrics.desiredYawRate) ** 2 * physicsStep;
      } else {
        if (Math.abs(slip) > driftAngle && state.speed > 3) run.idleSlideSeconds += physicsStep;
        sinceDrift += physicsStep;
        if (sinceDrift > transitionGap) direction = 0;
      }
      const onDirt = physics.tireContacts.some(
        (tire, i) => physics.wheelContacts[i] && !tire.paved,
      );
      if (onDirt) run.dirtSeconds += physicsStep;
      dirt = onDirt ? dirt + physicsStep : 0;
      stuck = state.speed < 0.5 ? stuck + physicsStep : 0;
      if (Math.abs(slip) < 0.3 || state.speed < 1) slideSpeed = slidePeak = 0;
      else {
        slideSpeed ||= state.speed;
        slidePeak = Math.max(slidePeak, Math.abs(slip));
      }
      if (
        (slidePeak > 0.8 && state.speed < slideSpeed * 0.4) ||
        (state.speed > 3 && Math.abs(slip) > Math.PI / 2)
      ) {
        run.failure = 'spin';
        break;
      }
      if (dirt > 2) {
        run.failure = 'off-track';
        break;
      }
      if (stuck > 10) {
        run.failure = 'stuck';
        break;
      }
      if (laps.lap !== lastLap) {
        if (lastLap > 0 && laps.last !== null) run.laps.push(laps.last);
        lastLap = laps.lap;
      }
      // Lap validity is about cutting corners, not drifting; dirt is scored separately.
      if (run.distance >= lapCount * map.length) {
        run.failure = null;
        break;
      }
    }
  } finally {
    physics.dispose();
  }
  run.meanAngle = driftSeconds ? angleSum / driftSeconds : 0;
  run.yawError = driftSeconds ? Math.sqrt(yawErrorSum / driftSeconds) : 0;
  run.steeringEffort /= Math.max(run.seconds, 1);
  return run;
}
