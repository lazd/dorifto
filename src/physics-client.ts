import * as THREE from 'three';
import { carPaintColor, carUnderglowColor, type loadCar } from './car';
import type { createCourse } from './course';
import type { CourseDefinition, courseSpawn } from './courses';
import type { DrivingControls } from './controls';
import type { VehicleAudio, OpponentSoundState } from './audio';
import { createTireEffects } from './tire-effects';
import type { ConfigurationState } from './configuration-state';
import type { Store } from './store';
import { applyCarPose, createReplayFrame, type RunRecording } from './lap-recording';
import { idleRpm } from './drivetrain';
import { botColor, botName, createBotCar } from './bot-car';
import { createBotPlate } from './bot-plate';
import type { RaceBotOptions } from './race-bot';
import type { RaceStanding } from './race-standings';
import type { RaceOptions } from './race-rules';
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
  race?: RaceOptions;
  botsOnly?: boolean;
  bots?: RaceBotOptions[];
  observedBot?: number;
  car: Awaited<ReturnType<typeof loadCar>>;
  course: ReturnType<typeof createCourse>;
  definition: CourseDefinition;
  controls: DrivingControls;
  configurationState: Store<ConfigurationState>;
  audio: Pick<VehicleAudio, 'hitCone' | 'hitTurnSign'>;
  lights(): PhysicsInput['lights'];
  onError(error: Error): void;
  onStartupProgress?(stage: string, fraction: number): void;
}

