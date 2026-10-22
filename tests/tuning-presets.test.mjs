import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let createGameState;
let defaultTuning;
let defaultTuningPresets;
let tuningPresetsStorageKey;
let nextTuningPresetId;

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  ({ createGameState, defaultTuning, defaultTuningPresets } = await server.ssrLoadModule('/src/game-state.ts'));
  ({ tuningPresetsStorageKey, nextTuningPresetId } = await server.ssrLoadModule('/src/tuning-presets.ts'));
});

after(async () => {
  await server?.close();
});

function createStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
  };
}

test('starts with separate Default presets and the captured Drift Aggressive preset', () => {
  const presets = defaultTuningPresets();
  assert.deepEqual(presets.filter(({ mode }) => mode === 'grip').map(({ name }) => name), ['Default']);
  assert.deepEqual(presets.find(({ id }) => id === 'grip-default').tuning, defaultTuning('grip'));
  assert.deepEqual(presets.find(({ id }) => id === 'drift-default').tuning, defaultTuning('drift'));
  assert.ok(presets.filter(({ name }) => name === 'Default').every(({ readonly }) => readonly));
  assert.equal(presets.find(({ id }) => id === 'drift-aggressive').readonly, true);
  assert.deepEqual(presets.find(({ id }) => id === 'drift-aggressive').tuning, {
    horsepower: 515, steeringExpo: 0.6, steeringRate: 2.8, steeringScale: 1.03,
    frontGrip: 1.05, rearGrip: 1, frontStiffness: 45000, rearStiffness: 43000,
  });
});

test('seeds presets once and loads later preset changes from storage', () => {
  const storage = createStorage();
  const seeded = createGameState(storage).getState().tuningPresets;
  assert.deepEqual(seeded, defaultTuningPresets());
  assert.deepEqual(JSON.parse(storage.getItem(tuningPresetsStorageKey)), seeded);

  const legacyAggressive = seeded.map((preset) =>
    preset.id === 'drift-aggressive' ? { ...preset, readonly: false } : preset);
  storage.setItem(tuningPresetsStorageKey, JSON.stringify(legacyAggressive));
  const normalized = createGameState(storage).getState().tuningPresets;
  assert.equal(normalized.find(({ id }) => id === 'drift-aggressive').readonly, true);
  assert.equal(
    JSON.parse(storage.getItem(tuningPresetsStorageKey))
      .find(({ id }) => id === 'drift-aggressive').readonly,
    true,
  );

  const remaining = normalized.filter(({ id }) => id !== 'drift-aggressive');
  storage.setItem(tuningPresetsStorageKey, JSON.stringify(remaining));
  assert.deepEqual(createGameState(storage).getState().tuningPresets, remaining);
});

test('migrates legacy storage by restoring missing built-in presets once', () => {
  const storage = createStorage();
  const legacy = defaultTuningPresets().filter(({ id }) => id !== 'drift-aggressive');
  storage.setItem(tuningPresetsStorageKey, JSON.stringify(legacy));
  const migrated = createGameState(storage).getState().tuningPresets;
  assert.ok(migrated.some(({ id }) => id === 'drift-aggressive'));
  assert.deepEqual(migrated.find(({ id }) => id === 'drift-aggressive').tuning, {
    horsepower: 515, steeringExpo: 0.6, steeringRate: 2.8, steeringScale: 1.03,
    frontGrip: 1.05, rearGrip: 1, frontStiffness: 45000, rearStiffness: 43000,
  });

  const deleted = migrated.filter(({ id }) => id !== 'drift-aggressive');
  storage.setItem(tuningPresetsStorageKey, JSON.stringify(deleted));
  assert.ok(!createGameState(storage).getState().tuningPresets.some(({ id }) => id === 'drift-aggressive'));
});

test('rejects corrupt stored preset data explicitly', () => {
  const storage = createStorage();
  storage.setItem(tuningPresetsStorageKey, '{');
  assert.throws(() => createGameState(storage), /Saved tuning presets are not valid JSON/);
  storage.setItem(tuningPresetsStorageKey, JSON.stringify([{ id: 'bad', name: 'Bad', mode: 'drift', tuning: {} }]));
  assert.throws(() => createGameState(storage), /Saved tuning presets have an invalid format/);
});

test('generates short preset IDs without collisions', () => {
  const existing = [{ id: 'drift-existing', mode: 'drift' }];
  const id = nextTuningPresetId('drift', existing);
  assert.match(id, /^drift-[a-z0-9]{1,6}$/);
  assert.notEqual(id, existing[0].id);
});
