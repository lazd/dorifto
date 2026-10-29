import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { roadDistances } from '../src/track-conversion.mjs';
import { readFile } from 'node:fs/promises';

let server;
let selection;
let createLocationSearch;
let builderData;
before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  selection = await server.ssrLoadModule('/src/road-selection.ts');
  ({ createLocationSearch } = await server.ssrLoadModule('/src/course-builder-search.ts'));
  builderData = await server.ssrLoadModule('/src/course-builder-data.ts');
});

test('saved courses restore geographic routes and retain exact editable waypoints', async () => {
  const json = await readFile(new URL('./fixtures/road-course.json', import.meta.url), 'utf8');
  const course = builderData.readRoadMap(json);
  assert.deepEqual(course.elevation, JSON.parse(json).elevation);
  const draft = builderData.restoreRoadDraft(course);
  assert.equal(draft.closingSection, undefined);
  assert.ok(draft.sections.length > 2);
  const points = draft.sections.flatMap((part, i) => (i ? part.slice(1) : part));
  const terrain = course.terrain;
  for (let i = 0; i < points.length; i++) {
    assert.ok(
      Math.abs(
        (terrain.originLon - points[i].lon) * terrain.metersPerLongitude - course.points[i][0],
      ) < 1e-6,
    );
    assert.ok(
      Math.abs(
        ((points[i].lat - terrain.originLat) * 6371008.8 * Math.PI) / 180 - course.points[i][1],
      ) < 1e-6,
    );
  }
  const editable = { ...course, courseBuilder: draft };
  editable.courseBuilder.includeNearbyRoads = true;
  assert.equal(builderData.roadMapDefinition(editable.courseBuilder), 'nearby-roads');
  const completeMap = {
    ...editable,
    courseBuilder: { ...editable.courseBuilder, definition: 'complete-map' },
  };
  assert.equal(
    builderData.roadMapDefinition(
      builderData.readRoadMap(JSON.stringify(completeMap)).courseBuilder,
    ),
    'complete-map',
  );
  const restored = builderData.restoreRoadDraft(builderData.readRoadMap(JSON.stringify(editable)));
  assert.deepEqual(restored.sections, draft.sections);
  assert.equal(restored.closingSection, draft.closingSection);
  assert.equal(restored.resolution, draft.resolution);
  assert.equal(restored.includeNearbyRoads, true);
  restored.sections[0][0].lat += 1;
  assert.notDeepEqual(restored, draft);
  const closed = builderData.restoreRoadDraft({ ...course, closed: true });
  assert.deepEqual(closed.closingSection.at(-1), closed.sections[0][0]);
  assert.match(builderData.roadMapMeta(course), /km · Open route/);
  assert.ok(builderData.roadMapThumbnail(course).split(' ').length >= course.points.length);
  assert.throws(() => builderData.readRoadMap('{"name":"bad"}'), /Invalid saved course/);
  assert.throws(
    () => builderData.readRoadMap(JSON.stringify({ ...course, scenery: { version: 1 } })),
    /Invalid saved course scenery/,
  );
  assert.throws(
    () =>
      builderData.readRoadMap(
        JSON.stringify({ ...course, courseBuilder: { ...draft, definition: 'invalid' } }),
      ),
    /Invalid saved map definition/,
  );
  assert.throws(
    () => builderData.restoreRoadDraft({ ...course, terrain: undefined }),
    /geographic source/,
  );
});

test('builder exposes all three roadway definitions', async () => {
  const html = await readFile(new URL('../course-builder.html', import.meta.url), 'utf8');
  for (const [value, label] of [
    ['course', 'Just the course'],
    ['nearby-roads', 'Nearby roads'],
    ['complete-map', 'Complete map'],
  ])
    assert.match(html, new RegExp(`<option value="${value}"[^>]*>${label}</option>`));
});

