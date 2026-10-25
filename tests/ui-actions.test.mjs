import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let bindGameActions;
let bindStatusUI;
let bindLapRecorder;
let createHudVisibilityCycle;
let setHudElementHidden;
let createGameState;
let createConfigurationState;
let formatHudSpeed;
let speedometerDegrees;

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  ({
    bindGameActions,
    bindStatusUI,
    bindLapRecorder,
    createHudVisibilityCycle,
    setHudElementHidden,
    formatHudSpeed,
  } = await server.ssrLoadModule('/src/ui.ts'));
  ({ createGameState } = await server.ssrLoadModule('/src/game-state.ts'));
  ({ createConfigurationState } = await server.ssrLoadModule('/src/configuration-state.ts'));
  ({ speedometerDegrees } = await server.ssrLoadModule('/src/car.ts'));
});

after(async () => {
  await server?.close();
});

test('HUD speed converts meters per second to the selected units, including reverse', () => {
  assert.equal(formatHudSpeed(0, 'mph'), '0');
  assert.equal(formatHudSpeed(26.8224, 'mph'), '60');
  assert.equal(formatHudSpeed(26.8224, 'kmh'), '97');
  assert.equal(formatHudSpeed(-26.8224, 'kmh'), '97');
});

test('analog speed follows the nonuniform dial markings in either unit', () => {
  assert.ok(Math.abs(speedometerDegrees(60 / 3.6, 'kmh') - 65.47) < 0.01);
  assert.ok(Math.abs(speedometerDegrees(26.8224, 'mph') - 65.47) < 0.01);
  assert.ok(Math.abs(speedometerDegrees(50 / 3.6, 'kmh') - (41.24 + 65.47) / 2) < 0.01);
  assert.equal(speedometerDegrees(100, 'kmh'), speedometerDegrees(180 / 3.6, 'kmh'));
  assert.equal(speedometerDegrees(-26.8224, 'mph'), speedometerDegrees(26.8224, 'mph'));
});

test('HUD cycle uses hidden and preserves independent camera and recorder visibility', (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const groups = [
    ['.telemetry'],
    ['#minimap'],
    ['#race-panel'],
    ['.course-hud', '.lap-recorder', 'header', 'footer'],
  ];
  const nodes = new Map(
    groups.flat().map((selector) => {
      return [
        selector,
        {
          hidden: selector === '.telemetry',
        },
      ];
    }),
  );
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { querySelector: (selector) => nodes.get(selector) },
  });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'document', descriptor);
    else delete globalThis.document;
  });
  const visibility = createHudVisibilityCycle();
  for (let press = 1; press <= 10; press++) {
    visibility.cycle();
    groups.forEach((selectors, index) => {
      for (const selector of selectors) {
        const node = nodes.get(selector);
        assert.equal(
          node.hidden,
          selector === '.telemetry' || press % 5 > index,
          'camera and race visibility remain independent of the HUD cycle',
        );
      }
    });
  }
  for (let level = 0; level <= 4; level++) {
    visibility.set(level);
    groups.forEach((selectors, index) => {
      for (const selector of selectors) {
        const node = nodes.get(selector);
        assert.equal(node.hidden, selector === '.telemetry' || level > index, selector);
      }
    });
  }
  const telemetry = nodes.get('.telemetry');
  const recorder = nodes.get('.lap-recorder');
  visibility.set(4);
  setHudElementHidden(telemetry, false);
  setHudElementHidden(recorder, false);
  assert.equal(telemetry.hidden, true, 'changing camera cannot reveal a hidden HUD');
  assert.equal(recorder.hidden, true, 'recording cannot reveal a hidden HUD');
  visibility.set(0);
  assert.equal(telemetry.hidden, false);
  assert.equal(recorder.hidden, false);
  visibility.set(4);
  setHudElementHidden(telemetry, true);
  setHudElementHidden(recorder, true);
  visibility.set(0);
  assert.equal(telemetry.hidden, true, 'cabin telemetry remains hidden after restoring the HUD');
  assert.equal(recorder.hidden, true, 'inactive recorder remains hidden after restoring the HUD');
  for (const invalid of [-1, 5, 1.5]) assert.throws(() => visibility.set(invalid), RangeError);
});

function fixture(t, initiallyOpen = false) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const document = new EventTarget();
  const tuning = new EventTarget();
  const sound = new EventTarget();
  const dialogs = ['settings', 'tuning', 'bots', 'course-picker', 'saved-course'].map((id) => ({
    id,
    open: initiallyOpen && id === 'settings',
  }));
  const elements = new Map([
    ['#drift-tuning', tuning],
    ['#sound', sound],
  ]);
  document.querySelector = (selector) =>
    selector === 'dialog[open]'
      ? (dialogs.find((dialog) => dialog.open) ?? null)
      : (elements.get(selector) ?? null);
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'document', descriptor);
    else delete globalThis.document;
  });
  const states = [];
  const mutedStates = [];
  let cleared = 0;
  bindGameActions({
    sound(muted) {
      mutedStates.push(muted);
    },
    clearInput() {
      cleared++;
    },
    setUIOpen(open) {
      states.push(open);
    },
  });
  return {
    dialogs,
    tuning,
    states,
    sound,
    mutedStates,
    cleared: () => cleared,
    notify: () => document.dispatchEvent(new Event('driving-ui-change')),
  };
}

