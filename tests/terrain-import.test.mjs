import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { writeArrayBuffer } from 'geotiff';
import { createServer } from 'vite';
import { fetchTerrainRaster } from '../scripts/import-terrain.mjs';
import {
  convertTrack,
  fetchMissingElevation,
  selectTrackSegment,
} from '../scripts/import-track.mjs';

const source = {
  slug: 'test-road',
  closed: false,
  featured_lap: {
    points: [
      { lat: 39, lon: -121 },
      { lat: 39.001, lon: -120.999 },
    ],
  },
  elevation: {
    points: [
      { dist_frac: 0, altitude_m: 100 },
      { dist_frac: 1, altitude_m: 120 },
    ],
  },
};

test('terrain GeoTIFF cache reuses the request and never caches invalid responses', async () => {
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'dorifto-terrain-'));
  let requests = 0;
  const fetch = async (url) => {
    requests++;
    const [width, height] = url.searchParams.get('size').split(',').map(Number);
    const [west, south, east, north] = url.searchParams.get('bbox').split(',').map(Number);
    return new Response(
      writeArrayBuffer(new Uint8Array(width * height).fill(120), {
        width,
        height,
        ModelPixelScale: [(east - west) / width, (north - south) / height, 0],
        ModelTiepoint: [0, 0, 0, west, north, 0],
        GeographicTypeGeoKey: 4326,
      }),
    );
  };
  try {
    const options = { cacheDir, fetch };
    const raster = await fetchTerrainRaster(source, options);
    assert.equal(raster.heights.length, raster.columns * raster.rows);
    assert.ok(raster.heights.every((height) => height === 120));
    assert.deepEqual(await fetchTerrainRaster(source, options), raster);
    assert.equal(requests, 1);
    await fetchTerrainRaster(source, { ...options, resolution: 10 });
    assert.equal(requests, 2);
    await assert.rejects(
      fetchTerrainRaster(source, {
        ...options,
        resolution: 15,
        fetch: async () => new Response('{"error":"unavailable"}'),
      }),
      /Invalid USGS terrain GeoTIFF/,
    );
    assert.equal((await readdir(cacheDir)).length, 2);
  } finally {
    await rm(cacheDir, { recursive: true, force: true });
  }
});

