import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { PbfWriter } from 'pbf';

const extent = 4096;
const metersPerDegree = (6371008.8 * Math.PI) / 180;
let server;
let fetchCourseScenery;

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  ({ fetchCourseScenery } = await server.ssrLoadModule('/src/scenery-import.ts'));
});

after(async () => {
  await server?.close();
});

function zigzag(value) {
  return (value << 1) ^ (value >> 31);
}

function encodeGeometry(paths, type, tile) {
  const count = 2 ** tile.z;
  const commands = [];
  let cursorX = 0;
  let cursorY = 0;
  for (const localPath of paths) {
    const points = localPath.map(([x, z]) => {
      const lon = -120 - x / (111_320 * Math.cos((40 * Math.PI) / 180));
      const lat = 40 + z / metersPerDegree;
      const tx = ((lon + 180) / 360) * count;
      const ty =
        (0.5 -
          Math.log((1 + Math.sin((lat * Math.PI) / 180)) / (1 - Math.sin((lat * Math.PI) / 180))) /
            (4 * Math.PI)) *
        count;
      return [Math.round((tx - tile.x) * extent), Math.round((ty - tile.y) * extent)];
    });
    const [first, ...rest] = points;
    commands.push((1 << 3) | 1, zigzag(first[0] - cursorX), zigzag(first[1] - cursorY));
    cursorX = first[0];
    cursorY = first[1];
    if (rest.length) {
      commands.push((rest.length << 3) | 2);
      for (const [x, y] of rest) {
        commands.push(zigzag(x - cursorX), zigzag(y - cursorY));
        cursorX = x;
        cursorY = y;
      }
    }
    if (type === 3) commands.push((1 << 3) | 7);
  }
  return commands;
}

function feature(layer, id, type, paths, properties, tile) {
  return { layer, id, type, paths, properties, tile };
}

function valueMessage(value, pbf) {
  if (typeof value === 'string') pbf.writeStringField(1, value);
  else if (typeof value === 'boolean') pbf.writeBooleanField(7, value);
  else pbf.writeDoubleField(3, value);
}

function layerMessage({ name, items }, pbf) {
  const keys = [...new Set(items.flatMap(({ properties }) => Object.keys(properties)))];
  const values = [
    ...new Map(
      items.flatMap(({ properties }) =>
        Object.values(properties).map((value) => [JSON.stringify(value), value]),
      ),
    ).values(),
  ];
  pbf.writeStringField(1, name);
  for (const item of items) {
    pbf.writeMessage(2, (feature, out) => featureMessage(feature, out, keys, values), item);
  }
  for (const key of keys) pbf.writeStringField(3, key);
  for (const value of values) pbf.writeMessage(4, valueMessage, value);
  pbf.writeVarintField(5, extent);
  pbf.writeVarintField(15, 2);
}

function featureMessage(item, pbf, layerKeys, layerValues) {
  const keys = Object.keys(item.properties);
  const values = Object.values(item.properties);
  pbf.writeVarintField(1, item.id);
  pbf.writePackedVarint(
    2,
    keys.flatMap((key, index) => [
      layerKeys.indexOf(key),
      layerValues.findIndex((value) => JSON.stringify(value) === JSON.stringify(values[index])),
    ]),
  );
  pbf.writeVarintField(3, item.type);
  pbf.writePackedVarint(4, encodeGeometry(item.paths, item.type, item.tile));
}

