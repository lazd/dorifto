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
let createLeaderboard;

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  ({ courses, courseRoute, courseStartDistance } = await server.ssrLoadModule('/src/courses.ts'));
  ({ LapTimer } = await server.ssrLoadModule('/src/laps.ts'));
  ({ createRaceStandings, standingsInterval, standingsGapInterval } =
    await server.ssrLoadModule('/src/race-standings.ts'));
  ({ formatStanding, createLeaderboard } = await server.ssrLoadModule('/src/leaderboard.ts'));
});

after(async () => server?.close());

test('leaderboard shows the roster before positions arrive and restores it on reset', (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const node = () => ({
    children: [],
    dataset: {},
    style: { setProperty() {} },
    setAttribute() {},
    append(...children) {
      this.children.push(...children);
    },
    replaceChildren(...children) {
      this.children = children;
    },
    insertBefore(child, before) {
      this.children = this.children.filter((entry) => entry !== child);
      const index = before ? this.children.indexOf(before) : this.children.length;
      this.children.splice(index, 0, child);
    },
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: node },
  });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'document', descriptor);
    else delete globalThis.document;
  });
  const container = node();
  const board = createLeaderboard(container);
  const entrants = [
    { name: 'You', color: 'red' },
    { name: 'Bot', color: 'cyan' },
  ];
  board.update([], entrants);
  assert.equal(container.hidden, false);
  assert.equal(container.dataset.ranked, 'false');
  assert.deepEqual(
    container.children.map((row) => row.children[1].textContent),
    ['You', 'Bot'],
  );
  board.update(
    [
      { entrant: 1, lastLap: null, gap: 0, lapsBehind: 0 },
      { entrant: 0, lastLap: null, gap: 1, lapsBehind: 0 },
    ],
    entrants,
  );
  assert.equal(container.dataset.ranked, 'true');
  assert.equal(container.children[0].children[1].textContent, 'Bot');
  board.update([], entrants);
  assert.equal(container.dataset.ranked, 'false');
  assert.equal(container.children[0].children[1].textContent, 'You');
  assert.ok(container.children.every((row) => row.children[2].textContent === '--'));
});

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
    assert.equal(race.tracker.position(0), 1);
    assert.equal(race.tracker.position(1), 2);
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
    assert.equal(race.tracker.position(1), 1);
    assert.equal(race.tracker.position(0), 2);
    assert.ok(standings[1].gap > 0);
  });
}

test('open-road standings follow progress instead of projecting onto a finish-to-start chord', async () => {
  const { roads, loadCourseDefinition } = await server.ssrLoadModule('/src/courses.ts');
  const road = await loadCourseDefinition(
    roads.find(({ id }) => id === 'hwy-129-tail-of-the-dragon-1185-711'),
  );
  const { raceGridSpawn } = await server.ssrLoadModule('/src/race-bot.ts');
  for (const reverse of [false, true]) {
    const definition = { ...road, reverse };
    const route = courseRoute(definition);
    const entrants = [0, 1].map((slot) => {
      const spawn = raceGridSpawn(definition, slot);
      const position = route.getPointAt(0);
      position.set(spawn.position[0], 0, spawn.position[1]);
      return { position, laps: { lap: 1, lapStartedAt: 0, last: null } };
    });
    const tracker = createRaceStandings(definition, entrants);
    for (let distance = 10; distance < route.getLength() - 10; distance += 10) {
      const leader = Math.floor(distance / 200) % 2;
      entrants[leader].position.copy(route.getPointAt(distance / route.getLength()));
      entrants[1 - leader].position.copy(route.getPointAt((distance - 5) / route.getLength()));
      const standings = tracker.update(0.5);
      assert.equal(
        standings[0].entrant,
        leader,
        `front car leads at ${distance} m, reverse=${reverse}`,
      );
      assert.equal(tracker.position(leader), 1, 'lead-time tracking uses the same leader');
      assert.equal(tracker.position(1 - leader), 2);
    }
  }
});

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
