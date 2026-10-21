import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let generateCustomCourse;
let defaultCourseWeights;
let courseGenerationFields;
let readCourseWeights;
let writeCourseWeights;
let courseRoute;
let courses;
let terrainBaseHeight;

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  ({ generateCustomCourse, defaultCourseWeights, courseGenerationFields, readCourseWeights, writeCourseWeights }
    = await server.ssrLoadModule('/src/course-generation.ts'));
  ({ courseRoute, courses } = await server.ssrLoadModule('/src/courses.ts'));
  ({ terrainBaseHeight } = await server.ssrLoadModule('/src/terrain-profile.ts'));
});

after(async () => {
  await server?.close();
});

function weights(value) {
  return Object.fromEntries(courseGenerationFields.map(({ key }) => [key, value]));
}

function geometry(definition, spacing = 0.5) {
  const route = courseRoute(definition);
  const length = route.getLength();
  const samples = route.getSpacedPoints(Math.ceil(length / spacing)).slice(0, -1);
  const distance = length / samples.length;
  let minRadius = Infinity;
  let straight = 0;
  let tight = 0;
  let sweeping = 0;
  let minHeight = Infinity;
  let maxHeight = -Infinity;
  let maxGrade = 0;
  const bends = [];
  for (let i = 0; i < samples.length; i++) {
    const current = samples[i];
    const after = samples[(i + 1) % samples.length];
    const incoming = current.clone().sub(samples[(i + samples.length - 1) % samples.length]);
    const outgoing = after.clone().sub(current);
    const bend = Math.atan2(incoming.z * outgoing.x - incoming.x * outgoing.z, incoming.dot(outgoing));
    const radius = (incoming.length() + outgoing.length()) / (2 * Math.abs(bend));
    minRadius = Math.min(minRadius, radius);
    if (radius > 500) straight += distance;
    if (radius < 50) tight += distance;
    if (radius >= 70 && radius < 160) sweeping += distance;
    if (radius < 160) {
      const previous = bends.at(-1);
      if (previous?.sign === Math.sign(bend)) {
        previous.turn += Math.abs(bend);
        previous.minRadius = Math.min(previous.minRadius, radius);
      } else bends.push({ sign: Math.sign(bend), turn: Math.abs(bend), minRadius: radius });
    }
    const height = definition.flat ? 0 : terrainBaseHeight(current.x, current.z) * definition.elevationScale;
    const nextHeight = definition.flat ? 0 : terrainBaseHeight(after.x, after.z) * definition.elevationScale;
    minHeight = Math.min(minHeight, height);
    maxHeight = Math.max(maxHeight, height);
    maxGrade = Math.max(maxGrade, Math.abs(nextHeight - height) / outgoing.length());
  }
  return {
    route, length, minRadius, straight, tight, sweeping, maxGrade, relief: maxHeight - minHeight,
    hairpins: bends.filter((bend) => bend.turn > 150 * Math.PI / 180 && bend.minRadius < 40).length,
    transitions: bends.length,
  };
}

test('validates every weight and seed rather than clamping or silently defaulting', () => {
  for (const seed of [-1, 0x100000000, 1.5, NaN, Infinity, '123']) {
    assert.throws(() => generateCustomCourse(seed, defaultCourseWeights), /unsigned 32-bit integer/);
  }
  for (const { key } of courseGenerationFields) {
    for (const value of [-0.01, 1.01, NaN, Infinity, undefined, '0.5']) {
      assert.throws(() => generateCustomCourse(1, { ...defaultCourseWeights, [key]: value }), /between 0 and 1/);
    }
  }
});

test('serializes all six weights, preserves zero, and removes only generation preferences', () => {
  const original = { ...defaultCourseWeights, elevation: 0, tightCorners: 1, chicanes: 0.13 };
  const parameters = new URLSearchParams('course=custom&seed=123&camera=cabin');
  writeCourseWeights(parameters, original);
  assert.deepEqual(readCourseWeights(parameters), original);
  assert.deepEqual(readCourseWeights(new URLSearchParams()), defaultCourseWeights);
  for (const value of ['', ' ', 'not-a-number', '-0.1', '1.1', 'Infinity']) {
    assert.throws(() => readCourseWeights(new URLSearchParams({ elevation: value })));
  }
  writeCourseWeights(parameters);
  assert.equal(parameters.toString(), 'course=custom&seed=123&camera=cabin');
});

