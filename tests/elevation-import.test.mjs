import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fetchElevationProfile } from '../scripts/import-track.mjs';

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
