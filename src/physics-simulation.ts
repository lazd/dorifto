import * as THREE from 'three';
import type AmmoFactory from 'ammojs-typed';
import {
  createVehiclePhysics,
  createPhysicsResources,
  type PhysicsCar,
  type PhysicsControls,
} from './vehicle-physics';
import { createConePhysics } from './cone-physics';
import { createTurnSignPhysics } from './turn-sign-physics';
import { courseSpawn } from './courses';
import { LapTimer } from './laps';
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
  let configuration = data.configuration;
  const controls: PhysicsControls = {
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
  const objects = [
    car.chassis,
    ...car.wheels,
    ...car.hubs,
    ...cones,
    ...groups.flatMap((group) => group.children),
  ];
  const surface = new TerrainSurface(
    data.terrain.segments,
    data.terrain.halfWidth,
    data.terrain.padRadius,
  );
  let laps = new LapTimer(data.definition);
  const physics = createVehiclePhysics({
    Ammo,
    resources: createPhysicsResources(Ammo),
    car,
    controls,
    configurationState: { getState: () => configuration },
    course: {
      terrain: {
        ...data.terrain,
        heightAt: (x, z) => heightAt(data.terrain, x, z),
        normalAt: (x, z) => normalAt(data.terrain, x, z),
      },
      isAsphalt: (position) => surface.isAsphalt(position),
    },
    spawn: courseSpawn(data.definition),
    laps,
  });
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
    else physics.captureVisuals(snap);
    objects.forEach((object, i) => {
      object.position.toArray(current, i * poseStride);
      object.quaternion.toArray(current, i * poseStride + 3);
    });
    if (snap) previous.set(current);
  }

  function applyInput(input: PhysicsInput) {
    configuration = input.configuration;
    Object.assign(controls, input.controls);
    conePhysics.setEnabled(configuration.coneMode !== 'off', configuration.coneMode === 'corners');
    groups.forEach((group, i) => {
      group.visible = input.signs[i];
    });
  }

  function reset() {
    accumulator = recordingSteps = 0;
    replay = null;
    impacts.length = 0;
    physics.reset();
    previousVelocity.set(0, 0, 0);
    capture(true);
    forceSnapshot = true;
  }

  conePhysics.setEnabled(configuration.coneMode !== 'off', configuration.coneMode === 'corners');
  reset();

  function handle(request: PhysicsRequest): PhysicsSnapshot {
    const records: PhysicsRecord[] = [];
    if (request.type !== 'init') applyInput(request.input);
    if (request.type === 'advance') {
      buffers.push(...request.recycled);
      accumulator = Math.min(accumulator + request.dt, 0.05 + physicsStep);
      while (accumulator >= physicsStep) {
        previousVelocity.copy(physics.simulationVelocity);
        if (replay) {
          replay.recording.read(replay.time, replayBefore);
          replay.time += physicsStep;
          replay.recording.read(replay.time, replayAfter);
          physics.stepReplay(replayBefore, replayAfter, physicsStep);
          capture(false, true);
        } else {
          physics.step();
          capture(false);
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
      physics.setCourseDirection(request.spawn, laps);
      reset();
    } else if (request.type === 'replay') {
      reset();
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
      let changed = forceSnapshot || index < vehiclePoseCount;
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
      replayTime: replay?.time ?? null,
      telemetry: {
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
      records,
      impacts: impacts.splice(0),
    };
  }

  return { handle, dispose: physics.dispose };
}
