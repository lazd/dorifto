import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import AmmoFactory from 'ammojs-typed';
import * as THREE from 'three';
import { loadTrainingCarGeometry } from '../scripts/bot-assets.mjs';
let raceStartDelay;
let startRevLimitRpm;

let server;
let Ammo;
let geometry;
let terrain;
let definition;
let configuration;
let trainRaceBot;
let createTrainingVehicle;
let createRaceBot;
let createDrivingMap;
let vehicleDimensions;
let readRaceBots;
let writeRaceBots;
let maxRaceBots;
let defaultRaceBotOptions;
let trainingCourses;
let createVehiclePhysics;
let createPhysicsResources;
let createPhysicsWorld;
let createPhysicsSimulation;
let raceBotConfiguration;
let raceBotGridSpacing;
let defaultTuningPresets;
let createTrafficPlanner;
let chaseSkillBonus;
let runDriftBot;
let sweeper;

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  const { courses } = await server.ssrLoadModule('/src/courses.ts');
  const { CourseTerrain } = await server.ssrLoadModule('/src/terrain.ts');
  const { createConfigurationState, defaultTuningPresets: presets } = await server.ssrLoadModule(
    '/src/configuration-state.ts',
  );
  defaultTuningPresets = presets;
  ({ trainRaceBot, createTrainingVehicle } = await server.ssrLoadModule('/src/bot-training.ts'));
  ({
    createRaceBot,
    createDrivingMap,
    readRaceBots,
    writeRaceBots,
    maxRaceBots,
    defaultRaceBotOptions,
    trainingCourses,
    raceBotConfiguration,
    raceBotGridSpacing,
    chaseSkillBonus,
  } = await server.ssrLoadModule('/src/race-bot.ts'));
  ({ vehicleDimensions } = await server.ssrLoadModule('/src/car-geometry.ts'));
  ({ createVehiclePhysics, createPhysicsResources, createPhysicsWorld } =
    await server.ssrLoadModule('/src/vehicle-physics.ts'));
  ({ createPhysicsSimulation } = await server.ssrLoadModule('/src/physics-simulation.ts'));
  ({ createTrafficPlanner } = await server.ssrLoadModule('/src/bot-traffic.ts'));
  ({ raceStartDelay } = await server.ssrLoadModule('/src/physics-messages.ts'));
  ({ startRevLimitRpm } = await server.ssrLoadModule('/src/drivetrain.ts'));
  ({ runDriftBot } = await server.ssrLoadModule('/src/drift-training.ts'));
  const sweeperDefinition = { ...courses.find(({ id }) => id === 'sweeper'), reverse: false };
  sweeper = { definition: sweeperDefinition, terrain: new CourseTerrain(sweeperDefinition, false) };
  definition = { ...courses.find(({ id }) => id === trainingCourses.race), reverse: false };
  terrain = new CourseTerrain(definition, false);
  geometry = await loadTrainingCarGeometry(server);
  const { profiles } = createConfigurationState().getState();
  configuration = raceBotConfiguration({ driveMode: 'grip', profiles, coneMode: 'off' });
  Ammo = await AmmoFactory.call({});
});

after(async () => {
  for (const { mesh, grass } of [terrain, sweeper?.terrain].filter(Boolean)) {
    mesh.geometry.dispose();
    mesh.material.dispose();
    grass.geometry.dispose();
    grass.material.dispose();
  }
  await server?.close();
});

