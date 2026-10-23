import * as THREE from 'three';
import type AmmoFactory from 'ammojs-typed';
import { courseSpawn, type CourseDefinition } from './courses';
import { LapTimer } from './laps';
import { vehicleDimensions } from './car-geometry';
import {
  createVehiclePhysics,
  createPhysicsResources,
  type PhysicsCar,
  type PhysicsConfiguration,
} from './vehicle-physics';
import {
  createDrivingMap,
  createRaceBot,
  raceBotTunings,
  type RaceBotOptions,
  type RaceExperience,
  type VehicleState,
} from './race-bot';
import { physicsStep } from './physics-messages';
import type { CourseTerrain } from './terrain';

export interface TrainingRun {
  run: number;
  completed: boolean;
  failure: 'timeout' | 'stuck' | 'off-track' | 'spin' | null;
  laps: { time: number; valid: boolean; offTrackSeconds: number }[];
  metrics: ReturnType<typeof createRaceBot>['metrics'];
}

export function trainRaceBot(
  Ammo: typeof AmmoFactory,
  definition: CourseDefinition,
  terrain: CourseTerrain,
  geometry: Pick<PhysicsCar, 'centers' | 'radii' | 'widths' | 'collisionVertices'>,
  configuration: PhysicsConfiguration,
  options: RaceBotOptions,
  runs: number,
  saved?: RaceExperience,
  {
    maxSeconds = 600,
    laps: lapCount = 3,
    onStep,
  }: {
    maxSeconds?: number;
    laps?: number;
    onStep?: (state: VehicleState, bot: ReturnType<typeof createRaceBot>) => void;
  } = {},
) {
  if (!Number.isInteger(runs) || runs < 1 || runs > 100)
    throw new Error('Training runs must be an integer from 1 to 100');
  if (!Number.isFinite(maxSeconds) || maxSeconds <= 0) throw new Error('Invalid training timeout');
  const dimensions = vehicleDimensions(geometry);
  const { edgeMargin } = raceBotTunings[options.preset ?? 'grip-fast'];
  const map = createDrivingMap(definition, terrain, dimensions.halfWidth, edgeMargin);
  const bot = createRaceBot(map, configuration, dimensions, options, saved);
  const car: PhysicsCar = {
    ...geometry,
    chassis: new THREE.Object3D(),
    wheels: Array.from({ length: 4 }, () => new THREE.Object3D()),
    hubs: Array.from({ length: 4 }, () => new THREE.Object3D()),
    setBraking() {},
    setReversing() {},
    setHazards() {},
  };
  const laps = new LapTimer(definition);
  const physics = createVehiclePhysics({
    Ammo,
    resources: createPhysicsResources(Ammo),
    car,
    course: { terrain, isAsphalt: (position) => terrain.isAsphalt(position) },
    spawn: courseSpawn(definition),
    controls: bot.controls,
    laps,
    configurationState: { getState: () => configuration },
  });
  const results: TrainingRun[] = [];
  try {
    for (let run = 1; run <= runs; run++) {
      physics.reset();
      bot.reset();
      const times: TrainingRun['laps'] = [];
      let lastLap = 0;
      let lapOffTrack = 0;
      let offTrack = 0;
      let stuck = 0;
      // Speed when the current slide began and its peak slip angle; 0 when not sliding.
      let slideSpeed = 0;
      let slidePeak = 0;
      let failure: TrainingRun['failure'] = 'timeout';
      for (let step = 0; step < maxSeconds / physicsStep; step++) {
        const state = physics.readState();
        bot.update(state, physicsStep);
        onStep?.(state, bot);
        const wasInvalid = laps.invalid;
        const lapTime = laps.current;
        physics.step();
        const metrics = bot.metrics;
        offTrack =
          Math.abs(metrics.lateralError) > definition.width / 2 ? offTrack + physicsStep : 0;
        stuck = state.speed < 0.5 ? stuck + physicsStep : 0;
        const slip = Math.abs(state.slipAngle);
        if (slip < 0.3 || state.speed < 1) slideSpeed = slidePeak = 0;
        else {
          slideSpeed ||= state.speed;
          slidePeak = Math.max(slidePeak, slip);
        }
        // Slides are fine; a spin is one past ~45° that scrubs off most of its speed, or any
        // slide past sideways.
        const spun =
          (slidePeak > 0.8 && state.speed < slideSpeed * 0.4) ||
          (state.speed > 3 && slip > Math.PI / 2);
        if (offTrack > 3) {
          failure = 'off-track';
          break;
        }
        if (stuck > 15) {
          failure = 'stuck';
          break;
        }
        if (spun) {
          failure = 'spin';
          break;
        }
        // The game's track-limit rule voids a lap (without counting it) once all four tires
        // leave the asphalt; invalid laps are reported so training cannot hide them.
        const invalidCrossing = wasInvalid && !laps.invalid;
        if (laps.lap !== lastLap || invalidCrossing) {
          if (lastLap > 0) {
            const seconds = metrics.offTrackSeconds - lapOffTrack;
            times.push({
              time: invalidCrossing ? lapTime + physicsStep : (laps.last ?? 0),
              valid: !invalidCrossing,
              offTrackSeconds: seconds,
            });
          }
          lastLap = laps.lap;
          lapOffTrack = metrics.offTrackSeconds;
          if (times.length === lapCount) {
            failure = null;
            break;
          }
        }
      }
      bot.finishRun();
      results.push({
        run,
        completed: times.length === lapCount,
        failure,
        laps: times,
        metrics: bot.metrics,
      });
    }
    return {
      version: 1,
      course: definition,
      configuration,
      options,
      timedLapsPerRun: 3,
      environment: 'Solo vehicle; actual terrain and vehicle geometry; no cones or traffic',
      runs: results,
      experience: bot.exportExperience(),
    };
  } finally {
    physics.dispose();
  }
}
