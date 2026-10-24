import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let coursePreviewSvg;
let coursePreviewGeometry;
let roadPreviewSvg;
let courses;
let courseRoute;
let courseSpawn;
let courseStartDistance;

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  ({ coursePreviewSvg, coursePreviewGeometry, roadPreviewSvg } =
    await server.ssrLoadModule('/src/course-preview.ts'));
  ({ courses, courseRoute, courseSpawn, courseStartDistance } =
    await server.ssrLoadModule('/src/courses.ts'));
});

after(async () => {
  await server?.close();
});

test('road previews keep the route open and mark both endpoints', () => {
  const svg = roadPreviewSvg(
    [
      { x: 0, z: 0 },
      { x: 100, z: 0 },
      { x: 100, z: 100 },
    ],
    15,
    { title: '<Road>' },
  );
  const roadPath = svg.match(/<path d="([^"]+)"/)[1];
  assert.equal((roadPath.match(/L/g) ?? []).length, 2);
  assert.ok(!roadPath.includes('Z'));
  assert.equal((svg.match(/stroke-dasharray=/g) ?? []).length, 2);
  assert.ok(svg.includes('<title>&#60;Road&#62;</title>'));
});

test('course previews fit every course inside the padded square and mark the start', () => {
  for (const definition of courses) {
    const { path, start } = coursePreviewGeometry(definition, 120, 10);
    const values = [...path.matchAll(/-?\d+(?:\.\d+)?/g)].map(Number);
    assert.ok(values.length > 100, definition.id);
    assert.ok(
      values.every((value) => value >= 9.9 && value <= 110.1),
      definition.id,
    );
    assert.ok(
      start.every((value) => value >= 9.9 && value <= 110.1),
      definition.id,
    );
    const svg = coursePreviewSvg(definition, { size: 120, padding: 10 });
    assert.match(svg, /^<svg [^>]*viewBox="0 0 120 120"/);
    assert.match(svg, /<path d="M/);
    assert.match(svg, /<g fill="none" stroke-width="3">/);
    assert.match(svg, /<path d="M[^"]+ L[^"]+" stroke="#000"/);
    assert.match(svg, /<path d="M[^"]+ L[^"]+" stroke="#fff" stroke-dasharray="3 3"/);
    assert.ok(!svg.includes('<circle'));
  }
});

test('course preview markup escapes labels and colors', () => {
  const svg = coursePreviewSvg(courses[0], {
    title: '<Tom & "Jerry">',
    trackColor: '"red"',
    startColor: '"white"',
  });
  assert.ok(svg.includes('<title>&#60;Tom &#38; &#34;Jerry&#34;&#62;</title>'));
  assert.ok(svg.includes('stroke="&#34;red&#34;"'));
  assert.ok(svg.includes('stroke="&#34;white&#34;"'));
  assert.ok(!svg.includes('<Tom'));
});

test('start lines cross the actual finish gate in both course directions, not the spawn point', () => {
  for (const definition of courses) {
    for (const reverse of [false, true]) {
      const course = { ...definition, reverse };
      const geometry = coursePreviewGeometry(course);
      const route = courseRoute(course);
      const t = courseStartDistance(course, route.getLength()) / route.getLength();
      const gate = route.getPointAt(t);
      const tangent = route.getTangentAt(t);
      const spawn = courseSpawn(course);
      const [x1, y1, x2, y2] = geometry.startLine
        .match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g)
        .map(Number);
      const expectedX = geometry.start[0] + (gate.x - spawn.position[0]) * geometry.scale;
      const expectedY = geometry.start[1] - (gate.z - spawn.position[1]) * geometry.scale;
      assert.ok(Math.abs((x1 + x2) / 2 - expectedX) < 1e-8, course.id);
      assert.ok(Math.abs((y1 + y2) / 2 - expectedY) < 1e-8, course.id);
      assert.ok(Math.abs((x2 - x1) * tangent.x - (y2 - y1) * tangent.z) < 1e-8, course.id);
      assert.ok(
        Math.abs(Math.hypot(x2 - x1, y2 - y1) - (geometry.roadWidth + 4)) < 1e-8,
        course.id,
      );
    }
  }
});

test('fits the full road stroke and start line without clipping, including the wide skidpad', () => {
  for (const definition of courses) {
    for (const minStrokeWidth of [1.5, 8]) {
      const size = 120;
      const padding = 10;
      const { path, scale, roadWidth } = coursePreviewGeometry(
        definition,
        size,
        padding,
        400,
        minStrokeWidth,
      );
      const stroke = Math.max(minStrokeWidth, definition.width * scale);
      const coordinates = [...path.matchAll(/-?\d+(?:\.\d+)?/g)].map(Number);
      assert.ok(
        coordinates.every(
          (value) =>
            value - stroke / 2 >= padding - 0.1 && value + stroke / 2 <= size - padding + 0.1,
        ),
        `${definition.id} road edges fit with stroke ${stroke}`,
      );
      const svg = coursePreviewSvg(definition, { size, padding, minStrokeWidth });
      const marker = svg.match(/<path d="(M[^"]+ L[^"]+)" stroke="#000"/);
      assert.ok(marker);
      const endpoints = [...marker[1].matchAll(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g)].map(Number);
      assert.equal(endpoints.length, 4);
      assert.ok(
        Math.abs(
          Math.hypot(endpoints[2] - endpoints[0], endpoints[3] - endpoints[1]) - roadWidth - 4,
        ) < 1e-8,
      );
      assert.ok(
        endpoints.every((value) => value - 1.5 >= 0 && value + 1.5 <= size),
        `${definition.id} start line fits`,
      );
    }
  }
});
