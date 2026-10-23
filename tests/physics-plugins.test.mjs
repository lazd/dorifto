import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import * as THREE from 'three';
import AmmoFactory from 'ammojs-typed';
import { createServer } from 'vite';

let server;
let Ammo;
let createVehiclePhysics;
let createPhysicsResources;
let createPhysicsWorld;
let createConePhysics;
let createPhysicsVisuals;
let createTurnSignPhysics;
let createConfigurationState;
let createPhysicsSimulation;
let createPhysicsInit;
let physicsStep;
let snapshotStride;
let poseStride;
let vehiclePoseCount;
let courseSpawn;
let courses;
let RunRecording;
let createReplayFrame;
let replayData;
let createPhysicsClient;

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  ({ createVehiclePhysics, createPhysicsResources, createPhysicsWorld } =
    await server.ssrLoadModule('/src/vehicle-physics.ts'));
  ({ createConePhysics } = await server.ssrLoadModule('/src/cone-physics.ts'));
  ({ createPhysicsVisuals } = await server.ssrLoadModule('/src/physics-plugin.ts'));
  ({ createTurnSignPhysics } = await server.ssrLoadModule('/src/turn-sign-physics.ts'));
  ({ createConfigurationState } = await server.ssrLoadModule('/src/configuration-state.ts'));
  ({ createPhysicsSimulation } = await server.ssrLoadModule('/src/physics-simulation.ts'));
  ({ createPhysicsClient } = await server.ssrLoadModule('/src/physics-client.ts'));
  ({ createPhysicsInit, physicsStep, snapshotStride, poseStride, vehiclePoseCount, replayData } =
    await server.ssrLoadModule('/src/physics-messages.ts'));
  ({ courses, courseSpawn } = await server.ssrLoadModule('/src/courses.ts'));
  ({ RunRecording, createReplayFrame } = await server.ssrLoadModule('/src/lap-recording.ts'));
  Ammo = await AmmoFactory.call({});
});

after(async () => {
  await server?.close();
});

function fixture(slopeX = 0, slopeZ = 0, simulationWorld) {
  const car = {
    chassis: new THREE.Group(),
    wheels: Array.from({ length: 4 }, () => new THREE.Group()),
    hubs: Array.from({ length: 4 }, () => new THREE.Group()),
    centers: [
      new THREE.Vector3(-0.75, 0, 1.3),
      new THREE.Vector3(0.75, 0, 1.3),
      new THREE.Vector3(-0.75, 0, -1.3),
      new THREE.Vector3(0.75, 0, -1.3),
    ],
    radii: [0.32, 0.32, 0.32, 0.32],
    widths: [0.24, 0.24, 0.24, 0.24],
    collisionVertices: [-1, 1].flatMap((x) =>
      [-1, 1].flatMap((y) =>
        [-1, 1].map((z) => new THREE.Vector3(x * 0.75, y < 0 ? -0.1 : 0.3, z * 2)),
      ),
    ),
    setBraking() {},
    setReversing() {},
    setHazards() {},
  };
  const cones = [new THREE.Group(), new THREE.Group()];
  cones[0].position.set(5, 1, 5);
  cones[0].rotation.z = 0.2;
  cones[1].position.set(8, 1, 5);
  const course = {
    cones,
    cornerCones: [cones[0]],
    terrain: {
      heights: Float32Array.from(
        { length: 16 * 16 },
        (_, i) => ((i % 16) - 7.5) * 2 * slopeX + (Math.floor(i / 16) - 7.5) * 2 * slopeZ,
      ),
      columns: 16,
      rows: 16,
      spacing: 2,
      minX: -16,
      minZ: -16,
      minHeight: -15 * (Math.abs(slopeX) + Math.abs(slopeZ)) - 0.01,
      maxHeight: 15 * (Math.abs(slopeX) + Math.abs(slopeZ)) + 0.01,
      normalAt: () => new THREE.Vector3(-slopeX, 1, -slopeZ).normalize(),
      heightAt: (x, z) => (x + 1) * slopeX + (z + 1) * slopeZ,
    },
    isAsphalt: () => true,
  };
  const hits = [];
  const laps = {
    reset() {},
    update() {},
    hitCone(index) {
      hits.push(index);
    },
  };
  const controls = { throttle: 0, brake: 0, reverse: 0, steer: 0, handbrake: false };
  const configurationState = createConfigurationState();
  const physics = createVehiclePhysics({
    simulationWorld,
    Ammo,
    resources: createPhysicsResources(Ammo),
    car,
    course,
    laps,
    controls,
    configurationState,
    spawn: { position: [0, 0], heading: 0 },
  });
  return { physics, course, laps, hits, car, controls, configurationState };
}

test('shared vehicles integrate once, collide, and can be independently removed', (t) => {
  const setup = fixture();
  setup.physics.dispose();
  const world = createPhysicsWorld(Ammo, createPhysicsResources(Ammo), setup.course.terrain);
  const first = fixture(0, 0, world);
  const second = fixture(0, 0, world);
  t.after(() => {
    first.physics.dispose();
    second.physics.dispose();
    world.dispose();
  });
  second.physics.setCourseDirection({ position: [0, 7], heading: 0 }, second.laps);
  first.physics.reset();
  second.physics.reset();
  first.controls.throttle = 1;
  assert.throws(() => first.physics.step(), /Shared vehicles/);
  const advance = (steps) => {
    for (let i = 0; i < steps; i++) {
      first.physics.beforeStep();
      if (second.enabled !== false) second.physics.beforeStep();
      world.step(first.physics.fixedStep);
      first.physics.afterStep();
      if (second.enabled !== false) second.physics.afterStep();
    }
  };
  advance(360);
  assert.ok(
    first.physics.readState().z < second.physics.readState().z - 3.5,
    'cars must collide rather than passing through each other',
  );
  second.physics.setEnabled(false);
  second.enabled = false;
  const before = first.physics.readState().z;
  advance(180);
  assert.ok(
    first.physics.readState().z > before + 2,
    'removing the blocker permits normal driving',
  );
  second.physics.setEnabled(true);
  second.enabled = true;
});