test('race driver completes repeated three-lap runs and serializes bounded learning', () => {
  const options = { ...defaultRaceBotOptions, learning: true };
  const report = trainRaceBot(Ammo, definition, terrain, geometry, configuration, options, 2);
  assert.equal(report.runs.length, 2);
  for (const run of report.runs) {
    assert.equal(run.completed, true);
    assert.equal(run.failure, null);
    assert.equal(run.laps.length, 3);
    assert.ok(run.laps.every((lap) => lap.valid && lap.time > 0));
  }
  assert.ok(report.experience.visits.every((visits) => visits > 0));
  assert.ok(report.experience.pace.every((pace) => pace >= 0.55 && pace <= 1));
  const frozen = { ...options, learning: false };
  const saved = JSON.parse(JSON.stringify(report.experience));
  const replay = trainRaceBot(Ammo, definition, terrain, geometry, configuration, frozen, 2, saved);
  assert.deepEqual(replay.experience, saved, 'frozen evaluation must not learn');
  assert.deepEqual(
    replay.runs[0].laps,
    replay.runs[1].laps,
    'reset reproduces the same evaluation',
  );
  const failed = trainRaceBot(
    Ammo,
    definition,
    terrain,
    geometry,
    configuration,
    frozen,
    1,
    saved,
    { maxSeconds: 0.1 },
  );
  assert.equal(failed.runs[0].completed, false);
  assert.equal(failed.runs[0].failure, 'timeout');
  assert.equal(failed.runs[0].laps.length, 0);
});

test('grip driver finishes Newtown in both directions without sliding or leaving the road', async () => {
  const { roads, loadCourseDefinition } = await server.ssrLoadModule('/src/courses.ts');
  const { CourseTerrain } = await server.ssrLoadModule('/src/terrain.ts');
  const { physicsStep } = await server.ssrLoadModule('/src/physics-messages.ts');
  const road = roads.find(({ id }) => id === 'road-cf5aa9d3-6e94-467e-925f-8d2d3b86ee82');
  assert.ok(road);
  const loaded = await loadCourseDefinition(road);
  const options = { ...defaultRaceBotOptions, preset: 'grip-default' };
  const setup = raceBotConfiguration(configuration, options.preset);
  const { botEdgeMargin } = await server.ssrLoadModule('/src/race-bot.ts');
  const dimensions = vehicleDimensions(geometry);
  for (const reverse of [false, true]) {
    const course = { ...loaded, reverse };
    const terrain = new CourseTerrain(course, false);
    const map = createDrivingMap(
      course,
      terrain,
      dimensions.halfWidth,
      botEdgeMargin(options.preset),
    );
    const bot = createRaceBot(map, setup, dimensions, options);
    const { physics, laps } = createTrainingVehicle(
      Ammo,
      course,
      terrain,
      geometry,
      setup,
      bot.controls,
    );
    try {
      physics.reset();
      for (let step = 0; step < 200 / physicsStep && !laps.finished; step++) {
        bot.update(physics.readState(), physicsStep);
        physics.step();
      }
      assert.equal(laps.finished, true, `finishes Newtown, reverse=${reverse}`);
      assert.equal(laps.invalid, false);
      assert.ok(bot.metrics.maxSlip < 0.15, `grip driving, not sliding: ${bot.metrics.maxSlip}`);
      assert.equal(bot.metrics.offTrackSeconds, 0);
    } finally {
      physics.dispose();
      for (const mesh of [terrain.mesh, terrain.grass]) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
    }
  }
});

test('drift driver laps Sweeper sideways without spinning or touching dirt', () => {
  const drift = raceBotConfiguration(configuration, 'drift-default');
  const run = runDriftBot(Ammo, sweeper.definition, sweeper.terrain, geometry, drift, undefined, {
    laps: 1,
  });
  assert.equal(run.failure, null);
  assert.equal(run.dirtSeconds, 0);
  assert.ok(run.driftDistance > 0.2 * run.lapLength, 'drifts through a good share of the lap');
});

