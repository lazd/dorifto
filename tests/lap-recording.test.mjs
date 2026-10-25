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

test('mode, validity, and statistics survive storage and records remain mode-specific', async () => {
  const { recordStorageKey } = await server.ssrLoadModule('/src/race-rules.ts');
  const storage = new MemoryStorage();
  const run = sampleRun();
  run.mode = 'anything-goes';
  run.lapValidity[0] = {
    trackLimits: true,
    mayoTouched: true,
    mustard: true,
    mustardTouched: true,
    mustardCrossed: false,
  };
  run.lapValidity[1] = {
    trackLimits: true,
    mustard: false,
    mustardTouched: true,
    mustardCrossed: true,
  };
  run.statistics = {
    maxSpeed: 30,
    distance: 45,
    time: 2,
    driftTime: 0.8,
    conesHit: 2,
    carContacts: 1,
    timeInFirst: 1,
  };
  run.partialLap = { time: 0.2, trackLimits: false, mustard: false };
  assert.equal(run.bestLapForMode('track-limits'), 1);
  assert.equal(run.bestLapForMode('mustard'), 0);
  const key = 'eligible-course';
  const summary = await recording.saveRun(key, run, { driver: 'human' }, storage);
  const loaded = await recording.loadRun(key, summary.id, storage);
  assert.equal(loaded.mode, run.mode);
  assert.deepEqual(loaded.lapValidity, run.lapValidity);
  assert.deepEqual(loaded.statistics, run.statistics);
  assert.deepEqual(loaded.partialLap, run.partialLap);
  assert.equal(recording.bestRunTime(summary, 'mustard'), run.lapTimes[0]);
  for (const mode of ['track-limits', 'mustard']) {
    const index = loaded.bestLapForMode(mode);
    await recording.saveRecordLap(recordStorageKey(key, mode), loaded.extractLap(index), storage);
  }
  const trackRecord = await recording.loadRecordLap(recordStorageKey(key, 'track-limits'), storage);
  const mustardRecord = await recording.loadRecordLap(recordStorageKey(key, 'mustard'), storage);
  assert.equal(trackRecord.lapTimes[0], run.lapTimes[1]);
  assert.equal(mustardRecord.lapTimes[0], run.lapTimes[0]);
  assert.deepEqual(mustardRecord.lapValidity[0], run.lapValidity[0]);
  run.lapValidity[1].trackLimits = false;
  assert.equal(run.bestLapForMode('track-limits'), 0, 'invalid faster laps never claim a record');
  assert.equal(run.bestLap, 1, 'Anything Goes still accepts the unrestricted lap');
  run.statistics = { maxSpeed: 30, distance: 45, time: 2 };
  const legacy = await recording.saveRun(key, run, { driver: 'human' }, storage);
  const legacyRecording = await recording.loadRun(key, legacy.id, storage);
  for (const stat of ['driftTime', 'conesHit', 'carContacts', 'timeInFirst'])
    assert.equal(legacyRecording.statistics[stat], undefined, `${stat} was not tracked`);
});

test('records persist statistics for the extracted lap rather than the whole run', async () => {
  const storage = new MemoryStorage();
  const run = new recording.RunRecording();
  for (let i = 0; i < 90; i++) run.push(frameAt(i * run.interval));
  run.updateStatistics(1, 40, { driftTime: 0.1, conesHit: 1, carContacts: 1, timeInFirst: 0 });
  run.lapStarts.push(1);
  run.updateStatistics(1, 20, { driftTime: 0.6, conesHit: 2, carContacts: 2, timeInFirst: 0.5 });
  run.completeLap(2, 1, 1);
  run.updateStatistics(0.8, 10, { driftTime: 0.8, conesHit: 2, carContacts: 3, timeInFirst: 1.3 });
  run.completeLap(2.8, 0.8, 0);
  const expected = {
    maxSpeed: 10,
    distance: 8,
    time: 0.8,
    driftTime: 0.8 - 0.6,
    conesHit: 0,
    carContacts: 1,
    timeInFirst: 0.8,
  };
  assert.deepEqual(run.extractLap(1).statistics, expected);
  assert.equal(run.statistics.maxSpeed, 40, 'launch and previous laps stay in the run total');
  const saved = await recording.saveRun('stats', run, { driver: 'human' }, storage);
  const loaded = await recording.loadRun('stats', saved.id, storage);
  assert.deepEqual(loaded.lapStatistics, run.lapStatistics);
  const lap = loaded.extractLap(1);
  await recording.saveRecordLap('stats', lap, storage);
  lap.statistics.maxSpeed = 99;
  const record = await recording.loadRecordLap('stats', storage);
  assert.deepEqual(record.statistics, expected);
  assert.deepEqual(record.extractLap(0).statistics, expected);
});

