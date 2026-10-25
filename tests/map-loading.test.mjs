import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let courses;
let loadCourseDefinition;

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  ({ courses, loadCourseDefinition } = await server.ssrLoadModule('/src/courses.ts'));
});

after(async () => {
  await server?.close();
});

test('client catalog excludes terrain while keeping course outlines and metadata', async () => {
  const result = await server.transformRequest('virtual:course-catalog');
  assert.ok(result);
  assert.ok(!result.code.includes('"terrain":'));
  for (const course of courses.filter(({ terrain }) => terrain)) {
    assert.ok(result.code.includes(JSON.stringify(course.id)));
    assert.ok(result.code.includes(JSON.stringify(course.points)));
  }
  assert.ok(result.code.length < 300_000, `catalog is ${result.code.length} bytes`);
});

test('map loads share requests, reuse cached data and preserve direction', async (t) => {
  const course = courses.find(({ terrain }) => terrain);
  const { terrain, ...metadata } = course;
  const requests = [];
  const bytes = new TextEncoder().encode(JSON.stringify(course));
  const middle = Math.floor(bytes.length / 2);
  const forwardProgress = [];
  const reverseProgress = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options });
    return new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(bytes.slice(0, middle));
          controller.enqueue(bytes.slice(middle));
          controller.close();
        },
      }),
      { headers: { 'Content-Encoding': 'gzip', 'Content-Length': '100' } },
    );
  });
  const [forward, reverse] = await Promise.all([
    loadCourseDefinition(metadata, (fraction) => forwardProgress.push(fraction)),
    loadCourseDefinition({ ...metadata, reverse: true }, (fraction) =>
      reverseProgress.push(fraction),
    ),
  ]);
  assert.equal(forwardProgress[0], 0);
  assert.equal(forwardProgress.at(-1), 1);
  assert.ok(forwardProgress.some((fraction) => fraction > 0 && fraction < 0.99));
  assert.deepEqual(reverseProgress, forwardProgress);
  assert.ok(forwardProgress.every((fraction, i) => i === 0 || fraction >= forwardProgress[i - 1]));
  assert.deepEqual(forward.terrain, terrain);
  assert.equal(forward.reverse, undefined);
  assert.equal(reverse.reverse, true);
  const cachedProgress = [];
  await loadCourseDefinition(metadata, (fraction) => cachedProgress.push(fraction));
  assert.deepEqual(cachedProgress, [1]);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.cache, 'force-cache');
  assert.match(requests[0].url, /\.json/);
  assert.equal(await loadCourseDefinition(course), course);
  const builtIn = courses.find(({ terrain }) => !terrain);
  assert.equal(await loadCourseDefinition(builtIn), builtIn);
});

test('failed or invalid map downloads surface errors and can be retried', async (t) => {
  const course = courses.filter(({ terrain }) => terrain)[1];
  const { terrain: _terrain, ...metadata } = course;
  const responses = [
    new Response('', { status: 503 }),
    Response.json({ ...course, id: 'wrong-map' }),
    Response.json(course),
  ];
  let requests = 0;
  const progress = [];
  t.mock.method(globalThis, 'fetch', async () => responses[requests++]);
  await assert.rejects(
    loadCourseDefinition(metadata, (fraction) => progress.push(fraction)),
    /HTTP 503/,
  );
  await assert.rejects(loadCourseDefinition(metadata), /Invalid map data/);
  assert.deepEqual((await loadCourseDefinition(metadata)).terrain, course.terrain);
  assert.equal(requests, 3);
  assert.deepEqual(progress, [0], 'failed requests must not report completion or retain listeners');
});
