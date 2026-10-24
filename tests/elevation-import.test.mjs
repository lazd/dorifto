import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  fetchElevationProfile,
  fetchMissingElevation,
  selectTrackSegment,
} from '../scripts/import-track.mjs';
import { importRoad } from '../scripts/import-road.mjs';

test('road preview needs no elevation; track import fetches only the selected section', async (t) => {
  t.mock.method(console, 'log', () => {});
  const outDir = await mkdtemp(path.join(tmpdir(), 'road-selection-'));
  t.after(() => rm(outDir, { recursive: true, force: true }));
  const coordinates = Array.from({ length: 8 }, (_, i) => ({ lat: 38 + i / 1000, lon: -120 }));
  await importRoad({
    slug: 'road',
    name: 'Road',
    locationQuery: 'Place',
    outDir,
    cacheDir: outDir,
    fetchImpl: async (url) => {
      if (url.hostname === 'nominatim.openstreetmap.org')
        return Response.json([{ boundingbox: ['38', '39', '-121', '-120'] }]);
      assert.equal(url.hostname, 'overpass-api.de', 'Road import must not request elevation');
      return Response.json({ elements: [{ id: 1, geometry: coordinates }] });
    },
  });
  const source = JSON.parse(await readFile(path.join(outDir, 'road.json'), 'utf8'));
  assert.equal(source.elevation, undefined);
  assert.deepEqual(source.featured_lap.points, coordinates);
  const preview = await readFile(path.join(outDir, 'road.html'), 'utf8');
  assert.ok(preview.includes('--start ${start} --finish ${finish}'));
  assert.match(preview, /id="segment-width"[^>]*value="8"/);
  assert.match(preview, /value="double-yellow" selected/);
  assert.ok(preview.includes('--no-double-yellow'));
  let requests = 0;
  const selected = await fetchMissingElevation(
    selectTrackSegment(source, { start: 2, finish: 4 }),
    {
      cacheDir: outDir,
      fetch: async (url) => {
        const latitude = Number(url.searchParams.get('y'));
        assert.ok(latitude >= coordinates[2].lat - 1e-10);
        assert.ok(latitude <= coordinates[4].lat + 1e-10);
        requests++;
        return Response.json({ value: '500' });
      },
    },
  );
  assert.ok(requests > 0);
  assert.equal(selected.elevation.points.length, requests);
  assert.equal(selected.elevation.points[0].dist_frac, 0);
  assert.equal(selected.elevation.points.at(-1).dist_frac, 1);
});

test('shared elevation fetcher preserves open-road fractions and reuses its cache', async () => {
  const cacheDir = await mkdtemp(path.join(tmpdir(), 'road-elevation-'));
  const coordinates = Array.from({ length: 8 }, (_, i) => ({ lat: 38 + i / 1000, lon: -120 }));
  const fractions = coordinates.map((_, i) => i / (coordinates.length - 1));
  let calls = 0;
  try {
    const profile = await fetchElevationProfile('road', coordinates, {
      cacheDir,
      fractions,
      fetch: async (url) => {
        calls++;
        assert.equal(Number(url.searchParams.get('y')), coordinates[calls - 1].lat);
        return { ok: true, json: async () => ({ value: '500' }) };
      },
    });
    assert.equal(calls, coordinates.length);
    assert.deepEqual(
      profile.points.map((point) => point.dist_frac),
      fractions,
    );
    const cached = await fetchElevationProfile('road', coordinates, {
      cacheDir,
      fractions,
      fetch: () => assert.fail('Cached elevation must not make requests'),
    });
    assert.deepEqual(cached, profile);
    await assert.rejects(
      fetchElevationProfile('missing', coordinates, {
        cacheDir,
        fractions,
        fetch: async () => ({ ok: true, json: async () => ({ value: '-1000000' }) }),
      }),
      /no valid elevation/,
    );
  } finally {
    await rm(cacheDir, { recursive: true, force: true });
  }
});