test('terrain sampling preserves geographic orientation, height datum, and reversed segment alignment', async () => {
  const server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  try {
    const { terrainRasterSampler } = await server.ssrLoadModule('/src/terrain-profile.ts');
    const terrain = {
      source: 'test',
      resolution: 5,
      west: -121.001,
      east: -120.998,
      south: 38.999,
      north: 39.002,
      columns: 2,
      rows: 2,
      heights: [140, 160, 100, 120],
    };
    const fetch = () => assert.fail('Raster-backed elevation must not make point requests');
    const supplied = { ...source, terrain };
    assert.equal(await fetchMissingElevation(supplied, { fetch }), supplied);
    const data = await fetchMissingElevation({ ...source, terrain, elevation: null }, { fetch });
    assert.equal(data.elevation.source, terrain.source);
    assert.equal(data.elevation.points[0].dist_frac, 0);
    assert.equal(data.elevation.points.at(-1).dist_frac, 1);
    assert.ok(data.elevation.points.at(-1).altitude_m > data.elevation.points[0].altitude_m);
    const course = convertTrack(data);
    const reversedData = await fetchMissingElevation(
      selectTrackSegment({ ...source, terrain, elevation: null }, { start: 1, finish: 0 }),
      { fetch },
    );
    const reversed = convertTrack(reversedData);
    const sample = terrainRasterSampler(course.terrain);
    const reverseSample = terrainRasterSampler(reversed.terrain);
    assert.ok(sample(0, 20) > sample(0, -20), 'north is uphill');
    assert.ok(sample(-20, 0) > sample(20, 0), 'east is negative game X');
    assert.ok(Math.abs(sample(0, 0) - (130 - course.terrain.elevationOffset)) < 1e-8);
    assert.ok(Math.abs(sample(10, 20) - reverseSample(10, 20)) < 1e-9);
    for (let i = 0; i < data.elevation.points.length; i++) {
      assert.ok(
        Math.abs(
          data.elevation.points[i].altitude_m - reversedData.elevation.points.at(-1 - i).altitude_m,
        ) < 1e-8,
      );
    }
    for (const point of data.elevation.points) {
      const first = source.featured_lap.points[0];
      const last = source.featured_lap.points.at(-1);
      const lat = first.lat + (last.lat - first.lat) * point.dist_frac;
      const lon = first.lon + (last.lon - first.lon) * point.dist_frac;
      const x = (course.terrain.originLon - lon) * course.terrain.metersPerLongitude;
      const z = ((lat - course.terrain.originLat) * 6371008.8 * Math.PI) / 180;
      assert.ok(Math.abs(sample(x, z) + course.terrain.elevationOffset - point.altitude_m) < 1e-8);
    }
    await assert.rejects(
      fetchMissingElevation(
        { ...data, elevation: null, terrain: { ...terrain, heights: [] } },
        { fetch },
      ),
      /Invalid terrain/,
    );
    const { CourseTerrain } = await server.ssrLoadModule('/src/terrain.ts');
    const narrow = new CourseTerrain({ ...course, shoulderWidth: 0 }, false);
    const wide = new CourseTerrain({ ...course, shoulderWidth: 8 }, false);
    const gradual = new CourseTerrain(
      { ...course, shoulderWidth: 0, terrainTransition: 12 },
      false,
    );
    try {
      const { courseProfileHeight } = await server.ssrLoadModule('/src/courses.ts');
      const raw = new Float32Array(narrow.heights.length);
      let samples = 0;
      for (let z = 0; z < narrow.rows; z++) {
        for (let x = 0; x < narrow.columns; x++) {
          const px = narrow.minX + x * narrow.spacing;
          const pz = narrow.minZ + z * narrow.spacing;
          const near = narrow.nearest(px, pz);
          const t = Math.max(0, Math.min(1, (near.distance - course.width / 2) / 3));
          const blend = t * t * (3 - 2 * t);
          const road =
            courseProfileHeight(course.elevation, near.fraction, false) + near.bank * near.across;
          const i = z * narrow.columns + x;
          raw[i] = road + (sample(px, pz) - road) * blend;
          if (near.distance <= course.width / 2)
            assert.equal(narrow.heights[i], raw[i], 'smoothing must not modify pavement vertices');
          if (near.distance < course.width / 2 + 6 || near.distance > course.width / 2 + 8)
            continue;
          assert.ok(Math.abs(narrow.heights[z * narrow.columns + x] - sample(px, pz)) < 1e-4);
          samples++;
        }
      }
      assert.ok(samples > 0, 'raster heights beyond the blend smoothing collar remain unchanged');
      let before = 0;
      let after = 0;
      for (let z = 1; z < narrow.rows - 1; z++) {
        for (let x = 1; x < narrow.columns - 1; x++) {
          const i = z * narrow.columns + x;
          for (const step of [1, narrow.columns]) {
            before += (raw[i - step] - 2 * raw[i] + raw[i + step]) ** 2;
            after +=
              (narrow.heights[i - step] - 2 * narrow.heights[i] + narrow.heights[i + step]) ** 2;
          }
        }
      }
      assert.ok(after < before, `roadside curvature energy must decrease: ${before} -> ${after}`);
      assert.ok(
        narrow.heights.some((height, i) => Math.abs(height - wide.heights[i]) > 0.1),
        'shoulder width changes the protected pavement area',
      );
      assert.ok(
        narrow.heights.some((height, i) => Math.abs(height - gradual.heights[i]) > 0.1),
        'terrain transition changes the roadside blend',
      );
    } finally {
      for (const terrain of [narrow, wide, gradual]) {
        for (const mesh of [terrain.mesh, terrain.grass]) {
          mesh.geometry.dispose();
          mesh.material.dispose();
        }
        terrain.grass.dispose();
      }
    }
    assert.throws(
      () => terrainRasterSampler({ ...course.terrain, heights: [] }),
      /Invalid terrain/,
    );
  } finally {
    await server.close();
  }
});
