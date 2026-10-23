import * as THREE from 'three';
import type { loadCar } from './car';
import type { createCourse } from './course';
import type { CourseDefinition, courseSpawn } from './courses';
import type { DrivingControls } from './controls';
import type { VehicleAudio } from './audio';
import type { ConfigurationState } from './configuration-state';
import type { Store } from './store';
import type { RunRecording } from './lap-recording';
import { idleRpm } from './drivetrain';
import {
  createPhysicsInit,
  emptyLapState,
  physicsStep,
  poseStride,
  replayData,
  snapshotStride,
  vehiclePoseCount,
  type PhysicsCommand,
  type PhysicsInput,
  type PhysicsRecord,
  type PhysicsResponse,
  type PhysicsSnapshot,
  type PhysicsTelemetry,
} from './physics-messages';

/** Most simulation time per request (the worker's own cap); stalls beyond it are dropped. */
const maxRequestTime = 0.05;
/** Beyond this the drawn pose holds rather than extrapolating further past the newest tick. */
const maxExtrapolation = 0.05;

interface PhysicsClientOptions {
  car: Awaited<ReturnType<typeof loadCar>>;
  course: ReturnType<typeof createCourse>;
  definition: CourseDefinition;
  controls: DrivingControls;
  configurationState: Store<ConfigurationState>;
  audio: Pick<VehicleAudio, 'hitCone' | 'hitTurnSign'>;
  lights(): PhysicsInput['lights'];
  onError(error: Error): void;
}

