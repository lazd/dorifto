import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let CarStereo;
let stereoStations;
let isStereoStation;
let isStereoStationSelection;

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  ({ CarStereo, stereoStations, isStereoStation, isStereoStationSelection } =
    await server.ssrLoadModule('/src/stereo.ts'));
});

after(async () => { await server?.close(); });

function fixture(t, muted = false) {
  let audio;
  class FakeAudio extends EventTarget {
    playCalls = 0;
    paused = true;
    playError = null;
    attributes = new Map();
    play() {
      this.playCalls++;
      this.paused = false;
      return this.playError ? Promise.reject(this.playError) : Promise.resolve();
    }
    pause() { this.paused = true; }
    removeAttribute(name) { delete this[name]; }
    setAttribute(name, value) { this.attributes.set(name, value); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    load() {}
    constructor() {
      super();
      audio = this;
    }
  }
  const previousAudio = globalThis.Audio;
  globalThis.Audio = FakeAudio;
  t.after(() => {
    if (previousAudio === undefined) delete globalThis.Audio;
    else globalThis.Audio = previousAudio;
  });
  const previousWindow = globalThis.window;
  const previousKeyboardEvent = globalThis.KeyboardEvent;
  const window = new EventTarget();
  class FakeKeyboardEvent extends Event {
    constructor(code) {
      super('keydown');
      this.code = code;
    }
  }
  globalThis.window = window;
  globalThis.KeyboardEvent = FakeKeyboardEvent;
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousKeyboardEvent === undefined) delete globalThis.KeyboardEvent;
    else globalThis.KeyboardEvent = previousKeyboardEvent;
  });
  const power = [];
  const errors = [];
  const stereo = new CarStereo((value) => power.push(value), (error) => errors.push(error), muted);
  return { stereo, audio, power, errors, window, KeyboardEvent: FakeKeyboardEvent };
}

test('a URL-selected station can start immediately without cycling', (t) => {
  const { stereo, audio } = fixture(t);
  const station = stereoStations.at(-1);
  stereo.setStation(station.id);
  stereo.turnOn();
  assert.equal(audio.src, station.stream);
  assert.equal(audio.playCalls, 1);
  assert.equal(stereo.isPowered, true);
});

test('blocked autoplay retries on a user gesture and removes retry listeners after success', async (t) => {
  const { stereo, audio, errors, window } = fixture(t);
  audio.playError = new DOMException('User activation required', 'NotAllowedError');
  stereo.turnOn();
  await Promise.resolve();
  assert.equal(stereo.isPowered, true);
  assert.match(errors[0].message, /autoplay/);
  audio.playError = null;
  window.dispatchEvent(new Event('pointerdown'));
  await Promise.resolve();
  assert.equal(audio.playCalls, 2);
  assert.equal(audio.src, stereoStations[0].stream);
  window.dispatchEvent(new Event('pointerdown'));
  assert.equal(audio.playCalls, 2);
});

test('S retries blocked autoplay without advancing the station', async (t) => {
  const { stereo, audio, window, KeyboardEvent } = fixture(t);
  const station = stereoStations[1];
  stereo.setStation(station.id);
  audio.playError = new DOMException('User activation required', 'NotAllowedError');
  stereo.turnOn();
  await Promise.resolve();
  audio.playError = null;
  window.dispatchEvent(new KeyboardEvent('KeyS'));
  assert.equal(audio.playCalls, 1);
  assert.equal(stereo.press(), station.id);
  assert.equal(audio.playCalls, 2);
  assert.equal(audio.src, station.stream);
});

test('stays off until requested and starts the playlist MP3 directly, only once', (t) => {
  const { stereo, audio, power, errors } = fixture(t);
  assert.equal(audio.preload, 'none');
  assert.equal(audio.getAttribute('referrerpolicy'), 'no-referrer');
  assert.equal(audio.src, undefined);
  assert.equal(audio.playCalls, 0);
  assert.deepEqual(power, []);
  stereo.turnOn();
  assert.equal(audio.src, stereoStations[0].stream);
  assert.equal(audio.playCalls, 1);
  assert.deepEqual(power, [true]);
  stereo.turnOn();
  assert.equal(audio.playCalls, 1);
  assert.deepEqual(errors, []);
});

test('supports Off as a station selection and explicitly powers down', (t) => {
  const { stereo, audio, power } = fixture(t);
  assert.equal(isStereoStationSelection('off'), true);
  assert.equal(isStereoStationSelection(stereoStations[0].id), true);
  assert.equal(isStereoStationSelection('missing'), false);
  stereo.turnOn();
  stereo.turnOff();
  assert.equal(stereo.isPowered, false);
  assert.equal(audio.paused, true);
  assert.equal(audio.src, undefined);
  assert.deepEqual(power, [true, false]);
});

test('respects initial and subsequent master mute without restarting playback', (t) => {
  const { stereo, audio } = fixture(t, true);
  assert.equal(audio.muted, true);
  stereo.turnOn();
  assert.equal(audio.muted, true);
  stereo.setMuted(false);
  assert.equal(audio.muted, false);
  stereo.setMuted(true);
  assert.equal(audio.muted, true);
  assert.equal(audio.playCalls, 1);
});