test('reading saved scenery preserves its data without a local migration', async () => {
  const source = JSON.parse(
    await readFile(new URL('./fixtures/road-course.json', import.meta.url), 'utf8'),
  );
  source.scenery = {
    version: 1,
    importRevision: 2,
    buildings: [],
    water: [],
    waterways: [],
    vegetation: [],
    roads: [
      {
        points: [
          [30, -40],
          [30, -40],
          [30, 0],
        ],
        width: 6,
      },
      {
        points: [
          [70, 0],
          [30, 0],
        ],
        width: 6,
      },
    ],
  };
  const course = builderData.readRoadMap(JSON.stringify(source));
  assert.deepEqual(course.scenery, source.scenery);
});

test('builds finish without a 3D preview, which the worker generates on request', async () => {
  const course = builderData.readRoadMap(
    await readFile(new URL('./fixtures/road-course.json', import.meta.url), 'utf8'),
  );
  course.scenery = {
    version: 1,
    importRevision: (await server.ssrLoadModule('/src/scenery-data.ts')).sceneryImportRevision,
    buildings: [],
    water: [],
    waterways: [],
    vegetation: [],
    roads: [],
  };
  const messages = [];
  const previousSelf = globalThis.self;
  globalThis.self = { postMessage: (message) => messages.push(message) };
  try {
    await server.ssrLoadModule('/src/course-builder-worker.ts');
    const request = {
      points: builderData
        .restoreRoadDraft(course)
        .sections.flatMap((part, i) => (i ? part.slice(1) : part)),
      name: course.name,
      width: course.width,
      shoulderWidth: course.shoulderWidth ?? 1.6,
      terrainTransition: course.terrainTransition ?? 8,
      doubleYellow: !!course.doubleYellow,
      existingCourse: course,
      draft: builderData.restoreRoadDraft(course),
      closed: false,
    };
    const complete = new Promise((resolve) => {
      globalThis.self.postMessage = (message) => {
        messages.push(message);
        if (message.type === 'complete' || message.type === 'error') resolve(message);
      };
    });
    globalThis.self.onmessage({ data: request });
    const built = await complete;
    assert.equal(built.type, 'complete', built.message);
    assert.equal(built.model, undefined);
    assert.ok(!messages.some((message) => message.step === 'preview'));
    assert.equal(await built.json.text(), JSON.stringify(built.course));
    const preview = new Promise((resolve) => {
      globalThis.self.postMessage = resolve;
    });
    globalThis.self.onmessage({
      data: {
        type: 'preview',
        course: built.course,
        colors: { ground: '#333333', road: '#888888', start: '#ffffff' },
      },
    });
    assert.equal((await preview).type, 'preview');
    const middle = request.points.slice(
      Math.floor(request.points.length * 0.35),
      Math.ceil(request.points.length * 0.65),
    );
    const structureLines = [
      { type: 'bridge', coordinates: middle.map(({ lon, lat }) => [lon, lat]) },
    ];
    const structureComplete = new Promise((resolve) => {
      globalThis.self.postMessage = (message) => {
        if (message.type === 'complete' || message.type === 'error') resolve(message);
      };
    });
    const previousFetch = globalThis.fetch;
    try {
      globalThis.fetch = () => assert.fail('Repairing a saved course must not fetch elevation');
      globalThis.self.onmessage({
        data: { ...request, draft: { ...request.draft, structureLines } },
      });
      const response = await structureComplete;
      assert.equal(response.type, 'complete', response.message);
      assert.equal(response.course.structures.length, 1);
      assert.equal(response.course.structures[0].type, 'bridge');
      assert.deepEqual(response.course.points, course.points);
      assert.deepEqual(response.course.terrain.heights, course.terrain.heights);
      assert.notDeepEqual(response.course.elevation, course.elevation);
      const saved = builderData.readRoadMap(await response.json.text());
      assert.deepEqual(saved.structures, response.course.structures);
      assert.deepEqual(builderData.restoreRoadDraft(saved).structureLines, structureLines);
    } finally {
      globalThis.fetch = previousFetch;
    }
  } finally {
    if (previousSelf === undefined) delete globalThis.self;
    else globalThis.self = previousSelf;
  }
});

