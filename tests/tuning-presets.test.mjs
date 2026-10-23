import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let createConfigurationState;
let defaultTuning;
let defaultTuningPresets;
let tuningPresetsStorageKey;
let nextTuningPresetId;
let persistTuningPresets;

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  ({ createConfigurationState, defaultTuning, defaultTuningPresets } = await server.ssrLoadModule(
    '/src/configuration-state.ts',
  ));
  ({ tuningPresetsStorageKey, nextTuningPresetId, persistTuningPresets } =
    await server.ssrLoadModule('/src/tuning-presets.ts'));
});

after(async () => {
  await server?.close();
});

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

test('starts with protected defaults and the captured Drift Aggressive and Grip Fast presets', () => {
  const presets = defaultTuningPresets();
  assert.deepEqual(
    presets.filter(({ mode }) => mode === 'grip').map(({ name }) => name),
    ['Default', 'Fast'],
  );
  assert.deepEqual(presets.find(({ id }) => id === 'grip-default').tuning, defaultTuning('grip'));
  assert.deepEqual(presets.find(({ id }) => id === 'grip-fast').tuning, {
    ...defaultTuning('grip'),
    horsepower: 500,
    frontGrip: 1.1,
    rearGrip: 1.15,
    frontStiffness: 51000,
    rearStiffness: 51000,
  });
  assert.equal(presets.find(({ id }) => id === 'grip-fast').readonly, true);
  assert.deepEqual(presets.find(({ id }) => id === 'drift-default').tuning, defaultTuning('drift'));
  assert.ok(
    presets
      .filter(({ readonly }) => readonly)
      .every(({ id }) =>
        ['drift-default', 'drift-aggressive', 'grip-default', 'grip-fast'].includes(id),
      ),
  );
  assert.equal(presets.find(({ id }) => id === 'drift-aggressive').readonly, true);
  assert.deepEqual(presets.find(({ id }) => id === 'drift-aggressive').tuning, {
    ...defaultTuning('drift'),
    horsepower: 515,
    steeringRate: 2.8,
    steeringScale: 1.03,
    rearStiffness: 43000,
  });
});

test('loads built-ins from code without writing them to storage', () => {
  const storage = createStorage();
  storage.setItem = () => {
    throw new Error('Unexpected storage write');
  };
  assert.deepEqual(
    createConfigurationState(storage).getState().tuningPresets,
    defaultTuningPresets(),
  );
  assert.equal(storage.getItem(tuningPresetsStorageKey), null);
});

test('stores only user presets and combines them with built-ins on load', () => {
  const storage = createStorage();
  const custom = {
    id: 'grip-personal',
    name: 'Personal',
    mode: 'grip',
    tuning: { ...defaultTuning('grip'), horsepower: 420 },
  };
  persistTuningPresets(storage, [...defaultTuningPresets(), custom]);
  const loaded = createConfigurationState(storage).getState().tuningPresets;
  assert.deepEqual(loaded, [...defaultTuningPresets(), custom]);
  persistTuningPresets(storage, loaded);
  const stored = JSON.parse(storage.getItem(tuningPresetsStorageKey));
  assert.equal(stored.length, 1);
  assert.equal(Object.keys(stored[0].tuning).length, 8);
  assert.deepEqual(createConfigurationState(storage).getState().tuningPresets, loaded);
});

test('empty saved presets cannot remove built-ins', () => {
  const storage = createStorage();
  persistTuningPresets(storage, defaultTuningPresets());
  assert.deepEqual(JSON.parse(storage.getItem(tuningPresetsStorageKey)), []);
  assert.deepEqual(
    createConfigurationState(storage).getState().tuningPresets,
    defaultTuningPresets(),
  );
});

test('surfaces failures when saving user presets', () => {
  const storage = createStorage();
  storage.setItem = () => {
    throw new Error('Storage blocked');
  };
  assert.throws(() => persistTuningPresets(storage, []), /Storage blocked/);
});

test('rejects corrupt stored preset data explicitly', () => {
  const storage = createStorage();
  storage.setItem(tuningPresetsStorageKey, '{');
  assert.throws(() => createConfigurationState(storage), /Saved tuning presets are not valid JSON/);
  storage.setItem(
    tuningPresetsStorageKey,
    JSON.stringify([{ id: 'bad', name: 'Bad', mode: 'drift', tuning: {} }]),
  );
  assert.throws(
    () => createConfigurationState(storage),
    /Saved tuning presets have an invalid format/,
  );
});

test('generates short preset IDs without collisions', () => {
  const existing = [{ id: 'drift-existing', mode: 'drift' }];
  const id = nextTuningPresetId('drift', existing);
  assert.match(id, /^drift-[a-z0-9]{1,6}$/);
  assert.notEqual(id, existing[0].id);
});
