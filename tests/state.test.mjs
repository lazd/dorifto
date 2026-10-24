import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let createStore;
let createConfigurationState;
let createGameState;

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  ({ createStore } = await server.ssrLoadModule('/src/store.ts'));
  ({ createConfigurationState } = await server.ssrLoadModule('/src/configuration-state.ts'));
  ({ createGameState } = await server.ssrLoadModule('/src/game-state.ts'));
});

after(async () => {
  await server?.close();
});

test('configuration and game snapshots and notifications are completely independent', () => {
  const configuration = createConfigurationState();
  const game = createGameState();
  const initialConfiguration = configuration.getState();
  assert.equal(initialConfiguration.timeOfDay, 'sunset');
  assert.equal(initialConfiguration.driveMode, 'grip');
  assert.equal(initialConfiguration.selectedTuningPresets.grip, 'grip-default');
  assert.equal(initialConfiguration.cameraStyle, 'cabin');
  let configurationUpdates = 0;
  let gameUpdates = 0;
  configuration.subscribe(() => {
    configurationUpdates++;
  });
  game.subscribe(() => {
    gameUpdates++;
  });

  for (let frame = 0; frame < 1000; frame++) {
    game.update({
      telemetry: { ...game.getState().telemetry, speed: frame },
      controllerStatus: `Controller ${frame}`,
    });
  }
  game.update({ sound: { running: true, failed: false, error: null } });
  game.update({ status: { visible: false, error: false, message: '' } });
  game.update({ focused: false });
  game.update({ lapRecorder: { ...game.getState().lapRecorder, mode: 'ready' } });
  assert.equal(configurationUpdates, 1);
  assert.equal(configuration.getState(), initialConfiguration);
  assert.equal(gameUpdates, 1005);

  const lastGame = game.getState();
  configuration.update({
    driveMode: 'drift',
    stereoStation: 'scrtagnt',
    coneMode: 'off',
    muted: true,
  });
  assert.equal(configurationUpdates, 2, 'one notification per changed configuration batch');
  assert.equal(game.getState(), lastGame);
  assert.equal(gameUpdates, 1005);
  assert.equal('telemetry' in configuration.getState(), false);
  assert.equal('status' in configuration.getState(), false);
  for (const key of Object.keys(initialConfiguration)) {
    assert.equal(key in game.getState(), false, `${key} belongs only to configuration`);
  }
});

test('each configuration subscription runs only when its settings actually change', () => {
  const configuration = createConfigurationState();
  const calls = new Map();
  for (const key of Object.keys(configuration.getState())) {
    calls.set(key, 0);
    configuration.subscribe(() => calls.set(key, calls.get(key) + 1), [key]);
  }
  const original = configuration.getState();
  const profiles = {
    ...original.profiles,
    drift: { ...original.profiles.drift, horsepower: 600 },
  };
  const changes = {
    stereoStation: 'scrtagnt',
    driveMode: 'drift',
    profiles,
    selectedTuningPresets: { ...original.selectedTuningPresets, drift: null },
    coneMode: 'off',
    muted: true,
    cameraStyle: 'fpv',
  };
  for (const [key, value] of Object.entries(changes)) {
    configuration.update({ [key]: value });
    assert.equal(calls.get(key), 2);
    configuration.update({ [key]: value });
    assert.equal(calls.get(key), 2, 'unchanged settings do not notify');
  }
  for (const [key, count] of calls) {
    assert.equal(count, key in changes ? 2 : 1, `${key} ignores unrelated changes`);
  }
});

test('field subscriptions support batches, immutable snapshots, no-ops, and unsubscribe', () => {
  const store = createStore({ a: 1, b: 2, c: 3 });
  const snapshots = [];
  let unfiltered = 0;
  const unsubscribe = store.subscribe((state) => snapshots.push(state), ['a', 'b']);
  store.subscribe(() => {
    unfiltered++;
  });
  store.update({ c: 4 });
  assert.equal(snapshots.length, 1);
  store.update({ a: 1, c: 5 });
  assert.equal(snapshots.length, 1, 'unchanged watched fields in a patch do not notify');
  store.update({ a: 2, b: 3 });
  assert.equal(snapshots.length, 2, 'multiple watched changes notify only once');
  assert.deepEqual(snapshots[0], { a: 1, b: 2, c: 3 });
  assert.deepEqual(snapshots[1], { a: 2, b: 3, c: 5 });
  assert.ok(Object.isFrozen(snapshots[1]));
  store.update({ a: 2 });
  store.update({});
  assert.equal(unfiltered, 4);
  unsubscribe();
  store.update({ a: 3 });
  assert.equal(snapshots.length, 2);
  assert.equal(unfiltered, 5);
});
