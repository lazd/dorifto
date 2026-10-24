import * as THREE from 'three';
import type AmmoFactory from 'ammojs-typed';
import {
  createVehiclePhysics,
  createPhysicsResources,
  createPhysicsWorld,
  type PhysicsCar,
  type PhysicsControls,
} from './vehicle-physics';
import { createConePhysics } from './cone-physics';
import { createTurnSignPhysics } from './turn-sign-physics';
import { vehicleDimensions } from './car-geometry';
import {
  createDrivingMap,
  createBot,
  validateRaceBotOptions,
  raceBotConfiguration,
  raceGridSpawn,
  maxRaceBots,
  botEdgeMargin,
  type DrivingMap,
  type BotPreset,
} from './race-bot';
import { LapTimer } from './laps';
import { createRaceStandings } from './race-standings';
import { TerrainSurface, heightAt, normalAt } from './terrain-query';
import {
  RunRecording,
  captureCarPose,
  createReplayFrame,
  frameStride,
  sampleSteps,
  writeFrame,
} from './lap-recording';
import {
  physicsStep,
  raceStartDelay,
  poseStride,
  snapshotStride,
  vehiclePoseCount,
  type LapState,
  type PhysicsInit,
  type PhysicsInput,
  type PhysicsRecord,
  type PhysicsRequest,
  type PhysicsSnapshot,
  type PoseData,
} from './physics-messages';

function createPose(data: PoseData) {
  const object = new THREE.Object3D();
  object.position.fromArray(data.position);
  object.quaternion.fromArray(data.quaternion);
  return object;
}

function lapState(laps: LapTimer): LapState {
  const { lap, invalid, current, last, best, lastCones, elapsedTime, lapStartedAt, conesHit } =
    laps;
  return { lap, invalid, current, last, best, lastCones, elapsedTime, lapStartedAt, conesHit };
}