function workerFixture() {
  const { physics, car, course, controls, configurationState } = fixture();
  physics.dispose();
  const definition = courses[0];
  const spawn = courseSpawn(definition);
  const { heights, columns, rows, spacing, minHeight, maxHeight } = course.terrain;
  const terrain = {
    heights,
    columns,
    rows,
    spacing,
    minHeight,
    maxHeight,
    minX: spawn.position[0] - (columns * spacing) / 2,
    minZ: spawn.position[1] - (rows * spacing) / 2,
    segments: [],
    halfWidth: definition.width / 2,
    padRadius: Infinity,
  };
  configurationState.update({ coneMode: 'off' });
  const configuration = configurationState.getState();
  const sceneCourse = {
    ...course,
    terrain: { physicsData: () => terrain },
    turnSignGroups: [new THREE.Group()],
  };
  const data = structuredClone(createPhysicsInit(definition, car, sceneCourse, configuration));
  const input = {
    controls,
    configuration,
    signs: [true],
    lights: {
      highBeams: true,
      headlights: true,
      fogLights: true,
      leftSignal: true,
      rightSignal: false,
    },
  };
  const simulation = createPhysicsSimulation(Ammo, data);
  return {
    simulation,
    input,
    data,
    definition,
    car,
    course: sceneCourse,
    controls,
    configurationState,
  };
}

test('worker snapshots include independently driven bots through reset, reversal and replay', (t) => {
  const setup = workerFixture();
  setup.simulation.dispose();
  setup.data.bots = [{ skill: 0.8, aggression: 0.4, learning: true }];
  const simulation = createPhysicsSimulation(Ammo, setup.data);
  t.after(() => simulation.dispose());
  let snapshot = simulation.handle({ type: 'init', revision: 0 });
  assert.equal(snapshot.bots.length, 1);
  assert.equal(snapshot.bots[0].braking, true);
  assert.equal(snapshot.bots[0].tireSounds.length, 4);
  assert.equal(snapshot.bots[0].wheelContacts.length, 4);
  const initial = new Float32Array(snapshot.buffer);
  const botZ = initial[vehiclePoseCount * snapshotStride + 1 + poseStride + 2];
  let standings;
  for (let i = 0; i < 30; i++) {
    snapshot = simulation.handle({
      type: 'advance',
      dt: physicsStep * 4,
      revision: 0,
      input: setup.input,
      recycled: [],
    });
    standings = snapshot.standings ?? standings;
  }

  assert.deepEqual(standings.map(({ entrant }) => entrant).sort(), [0, 1]);
  assert.ok(standings.every(({ gap }) => gap === null || Number.isFinite(gap)));
  assert.ok(snapshot.bots[0].metrics.elapsed > 0);
  assert.ok(snapshot.bots[0].engine.rpm > 0);
  assert.equal(snapshot.bots[0].velocity.length, 3);
  assert.equal(snapshot.bots[0].laps.elapsedTime, snapshot.laps.elapsedTime);
  assert.equal(snapshot.telemetry.tires.length, 4);
  const moved = new Float32Array(snapshot.buffer);
  assert.notEqual(
    moved[vehiclePoseCount * snapshotStride + 1 + poseStride + 2],
    botZ,
    JSON.stringify(snapshot.bots[0]),
  );
  const reversed = { ...setup.definition, reverse: true };
  snapshot = simulation.handle({
    type: 'direction',
    revision: 1,
    definition: reversed,
    spawn: courseSpawn(reversed),
    input: setup.input,
  });
  assert.equal(snapshot.bots[0].laps.elapsedTime, 0);
  assert.equal(snapshot.bots[0].metrics.elapsed, 0);
  const recording = new RunRecording();
  const frame = createReplayFrame();
  recording.push(frame);
  recording.push(frame);
  snapshot = simulation.handle({
    type: 'replay',
    revision: 2,
    recording: replayData(recording),
    time: 0,
    input: setup.input,
  });
  snapshot = simulation.handle({
    type: 'advance',
    dt: physicsStep * 4,
    revision: 2,
    input: setup.input,
    recycled: [],
  });
  assert.equal(snapshot.bots[0].metrics.elapsed, 0, 'bots do not participate in recorded replays');
  assert.equal(snapshot.standings, undefined, 'replays do not publish live standings');
  snapshot = simulation.handle({ type: 'reset', revision: 3, input: setup.input });
  snapshot = simulation.handle({
    type: 'advance',
    dt: physicsStep * 4,
    revision: 3,
    input: setup.input,
    recycled: [],
  });
  assert.ok(snapshot.bots[0].metrics.elapsed > 0, 'bots resume after replay reset');
  assert.equal(snapshot.standings.length, 2, 'reset publishes fresh standings on the first step');
});

