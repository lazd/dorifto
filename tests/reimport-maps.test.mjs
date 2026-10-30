import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { geographicDownloadConcurrency } from '../src/geographic-download.mjs';

let server, reimportMap, buildRoadCourse, roadDraftPoints, restoreRoadDraft;
before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  ({ reimportRoadCourse: reimportMap, buildRoadCourse } =
    await server.ssrLoadModule('/src/course-build.ts'));
  ({ restoreRoadDraft, roadDraftPoints } = await server.ssrLoadModule(
    '/src/course-builder-data.ts',
  ));
});
after(async () => server?.close());

const fixture = () =>
  readFile(new URL('./fixtures/road-course.json', import.meta.url), 'utf8').then(JSON.parse);
const scenery = {
  version: 1,
  importRevision: 3,
  buildings: [],
  water: [],
  waterways: [],
  vegetation: [],
  roads: [],
};
const canopy = {
  source: 'Test canopy',
  year: 2025,
  minX: -100,
  maxX: 100,
  minZ: -100,
  maxZ: 100,
  columns: 1,
  rows: 1,
  cover: [0],
};

test('scenery refresh preserves all map data and respects the nearby-road selection', async () => {
  const course = await fixture();
  course.courseBuilder = { includeNearbyRoads: false };
  const original = structuredClone(course);
  const result = await reimportMap(course, {
    canopy: async () => canopy,
    fetchScenery: async (map, definition) => {
      assert.strictEqual(map, course);
      assert.equal(definition, 'course');
      return scenery;
    },
    raster() {
      assert.fail('scenery-only refresh must not fetch terrain');
    },
  });
  assert.deepEqual(result, {
    ...course,
    attribution: [course.attribution, 'tree canopy: USDA Forest Service NLCD']
      .filter(Boolean)
      .join('; '),
    scenery: { ...scenery, canopy },
  });
  assert.deepEqual(course, original);
  const withoutDraft = { ...course, courseBuilder: undefined };
  await reimportMap(withoutDraft, {
    canopy: async () => canopy,
    fetchScenery: async (_, definition) => {
      assert.equal(definition, 'nearby-roads');
      return scenery;
    },
  });
});

test('full refresh rebuilds terrain and elevation without overwriting map identity or settings', async () => {
  const course = await fixture();
  course.courseBuilder = restoreRoadDraft(course);
  course.points = [
    [0, 0],
    [1, 1],
  ];
  course.coneSpacing = 37;
  course.venueName = 'Keep this venue';
  const original = structuredClone(course);
  const cache = { read: async () => undefined, write: async () => {} };
  let detailFetched = false;
  const result = await reimportMap(course, {
    canopy: async () => canopy,
    full: true,
    cache,
    raster: async (source, options) => {
      assert.strictEqual(options.cache, cache);
      assert.equal(source.slug, course.id);
      assert.deepEqual(source.featured_lap.points, roadDraftPoints(restoreRoadDraft(course)));
      assert.equal(options.resolution, 5);
      return {
        ...course.terrain,
        heights: course.terrain.heights.map(() => 123),
        detail: undefined,
      };
    },
    detail: async (_, options) => {
      assert.strictEqual(options.cache, cache);
      detailFetched = true;
      return undefined;
    },
    fetchScenery: async (map, _, options) => {
      assert.strictEqual(options.cache, cache);
      assert.notDeepEqual(map.elevation, course.elevation);
      return scenery;
    },
  });
  assert.equal(detailFetched, true);
  assert.equal(result.id, course.id);
  assert.equal(result.coneSpacing, course.coneSpacing);
  assert.equal(result.venueName, course.venueName);
  assert.equal(result.width, course.width);
  assert.deepEqual(
    result.courseBuilder.waypoints,
    course.courseBuilder.sections.map((section) => section.at(-1)),
  );
  assert.deepEqual(course, original);
  assert.deepEqual(result.scenery, { ...scenery, canopy });
});

test('failed imports reject instead of producing a replacement map', async () => {
  const course = await fixture();
  await assert.rejects(
    reimportMap(course, {
      canopy: async () => canopy,
      fetchScenery: async () => {
        throw new Error('Tile download failed');
      },
    }),
    /Tile download failed/,
  );
  await assert.rejects(reimportMap({ name: 'No terrain' }), /no geographic terrain/);
  await assert.rejects(reimportMap(course, { full: true }), /missing saved builder waypoints/);
});

test('CLI preflight rejects maps without builder data without changing their files', async () => {
  const file = fileURLToPath(new URL('./fixtures/road-course.json', import.meta.url));
  const before = await readFile(file, 'utf8');
  await assert.rejects(
    promisify(execFile)(process.execPath, [
      fileURLToPath(new URL('../scripts/reimport-maps.mjs', import.meta.url)),
      '--full',
      file,
    ]),
    (error) => {
      assert.match(error.stderr, /Full reimport requires saved builder waypoints/);
      return true;
    },
  );
  assert.equal(await readFile(file, 'utf8'), before);
});

