import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let bindings;
let bindControlsSettings;
let pressedGamepadControls;

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  bindings = await server.ssrLoadModule('/src/input-bindings.ts');
  ({ bindControlsSettings, pressedGamepadControls } = await server.ssrLoadModule(
    '/src/controls-settings.ts',
  ));
});

after(async () => {
  await server?.close();
});

test('controls settings entry point is safe to import during server rendering', () => {
  assert.equal(typeof bindControlsSettings, 'function');
});

test('default bindings preserve existing keyboard and Xbox controls', () => {
  const defaults = bindings.defaultInputBindings();
  assert.deepEqual(
    defaults.keyboard,
    Object.fromEntries(bindings.keyboardActions.map(({ id, defaultCode }) => [id, defaultCode])),
  );
  assert.deepEqual(
    defaults.controller.buttons,
    Object.fromEntries(
      bindings.controllerActions.map(({ id, defaultButton }) => [id, defaultButton]),
    ),
  );
  assert.equal(typeof defaults.controller.axes.mapZoom.inverted, 'boolean');
  assert.ok(
    bindings.axisOptions.some(({ index }) => index === defaults.controller.axes.mapZoom.index),
  );
});

test('validation rejects malformed, duplicate, and non-capturable bindings', () => {
  const defaults = bindings.defaultInputBindings();
  assert.throws(
    () =>
      bindings.validateInputBindings({
        ...defaults,
        keyboard: { ...defaults.keyboard, map: 'Escape' },
      }),
    /Invalid keyboard binding/,
  );
  assert.throws(
    () =>
      bindings.validateInputBindings({
        ...defaults,
        keyboard: { ...defaults.keyboard, map: defaults.keyboard.camera },
      }),
    /Duplicate keyboard binding/,
  );
  assert.throws(
    () =>
      bindings.validateInputBindings({
        ...defaults,
        controller: {
          ...defaults.controller,
          buttons: { ...defaults.controller.buttons, map: defaults.controller.buttons.camera },
        },
      }),
    /Duplicate controller button/,
  );
  assert.throws(
    () =>
      bindings.validateInputBindings({
        ...defaults,
        controller: {
          ...defaults.controller,
          axes: { ...defaults.controller.axes, mapZoom: { index: 4, inverted: false } },
        },
      }),
    /Invalid controller axis/,
  );
});

test('store loads validated preferences, falls back on corrupt data, and persists updates', () => {
  const store = new bindings.InputBindingsStore();
  const defaults = bindings.defaultInputBindings();
  let persisted = JSON.stringify({
    ...defaults,
    keyboard: { ...defaults.keyboard, accelerate: 'KeyA' },
  });
  const storage = {
    getItem: (key) => (key === bindings.inputBindingsStorageKey ? persisted : null),
    setItem: (key, value) => {
      assert.equal(key, bindings.inputBindingsStorageKey);
      persisted = value;
    },
  };

  assert.equal(store.load(storage).keyboard.accelerate, 'KeyA');
  const next = structuredClone(store.get());
  next.controller.axes.mapZoom = { index: 0, inverted: true };
  assert.equal(store.save(next, storage), true);
  assert.deepEqual(JSON.parse(persisted).controller.axes.mapZoom, { index: 0, inverted: true });
  assert.deepEqual(store.get().controller.axes.mapZoom, { index: 0, inverted: true });

  persisted = '{not json';
  const errors = [];
  assert.deepEqual(store.load(storage, (error) => errors.push(error)).keyboard, defaults.keyboard);
  assert.match(errors[0].message, /Unable to load saved controls/);
});

test('keyboard action lookup follows the shared remapped model', () => {
  const store = bindings.inputBindings;
  const defaults = bindings.defaultInputBindings();
  store.load({
    getItem: () => JSON.stringify({ ...defaults, keyboard: { ...defaults.keyboard, map: 'KeyQ' } }),
    setItem() {},
  });
  assert.equal(bindings.keyboardActionForCode('KeyQ'), 'map');
  assert.equal(bindings.keyboardActionForCode('KeyM'), undefined);
  assert.equal(bindings.formatKeyboardCode('ArrowLeft'), '←');
  store.load({ getItem: () => null, setItem() {} });
});

test('live diagram preview reports physical gamepad presses independent of bindings', () => {
  const buttons = Array.from({ length: 17 }, (_, index) => ({
    pressed: index === 0 || index === 14,
  }));
  assert.deepEqual([...pressedGamepadControls({ buttons, axes: [0, 0, 0, 0] })], ['0', '14']);
  assert.deepEqual([...pressedGamepadControls({ buttons: [], axes: [0.2, 0.2, 0, -0.9] })], ['11']);
});
