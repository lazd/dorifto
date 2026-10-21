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

function weights(value, length = 2000) {
  return Object.fromEntries(courseGenerationFields.map(({ key }) => [key, key === 'length' ? length : value]));
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
    if (radius >= 95 && radius < 160) sweeping += distance;
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
  for (const { key, min, max } of courseGenerationFields) {
    for (const value of [min - 0.01, max + 0.01, NaN, Infinity, undefined, '0.5']) {
      assert.throws(() => generateCustomCourse(1, { ...defaultCourseWeights, [key]: value }), /must be a number between/);
    }
  }
});

test('serializes length and five weights, preserves zero, and removes obsolete hairpins', () => {
  const original = { ...defaultCourseWeights, length: 3100, elevation: 0, tightCorners: 1, chicanes: 0.13 };
  const parameters = new URLSearchParams('course=custom&seed=123&camera=cabin&reverse=1&hairpins=0.8');
  writeCourseWeights(parameters, original);
  assert.equal(parameters.has('hairpins'), false);
  assert.equal(courseGenerationFields.some(({ key }) => key === 'hairpins'), false);
  assert.deepEqual(readCourseWeights(parameters), original);
  assert.deepEqual(readCourseWeights(new URLSearchParams()), defaultCourseWeights);
  for (const value of ['', ' ', 'not-a-number', '-0.1', '1.1', 'Infinity']) {
    assert.throws(() => readCourseWeights(new URLSearchParams({ elevation: value })));
  }
  for (const value of ['', ' ', 'not-a-number', '999', '5001', 'Infinity']) {
    assert.throws(() => readCourseWeights(new URLSearchParams({ length: value })));
  }
  assert.equal(readCourseWeights(new URLSearchParams('hairpins=1')).tightCorners, defaultCourseWeights.tightCorners);
  writeCourseWeights(parameters);
  assert.equal(parameters.toString(), 'course=custom&seed=123&camera=cabin&reverse=1');
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
  const totals = { straight: 0, tight: 0, sweeping: 0, transitions: 0 };
  for (const seed of [0, 1, 123, 456, 789, 1077036780]) {
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
    totals.straight += geometry(generateCustomCourse(seed, { ...zero, straightaways: 1 })).straight - baseline.straight;
    totals.tight += geometry(generateCustomCourse(seed, { ...zero, tightCorners: 1 })).tight - baseline.tight;
    totals.sweeping += geometry(generateCustomCourse(seed, { ...zero, sweepingCorners: 1 })).sweeping - baseline.sweeping;
    totals.transitions += geometry(generateCustomCourse(seed, { ...zero, chicanes: 1 })).transitions - baseline.transitions;
    assert.equal(baseline.hairpins, 0);
  }
  assert.ok(totals.straight / 6 > 100, `straightaway increase ${totals.straight / 6}`);
  assert.ok(totals.tight / 6 > 150, `tight corner increase ${totals.tight / 6}`);
  assert.ok(totals.sweeping / 6 > 200, `sweeping corner increase ${totals.sweeping / 6}`);
  assert.ok(totals.transitions / 6 >= 4, `chicane transition increase ${totals.transitions / 6}`);
  assert.ok(geometry(generateCustomCourse(1, { ...weights(0, 5000), tightCorners: 1 })).hairpins >= 2);
});

test('all 32 feature extremes at short, medium, and long lengths retain safe geometry', () => {
  const fields = courseGenerationFields.filter(({ key }) => key !== 'length');
  const mixes = [1000, 3000, 5000].flatMap((length) =>
    Array.from({ length: 32 }, (_, mask) => ({
      length, ...Object.fromEntries(fields.map(({ key }, i) => [key, (mask >> i) & 1])),
    })));
  for (let i = 0; i < 16; i++) {
    mixes.push({
      length: 1000 + i * 250,
      ...Object.fromEntries(fields.map(({ key }, j) => [key, ((i * 17 + j * 23) % 101) / 100])),
    });
  }
  for (let i = 0; i < mixes.length; i++) {
    const seed = Math.imul(i, 2654435761) >>> 0;
    const definition = generateCustomCourse(seed, mixes[i]);
    const measured = geometry(definition, 0.25);
    assert.equal(definition.width, 17.5);
    assert.ok(Math.abs(measured.length / mixes[i].length - 1) <= 0.05,
      `length ${measured.length} vs ${mixes[i].length} for mix ${i}`);
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

test('custom layouts have varied concave outlines rather than two sides and semicircular ends', () => {
  const concavities = [];
  const signatures = new Set();
  const cross = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  const area = (points) => Math.abs(points.reduce((sum, p, i) => {
    const next = points[(i + 1) % points.length];
    return sum + p.x * next.z - next.x * p.z;
  }, 0)) / 2;
  for (let i = 0; i < 32; i++) {
    const route = courseRoute(generateCustomCourse(Math.imul(i, 2654435761) >>> 0, defaultCourseWeights));
    assert.ok(route.getTangentAt(0).dot(route.getTangentAt(5 / route.getLength())) > 0.9999,
      `start/finish should remain on a straight for seed ${i}`);
    const samples = route.getSpacedPoints(256).slice(0, -1);
    const sorted = [...samples].sort((a, b) => a.x - b.x || a.z - b.z);
    const hull = [];
    for (const sequence of [sorted, [...sorted].reverse()]) {
      const half = [];
      for (const point of sequence) {
        while (half.length > 1 && cross(half.at(-2), half.at(-1), point) <= 0) half.pop();
        half.push(point);
      }
      hull.push(...half.slice(0, -1));
    }
    const concavity = 1 - area(samples) / area(hull);
    assert.ok(concavity > 0.03, `oval-like outline for seed ${i}: concavity ${concavity}`);
    concavities.push(concavity);
    signatures.add([32, 64, 96, 128].map((j) => (samples[0].distanceTo(samples[j]) / route.getLength()).toFixed(2)).join(','));
  }
  assert.ok(Math.max(...concavities) - Math.min(...concavities) > 0.1, 'outlines should vary in depth and shape');
  assert.ok(signatures.size >= 28, `only ${signatures.size} distinct outline signatures`);
});

test('a broad seed sweep meets length targets without generation failures', () => {
  for (let i = 0; i < 128; i++) {
    const seed = Math.imul(i, 2246822519) >>> 0;
    const length = 1000 + (i % 41) * 100;
    const definition = generateCustomCourse(seed, { ...defaultCourseWeights, length });
    assert.ok(Math.abs(courseRoute(definition).getLength() / length - 1) <= 0.05, `seed ${seed}`);
  }
});
