import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let LapTimer;
let courses;
let courseRoute;
let courseGateDistances;
let courseLineWidth;
let createRaceStandings;
let resultStanding;
let recordOutcome;
let raceOutcome;
let mustardResult;
let mayoResult;
let createRunStatistics;
let driftMinimumSpeed;
let driftMinimumAngle;
let carContactSeparation;

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  ({ LapTimer } = await server.ssrLoadModule('/src/laps.ts'));
  ({ courses, courseRoute, courseGateDistances, courseLineWidth } =
    await server.ssrLoadModule('/src/courses.ts'));
  ({ createRaceStandings } = await server.ssrLoadModule('/src/race-standings.ts'));
  ({ resultStanding, recordOutcome, raceOutcome, mustardResult, mayoResult } =
    await server.ssrLoadModule('/src/run-results.ts'));
  ({ createRunStatistics, driftMinimumSpeed, driftMinimumAngle, carContactSeparation } =
    await server.ssrLoadModule('/src/run-statistics.ts'));
});
after(async () => server?.close());

test('race outcome distinguishes wins, finishes, retirement, and disqualification', () => {
  const winner = { entrant: 0, finished: true };
  const opponent = { entrant: 1, finished: true };
  assert.equal(raceOutcome(true, true, [winner, opponent]), '🏆 Won');
  assert.equal(raceOutcome(true, true, [opponent, winner]), '🏁 Finished');
  assert.equal(raceOutcome(true, true, []), '🏁 Finished');
  assert.equal(raceOutcome(false, true, [winner]), '🔴 DNF');
  assert.equal(raceOutcome(true, false, [winner]), '❌ Disqualified');
  assert.equal(raceOutcome(true, true, [{ ...opponent, disqualified: true }, winner]), '🏆 Won');
});

test('record outcomes compare to the pre-run record, including first records and exact ties', () => {
  assert.equal(recordOutcome(20, null).badge, 'New record');
  assert.equal(recordOutcome(19, 20).badge, 'New record');
  assert.equal(recordOutcome(20, 20).badge, 'Record tied');
  assert.equal(recordOutcome(20, 20).description, 'Track record: 0:20.000');
  assert.equal(recordOutcome(20.000001, 20).badge, '', 'only identical times are ties');
  assert.equal(recordOutcome(null, 20).badge, '');
  assert.match(recordOutcome(19, 20).description, /1.000s faster/);
});

test('only the current record holder gets a record badge after another driver goes faster', () => {
  for (const previous of [null, 25]) {
    assert.equal(recordOutcome(20, previous, 19).badge, '');
    assert.equal(
      recordOutcome(20, previous, 19).description,
      'Track record: 0:19.000 · 1.000s off',
    );
    assert.equal(recordOutcome(19, previous, 19).badge, 'New record');
  }
  assert.equal(recordOutcome(19, 19, 19).badge, 'Record tied');
  assert.equal(recordOutcome(20, 18, 19).badge, '', 'an older faster record still wins');
  assert.match(recordOutcome(20, 18, 19).description, /0:18.000/);
  assert.equal(recordOutcome(null, null, 19).description, 'Track record: 0:19.000 · No valid lap');
});

