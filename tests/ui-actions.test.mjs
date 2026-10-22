import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let bindGameActions;
let createGameState;

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  ({ bindGameActions } = await server.ssrLoadModule('/src/ui.ts'));
  ({ createGameState } = await server.ssrLoadModule('/src/game-state.ts'));
});

after(async () => { await server?.close(); });

function fixture(t, initiallyOpen = false) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const document = new EventTarget();
  const menu = { hidden: true };
  const tuning = new EventTarget();
  const sound = new EventTarget();
  const dialogs = ['settings', 'tuning', 'help', 'course-picker', 'custom-course']
    .map((id) => ({ id, open: initiallyOpen && id === 'help' }));
  const elements = new Map([
    ['#course-menu', menu], ['#drift-tuning', tuning], ['#sound', sound],
  ]);
  document.querySelector = (selector) => selector === 'dialog[open]'
    ? dialogs.find((dialog) => dialog.open) ?? null
    : elements.get(selector) ?? null;
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'document', descriptor);
    else delete globalThis.document;
  });
  const states = [];
  let cleared = 0;
  bindGameActions({
    sound() {},
    clearInput() { cleared++; },
    setUIOpen(open) { states.push(open); },
  });
  return {
    menu, dialogs, tuning, states,
    cleared: () => cleared,
    notify: () => document.dispatchEvent(new Event('driving-ui-change')),
  };
}

test('every dialog blocks driving through UI events without game-store updates', (t) => {
  const ui = fixture(t);
  const store = createGameState();
  assert.equal(store.getState().stereoStation, 'off');
  let gameUpdates = 0;
  store.subscribe(() => { gameUpdates++; });
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
