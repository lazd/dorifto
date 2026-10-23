import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let bindGameActions;
let bindStatusUI;
let bindLapRecorder;
let createGameState;
let createConfigurationState;

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  ({ bindGameActions, bindStatusUI, bindLapRecorder } = await server.ssrLoadModule('/src/ui.ts'));
  ({ createGameState } = await server.ssrLoadModule('/src/game-state.ts'));
  ({ createConfigurationState } = await server.ssrLoadModule('/src/configuration-state.ts'));
});

after(async () => {
  await server?.close();
});

function fixture(t, initiallyOpen = false) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const document = new EventTarget();
  const menu = { hidden: true };
  const tuning = new EventTarget();
  const sound = new EventTarget();
  const dialogs = ['settings', 'tuning', 'help', 'course-picker', 'custom-course'].map((id) => ({
    id,
    open: initiallyOpen && id === 'help',
  }));
  const elements = new Map([
    ['#course-menu', menu],
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
  let cleared = 0;
  bindGameActions({
    sound() {},
    clearInput() {
      cleared++;
    },
    setUIOpen(open) {
      states.push(open);
    },
  });
  return {
    menu,
    dialogs,
    tuning,
    states,
    cleared: () => cleared,
    notify: () => document.dispatchEvent(new Event('driving-ui-change')),
  };
}

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

test('course disclosure and dialogs keep input blocked until all UI closes', (t) => {
  const ui = fixture(t);
  ui.menu.hidden = false;
  ui.notify();
  assert.equal(ui.states.at(-1), true);
  ui.dialogs[0].open = true;
  ui.menu.hidden = true;
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
    ['.editable-picker', node()],
    ['#lap-replay-run', node()],
    ['#lap-replay-delete', node()],
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
    select() {},
    remove() {},
    seek() {},
  });
  const container = elements.get('.lap-recorder');
  assert.equal(container.hidden, true);
  store.update({ lapRecorder: { ...store.getState().lapRecorder, mode: 'ready' } });
  assert.equal(container.hidden, false);
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
