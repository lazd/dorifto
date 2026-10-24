import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { convertTrack, selectTrackSegment } from '../scripts/import-track.mjs';

let server;
let courseRoute;
let courseSpawn;
let courseProfileHeight;
let LapTimer;
let coursePreviewSvg;
let Vector3;
const definition = {
  id: 'open-road',
  name: 'Open road',
  closed: false,
  width: 15,
  points: [
    [0, 0],
    [0, 100],
    [100, 100],
  ],
};

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  ({ courseRoute, courseSpawn, courseProfileHeight } =
    await server.ssrLoadModule('/src/courses.ts'));
  ({ LapTimer } = await server.ssrLoadModule('/src/laps.ts'));
  ({ coursePreviewSvg } = await server.ssrLoadModule('/src/course-preview.ts'));
  ({ Vector3 } = await import('three'));
});

after(async () => {
  await server?.close();
});

test('open routes retain endpoints, reverse direction, and do not close previews', () => {
  const route = courseRoute(definition);
  assert.ok(route.getLength() > Math.hypot(100, 100) && route.getLength() < 200);
  assert.deepEqual(route.getPointAt(0).toArray(), [0, 0, 0]);
  assert.deepEqual(route.getPointAt(1).toArray(), [100, 0, 100]);
  assert.deepEqual(courseSpawn(definition).position, [0, 0]);
  assert.deepEqual(courseSpawn({ ...definition, reverse: true }).position, [100, 100]);
  assert.equal(courseProfileHeight([0, 50, 100], 1, false), 100);
  const svg = coursePreviewSvg(definition);
  assert.ok(!svg.match(/<path d="([^"]+)"/)[1].includes('Z'));
  assert.equal((svg.match(/stroke-dasharray=/g) ?? []).length, 2);
});

test('open-road centerlines and elevation have continuous slopes without overshooting heights', () => {
  const route = courseRoute(definition);
  const before = route.getTangent(0.5 - 0.00001);
  const after = route.getTangent(0.5 + 0.00001);
  assert.ok(before.angleTo(after) < 0.001);
  const heights = [0, 10, 11, 25];
  const step = 0.000001;
  for (const fraction of [1 / 3, 2 / 3]) {
    const center = courseProfileHeight(heights, fraction, false);
    const left = (center - courseProfileHeight(heights, fraction - step, false)) / step;
    const right = (courseProfileHeight(heights, fraction + step, false) - center) / step;
    assert.ok(Math.abs(left - right) < 0.001);
  }
  let previous = -Infinity;
  for (let i = 0; i <= 1000; i++) {
    const height = courseProfileHeight(heights, i / 1000, false);
    assert.ok(height >= previous && height >= 0 && height <= 25);
    previous = height;
  }
});

test('open timing completes only at the finish, once, and resets for another run', () => {
  const timer = new LapTimer(definition);
  const start = new Vector3(0, 0, 0);
  timer.reset(start);
  assert.equal(timer.lap, 1);
  timer.update(start, 30, [start], true);
  assert.equal(timer.elapsedTime, 0);
  const before = new Vector3(90, 0, 100);
  timer.update(before, 9, [before]);
  const finish = new Vector3(110, 0, 100);
  timer.update(finish, 2, [new Vector3(100, 0, 100)]);
  assert.equal(timer.finished, true);
  assert.equal(timer.lap, 1);
  assert.equal(timer.last, 10);
  timer.update(start, 20, [start]);
  assert.equal(timer.current, 10);
  assert.equal(timer.last, 10);
  timer.reset(start);
  assert.equal(timer.finished, false);
  assert.equal(timer.last, null);
  const reversed = { ...definition, reverse: true };
  const reverseRoute = courseRoute(reversed);
  const reverseTimer = new LapTimer(reversed);
  reverseTimer.reset(reverseRoute.getPointAt(0));
  const finishPoint = reverseRoute.getPointAt(1);
  const beforeFinish = finishPoint.clone().addScaledVector(reverseRoute.getTangentAt(1), -10);
  reverseTimer.update(beforeFinish, 9, [beforeFinish]);
  reverseTimer.update(finishPoint.clone().addScaledVector(reverseRoute.getTangentAt(1), 10), 2, [
    finishPoint,
  ]);
  assert.equal(reverseTimer.finished, true);
  assert.equal(reverseTimer.lap, 1);
  assert.ok(Math.abs(reverseTimer.last - 10) < 1e-6);
});