test('run statistics count drift, unique cones, and distinct car-contact episodes', () => {
  let pairs = [];
  const stats = createRunStatistics(
    {
      Ammo: { getPointer: (body) => body },
      vehicleBody: 1,
      dispatcher: {
        getNumManifolds: () => pairs.length,
        getManifoldByIndexInternal: (i) => ({
          getBody0: () => pairs[i][0],
          getBody1: () => pairs[i][1],
          getNumContacts: () => 2,
          getContactPoint: () => ({ getDistance: () => pairs[i][2] }),
        }),
      },
    },
    new Set([2, 3]),
  );
  const drifting = { speed: driftMinimumSpeed, slipAngle: -driftMinimumAngle };
  stats.update(0.1, drifting, true);
  stats.update(0.1, { ...drifting, speed: driftMinimumSpeed - 0.01 });
  stats.update(0.1, { ...drifting, slipAngle: driftMinimumAngle - 0.01 });
  assert.equal(stats.driftTime, 0.1, 'slow slides and normal cornering do not count');
  assert.equal(stats.timeInFirst, 0.1, 'only time spent ranked first counts');
  stats.hitCone(4);
  stats.hitCone(4);
  stats.hitCone(5);
  assert.equal(stats.conesHit, 2);
  const stopped = { speed: 0, slipAngle: 0 };
  pairs = [
    [1, 2, 0],
    [3, 1, -0.01],
    [2, 3, -0.01],
    [1, 99, -0.01],
  ];
  for (let i = 0; i < 120; i++) stats.update(1 / 120, stopped);
  assert.equal(stats.carContacts, 2, 'only player contacts count, once per opponent');
  pairs = [[1, 2, 0.01]];
  stats.update(carContactSeparation / 2, stopped);
  pairs = [[2, 1, 0]];
  stats.update(1 / 120, stopped);
  assert.equal(stats.carContacts, 2, 'short contact gaps do not count as another impact');
  pairs = [];
  stats.update(carContactSeparation, stopped);
  pairs = [[1, 2, 0]];
  stats.update(1 / 120, stopped);
  assert.equal(stats.carContacts, 3);
  stats.reset();
  assert.equal(stats.driftTime, 0);
  assert.equal(stats.conesHit, 0);
  assert.equal(stats.carContacts, 0);
  assert.equal(stats.timeInFirst, 0);
  stats.update(1 / 120, stopped);
  assert.equal(stats.carContacts, 1, 'reset clears contact history');
});

test('results distinguish live gaps, finish times, disqualification, and retirement', () => {
  const standing = { entrant: 0, lastLap: null, gap: 1.2, lapsBehind: 0 };
  assert.deepEqual(resultStanding(standing), { status: 'Racing', timing: '+1.2s' });
  assert.deepEqual(resultStanding({ ...standing, finished: true, finishTime: 20 }, 20), {
    status: 'Finished',
    timing: '0:20.000',
  });
  assert.deepEqual(resultStanding({ ...standing, finished: true, finishTime: 21.5 }, 20), {
    status: 'Finished',
    timing: '+1.500s',
  });
  assert.deepEqual(
    resultStanding({ ...standing, finished: true, disqualified: true, finishTime: 19 }, 20),
    {
      status: 'DSQ',
      timing: '0:19.000',
    },
  );
  assert.deepEqual(resultStanding({ ...standing, retired: true }), { status: 'DNF', timing: '—' });
});

function fixture(mode, { closed = false, reverse = false, laps = 1 } = {}) {
  const definition = closed
    ? { ...courses[0], reverse }
    : {
        id: 'straight',
        name: 'Straight',
        width: 10,
        doubleYellow: true,
        closed: false,
        reverse,
        points: [
          [0, 0],
          [1000, 0],
        ],
      };
  const route = courseRoute(definition);
  const gates = courseGateDistances(definition, route.getLength());
  function point(gate, along = 0, across = 2) {
    const t = gates[gate] / route.getLength();
    const forward = route.getTangentAt(t);
    const position = route.getPointAt(t).addScaledVector(forward, along);
    position.x += forward.z * across;
    position.z -= forward.x * across;
    return position;
  }
  const timer = new LapTimer(definition, { mode, laps });
  timer.reset(point(0, -1));
  const tires = (across = 2, halfTread = 0.12) =>
    Array.from({ length: 4 }, () =>
      [across, across - halfTread, across + halfTread].map((offset) => point(0, 1, offset)),
    ).flat();
  const cross = (gate = 0) => {
    timer.update(point(gate, -1), 1, [point(gate, -1)]);
    timer.update(point(gate, 1), 1, [point(gate, 1)]);
  };
  return { timer, definition, point, tires, cross };
}

