import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

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

test('scenery refresh preserves all map data and respects the nearby-road selection', async () => {
  const course = await fixture();
  course.courseBuilder = { includeNearbyRoads: false };
  const original = structuredClone(course);
  const result = await reimportMap(course, {
    fetchScenery: async (map, definition) => {
      assert.strictEqual(map, course);
      assert.equal(definition, 'course');
      return scenery;
    },
    raster() {
      assert.fail('scenery-only refresh must not fetch terrain');
    },
  });
  assert.deepEqual(result, { ...course, scenery });
  assert.deepEqual(course, original);
  const withoutDraft = { ...course, courseBuilder: undefined };
  await reimportMap(withoutDraft, {
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
  let detailFetched = false;
  const result = await reimportMap(course, {
    full: true,
    raster: async (source, options) => {
      assert.equal(source.slug, course.id);
      assert.deepEqual(source.featured_lap.points, roadDraftPoints(restoreRoadDraft(course)));
      assert.equal(options.resolution, 5);
      return {
        ...course.terrain,
        heights: course.terrain.heights.map(() => 123),
        detail: undefined,
      };
    },
    detail: async () => {
      detailFetched = true;
      return undefined;
    },
    fetchScenery: async (map) => {
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
  assert.strictEqual(result.scenery, scenery);
});

test('failed imports reject instead of producing a replacement map', async () => {
  const course = await fixture();
  await assert.rejects(
    reimportMap(course, {
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

test('complete-map builds overlap the OpenStreetMap lookup with terrain downloads', async (t) => {
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
    return new Promise(() => {});
  });
  let network;
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
      raster: async (source) => {
        const { completeMapBounds } = await server.ssrLoadModule('/src/complete-map.ts');
        assert.match(requests.join(), /api\/interpreter/, 'Overpass overlaps terrain download');
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
        return scenery;
      },
    },
  );
  assert.ok(network?.elements instanceof Promise, 'scenery reuses the in-flight request');
  assert.equal(requests.length, 1);
  assert.deepEqual(result.courseBuilder.completeMapDimensions, draft.completeMapDimensions);
});