export function createPhysicsSimulation(Ammo: typeof AmmoFactory, data: PhysicsInit) {
  const botsOnly = data.botsOnly ?? false;
  if (botsOnly && !data.bots?.length) throw new Error('Bots-only mode requires at least one bot');
  if ((data.bots?.length ?? 0) > maxRaceBots)
    throw new Error(`At most ${maxRaceBots} race bots are supported`);
  data.bots?.forEach(validateRaceBotOptions);
  let configuration = data.configuration;
  let controls: PhysicsControls = {
    throttle: 0,
    brake: 0,
    reverse: 0,
    steer: 0,
    handbrake: false,
  };
  let hazards = false;
  let hazardsEnabled = false;
  const car: PhysicsCar = {
    chassis: new THREE.Object3D(),
    wheels: Array.from({ length: 4 }, () => new THREE.Object3D()),
    hubs: Array.from({ length: 4 }, () => new THREE.Object3D()),
    centers: data.car.centers.map((center) => new THREE.Vector3().fromArray(center)),
    radii: data.car.radii,
    widths: data.car.widths,
    collisionVertices: data.car.collisionVertices.map((point) =>
      new THREE.Vector3().fromArray(point),
    ),
    setBraking() {},
    setReversing() {},
    setHazards(value, enabled = value) {
      hazards = value;
      hazardsEnabled = enabled;
    },
  };
  const cones = data.cones.map(createPose);
  const groups = data.signGroups.map(({ visible, poses }) => {
    const group = new THREE.Group();
    group.visible = visible;
    for (const pose of poses) group.add(createPose(pose));
    return group;
  });
  const surface = new TerrainSurface(
    data.terrain.segments,
    data.terrain.halfWidth,
    data.terrain.padRadius,
  );
  let laps = new LapTimer(data.definition);
  const resources = createPhysicsResources(Ammo);
  const course = {
    terrain: {
      ...data.terrain,
      heightAt: (x: number, z: number) => heightAt(data.terrain, x, z),
      normalAt: (x: number, z: number) => normalAt(data.terrain, x, z),
    },
    isAsphalt: (position: THREE.Vector3) => surface.isAsphalt(position),
  };
  const dimensions = vehicleDimensions(car);
  // Each preset has its own edge margin, so maps are built (and shared) per preset.
  let drivingMaps = new Map<BotPreset, DrivingMap>();
  let mapDefinition = data.definition;
  const drivingMap = (preset: BotPreset) => {
    let map = drivingMaps.get(preset);
    if (!map) {
      map = createDrivingMap(
        mapDefinition,
        course.terrain,
        dimensions.halfWidth,
        botEdgeMargin(preset),
      );
      drivingMaps.set(preset, map);
    }
    return map;
  };
  const simulationWorld = createPhysicsWorld(Ammo, resources, data.terrain);
  const playerPhysics = botsOnly
    ? null
    : createVehiclePhysics({
        Ammo,
        resources,
        simulationWorld,
        car,
        controls,
        configurationState: { getState: () => configuration },
        course,
        spawn: raceGridSpawn(data.definition, data.bots?.length ?? 0),
        laps,
      });
  const bots = (data.bots ?? []).map((options, index) => {
    const botCar: PhysicsCar =
      botsOnly && index === 0
        ? car
        : {
            ...car,
            chassis: new THREE.Object3D(),
            wheels: Array.from({ length: 4 }, () => new THREE.Object3D()),
            hubs: Array.from({ length: 4 }, () => new THREE.Object3D()),
            setHazards() {},
          };
    const preset = options.preset ?? 'grip-fast';
    const botConfiguration = raceBotConfiguration(configuration, preset);
    const bot = createBot(drivingMap(preset), botConfiguration, dimensions, options);
    const botControls = { ...bot.controls };
    const botLaps = botsOnly && index === 0 ? laps : new LapTimer(data.definition);
    const vehicle = createVehiclePhysics({
      Ammo,
      resources,
      simulationWorld,
      car: botCar,
      controls: botControls,
      course,
      configurationState: { getState: () => botConfiguration },
      spawn: raceGridSpawn(data.definition, index),
      laps: botLaps,
    });
    return {
      car: botCar,
      bot,
      controls: botControls,
      laps: botLaps,
      physics: vehicle,
      options,
      previousVelocity: new THREE.Vector3(),
    };
  });
  const physics = playerPhysics ?? bots[0].physics;
  if (botsOnly) controls = bots[0].controls;
  const vehicles = [...(playerPhysics ? [playerPhysics] : []), ...bots.map((bot) => bot.physics)];
  let settlingTime = 0;
  function createStandings() {
    return vehicles.length > 1
      ? createRaceStandings(mapDefinition, [
          ...(playerPhysics ? [{ position: car.chassis.position, laps }] : []),
          ...bots.map((bot) => ({ position: bot.car.chassis.position, laps: bot.laps })),
        ])
      : null;
  }
  let raceStandings = createStandings();
  const objects = [
    car.chassis,
    ...car.wheels,
    ...car.hubs,
    ...bots.slice(botsOnly ? 1 : 0).flatMap(({ car }) => [car.chassis, ...car.wheels, ...car.hubs]),
    ...cones,
    ...groups.flatMap((group) => group.children),
  ];
  const liveVehiclePoseCount = vehiclePoseCount * vehicles.length;
  const impacts: PhysicsSnapshot['impacts'] = [];
  const conePhysics = physics.addPlugin((context) =>
    createConePhysics(context, {
      course: { cones, cornerCones: data.cornerCones.map((index) => cones[index]) },
      audio: {
        hitCone(impulse) {
          impacts.push({ type: 'cone', impulse });
        },
      },
    }),
  );
  physics.addPlugin((context) =>
    createTurnSignPhysics(context, groups, {
      hitTurnSign(impulse) {
        impacts.push({ type: 'sign', impulse });
      },
    }),
  );
  const previous = new Float32Array(objects.length * poseStride);
  const current = new Float32Array(previous.length);
  const sent = new Float32Array(previous.length);
  const previousVelocity = new THREE.Vector3();
  let accumulator = 0;
  let recordingSteps = 0;
  let replay: { recording: RunRecording; time: number } | null = null;
  const replayBefore = createReplayFrame();
  const replayAfter = createReplayFrame();
  const recordFrame = createReplayFrame();
  const buffers: ArrayBuffer[] = [];
  let forceSnapshot = true;

  function capture(snap: boolean, replaying = false) {
    previous.set(current);
    if (replaying) physics.captureReplayVisuals();
    else for (const vehicle of vehicles) vehicle.captureVisuals(snap);
    objects.forEach((object, i) => {
      object.position.toArray(current, i * poseStride);
      object.quaternion.toArray(current, i * poseStride + 3);
    });
    if (snap) previous.set(current);
  }

  function applyInput(input: PhysicsInput) {
    configuration = input.configuration;
    if (!botsOnly) Object.assign(controls, input.controls);
    conePhysics.setEnabled(configuration.coneMode !== 'off', configuration.coneMode === 'corners');
    groups.forEach((group, i) => {
      group.visible = input.signs[i];
    });
  }

  function reset() {
    settlingTime = bots.length ? raceStartDelay : 0;
    accumulator = recordingSteps = 0;
    replay = null;
    impacts.length = 0;
    for (const bot of bots) {
      bot.physics.setEnabled(true);
      bot.bot.reset();
      bot.previousVelocity.set(0, 0, 0);
    }
    for (const vehicle of vehicles) vehicle.reset();
    previousVelocity.set(0, 0, 0);
    capture(true);
    raceStandings?.reset();
    forceSnapshot = true;
  }

  conePhysics.setEnabled(configuration.coneMode !== 'off', configuration.coneMode === 'corners');
  reset();

  function handle(request: PhysicsRequest): PhysicsSnapshot {
    let duration = 0;
    const records: PhysicsRecord[] = [];
    let standings: PhysicsSnapshot['standings'];
    if (request.type !== 'init') applyInput(request.input);
    if (request.type === 'advance') {
      buffers.push(...request.recycled);
      accumulator = Math.min(accumulator + request.dt, 0.05 + physicsStep);
      while (accumulator >= physicsStep) {
        duration += physicsStep;
        previousVelocity.copy(physics.simulationVelocity);
        if (replay) {
          replay.recording.read(replay.time, replayBefore);
          replay.time += physicsStep;
          replay.recording.read(replay.time, replayAfter);
          physics.stepReplay(replayBefore, replayAfter, physicsStep);
          capture(false, true);
        } else {
          const startHeld = settlingTime > 1e-9;
          if (startHeld) {
            for (const bot of bots)
              Object.assign(bot.controls, {
                throttle: 0.6,
                brake: 1,
                reverse: 0,
                steer: 0,
                handbrake: false,
              });
          } else if (bots.length) {
            const states = vehicles.map((vehicle) => vehicle.readState());
            bots.forEach((bot, index) => {
              bot.previousVelocity.copy(bot.physics.simulationVelocity);
              const stateIndex = index + (botsOnly ? 0 : 1);
              Object.assign(
                bot.controls,
                bot.bot.update(
                  states[stateIndex],
                  physicsStep,
                  states,
                  raceStandings?.position(stateIndex) ?? null,
                ),
              );
            });
          }
          for (const vehicle of vehicles) vehicle.beforeStep(startHeld);
          simulationWorld.step(physicsStep);
          for (const vehicle of vehicles) vehicle.afterStep(startHeld);
          capture(false);
          if (startHeld) {
            settlingTime = Math.max(0, settlingTime - physicsStep);
            if (settlingTime <= 1e-9) raceStandings?.reset();
          } else standings = raceStandings?.update(physicsStep) ?? standings;
          if (!physics.spawnBrakeHeld) {
            const record: PhysicsRecord = { laps: lapState(laps) };
            if (recordingSteps++ % sampleSteps === 0) {
              captureCarPose(recordFrame, car.chassis, car.hubs, physics.tireAngles);
              Object.assign(recordFrame, physics.engine, request.input.lights, {
                steering: physics.steering,
                braking: !physics.reversing && controls.brake > 0,
                reversing: physics.reversing,
                handbrake: controls.handbrake,
                burnout:
                  physics.burnout > 0.1 && (physics.wheelContacts[2] || physics.wheelContacts[3]),
              });
              recordFrame.contacts = physics.wheelContacts;
              recordFrame.tires = physics.tireSounds;
              record.sample = new Float32Array(frameStride);
              writeFrame(record.sample, 0, recordFrame);
            }
            records.push(record);
          }
        }
        accumulator -= physicsStep;
      }
    } else if (request.type === 'reset') {
      reset();
    } else if (request.type === 'direction') {
      laps = new LapTimer(request.definition);
      physics.setCourseDirection(
        raceGridSpawn(request.definition, botsOnly ? 0 : bots.length),
        laps,
      );
      drivingMaps = new Map();
      mapDefinition = request.definition;
      bots.forEach((bot, index) => {
        bot.laps = botsOnly && index === 0 ? laps : new LapTimer(request.definition);
        bot.physics.setCourseDirection(raceGridSpawn(request.definition, index), bot.laps);
        const preset = bot.options.preset ?? 'grip-fast';
        bot.bot = createBot(
          drivingMap(preset),
          raceBotConfiguration(configuration, preset),
          dimensions,
          bot.options,
        );
      });
      raceStandings = createStandings();
      reset();
    } else if (request.type === 'replay') {
      reset();
      for (const bot of bots) if (bot.physics !== physics) bot.physics.setEnabled(false);
      const { firstTime, interval, data, count } = request.recording;
      replay = {
        recording: new RunRecording(firstTime, interval, data, count),
        time: request.time,
      };
    } else if (request.type === 'snap') {
      accumulator = 0;
      capture(true, replay !== null);
      previousVelocity.copy(physics.simulationVelocity);
      forceSnapshot = true;
    }

    const buffer =
      buffers.pop() ??
      new ArrayBuffer(objects.length * snapshotStride * Float32Array.BYTES_PER_ELEMENT);
    const poses = new Float32Array(buffer);
    let count = 0;
    objects.forEach((_object, index) => {
      const offset = index * poseStride;
      let changed = forceSnapshot || index < liveVehiclePoseCount;
      for (let i = 0; !changed && i < poseStride; i++) {
        changed =
          current[offset + i] !== previous[offset + i] || current[offset + i] !== sent[offset + i];
      }
      if (!changed) return;
      const target = count++ * snapshotStride;
      poses[target] = index;
      poses.set(previous.subarray(offset, offset + poseStride), target + 1);
      poses.set(current.subarray(offset, offset + poseStride), target + 1 + poseStride);
    });
    sent.set(current);
    forceSnapshot = false;
    return {
      type: 'snapshot',
      revision: request.revision,
      buffer,
      count,
      alpha: accumulator / physicsStep,
      duration,
      replayTime: replay?.time ?? null,
      telemetry: {
        motion: physics.readState(),
        tires: physics.tireContacts.map((tire, index) => ({
          slipAngle: tire.slipAngle,
          slipRatio:
            (physics.tireSpeeds[index] * car.radii[index] - tire.along) /
            Math.max(Math.abs(tire.along), 4),
          load: tire.load,
          capacity: tire.capacity,
          longitudinalForce: tire.longitudinalForce,
          lateralForce: tire.lateralForce,
        })),
        engine: { ...physics.engine },
        steering: physics.steering,
        burnout: physics.burnout,
        brakestand: physics.brakestand,
        reversing: physics.reversing,
        spawnBrakeHeld: physics.spawnBrakeHeld,
        braking: physics.spawnBrakeHeld || (!physics.reversing && controls.brake > 0),
        hazards,
        hazardsEnabled,
        wheelContacts: [...physics.wheelContacts],
        tireSounds: physics.tireSounds.map((tire) => ({ ...tire })),
        velocity: physics.simulationVelocity.toArray(),
        previousVelocity: previousVelocity.toArray(),
      },
      laps: lapState(laps),
      standings,
      bots: bots.map((bot) => ({
        laps: lapState(bot.laps),
        metrics: bot.bot.metrics,
        thinking:
          settlingTime > 1e-9 ? { ...bot.bot.thinking, phase: 'settling' } : bot.bot.thinking,
        engine: { ...bot.physics.engine },
        tireSounds: bot.physics.tireSounds.map((tire) => ({ ...tire })),
        wheelContacts: [...bot.physics.wheelContacts],
        burnout: bot.physics.burnout,
        braking: bot.physics.spawnBrakeHeld || (!bot.physics.reversing && bot.controls.brake > 0),
        steering: bot.physics.steering,
        reversing: bot.physics.reversing,
        spawnBrakeHeld: bot.physics.spawnBrakeHeld,
        brakestand: bot.physics.brakestand,
        velocity: bot.physics.simulationVelocity.toArray(),
        previousVelocity: bot.previousVelocity.toArray(),
      })),
      records,
      impacts: impacts.splice(0),
    };
  }

  return {
    handle,
    dispose() {
      for (const vehicle of vehicles) vehicle.dispose();
      simulationWorld.dispose();
    },
  };
}