test('bots-only mode has no player vehicle and follows bot telemetry through reversal and reset', (t) => {
  const setup = workerFixture();
  setup.simulation.dispose();
  setup.data.botsOnly = true;
  setup.data.bots = [{ skill: 1, aggression: 0.4, learning: true }];
  const simulation = createPhysicsSimulation(Ammo, setup.data);
  t.after(() => simulation.dispose());
  let snapshot = simulation.handle({ type: 'init', revision: 0 });
  assert.equal(
    snapshot.count,
    vehiclePoseCount + setup.data.cones.length,
    'exactly one car is present, not a hidden player plus a bot',
  );
  Object.assign(setup.input.controls, { throttle: 0, brake: 1, reverse: 1, handbrake: true });
  for (let i = 0; i < 10; i++)
    snapshot = simulation.handle({
      type: 'advance',
      dt: physicsStep * 4,
      revision: 0,
      input: setup.input,
      recycled: [],
    });
  assert.equal(snapshot.telemetry.spawnBrakeHeld, false, 'bot launches without player input');
  assert.deepEqual(snapshot.telemetry.engine, snapshot.bots[0].engine);
  assert.deepEqual(snapshot.laps, snapshot.bots[0].laps);
  assert.equal(snapshot.telemetry.brakestand, false, 'player brake/handbrake inputs are ignored');
  const reversed = { ...setup.definition, reverse: true };
  simulation.handle({
    type: 'direction',
    revision: 1,
    definition: reversed,
    spawn: courseSpawn(reversed),
    input: setup.input,
  });
  snapshot = simulation.handle({
    type: 'advance',
    dt: physicsStep * 4,
    revision: 1,
    input: setup.input,
    recycled: [],
  });
  assert.deepEqual(snapshot.laps, snapshot.bots[0].laps);
  snapshot = simulation.handle({ type: 'reset', revision: 2, input: setup.input });
  assert.equal(snapshot.laps.elapsedTime, 0);
  assert.equal(snapshot.bots[0].metrics.elapsed, 0);
});

test('lap limits receive each tire center and both full-width tread edges', () => {
  const { physics, laps, car, controls } = fixture();
  let points;
  laps.update = (_position, _dt, tirePoints) => {
    points = tirePoints.map((point) => point.clone());
  };
  try {
    controls.steer = 1;
    controls.throttle = 0.2;
    for (let step = 0; step < 60; step++) physics.step();
    assert.equal(points.length, 12);
    for (let i = 0; i < 4; i++) {
      const [center, left, right] = points.slice(i * 3, i * 3 + 3);
      assert.ok(Math.abs(left.distanceTo(right) - car.widths[i]) < 1e-8);
      assert.ok(center.distanceTo(left.clone().add(right).multiplyScalar(0.5)) < 1e-8);
    }
    const front = points[1].clone().sub(points[2]).normalize();
    const rear = points[7].clone().sub(points[8]).normalize();
    assert.ok(
      front.dot(rear) < 0.99,
      'front tread edges follow steering rather than chassis width',
    );
  } finally {
    physics.dispose();
  }
});

async function clientFixture(t, options = {}) {
  const fixture = workerFixture();
  if (options.bots?.length) {
    fixture.simulation.dispose();
    Object.assign(fixture.data, options);
    fixture.simulation = createPhysicsSimulation(Ammo, fixture.data);
    const scene = new THREE.Scene();
    scene.add(fixture.car.chassis, ...fixture.car.wheels, ...fixture.car.hubs);
    fixture.car.widths = fixture.car.radii.map((radius) => radius / 2);
    fixture.car.setPaintColor = (color) => {
      fixture.car.paintColor = color;
    };
  }
  let worker;
  const previousWorker = globalThis.Worker;
  globalThis.Worker = class {
    requests = [];
    constructor() {
      worker = this;
    }
    postMessage(message, transfer) {
      this.requests.push(structuredClone(message, { transfer }));
    }
    terminate() {
      this.terminated = true;
    }
    reply() {
      const snapshot = fixture.simulation.handle(this.requests.shift());
      const transfer = [
        snapshot.buffer,
        ...snapshot.records.flatMap(({ sample }) => (sample ? [sample.buffer] : [])),
      ];
      const response = structuredClone(snapshot, { transfer });
      this.onmessage({ data: response });
      return response;
    }
  };
  t.after(() => {
    if (previousWorker === undefined) delete globalThis.Worker;
    else globalThis.Worker = previousWorker;
    fixture.simulation.dispose();
  });
  const errors = [];
  const client = createPhysicsClient({
    ...fixture,
    ...options,
    audio: { hitCone() {}, hitTurnSign() {} },
    lights: () => fixture.input.lights,
    onError: (error) => errors.push(error),
  });
  t.after(() => client.dispose());
  worker.reply();
  await client.ready;
  return { fixture, worker, client, errors };
}