test('sound switch applies its checked state and preserves unrelated URL options', (t) => {
  const ui = fixture(t);
  const descriptors = new Map(
    ['location', 'history'].map((name) => [
      name,
      Object.getOwnPropertyDescriptor(globalThis, name),
    ]),
  );
  const location = { href: 'https://example.test/?course=hillside' };
  Object.defineProperty(globalThis, 'location', { configurable: true, value: location });
  Object.defineProperty(globalThis, 'history', {
    configurable: true,
    value: { replaceState: (_state, _title, url) => (location.href = String(url)) },
  });
  t.after(() => {
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  for (const checked of [false, true]) {
    ui.sound.checked = checked;
    ui.sound.dispatchEvent(new Event('change'));
    const query = new URL(location.href).searchParams;
    assert.equal(ui.mutedStates.at(-1), !checked);
    assert.equal(query.get('sound'), checked ? null : 'off');
    assert.equal(query.get('course'), 'hillside');
  }
});

test('every dialog blocks driving through UI events without game-store updates', (t) => {
  const ui = fixture(t);
  const store = createGameState();
  assert.equal(createConfigurationState().getState().stereoStation, 'off');
  let gameUpdates = 0;
  store.subscribe(() => {
    gameUpdates++;
  });
  assert.deepEqual(ui.states, [false]);
  for (const dialog of ui.dialogs) {
    dialog.open = true;
    ui.notify();
    assert.equal(ui.states.at(-1), true, dialog.id);
    dialog.open = false;
    ui.notify();
    assert.equal(ui.states.at(-1), false, dialog.id);
  }
  assert.equal(gameUpdates, 1, 'UI visibility does not notify the game store');
  const notifications = ui.states.length;
  for (let frame = 0; frame < 10; frame++) {
    store.update({ telemetry: { ...store.getState().telemetry, speed: frame } });
  }
  assert.equal(ui.states.length, notifications, 'telemetry does not recheck UI visibility');
});

test('nested dialogs keep input blocked until all UI closes', (t) => {
  const ui = fixture(t);
  ui.dialogs[1].open = true;
  ui.notify();
  assert.equal(ui.states.at(-1), true);
  ui.dialogs[0].open = true;
  ui.dialogs[1].open = false;
  ui.notify();
  assert.equal(ui.states.at(-1), true);
  ui.dialogs[0].open = false;
  ui.notify();
  assert.equal(ui.states.at(-1), false);
});

test('recognizes already-open UI and preserves tuning focus input clearing', (t) => {
  const ui = fixture(t, true);
  assert.deepEqual(ui.states, [true]);
  ui.tuning.dispatchEvent(new Event('focusin'));
  assert.equal(ui.cleared(), 1);
});

test('lap recorder visibility follows its mode', (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const document = new EventTarget();
  const node = () => {
    const target = new EventTarget();
    target.hidden = true;
    target.disabled = false;
    target.dataset = {};
    target.value = '';
    target.setAttribute = () => {};
    target.replaceChildren = () => {};
    target.blur = () => {};
    return target;
  };
  const elements = new Map([
    ['.lap-recorder', node()],
    ['#lap-recorder-button', node()],
    ['#lap-recorder-label', node()],
    ['#lap-replay-controls', node()],
    ['#lap-replay-time', node()],
    ['#lap-replay-previous', node()],
    ['#lap-replay-next', node()],
  ]);
  document.querySelector = (selector) => elements.get(selector) ?? null;
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'document', descriptor);
    else delete globalThis.document;
  });
  const store = createGameState();
  bindLapRecorder(store, {
    press() {},
    seek() {},
  });
  const container = elements.get('.lap-recorder');
  assert.equal(container.hidden, true);
  store.update({ lapRecorder: { ...store.getState().lapRecorder, mode: 'ready' } });
  assert.equal(container.hidden, true);
  store.update({ lapRecorder: { ...store.getState().lapRecorder, mode: 'recording' } });
  assert.equal(container.hidden, false);
  assert.equal(elements.get('#lap-recorder-button').hidden, false);
  store.update({ lapRecorder: { ...store.getState().lapRecorder, mode: 'replay' } });
  assert.equal(container.hidden, false);
  assert.equal(elements.get('#lap-recorder-button').hidden, true);
  assert.equal(elements.get('#lap-replay-controls').hidden, false);
  store.update({ lapRecorder: { ...store.getState().lapRecorder, mode: 'off' } });
  assert.equal(container.hidden, true);
});