test('full-field recordings preserve each driver, timeline, statistics, and export payload', async () => {
  const storage = new MemoryStorage();
  const run = sampleRun();
  const opponent = sampleRun();
  opponent.data[0] += 50;
  opponent.statistics.maxSpeed = 42;
  opponent.finished = true;
  run.field.push(opponent);
  run.race = {
    botsOnly: false,
    bots: [{ skill: 0.8, aggression: 0.4, learning: false }],
    entrants: [
      { name: 'You', color: '#fff' },
      { name: 'Bot', color: '#0ff' },
    ],
  };
  const saved = await recording.saveRun('field', run, { driver: 'human' }, storage);
  const loaded = await recording.loadRun('field', saved.id, storage);
  assert.deepEqual(loaded.race, run.race);
  assert.equal(loaded.field.length, 1);
  for (const [actual, expected] of [
    [loaded, run],
    [loaded.field[0], opponent],
  ]) {
    assert.equal(actual.count, expected.count);
    assert.equal(actual.firstTime, expected.firstTime);
    assert.deepEqual(actual.lapTimes, expected.lapTimes);
    assert.deepEqual(actual.lapValidity, expected.lapValidity);
    assert.equal(actual.statistics.maxSpeed, expected.statistics.maxSpeed);
    const frame = recording.createReplayFrame();
    actual.read(actual.firstTime, frame);
    assert.ok(Math.abs(frame.position.x - expected.data[0]) < 1e-5);
  }
  assert.equal(loaded.field[0].finished, true);
  const exported = JSON.parse(recording.exportRun('field', saved.id, storage));
  const importedStorage = new MemoryStorage();
  for (const [key, value] of Object.entries(exported)) importedStorage.setItem(key, value);
  const imported = await recording.loadRun('field', saved.id, importedStorage);
  assert.equal(imported.field[0].count, opponent.count);
  assert.equal(loaded.extractLap(0).field.length, 0, 'record laps stay single-driver replays');
});

test('recording freezes terminal driver statistics while retaining full-race pose samples', async () => {
  const { emptyLapState } = await server.ssrLoadModule('/src/physics-messages.ts');
  const run = new recording.RunRecording();
  const lap = { ...emptyLapState(), lap: 1, elapsedTime: 1, current: 1 };
  run.recordStep({ time: 1, laps: lap, active: true, speed: 10, timeInFirst: 1 });
  assert.equal(run.statistics.time, 1);
  lap.finished = true;
  lap.completed = 1;
  lap.lapStartedAt = 2;
  lap.elapsedTime = 2;
  lap.lastAttempt = { time: 2, cones: 0, valid: true, trackLimits: true, mustard: null };
  run.recordStep({ time: 2, laps: lap, active: true, speed: 20, timeInFirst: 2 });
  assert.equal(run.lapTimes.length, 1);
  assert.equal(run.partialLap, undefined);
  const stats = { ...run.statistics };
  const frame = sampleRun().data.slice(0, recording.frameStride);
  run.recordStep({ time: 3, laps: lap, active: false, speed: 100, timeInFirst: 3, sample: frame });
  run.recordStep({ time: 3 + run.interval, laps: lap, active: false, sample: frame });
  assert.deepEqual(run.statistics, stats);
  assert.equal(run.count, 2);
  assert.equal(run.finished, true);
  assert.equal(
    run.timingAt(3).lap,
    1,
    'the HUD does not invent another lap while other cars finish',
  );
  assert.equal(run.timingAt(3).current, 2);
  assert.equal(run.replayLapAt(3).next, null);
});

