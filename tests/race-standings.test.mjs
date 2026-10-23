import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let courses;
let courseRoute;
let courseStartDistance;
let LapTimer;
let createRaceStandings;
let standingsInterval;
let standingsGapInterval;
let formatStanding;

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  ({ courses, courseRoute, courseStartDistance } = await server.ssrLoadModule('/src/courses.ts'));
  ({ LapTimer } = await server.ssrLoadModule('/src/laps.ts'));
  ({ createRaceStandings, standingsInterval, standingsGapInterval } =
    await server.ssrLoadModule('/src/race-standings.ts'));
  ({ formatStanding } = await server.ssrLoadModule('/src/leaderboard.ts'));
});

after(async () => server?.close());

function fixture(reverse = false, starts = [-10, -20]) {
  const definition = { ...courses.find(({ id }) => id === 'hillside'), reverse };
  const route = courseRoute(definition);
  const length = route.getLength();
  const start = courseStartDistance(definition, length);
  const distances = [...starts];
  const pointAt = (distance) =>
    route.getPointAt(((((start + distance) % length) + length) % length) / length);
  const entrants = starts.map((distance) => {
    const position = pointAt(distance);
    const laps = new LapTimer(definition);
    laps.reset(position);
    return { position, laps };
  });
  const tracker = createRaceStandings(definition, entrants);
  let standings;
  let time = 0;
  function step(speeds, dt = 0.05) {
    time += dt;
    entrants.forEach((entrant, i) => {
      distances[i] += speeds[i] * dt;
      entrant.position.copy(pointAt(distances[i]));
      entrant.laps.update(entrant.position, dt, [entrant.position]);
    });
    const published = tracker.update(dt);
    if (published) standings = published;
    return published;
  }
  function drive(seconds, speeds) {
    for (let i = 0; i < Math.round(seconds / 0.05); i++) step(speeds);
    return standings;
  }
  return {
    entrants,
    distances,
    length,
    tracker,
    step,
    drive,
    get standings() {
      return standings;
    },
    get time() {
      return time;
    },
  };
}

for (const reverse of [false, true]) {
  test(`live projection, time gaps and overtakes${reverse ? ' on a reversed course' : ''}`, () => {
    const race = fixture(reverse);
    let standings = race.drive(5, [20, 20]);
    assert.deepEqual(
      standings.map(({ entrant }) => entrant),
      [0, 1],
    );
    assert.ok(Math.abs(standings[1].gap - 0.5) < 0.03, JSON.stringify(standings));
    assert.equal(standings[0].lastLap, null);
    // The interval grows while the trailing car stops, even though its position does not change.
    standings = race.drive(2, [20, 0]);
    assert.ok(Math.abs(standings[1].gap - 2.5) < standingsGapInterval + 0.03);
    standings = race.drive(5, [5, 30]);
    assert.equal(standings[0].entrant, 1, 'ordering changes without a finish-line crossing');
    assert.ok(standings[1].gap > 0);
  });
}

test('invalid laps lose a circuit at the finish, not when they leave the road', () => {
  const race = fixture();
  race.drive(2, [20, 20]);
  race.entrants[0].laps.invalid = true;
  assert.equal(race.drive(1, [20, 20])[0].entrant, 0);
  while (race.distances[0] < race.length + 3) race.step([20, 20]);
  const standings = race.drive(0.2, [20, 20]);
  assert.equal(race.entrants[0].laps.lap, 1);
  assert.equal(standings[0].entrant, 1);
  assert.ok(standings[1].gap > 1, 'gap accounts for the lost circuit');
  race.drive(1, [0, 40]);
  assert.equal(race.standings[1].lapsBehind, 1);
  assert.equal(formatStanding(race.standings[1], false), '+1 lap');
  assert.equal(race.standings[0].lastLap, race.entrants[1].laps.last);
});

test('reverse motion across the start does not create laps or wrap the driver into the lead', () => {
  const race = fixture();
  race.drive(2, [20, 20]);
  const lap = race.entrants[0].laps.lap;
  race.drive(4, [-20, 0]);
  assert.equal(race.standings[0].entrant, 1);
  assert.equal(race.entrants[0].laps.lap, lap);
  assert.equal(race.standings[1].lapsBehind, 0);
});

test('standings and interval recomputation are throttled and reset clears passage history', () => {
  const race = fixture();
  const dt = 1 / 120;
  let publications = 0;
  for (let i = 0; i < 120; i++) if (race.step([20, 20], dt)) publications++;
  assert.equal(publications, Math.ceil(1 / standingsInterval));
  race.drive(3, [20, 20]);
  const first = race.step([20, 0], standingsInterval);
  const second = race.step([20, 0], standingsInterval);
  assert.equal(second[1].gap, first[1].gap, 'gap is retained between interval recomputations');
  race.tracker.reset();
  const reset = race.step([0, 0], dt);
  assert.equal(reset[1].gap, null, 'old passage times do not survive a reset');
});

test('stopping the leader does not move its recorded passage timestamps', () => {
  const race = fixture(false, [-10, -11]);
  race.drive(5, [20, 20]);
  const before = race.standings[1].gap;
  const standings = race.drive(2, [0, 0]);
  assert.ok(Math.abs(standings[1].gap - before - 2) < standingsGapInterval + 0.03);
});

test('leaderboard formatting uses leader last lap, seconds, lap deficits and explicit unknowns', () => {
  const standing = { entrant: 0, lastLap: 210.9, gap: 1.24, lapsBehind: 0 };
  assert.equal(formatStanding(standing, true), '3:30');
  assert.equal(formatStanding(standing, false), '+1.2s');
  assert.equal(formatStanding({ ...standing, lastLap: null }, true), '--:--');
  assert.equal(formatStanding({ ...standing, gap: null }, false), '--');
  assert.equal(formatStanding({ ...standing, lapsBehind: 2 }, false), '+2 laps');
});
