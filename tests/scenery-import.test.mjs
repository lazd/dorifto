import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { PbfWriter } from 'pbf';

const extent = 4096;
const metersPerDegree = (6371008.8 * Math.PI) / 180;
let server;
let fetchCourseScenery;
let sceneryImportRevision;
let defaultCompleteMapDimensions;

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  ({ fetchCourseScenery } = await server.ssrLoadModule('/src/scenery-import.ts'));
  ({ sceneryImportRevision } = await server.ssrLoadModule('/src/scenery-data.ts'));
  ({ defaultCompleteMapDimensions } = await server.ssrLoadModule('/src/complete-map.ts'));
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
        { class: 'primary', brunnel: 'bridge', layer: 1 },
        tile,
      ),
      feature(
        'transportation',
        9,
        2,
        [
          [
            [210, 220],
            [245, 255],
          ],
        ],
        { class: 'secondary' },
        tile,
      ),
      feature(
        'transportation',
        10,
        2,
        [
          [
            [255, 215],
            [285, 245],
          ],
        ],
        { class: 'residential', oneway: '-1' },
        tile,
      ),
      feature(
        'transportation',
        11,
        2,
        [
          [
            [215, 260],
            [245, 290],
          ],
        ],
        { class: 'tertiary' },
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

function osmFixture() {
  const local = ([x, z]) => ({
    lat: 40 + z / metersPerDegree,
    lon: -120 - x / course().terrain.metersPerLongitude,
  });
  const way = (id, nodes, points, tags) => ({
    type: 'way',
    id,
    nodes,
    geometry: points.map(local),
    tags,
  });
  const elements = [
    way(
      100,
      [1, 2, 3],
      [
        [300, 0],
        [400, 0],
        [500, 0],
      ],
      { highway: 'primary', lanes: '4' },
    ),
    way(
      101,
      [4, 2, 5],
      [
        [400, -100],
        [400, 0],
        [400, 100],
      ],
      { highway: 'residential' },
    ),
    { type: 'node', id: 2, ...local([400, 0]), tags: { highway: 'stop', stop: 'all' } },
    way(
      102,
      [6, 7, 8],
      [
        [450, 80],
        [480, 80],
        [500, 80],
      ],
      { highway: 'service', service: 'parking_aisle' },
    ),
    { type: 'node', id: 7, ...local([480, 80]), tags: { highway: 'stop' } },
    way(
      103,
      [9, 10, 11, 12, 9],
      [
        [450, 60],
        [520, 60],
        [520, 110],
        [450, 110],
        [450, 60],
      ],
      { amenity: 'parking', parking: 'surface' },
    ),
  ];
  return { elements };
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
    if (url.includes('/api/interpreter')) return Response.json(osmFixture());
    active++;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active--;
    return new Response(tileFixture(tileFromUrl(url)));
  });

  const definition = course();
  const scenery = await fetchCourseScenery(definition, true);
  assert.equal(scenery.version, 1);
  assert.equal(scenery.importRevision, sceneryImportRevision);
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
  assert.ok(
    scenery.roads.some(
      (road) =>
        road.roadClass === 'primary' &&
        road.structure === 'bridge' &&
        road.layer === 1 &&
        road.centerline === 'double-yellow',
    ),
  );
  assert.ok(
    scenery.roads.some(
      (road) => road.roadClass === 'secondary' && road.centerline === 'double-yellow',
    ),
  );
  assert.ok(
    scenery.roads.some(
      (road) => road.roadClass === 'tertiary' && road.centerline === 'dashed-yellow',
    ),
  );
  assert.ok(
    scenery.roads.some(
      (road) =>
        road.roadClass === 'residential' && road.oneway === -1 && road.centerline === undefined,
    ),
  );
  assert.ok(maximumActive <= 4);
  const tileRequests = requests.filter((url) => url.endsWith('.pbf'));
  assert.ok(tileRequests.length > 0 && tileRequests.length <= 64);

  const withoutRoads = await fetchCourseScenery(definition, false);
  assert.equal(withoutRoads.roads.length, 0);
  assert.equal(requests.filter((url) => url.endsWith('.pbf')).length, tileRequests.length);
  const complete = await fetchCourseScenery(definition, 'complete-map');
  assert.equal(complete.bounds.maxX - complete.bounds.minX, defaultCompleteMapDimensions.width);
  assert.equal(complete.bounds.maxZ - complete.bounds.minZ, defaultCompleteMapDimensions.height);
  assert.equal(complete.roads.length, 3, 'precise OSM roads replace tile road fragments');
  assert.equal(complete.roads.find((r) => r.roadClass === 'primary').lanes, 4);
  assert.equal(complete.parking.length, 1);
  assert.equal(
    complete.stopSigns.length,
    4,
    'an explicitly mapped all-way stop controls all four approaches',
  );
  assert.ok(complete.stopSigns.every((s) => Math.hypot(...s.direction) > 0.999));
  const dimensions = {
    width: defaultCompleteMapDimensions.width * 2,
    height: defaultCompleteMapDimensions.height / 2,
  };
  const rectangle = await fetchCourseScenery(
    {
      ...definition,
      courseBuilder: { completeMapDimensions: dimensions },
    },
    'complete-map',
  );
  assert.equal(rectangle.bounds.maxX - rectangle.bounds.minX, dimensions.width);
  assert.equal(rectangle.bounds.maxZ - rectangle.bounds.minZ, dimensions.height);
});