test('spectating swaps the full model, camera telemetry and laps without resetting or duplicating bots', async (t) => {
  const { fixture, worker, client } = await clientFixture(t, {
    botsOnly: true,
    bots: [
      { skill: 1, aggression: 0.4, learning: false },
      { skill: 0.5, aggression: 0.4, learning: false },
    ],
  });
  client.advance(physicsStep * 4);
  const snapshot = worker.reply();
  assert.deepEqual(client.standings, snapshot.standings);
  assert.deepEqual(
    client.raceEntrants.map(({ name }) => name),
    ['Bot 1', 'Bot 2'],
  );
  const standings = client.standings;
  client.interpolate(1);
  const first = fixture.car.chassis.position.clone();
  const firstColor = fixture.car.paintColor;
  assert.equal(client.cycleObservedBot(), true);
  assert.equal(client.observedBot, 1);
  assert.notEqual(fixture.car.paintColor, firstColor);
  assert.equal(fixture.car.paintColor, client.raceEntrants[1].color);
  assert.equal(client.standings, standings, 'spectating does not change race identities');
  assert.ok(fixture.car.chassis.position.distanceTo(client.botMarkers[1].position) < 1e-8);
  assert.ok(first.distanceTo(client.botMarkers[0].position) < 1e-8);
  assert.deepEqual(client.engine, snapshot.bots[1].engine);
  assert.deepEqual(client.laps, snapshot.bots[1].laps);
  assert.equal(worker.requests.length, 0, 'switching views never resets the simulation');
  assert.equal(client.cycleObservedBot(), true);
  assert.equal(client.observedBot, 0);
  assert.ok(fixture.car.chassis.position.distanceTo(first) < 1e-8);
  client.reset();
  assert.deepEqual(client.standings, [], 'clear standings while a reset is pending');
});

test('worker client bounds in-flight advances, ignores pre-reset replies, preserves snap samples, and surfaces failures', async (t) => {
  const { fixture, worker, client, errors } = await clientFixture(t);
  fixture.controls.throttle = 1;
  client.advance(physicsStep * 2);
  client.advance(physicsStep);
  assert.equal(worker.requests.length, 1);
  client.reset();
  worker.reply();
  assert.equal(client.takeRecords().length, 0, 'discard samples from the old revision');
  assert.equal(client.spawnBrakeHeld, true);
  assert.equal(client.laps.elapsedTime, 0);
  client.advance(physicsStep);
  assert.equal(worker.requests.length, 1, 'wait for the reset before advancing again');
  worker.reply();
  const near = (actual, expected, message) =>
    assert.ok(Math.abs(actual - expected) < 1e-6, message);
  client.advance(physicsStep * 1.5);
  worker.reply();
  client.advance(physicsStep * 1.5);
  near(client.interpolationAlpha(), 1, 'a timely reply already covers the next frame');
  client.advance(physicsStep * 1.5);
  near(client.interpolationAlpha(), 2.5, 'extrapolate to render time while a reply is late');
  worker.reply();
  near(client.interpolationAlpha(), 1.5, 'arrival time does not move the drawn time');
  client.takeRecords();
  client.advance(physicsStep * 4);
  client.captureVisuals(true);
  const live = worker.reply();
  assert.ok(live.records.length > 0);
  worker.reply();
  assert.equal(
    client.takeRecords().length,
    live.records.length,
    'a visibility snap must not discard in-flight recording samples',
  );
  client.advance(physicsStep);
  worker.onmessage({ data: { type: 'error', revision: 1, message: 'simulation failed' } });
  assert.match(errors[0].message, /simulation failed/);
  assert.equal(worker.terminated, true);
});

test('worker batches preserve fixed-step timing, transferable poses, and simulation-tick recording', () => {
  const { simulation, input, data } = workerFixture();
  try {
    const initial = simulation.handle({ type: 'init', data, revision: 0 });
    assert.equal(initial.count, vehiclePoseCount + data.cones.length);
    input.controls.throttle = 1;
    const batch = simulation.handle({
      type: 'advance',
      dt: physicsStep * 6,
      input,
      recycled: [initial.buffer],
      revision: 0,
    });
    assert.equal(batch.buffer, initial.buffer, 'reuse the returned snapshot buffer');
    assert.equal(batch.count, vehiclePoseCount, 'sleeping/disabled props are not resent');
    assert.equal(batch.records.length, 6);
    assert.ok(Math.abs(batch.laps.elapsedTime - physicsStep * 6) < 1e-10);
    const samples = batch.records.filter(({ sample }) => sample);
    assert.equal(samples.length, 2, 'record every four physics ticks, not every rendered frame');
    const recording = new RunRecording();
    for (const { sample } of samples) recording.pushSample(sample);
    const frame = createReplayFrame();
    recording.read(0, frame);
    assert.equal(frame.highBeams, true);
    assert.equal(frame.headlights, true);
    assert.equal(frame.fogLights, true);
    assert.equal(frame.leftSignal, true);
    assert.equal(frame.rightSignal, false);
    const transferred = structuredClone(batch, { transfer: [batch.buffer] });
    assert.equal(batch.buffer.byteLength, 0);
    assert.ok(
      new Float32Array(transferred.buffer)
        .subarray(0, transferred.count * snapshotStride)
        .every(Number.isFinite),
    );
    const snap = simulation.handle({ type: 'snap', input, revision: 0 });
    assert.equal(
      snap.laps.elapsedTime,
      transferred.laps.elapsedTime,
      'visibility snaps do not advance time',
    );
    assert.equal(snap.count, initial.count);
  } finally {
    simulation.dispose();
  }
});

test('worker recordings preserve automatic headlights and explicit on/off overrides', () => {
  const { simulation, input, data } = workerFixture();
  try {
    simulation.handle({ type: 'init', data, revision: 0 });
    input.controls.throttle = 1;
    for (const headlights of [null, false, true, null]) {
      input.lights.headlights = headlights;
      const batch = simulation.handle({
        type: 'advance',
        dt: physicsStep * 4,
        input,
        recycled: [],
        revision: 0,
      });
      const recording = new RunRecording();
      for (const { sample } of batch.records) {
        if (sample) recording.pushSample(sample);
      }
      const frame = createReplayFrame();
      assert.ok(recording.read(0, frame));
      assert.equal(frame.headlights, headlights);
    }
  } finally {
    simulation.dispose();
  }
});

