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
  remapped.controller.buttons.clutch = 1;
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

test('steering expo respects live changes and remapped axes without affecting keyboard or camera', (t) => {
  const r = rig(t);
  inputBindings.get().controller.axes.steering = { index: 1, inverted: false };
  r.pad.axes[2] = 0.5;
  for (const [expo, halfStick] of [
    [0, 0.5],
    [0.6, 0.275],
    [1, 0.125],
  ]) {
    for (const direction of [-1, 1]) {
      for (const [input, expected] of [
        [0, 0],
        [0.5, halfStick],
        [1, 1],
      ]) {
        r.pad.axes[1] = input * direction;
        r.controls.poll(true, expo);
        assert.ok(Math.abs(r.controls.steer - expected * direction) < 1e-12);
        assert.equal(r.controls.cameraX, 0.5);
      }
    }
    r.controls.keys.add(inputBindings.get().keyboard.steerLeft);
    r.controls.poll(true, expo);
    assert.equal(r.controls.steer, 1);
    r.controls.keys.clear();
  }
});

test('T300 drift steering softens the center with expo and reaches full lock at quarter travel', (t) => {
  const wheel = rig(t);
  wheel.pad.id = 'Thrustmaster T300RS Racing wheel (Vendor: 044f Product: b66e)';
  wheel.pad.mapping = '';
  for (const mode of ['drift', 'grip', 'drift']) {
    for (const direction of [-1, 1]) {
      for (const [travel, driftSteering] of [
        [0, 0],
        [0.0625, 0.109375],
        [0.125, 0.275],
        [0.25, 1],
        [0.5, 1],
        [1, 1],
      ]) {
        wheel.pad.axes[0] = -travel * direction;
        wheel.controls.poll(true, 0.6, undefined, false, mode);
        const expected = (mode === 'drift' ? driftSteering : travel) * direction;
        assert.ok(Math.abs(wheel.controls.steer - expected) < 1e-12);
      }
    }
  }
  wheel.pad.axes[0] = -0.125;
  for (const [expo, expected] of [
    [0, 0.5],
    [0.6, 0.275],
    [1, 0.125],
  ]) {
    wheel.controls.poll(true, expo, undefined, false, 'drift');
    assert.ok(Math.abs(wheel.controls.steer - expected) < 1e-12);
  }
  wheel.controls.keys.add(inputBindings.get().keyboard.steerLeft);
  wheel.controls.poll(true, 0.6, undefined, false, 'drift');
  assert.equal(wheel.controls.steer, 1, 'keyboard steering retains priority');
  wheel.controls.keys.clear();
  wheel.pad.mapping = 'standard';
  wheel.pad.axes[0] = -0.25;
  wheel.controls.poll(true, 0, undefined, false, 'drift');
  assert.equal(wheel.controls.steer, 0.25, 'Xbox steering is not amplified');
});

test('pedals preserve analog values across the pressed threshold in both directions', (t) => {
  const r = rig(t);
  const { buttons } = inputBindings.get().controller;
  for (const direction of [1, -1]) {
    for (let step = 0; step <= 100; step++) {
      const value = (direction === 1 ? step : 100 - step) / 100;
      for (const action of ['accelerate', 'brake']) {
        r.pad.buttons[buttons[action]] = { value, pressed: value > 0.5 };
      }
      r.poll();
      assert.equal(r.controls.throttle, value);
      assert.equal(r.controls.brake, value);
      assert.equal(r.controls.reverse, value);
    }
  }
});

test('T300 pedals and steering work without stick side effects and release on disconnect', (t) => {
  const wheel = rig(t);
  wheel.pad.id = 'Thrustmaster T300RS Racing wheel (Vendor: 044f Product: b66e)';
  wheel.pad.mapping = '';
  wheel.pad.axes = [0, 1, 0, 0, 0, 1, 1, 0, 0, 3.2857];
  wheel.poll();
  assert.match(wheel.controls.controllerStatus, /Connected/);
  assert.equal(wheel.controls.throttle, 0);
  assert.equal(wheel.controls.brake, 0);
  assert.equal(wheel.controls.clutch, false);
  for (const [axis, action] of [
    [5, 'throttle'],
    [1, 'brake'],
    [6, 'clutch'],
  ]) {
    for (const value of [0.25, 0.5, 0.75, 1, 0]) {
      wheel.pad.axes[axis] = 1 - value * 2;
      wheel.poll();
      assert.equal(wheel.controls.throttle, action === 'throttle' ? value : 0);
      assert.equal(wheel.controls.brake, action === 'brake' ? value : 0);
      assert.equal(wheel.controls.clutch, action === 'clutch' && value > 0.5);
      assert.equal(wheel.controls.highBeams, false);
      assert.equal(wheel.controls.handbrake, false);
    }
  }
  wheel.pad.axes[0] = -0.5;
  wheel.pad.axes[1] = 0;
  wheel.pad.axes[5] = -0.5;
  wheel.pad.axes[6] = -1;
  wheel.controls.poll(true, 1);
  assert.equal(wheel.controls.steer, 0.5);
  assert.equal(wheel.controls.throttle, 0.75);
  assert.equal(wheel.controls.brake, 0.5);
  assert.equal(wheel.controls.clutch, true);
  assert.equal(wheel.controls.cameraX, 0);
  assert.equal(wheel.controls.cameraY, 0);
  wheel.pad.buttons[0] = { pressed: true };
  wheel.poll();
  assert.equal(wheel.controls.shiftDown, true);
  assert.equal(wheel.controls.shiftUp, false);
  assert.equal(wheel.controls.handbrake, false);
  assert.equal(wheel.controls.highBeams, false);
  wheel.pad.buttons[0].pressed = false;
  wheel.pad.buttons[1] = { pressed: true };
  wheel.poll();
  assert.equal(wheel.controls.shiftUp, true);
  assert.equal(wheel.controls.shiftDown, false);
  wheel.controls.mapView = true;
  wheel.poll();
  assert.equal(wheel.controls.mapZoom, 0);
  wheel.pad.connected = false;
  wheel.poll();
  assert.equal(wheel.controls.throttle, 0);
  assert.equal(wheel.controls.brake, 0);
  assert.equal(wheel.controls.clutch, false);
  assert.equal(wheel.controls.shiftUp, false);
  assert.equal(wheel.controls.shiftDown, false);
});

