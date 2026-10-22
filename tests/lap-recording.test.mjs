import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let THREE;
let recording;

class MemoryStorage {
  map = new Map();
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    this.map.set(key, String(value));
  }
  removeItem(key) {
    this.map.delete(key);
  }
}

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  THREE = await server.ssrLoadModule('three');
  recording = await server.ssrLoadModule('/src/lap-recording.ts');
});

after(async () => {
  await server?.close();
});

function frameAt(t) {
  const frame = recording.createReplayFrame();
  frame.position.set(t * 10, 1, -t * 5);
  frame.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t * 0.5);
  frame.wheels.forEach((wheel, i) => {
    wheel.position.set(i % 2 ? 0.7 : -0.7, -0.2, i < 2 ? 1.2 : -1.3);
    wheel.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), i < 2 ? 0.1 : 0);
    wheel.spin = t * 40;
  });
  Object.assign(frame, {
    rpm: 3000 + t * 100,
    gear: 3,
    throttle: 0.5,
    load: 0.4,
    boost: 0.2,
    steering: -0.12,
    braking: t > 1,
  });
  frame.contacts[2] = true;
  frame.tires[3].slip = 0.6;
  return frame;
}

function sampleRun() {
  const run = new recording.RunRecording(0.004);
  run.lapStarts.push(0);
  for (let i = 0; i < 90; i++) run.push(frameAt(0.004 + i * run.interval));
  run.completeLap(1, 1, 2);
  run.completeLap(1.8, 0.8, 0);
  return run;
}

test('interpolates recorded frames between samples', () => {
  const run = sampleRun();
  const out = recording.createReplayFrame();
  assert.ok(run.read(1.234, out));
  assert.ok(Math.abs(out.position.x - 12.34) < 1e-3);
  assert.ok(Math.abs(out.wheels[0].spin - 1.234 * 40) < 1e-3);
  assert.ok(Math.abs(out.rpm - 3123.4) < 0.1);
  assert.equal(out.gear, 3);
  assert.equal(out.braking, true);
  assert.deepEqual(out.contacts, [false, false, true, false]);
  run.read(-5, out);
  assert.ok(Math.abs(out.position.x - 0.04) < 1e-4, 'clamps before the first sample');
});

test('reports HUD lap timing and fastest lap from a run', () => {
  const run = sampleRun();
  assert.equal(run.bestLap, 1);
  assert.deepEqual(run.timingAt(0.5), {
    lap: 1,
    current: 0.5,
    last: null,
    best: null,
    lastCones: null,
  });
  const later = run.timingAt(2);
  assert.equal(later.lap, 3);
  assert.ok(Math.abs(later.current - 0.2) < 1e-9);
  assert.equal(later.last, 0.8);
  assert.equal(later.best, 0.8);
  assert.equal(later.lastCones, 0);
});

test('all light states round-trip independently of each other and all four wheel-contact flags', () => {
  const run = new recording.RunRecording();
  const frame = recording.createReplayFrame();
  frame.contacts.fill(true);
  const lights = ['highBeams', 'fogLights', 'leftSignal', 'rightSignal'];
  for (const headlights of [null, false, true]) {
    frame.headlights = headlights;
    for (let flags = 0; flags < 16; flags++) {
      lights.forEach((light, i) => {
        frame[light] = Boolean(flags & (1 << i));
      });
      run.push(frame);
    }
  }
  const { data, count } = recording.decodeFrames(recording.encodeFrames(run));
  const decoded = new recording.RunRecording(0, run.interval, data, count);
  const out = recording.createReplayFrame();
  for (let sample = 0; sample < 48; sample++) {
    decoded.read(sample * run.interval, out);
    lights.forEach((light, i) => assert.equal(out[light], Boolean(sample & (1 << i)), light));
    assert.equal(out.headlights, [null, false, true][Math.floor(sample / 16)]);
    assert.deepEqual(out.contacts, [true, true, true, true]);
  }
});