test('mustard permits yellow contact but invalidates when any whole tire crosses the far stripe', () => {
  for (const reverse of [false, true]) {
    const { timer, point, tires, cross } = fixture('mustard', { reverse });
    const boundary = -courseLineWidth * 1.5;
    timer.update(point(0, 1), 1, tires(boundary - 0.12));
    assert.equal(timer.invalid, false, 'touching the outermost yellow edge is allowed');
    assert.equal(timer.mustardTouched, true);
    assert.equal(timer.mustardCrossed, false);
    assert.deepEqual(mustardResult(timer), { text: 'Tasted', status: 'tasted' });
    const samples = tires();
    samples.splice(0, 3, ...tires(boundary - 0.1201).slice(0, 3));
    timer.update(point(0, 1), 1, samples);
    assert.equal(timer.invalid, true, 'one tire completely over yellow invalidates');
    assert.equal(timer.trackLimits, true);
    assert.equal(timer.mustardCrossed, true);
    assert.deepEqual(mustardResult(timer), { text: 'Crossed', status: 'crossed' });
    timer.update(point(0, 1), 1, tires());
    assert.equal(timer.invalid, true, 'rejoining cannot restore validity');
    cross(1);
    assert.equal(timer.finished, true, 'even an invalid open attempt ends at the finish');
    assert.equal(timer.completed, 1);
    assert.equal(timer.last, null);
    assert.equal(timer.lastAttempt.trackLimits, true);
    assert.equal(timer.lastAttempt.mustard, false);
    assert.equal(timer.lastAttempt.valid, false);
    assert.equal(timer.lastAttempt.mustardTouched, true);
    assert.equal(timer.lastAttempt.mustardCrossed, true);
  }
});

test('mustard contact is sticky within a lap, resets, and remains independent of white limits', () => {
  const { timer, point, tires, definition } = fixture('mustard');
  timer.update(point(0, 1), 1, tires());
  assert.deepEqual(mustardResult(timer), { text: 'Avoided', status: 'avoided' });
  timer.update(point(0, 1), 1, tires(courseLineWidth));
  assert.equal(timer.invalid, false);
  timer.update(point(0, 1), 1, tires());
  assert.deepEqual(mustardResult(timer), { text: 'Tasted', status: 'tasted' });
  timer.reset(point(0, -1));
  assert.equal(timer.mustardTouched, false);
  assert.equal(timer.mustardCrossed, false);
  timer.update(point(0, 1), 1, tires(definition.width * 2));
  assert.equal(timer.mustard, false, 'white limits still invalidate Mustard mode');
  assert.deepEqual(mustardResult(timer), { text: 'Avoided', status: 'avoided' });
});

test('Mayo tracks tread contact on either white stripe without changing Track Limits', () => {
  for (const side of [-1, 1]) {
    const { timer, point, tires, definition, cross } = fixture('track-limits');
    timer.update(point(0, 1), 1, tires());
    assert.deepEqual(mayoResult(timer), { text: 'Avoided', status: 'avoided' });
    timer.update(point(0, 1), 1, tires((side * definition.width) / 2));
    assert.equal(timer.invalid, false);
    assert.deepEqual(mayoResult(timer), { text: 'Tasted', status: 'tasted' });
    timer.update(point(0, 1), 1, tires());
    assert.equal(timer.mayoTouched, true, 'touch survives rejoining');
    cross(1);
    assert.equal(timer.lastAttempt.mayoTouched, true);
    assert.equal(timer.lastAttempt.trackLimits, true);
    timer.reset(point(0, -1));
    assert.equal(timer.mayoTouched, false);
    timer.update(point(0, 1), 1, tires(side * definition.width * 2));
    assert.deepEqual(mayoResult(timer), { text: 'Exceeded', status: 'exceeded' });
    assert.equal(timer.mayoTouched, false, 'fully outside is not itself a stripe touch');
  }
});

test('all modes measure both rule sets, but Anything Goes never invalidates', () => {
  for (const mode of ['track-limits', 'mustard', 'anything-goes']) {
    const { timer, point, tires, cross, definition } = fixture(mode);
    const samples = tires();
    samples.forEach((sample) => sample.copy(point(0, 1, definition.width)));
    timer.update(point(0, 1), 1, samples);
    assert.equal(timer.invalid, mode !== 'anything-goes');
    cross(1);
    assert.equal(timer.finished, true);
    assert.equal(timer.lastAttempt.trackLimits, false);
    assert.equal(timer.lastAttempt.mustard, false);
    assert.equal(timer.lastAttempt.valid, mode === 'anything-goes');
  }
});