test('complete maps surface OSM service failures instead of inventing traffic controls', async (t) => {
  const requests = [];
  t.mock.method(console, 'warn', () => {});
  t.mock.method(globalThis, 'fetch', async (input) => {
    if (String(input).includes('/api/interpreter')) {
      requests.push(String(input));
      return new Response('Unavailable', { status: 503 });
    }
    return new Response(tileFixture(tileFromUrl(String(input))));
  });
  await assert.rejects(
    fetchCourseScenery(course(), 'complete-map'),
    /OpenStreetMap road network could not be downloaded after 2 attempts.*503/,
  );
  assert.equal(
    new Set(requests).size,
    2,
    'server failures switch providers, not endlessly retry one server',
  );
});

test('complete maps retry timed-out OSM lookups on another provider and identify the download stage', async (t) => {
  const requests = [],
    progress = [];
  t.mock.method(console, 'warn', () => {});
  t.mock.method(globalThis, 'fetch', async (input, options) => {
    const url = String(input);
    if (url.includes('/api/interpreter')) {
      assert.match(options.body.get('data'), /\[timeout:25\]/);
      requests.push(url);
      if (requests.length === 1) throw new DOMException('signal timed out', 'TimeoutError');
      return Response.json(osmFixture());
    }
    return new Response(tileFixture(tileFromUrl(url)));
  });
  const result = await fetchCourseScenery(course(), 'complete-map', {
    progress: (stage, detail) => progress.push([stage, detail]),
  });
  assert.equal(result.stopSigns.length, 4);
  assert.ok(
    progress.some(([stage, detail]) => stage === 'network' && detail?.endsWith('(2/2)')),
    'retries show the tile and attempt count',
  );
  assert.equal(new Set(requests).size, 2);
});

test('exhausted OSM timeouts identify the provider instead of returning a raw abort error', async (t) => {
  t.mock.method(console, 'warn', () => {});
  t.mock.method(globalThis, 'fetch', async (input) => {
    if (String(input).includes('/api/interpreter'))
      throw new DOMException('signal timed out', 'TimeoutError');
    return new Response(tileFixture(tileFromUrl(String(input))));
  });
  await assert.rejects(
    fetchCourseScenery(course(), 'complete-map'),
    /OpenStreetMap road network could not be downloaded after 2 attempts.*timed out after 60 seconds.*overpass.private.coffee/,
  );
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