test('worker resets, direction changes, and replay share the live physics world without recording replay steps', () => {
  const { simulation, input, data, definition } = workerFixture();
  try {
    simulation.handle({ type: 'init', data, revision: 0 });
    input.controls.throttle = 1;
    const live = simulation.handle({
      type: 'advance',
      dt: physicsStep * 6,
      input,
      recycled: [],
      revision: 0,
    });
    const recording = new RunRecording();
    for (const { sample } of live.records) if (sample) recording.pushSample(sample);
    simulation.handle({
      type: 'replay',
      recording: replayData(recording),
      time: 0,
      input,
      revision: 1,
    });
    const replay = simulation.handle({
      type: 'advance',
      dt: physicsStep * 2,
      input,
      recycled: [],
      revision: 1,
    });
    assert.equal(replay.replayTime, physicsStep * 2);
    assert.equal(replay.records.length, 0);
    input.controls.throttle = 0;
    const reverse = { ...definition, reverse: true };
    const directed = simulation.handle({
      type: 'direction',
      definition: reverse,
      spawn: courseSpawn(reverse),
      input,
      revision: 2,
    });
    assert.equal(directed.revision, 2);
    assert.equal(directed.replayTime, null);
    assert.equal(directed.telemetry.spawnBrakeHeld, true);
    assert.equal(directed.laps.elapsedTime, 0);
    const pose = new Float32Array(directed.buffer);
    assert.ok(Math.abs(pose[1 + poseStride] - courseSpawn(reverse).position[0]) < 1e-4);
    assert.ok(Math.abs(pose[3 + poseStride] - courseSpawn(reverse).position[1]) < 1e-4);
    const reset = simulation.handle({ type: 'reset', input, revision: 3 });
    assert.equal(reset.revision, 3);
    assert.equal(reset.count, vehiclePoseCount + data.cones.length);
    assert.equal(reset.records.length, 0);
    assert.equal(reset.telemetry.engine.throttle, 0);
  } finally {
    simulation.dispose();
  }
});

test('static tire friction holds on banks and hills but releases under throttle', () => {
  for (const [slopeX, slopeZ] of [
    [0.3, 0],
    [-0.3, 0],
    [0, 0.2],
    [0.2, -0.15],
  ]) {
    const { physics, car, controls } = fixture(slopeX, slopeZ);
    try {
      physics.reset();
      for (let i = 0; i < 600; i++) physics.step();
      physics.captureVisuals(true);
      const start = car.chassis.position.clone();
      for (let i = 0; i < 1200; i++) physics.step();
      physics.captureVisuals(true);
      const drift = Math.hypot(car.chassis.position.x - start.x, car.chassis.position.z - start.z);
      assert.ok(drift < 0.05, `slope ${slopeX}, ${slopeZ}: drifted ${drift} m in 10 seconds`);
      controls.throttle = 1;
      for (let i = 0; i < 120; i++) physics.step();
      physics.captureVisuals(true);
      assert.ok(
        car.chassis.position.distanceTo(start) > 0.2,
        'throttle must release the parked car',
      );
    } finally {
      physics.dispose();
    }
  }
});

test('static friction cannot hold beyond tire grip or stop freely rolling wheels', () => {
  for (const release of ['grip', 'brakes']) {
    const { physics, car, controls, configurationState } = fixture(0, 0.3);
    try {
      physics.reset();
      for (let i = 0; i < 600; i++) physics.step();
      physics.captureVisuals(true);
      const start = car.chassis.position.clone();
      if (release === 'grip') {
        const { profiles } = configurationState.getState();
        configurationState.update({
          profiles: { ...profiles, drift: { ...profiles.drift, frontGrip: 0.01, rearGrip: 0.01 } },
        });
      } else {
        controls.throttle = 1;
        physics.step();
        controls.throttle = 0;
      }
      for (let i = 0; i < 120; i++) physics.step();
      physics.captureVisuals(true);
      assert.ok(
        car.chassis.position.z < start.z - 0.2,
        `${release}: gravity must move the car downhill`,
      );
    } finally {
      physics.dispose();
    }
  }
});

