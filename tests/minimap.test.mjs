import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let courses;
let courseRoute;
let courseSpawn;
let startDistance;
let generateCourse;
let generateCustomCourse;
let defaultCourseWeights;
let createMinimapLayout;
let minimapMarkerTransform;
let minimapViewTransform;
let createGameState;
let isMinimapOrientation;

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  ({ courses, courseRoute, courseSpawn, startDistance, generateCourse } = await server.ssrLoadModule('/src/courses.ts'));
  ({ generateCustomCourse, defaultCourseWeights } = await server.ssrLoadModule('/src/course-generation.ts'));
  ({ createMinimapLayout, minimapMarkerTransform, minimapViewTransform } = await server.ssrLoadModule('/src/minimap.ts'));
  ({ createGameState, isMinimapOrientation } = await server.ssrLoadModule('/src/game-state.ts'));
});

after(async () => {
  await server?.close();
});

test('fits every course type inside the minimap without distorting its ground-plane coordinates', () => {
  const definitions = [...courses, generateCourse(42), generateCustomCourse(42, defaultCourseWeights)];
  for (const definition of definitions) {
    const layout = createMinimapLayout(definition);
    assert.ok(layout.path.startsWith('M'));
    assert.ok(layout.path.endsWith(' Z'));
    assert.ok(!/NaN|Infinity/.test(layout.path + layout.startLine));
    for (const point of courseRoute(definition).getSpacedPoints(1000)) {
      const projected = layout.project(point);
      const margin = layout.roadWidth / 2;
      assert.ok(projected.x - margin >= 12 && projected.x + margin <= 168, definition.id);
      assert.ok(projected.y - margin >= 12 && projected.y + margin <= 168, definition.id);
    }
    const origin = layout.project({ x: 0, z: 0 });
    const east = layout.project({ x: 10, z: 0 });
    const south = layout.project({ x: 0, z: 10 });
    assert.ok(east.x > origin.x);
    assert.ok(south.y > origin.y);
    assert.ok(Math.abs(east.x - origin.x - (south.y - origin.y)) < 1e-10);
    if (definition.padRadius !== undefined) {
      assert.ok(layout.pad);
      assert.ok(layout.pad.x - layout.pad.radius >= 15.99);
      assert.ok(layout.pad.x + layout.pad.radius <= 164.01);
      assert.ok(layout.pad.y - layout.pad.radius >= 15.99);
      assert.ok(layout.pad.y + layout.pad.radius <= 164.01);
    } else assert.equal(layout.pad, undefined);
  }
});

test('reverse courses retain the same outline, projection, and physical start line', () => {
  for (const definition of courses) {
    const forward = createMinimapLayout(definition);
    const backward = createMinimapLayout({ ...definition, reverse: true });
    assert.equal(forward.path, backward.path);
    assert.equal(forward.startLine, backward.startLine);
    const route = courseRoute(definition);
    const start = forward.project(route.getPointAt(startDistance / route.getLength()));
    const numbers = forward.startLine.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g).map(Number);
    assert.ok(Math.abs((numbers[0] + numbers[2]) / 2 - start.x) < 1e-8);
    assert.ok(Math.abs((numbers[1] + numbers[3]) / 2 - start.y) < 1e-8);
    for (const reverse of [false, true]) {
      const spawn = courseSpawn({ ...definition, reverse });
      const transform = minimapMarkerTransform(forward,
        { x: spawn.position[0], z: spawn.position[1] },
        { x: Math.sin(spawn.heading), z: Math.cos(spawn.heading) });
      assert.ok(!/NaN|Infinity/.test(transform));
    }
  }
});

test('marker tracks actual position, including off-track, and points in each world direction', () => {
  const layout = createMinimapLayout(courses[0]);
  const position = courseRoute(courses[0]).getPointAt(0.3);
  const projected = layout.project(position);
  for (const [forward, angle] of [
    [{ x: 0, z: -1 }, 0], [{ x: 1, z: 0 }, 90],
    [{ x: 0, z: 1 }, 180], [{ x: -1, z: 0 }, -90],
  ]) {
    assert.equal(minimapMarkerTransform(layout, position, forward),
      `translate(${projected.x.toFixed(2)} ${projected.y.toFixed(2)}) rotate(${angle.toFixed(2)})`);
  }
  const offTrack = { x: position.x + 10, z: position.z + 10 };
  assert.notEqual(minimapMarkerTransform(layout, position, { x: 0, z: -1 }),
    minimapMarkerTransform(layout, offTrack, { x: 0, z: -1 }));
});

test('map orientation defaults to north up and validates setting values', () => {
  assert.equal(createGameState().getState().minimapOrientation, 'north-up');
  for (const value of ['north-up', 'heading-up']) assert.equal(isMinimapOrientation(value), true);
  for (const value of ['', 'north', 'heading', 'on']) assert.equal(isMinimapOrientation(value), false);
});

test('follow heading counter-rotates the map while keeping the car upright at its original size', () => {
  const layout = createMinimapLayout(courses[0]);
  const position = courseRoute(courses[0]).getPointAt(0.3);
  for (let degrees = -180; degrees <= 180; degrees += 15) {
    const radians = degrees * Math.PI / 180;
    const forward = { x: Math.sin(radians), z: -Math.cos(radians) };
    assert.equal(minimapViewTransform(forward, 'north-up'), '');
    const view = minimapViewTransform(forward, 'heading-up');
    const marker = minimapMarkerTransform(layout, position, forward, 'heading-up');
    const rotation = Number(view.match(/rotate\(([^)]+)\)/)[1]);
    const markerRotation = Number(marker.match(/rotate\(([^)]+)\)/)[1]);
    const scale = Number(view.match(/scale\(([^)]+)\)/)[1]);
    const markerScale = Number(marker.match(/scale\(([^)]+)\)/)[1]);
    assert.ok(Math.abs(rotation + markerRotation) < 1e-8);
    assert.ok(Math.abs(scale * markerScale - 1) < 1e-8);
    // Even the corners of the map's road bounds remain inside the padded viewport.
    const angle = rotation * Math.PI / 180;
    for (const x of [-74, 74]) {
      for (const y of [-74, 74]) {
        const rotatedX = 90 + scale * (x * Math.cos(angle) - y * Math.sin(angle));
        const rotatedY = 90 + scale * (x * Math.sin(angle) + y * Math.cos(angle));
        assert.ok(rotatedX >= 16 - 1e-8 && rotatedX <= 164 + 1e-8);
        assert.ok(rotatedY >= 16 - 1e-8 && rotatedY <= 164 + 1e-8);
      }
    }
  }
});