test('Track Limits permits partial excursions and clean finishes remain classified', () => {
  const { timer, point, tires, cross, definition } = fixture('track-limits', { closed: true });
  cross();
  const samples = tires();
  for (let i = 0; i < samples.length - 1; i++) samples[i].copy(point(0, 1, definition.width * 2));
  timer.update(point(0, 1), 1, samples);
  assert.equal(timer.invalid, false, 'a single tread sample inside keeps the lap eligible');
  cross();
  assert.equal(timer.finished, true);
  assert.equal(timer.lastAttempt.trackLimits, true);
  assert.equal(timer.lastAttempt.valid, true);
  const tracker = createRaceStandings(definition, [{ laps: timer, position: point(0, 1) }]);
  assert.equal(tracker.update(1)[0].disqualified, false);
});

test('closed races end after the selected attempts without crediting invalid laps', () => {
  for (const mode of ['track-limits', 'anything-goes']) {
    const { timer, point, cross, definition } = fixture(mode, { closed: true, laps: 2 });
    cross();
    assert.equal(timer.completed, 0, 'the initial start crossing is not a lap');
    timer.update(point(0, 2), 1, [point(0, 2, definition.width * 2)]);
    cross();
    assert.equal(timer.completed, 1);
    assert.equal(timer.lap, mode === 'track-limits' ? 1 : 2);
    assert.equal(timer.finished, false);
    assert.equal(timer.invalid, false, 'the next attempt starts fresh');
    cross();
    assert.equal(timer.completed, 2);
    assert.equal(timer.finished, true);
    assert.equal(timer.lastAttempt.valid, true);
    const elapsed = timer.elapsedTime;
    cross();
    assert.equal(timer.completed, 2);
    assert.equal(timer.elapsedTime, elapsed, 'finished timing is frozen');
  }
});

test('mustard cannot start on a course without a centerline', () => {
  assert.throws(
    () => new LapTimer({ ...courses[0], doubleYellow: false }, { mode: 'mustard', laps: 1 }),
    /centerline/,
  );
});

test('classification puts qualified finishers before disqualified cars and freezes finish order', () => {
  const bad = fixture('track-limits', { closed: true });
  const good = fixture('track-limits', { closed: true });
  const entrants = [bad, good].map(({ timer, point }) => ({ laps: timer, position: point(0, -1) }));
  const tracker = createRaceStandings(good.definition, entrants);
  bad.cross();
  good.cross();
  bad.timer.update(bad.point(0, 2), 1, [bad.point(0, 2, bad.definition.width * 2)]);
  bad.cross();
  good.cross();
  entrants.forEach((entrant, index) => entrant.position.copy([bad, good][index].point(0, 1)));
  const standings = tracker.update(1);
  assert.equal(standings[0].entrant, 1);
  assert.equal(standings[0].finished, true);
  assert.equal(standings[0].disqualified, false);
  assert.equal(standings[1].disqualified, true);
  entrants[0].position.copy(bad.point(0, 100));
  assert.equal(tracker.update(1)[0].entrant, 1);
});

test('retired entrants freeze their timing, rank DNF, and reset for another race', () => {
  const stopped = fixture('track-limits', { closed: true });
  const racing = fixture('track-limits', { closed: true });
  stopped.cross();
  racing.cross();
  const entrants = [stopped, racing].map(({ timer, point }) => ({
    laps: timer,
    position: point(0, 1),
  }));
  const tracker = createRaceStandings(racing.definition, entrants);
  stopped.timer.retired = true;
  const elapsed = stopped.timer.elapsedTime;
  stopped.cross();
  assert.equal(stopped.timer.elapsedTime, elapsed);
  assert.equal(stopped.timer.completed, 0);
  let standings = tracker.update(1);
  assert.equal(standings[0].entrant, 1);
  assert.equal(standings[1].retired, true);
  racing.cross();
  standings = tracker.update(1);
  assert.equal(standings[0].finished, true);
  assert.equal(standings[0].finishTime, racing.timer.lapStartedAt);
  assert.equal(standings[1].retired, true);
  stopped.timer.reset(stopped.point(0, -1));
  assert.equal(stopped.timer.retired, false);
});
