import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { convertTrack, fetchMissingElevation } from '../scripts/import-track.mjs';

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

test('conversion without a supplied profile remains flat until elevation is fetched', () => {
  const course = convertTrack({ ...sonoma, elevation: null });
  assert.deepEqual(course.elevation, [0]);
  assert.equal(courseProfileHeight(course.elevation, 0.37), 0);
  assert.throws(() => convertTrack({ ...sonoma, featured_lap: null }), /featured_lap/);
});

test('supplied elevation is preserved without fetching or reading a cache', async () => {
  const fetch = () => assert.fail('Supplied elevation must not trigger a request');
  assert.equal(await fetchMissingElevation(sonoma, { fetch }), sonoma);
  await assert.rejects(fetchMissingElevation({
    ...sonoma, elevation: { points: [{ dist_frac: 0, altitude_m: null }] },
  }, { fetch }), /supplied elevation profile is invalid/);
});

test('missing elevation is fetched in meters, cached, and converted with attribution', async (t) => {
  const cacheDir = await mkdtemp(path.join(tmpdir(), 'dorifto-elevation-'));
  t.after(() => rm(cacheDir, { recursive: true }));
  const data = { ...sonoma, elevation: null, featured_lap: { points: sonoma.featured_lap.points.slice(0, 8) } };
  const requests = [];
  const fetch = async (url) => {
    requests.push(url);
    return Response.json({ value: String(100 + requests.length) });
  };
  const enriched = await fetchMissingElevation(data, { cacheDir, fetch });
  assert.equal(data.elevation, null);
  assert.equal(enriched.elevation.source, 'USGS 3DEP');
  assert.equal(enriched.elevation.points.length, requests.length);
  assert.ok(requests.length >= 8);
  assert.deepEqual(enriched.elevation.points, requests.map((_, i) => ({
    dist_frac: i / requests.length, altitude_m: 101 + i,
  })));
  assert.ok(Math.abs(Number(requests[0].searchParams.get('y')) - data.featured_lap.points[0].lat) < 1e-10);
  assert.ok(Math.abs(Number(requests[0].searchParams.get('x')) - data.featured_lap.points[0].lon) < 1e-10);
  for (const url of requests) {
    assert.equal(url.origin, 'https://epqs.nationalmap.gov');
    assert.equal(url.searchParams.get('wkid'), '4326');
    assert.equal(url.searchParams.get('units'), 'Meters');
    assert.ok(Math.abs(Number(url.searchParams.get('y')) - data.location.lat) < 0.01);
    assert.ok(Math.abs(Number(url.searchParams.get('x')) - data.location.lon) < 0.01);
  }
  const course = convertTrack(enriched);
  assert.equal(course.elevationSource, 'USGS 3DEP');
  assert.equal(Math.min(...course.elevation), 0);
  assert.ok(Math.max(...course.elevation) > 0);
  assert.deepEqual(course.points, convertTrack(data).points);
  const offline = await fetchMissingElevation({ ...data, elevation: { points: [] } }, {
    cacheDir, fetch: () => assert.fail('Cached elevation must work offline'),
  });
  assert.deepEqual(offline.elevation, enriched.elevation);

  const previousCount = requests.length;
  await fetchMissingElevation({
    ...data,
    featured_lap: { points: data.featured_lap.points.map((point) => ({ ...point, lon: point.lon + 0.001 })) },
  }, { cacheDir, fetch });
  assert.ok(requests.length > previousCount, 'Changed coordinates must invalidate the cache');
});

test('USGS failures and no-data responses stop the import without caching a flat profile', async (t) => {
  const cacheDir = await mkdtemp(path.join(tmpdir(), 'dorifto-elevation-'));
  t.after(() => rm(cacheDir, { recursive: true }));
  const data = { ...sonoma, elevation: null, featured_lap: { points: sonoma.featured_lap.points.slice(0, 8) } };
  await assert.rejects(fetchMissingElevation(data, {
    cacheDir, fetch: async () => new Response('Unavailable', { status: 503 }),
  }), /HTTP 503/);
  for (const value of [null, '', '-1000000', 'not a number']) {
    await assert.rejects(fetchMissingElevation(data, {
      cacheDir, fetch: async () => Response.json({ value }),
    }), /no valid elevation/);
  }
  await assert.rejects(readFile(path.join(cacheDir, `${data.slug}.json`)), { code: 'ENOENT' });
});

test('imports track names and location without the blurb', () => {
  const course = convertTrack({
    ...sonoma,
    display_name: 'Track display name',
    venue_name: 'Venue name',
    config_name: 'Configuration name',
  });
  assert.equal(course.name, 'Track display name');
  assert.equal(course.venueName, 'Venue name');
  assert.equal(course.configName, 'Configuration name');
  assert.deepEqual(course.location, sonoma.location);
  assert.equal(Object.hasOwn(course, 'blurb'), false);

  const { display_name, venue_name, config_name, location, ...withoutMetadata } = sonoma;
  const serialized = JSON.parse(JSON.stringify(convertTrack(withoutMetadata)));
  assert.equal(serialized.name, sonoma.slug);
  for (const key of ['venueName', 'configName', 'location', 'blurb']) {
    assert.equal(Object.hasOwn(serialized, key), false);
  }
});

test('elevation profiles interpolate periodically along the route', () => {
  const profile = [0, 10, 20, 10];
  assert.equal(courseProfileHeight(profile, 0.125), 5);
  assert.equal(courseProfileHeight(profile, 0.875), 5);
  assert.equal(courseProfileHeight(profile, 1.25), 10);
});

