import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import * as THREE from 'three';
import { createServer } from 'vite';

let server;
let courses;
let courseRoute;
let courseTurns;
let courseTurnSignPlacements;
let readTurnSignMode;
let courseCrestWarnings;

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  ({ courses, courseRoute, courseTurns } = await server.ssrLoadModule('/src/courses.ts'));
  ({ courseTurnSignPlacements, readTurnSignMode, courseCrestWarnings } =
    await server.ssrLoadModule('/src/turn-sign.ts'));
});

after(async () => {
  await server?.close();
});

function checkPlacements(route) {
  const length = route.getLength();
  const wrap = (value) => (value % length + length) % length;
  const turns = courseTurns(route);
  const placements = courseTurnSignPlacements(route);
  let offset = 0;
  for (const turn of turns) {
    const start = turn.distance - 6;
    const span = Math.max(0, wrap(turn.apexDistance - start) - 6);
    assert.ok(span > 0 && span < length / 2, `reasonable sign-run span: ${span}`);
    const count = Math.max(2, Math.ceil(span / 8)) + 1;
    const signs = placements.slice(offset, offset + count);
    assert.equal(signs.length, count);
    assert.ok(route.getPointAt(signs[0].distance / length)
      .distanceTo(route.getPointAt(wrap(start) / length)) < 1e-6);
    assert.ok(Math.abs(wrap(turn.apexDistance - signs.at(-1).distance) - 6) < 1e-6,
      'last sign stops 6 m before the apex');
    signs.forEach((sign, index) => {
      assert.equal(sign.direction, turn.direction);
      assert.ok(sign.distance >= 0 && sign.distance < length);
      if (index > 0) {
        const gap = wrap(sign.distance - signs[index - 1].distance);
        assert.ok(gap > 0 && gap <= 8 + 1e-6, `sign spacing: ${gap}`);
        if (span > 16) assert.ok(gap > 6, 'longer runs have wider spacing than before');
      }
    });
    offset += count;
  }
  assert.equal(offset, placements.length);
  return { turns, placements };
}

test('named courses get wider-spaced signs ending before each apex in both directions', () => {
  for (const definition of courses) {
    for (const reverse of [false, true]) {
      checkPlacements(courseRoute({ ...definition, reverse }));
    }
  }
});

test('long Sweeper bends get more than the old three entry signs', () => {
  const definition = courses.find(({ id }) => id === 'sweeper');
  for (const reverse of [false, true]) {
    const { turns, placements } = checkPlacements(courseRoute({ ...definition, reverse }));
    assert.ok(turns.length > 0);
    assert.ok(placements.length > turns.length * 3);
  }
});

test('sign modes preserve legacy links and reject invalid URL settings', () => {
  assert.equal(readTurnSignMode(null), 'several');
  assert.equal(readTurnSignMode('on'), 'several');
  for (const mode of ['off', 'few', 'several', 'many']) assert.equal(readTurnSignMode(mode), mode);
  assert.throws(() => readTurnSignMode('lots'), /Invalid signs option/);
});

test('off has no signs, few has three entry signs, and many reaches the turn exit', () => {
  for (const definition of courses) {
    for (const reverse of [false, true]) {
      const route = courseRoute({ ...definition, reverse });
      const length = route.getLength();
      const wrap = (value) => (value % length + length) % length;
      const turns = courseTurns(route);
      assert.deepEqual(courseTurnSignPlacements(route, 'off'), []);
      const few = courseTurnSignPlacements(route, 'few');
      assert.equal(few.length, turns.length * 3);
      turns.forEach((turn, index) => {
        [-6, 0, 6].forEach((offset, sign) => {
          assert.ok(Math.abs(few[index * 3 + sign].distance - wrap(turn.distance + offset)) < 1e-6);
          assert.equal(few[index * 3 + sign].direction, turn.direction);
        });
      });
      const many = courseTurnSignPlacements(route, 'many');
      let cursor = 0;
      for (const turn of turns) {
        const span = wrap(turn.exitDistance - (turn.distance - 6));
        const count = Math.max(2, Math.ceil(span / 8)) + 1;
        const signs = many.slice(cursor, cursor + count);
        assert.ok(Math.abs(signs.at(-1).distance - turn.exitDistance) < 1e-6,
          'many continues through the entire bend');
        signs.forEach((sign, index) => {
          assert.equal(sign.direction, turn.direction);
          if (index) assert.ok(wrap(sign.distance - signs[index - 1].distance) <= 8 + 1e-6);
        });
        cursor += count;
      }
      assert.equal(cursor, many.length);
      assert.ok(many.length >= courseTurnSignPlacements(route, 'several').length);
    }
  }
});

