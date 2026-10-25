import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import AmmoFactory from 'ammojs-typed';
import { writeArrayBuffer } from 'geotiff';
import { createServer } from 'vite';
import { fetchTerrainDetail, fetchTerrainRaster } from '../scripts/import-terrain.mjs';
import { geographicRasterSampler } from '../src/terrain-raster.mjs';
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

function geotiffResponse(url) {
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
}

test('terrain GeoTIFF cache reuses the request and never caches invalid responses', async () => {
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'dorifto-terrain-'));
  let requests = 0;
  const fetch = async (url) => {
    requests++;
    return geotiffResponse(url);
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
    const replaced = await fetchMissingElevation(supplied, { fetch });
    const data = await fetchMissingElevation({ ...source, terrain, elevation: null }, { fetch });
    assert.deepEqual(replaced.elevation, data.elevation);
    assert.notDeepEqual(replaced.elevation.points, supplied.elevation.points);
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
    const { CourseTerrain, defaultTerrainTransition, minTerrainTransition } =
      await server.ssrLoadModule('/src/terrain.ts');
    const narrow = new CourseTerrain({ ...course, shoulderWidth: 0 }, false);
    const wide = new CourseTerrain({ ...course, shoulderWidth: 8 }, false);
    const gradual = new CourseTerrain({ ...course, shoulderWidth: 0, terrainTransition: 1 }, false);
    const edgeDefinition = { ...course, shoulderWidth: 0, elevation: [0], bankingScale: 0 };
    const protectedEdge = new CourseTerrain(edgeDefinition, false);
    try {
      const { courseProfileHeight, courseRoute } = await server.ssrLoadModule('/src/courses.ts');
      const route = courseRoute(edgeDefinition);
      for (let step = 1; step < 400; step++) {
        const fraction = step / 400;
        const point = route.getPointAt(fraction);
        const tangent = route.getTangentAt(fraction).normalize();
        for (const across of [-1, -0.9, -0.5, 0.5, 0.9, 1]) {
          const offset = (across * course.width) / 2;
          const height = protectedEdge.heightAt(
            point.x + tangent.z * offset,
            point.z - tangent.x * offset,
          );
          // Chords between edge vertices on the outside of bends leave a sliver of pavement
          // in the first wall triangle; it may rise only slightly.
          assert.ok(Math.abs(height) < 0.025, 'hillside vertices must not lift pavement');
        }
      }
      const { createPhysicsResources, createPhysicsWorld } =
        await server.ssrLoadModule('/src/physics-world.ts');
      const Ammo = await AmmoFactory.call({});
      const data = narrow.physicsData();
      const physics = createPhysicsWorld(Ammo, createPhysicsResources(Ammo), data);
      const { cellTriangles, vertexPosition } = await server.ssrLoadModule('/src/terrain-query.ts');
      const from = new Ammo.btVector3();
      const to = new Ammo.btVector3();
      let flipped = 0;
      let warped = 0;
      for (let z = 0; z < narrow.rows - 1; z++) {
        for (let x = 0; x < narrow.columns - 1; x++) {
          const cell = z * (narrow.columns - 1) + x;
          const neighbor = data.flippedCells[cell - 1] || data.flippedCells[cell + 1];
          if (!data.flippedCells[cell] && !data.warpedCells[cell] && !neighbor) continue;
          flipped += data.flippedCells[cell];
          warped += data.warpedCells[cell];
          const corners = cellTriangles(data, x, z);
          for (let t = 0; t < corners.length; t += 3) {
            const [p, q, r] = corners.slice(t, t + 3).map((i) => vertexPosition(data, i));
            const area = (q.x - p.x) * (r.z - p.z) - (r.x - p.x) * (q.z - p.z);
            assert.ok(area < -0.01, 'snapped vertices must not fold or collapse triangles');
          }
          for (const [u, v] of [
            [0.7, 0.2],
            [0.2, 0.7],
            [0.6, 0.6],
            [0.3, 0.3],
          ]) {
            const px = narrow.minX + (x + u) * narrow.spacing;
            const pz = narrow.minZ + (z + v) * narrow.spacing;
            from.setValue(px, narrow.maxHeight + 5, pz);
            to.setValue(px, narrow.minHeight - 5, pz);
            const ray = new Ammo.ClosestRayResultCallback(from, to);
            physics.world.rayTest(from, to, ray);
            assert.ok(ray.hasHit());
            assert.ok(
              Math.abs(ray.get_m_hitPointWorld().y() - narrow.heightAt(px, pz)) < 0.02,
              'collision follows the rendered triangulation',
            );
            Ammo.destroy(ray);
          }
        }
      }
      assert.ok(flipped > 0, 'roadside cells follow wall contours');
      assert.ok(warped > 0, 'grid vertices snap onto road-parallel lines');
      assert.ok(data.filletCells.size > 0, 'roadside walls are subdivided into fillets');
      Ammo.destroy(from);
      Ammo.destroy(to);
      physics.dispose();
      let snapped = 0;
      for (let i = 0; i < narrow.heights.length; i++) {
        const { x: px, z: pz } = vertexPosition(data, i);
        const near = narrow.nearest(px, pz);
        // Snapped vertices rise from the pavement edge; others keep a cell-diagonal collar.
        const blendStart =
          course.width / 2 + (data.warpedVertices.has(i) ? 0 : narrow.spacing * Math.SQRT2);
        if (near.distance > blendStart + 8) continue;
        const road =
          courseProfileHeight(course.elevation, near.fraction, false) + near.bank * near.across;
        const rise = sample(px, pz) - road;
        const width = Math.min(
          defaultTerrainTransition,
          Math.max(Math.abs(rise), minTerrainTransition),
        );
        const t = Math.max(0, Math.min(1, (near.distance - blendStart) / width));
        const expected = road + rise * t * t * (3 - 2 * t);
        assert.ok(
          Math.abs(narrow.heights[i] - expected) < 1e-3,
          'roadside vertices follow the blend at their own position without grid smoothing',
        );
        if (!data.warpedVertices.has(i)) continue;
        const line = (near.distance - blendStart) / narrow.spacing;
        assert.ok(Math.abs(line - Math.round(line)) < 1e-3, 'snapped vertices lie on snap lines');
        snapped++;
      }
      assert.ok(snapped > 0);
      assert.ok(
        narrow.heights.some((height, i) => Math.abs(height - wide.heights[i]) > 0.1),
        'shoulder width changes the protected pavement area',
      );
      assert.ok(
        narrow.heights.some((height, i) => Math.abs(height - gradual.heights[i]) > 0.1),
        'terrain transition changes the roadside blend',
      );
    } finally {
      for (const terrain of [narrow, wide, gradual, protectedEdge]) {
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

test('terrain detail keeps only a corridor of high-resolution pixels along the road', async () => {
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'dorifto-terrain-'));
  try {
    const detail = await fetchTerrainDetail(source, {
      cacheDir,
      resolution: 2,
      width: 5,
      fetch: async (url) => geotiffResponse(url),
    });
    const stored = detail.runs.reduce((sum, run) => sum + run.length - 2, 0);
    assert.ok(stored > 0 && stored < (detail.columns * detail.rows) / 2);
    assert.ok(detail.runs.every(([, , ...heights]) => heights.every((height) => height === 120)));
    const northwest = detail.runs.find(([row]) => row === 0);
    assert.ok(!northwest || northwest[1] > 0, 'pixels far from the road are dropped');
  } finally {
    await rm(cacheDir, { recursive: true, force: true });
  }
});

test('raster sampler anti-aliases pixel stair-steps and keeps slopes continuous', () => {
  const bounds = { columns: 8, rows: 8, west: 0, east: 8, south: 0, north: 8 };
  const checkerboard = geographicRasterSampler({
    ...bounds,
    heights: Array.from({ length: 64 }, (_, i) => ((i % 8) + Math.floor(i / 8)) % 2),
  });
  assert.ok(Math.abs(checkerboard(4.5, 4.5) - 0.5) < 1e-6, 'pixel staircase is removed');
  const sample = geographicRasterSampler({
    ...bounds,
    heights: Array.from({ length: 64 }, (_, i) => (i % 8) ** 2),
  });
  const step = 1e-3;
  const before = (sample(4, 3.5) - sample(4, 3.5 - step)) / step;
  const after = (sample(4, 3.5 + step) - sample(4, 3.5)) / step;
  assert.ok(Math.abs(after - before) < 0.01, 'no slope crease at the cell boundary');
});

test('raster detail fades into coarse terrain with distance from the road', () => {
  const bounds = { columns: 8, rows: 8, west: 0, east: 8, south: 0, north: 8 };
  const sample = geographicRasterSampler({
    ...bounds,
    heights: Array(64).fill(0),
    detail: {
      ...bounds,
      resolution: 1,
      width: 20,
      runs: Array.from({ length: 8 }, (_, row) => [row, 0, ...Array(8).fill(10)]),
    },
  });
  assert.equal(sample(4, 4), 10);
  assert.ok(sample(4, 4, 17.5) > 0 && sample(4, 4, 17.5) < 10);
  assert.equal(sample(4, 4, 20), 0);
  assert.throws(
    () =>
      geographicRasterSampler({
        ...bounds,
        heights: Array(64).fill(0),
        detail: { ...bounds, width: 20, runs: [[0, 7, 1, 1]] },
      }),
    /Invalid terrain detail/,
  );
});