test('object plugins receive lifecycle hooks and managed bodies are freed before shapes', () => {
  const { physics, laps } = fixture();
  const events = [];
  let context;
  let body;
  let shape;
  let motion;
  const destroy = Ammo.destroy;
  const destroyed = [];
  try {
    const plugin = physics.addPlugin((value) => {
      context = value;
      const size = new Ammo.btVector3(0.5, 0.5, 0.5);
      shape = new Ammo.btBoxShape(size);
      Ammo.destroy(size);
      body = context.createRigidBody(2, shape, new THREE.Vector3(6, 2, 0));
      motion = body.getMotionState();
      return {
        reset() {
          events.push('reset');
        },
        beforeStep(dt) {
          assert.equal(dt, physics.fixedStep);
          events.push('before');
        },
        afterStep(dt) {
          assert.equal(dt, physics.fixedStep);
          events.push('after');
        },
        captureVisuals(snap) {
          events.push(['capture', snap]);
        },
        interpolate(alpha) {
          events.push(['interpolate', alpha]);
        },
        dispose() {
          events.push('dispose');
          Ammo.destroy(shape);
        },
        setEnabled(enabled) {
          context.setBodyEnabled(body, enabled);
        },
      };
    });
    physics.addPlugin(() => ({}));
    assert.equal(context.laps, laps);
    const membership = [];
    const addRigidBody = context.world.addRigidBody.bind(context.world);
    const removeRigidBody = context.world.removeRigidBody.bind(context.world);
    context.world.addRigidBody = (value) => {
      if (value === body) membership.push('add');
      addRigidBody(value);
    };
    context.world.removeRigidBody = (value) => {
      if (value === body) membership.push('remove');
      removeRigidBody(value);
    };
    plugin.setEnabled(false);
    plugin.setEnabled(false);
    assert.deepEqual(membership, ['remove']);
    plugin.setEnabled(true);
    plugin.setEnabled(true);
    assert.deepEqual(membership, ['remove', 'add']);
    physics.reset();
    physics.step();
    physics.captureVisuals();
    physics.interpolate(0.25);
    assert.deepEqual(events, [
      'reset',
      ['capture', true],
      'before',
      'after',
      ['capture', false],
      ['interpolate', 0.25],
    ]);
    const nextLaps = { ...laps };
    physics.setCourseDirection({ position: [0, 0], heading: Math.PI }, nextLaps);
    assert.equal(context.laps, nextLaps);
    plugin.setEnabled(false);
    const pointers = [body, motion, shape].map((object) => Ammo.getPointer(object));
    Ammo.destroy = (object) => {
      const index = pointers.indexOf(Ammo.getPointer(object));
      if (index !== -1) destroyed.push(index);
      destroy(object);
    };
    physics.dispose();
    physics.dispose();
    assert.deepEqual(destroyed, [0, 1, 2]);
    assert.deepEqual(membership, ['remove', 'add', 'remove']);
    assert.equal(events.at(-1), 'dispose');
    assert.throws(() => physics.addPlugin(() => ({})), /disposed/);
    assert.throws(() => plugin.setEnabled(true), /disposed/);
    assert.throws(() => context.createRigidBody(2, shape, new THREE.Vector3()), /disposed/);
  } finally {
    physics.dispose();
    Ammo.destroy = destroy;
  }
});

test('cone plugin preserves collision penalties, sound threshold/cooldown, filtering, and resets', () => {
  const { physics, course, hits } = fixture();
  const sounds = [];
  const bodies = [];
  let vehicleBody;
  let contacts = [];
  let reversed = false;
  let otherBody;
  const dispatcher = {
    getNumManifolds: () => 1,
    getManifoldByIndexInternal: () => ({
      getBody0: () => (reversed ? bodies[0] : vehicleBody),
      getBody1: () => (reversed ? vehicleBody : (otherBody ?? bodies[0])),
      getNumContacts: () => contacts.length,
      getContactPoint: (index) => ({
        getDistance: () => contacts[index].distance,
        getAppliedImpulse: () => contacts[index].impulse,
      }),
    }),
  };
  try {
    const plugin = physics.addPlugin((context) => {
      vehicleBody = context.vehicleBody;
      return createConePhysics(
        {
          ...context,
          dispatcher,
          get laps() {
            return context.laps;
          },
          createRigidBody(...args) {
            const body = context.createRigidBody(...args);
            bodies.push(body);
            return body;
          },
        },
        { course, audio: { hitCone: (impulse) => sounds.push(impulse) } },
      );
    });
    physics.reset();
    contacts = [{ distance: 0.01, impulse: 10 }];
    plugin.afterStep();
    assert.deepEqual(hits, []);
    contacts = [{ distance: 0, impulse: 0.49 }];
    plugin.afterStep();
    assert.deepEqual(hits, [0]);
    assert.deepEqual(sounds, []);
    contacts = [
      { distance: -0.01, impulse: 0.2 },
      { distance: 0, impulse: 0.3 },
    ];
    reversed = true;
    plugin.afterStep();
    plugin.afterStep();
    assert.deepEqual(sounds, [0.5]);
    plugin.beforeStep(0.29);
    plugin.afterStep();
    assert.deepEqual(sounds, [0.5]);
    plugin.beforeStep(0.02);
    plugin.afterStep();
    assert.deepEqual(sounds, [0.5, 0.5]);
    plugin.reset();
    plugin.afterStep();
    assert.deepEqual(sounds, [0.5, 0.5, 0.5]);
    reversed = false;
    otherBody = bodies[1];
    plugin.afterStep();
    assert.equal(hits.at(-1), 1);
    const nextHits = [];
    physics.setCourseDirection(
      { position: [0, 0], heading: Math.PI },
      {
        reset() {},
        update() {},
        hitCone(index) {
          nextHits.push(index);
        },
      },
    );
    plugin.afterStep();
    assert.deepEqual(nextHits, [1]);
    plugin.setEnabled(true, true);
    plugin.afterStep();
    assert.deepEqual(nextHits, [1]);
    assert.deepEqual(
      course.cones.map(({ visible }) => visible),
      [true, false],
    );
    plugin.setEnabled(false);
    assert.equal(course.cones[0].visible, false);
    assert.equal(course.cones[1].visible, false);
    plugin.setEnabled(true);
    const cone = course.cones[0];
    const start = cone.position.clone();
    const rotation = cone.quaternion.clone();
    const transform = bodies[0].getWorldTransform();
    const offset = new Ammo.btVector3(start.x + 4, start.y, start.z);
    transform.setOrigin(offset);
    bodies[0].setCenterOfMassTransform(transform);
    Ammo.destroy(offset);
    plugin.captureVisuals(false);
    plugin.interpolate(0.25);
    assert.ok(Math.abs(cone.position.x - start.x - 1) < 1e-5);
    plugin.reset();
    plugin.captureVisuals(true);
    plugin.interpolate(0.5);
    assert.ok(cone.position.distanceTo(start) < 1e-5);
    assert.ok(cone.quaternion.angleTo(rotation) < 1e-3);
  } finally {
    physics.dispose();
  }
});