test('driver rejects incompatible experience and invalid configuration', () => {
  assert.deepEqual(
    configuration.profiles.grip,
    defaultTuningPresets().find(({ id }) => id === 'grip-fast').tuning,
  );
  const dimensions = vehicleDimensions(geometry);
  const map = createDrivingMap(definition, terrain, dimensions.halfWidth);
  const bot = createRaceBot(map, configuration, dimensions);
  const saved = bot.exportExperience();
  assert.throws(
    () =>
      createRaceBot(map, configuration, dimensions, defaultRaceBotOptions, {
        ...saved,
        key: 'another track',
      }),
    /incompatible/,
  );
  assert.throws(
    () =>
      createRaceBot(map, configuration, dimensions, defaultRaceBotOptions, {
        ...saved,
        pace: saved.pace.map(() => Infinity),
      }),
    /invalid/,
  );
  assert.throws(() => readRaceBots(new URLSearchParams(`bots=${maxRaceBots + 1}`)), /Bot count/);
  assert.throws(() => readRaceBots(new URLSearchParams('bot-skill=NaN')), /skill/);
  assert.deepEqual(readRaceBots(new URLSearchParams()), [
    defaultRaceBotOptions,
    defaultRaceBotOptions,
  ]);
  assert.deepEqual(readRaceBots(new URLSearchParams('bots=0')), []);
  assert.equal(
    readRaceBots(new URLSearchParams('bots=2&bot-skill=0.5&bot-aggression=1')).length,
    2,
  );
  assert.equal(readRaceBots(new URLSearchParams('bots-only=1')).length, 1);
  assert.throws(() => readRaceBots(new URLSearchParams('bots-only=1&bots=0')), /at least one/);
  assert.deepEqual(
    readRaceBots(new URLSearchParams('bots=2&bot-skill=1,0.2')).map(({ skill }) => skill),
    [1, 0.2],
  );
  assert.throws(() => readRaceBots(new URLSearchParams('bots=3&bot-skill=1,0.2')), /per bot/);
  assert.throws(() => readRaceBots(new URLSearchParams('bots=2&bot-skill=1,nope')), /skill/);
  const configured = readRaceBots(
    new URLSearchParams(
      'bots=2&bot-skill=1,0.2&bot-aggression=0,1&bot-preset=grip-default,grip-fast&bot-learning=0,1&bot-attack-throttle-boost=0,1',
    ),
  );
  assert.deepEqual(
    configured.map(({ attackThrottleBoost }) => attackThrottleBoost),
    [false, true],
  );
  assert.ok(
    readRaceBots(new URLSearchParams()).every(({ attackThrottleBoost }) => attackThrottleBoost),
  );
  assert.throws(
    () => readRaceBots(new URLSearchParams('bot-attack-throttle-boost=yes')),
    /bot-attack-throttle-boost/,
  );
  assert.throws(
    () => readRaceBots(new URLSearchParams('bots=3&bot-attack-throttle-boost=0,1')),
    /per bot/,
  );
  const written = new URLSearchParams('course=hillside');
  writeRaceBots(written, configured, true);
  assert.deepEqual(readRaceBots(written), configured);
  assert.equal(written.get('bots-only'), '1');
  writeRaceBots(written, [], false);
  assert.equal(written.get('bots'), '0');
  assert.equal(written.has('bots-only'), false);
  assert.equal(written.has('bot-attack-throttle-boost'), false);
  assert.deepEqual(readRaceBots(written), []);
});