test('seed plus weights is deterministic without changing named layouts or input preferences', () => {
  const snapshot = structuredClone(courses);
  const preferences = Object.freeze({ ...defaultCourseWeights });
  const first = generateCustomCourse(1077036780, preferences);
  assert.deepEqual(generateCustomCourse(1077036780, preferences), first);
  assert.notDeepEqual(generateCustomCourse(2380708672, preferences).points, first.points);
  assert.deepEqual(courses, snapshot);
  assert.deepEqual(preferences, defaultCourseWeights);
});

test('each preference has a measurable effect on actual centerline geometry', () => {
  for (const seed of [0, 1, 1077036780]) {
    const zero = weights(0);
    const flat = generateCustomCourse(seed, zero);
    const baseline = geometry(flat);
    assert.equal(flat.flat, true);
    assert.equal(baseline.relief, 0);
    const elevated = generateCustomCourse(seed, { ...zero, elevation: 1 });
    assert.deepEqual(elevated.points, flat.points);
    assert.ok(geometry(elevated).relief > 8);
    const half = generateCustomCourse(seed, { ...zero, elevation: 0.5 });
    assert.ok(Math.abs(geometry(half).relief * 2 - geometry(elevated).relief) < 1e-8);
    assert.ok(geometry(generateCustomCourse(seed, { ...zero, straightaways: 1 })).straight > baseline.straight + 250);
    assert.ok(geometry(generateCustomCourse(seed, { ...zero, tightCorners: 1 })).tight > baseline.tight + 150);
    assert.ok(geometry(generateCustomCourse(seed, { ...zero, sweepingCorners: 1 })).sweeping > baseline.sweeping + 500);
    assert.equal(baseline.hairpins, 0);
    assert.equal(geometry(generateCustomCourse(seed, { ...zero, hairpins: 1 })).hairpins, 2);
    assert.ok(geometry(generateCustomCourse(seed, { ...zero, chicanes: 1 })).transitions >= baseline.transitions + 8);
  }
});

test('all 64 extreme combinations and fractional mixes retain navigable radii, clearance, and grades', () => {
  const mixes = Array.from({ length: 64 }, (_, mask) =>
    Object.fromEntries(courseGenerationFields.map(({ key }, i) => [key, (mask >> i) & 1])));
  for (let i = 0; i < 16; i++) {
    mixes.push(Object.fromEntries(courseGenerationFields.map(({ key }, j) => [key, ((i * 17 + j * 23) % 101) / 100])));
  }
  for (let i = 0; i < mixes.length; i++) {
    const seed = Math.imul(i, 2654435761) >>> 0;
    const definition = generateCustomCourse(seed, mixes[i]);
    const measured = geometry(definition, 0.25);
    assert.equal(definition.width, 17.5);
    assert.ok(measured.length > 500 && measured.length < 3500, `length ${measured.length} for mix ${i}`);
    assert.ok(measured.minRadius >= 22, `radius ${measured.minRadius} for mix ${i}`);
    assert.ok(measured.relief <= 20.001, `relief ${measured.relief} for mix ${i}`);
    assert.ok(measured.maxGrade <= 0.1201, `grade ${measured.maxGrade} for mix ${i}`);
    assert.ok(measured.route.getPoint(0).distanceTo(measured.route.getPoint(1)) < 1e-8);
    assert.ok(measured.route.getTangent(0).dot(measured.route.getTangent(1)) > 0.999999);
    const count = Math.ceil(measured.length / 1.5);
    const samples = measured.route.getSpacedPoints(count).slice(0, -1);
    for (let a = 0; a < count; a++) {
      for (let b = a + 1; b < count; b++) {
        if (Math.min(b - a, count - b + a) * measured.length / count > definition.width * 2) {
          assert.ok(samples[a].distanceTo(samples[b]) >= definition.width + 8, `clearance for mix ${i}`);
        }
      }
    }
  }
});