test('S cycles through stations, turns off, and then starts again at the first station', (t) => {
  const { stereo, audio, power } = fixture(t);
  for (const station of stereoStations) {
    assert.equal(stereo.press(), station.id);
    assert.equal(audio.src, station.stream);
  }
  assert.equal(stereo.press(), stereoStations[0].id);
  assert.equal(audio.src, undefined);
  assert.equal(audio.paused, true);
  assert.equal(audio.playCalls, stereoStations.length);
  assert.deepEqual(power, [...stereoStations.map(() => true), false]);
  assert.equal(stereo.press(), stereoStations[0].id);
  assert.equal(audio.src, stereoStations[0].stream);
  assert.equal(audio.playCalls, stereoStations.length + 1);
  assert.deepEqual(power, [...stereoStations.map(() => true), false, true]);
});

test('S retries a failed station instead of advancing past it', async (t) => {
  const { stereo, audio } = fixture(t);
  const station = stereoStations[1];
  stereo.setStation(station.id);
  audio.playError = new Error('Offline');
  assert.equal(stereo.press(), station.id);
  await Promise.resolve();
  audio.playError = null;
  assert.equal(stereo.press(), station.id);
  assert.equal(audio.src, station.stream);
  assert.equal(audio.playCalls, 2);
});

test('left powers on the selected station, then cycles backward through Off and the last station', (t) => {
  const { stereo, audio } = fixture(t);
  const first = stereoStations[0];
  const last = stereoStations.at(-1);
  assert.equal(stereo.press('previous'), first.id);
  assert.equal(audio.src, first.stream);
  assert.equal(stereo.press('previous'), last.id);
  assert.equal(audio.paused, true);
  assert.equal(audio.src, undefined);
  for (const station of stereoStations.toReversed()) {
    assert.equal(stereo.press('previous'), station.id);
    assert.equal(audio.src, station.stream);
  }
  assert.equal(stereo.press('next'), stereoStations[1].id);
  assert.equal(audio.src, stereoStations[1].stream);
  assert.equal(audio.playCalls, stereoStations.length + 2);
});

test('turning off ignores an interrupted playback rejection', async (t) => {
  const { stereo, audio, power, errors } = fixture(t);
  stereo.setStation(stereoStations.at(-1).id);
  audio.playError = new Error('Playback interrupted by power off');
  stereo.press();
  stereo.press();
  await Promise.resolve();
  assert.deepEqual(power, [true, false]);
  assert.deepEqual(errors, []);
  assert.equal(audio.paused, true);
  assert.equal(audio.src, undefined);
});

test('selecting a station while off does not start audio, and selecting while on switches streams', (t) => {
  const { stereo, audio, errors } = fixture(t);
  const [first, second] = stereoStations;
  stereo.setStation(second.id);
  assert.equal(audio.playCalls, 0);
  stereo.turnOn();
  assert.equal(audio.src, second.stream);
  assert.equal(audio.playCalls, 1);
  stereo.setStation(second.id);
  assert.equal(audio.playCalls, 1);
  stereo.setStation(first.id);
  assert.equal(audio.src, first.stream);
  assert.equal(audio.playCalls, 2);
  assert.throws(() => stereo.setStation('missing'), /Unknown stereo station/);
  assert.deepEqual(errors, []);
});

test('all listed stations can be selected and play their direct HTTPS MP3 streams', (t) => {
  const { stereo, audio } = fixture(t);
  assert.ok(stereoStations.length > 0);
  assert.equal(new Set(stereoStations.map(({ id }) => id)).size, stereoStations.length);
  stereo.turnOn();
  for (const station of stereoStations) {
    assert.ok(station.name.trim());
    assert.equal(isStereoStation(station.id), true);
    stereo.setStation(station.id);
    assert.equal(audio.src, station.stream);
    assert.match(audio.src, /^https:\/\/ice\d\.somafm\.com\/[\w-]+-mp3$/);
  }
  assert.equal(isStereoStation('missing'), false);
});

test('a superseded play rejection does not turn off a newly selected station', async (t) => {
  const { stereo, audio, power, errors } = fixture(t);
  audio.playError = new Error('Old playback interrupted');
  stereo.turnOn();
  audio.playError = null;
  stereo.setStation(stereoStations[1].id);
  await Promise.resolve();
  assert.deepEqual(power, [true, true]);
  assert.deepEqual(errors, []);
  assert.equal(audio.paused, false);
});

test('reports rejected playback, turns off the display, and permits retry', async (t) => {
  const { stereo, audio, power, errors } = fixture(t);
  const error = new Error('Playback blocked');
  audio.playError = error;
  stereo.turnOn();
  await Promise.resolve();
  assert.deepEqual(power, [true, false]);
  assert.deepEqual(errors, [error]);
  assert.equal(audio.paused, true);
  audio.playError = null;
  stereo.turnOn();
  assert.equal(audio.playCalls, 2);
  assert.deepEqual(power, [true, false, true]);
});

test('reports network failures once even when play also rejects, and permits retry', async (t) => {
  const { stereo, audio, power, errors } = fixture(t);
  audio.playError = new Error('Playback failed');
  audio.error = { message: 'Network disconnected' };
  stereo.turnOn();
  audio.dispatchEvent(new Event('error'));
  await Promise.resolve();
  assert.deepEqual(power, [true, false]);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /Network disconnected/);
  assert.equal(audio.paused, true);
  audio.playError = null;
  stereo.turnOn();
  assert.equal(audio.playCalls, 2);
});
