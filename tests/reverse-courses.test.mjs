import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let courses;
let courseRoute;
let courseSpawn;
let courseStartDistance;
let courseTurns;
let startDistance;
let readCourseReverse;
let generateCourse;
let generateCustomCourse;
let defaultCourseWeights;
let LapTimer;

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  ({
    courses,
    courseRoute,
    courseSpawn,
    courseStartDistance,
    courseTurns,
    startDistance,
    readCourseReverse,
    generateCourse,
  } = await server.ssrLoadModule('/src/courses.ts'));
  ({ generateCustomCourse, defaultCourseWeights } = await server.ssrLoadModule(
    '/src/course-generation.ts',
  ));
  ({ LapTimer } = await server.ssrLoadModule('/src/laps.ts'));
});

after(async () => {
  await server?.close();
});

function definitions() {
  return [
    ...courses,
    generateCourse(839668520),
    generateCustomCourse(1077036780, { ...defaultCourseWeights, tightCorners: 1 }),
  ];
}

test('reads explicit reverse URL values and rejects invalid options', () => {
  for (const query of ['', 'reverse=0', 'reverse=false']) {
    assert.equal(readCourseReverse(new URLSearchParams(query)), false);
  }
  for (const query of ['reverse', 'reverse=1', 'reverse=true']) {
    assert.equal(readCourseReverse(new URLSearchParams(query)), true);
  }
  for (const value of ['2', '-1', 'yes', 'FALSE', ' ']) {
    assert.throws(
      () => readCourseReverse(new URLSearchParams({ reverse: value })),
      /Invalid reverse course option/,
    );
  }
});

test('all course types reverse the same spline without changing markers, length, or metadata', () => {
  const snapshot = structuredClone(courses);
  for (const definition of definitions()) {
    const forward = courseRoute(definition);
    const backwardDefinition = { ...definition, reverse: true };
    const backward = courseRoute(backwardDefinition);
    assert.equal(backwardDefinition.points, definition.points);
    assert.equal(backwardDefinition.id, definition.id);
    assert.equal(backwardDefinition.width, definition.width);
    assert.ok(Math.abs(forward.getLength() - backward.getLength()) < 1e-8);
    for (let i = 0; i <= 128; i++) {
      const t = i / 128;
      assert.ok(backward.getPoint(t).distanceTo(forward.getPoint(1 - t)) < 1e-8, definition.id);
      assert.ok(backward.getPointAt(t).distanceTo(forward.getPointAt(1 - t)) < 1e-7, definition.id);
      assert.ok(
        backward.getTangentAt(t).dot(forward.getTangentAt(1 - t)) < -0.999999,
        definition.id,
      );
    }
  }
  assert.deepEqual(courses, snapshot);
});

test('reverse spawn approaches the unchanged physical start line in the opposite direction', () => {
  for (const definition of definitions()) {
    const backwardDefinition = { ...definition, reverse: true };
    const forward = courseRoute(definition);
    const backward = courseRoute(backwardDefinition);
    const length = forward.getLength();
    const line = forward.getPointAt(courseStartDistance(definition, length) / length);
    const reverseLine = backward.getPointAt(
      courseStartDistance(backwardDefinition, backward.getLength()) / backward.getLength(),
    );
    assert.ok(line.distanceTo(reverseLine) < 1e-7);
    const spawn = courseSpawn(backwardDefinition);
    const expected = forward.getPointAt((startDistance + 30) / length);
    assert.ok(Math.hypot(spawn.position[0] - expected.x, spawn.position[1] - expected.z) < 1e-7);
    const tangent = forward.getTangentAt((startDistance + 30) / length);
    assert.ok(
      Math.sin(spawn.heading) * tangent.x + Math.cos(spawn.heading) * tangent.z < -0.999999,
    );
  }
});

test('turn directions invert at the same physical bends and reverse warnings are generated', () => {
  const definition = generateCustomCourse(1, { ...defaultCourseWeights, tightCorners: 1 });
  const forward = courseRoute(definition);
  const backward = courseRoute({ ...definition, reverse: true });
  const bendAt = (route, t) => {
    const before = route.getTangentAt((t - 0.001 + 1) % 1);
    const after = route.getTangentAt((t + 0.001) % 1);
    return Math.atan2(before.z * after.x - before.x * after.z, before.dot(after));
  };
  for (let i = 0; i < 128; i++) {
    const t = i / 128;
    assert.ok(Math.abs(bendAt(forward, t) + bendAt(backward, 1 - t)) < 1e-6);
  }
  const warnings = courseTurns(backward);
  assert.ok(warnings.length > 0);
  assert.ok(
    warnings.every(
      ({ distance, direction }) =>
        distance >= 0 && distance < backward.getLength() && Math.abs(direction) === 1,
    ),
  );
});

test('lap gates accept complete reversed laps and reject driving the wrong way', () => {
  for (const definition of definitions()) {
    for (const reverse of [false, true]) {
      const directed = { ...definition, reverse };
      const route = courseRoute(directed);
      const length = route.getLength();
      const origin = (((courseStartDistance(directed, length) - 30) % length) + length) % length;
      function drive(direction) {
        const timer = new LapTimer(directed);
        timer.reset(route.getPointAt(origin / length));
        const spacing = 0.75;
        for (let distance = spacing; distance < length + 60; distance += spacing) {
          const t = ((((origin + direction * distance) / length) % 1) + 1) % 1;
          timer.update(route.getPointAt(t), 1 / 60);
        }
        return timer;
      }
      const completed = drive(1);
      assert.equal(completed.lap, 2, `${definition.id}, reverse=${reverse}`);
      assert.ok(completed.last > 0);
      assert.equal(drive(-1).lap, 0, `wrong way: ${definition.id}, reverse=${reverse}`);
    }
  }
});
