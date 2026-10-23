import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let courses;
let courseRoute;
let courseSpawn;
let courseStartDistance;
let courseLineWidth;
let courseTurns;
let startDistance;
let readCourseReverse;
let generateCourse;
let generateCustomCourse;
let defaultCourseWeights;
let LapTimer;
let createTrainingGates;
let optimizeRacingLine;
let createTrainingGateGeometry;
let createTrainingGateMaterial;

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
    courseLineWidth,
    courseTurns,
    startDistance,
    readCourseReverse,
    generateCourse,
  } = await server.ssrLoadModule('/src/courses.ts'));
  ({ generateCustomCourse, defaultCourseWeights } = await server.ssrLoadModule(
    '/src/course-generation.ts',
  ));
  ({ LapTimer } = await server.ssrLoadModule('/src/laps.ts'));
  ({ createTrainingGates, optimizeRacingLine } = await server.ssrLoadModule('/src/racing-line.ts'));
  ({ createTrainingGateGeometry, createTrainingGateMaterial } =
    await server.ssrLoadModule('/src/training-gates.ts'));
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

test('start/finish counts complete reversed laps and rejects driving the wrong way', () => {
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
          const point = route.getPointAt(t);
          timer.update(point, 1 / 60, [point, point, point, point]);
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

test('all four tires outside the white lines invalidates until reset or the next start crossing', () => {
  for (const reverse of [false, true]) {
    const definition = { ...courses[0], reverse };
    const route = courseRoute(definition);
    const length = route.getLength();
    const t = courseStartDistance(definition, length) / length;
    const center = route.getPointAt(t);
    const forward = route.getTangentAt(t);
    const timer = new LapTimer(definition);
    function pointAt(distance, offset = 0) {
      const point = center.clone().addScaledVector(forward, distance);
      point.x += forward.z * offset;
      point.z -= forward.x * offset;
      return point;
    }
    function update(point, tires = [point, point, point, point]) {
      timer.update(point, 0.1, tires);
    }
    function cross() {
      update(pointAt(-1));
      update(pointAt(1));
    }
    function driveLap() {
      for (let distance = 2; distance < length + 2; distance += 0.75) {
        const point = route.getPointAt((((t + distance / length) % 1) + 1) % 1);
        update(point);
      }
    }
    timer.reset(pointAt(-1));
    cross();
    assert.equal(timer.lap, 1);
    driveLap();
    assert.equal(timer.lap, 2);
    const inside = pointAt(2, definition.width / 2 - 0.2);
    const outside = pointAt(2, definition.width / 2 + 0.2);
    update(pointAt(2), [outside, outside, outside, inside]);
    assert.equal(timer.invalid, false, 'one tire inside keeps the lap valid');
    update(pointAt(2), [outside, outside, outside, outside]);
    assert.equal(timer.invalid, true);
    update(pointAt(2));
    assert.equal(timer.invalid, true, 'rejoining does not recover an invalid lap');
    const last = timer.last;
    const best = timer.best;
    const startedAt = timer.lapStartedAt;
    timer.hitCone(7);
    cross();
    assert.equal(timer.invalid, false);
    assert.equal(timer.lap, 2, 'a discarded attempt does not count as a completed lap');
    assert.equal(timer.last, last);
    assert.equal(timer.best, best);
    assert.equal(timer.conesHit, 0);
    assert.ok(timer.lapStartedAt > startedAt);
    assert.ok(Math.abs(timer.current - 0.05) < 1e-9, 'restart uses the exact line crossing');
    driveLap();
    assert.equal(timer.lap, 3, 'the fresh attempt can complete without hitting training gates');
    update(pointAt(2), [outside, outside, outside, outside]);
    assert.equal(timer.invalid, true);
    timer.reset(pointAt(-1));
    assert.equal(timer.invalid, false);
  }
});

test('the white-line boundary is inclusive and asphalt shoulders are outside track limits', () => {
  const definition = {
    id: 'straight-boundary',
    name: 'Straight boundary',
    width: 8,
    points: [
      [0, 0],
      [50, 0],
      [100, 0],
      [150, 0],
      [150, 100],
      [100, 100],
      [50, 100],
      [0, 100],
      [-50, 100],
      [-50, 0],
    ],
  };
  const route = courseRoute(definition);
  const length = route.getLength();
  const start = courseStartDistance(definition, length);
  const before = route.getPointAt((start - 1) / length);
  const after = route.getPointAt((start + 1) / length);
  for (const side of [-1, 1]) {
    const timer = new LapTimer(definition);
    timer.reset(before);
    timer.update(after, 0.1, [after, after, after, after]);
    const tire = after.clone();
    for (const offset of [0, courseLineWidth / 4, courseLineWidth / 2]) {
      tire.z = side * (definition.width / 2 + offset);
      timer.update(after, 0.1, [tire, tire, tire, tire]);
      assert.equal(timer.invalid, false, 'the entire white line is within track limits');
    }
    const halfTreadWidth = 0.12;
    tire.z += side * halfTreadWidth;
    const innerEdge = tire.clone();
    innerEdge.z -= side * halfTreadWidth;
    const outerEdge = tire.clone();
    outerEdge.z += side * halfTreadWidth;
    const tirePoints = [tire, innerEdge, outerEdge];
    timer.update(after, 0.1, Array.from({ length: 4 }, () => tirePoints).flat());
    assert.equal(timer.invalid, false, 'a tread edge touching the stripe keeps the lap valid');
    for (const point of tirePoints) point.z += side * 0.0001;
    timer.update(after, 0.1, Array.from({ length: 4 }, () => tirePoints).flat());
    assert.equal(timer.invalid, true, 'all tread edges beyond the stripe invalidates the lap');
  }
});

test('training gates fit a bounded approximate racing line and scale with the car width', () => {
  const carWidth = 1.8;
  for (const definition of definitions()) {
    for (const reverse of [false, true]) {
      const directed = { ...definition, reverse };
      const { gates, halfWidth } = createTrainingGates(directed, carWidth);
      const route = courseRoute(directed);
      const length = route.getLength();
      assert.equal(halfWidth * 2, carWidth * 3);
      const samples = Math.max(64, Math.ceil(length / 5));
      assert.equal(gates.length, Math.round((Math.ceil(samples / 3) * 2) / 3));
      let shifted = false;
      gates.forEach(({ center, forward, distance }) => {
        const t = distance / length;
        const offset = center.distanceTo(route.getPointAt(t));
        assert.ok(offset <= Math.max(0, definition.width / 2 - halfWidth) + 1e-8);
        shifted ||= offset > 0.05;
        assert.ok(Math.abs(forward.length() - 1) < 1e-8);
        assert.ok(forward.dot(route.getTangentAt(t)) > 0);
      });

      assert.ok(shifted, `${definition.id}: targets are not just the centerline`);
    }
  }
});

test('geometric relaxation reduces bending instead of leaving zero offsets unchanged', () => {
  const route = courseRoute(courses[0]);
  const count = Math.max(64, Math.ceil(route.getLength() / 5));
  const centers = Array.from({ length: count }, (_, i) => route.getPointAt(i / count));
  const limit = courses[0].width / 2 - 1.5;
  const optimized = optimizeRacingLine(centers, limit);
  function bending(points) {
    return points.reduce(
      (sum, point, i) =>
        sum +
        point
          .clone()
          .multiplyScalar(-2)
          .add(points[(i + 1) % count])
          .add(points[(i + count - 1) % count])
          .lengthSq(),
      0,
    );
  }
  assert.ok(bending(optimized) < bending(centers) * 0.98, 'bending energy falls by at least 2%');
  assert.ok(optimized.some((point, i) => point.distanceTo(centers[i]) > 0.1));
  optimized.forEach((point, i) => assert.ok(point.distanceTo(centers[i]) <= limit + 1e-8));
  assert.deepEqual(
    optimizeRacingLine(centers, 0),
    centers,
    'zero lateral room preserves the route',
  );
  assert.deepEqual(optimizeRacingLine(centers, limit), optimized, 'solver is deterministic');
});

test('racing-line solver converges to a constrained stationary point on Hillside', () => {
  const definition = courses.find(({ id }) => id === 'hillside');
  const route = courseRoute(definition);
  const count = Math.max(64, Math.ceil(route.getLength() / 5));
  const centers = Array.from({ length: count }, (_, i) => route.getPointAt(i / count));
  const limit = definition.width / 2 - 1.8;
  const points = optimizeRacingLine(centers, limit);
  let maxResidual = 0;
  for (let i = 0; i < count; i++) {
    const tangent = centers[(i + 1) % count].clone().sub(centers[(i + count - 1) % count]);
    const normal = tangent.clone().set(tangent.z, 0, -tangent.x).normalize();
    const offset = points[i].clone().sub(centers[i]).dot(normal);
    const gradient = points[i]
      .clone()
      .multiplyScalar(6)
      .addScaledVector(points[(i + count - 1) % count], -4)
      .addScaledVector(points[(i + 1) % count], -4)
      .add(points[(i + count - 2) % count])
      .add(points[(i + 2) % count])
      .dot(normal);
    const projected = Math.max(-limit, Math.min(limit, offset - gradient / 16));
    maxResidual = Math.max(maxResidual, Math.abs(projected - offset));
  }
  assert.ok(maxResidual <= 0.00001 + 1e-10, `projected-gradient residual: ${maxResidual}`);
});

test('training arches are terrain-grounded semicircles with an unlit glow material', () => {
  const training = createTrainingGates(courses[0], 1.8);
  const heightAt = (x, z) => x * 0.02 + z * 0.03;
  const geometry = createTrainingGateGeometry(training, heightAt);
  const material = createTrainingGateMaterial();
  try {
    const positions = geometry.getAttribute('position');
    const verticesPerGate = positions.count / training.gates.length;
    const point = (index) => [positions.getX(index), positions.getY(index), positions.getZ(index)];
    training.gates.forEach((_, gate) => {
      const start = gate * verticesPerGate;
      const midpoint = (index) =>
        [0, 1, 2].map(
          (axis) =>
            Array.from({ length: 12 }, (_, side) => point(index + side)[axis]).reduce(
              (sum, value) => sum + value,
              0,
            ) / 12,
        );
      const left = midpoint(start);
      const right = midpoint(start + verticesPerGate - 13);
      const top = midpoint(start + (verticesPerGate - 13) / 2);
      assert.ok(
        Math.abs(Math.hypot(left[0] - right[0], left[2] - right[2]) - training.halfWidth * 2) <
          1e-4,
      );
      for (const [x, y, z] of [left, right]) assert.ok(Math.abs(y - heightAt(x, z) - 0.025) < 1e-4);
      assert.ok(Math.abs(top[1] - heightAt(top[0], top[2]) - 0.025 - training.halfWidth) < 1e-4);
      const depths = Array.from({ length: verticesPerGate }, (_, i) => {
        const [x, , z] = point(start + i);
        const forward = training.gates[gate].forward;
        return x * forward.x + z * forward.z;
      });
      assert.ok(
        Math.max(...depths) - Math.min(...depths) > 0.35,
        'tube has overhead-visible depth',
      );
    });
    assert.equal(material.lights, false);
    assert.equal(material.transparent, true);
    assert.equal(material.depthWrite, false);
    assert.equal(material.depthTest, true, 'arches are occluded by terrain and the car');
    assert.equal(material.toneMapped, false);
  } finally {
    geometry.dispose();
    material.dispose();
  }
});