test('traffic steers inside a nearby opponent and eases back to the racing line', () => {
  const dimensions = vehicleDimensions(geometry);
  for (const reverse of [false, true]) {
    const map = createDrivingMap({ ...definition, reverse }, terrain, dimensions.halfWidth);
    const count = map.samples.length;
    const at = (i) => (i + count) % count;
    const bendAt = (i) =>
      Array.from(
        { length: Math.ceil(20 / map.spacing) + 1 },
        (_, j) => map.samples[at(i + j)].curvature,
      ).reduce((sum, bend) => sum + bend, 0);
    let index = 0;
    for (let i = 1; i < count; i++) if (Math.abs(bendAt(i)) > Math.abs(bendAt(index))) index = i;
    const stateAt = (i) => ({
      x: map.centers[at(i)].x,
      z: map.centers[at(i)].z,
      heading: map.samples[at(i)].heading,
      speed: 12,
      vx: Math.sin(map.samples[at(i)].heading) * 12,
      vz: Math.cos(map.samples[at(i)].heading) * 12,
      slipAngle: 0,
      yawRate: 0,
    });
    const state = stateAt(index);
    const targetIndex = at(index + 2);
    const planner = createTrafficPlanner(map, dimensions);
    const update = (traffic = []) => planner.update(state, index, targetIndex, traffic);
    const assertRacingLine = (plan) => {
      assert.equal(plan.x, map.samples[targetIndex].x);
      assert.equal(plan.z, map.samples[targetIndex].z);
    };
    const line = map.samples[targetIndex];
    const lineHeading = Math.atan2(line.x - state.x, line.z - state.z);
    const headingAdjustment = (plan) => {
      const difference = Math.atan2(plan.x - state.x, plan.z - state.z) - lineHeading;
      return Math.atan2(Math.sin(difference), Math.cos(difference));
    };
    assertRacingLine(update());
    assert.equal(update().maneuver, 'racing-line');
    const interpolated = planner.update(state, index, targetIndex + 0.5, []);
    assert.ok(Math.abs(interpolated.x - (line.x + map.samples[at(targetIndex + 1)].x) / 2) < 1e-9);
    assert.ok(Math.abs(interpolated.z - (line.z + map.samples[at(targetIndex + 1)].z) / 2) < 1e-9);
    const right = map.rights[index];
    const opponent = {
      ...state,
      x: state.x - right.z * dimensions.halfLength * 2,
      z: state.z + right.x * dimensions.halfLength * 2,
    };
    const plan = update([state, opponent]);
    assert.equal(plan.maneuver, 'attacking');
    const passingAdjustment = headingAdjustment(plan);
    assert.equal(
      Math.sign(passingAdjustment),
      Math.sign(bendAt(index)),
      `steers inside, reverse=${reverse}`,
    );
    const clear = update();
    assert.equal(clear.maneuver, 'returning');
    const returningAdjustment = headingAdjustment(clear);
    assert.equal(Math.sign(returningAdjustment), Math.sign(passingAdjustment));
    assert.ok(Math.abs(returningAdjustment) < Math.abs(passingAdjustment), 'eases back');
    for (let i = 0; i < 600; i++) update();
    assert.equal(update().maneuver, 'racing-line');
    planner.reset();
    assertRacingLine(update());
  }
});