test('import conversion preserves open endpoints and elevation rather than bridging the seam', () => {
  const points = Array.from({ length: 8 }, (_, i) => ({ lat: 38 + i / 10000, lon: -120 }));
  const course = convertTrack({
    slug: 'open-road',
    closed: false,
    featured_lap: { points },
    elevation: {
      points: [
        { dist_frac: 0, altitude_m: 0 },
        { dist_frac: 1, altitude_m: 100 },
      ],
    },
  });

  assert.equal(course.closed, false);
  assert.ok(course.points.at(-1)[1] > course.points[0][1]);
  assert.ok(course.elevation.at(-1) - course.elevation[0] > 90);
});

test('segment imports trim and reverse source geometry and elevation without closing it', () => {
  const points = Array.from({ length: 8 }, (_, i) => ({ lat: 38 + i / 10000, lon: -120 }));
  const source = {
    slug: 'road',
    display_name: 'Road',
    closed: false,
    featured_lap: { points },
    elevation: {
      source: 'USGS 3DEP',
      points: points.map((_, i) => ({ dist_frac: i / 7, altitude_m: i * 10 })),
    },
  };
  for (const [start, finish] of [
    [2, 6],
    [6, 2],
  ]) {
    const segment = selectTrackSegment(source, { start, finish });
    assert.equal(segment.slug, `road-${start}-${finish}`);
    assert.equal(segment.venue_name, 'Road');
    assert.deepEqual(segment.featured_lap.points[0], points[start]);
    assert.deepEqual(segment.featured_lap.points.at(-1), points[finish]);
    assert.ok(Math.abs(segment.elevation.points[0].altitude_m - start * 10) < 1e-6);
    assert.ok(Math.abs(segment.elevation.points.at(-1).altitude_m - finish * 10) < 1e-6);
    assert.equal(segment.elevation.points[0].dist_frac, 0);
    assert.equal(segment.elevation.points.at(-1).dist_frac, 1);
    assert.equal(convertTrack(segment).closed, false);
  }
  assert.throws(() => selectTrackSegment(source, { start: 2 }), /valid source point/);
  assert.throws(() => selectTrackSegment(source, { start: 2, finish: 2 }), /valid source point/);
});

test('imported road width and optional double-yellow lines reach the terrain-draped game mesh', async (t) => {
  const source = {
    slug: 'narrow-road',
    closed: false,
    featured_lap: {
      points: [
        { lat: 38, lon: -120 },
        { lat: 38.001, lon: -120 },
      ],
    },
    elevation: {
      points: [
        { dist_frac: 0, altitude_m: 100 },
        { dist_frac: 1, altitude_m: 105 },
      ],
    },
  };
  assert.equal(convertTrack(source).width, 8);
  assert.equal(convertTrack(source).doubleYellow, true);
  assert.equal(convertTrack(source, { doubleYellow: false }).doubleYellow, undefined);
  for (const width of [0, -1, NaN, Infinity])
    assert.throws(() => convertTrack(source, { width }), /--width/);
  const imported = convertTrack(source, { width: 7.5, doubleYellow: true });
  assert.equal(imported.width, 7.5);
  assert.equal(imported.doubleYellow, true);

  const previousDocument = globalThis.document;
  const context = {
    createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
    getImageData: (_x, _y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
    putImageData() {},
    beginPath() {},
    ellipse() {},
    fill() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
  };
  globalThis.document = { createElement: () => ({ getContext: () => context }) };
  t.after(() => {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  });
  const { createCourse } = await server.ssrLoadModule('/src/course.ts');
  const { Scene } = await import('three');
  const scene = new Scene();
  for (const doubleYellow of [false, true]) {
    const course = createCourse(scene, { ...imported, doubleYellow }, 1.8);
    try {
      const lines = scene.getObjectsByProperty('name', 'double-yellow-center-line');
      assert.equal(lines.length, doubleYellow ? 2 : 0);
      for (const line of lines) {
        const positions = line.geometry.getAttribute('position');
        for (let i = 0; i < positions.count; i++) {
          const x = positions.getX(i);
          const y = positions.getY(i);
          const z = positions.getZ(i);
          assert.ok(Math.abs(y - course.terrain.heightAt(x, z) - 0.016) < 1e-5);
        }
      }
      if (doubleYellow) {
        for (const line of lines) line.geometry.computeBoundingBox();
        const [a, b] = lines.map((line) => line.geometry.boundingBox);
        assert.ok(a.max.x < 0 && b.min.x > 0, 'lines straddle the center with a gap');
        assert.ok(a.max.x - a.min.x > 0, 'lines have visible width');
      }
    } finally {
      course.dispose();
    }
  }
});
