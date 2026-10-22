import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let THREE;
let recording;

class MemoryStorage {
  map = new Map();
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
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
  Object.assign(frame, { rpm: 3000 + t * 100, gear: 3, throttle: 0.5, load: 0.4, boost: 0.2, steering: -0.12, braking: t > 1 });
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
  assert.deepEqual(run.timingAt(0.5), { lap: 1, current: 0.5, last: null, best: null, lastCones: null });
  const later = run.timingAt(2);
  assert.equal(later.lap, 3);
  assert.ok(Math.abs(later.current - 0.2) < 1e-9);
  assert.equal(later.last, 0.8);
  assert.equal(later.best, 0.8);
  assert.equal(later.lastCones, 0);
});

test('round-trips runs through compressed storage per course and direction', async () => {
  const storage = new MemoryStorage();
  const run = sampleRun();
  const key = recording.replayStorageKey({ id: 'x', name: 'X', width: 10, points: [[0, 0], [10, 0], [5, 5]] });
  assert.notEqual(key, recording.replayStorageKey({ id: 'x', name: 'X', width: 10, points: [[0, 0], [10, 0], [5, 5]], reverse: true }));
  const saved = await recording.saveRun(key, run, storage);
  assert.deepEqual(recording.listSavedRuns(key, storage).map((entry) => entry.id), [saved.id]);
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
  recording.captureCarPose(captured, chassis, hubs, frame.wheels.map((wheel) => wheel.spin));
  frame.wheels.forEach((wheel, i) => {
    assert.ok(wheel.position.distanceTo(captured.wheels[i].position) < 1e-6);
    assert.ok(wheel.quaternion.angleTo(captured.wheels[i].quaternion) < 1e-4);
    assert.ok(hubs[i].quaternion.angleTo(wheels[i].quaternion) > 0.1, 'wheels spin relative to hubs');
  });
});