test('sign runs wrap across the start line without stopping or circling the track', () => {
  const definition = courses.find(({ id }) => id === 'sweeper');
  const original = courseRoute(definition);
  const length = original.getLength();
  const turn = courseTurns(original)[0];
  const shift = (turn.distance + 2) / length;
  class ShiftedRoute extends THREE.Curve {
    getPoint(t, target = new THREE.Vector3()) {
      return target.copy(original.getPointAt((t + shift) % 1));
    }
    getPointAt(t, target) { return this.getPoint(t, target); }
    getTangentAt(t) { return original.getTangentAt((t + shift) % 1); }
    getLength() { return length; }
  }
  const route = new ShiftedRoute();
  const { placements } = checkPlacements(route);
  assert.ok(placements.some((sign, index) => index > 0
    && placements[index - 1].distance > length - 15 && sign.distance < 15),
  'a turn sign run crosses the route seam');
});

test('blind crests warn of gentle bends in both directions and across the route seam', () => {
  const radius = 150;
  const length = 2 * Math.PI * radius;
  class GentleCircle extends THREE.Curve {
    constructor(reverse) { super(); this.reverse = reverse; }
    getPoint(t, target = new THREE.Vector3()) {
      const angle = (this.reverse ? -t : t) * 2 * Math.PI;
      return target.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    }
    getPointAt(t, target) { return this.getPoint(t, target); }
    getTangentAt(t) {
      const angle = (this.reverse ? -t : t) * 2 * Math.PI;
      return new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle))
        .multiplyScalar(this.reverse ? -1 : 1);
    }
    getLength() { return length; }
  }
  for (const crestDistance of [0, 180]) {
    const heightAt = (x, z) => {
      const distance = ((Math.atan2(z, x) * radius - crestDistance) % length + length) % length;
      const gap = Math.min(distance, length - distance);
      return 4 * Math.exp(-((gap / 18) ** 2));
    };
    const directions = [];
    for (const reverse of [false, true]) {
      const route = new GentleCircle(reverse);
      assert.deepEqual(courseTurns(route), [], 'gentle bend has no normal turn warning');
      const warnings = courseCrestWarnings(route, heightAt);
      assert.equal(warnings.length, 1);
      directions.push(warnings[0].direction);
      for (const mode of ['few', 'several', 'many']) {
        const signs = courseTurnSignPlacements(route, mode, heightAt);
        assert.equal(signs.length, 3, `${mode} includes blind-crest guidance`);
        signs.forEach((sign) => {
          const beforeCrest = (warnings[0].distance - sign.distance + length) % length;
          assert.ok(beforeCrest <= 12 + 1e-6, 'warnings sit before or at the crest');
          assert.equal(sign.direction, warnings[0].direction);
        });
      }
      assert.deepEqual(courseTurnSignPlacements(route, 'off', heightAt), []);
      assert.deepEqual(courseCrestWarnings(route, () => 0), [], 'flat roads add no warnings');
      assert.deepEqual(courseCrestWarnings(route, (x, z) => heightAt(x, z) * 0.01), [],
        'small elevation ripples are not blind crests');
    }
    assert.equal(directions[0], -directions[1], 'chevrons invert for reverse driving');
  }
});

test('straight blind crests do not invent a turn direction', () => {
  class StraightRoute extends THREE.Curve {
    getPointAt(t) { return new THREE.Vector3(t * 300, 0, 0); }
    getTangentAt() { return new THREE.Vector3(1, 0, 0); }
    getLength() { return 300; }
  }
  assert.deepEqual(courseCrestWarnings(new StraightRoute(),
    (x) => 4 * Math.exp(-(((x - 150) / 18) ** 2))), []);
});

test('Sonoma broad blind crests receive directional warnings in both directions', async () => {
  const { courseProfileHeight } = await server.ssrLoadModule('/src/courses.ts');
  const definition = courses.find(({ id }) => id === 'sonoma-raceway');
  const forward = courseRoute(definition);
  const samples = forward.getSpacedPoints(Math.ceil(forward.getLength()));
  const heightAt = (x, z) => {
    let closest = 0;
    let distance = Infinity;
    samples.forEach((point, index) => {
      const gap = (point.x - x) ** 2 + (point.z - z) ** 2;
      if (gap < distance) { distance = gap; closest = index; }
    });
    return courseProfileHeight(definition.elevation, closest / (samples.length - 1));
  };
  for (const reverse of [false, true]) {
    const route = courseRoute({ ...definition, reverse });
    const warnings = courseCrestWarnings(route, heightAt);
    assert.ok(warnings.length > 0, 'real broad crest is not missed by short-range checks');
    for (const mode of ['few', 'several', 'many']) {
      const signs = courseTurnSignPlacements(route, mode, heightAt);
      for (const warning of warnings) {
        const length = route.getLength();
        const nearest = Math.min(...signs.filter((sign) => sign.direction === warning.direction)
          .map((sign) => {
            const gap = Math.abs(sign.distance - warning.distance);
            return Math.min(gap, length - gap);
          }));
        assert.ok(nearest <= 5, 'enabled density has a chevron at or near the blind crest');
      }
    }
  }
});
