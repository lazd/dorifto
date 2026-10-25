import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import {
  fetchElevationProfile,
  fetchMissingElevation,
  selectTrackSegment,
} from '../scripts/import-track.mjs';
import {
  combineRoadSections,
  fetchRoadCoordinates,
  importRoad,
  parseArguments,
  roadSections,
} from '../scripts/import-road.mjs';

test('combining sections joins nearest endpoints on either end and reverses without mutating sources', () => {
  const point = (i) => ({ lat: 38 + i / 1000, lon: -120 });
  const section = (indices, length) => ({ points: indices.map(point), length });
  const sections = [section([3, 5], 200), section([2, 0], 100), section([8, 6], 100)];
  const snapshot = structuredClone(sections);
  const combined = combineRoadSections(sections);
  assert.deepEqual(combined.points, [0, 2, 3, 5, 6, 8].map(point));
  assert.equal(combined.connectors.length, 2);
  assert.ok(combined.connectors.every(({ length }) => length > 110 && length < 112));
  assert.deepEqual(sections, snapshot);
  const touching = combineRoadSections([section([0, 2], 200), section([2, 3], 100)]);
  assert.deepEqual(touching.points, [0, 2, 3].map(point));
  assert.equal(touching.connectors.length, 0);
});

test('relation imports allow no location and fetch member ways without geocoding', async (t) => {
  const log = t.mock.method(console, 'log', () => {});
  const outDir = await mkdtemp(path.join(tmpdir(), 'road-relation-'));
  t.after(() => rm(outDir, { recursive: true, force: true }));
  const options = parseArguments(['route', 'relation(1234)']);
  assert.equal(options.locationQuery, undefined);
  assert.equal(parseArguments(['route', 'relation(1234)', 'Place']).locationQuery, 'Place');
  for (const name of ['Road', 'relation()', 'relation(abc)', 'prefix relation(1234)'])
    assert.throws(() => parseArguments(['route', name]), /Usage:/);
  await assert.rejects(importRoad({ slug: 'route', name: 'Road' }), /location query is required/);
  const geometry = [
    { lat: 38, lon: -120 },
    { lat: 38.001, lon: -120 },
  ];
  await importRoad({
    ...options,
    outDir,
    cacheDir: outDir,
    fetchImpl: async (url) => {
      assert.equal(url.hostname, 'overpass-api.de');
      assert.equal(
        url.searchParams.get('data'),
        '[out:json][timeout:25];\nrelation(1234);\nway(r);\nout geom;',
      );
      return Response.json({ elements: [{ id: 1, type: 'way', geometry }] });
    },
  });
  const source = JSON.parse(await readFile(path.join(outDir, 'route.json'), 'utf8'));
  assert.equal(source.venue_name, 'relation(1234)');
  assert.deepEqual(source.featured_lap.points, geometry);
  const preview = await readFile(path.join(outDir, 'route.html'), 'utf8');
  assert.ok(preview.includes('relation(1234)'));
  assert.ok(!log.mock.calls.some(({ arguments: args }) => args.join(' ').includes('undefined')));
});

test('road sections join reversed ways but split at gaps and branching junctions', () => {
  const points = Array.from({ length: 7 }, (_, i) => ({ lat: 38 + i / 1000, lon: -120 }));
  const way = (id, indices) => ({ id, geometry: indices.map((i) => points[i]) });
  const sections = roadSections([way(1, [1, 2]), way(2, [1, 0]), way(3, [4, 5])]);
  assert.equal(sections.length, 2);
  assert.deepEqual(sections[0].points, points.slice(0, 3));
  assert.equal(sections[0].ways.length, 2);
  const branched = roadSections([way(1, [0, 1]), way(2, [1, 2]), way(3, [1, 3])]);
  assert.equal(branched.length, 3);
  assert.equal(
    branched.reduce((sum, section) => sum + section.ways.length, 0),
    3,
  );
  const loop = roadSections([way(1, [0, 1]), way(2, [1, 2]), way(3, [2, 0])]);
  assert.equal(loop.length, 1);
  assert.deepEqual(loop[0].points.at(-1), loop[0].points[0]);
});