test('imports bridge endpoint height mismatches without a grade discontinuity', () => {
  const course = convertTrack({
    ...sonoma,
    elevation: { points: [{ dist_frac: 0, altitude_m: 0 }, { dist_frac: 1, altitude_m: 4 }] },
  }, { elevationSmoothing: 0 });
  const heights = course.elevation;
  const spacing = courseRoute(course).getLength() / heights.length;
  const at = (i) => heights[(i + heights.length) % heights.length];
  for (let i = 0; i < heights.length; i++) {
    if (Math.min(i, heights.length - i) * spacing > 110) continue;
    const grade = (at(i + 1) - at(i)) / spacing;
    const previousGrade = (at(i) - at(i - 1)) / spacing;
    assert.ok(Math.abs(grade) < 0.04, `grade at ${i}: ${grade}`);
    assert.ok(Math.abs(grade - previousGrade) / spacing < 0.0016, `grade change at ${i}`);
  }
  // The correction is local, not a drift adjustment that changes the whole lap.
  const a = Math.floor(heights.length / 4);
  const b = Math.floor(heights.length / 2);
  assert.ok(Math.abs((heights[b] - heights[a]) - 4 * (b - a) / heights.length) < 0.02);
  const flat = convertTrack({
    ...sonoma,
    elevation: { points: [{ dist_frac: 0, altitude_m: 100 }, { dist_frac: 1, altitude_m: 100 }] },
  });
  assert.ok(flat.elevation.every((height) => height === 0));
});

test('all imported track profiles have gradual elevation changes across the lap seam', () => {
  for (const course of courses.filter(({ elevation }) => elevation?.length > 100)) {
    const heights = course.elevation;
    const spacing = courseRoute(course).getLength() / heights.length;
    for (let i = 0; i < heights.length; i++) {
      if (Math.min(i, heights.length - i) * spacing > 75) continue;
      const before = heights[(i - 1 + heights.length) % heights.length];
      const after = heights[(i + 1) % heights.length];
      const curvature = Math.abs(after - 2 * heights[i] + before) / spacing ** 2;
      assert.ok(curvature < 0.0016, `${course.id} at ${i}: vertical curvature ${curvature}`);
    }
  }
});

test('generated terrain has no start/finish banking bump across the road width', async (t) => {
  const previousDocument = globalThis.document;
  // Texture drawing is irrelevant to the real heightfield generation under test.
  const context = {
    createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
    getImageData: (_x, _y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
    putImageData() {}, beginPath() {}, ellipse() {}, fill() {}, moveTo() {}, lineTo() {}, stroke() {},
  };
  globalThis.document = { createElement: () => ({ getContext: () => context }) };
  t.after(() => {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  });
  const { CourseTerrain } = await server.ssrLoadModule('/src/terrain.ts');
  for (const id of ['thunderhill-5-mile', 'thunderhill-east', 'sonoma-raceway']) {
    const definition = courses.find((course) => course.id === id);
    const route = courseRoute(definition);
    const length = route.getLength();
    const terrain = new CourseTerrain(definition);
    try {
      for (const offset of [-6, -3, 0, 3, 6]) {
        const heights = [];
        for (let distance = -75; distance <= 75; distance++) {
          const fraction = ((distance / length) % 1 + 1) % 1;
          const point = route.getPointAt(fraction);
          const tangent = route.getTangentAt(fraction);
          heights.push(terrain.heightAt(point.x + tangent.z * offset, point.z - tangent.x * offset));
        }
        for (let i = 1; i < heights.length; i++) {
          const grade = heights[i] - heights[i - 1];
          assert.ok(Math.abs(grade) < 0.015, `${id}, offset ${offset}, sample ${i}: grade ${grade}`);
          if (i > 1) {
            const gradeChange = heights[i] - 2 * heights[i - 1] + heights[i - 2];
            assert.ok(Math.abs(gradeChange) < 0.004,
              `${id}, offset ${offset}, sample ${i}: grade change ${gradeChange}`);
          }
        }
      }
    } finally {
      terrain.mesh.traverse((object) => {
        object.geometry?.dispose();
        object.material?.map?.dispose();
        object.material?.normalMap?.dispose();
        object.material?.dispose();
      });
    }
  }
});

test('generated track files are listed as courses with imported metadata', async () => {
  for (const id of ['sonoma-raceway', 'thunderhill-east']) {
    const course = courses.find((candidate) => candidate.id === id);
    const source = JSON.parse(await readFile(new URL(`../src/trackImports/${id}.json`, import.meta.url), 'utf8'));
    assert.ok(course, id);
    assert.equal(course.name, source.display_name);
    assert.equal(course.venueName, source.venue_name);
    assert.equal(course.configName, source.config_name);
    assert.deepEqual(course.location, source.location);
    assert.equal(Object.hasOwn(course, 'blurb'), false);
    assert.ok(course.points.length > 100 && course.elevation.length > 0);
  }
});

test('Thunderhill 5-Mile has a fetched USGS elevation profile', () => {
  const course = courses.find(({ id }) => id === 'thunderhill-5-mile');
  assert.equal(course.elevationSource, 'USGS 3DEP');
  assert.ok(course.elevation.length > 100);
  assert.equal(Math.min(...course.elevation), 0);
  assert.ok(Math.max(...course.elevation) > 20);
});
