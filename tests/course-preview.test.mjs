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