export function createPhysicsClient({
  race,
  car,
  course,
  definition,
  controls,
  configurationState,
  audio,
  lights,
  onError,
  onStartupProgress,
  bots = [],
  botsOnly = false,
  observedBot = 0,
}: PhysicsClientOptions) {
  const botOffset = botsOnly ? 1 : 0;
  const botCars = bots
    .slice(botOffset)
    .map((_options, index) => createBotCar(car, index + botOffset));
  const observedPlate = botsOnly ? createBotPlate(car.chassis) : null;
  const botEffects = botCars.map((bot) => {
    const scene = car.chassis.parent;
    if (!(scene instanceof THREE.Scene)) throw new Error('Bot effects require a scene');
    return createTireEffects(
      scene,
      { ...bot, widths: car.widths },
      course.terrain,
      course.isAsphalt,
    );
  });
  const groundHeight = (x: number, z: number) => course.terrain.heightAt(x, z);
  let botTelemetry: PhysicsSnapshot['bots'] = [];
  const botVelocity = botCars.map(() => new THREE.Vector3());
  const listenerRight = new THREE.Vector3();
  const listenerPosition = new THREE.Vector3();
  const soundOffset = new THREE.Vector3();
  const botSounds: OpponentSoundState[] = [];
  const markerCars = [...(botsOnly ? [car] : []), ...botCars];
  const botColors = markerCars.map((_car, index) => botColor(index));
  const raceEntrants = [
    ...(botsOnly ? [] : [{ name: 'You', color: new THREE.Color(carPaintColor).getStyle() }]),
    ...bots.map((_bot, index) => ({ name: botName(index), color: botColor(index) })),
  ];
  let standings: readonly RaceStanding[] = [];
  const botMarkers = markerCars.map((_car, index) => ({
    position: new THREE.Vector3(),
    forward: new THREE.Vector3(),
    color: botColors[index],
    visible: false,
  }));
  for (const bot of botCars) {
    if (!car.chassis.parent) throw new Error('Bot cars require a scene');
    car.chassis.parent.add(bot.chassis, ...bot.wheels, ...bot.hubs, ...bot.groundGlows);
  }
  const worker = new Worker(new URL('./physics-worker.ts', import.meta.url), { type: 'module' });
  const objects = [
    car.chassis,
    ...car.wheels,
    ...car.hubs,
    ...botCars.flatMap((bot) => [bot.chassis, ...bot.wheels, ...bot.hubs]),
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
    motion: {
      x: 0,
      y: 0,
      z: 0,
      heading: 0,
      vx: 0,
      vz: 0,
      speed: 0,
      slipAngle: 0,
      yawRate: 0,
      steering: 0,
      rearWheelSpeed: 0,
    },
    tires: [],
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
  let replayFieldCount = 0;
  const fieldFrames = botCars.map(() => createReplayFrame());
  const fieldBefore = createReplayFrame();
  const fieldAfter = createReplayFrame();
  let records: PhysicsRecord[] = [];
  const recycled: ArrayBuffer[] = [];
  let resolveReady: () => void;
  let rejectReady: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  let startupStage = 'Starting physics worker…';
  const startupStarted = performance.now();
  const startupTimer = setTimeout(() => {
    fail(new Error(`Physics startup timed out after 120 seconds: ${startupStage}`));
  }, 120_000);

  function input(): PhysicsInput {
    const { driveMode, profiles, coneMode, showBuildings, showNearbyRoads } =
      configurationState.getState();
    return {
      controls: {
        throttle: controls.throttle,
        brake: controls.brake,
        reverse: controls.reverse,
        steer: controls.steer,
        handbrake: controls.handbrake,
        clutch: controls.clutch,
        shiftUp: controls.shiftUp,
        shiftDown: controls.shiftDown,
      },
      configuration: { driveMode, profiles, coneMode, showBuildings, showNearbyRoads },
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
    clearTimeout(startupTimer);
    worker.terminate();
    if (!initialized) rejectReady(error);
    else onError(error);
  }

  function accept(snapshot: PhysicsSnapshot, endTime: number) {
    for (const [index, bot] of botCars.entries()) {
      for (const object of [bot.chassis, ...bot.wheels, ...bot.hubs])
        object.visible = snapshot.replayTime === null || index < replayFieldCount;
    }
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
    botTelemetry = snapshot.bots;
    records.push(...snapshot.records);
    currentTickTime = endTime - snapshot.alpha * physicsStep;
    replayTime = snapshot.replayTime;
    if (snapshot.standings) standings = snapshot.standings;
    syncObservedState(snapshot.laps);
    resetting = false;
    for (const impact of snapshot.impacts) {
      if (impact.type === 'cone') audio.hitCone(impact.impulse);
      else audio.hitTurnSign(impact.impulse);
    }
    if (!initialized) {
      initialized = true;
      clearTimeout(startupTimer);
      interpolate(1);
      resolveReady();
    }
  }

  worker.onmessage = ({ data }: MessageEvent<PhysicsResponse>) => {
    if (disposed || failed) return;
    if (data.type === 'startup') {
      startupStage = data.stage;
      console.debug(
        `[Physics startup +${((performance.now() - startupStarted) / 1000).toFixed(2)}s] ${data.stage}`,
      );
      onStartupProgress?.(data.stage, data.fraction);
      return;
    }
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

  if (botsOnly) {
    car.setPaintColor(botColors[observedBot]);
    car.setUnderglowColor(botColors[observedBot]);
    observedPlate?.setColor(botColors[observedBot]);
    botCars.forEach((car, index) => car.setColor(botColors[botForModel(index + 1)]));
  }
  const data = createPhysicsInit(definition, car, course, input().configuration, bots, botsOnly);
  data.race = race;
  send({ type: 'init', data });

  function invalidate() {
    revision++;
    renderTime = currentTickTime = sentTime;
    records = [];
    resetting = true;
    botTelemetry = [];
    standings = [];
    Object.assign(laps, emptyLapState());
  }

  function botForModel(index: number) {
    if (!botsOnly || replayTime !== null) return index;
    return index === 0 ? observedBot : index === observedBot ? 0 : index;
  }

  function observedTelemetry() {
    return botsOnly && replayTime === null && botTelemetry.length
      ? botTelemetry[observedBot]
      : telemetry;
  }

  function syncObservedState(primaryLaps = laps) {
    const state = observedTelemetry();
    beforeVelocity.fromArray(state.previousVelocity);
    afterVelocity.fromArray(state.velocity);
    Object.assign(
      laps,
      botsOnly && replayTime === null && botTelemetry.length
        ? botTelemetry[observedBot].laps
        : primaryLaps,
    );
  }

  function interpolate(alpha = interpolationAlpha(), replayOnly = false) {
    objects.forEach((object, index) => {
      if (replayOnly && index < vehiclePoseCount * (1 + botCars.length)) return;
      // Invisible props retain their last pose until their next activation snapshot.
      if (!object.visible) return;
      const modelIndex = Math.floor(index / vehiclePoseCount);
      const sourceIndex =
        botsOnly && modelIndex < bots.length
          ? botForModel(modelIndex) * vehiclePoseCount + (index % vehiclePoseCount)
          : index;
      const offset = sourceIndex * poseStride;
      object.position.fromArray(previous, offset);
      position.fromArray(current, offset);
      object.position.lerp(position, alpha);
      object.quaternion.fromArray(previous, offset + 3);
      quaternion.fromArray(current, offset + 3);
      object.quaternion.slerp(quaternion, alpha);
    });
    if (!replayOnly) {
      const state = observedTelemetry();
      car.setBraking(state.braking);
      car.setReversing(state.reversing);
      car.setHazards(!botsOnly && telemetry.hazards, !botsOnly && telemetry.hazardsEnabled);
      observedPlate?.setThinking(
        replayTime === null && !resetting ? (botTelemetry[observedBot]?.thinking ?? null) : null,
        replayTime === null && !resetting && Boolean(botTelemetry[observedBot]?.laps.finished),
      );
    }
    markerCars.forEach((_car, index) => {
      const car = markerCars[botForModel(index)];
      const marker = botMarkers[index];
      marker.visible =
        car.chassis.visible && (replayTime === null || replayFieldCount > 0) && !resetting;
      marker.position.copy(car.chassis.position);
      marker.forward.set(0, 0, 1).applyQuaternion(car.chassis.quaternion);
    });
    botCars.forEach((car, index) => {
      const state = botTelemetry[botForModel(index + botOffset)];
      car.setBraking(state?.braking ?? false);
      car.setReversing(state?.reversing ?? false);
      car.setThinking(
        replayTime === null && !resetting ? (state?.thinking ?? null) : null,
        replayTime === null && !resetting && Boolean(state?.laps.finished),
      );
    });
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

  function observeBot(index: number) {
    if (!botsOnly || bots.length < 2 || replayTime !== null || resetting || !initialized)
      return false;
    if (!Number.isInteger(index) || index < 0 || index >= bots.length)
      throw new Error(`Invalid observed bot index: ${index}`);
    if (index === observedBot) return false;
    observedBot = index;
    car.setPaintColor(botColors[observedBot]);
    car.setUnderglowColor(botColors[observedBot]);
    observedPlate?.setColor(botColors[observedBot]);
    botCars.forEach((car, index) => car.setColor(botColors[botForModel(index + 1)]));
    botEffects.forEach((effect) => effect.reset());
    syncObservedState();
    interpolate(1);
    return true;
  }

  return {
    observeBot,
    cycleObservedBot() {
      return observeBot((observedBot + 1) % bots.length);
    },
    get observedBot() {
      return observedBot;
    },
    botMarkers,
    raceEntrants,
    get standings() {
      return standings;
    },
    get raceFinished() {
      return (
        !resetting &&
        (laps.finished || laps.retired) &&
        botTelemetry.length === bots.length &&
        botTelemetry.every(({ laps }) => laps.finished || laps.retired)
      );
    },
    botSounds,
    get botSmokeActive() {
      return botEffects.some((effect) => effect.active);
    },
    setBotLighting(headlights: boolean, time: ConfigurationState['timeOfDay']) {
      botCars.forEach((bot) => {
        bot.setHeadlights(headlights);
        bot.setUnderglow(time === 'night');
      });
    },
    updateBotEffects(
      dt: number,
      camera: THREE.Camera,
      headlights: boolean,
      time: ConfigurationState['timeOfDay'],
      active = true,
    ) {
      botSounds.length = 0;
      listenerRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
      camera.getWorldPosition(listenerPosition);
      botCars.forEach((car, index) => {
        const botIndex = botForModel(index + botOffset);
        const state = botTelemetry[botIndex];
        const effect = botEffects[index];
        if (!active || !state || !car.chassis.visible || resetting) {
          car.setHeadlights(false);
          car.setUnderglow(false);
          effect.reset();
          return;
        }
        car.setHeadlights(headlights);
        car.setUnderglow(time === 'night');
        car.updateGround(groundHeight);
        const velocity = botVelocity[index].fromArray(state.velocity);
        const speed = velocity.length();
        const slip =
          speed > 3 ? 1 - Math.abs(botMarkers[botIndex].forward.dot(velocity) / speed) : 0;
        const backfire = effect.update(
          dt,
          velocity,
          camera,
          state.wheelContacts,
          speed > 3 && slip > 0.045,
          state.burnout > 0.1 && (state.wheelContacts[2] || state.wheelContacts[3]),
          state.engine,
        );
        soundOffset.subVectors(car.chassis.position, listenerPosition);
        const distance = soundOffset.length();
        botSounds.push({
          drivetrain: state.engine,
          ...backfire,
          tires: state.tireSounds,
          distance,
          pan: distance > 0 ? soundOffset.dot(listenerRight) / distance : 0,
        });
      });
    },
    captureBotDepth(
      renderer: THREE.WebGLRenderer,
      scene: THREE.Scene,
      camera: THREE.PerspectiveCamera,
      depth: THREE.DepthTexture | null,
    ) {
      if (!depth) throw new Error('Bot smoke requires the shared scene depth texture');
      botEffects.forEach((effect) => effect.captureDepth(renderer, scene, camera, false, depth));
    },
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
    retire() {
      send({ type: 'retire', input: input() });
    },
    reset() {
      botEffects.forEach((effect) => effect.reset());
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
      if (botsOnly) {
        car.setPaintColor(botColors[observedBot]);
        car.setUnderglowColor(botColors[observedBot]);
        observedPlate?.setColor(botColors[observedBot]);
        botCars.forEach((bot, index) => bot.setColor(botColors[botForModel(index + 1)]));
      }
      send({ type: 'reset', input: input() });
    },
    /** Development aid: respawns the player at a pose, e.g. one read from `chassisPose`. */
    teleport(spawn: ReturnType<typeof courseSpawn>, height: number) {
      invalidate();
      send({ type: 'teleport', spawn, height, input: input() });
    },
    chassisPose() {
      const { x, y, z } = car.chassis.position;
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(car.chassis.quaternion);
      return {
        spawn: { position: [x, z] as const, heading: Math.atan2(forward.x, forward.z) },
        height: y,
      };
    },
    setCourseDirection(spawn: ReturnType<typeof courseSpawn>, definition: CourseDefinition) {
      botEffects.forEach((effect) => effect.reset());
      invalidate();
      send({ type: 'direction', spawn, definition, input: input() });
    },
    startReplay(recording: RunRecording, time: number) {
      invalidate();
      replayTime = time;
      replayFieldCount = recording.field.length;
      observedPlate?.setThinking(null);
      if (botsOnly) {
        car.setPaintColor(botColors[0]);
        car.setUnderglowColor(botColors[0]);
        observedPlate?.setColor(botColors[0]);
        botCars.forEach((bot, index) => bot.setColor(botColors[index + 1]));
      }
      const data = replayData(recording);
      send({ type: 'replay', recording: data, time, input: input() }, [
        data.data.buffer,
        ...(data.field ?? []).map((entrant) => entrant.data.buffer),
      ]);
    },
    applyReplayField(recording: RunRecording, time: number) {
      botCars.forEach((bot, index) => {
        const source = recording.field[index];
        for (const object of [bot.chassis, ...bot.wheels, ...bot.hubs])
          object.visible = Boolean(source);
        if (!source) return;
        const frame = fieldFrames[index];
        source.read(time, frame);
        applyCarPose(frame, bot.chassis, bot.wheels, bot.hubs);
        bot.setBraking(frame.braking);
        bot.setReversing(frame.reversing);
        bot.setThinking(null);
        const state = botTelemetry[index + botOffset];
        if (state) {
          const h = source.interval / 2;
          source.read(time - h, fieldBefore);
          source.read(time + h, fieldAfter);
          fieldAfter.position
            .sub(fieldBefore.position)
            .divideScalar(2 * h)
            .toArray(state.velocity);
          fieldAfter.position.toArray(state.previousVelocity);
          state.wheelContacts = frame.contacts;
          state.tireSounds = frame.tires;
          state.burnout = Number(frame.burnout);
          Object.assign(state.engine, {
            rpm: frame.rpm,
            gear: frame.gear,
            throttle: frame.throttle,
            load: frame.load,
            boost: frame.boost,
            shifting: frame.shifting,
            limiterCut: frame.limiterCut,
          });
          markerCars.forEach((model, index) => {
            const marker = botMarkers[index];
            marker.visible = model.chassis.visible;
            marker.position.copy(model.chassis.position);
            marker.forward.set(0, 0, 1).applyQuaternion(model.chassis.quaternion);
          });
        }
      });
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
      const junctions = new Set(course.junctionCones);
      const nearbyRoads = configurationState.getState().showNearbyRoads;
      course.cones.forEach((cone) => {
        cone.visible = junctions.has(cone)
          ? nearbyRoads
          : enabled && (!onlyCorners || corners.has(cone));
      });
    },
    dispose(restoreCarPaint = true) {
      disposed = true;
      clearTimeout(startupTimer);
      worker.terminate();
      recycled.length = 0;
      records = [];
      botCars.forEach((bot) => bot.dispose());
      observedPlate?.dispose();
      botEffects.forEach((effect) => effect.dispose());
      if (botsOnly && restoreCarPaint) {
        car.setPaintColor(carPaintColor);
        car.setUnderglowColor(carUnderglowColor);
      }
    },
    get engine() {
      return observedTelemetry().engine;
    },
    get burnout() {
      return observedTelemetry().burnout;
    },
    get braking() {
      return observedTelemetry().braking;
    },
    get steering() {
      return observedTelemetry().steering;
    },
    get reversing() {
      return observedTelemetry().reversing;
    },
    get spawnBrakeHeld() {
      return observedTelemetry().spawnBrakeHeld;
    },
    get linearVelocity() {
      return linearVelocity;
    },
    get brakestand() {
      return observedTelemetry().brakestand;
    },
    get wheelContacts() {
      return observedTelemetry().wheelContacts;
    },
    get tireSounds() {
      return observedTelemetry().tireSounds;
    },
    get replayTime() {
      return replayTime;
    },
    get resetting() {
      return resetting;
    },
  };
}