test('shared pose interpolation handles rotation, snapping, and inactive objects', () => {
  const object = new THREE.Group();
  let active = true;
  const visuals = createPhysicsVisuals([object], () => active);
  object.position.x = 4;
  object.rotation.y = Math.PI;
  visuals.capture();
  visuals.interpolate(0.5);
  assert.equal(object.position.x, 2);
  assert.ok(Math.abs(object.rotation.y - Math.PI / 2) < 1e-6);
  object.position.x = 8;
  visuals.capture(true);
  visuals.interpolate(0);
  assert.equal(object.position.x, 8);
  active = false;
  object.position.x = 10;
  visuals.capture();
  visuals.interpolate(1);
  assert.equal(object.position.x, 10);
});

test('registered cones report real Ammo vehicle collisions and disabled cones do not', () => {
  const { physics, course, hits } = fixture();
  try {
    const plugin = physics.addPlugin((context) => {
      const origin = context.vehicleBody.getWorldTransform().getOrigin();
      course.cones[0].position.set(origin.x() + 0.6, origin.y(), origin.z());
      return createConePhysics(context, { course, audio: { hitCone() {} } });
    });
    plugin.setEnabled(false);
    physics.reset();
    physics.step();
    assert.deepEqual(hits, []);
    plugin.setEnabled(true);
    physics.reset();
    for (let i = 0; i < 10; i++) {
      physics.step();
      physics.captureVisuals();
    }
    assert.ok(hits.includes(0), 'cone collision reaches the lap timer through plugin hooks');
  } finally {
    physics.dispose();
  }
});

test('turn signs topple silently on terrain, reset, and follow visibility and course direction', () => {
  const { physics, hits } = fixture();
  const groups = [new THREE.Group(), new THREE.Group()];
  groups[1].visible = false;
  const signs = groups.map((group, index) => {
    const sign = new THREE.Group();
    sign.position.set(6 + index * 4, 0, 0);
    sign.rotation.y = 0.4;
    group.add(sign);
    return sign;
  });
  const starts = signs.map((sign) => ({
    position: sign.position.clone(),
    rotation: sign.quaternion.clone(),
  }));
  const bodies = [];
  const clanks = [];
  const destroy = Ammo.destroy;
  const destroyed = [];
  let context;
  try {
    physics.addPlugin((value) => {
      context = value;
      const updateAabb = value.world.updateSingleAabb.bind(value.world);
      value.world.updateSingleAabb = (body) => {
        assert.notEqual(
          Ammo.getPointer(body.getBroadphaseHandle()),
          0,
          'never update the AABB of a body removed from the world',
        );
        updateAabb(body);
      };
      return createTurnSignPhysics(
        {
          ...value,
          createRigidBody(...args) {
            const body = value.createRigidBody(...args);
            bodies.push(body);
            return body;
          },
        },
        groups,
        { hitTurnSign: (impulse) => clanks.push(impulse) },
      );
    });
    const membership = [];
    const add = context.world.addRigidBody.bind(context.world);
    const remove = context.world.removeRigidBody.bind(context.world);
    context.world.addRigidBody = (body) => {
      membership.push(['add', bodies.indexOf(body)]);
      add(body);
    };
    context.world.removeRigidBody = (body) => {
      membership.push(['remove', bodies.indexOf(body)]);
      remove(body);
    };
    physics.reset();
    for (let i = 0; i < 120; i++) physics.step();
    physics.captureVisuals(true);
    assert.ok(signs[0].position.distanceTo(starts[0].position) < 1e-5, 'unhit sign stays planted');
    const impulse = new Ammo.btVector3(45, 0, 0);
    const lever = new Ammo.btVector3(0, 0.8, 0);
    bodies[0].activate(true);
    bodies[0].applyImpulse(impulse, lever);
    Ammo.destroy(impulse);
    Ammo.destroy(lever);
    for (let i = 0; i < 240; i++) {
      physics.step();
      physics.captureVisuals();
    }
    physics.interpolate(1);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(signs[0].quaternion);
    assert.ok(up.y < 0.5, `sign knocked over: up.y=${up.y}`);
    assert.deepEqual(clanks, [], 'falling sign does not clank on terrain');
    assert.deepEqual(hits, [], 'sign collisions do not count as cone penalties');
    physics.reset();
    physics.interpolate(0.5);
    assert.ok(signs[0].position.distanceTo(starts[0].position) < 1e-5);
    assert.ok(signs[0].quaternion.angleTo(starts[0].rotation) < 1e-3);
    groups[0].visible = false;
    groups[1].visible = true;
    physics.step();
    assert.deepEqual(membership, [
      ['remove', 0],
      ['add', 1],
    ]);
    groups[1].visible = false;
    physics.step();
    assert.deepEqual(membership.at(-1), ['remove', 1]);
    groups[0].visible = true;
    physics.reset();
    assert.deepEqual(membership.at(-1), ['add', 0]);
    Ammo.destroy = (object) => {
      destroyed.push(Ammo.getClass(object));
      destroy(object);
    };
    physics.dispose();
    physics.dispose();
    assert.equal(destroyed.filter((type) => type === Ammo.btRigidBody).length, 4);
    assert.equal(destroyed.filter((type) => type === Ammo.btCompoundShape).length, 1);
    assert.equal(destroyed.filter((type) => type === Ammo.btBoxShape).length, 2);
  } finally {
    physics.dispose();
    Ammo.destroy = destroy;
  }
});