test('replay lap controls show completed time, fastest ties, launch and partial laps', () => {
  const run = sampleRun();
  run.lapStarts[0] = 0.1;
  assert.deepEqual(run.replayLapAt(0), {
    lap: 0,
    time: null,
    fastest: false,
    previous: null,
    next: 0.1,
  });
  assert.deepEqual(run.replayLapAt(0.5), {
    lap: 1,
    time: 1,
    fastest: false,
    previous: null,
    next: 1,
  });
  assert.deepEqual(run.replayLapAt(1), {
    lap: 2,
    time: 0.8,
    fastest: true,
    previous: 0.1,
    next: 1.8,
  });
  assert.deepEqual(run.replayLapAt(2), {
    lap: 3,
    time: null,
    fastest: false,
    previous: 1,
    next: null,
  });
  run.lapTimes[0] = 0.8;
  assert.equal(run.replayLapAt(0.5).fastest, true);
  assert.equal(run.replayLapAt(1.5).fastest, true);
  const empty = new recording.RunRecording();
  assert.deepEqual(empty.replayLapAt(0), {
    lap: 0,
    time: null,
    fastest: false,
    previous: null,
    next: null,
  });
});

test('extracts an independent lap aligned to its exact start-line crossing', () => {
  const run = sampleRun();
  const lap = run.extractLap(1);
  assert.deepEqual(lap.lapStarts, [0, 0.8]);
  assert.deepEqual(lap.lapTimes, [0.8]);
  assert.deepEqual(lap.lapCones, [0]);
  assert.ok(lap.count < run.count);
  const expected = recording.createReplayFrame();
  const actual = recording.createReplayFrame();
  for (const time of [0, 0.017, 0.4, 0.799, 0.8]) {
    run.read(1 + time, expected);
    lap.read(time, actual);
    assert.ok(expected.position.distanceTo(actual.position) < 1e-5);
    assert.ok(expected.quaternion.angleTo(actual.quaternion) < 1e-6);
    assert.ok(Math.abs(expected.wheels[0].spin - actual.wheels[0].spin) < 1e-5);
  }
  const original = lap.data[0];
  run.data.fill(999);
  assert.equal(lap.data[0], original, 'lap owns its frames after the run is discarded');
  assert.throws(() => run.extractLap(5), /Completed lap not found/);
});

test('persists only faster record laps, independently from runs and course directions', async () => {
  const storage = new MemoryStorage();
  const run = sampleRun();
  const slow = run.extractLap(0);
  const fast = run.extractLap(1);
  assert.equal(await recording.loadRecordLap('map', storage), null);
  assert.equal(await recording.saveRecordLap('map', slow, storage), true);
  assert.equal(await recording.saveRecordLap('map', fast, storage), true);
  assert.equal(await recording.saveRecordLap('map', slow, storage), false);
  assert.equal(
    await recording.saveRecordLap('map', fast, storage),
    false,
    'ties preserve the holder',
  );
  const saved = await recording.saveRun('map', run, storage);
  recording.deleteRun('map', saved.id, storage);
  const loaded = await recording.loadRecordLap('map', storage);
  assert.deepEqual(loaded.lapTimes, [0.8]);
  assert.deepEqual(loaded.lapStarts, [0, 0.8]);
  assert.deepEqual(loaded.lapCones, [0]);
  const out = recording.createReplayFrame();
  loaded.read(0.4, out);
  assert.ok(Math.abs(out.position.x - 14) < 1e-4);
  assert.equal(await recording.loadRecordLap('other-map', storage), null);
  assert.equal(await recording.loadRecordLap('map:reverse', storage), null);
  await recording.saveRecordLap('map:reverse', slow, storage);
  assert.deepEqual((await recording.loadRecordLap('map:reverse', storage)).lapTimes, [1]);
  assert.deepEqual((await recording.loadRecordLap('map', storage)).lapTimes, [0.8]);
});

