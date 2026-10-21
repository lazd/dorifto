import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { convertTrack } from '../scripts/import-track.mjs';

let server;
let courses;
let courseRoute;
let courseProfileHeight;
const sonoma = JSON.parse(await readFile(new URL('../src/trackImports/sonoma-raceway.json', import.meta.url), 'utf8'));

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  ({ courses, courseRoute, courseProfileHeight } = await server.ssrLoadModule('/src/courses.ts'));
});

after(async () => {
  await server?.close();
});

test('imports GPS laps at real scale, direction, and elevation range', () => {
  const course = convertTrack(sonoma);
  assert.equal(course.id, 'sonoma-raceway');
  assert.equal(course.name, 'Sonoma Raceway');
  const route = courseRoute(course);
  const length = route.getLength();
  assert.ok(Math.abs(length - sonoma.layout.length_m) / sonoma.layout.length_m < 0.04, `length ${length}`);
  const samples = route.getSpacedPoints(500).slice(0, -1);
  // Shoelace over (east, north) = (-x, z): negative area means clockwise.
  const area = samples.reduce((sum, a, i) => {
    const b = samples[(i + 1) % samples.length];
    return sum + (-a.x) * b.z - (-b.x) * a.z;
  }, 0);
  assert.equal(area < 0 ? 'clockwise' : 'counter-clockwise', sonoma.layout.direction);
  assert.equal(Math.min(...course.elevation), 0);
  assert.ok(Math.abs(Math.max(...course.elevation) - sonoma.elevation.range_m) < 3);
});

test('tracks without elevation import with a flat road profile', () => {
  const course = convertTrack({ ...sonoma, elevation: null });
  assert.deepEqual(course.elevation, [0]);
  assert.equal(courseProfileHeight(course.elevation, 0.37), 0);
  assert.throws(() => convertTrack({ ...sonoma, featured_lap: null }), /featured_lap/);
});

test('elevation profiles interpolate periodically along the route', () => {
  const profile = [0, 10, 20, 10];
  assert.equal(courseProfileHeight(profile, 0.125), 5);
  assert.equal(courseProfileHeight(profile, 0.875), 5);
  assert.equal(courseProfileHeight(profile, 1.25), 10);
});

test('generated track files are listed as courses', () => {
  for (const id of ['sonoma-raceway', 'thunderhill-east', 'thunderhill-5-mile']) {
    const course = courses.find((candidate) => candidate.id === id);
    assert.ok(course, id);
    assert.ok(course.points.length > 100 && course.elevation.length > 0);
  }
});
