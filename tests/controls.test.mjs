import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let DrivingControls;
let updateVehicleLights;
let inputBindings;
let defaultInputBindings;

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  ({ DrivingControls, updateVehicleLights } = await server.ssrLoadModule('/src/controls.ts'));
  ({ inputBindings, defaultInputBindings } = await server.ssrLoadModule('/src/input-bindings.ts'));
});

after(async () => {
  await server?.close();
});

function rig(t) {
  inputBindings.load({ getItem: () => null, setItem() {} });
  const descriptors = new Map(
    ['document', 'window', 'navigator', 'performance'].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  const listeners = {};
  const pad = { connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: [] };
  const document = {
    hasFocus: () => true,
    hidden: false,
    addEventListener() {},
    documentElement: { style: {} },
    body: { style: {} },
  };
  let now = 0;
  for (const [key, value] of Object.entries({
    document,
    window: {
      addEventListener: (name, callback) => {
        listeners[name] = callback;
      },
    },
    navigator: { getGamepads: () => (pad.connected ? [pad] : []) },
    performance: { now: () => now },
  }))
    Object.defineProperty(globalThis, key, { configurable: true, value });
  t.after(() => {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const controls = new DrivingControls();
  return {
    controls,
    pad,
    document,
    listeners,
    poll(ms = 0, enabled = true, dismissError) {
      now += ms;
      controls.poll(enabled, 0, dismissError);
    },
    lightButton(pressed, keyboard = false) {
      if (keyboard) {
        if (pressed) controls.keys.add('KeyF');
        else controls.keys.delete('KeyF');
      } else pad.buttons[4] = { pressed };
      controls.poll();
    },
    headlightsButton(pressed, keyboard = false) {
      if (keyboard) {
        if (pressed) controls.keys.add('KeyH');
        else controls.keys.delete('KeyH');
      } else pad.buttons[2] = { pressed };
      controls.poll();
    },
  };
}

test('runtime reads remapped keyboard, controller buttons, and map axes from the shared model', (t) => {
  const r = rig(t);
  const remapped = defaultInputBindings();
  remapped.keyboard.steerLeft = 'KeyA';
  remapped.controller.buttons.map = 0;
  remapped.controller.axes.steering = { index: 1, inverted: false };
  remapped.controller.axes.mapZoom = { index: 1, inverted: true };
  inputBindings.load({ getItem: () => JSON.stringify(remapped), setItem() {} });

  r.pad.axes[1] = 0.5;
  r.poll();
  assert.equal(r.controls.steer, 0.5);
  r.pad.buttons[0] = { pressed: true, value: 1 };
  r.poll();
  assert.equal(r.controls.mapView, true, 'the remapped controller button opens the map');
  assert.equal(r.controls.mapZoom, -0.5, 'the configured map axis and inversion are applied');

  r.pad.buttons[0].pressed = false;
  r.controls.keys.add('KeyA');
  r.poll();
  assert.equal(r.controls.steer, 1, 'keyboard steering uses the remapped code');
});

for (const keyboard of [true, false]) {
  const input = keyboard ? 'F' : 'left bumper';
  test(`${input}: short presses flash; holding 1 second toggles high beams once`, (t) => {
    const r = rig(t);
    r.lightButton(true, keyboard);
    assert.equal(r.controls.highBeams, true);
    assert.equal(r.controls.handbrake, false);
    r.poll(999);
    r.lightButton(false, keyboard);
    assert.equal(r.controls.highBeams, false);
    r.lightButton(true, keyboard);
    r.poll(999);
    r.poll(1);
    assert.equal(r.controls.highBeams, true);
    r.poll(10000);
    r.lightButton(false, keyboard);
    assert.equal(r.controls.highBeams, true);
    r.poll(5000);
    assert.equal(r.controls.highBeams, true);
    r.lightButton(true, keyboard);
    r.poll(999);
    assert.equal(r.controls.highBeams, true);
    r.poll(1);
    assert.equal(r.controls.highBeams, false, 'toggles off at the threshold while still held');
    r.poll(10000);
    assert.equal(r.controls.highBeams, false, 'no repeated toggles during a long hold');
    r.lightButton(false, keyboard);
    assert.equal(r.controls.highBeams, false);
    assert.equal(r.controls.lightingRequested, null, 'F / LB never toggles fog lights');
  });

  test(`${keyboard ? 'H' : 'X / Square'}: short releases toggle headlights; long holds act at exactly 1 second`, (t) => {
    const r = rig(t);
    r.headlightsButton(true, keyboard);
    assert.equal(r.controls.lightingRequested, 'press', 'headlights can illuminate immediately');
    assert.equal(r.controls.highBeams, false);
    assert.equal(r.controls.handbrake, false, 'X no longer operates the e-brake');
    r.poll(999);
    r.headlightsButton(false, keyboard);
    assert.equal(r.controls.lightingRequested, 'tap');
    r.poll();
    assert.equal(r.controls.lightingRequested, null, 'release requests last one poll');
    r.headlightsButton(true, keyboard);
    r.poll(999);
    assert.equal(r.controls.lightingRequested, null);
    r.poll(1);
    assert.equal(r.controls.lightingRequested, 'hold', 'acts at the threshold, before release');
    r.headlightsButton(false, keyboard);
    assert.equal(
      r.controls.lightingRequested,
      null,
      'release after a long hold does not toggle again',
    );
    r.headlightsButton(true, keyboard);
    r.poll(1000);
    assert.equal(r.controls.lightingRequested, 'hold');
    r.poll(9000);
    assert.equal(r.controls.lightingRequested, null);
    r.headlightsButton(false, keyboard);
    assert.equal(r.controls.lightingRequested, null);
    r.poll(10000);
    assert.equal(r.controls.lightingRequested, null);
    assert.equal(r.controls.mapView, false, 'X does not toggle the map');
  });
}

test('short taps and long holds implement every headlight / fog-light transition', () => {
  for (const [headlights, fogLights, request, expected] of [
    [false, false, 'tap', { headlights: true, fogLights: false }],
    [true, false, 'tap', { headlights: false, fogLights: false }],
    [true, true, 'tap', { headlights: false, fogLights: false }],
    [false, false, 'hold', { headlights: true, fogLights: true }],
    [true, false, 'hold', { headlights: true, fogLights: true }],
    [true, true, 'hold', { headlights: true, fogLights: false }],
  ]) {
    const pressed = updateVehicleLights(
      { headlights, fogLights, headlightsAtPress: false },
      'press',
    );
    assert.equal(
      pressed.headlights,
      true,
      'headlights illuminate on press, without waiting for release',
    );
    assert.equal(pressed.fogLights, fogLights, 'press alone does not change fog lights');
    const result = updateVehicleLights(pressed, request);
    assert.deepEqual({ headlights: result.headlights, fogLights: result.fogLights }, expected);
  }
});

test('combined inputs share a hold and disconnect cancels a pending lighting request', (t) => {
  const r = rig(t);
  r.lightButton(true);
  r.poll(600);
  r.lightButton(true, true);
  r.lightButton(false);
  assert.equal(r.controls.highBeams, true);
  r.poll(500);
  r.lightButton(false, true);
  assert.equal(r.controls.highBeams, true);
  r.controls.clear();
  r.headlightsButton(true);
  r.poll(600);
  r.headlightsButton(true, true);
  r.headlightsButton(false);
  r.poll(500);
  assert.equal(r.controls.lightingRequested, 'hold', 'both inputs contribute to the same hold');
  r.headlightsButton(false, true);
  assert.equal(r.controls.lightingRequested, null, 'final release does not toggle twice');
  r.headlightsButton(true);
  r.poll(999);
  r.pad.connected = false;
  r.poll(10);
  assert.equal(r.controls.highBeams, false);
  assert.equal(r.controls.lightingRequested, null, 'disconnect is not an intentional release');
});

test('Xbox B consumes error dismissal once per press instead of toggling the map', (t) => {
  const r = rig(t);
  let visible = true;
  let requests = 0;
  const dismiss = () => {
    requests++;
    if (!visible) return false;
    visible = false;
    return true;
  };
  r.pad.buttons[1] = { pressed: true };
  r.poll(0, false, dismiss);
  assert.equal(visible, false, 'errors can be dismissed while a dialog blocks driving');
  assert.equal(r.controls.mapView, false);
  r.poll(0, true, dismiss);
  assert.equal(requests, 1, 'holding B does not toggle the map after dismissal');
  r.pad.buttons[1].pressed = false;
  r.poll(0, true, dismiss);
  r.pad.buttons[1].pressed = true;
  r.poll(0, true, dismiss);
  assert.equal(requests, 2);
  assert.equal(r.controls.mapView, true, 'normal map action resumes on the next press');
});

test('unfocused or hidden pages cannot dismiss errors with Xbox B', (t) => {
  const r = rig(t);
  let requests = 0;
  const dismiss = () => {
    requests++;
    return true;
  };
  r.listeners.blur();
  r.pad.buttons[1] = { pressed: true };
  r.poll(0, true, dismiss);
  assert.equal(requests, 0);
  r.pad.buttons[1].pressed = false;
  r.poll(0, true, dismiss);
  r.listeners.focus();
  r.document.hidden = true;
  r.pad.buttons[1].pressed = true;
  r.poll(0, true, dismiss);
  assert.equal(requests, 0);
});

test('Xbox B still toggles the map and RB still operates the e-brake', (t) => {
  const r = rig(t);
  r.pad.buttons[1] = { pressed: true };
  r.poll();
  assert.equal(r.controls.mapView, true);
  assert.equal(r.controls.lightingRequested, null);
  assert.equal(r.controls.handbrake, false);
  r.poll(2000);
  assert.equal(r.controls.mapView, true, 'one map toggle per press');
  assert.equal(r.controls.lightingRequested, null);
  r.pad.buttons[1].pressed = false;
  r.poll();
  r.pad.buttons[1].pressed = true;
  r.poll();
  assert.equal(r.controls.mapView, false);
  r.pad.buttons[5] = { pressed: true };
  r.poll();
  assert.equal(r.controls.handbrake, true);
  r.pad.buttons[5].pressed = false;
  r.poll();
  assert.equal(r.controls.handbrake, false);
  r.controls.keys.add('Space');
  r.poll();
  assert.equal(r.controls.handbrake, true);
});

for (const direction of [-1, 1]) {
  test(`right stick ${direction < 0 ? 'left' : 'right'} holds for 1 second then flashes exactly four times`, (t) => {
    const r = rig(t);
    const active = direction < 0 ? 'leftSignal' : 'rightSignal';
    const inactive = direction < 0 ? 'rightSignal' : 'leftSignal';
    r.pad.axes[2] = direction;
    r.poll();
    assert.equal(r.controls.cameraX, direction, 'camera continues panning');
    r.poll(999);
    assert.equal(r.controls[active], false);
    r.poll(1);
    assert.equal(r.controls[active], true);
    for (let flash = 0; flash < 4; flash++) {
      assert.equal(r.controls[active], true);
      assert.equal(r.controls[inactive], false);
      r.poll(400);
      assert.equal(r.controls[active], false);
      r.poll(400);
    }
    assert.equal(r.controls[active], false, 'no fifth flash');
    r.poll(5000);
    assert.equal(r.controls[active], false, 'holding does not restart the sequence');
    r.pad.axes[2] = 0;
    r.poll();
    r.pad.axes[2] = direction;
    r.poll();
    r.poll(1000);
    assert.equal(r.controls[active], true, 'a fresh hold starts another sequence');
    r.pad.axes[2] = 0;
    r.poll(200);
    assert.equal(r.controls[active], true, 'release does not cancel the sequence');
  });
}

test('small, interrupted, and map-view stick movements do not trigger signals', (t) => {
  const r = rig(t);
  r.pad.axes[2] = 0.49;
  r.poll();
  r.poll(2000);
  assert.equal(r.controls.rightSignal, false);
  r.pad.axes[2] = -1;
  r.poll();
  r.poll(999);
  r.pad.axes[2] = 1;
  r.poll();
  r.poll(999);
  assert.equal(r.controls.leftSignal, false);
  assert.equal(r.controls.rightSignal, false);
  r.controls.mapView = true;
  r.poll(2000);
  assert.equal(r.controls.rightSignal, false);
  assert.equal(r.controls.cameraX, 1);
  r.controls.mapView = false;
  r.poll();
  r.poll(1000);
  assert.equal(r.controls.rightSignal, true);
});

test('blur, hidden pages, disabled controls, and clear cancel lighting and pending holds', (t) => {
  const r = rig(t);
  for (const cancel of [
    () => r.controls.clear(),
    () => r.poll(0, false),
    () => r.listeners.blur(),
    () => {
      r.document.hidden = true;
      r.poll();
    },
  ]) {
    r.document.hidden = false;
    r.listeners.focus();
    r.pad.axes[2] = -1;
    r.lightButton(true);
    r.headlightsButton(true);
    r.poll(1500);
    cancel();
    assert.equal(r.controls.highBeams, false);
    assert.equal(r.controls.lightingRequested, null);
    assert.equal(r.controls.leftSignal, false);
    assert.equal(r.controls.rightSignal, false);
    r.pad.buttons[4].pressed = false;
    r.pad.buttons[2].pressed = false;
    r.pad.axes[2] = 0;
    r.poll();
    assert.equal(r.controls.highBeams, false, 'cancellation cannot complete a toggle');
    assert.equal(r.controls.lightingRequested, null);
  }
});
