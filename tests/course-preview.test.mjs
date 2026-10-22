import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let coursePreviewSvg;
let coursePreviewGeometry;
let courses;

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  ({ coursePreviewSvg, coursePreviewGeometry } = await server.ssrLoadModule('/src/course-preview.ts'));
  ({ courses } = await server.ssrLoadModule('/src/courses.ts'));
});

after(async () => {
  await server?.close();
});

test('course previews fit every course inside the padded square and mark the start', () => {
  for (const definition of courses) {
    const { path, start } = coursePreviewGeometry(definition, 120, 10);
    const values = [...path.matchAll(/-?\d+(?:\.\d+)?/g)].map(Number);
    assert.ok(values.length > 100, definition.id);
    assert.ok(values.every((value) => value >= 9.9 && value <= 110.1), definition.id);
    assert.ok(start.every((value) => value >= 9.9 && value <= 110.1), definition.id);
    const svg = coursePreviewSvg(definition, { size: 120, padding: 10 });
    assert.match(svg, /^<svg [^>]*viewBox="0 0 120 120"/);
    assert.match(svg, /<path d="M/);
    assert.match(svg, /<circle /);
  }
});

test('course preview markup escapes labels and colors', () => {
  const svg = coursePreviewSvg(courses[0], { title: '<Tom & "Jerry">', trackColor: '"red"' });
  assert.ok(svg.includes('<title>&#60;Tom &#38; &#34;Jerry&#34;&#62;</title>'));
  assert.ok(svg.includes('stroke="&#34;red&#34;"'));
  assert.ok(!svg.includes('<Tom'));
});

test('fits the full road stroke and start marker without clipping, including the wide skidpad', () => {
  for (const definition of courses) {
    for (const minStrokeWidth of [1.5, 8]) {
      const size = 120;
      const padding = 10;
      const { path, scale } = coursePreviewGeometry(definition, size, padding, 400, minStrokeWidth);
      const stroke = Math.max(minStrokeWidth, definition.width * scale);
      const coordinates = [...path.matchAll(/-?\d+(?:\.\d+)?/g)].map(Number);
      assert.ok(coordinates.every((value) =>
        value - stroke / 2 >= padding - 0.1 && value + stroke / 2 <= size - padding + 0.1),
      `${definition.id} road edges fit with stroke ${stroke}`);
      const svg = coursePreviewSvg(definition, { size, padding, minStrokeWidth });
      const marker = svg.match(/<circle cx="([^"]+)" cy="([^"]+)" r="([^"]+)"/);
      assert.ok(marker);
      const [, x, y, radius] = marker.map(Number);
      assert.ok([x, y].every((value) => value - radius >= 0 && value + radius <= size),
        `${definition.id} start marker fits`);
    }
  }
});