test('T300 measured paddles and face buttons perform independent Xbox-style actions', (t) => {
  const wheel = rig(t);
  wheel.pad.id = 'Thrustmaster T300RS Racing wheel (Vendor: 044f Product: b66e)';
  wheel.pad.mapping = '';
  wheel.pad.axes = [0, 1, 0, 0, 0, 1, 1, 0, 0, 3.2857];
  const actions = ['shiftUp', 'shiftDown', 'clutch', 'mapView', 'driveModeRequested'];
  for (const [button, action] of [
    [1, 'shiftUp'],
    [0, 'shiftDown'],
    [5, 'clutch'],
    [4, 'mapView'],
    [3, 'lightingRequested'],
    [2, 'driveModeRequested'],
  ]) {
    wheel.pad.buttons[button] = { pressed: true };
    wheel.poll();
    for (const candidate of actions) assert.equal(wheel.controls[candidate], candidate === action);
    assert.equal(wheel.controls.lightingRequested, action === 'lightingRequested' ? 'press' : null);
    assert.equal(wheel.controls.highBeams, false);
    assert.equal(wheel.controls.handbrake, false);
    wheel.pad.buttons[button].pressed = false;
    wheel.poll();
    wheel.controls.mapView = false;
  }
});

test('T300 generic mode requires initialization instead of using digital pedals or empty axes', (t) => {
  const wheel = rig(t);
  wheel.pad.id = 'Thrustmaster FFB Wheel (Vendor: 044f Product: b65d)';
  wheel.pad.mapping = '';
  wheel.pad.axes = Array(10).fill(0);
  wheel.pad.buttons = Array.from({ length: 13 }, () => ({ value: 0, pressed: false }));
  wheel.poll();
  assert.match(wheel.controls.controllerStatus, /initialization required/);
  assert.equal(wheel.controls.throttle, 0);
  assert.equal(wheel.controls.brake, 0);
  assert.equal(wheel.controls.clutch, false);
  for (const index of [7, 6]) {
    for (const value of [0.25, 1, 0]) {
      wheel.pad.buttons[index] = { value, pressed: value > 0.5 };
      wheel.poll();
      assert.equal(wheel.controls.throttle, 0);
      assert.equal(wheel.controls.brake, 0);
      assert.equal(wheel.controls.reverse, 0);
      assert.equal(wheel.controls.highBeams, false);
      assert.equal(wheel.controls.handbrake, false);
      assert.equal(wheel.controls.clutch, false);
    }
  }
  wheel.pad.buttons[5] = { value: 1, pressed: true };
  wheel.poll();
  assert.equal(wheel.controls.clutch, true, 'the mapped clutch button still works');
  wheel.pad.connected = false;
  wheel.poll();
  assert.equal(wheel.controls.throttle, 0);
  assert.equal(wheel.controls.brake, 0);
  assert.equal(wheel.controls.clutch, false);
});

test('T300 compact HID and Linux axis layouts keep pedals separate from the D-pad', (t) => {
  const wheel = rig(t);
  wheel.pad.id = 'Thrustmaster FFB';
  wheel.pad.mapping = '';
  for (const axes of [
    [0, 1, 1, 1, 9 / 7],
    [0, 1, 1, 1, 0, 0],
  ]) {
    wheel.pad.axes = axes;
    wheel.poll();
    assert.equal(wheel.controls.throttle, 0);
    assert.equal(wheel.controls.brake, 0);
    assert.equal(wheel.controls.clutch, false);
    assert.equal(wheel.controls.recordRequested, false);
    wheel.pad.axes[3] = -1;
    wheel.pad.axes[4] = axes.length === 6 ? 0 : -1;
    if (axes.length === 6) wheel.pad.axes[5] = -1;
    wheel.poll();
    assert.equal(wheel.controls.clutch, true);
    assert.equal(wheel.controls.recordRequested, true);
    wheel.pad.axes[4] = axes.length === 6 ? 0 : 9 / 7;
    if (axes.length === 6) wheel.pad.axes[5] = 0;
    wheel.poll();
  }
});