test('location search preserves coordinates, fits geocoded bounds, and caches submitted queries', async () => {
  let requests = 0;
  const search = createLocationSearch(async (url) => {
    requests++;
    assert.equal(url.searchParams.get('q'), 'Placerville, CA');
    assert.equal(url.searchParams.get('limit'), '1');
    return Response.json([
      {
        lat: '38.73',
        lon: '-120.8',
        display_name: 'Placerville, California',
        boundingbox: ['38.7', '38.8', '-120.9', '-120.7'],
      },
    ]);
  });
  assert.deepEqual(await search('38.788, -120.894'), {
    name: '38.788, -120.894',
    center: [-120.894, 38.788],
  });
  assert.equal(requests, 0);
  const found = await search(' Placerville, CA ');
  assert.deepEqual(found.bounds, [
    [-120.9, 38.7],
    [-120.7, 38.8],
  ]);
  assert.deepEqual(await search('placerville, ca'), found);
  assert.equal(requests, 1);
  await assert.rejects(search('91, 0'), /Coordinates must/);
  await assert.rejects(search(' '), /Enter a place/);
});

test('location search explicitly reports no matches, provider failures, and malformed bounds', async () => {
  for (const [response, message] of [
    [Response.json([]), /No location found/],
    [new Response('Unavailable', { status: 503 }), /HTTP 503/],
    [
      Response.json([
        { lat: '38', lon: '-120', display_name: 'Road', boundingbox: ['39', '38', '-121', '-120'] },
      ]),
      /invalid geographic bounds/,
    ],
  ]) {
    await assert.rejects(createLocationSearch(async () => response)('Road'), message);
  }
});
after(async () => {
  await server?.close();
});

test('vector road selection follows shared vertices, snaps endpoints, and reverses without closing', () => {
  const graph = new selection.RoadGraph();
  const coordinates = [
    [0, 0],
    [0.01, 0],
    [0.01, 0.01],
    [0.02, 0.01],
  ];
  graph.add([{ coordinates }, { coordinates: coordinates.toReversed() }]);
  const from = { lon: 0.005, lat: 0 };
  const to = { lon: 0.015, lat: 0.01 };
  const route = graph.connect(from, to, 2);
  assert.equal(route.length, 4);
  assert.deepEqual(route.slice(1, -1), [
    { lon: 0.01, lat: 0 },
    { lon: 0.01, lat: 0.01 },
  ]);
  assert.ok(roadDistances([from, route[0]])[1] < 0.01);
  assert.ok(roadDistances([to, route.at(-1)])[1] < 0.01);
  assert.deepEqual(graph.connect(to, from, 2), route.toReversed());
  const direct = graph.connect(from, { lon: 0.008, lat: 0 }, 2);
  assert.equal(direct.length, 2);
  assert.ok(selection.routeLength(direct) < selection.routeLength(route));
  graph.add([
    { coordinates: coordinates.slice(1, 3), brunnel: 'bridge' },
    { coordinates: coordinates.slice(1, 3).toReversed(), brunnel: 'bridge' },
    { coordinates: coordinates.slice(0, 2), brunnel: 'ford' },
  ]);
  assert.equal(graph.structureLines().length, 1);
  assert.equal(graph.structureLines()[0].type, 'bridge');
});

test('vector selection rejects disconnected crossings, distant clicks, and paths over 8 km', () => {
  const graph = new selection.RoadGraph();
  graph.add([
    {
      coordinates: [
        [0, 0],
        [0.1, 0],
      ],
    },
    {
      coordinates: [
        [0.05, -0.01],
        [0.05, 0.01],
      ],
    },
  ]);
  assert.throws(
    () => graph.connect({ lon: 0, lat: 0 }, { lon: 0.05, lat: 0.01 }, 2),
    /No connected route/,
  );
  assert.throws(() => graph.connect({ lon: 0, lat: 0 }, { lon: 0.1, lat: 0 }, 2), /within 8 km/);
  assert.throws(() => graph.snap({ lon: 1, lat: 1 }, 10), /Click closer/);
});