test('multiple road sections show details and allow a different selection from cached data', async (t) => {
  const log = t.mock.method(console, 'log', () => {});
  const cacheDir = await mkdtemp(path.join(tmpdir(), 'road-sections-'));
  t.after(() => rm(cacheDir, { recursive: true, force: true }));
  const elements = [
    {
      id: 12,
      tags: { name: 'Road', highway: 'secondary', lanes: '2' },
      geometry: [
        { lat: 38, lon: -120 },
        { lat: 38.002, lon: -120 },
      ],
    },
    {
      id: 34,
      geometry: [
        { lat: 39, lon: -120 },
        { lat: 39.001, lon: -120 },
      ],
    },
  ];
  const first = await fetchRoadCoordinates(
    'sections',
    'Road',
    'Place',
    async () => Response.json({ elements }),
    cacheDir,
    async (sections) => {
      assert.equal(sections.length, 2);
      assert.ok(sections[0].length > sections[1].length);
      return 1;
    },
  );
  assert.deepEqual(first, elements[1].geometry);
  const second = await fetchRoadCoordinates(
    'sections',
    'Road',
    'Place',
    () => assert.fail('Road sections must be cached before choosing'),
    cacheDir,
    async () => 0,
  );
  assert.deepEqual(second, elements[0].geometry);
  const output = log.mock.calls.map(({ arguments: args }) => args.join(' ')).join('\n');
  for (const text of [
    'coordinates',
    'OSM ways',
    'Start:',
    'End:',
    'lanes: 2',
    'https://www.openstreetmap.org/way/12',
    'Selected section 2',
  ])
    assert.ok(output.includes(text), text);
  await assert.rejects(
    fetchRoadCoordinates(
      'sections',
      'Road',
      'Place',
      () => assert.fail('Expected cache hit'),
      cacheDir,
      async () => -1,
    ),
    /Invalid road section/,
  );
  const argumentsForSelection = [
    '--input-type=module',
    '-e',
    `
    import { fetchRoadCoordinates } from ${JSON.stringify(new URL('../scripts/import-road.mjs', import.meta.url).href)};
    const points = await fetchRoadCoordinates('sections', 'Road', 'Place',
      () => { throw new Error('Expected cache hit'); }, ${JSON.stringify(cacheDir)});
    console.log('Chosen coordinates:', JSON.stringify(points));
  `,
  ];
  const interactive = spawnSync(process.execPath, argumentsForSelection, {
    input: 'invalid\n2\n',
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.equal(interactive.status, 0, interactive.stderr);
  assert.match(interactive.stdout, /Enter a number from 1 to 2/);
  assert.ok(
    interactive.stdout.includes(`Chosen coordinates: ${JSON.stringify(elements[1].geometry)}`),
  );
  const combined = spawnSync(process.execPath, argumentsForSelection, {
    input: 'c\n',
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.equal(combined.status, 0, combined.stderr);
  assert.match(combined.stdout, /Combined 2 sections/);
  assert.match(combined.stdout, /Adding straight connector:/);
  assert.ok(
    combined.stdout.includes(
      `Chosen coordinates: ${JSON.stringify([...elements[0].geometry, ...elements[1].geometry])}`,
    ),
  );
});

test('road preview needs no elevation; track import fetches only the selected section', async (t) => {
  const log = t.mock.method(console, 'log', () => {});
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
  const bounds = log.mock.calls.map(({ arguments: args }) => args.join(' ')).join('\n');
  assert.match(bounds, /Southwest: 38\.000000° N, 121\.000000° W/);
  assert.match(bounds, /Northeast: 39\.000000° N, 120\.000000° W/);
  const source = JSON.parse(await readFile(path.join(outDir, 'road.json'), 'utf8'));
  assert.equal(source.elevation, undefined);
  assert.deepEqual(source.featured_lap.points, coordinates);
  const preview = await readFile(path.join(outDir, 'road.html'), 'utf8');
  assert.ok(preview.includes('--start ${start} --finish ${finish}'));
  assert.match(preview, /id="segment-width"[^>]*value="8"/);
  assert.match(preview, /value="double-yellow" selected/);
  assert.ok(preview.includes('--no-double-yellow'));
  assert.match(preview, /id="segment-shoulder"[^>]*value="1.6"/);
  assert.match(preview, /id="segment-transition"[^>]*value="8"/);
  assert.ok(preview.includes('--shoulder-width'));
  assert.ok(preview.includes('--terrain-transition'));
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

test('Overpass retries capacity errors with a delay and status, caches success, and stops on other errors', async (t) => {
  const log = t.mock.method(console, 'log', () => {});
  const delays = [];
  t.mock.method(globalThis, 'setTimeout', (resolve, delay) => {
    delays.push(delay);
    queueMicrotask(resolve);
  });
  const cacheDir = await mkdtemp(path.join(tmpdir(), 'overpass-retry-'));
  t.after(() => rm(cacheDir, { recursive: true, force: true }));
  const geometry = [
    { lat: 38, lon: -120 },
    { lat: 38.001, lon: -120 },
  ];
  for (const status of [429, 502, 503, 504]) {
    let requests = 0;
    const query = `query-${status}`;
    const coordinates = await fetchRoadCoordinates(
      query,
      'Road',
      'Place',
      async () => {
        requests++;
        return requests === 1
          ? new Response('Over capacity', { status })
          : Response.json({ elements: [{ id: 1, geometry }] });
      },
      cacheDir,
    );
    assert.deepEqual(coordinates, geometry);
    assert.equal(requests, 2);
    assert.ok(
      log.mock.calls.some(({ arguments: args }) =>
        args[0].includes(`HTTP ${status}; retrying in 2 seconds`),
      ),
    );
    await fetchRoadCoordinates(
      query,
      'Road',
      'Place',
      () => assert.fail('Successful response must be cached'),
      cacheDir,
    );
  }
  let requests = 0;
  await assert.rejects(
    fetchRoadCoordinates(
      'exhausted',
      'Road',
      'Place',
      async () => {
        requests++;
        return new Response('Still overloaded', { status: 503 });
      },
      cacheDir,
    ),
    /HTTP 503: Still overloaded/,
  );
  assert.equal(requests, 4);
  assert.deepEqual(delays, Array(7).fill(2000));
  for (const status of [400, 403]) {
    await assert.rejects(
      fetchRoadCoordinates(
        `fatal-${status}`,
        'Road',
        'Place',
        async () => new Response('Invalid request', { status }),
        cacheDir,
      ),
      new RegExp(`HTTP ${status}`),
    );
  }
  assert.equal(delays.length, 7);
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