function tileFixture(tile) {
  const polygon = (x, z, width, height, clockwise = true) => {
    const ring = [
      [x, z],
      [x, z + height],
      [x + width, z + height],
      [x + width, z],
    ];
    return clockwise ? ring : ring.slice().reverse();
  };
  const features = {
    building: [
      feature(
        'building',
        1,
        3,
        [polygon(40, 40, 20, 20), polygon(46, 46, 6, 6, false)],
        { render_height: '12' },
        tile,
      ),
      feature('building', 2, 3, [polygon(0, 490, 16, 16)], { height: '8' }, tile),
      feature('building', 3, 3, [polygon(580, 390, 70, 20)], { 'building:levels': 3 }, tile),
    ],
    water: [feature('water', 4, 3, [polygon(90, 90, 12, 12)], {}, tile)],
    landcover: [
      feature('landcover', 5, 3, [polygon(120, 120, 15, 15)], { class: 'wood' }, tile),
      feature(
        'landcover',
        8,
        3,
        [polygon(150, 120, 15, 15)],
        { class: 'grass', subclass: 'scrub' },
        tile,
      ),
    ],
    waterway: [
      feature(
        'waterway',
        6,
        2,
        [
          [
            [140, 140],
            [180, 180],
          ],
        ],
        { class: 'stream' },
        tile,
      ),
    ],
    transportation: [
      feature(
        'transportation',
        7,
        2,
        [
          [
            [200, 200],
            [240, 240],
          ],
        ],
        { class: 'primary' },
        tile,
      ),
    ],
  };
  const writer = new PbfWriter();
  for (const [name, items] of Object.entries(features)) {
    writer.writeMessage(3, layerMessage, { name, items });
  }
  return writer.finish();
}

function course() {
  return {
    id: 'synthetic',
    name: 'Synthetic course',
    width: 10,
    closed: false,
    points: [
      [0, 0],
      [100, 100],
      [200, 200],
      [400, 400],
    ],
    terrain: {
      west: -120.03,
      east: -119.97,
      south: 39.97,
      north: 40.03,
      columns: 20,
      rows: 20,
      heights: Array(400).fill(0),
      originLat: 40,
      originLon: -120,
      metersPerLongitude: 111_320 * Math.cos((40 * Math.PI) / 180),
      elevationOffset: 0,
      resolution: 30,
      source: 'test',
    },
  };
}

function tileFromUrl(url) {
  const [, z, x, y] = new URL(url).pathname.match(/\/(\d+)\/(\d+)\/(\d+)\.pbf$/);
  return { z: Number(z), x: Number(x), y: Number(y) };
}

test('decodes supported scenery, holes, widths and clips to the terrain grid with cached bounded requests', async (t) => {
  const requests = [];
  let active = 0;
  let maximumActive = 0;
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = String(input);
    requests.push(url);
    if (url === 'https://tiles.openfreemap.org/planet')
      return Response.json({ tiles: ['https://tiles.example/{z}/{x}/{y}.pbf'] });
    active++;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active--;
    return new Response(tileFixture(tileFromUrl(url)));
  });

  const definition = course();
  const scenery = await fetchCourseScenery(definition, true);
  assert.equal(scenery.version, 1);
  assert.equal(scenery.importRevision, 3);
  assert.equal(scenery.buildings.length, 2);
  const building = scenery.buildings.find(({ rings }) => rings.length === 2);
  assert.equal(building.height, 12);
  assert.equal(
    scenery.buildings.some(({ rings }) => rings[0].some(([, z]) => z > 600)),
    false,
  );
  const clipped = scenery.buildings.find(({ rings }) => rings[0].some(([x]) => x >= 599));
  assert.ok(clipped);
  assert.ok(clipped.rings[0].every(([x]) => x <= 600.01));
  assert.equal(scenery.water.length, 1);
  assert.deepEqual(
    scenery.vegetation.map(({ kind }) => kind),
    ['trees', 'scrub'],
  );
  assert.equal(scenery.waterways.length, 1);
  assert.equal(scenery.waterways[0].width, 1.5);
  assert.ok(scenery.roads.length > 0);
  assert.ok(maximumActive <= 4);
  const tileRequests = requests.filter((url) => url.endsWith('.pbf'));
  assert.ok(tileRequests.length > 0 && tileRequests.length <= 64);

  const withoutRoads = await fetchCourseScenery(definition, false);
  assert.equal(withoutRoads.roads.length, 0);
  assert.equal(requests.filter((url) => url.endsWith('.pbf')).length, tileRequests.length);
});

test('rejects routes exceeding the vector tile budget before making network requests', async (t) => {
  t.mock.method(globalThis, 'fetch', () => {
    assert.fail('Over-budget routes must fail before network access.');
  });
  const definition = course();
  definition.points = [
    [0, 0],
    [40_000, 40_000],
    [80_000, 80_000],
  ];
  await assert.rejects(fetchCourseScenery(definition, false), /limit is 64/);
});