test('adjacent vector tile vertices join across quantization gaps without joining nearby parallel roads', () => {
  const graph = new selection.RoadGraph();
  graph.add([
    {
      coordinates: [
        [0, 0],
        [0.01, 0],
      ],
    },
    {
      coordinates: [
        [0.01001, 0.000005],
        [0.02, 0],
      ],
    },
    {
      coordinates: [
        [0, 0.0001],
        [0.02, 0.0001],
      ],
    },
  ]);
  const from = { lon: 0, lat: 0 };
  const to = { lon: 0.02, lat: 0 };
  assert.ok(selection.routeLength(graph.connect(from, to, 2)) > 2000);
  assert.throws(() => graph.connect(from, { lon: 0.02, lat: 0.0001 }, 2), /No connected route/);
});

test('buffered tile endpoints connect inside overlapping road segments', () => {
  const graph = new selection.RoadGraph();
  graph.add([
    {
      coordinates: [
        [0, 0],
        [0.01, 0],
      ],
    },
    {
      coordinates: [
        [0.005, 0.000001],
        [0.02, 0],
      ],
    },
  ]);
  const from = { lon: 0, lat: 0 };
  const to = { lon: 0.02, lat: 0 };
  assert.ok(
    Math.abs(selection.routeLength(graph.connect(from, to, 2)) - roadDistances([from, to])[1]) < 1,
  );
  const middle = { lon: 0.004, lat: 0 };
  assert.ok(
    Math.abs(selection.routeLength(graph.connect(middle, to, 2)) - roadDistances([middle, to])[1]) <
      1,
  );
});

test('import route limits are measured along the entire polyline, including repeated legs', () => {
  const metersPerDegree = roadDistances([
    { lat: 0, lon: 0 },
    { lat: 0, lon: 1 },
  ])[1];
  const route = (length) => [
    { lat: 0, lon: 0 },
    { lat: 0, lon: length / metersPerDegree },
  ];
  const { maximumRoadLength: max, minimumRoadLength: min, validateImportRoute } = selection;
  assert.ok(Math.abs(validateImportRoute(route(max)) - max) < 1e-8);
  assert.ok(Math.abs(validateImportRoute(route(min)) - min) < 1e-8);
  assert.throws(() => validateImportRoute(route(max + 0.01)), /100 m and 8 km/);
  assert.throws(() => validateImportRoute(route(min - 0.01)), /100 m and 8 km/);
  assert.throws(
    () => validateImportRoute([...route(max / 2 + 1), { lat: 0, lon: 0 }]),
    /100 m and 8 km/,
  );
  assert.throws(
    () =>
      validateImportRoute([
        { lat: NaN, lon: 0 },
        { lat: 0, lon: 0 },
      ]),
    /valid geographic/,
  );
});

test('waypoint removal reconnects only neighbouring legs and preserves source sections', () => {
  const a = { lat: 0, lon: 0 };
  const b = { lat: 0, lon: 0.001 };
  const c = { lat: 0.001, lon: 0.001 };
  const d = { lat: 0.001, lon: 0 };
  const graph = new selection.RoadGraph();
  graph.add([{ coordinates: [a, b, c, d, a].map(({ lon, lat }) => [lon, lat]) }]);
  const sections = [[a], [a, b], [b, c], [c, d]];
  const snapshot = structuredClone(sections);
  const removed = selection.removeRouteWaypoint(sections, 1, graph);
  assert.equal(removed.length, 3);
  assert.deepEqual(removed[1].at(-1), c);
  assert.deepEqual(removed[2], [c, d]);
  assert.deepEqual(selection.removeRouteWaypoint(sections, 0, graph), [[b], [b, c], [c, d]]);
  assert.deepEqual(selection.removeRouteWaypoint(sections, 3, graph), sections.slice(0, -1));
  assert.deepEqual(sections, snapshot);
  const loop = [
    ...sections.flatMap((part, i) => (i ? part.slice(1) : part)),
    ...graph.connect(d, a, 2).slice(1),
  ];
  assert.ok(selection.validateImportRoute(loop, true) > 400);
  const seamReversal = [a, b, c, { lat: 0, lon: 0.0005 }, a];
  assert.throws(() => selection.validateImportRoute(seamReversal, true), /doubles back/);
  assert.throws(
    () => selection.validateImportRoute([a, b, { lat: 0, lon: 0.0001 }]),
    /doubles back/,
  );
});