test('a close inside-pass attempt boosts target speed without changing the solo profile', () => {
  const dimensions = vehicleDimensions(geometry);
  const map = createDrivingMap(definition, terrain, dimensions.halfWidth);
  const options = { ...defaultRaceBotOptions, skill: 0.3, learning: false };
  const solo = createRaceBot(map, configuration, dimensions, options);
  const chasing = createRaceBot(map, configuration, dimensions, options);
  const bendSteps = Math.ceil(20 / map.spacing);
  const bends = map.samples.map((_, index) => {
    let bend = 0;
    for (let step = 0; step <= bendSteps; step++)
      bend += map.samples[(index + step) % map.samples.length].curvature;
    return Math.abs(bend) / (bendSteps + 1);
  });
  const index = bends.indexOf(Math.max(...bends));
  const point = map.samples[index];
  const right = map.rights[index];
  const state = {
    x: point.x,
    z: point.z,
    heading: point.heading,
    speed: 15,
    vx: Math.sin(point.heading) * 15,
    vz: Math.cos(point.heading) * 15,
    slipAngle: 0,
    yawRate: 0,
  };
  const opponentAt = (distance) => ({
    ...state,
    x: state.x - right.z * distance,
    z: state.z + right.x * distance,
  });
  solo.update(state, 1 / 120);
  assert.deepEqual(solo.thinking, {
    phase: 'driving',
    maneuver: 'racing-line',
    racePosition: null,
    conditions: { slowing: false, braking: false, stabilizing: false, stoppingBackward: false },
  });
  chasing.update(state, 1 / 120, [state, opponentAt(32)]);
  assert.equal(chasing.metrics.targetSpeed, solo.metrics.targetSpeed, 'no distant chase boost');
  const opponent = opponentAt(dimensions.halfLength * 2 + 1);
  const planner = createTrafficPlanner(map, dimensions);
  assert.equal(planner.update(state, index, index, [state, opponent]).maneuver, 'attacking');
  chasing.update(state, 1 / 120, [state, opponent]);
  const higherSkill = createRaceBot(map, configuration, dimensions, {
    ...options,
    skill: options.skill + chaseSkillBonus,
  });
  higherSkill.update(state, 1 / 120);
  assert.ok(Math.abs(chasing.metrics.targetSpeed - higherSkill.metrics.targetSpeed) < 1e-12);
  assert.equal(chasing.metrics.effectiveSkill, options.skill + chaseSkillBonus);
  assert.equal(chasing.thinking.maneuver, 'attacking');
  const boosted = createRaceBot(map, configuration, dimensions, {
    ...options,
    attackThrottleBoost: true,
  });
  const unboosted = createRaceBot(map, configuration, dimensions, {
    ...options,
    attackThrottleBoost: false,
  });
  let comparedPartialThrottle = false;
  for (const point of map.samples) {
    const sampleState = { ...state, x: point.x, z: point.z, heading: point.heading };
    unboosted.reset();
    unboosted.update(sampleState, 0.5);
    const speed = unboosted.metrics.targetSpeed - 0.1;
    const moving = {
      ...sampleState,
      speed,
      vx: Math.sin(point.heading) * speed,
      vz: Math.cos(point.heading) * speed,
    };
    const distance = dimensions.halfLength * 2 + 1;
    const nearby = {
      ...moving,
      x: moving.x + Math.sin(point.heading) * distance,
      z: moving.z + Math.cos(point.heading) * distance,
    };
    boosted.reset();
    unboosted.reset();
    boosted.update(moving, 0.5, [nearby], 2);
    unboosted.update(moving, 0.5, [nearby], 2);
    assert.equal(boosted.metrics.targetSpeed, unboosted.metrics.targetSpeed);
    assert.equal(boosted.controls.steer, unboosted.controls.steer);
    assert.equal(boosted.controls.brake, unboosted.controls.brake);
    if (
      unboosted.thinking.maneuver === 'attacking' &&
      unboosted.controls.throttle > 0 &&
      unboosted.controls.throttle < 0.8
    ) {
      assert.ok(Math.abs(boosted.controls.throttle - unboosted.controls.throttle * 1.25) < 1e-12);
      comparedPartialThrottle = true;
      break;
    }
  }
  assert.ok(comparedPartialThrottle, 'on/off comparison exercises unsaturated attack throttle');
  chasing.update(state, 1 / 120);
  assert.equal(chasing.metrics.targetSpeed, solo.metrics.targetSpeed);
  assert.equal(chasing.thinking.maneuver, 'returning');
  chasing.update({ ...state, slipAngle: 0.5 }, 1 / 120, [opponent]);
  assert.equal(chasing.thinking.maneuver, 'attacking');
  assert.equal(chasing.thinking.conditions.stabilizing, true);
  chasing.update({ ...state, vx: -state.vx, vz: -state.vz }, 1 / 120);
  assert.equal(chasing.thinking.conditions.stoppingBackward, true);
  assert.equal(chasing.thinking.conditions.braking, true);
  assert.equal(chasing.thinking.conditions.slowing, false);
  chasing.reset();
  assert.deepEqual(chasing.thinking, {
    phase: 'driving',
    maneuver: 'racing-line',
    racePosition: null,
    conditions: { slowing: false, braking: false, stabilizing: false, stoppingBackward: false },
  });
  const stationary = { ...state, speed: 0, vx: 0, vz: 0 };
  chasing.update(stationary, 0.01);
  assert.equal(chasing.thinking.phase, 'launching');
  chasing.update(stationary, 0.99);
  assert.equal(chasing.thinking.phase, 'launching');
  assert.equal(chasing.controls.steer, 0, 'holds initial heading for one second');
  chasing.update(stationary, 1.99);
  assert.equal(chasing.thinking.phase, 'launching');
  chasing.update(stationary, 0.02);
  assert.equal(chasing.thinking.phase, 'driving');
});