export function createPhysicsClient({
  car,
  course,
  definition,
  controls,
  configurationState,
  audio,
  lights,
  onError,
}: PhysicsClientOptions) {
  const worker = new Worker(new URL('./physics-worker.ts', import.meta.url), { type: 'module' });
  const objects = [
    car.chassis,
    ...car.wheels,
    ...car.hubs,
    ...course.cones,
    ...course.turnSignGroups.flatMap((group) => group.children),
  ];
  const previous = new Float32Array(objects.length * poseStride);
  const current = new Float32Array(previous.length);
  const laps = emptyLapState();
  const velocity = new THREE.Vector3();
  const linearVelocity = new THREE.Vector3();
  const beforeVelocity = new THREE.Vector3();
  const afterVelocity = new THREE.Vector3();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  let telemetry: PhysicsTelemetry = {
    engine: {
      rpm: idleRpm,
      gear: 1,
      throttle: 0,
      load: 0,
      boost: 0,
      shifting: false,
      limiterCut: false,
    },
    steering: 0,
    burnout: 0,
    brakestand: false,
    reversing: false,
    spawnBrakeHeld: true,
    braking: true,
    hazards: false,
    hazardsEnabled: false,
    wheelContacts: [false, false, false, false],
    tireSounds: Array.from({ length: 4 }, () => ({ slip: 0, speed: 0, load: 0 })),
    velocity: [0, 0, 0],
    previousVelocity: [0, 0, 0],
  };
  let revision = 0;
  let pendingResponses = 0;
  let disposed = false;
  let failed = false;
  let initialized = false;
  let resetting = false;
  // Simulation-time clocks. Requests run the worker one frame ahead of render time so the next
  // frame normally interpolates between delivered ticks instead of extrapolating past them.
  let sentTime = 0;
  let renderTime = 0;
  let currentTickTime = 0;
  const requestTimes: number[] = [];
  let replayTime: number | null = null;
  let records: PhysicsRecord[] = [];
  const recycled: ArrayBuffer[] = [];
  let resolveReady: () => void;
  let rejectReady: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  function input(): PhysicsInput {
    const { driveMode, profiles, coneMode } = configurationState.getState();
    return {
      controls: {
        throttle: controls.throttle,
        brake: controls.brake,
        reverse: controls.reverse,
        steer: controls.steer,
        handbrake: controls.handbrake,
      },
      configuration: { driveMode, profiles, coneMode },
      signs: course.turnSignGroups.map((group) => group.visible),
      lights: lights(),
    };
  }

  function send(command: PhysicsCommand, transfer: Transferable[] = []) {
    if (disposed || failed) return;
    pendingResponses++;
    requestTimes.push(sentTime);
    worker.postMessage({ ...command, revision }, transfer);
  }

  function fail(error: Error) {
    if (disposed || failed) return;
    failed = true;
    worker.terminate();
    if (!initialized) rejectReady(error);
    else onError(error);
  }

  function accept(snapshot: PhysicsSnapshot, endTime: number) {
    previous.set(current);
    const data = new Float32Array(snapshot.buffer);
    for (let i = 0; i < snapshot.count; i++) {
      const source = i * snapshotStride;
      const target = data[source] * poseStride;
      previous.set(data.subarray(source + 1, source + 1 + poseStride), target);
      current.set(data.subarray(source + 1 + poseStride, source + snapshotStride), target);
    }
    recycled.push(snapshot.buffer);
    telemetry = snapshot.telemetry;
    beforeVelocity.fromArray(telemetry.previousVelocity);
    afterVelocity.fromArray(telemetry.velocity);
    Object.assign(laps, snapshot.laps);
    records.push(...snapshot.records);
    currentTickTime = endTime - snapshot.alpha * physicsStep;
    replayTime = snapshot.replayTime;
    resetting = false;
    for (const impact of snapshot.impacts) {
      if (impact.type === 'cone') audio.hitCone(impact.impulse);
      else audio.hitTurnSign(impact.impulse);
    }
    if (!initialized) {
      initialized = true;
      interpolate(1);
      resolveReady();
    }
  }

  worker.onmessage = ({ data }: MessageEvent<PhysicsResponse>) => {
    if (disposed || failed) return;
    pendingResponses--;
    const endTime = requestTimes.shift() ?? sentTime;
    if (data.type === 'error') {
      const error = new Error(`Physics worker: ${data.message}`);
      if (data.stack) error.stack = data.stack;
      fail(error);
      return;
    }
    if (data.revision !== revision) {
      recycled.push(data.buffer);
      return;
    }
    accept(data, endTime);
  };
  worker.onerror = (event) => {
    event.preventDefault();
    fail(new Error(`Physics worker failed: ${event.message}`));
  };
  worker.onmessageerror = () => fail(new Error('Unable to deserialize a physics worker message'));

  const data = createPhysicsInit(definition, car, course, input().configuration);
  send({ type: 'init', data });

  function invalidate() {
    revision++;
    renderTime = currentTickTime = sentTime;
    records = [];
    resetting = true;
    Object.assign(laps, emptyLapState());
  }

  function interpolate(alpha = interpolationAlpha(), replayOnly = false) {
    objects.forEach((object, index) => {
      if (replayOnly && index < vehiclePoseCount) return;
      // Invisible props retain their last pose until their next activation snapshot.
      if (!object.visible) return;
      const offset = index * poseStride;
      object.position.fromArray(previous, offset);
      position.fromArray(current, offset);
      object.position.lerp(position, alpha);
      object.quaternion.fromArray(previous, offset + 3);
      quaternion.fromArray(current, offset + 3);
      object.quaternion.slerp(quaternion, alpha);
    });
    if (!replayOnly) {
      car.setBraking(telemetry.braking);
      car.setReversing(telemetry.reversing);
      car.setHazards(telemetry.hazards, telemetry.hazardsEnabled);
    }
    linearVelocity.lerpVectors(beforeVelocity, afterVelocity, Math.min(alpha, 1));
    return velocity.copy(linearVelocity).setY(0);
  }

  /**
   * Places the render clock between the snapshot's two ticks. Past the newest tick (the reply for
   * this frame's time is still in flight) poses extrapolate along the last tick's motion, so the
   * drawn time never depends on when the worker's message happened to arrive.
   */
  function interpolationAlpha() {
    return THREE.MathUtils.clamp(
      1 + (renderTime - currentTickTime) / physicsStep,
      0,
      1 + maxExtrapolation / physicsStep,
    );
  }

  return {
    ready,
    laps,
    fixedStep: physicsStep,
    advance(dt: number) {
      if (disposed || failed) return;
      renderTime += dt;
      if (pendingResponses) return;
      let request = renderTime + dt - sentTime;
      if (request > maxRequestTime) {
        renderTime -= request - maxRequestTime;
        request = maxRequestTime;
      }
      if (request <= 0) return;
      const buffers = recycled.splice(0);
      sentTime += request;
      send({ type: 'advance', dt: request, input: input(), recycled: buffers }, buffers);
    },
    takeRecords() {
      const result = records;
      records = [];
      return result;
    },
    reset() {
      invalidate();
      telemetry = {
        ...telemetry,
        spawnBrakeHeld: true,
        reversing: false,
        braking: true,
        hazards: false,
        hazardsEnabled: false,
      };
      car.setBraking(true);
      car.setReversing(false);
      car.setHazards(false);
      replayTime = null;
      send({ type: 'reset', input: input() });
    },
    setCourseDirection(spawn: ReturnType<typeof courseSpawn>, definition: CourseDefinition) {
      invalidate();
      send({ type: 'direction', spawn, definition, input: input() });
    },
    startReplay(recording: RunRecording, time: number) {
      invalidate();
      replayTime = time;
      const data = replayData(recording);
      send({ type: 'replay', recording: data, time, input: input() }, [data.data.buffer]);
    },
    captureVisuals(_snap = true) {
      renderTime = currentTickTime = sentTime;
      send({ type: 'snap', input: input() });
    },
    interpolate,
    interpolateReplay() {
      interpolate(interpolationAlpha(), true);
    },
    interpolationAlpha,
    setCones(enabled: boolean, onlyCorners = false) {
      const corners = new Set(course.cornerCones);
      course.cones.forEach((cone) => {
        cone.visible = enabled && (!onlyCorners || corners.has(cone));
      });
    },
    dispose() {
      disposed = true;
      worker.terminate();
      recycled.length = 0;
      records = [];
    },
    get engine() {
      return telemetry.engine;
    },
    get burnout() {
      return telemetry.burnout;
    },
    get steering() {
      return telemetry.steering;
    },
    get reversing() {
      return telemetry.reversing;
    },
    get spawnBrakeHeld() {
      return telemetry.spawnBrakeHeld;
    },
    get linearVelocity() {
      return linearVelocity;
    },
    get brakestand() {
      return telemetry.brakestand;
    },
    get wheelContacts() {
      return telemetry.wheelContacts;
    },
    get tireSounds() {
      return telemetry.tireSounds;
    },
    get replayTime() {
      return replayTime;
    },
    get resetting() {
      return resetting;
    },
  };
}