test('closing a loop takes the forward continuation instead of the shorter backtracking road', () => {
  const a = { lat: 0, lon: 0 };
  const b = { lat: 0, lon: 0.001 };
  const c = { lat: 0, lon: 0.002 };
  const d = { lat: 0.002, lon: 0.002 };
  const e = { lat: 0.002, lon: 0 };
  const graph = new selection.RoadGraph();
  graph.add([{ coordinates: [a, b, c, d, e, a].map(({ lat, lon }) => [lon, lat]) }]);
  assert.ok(selection.routeLength(graph.connect(c, a, 2)) < 230);
  const connection = selection.closeRoadLoop([a, b, c], graph);
  assert.deepEqual(connection, [c, d, e, a]);
  assert.ok(selection.validateImportRoute([a, b, ...connection], true) > 800);

  const from = { lat: 0, lon: 0.0002 };
  const to = { lat: 0, lon: 0.0018 };
  const snappedConnection = selection.closeRoadLoop([from, b, to], graph);
  assert.ok(selection.routeLength(snappedConnection) > 600);
  assert.ok(
    selection.validateImportRoute([from, b, to, ...snappedConnection.slice(1)], true) > 800,
  );
  const shortArc = [0.0002, 0.0005, 0.0008].map((lon) => ({ lat: 0, lon }));
  assert.ok(selection.routeLength(shortArc) < selection.minimumRoadLength);
  assert.ok(selection.routeLength(selection.closeRoadLoop(shortArc, graph)) > 800);
});

test('closing a loop reports missing forward roads instead of accepting a reversal', () => {
  const points = [0, 0.001, 0.002].map((lon) => ({ lat: 0, lon }));
  const graph = new selection.RoadGraph();
  graph.add([{ coordinates: points.map(({ lat, lon }) => [lon, lat]) }]);
  assert.throws(() => selection.closeRoadLoop(points, graph), /No forward closing road/);
  graph.add([
    {
      coordinates: [
        [0.002, 0],
        [0.002, 0.04],
        [0, 0.04],
        [0, 0],
      ],
    },
  ]);
  assert.throws(() => selection.closeRoadLoop(points, graph), /remaining 8 km limit/);
});

test('collinear tile overlaps do not turn a forward road into a sharp reversal', () => {
  const a = { lat: 0, lon: 0 };
  const b = { lat: 0.00001, lon: 0.002 };
  const c = { lat: 0, lon: 0.001 };
  const d = { lat: 0, lon: 0.003 };
  const e = { lat: 0.002, lon: 0.003 };
  const f = { lat: 0.002, lon: 0 };
  const graph = new selection.RoadGraph();
  graph.add([{ coordinates: [a, b, c, d, e, f, a].map(({ lat, lon }) => [lon, lat]) }]);
  const selected = selection.cleanRoadRoute([a, b, c, d]);
  assert.deepEqual(selected, [a, d]);
  assert.deepEqual(graph.connect(a, d, 2), selected);
  const closing = selection.closeRoadLoop(selected, graph);
  assert.ok(selection.validateImportRoute([...selected, ...closing.slice(1)], true) > 1000);
  const hairpin = [a, { ...b, lat: 0.0001 }, c, d];
  assert.deepEqual(selection.cleanRoadRoute(hairpin), hairpin);
  assert.throws(() => selection.validateImportRoute(hairpin), /doubles back/);
});