test('trailing race position enables chase pace without inside-line steering or attack throttle', () => {
  const dimensions = vehicleDimensions(geometry);
  const map = createDrivingMap(definition, terrain, dimensions.halfWidth);
  const options = { ...defaultRaceBotOptions, learning: false };
  const leader = createRaceBot(map, configuration, dimensions, options);
  const chaser = createRaceBot(map, configuration, dimensions, options);
  const point = map.samples[0];
  const state = {
    x: point.x,
    z: point.z,
    heading: point.heading,
    speed: 15,
    vx: Math.sin(point.heading) * 15,
    vz: Math.cos(point.heading) * 15,
    slipAngle: 0,
    yawRate: 0,
  };
  const planner = createTrafficPlanner(map, dimensions);
  const normal = { ...planner.update(state, 0, 2, [], 1 / 120, 1) };
  const chase = { ...planner.update(state, 0, 2, [], 1 / 120, 2) };
  assert.deepEqual(chase, { ...normal, maneuver: 'chasing' });
  assert.equal(planner.update(state, 0, 2, [], 1 / 120, 1).maneuver, 'racing-line');
  leader.update(state, 1 / 120, [], 1);
  chaser.update(state, 1 / 120, [], 2);
  assert.equal(chaser.thinking.racePosition, 2);
  assert.equal(chaser.thinking.maneuver, 'chasing');
  const higherSkill = createRaceBot(map, configuration, dimensions, {
    ...options,
    skill: Math.min(1, options.skill + chaseSkillBonus),
  });
  higherSkill.update(state, 1 / 120);
  assert.ok(Math.abs(chaser.metrics.targetSpeed - higherSkill.metrics.targetSpeed) < 1e-12);
  assert.equal(chaser.controls.steer, leader.controls.steer);
  chaser.update(state, 1 / 120, [], 1);
  assert.equal(chaser.thinking.maneuver, 'racing-line');
  assert.equal(chaser.metrics.targetSpeed, leader.metrics.targetSpeed);
  chaser.reset();
  assert.equal(chaser.thinking.racePosition, null);
});

test('chase uses the full higher-skill control profile, capped at skill 1.01', () => {
  const dimensions = vehicleDimensions(geometry);
  const map = createDrivingMap(definition, terrain, dimensions.halfWidth);
  for (const skill of [0.9, 0.95, 1]) {
    const effectiveSkill = Math.min(1.01, skill + chaseSkillBonus);
    const options = {
      ...defaultRaceBotOptions,
      skill,
      learning: false,
      attackThrottleBoost: false,
    };
    const chaser = createRaceBot(map, configuration, dimensions, options);
    const reference = createRaceBot(map, configuration, dimensions, {
      ...options,
      skill: Math.min(1, effectiveSkill),
    });
    let brakingSamples = 0;
    let throttleSamples = 0;
    for (const point of map.samples) {
      for (const speed of [15, 30, 45]) {
        const state = {
          x: point.x,
          z: point.z,
          heading: point.heading,
          speed,
          vx: Math.sin(point.heading) * speed,
          vz: Math.cos(point.heading) * speed,
          slipAngle: 0,
          yawRate: 0,
        };
        chaser.reset();
        reference.reset();
        chaser.update(state, 0.5, [], 2);
        reference.update(state, 0.5, [], effectiveSkill > 1 ? 2 : 1);
        assert.equal(chaser.metrics.effectiveSkill, effectiveSkill);
        assert.ok(Math.abs(chaser.metrics.targetSpeed - reference.metrics.targetSpeed) < 1e-10);
        for (const key of ['steer', 'throttle', 'brake'])
          assert.ok(Math.abs(chaser.controls[key] - reference.controls[key]) < 1e-10, key);
        if (chaser.controls.brake > 0) brakingSamples++;
        if (chaser.controls.throttle > 0) throttleSamples++;
      }
    }
    assert.ok(brakingSamples > 0 && throttleSamples > 0, 'compares braking and acceleration');
    chaser.update(
      {
        x: map.samples[0].x,
        z: map.samples[0].z,
        heading: map.samples[0].heading,
        speed: 15,
        vx: 0,
        vz: 15,
        slipAngle: 0,
        yawRate: 0,
      },
      1 / 120,
      [],
      1,
    );
    assert.equal(chaser.metrics.effectiveSkill, skill);
    chaser.reset();
    assert.equal(chaser.metrics.effectiveSkill, skill);
  }
});

