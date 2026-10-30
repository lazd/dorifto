import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { writeArrayBuffer } from 'geotiff';

test('canopy tiles preserve percentages, stitch without gaps, reuse cache and reject invalid data', async () => {
  const server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  try {
    const { fetchTreeCanopy, canopyYear } = await server.ssrLoadModule('/src/canopy-import.ts');
    const { treeCanopyAt, validateCourseScenery } =
      await server.ssrLoadModule('/src/scenery-data.ts');
    const course = {
      terrain: {
        originLat: 38.75,
        originLon: -120.56,
        metersPerLongitude: 86_700,
      },
      scenery: {
        version: 1,
        bounds: { minX: -700, maxX: 700, minZ: -700, maxZ: 700 },
        buildings: [],
        water: [],
        waterways: [],
        vegetation: [],
        roads: [],
      },
    };
    const cached = new Map();
    const cache = {
      read: async (url) => cached.get(url),
      write: async (url, bytes) => cached.set(url, bytes),
    };
    let requests = 0;
    let percentage = 80;
    const fetch = async (url) => {
      requests++;
      assert.equal(JSON.parse(url.searchParams.get('mosaicRule')).where, `endyear = ${canopyYear}`);
      assert.equal(JSON.parse(url.searchParams.get('renderingRule')).rasterFunction, 'None');
      const [width, height] = url.searchParams.get('size').split(',').map(Number);
      const [west, south, east, north] = url.searchParams.get('bbox').split(',').map(Number);
      return new Response(
        writeArrayBuffer(new Uint8Array(width * height).fill(percentage), {
          width,
          height,
          ModelPixelScale: [(east - west) / width, (north - south) / height, 0],
          ModelTiepoint: [0, 0, 0, west, north, 0],
          GeographicTypeGeoKey: 4326,
        }),
      );
    };
    const progress = [];
    const canopy = await fetchTreeCanopy(course, {
      cache,
      fetch,
      onProgress: (done, total) => progress.push([done, total]),
    });
    assert.ok(canopy.cover.every((value) => value === percentage));
    assert.ok(requests > 1, 'exercise stitching across tile boundaries');
    assert.equal(progress.at(-1)[0], requests);
    assert.equal(progress.at(-1)[1], requests);
    const initialRequests = requests;
    assert.deepEqual(await fetchTreeCanopy(course, { cache, fetch }), canopy);
    assert.equal(requests, initialRequests);
    validateCourseScenery({ ...course.scenery, canopy });
    assert.equal(treeCanopyAt(canopy, canopy.minX, canopy.minZ), percentage);
    assert.equal(treeCanopyAt(canopy, canopy.maxX, canopy.maxZ), 255);
    canopy.cover[0] = 101;
    assert.throws(
      () => validateCourseScenery({ ...course.scenery, canopy }),
      /Invalid saved course scenery/,
    );
    for (const [value, error] of [
      [101, /invalid coverage/],
      [255, /not available/],
    ]) {
      percentage = value;
      cached.clear();
      await assert.rejects(fetchTreeCanopy(course, { cache, fetch }), error);
    }
  } finally {
    await server.close();
  }
});