function statusFixture(t) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const document = new EventTarget();
  const node = () => {
    const target = new EventTarget();
    const classes = new Set();
    const attributes = new Map();
    target.hidden = false;
    target.classList = {
      contains: (name) => classes.has(name),
      toggle: (name, enabled) => (enabled ? classes.add(name) : classes.delete(name)),
    };
    target.getAttribute = (name) => attributes.get(name) ?? null;
    target.setAttribute = (name, value) => attributes.set(name, value);
    target.blur = () => {
      document.activeElement = null;
    };
    target.style = { setProperty: () => {} };
    return target;
  };
  const status = node();
  const message = node();
  const close = node();
  const progress = node();
  const footer = node();
  const elements = new Map([
    ['#status', status],
    ['#status-message', message],
    ['#status-close', close],
    ['#status-progress', progress],
    ['footer', footer],
  ]);
  document.querySelector = (selector) => elements.get(selector) ?? null;
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'document', descriptor);
    else delete globalThis.document;
  });
  const store = createGameState();
  let renders = 0;
  const subscribe = store.subscribe;
  store.subscribe = (listener, keys) =>
    subscribe((state) => {
      renders++;
      listener(state);
    }, keys);
  const dismiss = bindStatusUI(store);
  const key = (key) => {
    const event = new Event('keydown', { cancelable: true });
    Object.defineProperty(event, 'key', { value: key });
    document.dispatchEvent(event);
    return event;
  };
  return {
    document,
    store,
    status,
    message,
    close,
    footer,
    dismiss,
    key,
    renders: () => renders,
  };
}

test('status binding never runs for telemetry, focus, sound, or lap-recorder updates', (t) => {
  const ui = statusFixture(t);
  assert.equal(ui.renders(), 1);
  for (let frame = 0; frame < 1000; frame++) {
    ui.store.update({
      telemetry: { ...ui.store.getState().telemetry, speed: frame },
      controllerStatus: `Controller ${frame}`,
    });
  }
  ui.store.update({ focused: false });
  ui.store.update({ sound: { running: true, failed: false, error: null } });
  ui.store.update({ lapRecorder: { ...ui.store.getState().lapRecorder, mode: 'ready' } });
  assert.equal(ui.renders(), 1);
  ui.store.update({ status: { visible: true, error: true, message: 'Changed status' } });
  assert.equal(ui.renders(), 2);
  assert.equal(ui.message.textContent, 'Changed status');
});

test('nonfatal errors have a working close button without replacing their text', (t) => {
  const ui = statusFixture(t);
  assert.equal(ui.close.hidden, true, 'loading cannot be dismissed');
  ui.store.update({ status: { visible: true, error: true, message: 'Stereo unavailable' } });
  assert.equal(ui.status.hidden, false);
  assert.equal(ui.status.getAttribute('role'), 'alert');
  assert.equal(ui.message.textContent, 'Stereo unavailable');
  assert.equal(ui.close.hidden, false);
  ui.document.activeElement = ui.close;
  ui.close.dispatchEvent(new Event('click'));
  assert.equal(ui.document.activeElement, null, 'hidden close button releases focus');
  assert.equal(ui.status.hidden, true);
  assert.equal(ui.close.hidden, true);
  assert.equal(ui.footer.classList.contains('loaded'), true);
  assert.equal(ui.store.getState().status.error, false);
});

test('Escape consumes only dismissal of a visible nonfatal error', (t) => {
  const ui = statusFixture(t);
  assert.equal(ui.key('Escape').defaultPrevented, false, 'loading remains visible');
  const error = { visible: true, error: true, message: 'Unable to save laps' };
  ui.store.update({ status: error });
  assert.equal(ui.key('Enter').defaultPrevented, false);
  assert.equal(ui.store.getState().status, error);
  let propagated = 0;
  ui.document.addEventListener('keydown', () => {
    propagated++;
  });
  assert.equal(ui.key('Escape').defaultPrevented, true);
  assert.equal(propagated, 0, 'dismissal does not close other UI');
  assert.equal(ui.status.hidden, true);
  assert.equal(ui.key('Escape').defaultPrevented, false);
});

test('fatal errors cannot be dismissed by any dismissal path', (t) => {
  const ui = statusFixture(t);
  const fatal = { visible: true, error: true, fatal: true, message: 'Graphics context lost' };
  ui.store.update({ status: fatal });
  assert.equal(ui.close.hidden, true);
  assert.equal(ui.dismiss(), false, 'controller dismissal is rejected');
  assert.equal(ui.key('Escape').defaultPrevented, false);
  ui.close.dispatchEvent(new Event('click'));
  assert.equal(ui.store.getState().status, fatal);
  assert.equal(ui.status.hidden, false);
  assert.equal(ui.footer.classList.contains('loaded'), false);
  ui.store.update({ status: { visible: false, error: true, message: 'Hidden error' } });
  assert.equal(ui.dismiss(), false);
});
