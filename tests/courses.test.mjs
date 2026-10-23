import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let courses;
let courseRoute;
let courseSpawn;
let generateCourse;
let terrainBaseHeight;

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  ({ courses, racetracks, courseRoute, courseSpawn, generateCourse } =
    await server.ssrLoadModule('/src/courses.ts'));
  ({ terrainBaseHeight } = await server.ssrLoadModule('/src/terrain-profile.ts'));
});

after(async () => {
  await server?.close();
});

function checkGeometry(definition) {
  const route = courseRoute(definition);
  const length = route.getLength();
  assert.ok(length >= 975 && length <= 1075, `length ${length}`);
  assert.equal(definition.width, 17.5);
  const count = Math.ceil(length / 0.2);
  const samples = route.getSpacedPoints(count).slice(0, -1);
  const radii = [];
  let leftDistance = 0;
  let rightDistance = 0;
  let minHeight = Infinity;
  let maxHeight = -Infinity;
  let maxGrade = 0;
  for (let i = 0; i < count; i++) {
    const before = samples[(i + count - 1) % count];
    const current = samples[i];
    const after = samples[(i + 1) % count];
    const incoming = current.clone().sub(before);
    const outgoing = after.clone().sub(current);
    const bend = Math.atan2(
      incoming.z * outgoing.x - incoming.x * outgoing.z,
      incoming.dot(outgoing),
    );
    const radius = (incoming.length() + outgoing.length()) / (2 * Math.abs(bend));
    radii.push(radius);
    if (radius < 150) {
      if (bend > 0) leftDistance += length / count;
      else rightDistance += length / count;
    }
    const height = terrainBaseHeight(current.x, current.z);
    minHeight = Math.min(minHeight, height);
    maxHeight = Math.max(maxHeight, height);
    maxGrade = Math.max(
      maxGrade,
      Math.abs(terrainBaseHeight(after.x, after.z) - height) / outgoing.length(),
    );
  }
  radii.sort((a, b) => a - b);
  assert.ok(radii[0] >= 38, `minimum radius ${radii[0]}`);
  const medianRadius = radii[Math.floor(count / 2)];
  assert.ok(medianRadius >= 59.9 && medianRadius <= 110.1, `median radius ${medianRadius}`);
  assert.ok(leftDistance >= length * 0.099, `left cornering ${leftDistance}`);
  assert.ok(rightDistance >= length * 0.099, `right cornering ${rightDistance}`);
  assert.ok(
    maxHeight - minHeight >= 10 && maxHeight - minHeight <= 20,
    `relief ${maxHeight - minHeight}`,
  );
  assert.ok(maxGrade <= 0.1201, `grade ${maxGrade}`);
  const clearanceCount = Math.ceil(length);
  const clearanceSamples = route.getSpacedPoints(clearanceCount).slice(0, -1);
  for (let i = 0; i < clearanceCount; i++) {
    for (let j = i + 1; j < clearanceCount; j++) {
      const separation = (Math.min(j - i, clearanceCount - (j - i)) * length) / clearanceCount;
      if (separation > definition.width * 2) {
        assert.ok(
          clearanceSamples[i].distanceTo(clearanceSamples[j]) >= definition.width + 8,
          `road clearance near ${i}, ${j}`,
        );
      }
    }
  }
  assert.ok(route.getPoint(0).distanceTo(route.getPoint(1)) < 1e-8);
  assert.ok(route.getTangent(0).dot(route.getTangent(1)) > 0.999999);
  const spawn = courseSpawn(definition);
  assert.ok([...spawn.position, spawn.heading].every(Number.isFinite));
}

test('rejects invalid unsigned 32-bit seeds', () => {
  for (const seed of [-1, 0x100000000, 1.5, NaN, Infinity, '123', undefined]) {
    assert.throws(() => generateCourse(seed), /unsigned 32-bit integer/);
  }
});

test('random banking is deterministic and moderately above the legacy profile', () => {
  const scales = new Set();
  for (const seed of [0, 1, 42, 123, 456, 789]) {
    const definition = generateCourse(seed);
    assert.ok(definition.bankingScale >= 1.2 && definition.bankingScale <= 2);
    assert.equal(generateCourse(seed).bankingScale, definition.bankingScale);
    scales.add(definition.bankingScale);
  }
  assert.equal(scales.size, 6);
  assert.ok(
    courses
      .filter(({ id }) => id !== 'sweeper' && id !== 'hillside')
      .every((course) => course.bankingScale === undefined),
  );
});

test('meets radius, turn-balance, elevation, closure, and clearance limits across seeds', () => {
  const seeds = [0, 1, 0xffffffff, 1077036780, 2380708672];
  let state = 0x12345678;
  for (let i = 0; i < 27; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    seeds.push(state);
  }
  for (const seed of seeds) {
    try {
      checkGeometry(generateCourse(seed));
    } catch (error) {
      throw new Error(`Seed ${seed}: ${error.message}`, { cause: error });
    }
  }
});

test('finds a valid candidate for a broad reproducible seed sweep', () => {
  for (let i = 0; i < 256; i++) {
    const seed = Math.imul(i, 2654435761) >>> 0;
    assert.equal(generateCourse(seed).id, 'random', `seed ${seed}`);
  }
});