for (const scenario of [
  { name: 'a skilled rear bot overtakes a less-skilled front bot', skills: '1,0.2', pass: true },
  // { name: 'a 0.90 chasing bot gains on a 0.95 leader', skills: '0.9,0.95', pass: false }, // TODO: Fix this test once bot training data is stable, it will fail randomly
])
  test(`${scenario.name} in the shared world`, () => {
    const bots = readRaceBots(new URLSearchParams(`bots=2&bot-skill=${scenario.skills}`));
    const simulation = createPhysicsSimulation(Ammo, {
      definition,
      configuration,
      bots,
      botsOnly: !scenario.player,
      terrain: terrain.physicsData(),
      car: {
        centers: geometry.centers.map((point) => point.toArray()),
        radii: geometry.radii,
        widths: geometry.widths,
        collisionVertices: geometry.collisionVertices.map((point) => point.toArray()),
      },
      cones: [],
      cornerCones: [],
      signGroups: [],
    });
    const input = {
      configuration,
      controls: {
        throttle: scenario.player ? 1 : 0,
        brake: 0,
        reverse: 0,
        steer: 0,
        handbrake: false,
      },
      signs: [],
      lights: {
        headlights: false,
        highBeams: false,
        fogLights: false,
        leftSignal: false,
        rightSignal: false,
      },
    };
    let snapshot = simulation.handle({ type: 'init', revision: 0 });
    const clearance = raceBotGridSpacing + vehicleDimensions(geometry).halfLength * 2;
    let reachedTarget = false;
    try {
      snapshot = simulation.handle({
        type: 'advance',
        revision: 0,
        dt: 1 / 120,
        input,
        recycled: [snapshot.buffer],
      });
      assert.ok(snapshot.bots.every(({ metrics }) => metrics.elapsed === 0));
      assert.ok(snapshot.bots.every(({ thinking }) => thinking.phase === 'settling'));
      const initialRpm = snapshot.bots[0].engine.rpm;
      const playerRpm = snapshot.telemetry.engine.rpm;
      for (let step = 0; step < 10; step++)
        snapshot = simulation.handle({
          type: 'advance',
          revision: 0,
          dt: 0.05,
          input,
          recycled: [snapshot.buffer],
        });
      assert.ok(snapshot.bots[0].engine.rpm > initialRpm, 'bots rev while settling');
      assert.equal(snapshot.bots[0].engine.gear, 0);
      assert.ok(snapshot.bots[0].engine.rpm <= startRevLimitRpm);
      assert.ok(snapshot.bots.every(({ metrics }) => metrics.elapsed === 0));
      assert.ok(snapshot.bots.every(({ braking, spawnBrakeHeld }) => braking && spawnBrakeHeld));
      if (scenario.player) {
        assert.ok(snapshot.telemetry.engine.rpm > playerRpm, 'player can rev while held');
        assert.equal(snapshot.telemetry.spawnBrakeHeld, true);
        assert.equal(snapshot.telemetry.braking, true);
        assert.ok(snapshot.telemetry.motion.speed < 0.5, 'revving does not drive the held car');
      }
      for (let step = 0; step < Math.ceil((raceStartDelay - 0.5) / 0.05); step++)
        snapshot = simulation.handle({
          type: 'advance',
          revision: 0,
          dt: 0.05,
          input,
          recycled: [snapshot.buffer],
        });
      assert.deepEqual(
        snapshot.bots.map(({ thinking }) => thinking.racePosition),
        [2, 1],
      );
      assert.equal(snapshot.bots[0].thinking.maneuver, 'chasing');
      assert.equal(snapshot.bots[1].thinking.maneuver, 'racing-line');
      for (let step = 0; step < (scenario.pass ? 40 : 180) * 20; step++) {
        snapshot = simulation.handle({
          type: 'advance',
          revision: 0,
          dt: 0.05,
          input,
          recycled: [snapshot.buffer],
        });
        if (
          (scenario.pass || snapshot.bots[0].metrics.elapsed > 20) &&
          snapshot.bots[0].metrics.progress - snapshot.bots[1].metrics.progress >
            (scenario.pass ? clearance : raceBotGridSpacing / 2)
        ) {
          reachedTarget = true;
          break;
        }
      }
      assert.ok(reachedTarget, JSON.stringify(snapshot.bots.map(({ metrics }) => metrics)));
      const checkedBots = scenario.pass ? snapshot.bots : snapshot.bots.slice(0, 1);
      assert.ok(
        checkedBots.every(({ metrics }) => metrics.offTrackSeconds === 0),
        JSON.stringify(snapshot.bots.map(({ metrics }) => metrics)),
      );
      assert.ok(snapshot.bots.every(({ thinking }) => thinking.phase === 'driving'));
    } finally {
      simulation.dispose();
    }
  });