test('concurrent record writes cannot replace a faster lap with a slower lap', async () => {
  const storage = new MemoryStorage();
  const run = sampleRun();
  await Promise.all([
    recording.saveRecordLap('map', run.extractLap(1), storage),
    recording.saveRecordLap('map', run.extractLap(0), storage),
  ]);
  assert.deepEqual((await recording.loadRecordLap('map', storage)).lapTimes, [0.8]);
});

test('record storage failures and malformed records are surfaced', async () => {
  const storage = new MemoryStorage();
  const lap = sampleRun().extractLap(1);
  await assert.rejects(
    recording.saveRecordLap('map', new recording.RunRecording(), storage),
    /Invalid record lap/,
  );
  storage.setItem('dorifto.record.v1:map', '{"time":-1}');
  await assert.rejects(recording.loadRecordLap('map', storage), /Corrupt record lap/);
  storage.removeItem('dorifto.record.v1:map');
  storage.setItem = () => {
    throw new Error('Storage full');
  };
  await assert.rejects(recording.saveRecordLap('map', lap, storage), /Storage full/);
});

test('round-trips runs through compressed storage per course and direction', async () => {
  const storage = new MemoryStorage();
  const run = sampleRun();
  const key = recording.replayStorageKey({
    id: 'x',
    name: 'X',
    width: 10,
    points: [
      [0, 0],
      [10, 0],
      [5, 5],
    ],
  });
  assert.notEqual(
    key,
    recording.replayStorageKey({
      id: 'x',
      name: 'X',
      width: 10,
      points: [
        [0, 0],
        [10, 0],
        [5, 5],
      ],
      reverse: true,
    }),
  );
  const saved = await recording.saveRun(key, run, storage);
  assert.deepEqual(
    recording.listSavedRuns(key, storage).map((entry) => entry.id),
    [saved.id],
  );
  assert.deepEqual(saved.laps, [1, 0.8]);
  const loaded = await recording.loadRun(key, saved.id, storage);
  assert.equal(loaded.count, run.count);
  assert.deepEqual(loaded.lapStarts, run.lapStarts);
  const a = recording.createReplayFrame();
  const b = recording.createReplayFrame();
  run.read(2.1, a);
  loaded.read(2.1, b);
  assert.ok(a.position.distanceTo(b.position) < 1e-4);
  assert.ok(a.quaternion.angleTo(b.quaternion) < 1e-3);
  assert.ok(a.wheels[1].position.distanceTo(b.wheels[1].position) < 1e-3);
  assert.ok(Math.abs(a.rpm - b.rpm) < 1);
  assert.ok(Math.abs(a.tires[3].slip - b.tires[3].slip) < 0.01);
  recording.deleteRun(key, saved.id, storage);
  assert.deepEqual(recording.listSavedRuns(key, storage), []);
  assert.equal(storage.map.size, 1);
});

test('poses a car from a frame, including hub and spinning wheel', () => {
  const frame = frameAt(0.5);
  const chassis = new THREE.Object3D();
  const wheels = [0, 1, 2, 3].map(() => new THREE.Object3D());
  const hubs = [0, 1, 2, 3].map(() => new THREE.Object3D());
  recording.applyCarPose(frame, chassis, wheels, hubs);
  const captured = recording.createReplayFrame();
  recording.captureCarPose(
    captured,
    chassis,
    hubs,
    frame.wheels.map((wheel) => wheel.spin),
  );
  frame.wheels.forEach((wheel, i) => {
    assert.ok(wheel.position.distanceTo(captured.wheels[i].position) < 1e-6);
    assert.ok(wheel.quaternion.angleTo(captured.wheels[i].quaternion) < 1e-4);
    assert.ok(
      hubs[i].quaternion.angleTo(wheels[i].quaternion) > 0.1,
      'wheels spin relative to hubs',
    );
  });
});