test('CLI skips generated circuits in both modes without requiring builder data', async () => {
  const file = fileURLToPath(new URL('../src/tracks/sonoma-raceway.json', import.meta.url));
  const before = await readFile(file, 'utf8');
  for (const flags of [[], ['--full']]) {
    const { stdout } = await promisify(execFile)(process.execPath, [
      fileURLToPath(new URL('../scripts/reimport-maps.mjs', import.meta.url)),
      ...flags,
      file,
    ]);
    assert.match(stdout, /Skipping .*generated circuit/);
    assert.match(stdout, /Reimported 0 map/);
  }
  assert.equal(await readFile(file, 'utf8'), before);
});

test('full reimport and browser builds use identical saved draft input and output', async () => {
  const course = await fixture();
  const draft = { ...restoreRoadDraft(course), includeNearbyRoads: true, structureLines: [] };
  course.courseBuilder = draft;
  const options = {
    canopy: async () => canopy,
    raster: async () => ({ ...course.terrain, detail: undefined }),
    detail: async () => undefined,
    fetchScenery: async () => scenery,
  };
  const rebuilt = await reimportMap(course, { full: true, ...options });
  const browser = await buildRoadCourse(
    {
      points: roadDraftPoints(draft),
      draft,
      existingCourse: course,
      id: course.id,
      name: course.name,
      width: course.width,
      shoulderWidth: course.shoulderWidth ?? 1.6,
      terrainTransition: course.terrainTransition ?? 8,
      doubleYellow: course.doubleYellow ?? false,
      closed: !!draft.closingSection,
    },
    { ...options, rebuildTerrain: true, refreshScenery: true },
  );
  assert.deepEqual(rebuilt, browser);
});

test('complete-map builds overlap OSM and vector downloads with terrain downloads', async (t) => {
  const course = await fixture();
  const draft = {
    ...restoreRoadDraft(course),
    definition: 'complete-map',
    completeMapDimensions: { width: 5000, height: 1250 },
    structureLines: [],
  };
  course.courseBuilder = { ...draft, completeMapDimensions: undefined };
  const requests = [];
  t.mock.method(globalThis, 'fetch', (input) => {
    requests.push(String(input));
    if (String(input) === 'https://tiles.openfreemap.org/planet')
      return Promise.resolve(Response.json({ tiles: ['https://tiles.example/{z}/{x}/{y}.pbf'] }));
    return new Promise(() => {});
  });
  let network;
  let tileRequest;
  const progress = [];
  const result = await buildRoadCourse(
    {
      points: roadDraftPoints(draft),
      draft,
      existingCourse: course,
      name: course.name,
      width: course.width,
      shoulderWidth: 1.6,
      terrainTransition: 8,
      doubleYellow: false,
      closed: !!draft.closingSection,
    },
    {
      progress: (step, detail, state) => progress.push({ step, detail, state }),
      canopy: async (_, options) => {
        assert.ok(progress.some((event) => event.step === 'scenery' && event.state === 'complete'));
        options.onProgress(0, 1);
        options.onProgress(1, 1);
        return canopy;
      },
      raster: async (source) => {
        const { completeMapBounds } = await server.ssrLoadModule('/src/complete-map.ts');
        await new Promise(setImmediate);
        assert.match(requests.join(), /api\/interpreter/, 'Overpass overlaps terrain download');
        assert.ok(
          requests.some((url) => url.endsWith('.pbf')),
          'vector tiles start before terrain completes',
        );
        for (const step of ['terrain', 'network', 'scenery'])
          assert.ok(progress.some((event) => event.step === step && event.state === 'active'));
        const bounds = completeMapBounds(roadDraftPoints(draft), draft.completeMapDimensions);
        const corners = source.featured_lap.points;
        assert.ok(bounds.fits);
        assert.ok(
          Math.abs(
            (corners[1].lon - corners[0].lon) * bounds.metersPerLongitude -
              draft.completeMapDimensions.width,
          ) < 1e-6,
        );
        assert.ok(
          Math.abs(
            (corners[2].lat - corners[1].lat) * bounds.metersPerDegree -
              draft.completeMapDimensions.height,
          ) < 1e-6,
        );
        return { ...course.terrain, detail: undefined };
      },
      detail: async () => undefined,
      fetchScenery: async (_, definition, options) => {
        assert.equal(definition, 'complete-map');
        network = options.network;
        tileRequest = options.tileRequest;
        return scenery;
      },
    },
  );
  assert.ok(network?.elements instanceof Promise, 'scenery reuses the in-flight request');
  assert.ok(tileRequest instanceof Promise, 'scenery reuses its prefetched tiles');
  assert.equal(
    requests.filter((url) => url.includes('/api/interpreter')).length,
    geographicDownloadConcurrency.osm,
  );
  assert.deepEqual(result.courseBuilder.completeMapDimensions, draft.completeMapDimensions);
});