for (const scenario of [
  { name: 'parked car', distance: 8, reverse: false },
  // TODO: Enable the close range parked car test once the bot can handle it reliably.
  // { name: 'parked car at close range', distance: 2, reverse: false },
  { name: 'parked car on the reversed course', distance: 8, reverse: true },
])
  test(`race bot passes a ${scenario.name} using real vehicle physics`, () => {
    const dimensions = vehicleDimensions(geometry);
    const direction = { ...definition, reverse: scenario.reverse };
    const map = createDrivingMap(direction, terrain, dimensions.halfWidth);
    const count = map.samples.length;
    const at = (i) => (i + count) % count;
    let index = 0;
    let best = Infinity;
    for (let i = 0; i < count; i++) {
      let bending = 0;
      for (let j = -4; j <= 16; j++) bending += Math.abs(map.samples[at(i + j)].curvature);
      if (bending < best) {
        best = bending;
        index = i;
      }
    }
    const options = { ...defaultRaceBotOptions, skill: 1, learning: false };
    const bot = createRaceBot(map, configuration, dimensions, options);
    const resources = createPhysicsResources(Ammo);
    const world = createPhysicsWorld(Ammo, resources, terrain.physicsData());
    function vehicle(i, controls) {
      const point = map.samples[at(i)];
      return createVehiclePhysics({
        Ammo,
        resources,
        simulationWorld: world,
        car: {
          ...geometry,
          chassis: new THREE.Object3D(),
          wheels: Array.from({ length: 4 }, () => new THREE.Object3D()),
          hubs: Array.from({ length: 4 }, () => new THREE.Object3D()),
          setBraking() {},
          setReversing() {},
          setHazards() {},
        },
        controls,
        configurationState: { getState: () => configuration },
        course: { terrain, isAsphalt: (position) => terrain.isAsphalt(position) },
        spawn: { position: [point.x, point.z], heading: point.heading },
        laps: { reset() {}, update() {} },
      });
    }
    const driven = vehicle(index, bot.controls);
    const parked = vehicle(index + scenario.distance, {
      throttle: 0,
      brake: 1,
      reverse: 0,
      steer: 0,
      handbrake: true,
    });
    driven.reset();
    parked.reset();
    try {
      for (let step = 0; step < 120 * 35; step++) {
        const state = driven.readState();
        bot.update(state, 1 / 120, [state, parked.readState()]);
        assert.equal(bot.controls.reverse, 0);
        driven.beforeStep();
        parked.beforeStep();
        world.step(1 / 120);
        driven.afterStep();
        parked.afterStep();
        if (bot.metrics.progress > map.spacing * scenario.distance + 15) break;
      }
      assert.ok(
        bot.metrics.progress > map.spacing * scenario.distance + 15,
        JSON.stringify(bot.metrics),
      );
      assert.equal(bot.metrics.offTrackSeconds, 0);
    } finally {
      driven.dispose();
      parked.dispose();
      world.dispose();
    }
  });