test('a driver joining an already-running field only accumulates active tick time', async () => {
  const { emptyLapState } = await server.ssrLoadModule('/src/physics-messages.ts');
  const run = new recording.RunRecording();
  const laps = { ...emptyLapState(), elapsedTime: 20 };
  run.recordStep({ laps, time: 20, elapsed: 0, active: false });
  laps.elapsedTime += 0.01;
  run.recordStep({ laps, time: 20.01, elapsed: 0.01, active: true, speed: 10 });
  assert.equal(run.statistics.time, 0.01);
  assert.equal(run.statistics.distance, 0.1);
});

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
  const saved = await recording.saveRun('map', run, { driver: 'human' }, storage);
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
  const saved = await recording.saveRun(key, run, { driver: 'human' }, storage);
  assert.deepEqual(
    recording.listSavedRuns(key, storage).map((entry) => entry.id),
    [saved.id],
  );
  assert.deepEqual(saved.laps, [1, 0.8]);
  const exported = JSON.parse(recording.exportRun(key, saved.id, storage));
  const exportedStorage = new MemoryStorage();
  for (const [name, value] of Object.entries(exported)) exportedStorage.setItem(name, value);
  assert.deepEqual(
    recording.listSavedRuns(key, exportedStorage),
    recording.listSavedRuns(key, storage),
  );
  const exportedRun = await recording.loadRun(key, saved.id, exportedStorage);
  const loaded = await recording.loadRun(key, saved.id, storage);
  assert.deepEqual(exportedRun, loaded);
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
  assert.throws(() => recording.exportRun(key, saved.id, storage), /Saved laps not found/);
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

test('summarizes the record and saved runs separately for each course direction', async () => {
  const storage = new MemoryStorage();
  const course = {
    id: 'x',
    name: 'X',
    width: 10,
    points: [
      [0, 0],
      [10, 0],
      [5, 5],
    ],
  };
  const run = sampleRun();
  const forward = recording.replayStorageKey(course);
  const reverse = recording.replayStorageKey({ ...course, reverse: true });
  const saved = await recording.saveRun(forward, run, { driver: 'human' }, storage);
  await recording.saveRecordLap(reverse, run.extractLap(0), storage);
  assert.deepEqual(
    recording
      .courseDirectionRecords(course, storage)
      .map(({ reverse, record, runs }) => ({ reverse, record, runs: runs.map(({ id }) => id) })),
    [
      { reverse: false, record: 0.8, runs: [saved.id] },
      { reverse: true, record: 1, runs: [] },
    ],
  );
});

test('deletes saved laps, replays, and record laps in both course directions', async () => {
  const storage = new MemoryStorage();
  const course = {
    id: 'saved-test',
    name: 'Test course',
    width: 10,
    points: [
      [0, 0],
      [10, 0],
      [5, 5],
    ],
  };
  const otherCourse = { ...course, id: 'saved-other' };
  const run = sampleRun();
  const forward = recording.replayStorageKey(course);
  const reverse = recording.replayStorageKey({ ...course, reverse: true });
  const other = recording.replayStorageKey(otherCourse);
  await recording.saveRun(forward, run, { driver: 'human' }, storage);
  await recording.saveRun(reverse, run, { driver: 'human' }, storage);
  await recording.saveRun(other, run, { driver: 'human' }, storage);
  await recording.saveRecordLap(forward, run.extractLap(0), storage);
  await recording.saveRecordLap(reverse, run.extractLap(0), storage);

  recording.deleteCourseRecords(course, storage);

  assert.deepEqual(
    recording.courseDirectionRecords(course, storage).map(({ record, runs }) => ({
      record,
      runs,
    })),
    [
      { record: null, runs: [] },
      { record: null, runs: [] },
    ],
  );
  assert.equal(recording.listSavedRuns(other, storage).length, 1);
});