test('T300 hat and shortcut buttons match their physical actions without conflicts', (t) => {
  const wheel = rig(t);
  wheel.pad.id = 'Thrustmaster T300RS Racing wheel (Vendor: 044f Product: b66e)';
  wheel.pad.mapping = '';
  wheel.pad.axes = [0, 1, 0, 0, 0, 1, 1, 0, 0, 3.2857];
  for (const [hat, action] of [
    [-1, 'recordRequested'],
    [1 / 7, 'timeOfDayRequested'],
    [5 / 7, 'previousLapRequested'],
    [-3 / 7, 'nextLapRequested'],
  ]) {
    wheel.pad.axes[9] = hat;
    wheel.poll();
    assert.equal(wheel.controls[action], true);
    wheel.poll();
    assert.equal(wheel.controls[action], false);
    wheel.pad.axes[9] = 3.2857;
    wheel.poll();
  }
  wheel.pad.buttons[10] = { pressed: true };
  wheel.poll();
  assert.equal(wheel.controls.lookBehind, false, 'L3 does not perform the R3 action');
  wheel.pad.buttons[10].pressed = false;
  wheel.poll();
  for (const [button, action, held] of [
    [6, 'cameraRequested', false],
    [7, 'resetRequested', false],
    [8, 'handbrake', true],
    [9, 'highBeams', true],
    [11, 'lookBehind', true],
  ]) {
    wheel.pad.buttons[button] = { pressed: true };
    wheel.poll();
    assert.equal(wheel.controls[action], true);
    for (const other of [
      'cameraRequested',
      'resetRequested',
      'handbrake',
      'highBeams',
      'lookBehind',
    ])
      if (other !== action) assert.equal(wheel.controls[other], false);
    wheel.poll();
    assert.equal(wheel.controls[action], held);
    wheel.pad.buttons[button].pressed = false;
    wheel.poll();
    assert.equal(wheel.controls[action], false);
  }
});

test('keyboard pedals override analog input only while held', (t) => {
  const r = rig(t);
  const { keyboard, controller } = inputBindings.get();
  r.pad.buttons[controller.buttons.accelerate] = { value: 0.25, pressed: true };
  r.pad.buttons[controller.buttons.brake] = { value: 0.75, pressed: true };
  r.controls.keys.add(keyboard.accelerate);
  r.controls.keys.add(keyboard.brake);
  r.poll();
  assert.equal(r.controls.throttle, 1);
  assert.equal(r.controls.brake, 1);
  assert.equal(r.controls.reverse, 1);
  r.controls.keys.clear();
  r.poll();
  assert.equal(r.controls.throttle, 0.25);
  assert.equal(r.controls.brake, 0.75);
  assert.equal(r.controls.reverse, 0.75);
});

test('pedals support digital bindings without an analog value and release on disconnect', (t) => {
  const r = rig(t);
  const { buttons } = inputBindings.get().controller;
  for (const pressed of [true, false, true]) {
    r.pad.buttons[buttons.accelerate] = { pressed };
    r.pad.buttons[buttons.brake] = { pressed };
    r.poll();
    assert.equal(r.controls.throttle, Number(pressed));
    assert.equal(r.controls.brake, Number(pressed));
    assert.equal(r.controls.reverse, Number(pressed));
  }
  r.pad.connected = false;
  r.poll();
  assert.equal(r.controls.throttle, 0);
  assert.equal(r.controls.brake, 0);
  assert.equal(r.controls.reverse, 0);
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

test('holding the handbrake for 5 seconds latches it until the next press', (t) => {
  for (const [name, press] of [
    [
      'controller',
      (r, down) => {
        r.pad.buttons[5] = { pressed: down };
      },
    ],
    [
      'keyboard',
      (r, down) => {
        if (down) r.controls.keys.add('Space');
        else r.controls.keys.delete('Space');
      },
    ],
  ]) {
    const r = rig(t);
    press(r, true);
    r.poll();
    r.poll(4999);
    assert.equal(r.controls.handbrake, true, `${name}: handbrake works while held`);
    press(r, false);
    r.poll();
    assert.equal(r.controls.handbrake, false, `${name}: release before 5 seconds is momentary`);

    press(r, true);
    r.poll();
    r.poll(5000);
    press(r, false);
    r.poll();
    assert.equal(r.controls.handbrake, true, `${name}: 5-second hold stays engaged after release`);

    press(r, true);
    r.poll();
    press(r, false);
    r.poll();
    assert.equal(r.controls.handbrake, false, `${name}: next tap disengages the handbrake`);
  }
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
