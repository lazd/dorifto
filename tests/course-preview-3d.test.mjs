import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let createCoursePreviewModel;
let courses;
let CourseTerrain;

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  ({ createCoursePreviewModel } = await server.ssrLoadModule('/src/course-preview-3d.ts'));
  ({ courses } = await server.ssrLoadModule('/src/courses.ts'));
  ({ CourseTerrain } = await server.ssrLoadModule('/src/terrain.ts'));
});

after(async () => {
  await server?.close();
});

const colors = { ground: '#2a3f43', road: '#9aaeb4', start: '#e9f0f1' };

test('3-D previews drape the road on the game heightfield and dispose every resource', () => {
  for (const definition of [
    courses.find(({ id }) => id === 'hillside'),
    courses.find(({ padRadius }) => padRadius),
  ]) {
    const terrain = new CourseTerrain(definition, false);
    const { group, dispose } = createCoursePreviewModel(definition, colors);
    const [road, , ground] = group.children;
    const position = road.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i += 37)
      assert.ok(
        Math.abs(position.getY(i) - terrain.heightAt(position.getX(i), position.getZ(i)) - 0.15) <
          1e-4,
        definition.id,
      );
    assert.ok(ground.geometry.getIndex().count > 0);
    const disposed = [];
    group.traverse(({ geometry, material }) => {
      geometry?.addEventListener('dispose', () => disposed.push(geometry));
      material?.addEventListener('dispose', () => disposed.push(material));
    });
    dispose();
    assert.equal(group.children.length, 0);
    assert.equal(disposed.length, 6);
  }
});