test('vehicle collisions wake planted signs and trigger clanks without cone penalties', () => {
  const { physics, hits } = fixture();
  const group = new THREE.Group();
  const sign = new THREE.Group();
  sign.position.set(0.6, 0, 0);
  group.add(sign);
  const clanks = [];
  try {
    physics.addPlugin((context) =>
      createTurnSignPhysics(context, [group], {
        hitTurnSign: (impulse) => clanks.push(impulse),
      }),
    );
    physics.reset();
    for (let i = 0; i < 120; i++) {
      physics.step();
      physics.captureVisuals();
    }
    physics.interpolate(1);
    assert.ok(clanks.length > 0, 'car impact triggers metallic sound');
    assert.ok(sign.quaternion.angleTo(new THREE.Quaternion()) > 0.2, 'car wakes and rotates sign');
    assert.deepEqual(hits, []);
  } finally {
    physics.dispose();
  }
});

test('sign clanks only for car contacts in either manifold order', () => {
  const { physics } = fixture();
  const group = new THREE.Group();
  group.add(new THREE.Group(), new THREE.Group());
  const bodies = [];
  const clanks = [];
  let pair;
  let vehicle;
  const dispatcher = {
    getNumManifolds: () => (pair ? 1 : 0),
    getManifoldByIndexInternal: () => ({
      getBody0: () => pair[0],
      getBody1: () => pair[1],
      getNumContacts: () => 1,
      getContactPoint: () => ({
        getDistance: () => -0.01,
        getAppliedImpulse: () => 10,
      }),
    }),
  };
  try {
    const plugin = physics.addPlugin((context) => {
      vehicle = context.vehicleBody;
      return createTurnSignPhysics(
        {
          ...context,
          dispatcher,
          createRigidBody(...args) {
            const body = context.createRigidBody(...args);
            bodies.push(body);
            return body;
          },
        },
        [group],
        { hitTurnSign: (impulse) => clanks.push(impulse) },
      );
    });
    pair = [bodies[0], bodies[1]];
    plugin.afterStep();
    pair = [bodies[1], bodies[0]];
    plugin.afterStep();
    assert.deepEqual(clanks, [], 'sign-to-sign impacts are silent');
    pair = [vehicle, bodies[0]];
    plugin.afterStep();
    assert.deepEqual(clanks, [10]);
    plugin.afterStep();
    assert.deepEqual(clanks, [10], 'car impacts retain their cooldown');
    plugin.beforeStep(0.21);
    pair = [bodies[0], vehicle];
    plugin.afterStep();
    assert.deepEqual(clanks, [10, 10]);
  } finally {
    physics.dispose();
  }
});

test('moving vehicle strikes sleeping cones and signs from a distance', () => {
  for (const kind of ['cone', 'sign']) {
    const { physics, course, hits } = fixture();
    const object = course.cones[0];
    object.position.set(0, kind === 'cone' ? 0.095 : 0, 8);
    object.quaternion.identity();
    const start = object.position.clone();
    const group = new THREE.Group();
    group.add(object);
    let body;
    const sounds = [];
    try {
      const plugin = physics.addPlugin((context) => {
        body = context.vehicleBody;
        if (kind === 'cone')
          return createConePhysics(context, {
            course,
            audio: { hitCone: (impulse) => sounds.push(impulse) },
          });
        return createTurnSignPhysics(context, [group], {
          hitTurnSign: (impulse) => sounds.push(impulse),
        });
      });
      if (kind === 'cone') plugin.setEnabled(true, true);
      const signGroups = [new THREE.Group(), new THREE.Group()];
      signGroups[1].visible = false;
      signGroups.forEach((group, direction) => {
        for (let i = 0; i < 3; i++) {
          const sign = new THREE.Group();
          sign.position.set(20 + direction * 5, 0, i * 3);
          group.add(sign);
        }
      });
      physics.addPlugin((context) =>
        createTurnSignPhysics(context, signGroups, { hitTurnSign() {} }),
      );
      physics.reset();
      for (let i = 0; i < 360; i++) {
        physics.step();
        physics.captureVisuals();
        physics.interpolate(0.5);
      }
      const velocity = new Ammo.btVector3(0, 0, 15);
      body.setLinearVelocity(velocity);
      Ammo.destroy(velocity);
      for (let i = 0; i < 120; i++) {
        physics.step();
        physics.captureVisuals();
        physics.interpolate(0.5);
      }
      assert.ok(object.position.distanceTo(start) > 0.5, `${kind} moves after car impact`);
      assert.ok(sounds.length > 0, `${kind} impact is audible`);
      if (kind === 'cone') assert.ok(hits.includes(0));
    } finally {
      physics.dispose();
    }
  }
});
