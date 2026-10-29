import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { Vector3 } from 'three';
import { convertTrack, selectTrackSegment } from '../scripts/import-track.mjs';

let server;
let courseRoute;
let openRoadLineDistance;
let raceGridSpawn;
let maxRaceBots;
let courseProfileHeight;
let LapTimer;
let coursePreviewSvg;
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
  ({ courseRoute, courseProfileHeight, openRoadLineDistance } =
    await server.ssrLoadModule('/src/courses.ts'));
  ({ raceGridSpawn, maxRaceBots } = await server.ssrLoadModule('/src/race-bot.ts'));
  ({ LapTimer } = await server.ssrLoadModule('/src/laps.ts'));
  ({ coursePreviewSvg } = await server.ssrLoadModule('/src/course-preview.ts'));
});

after(async () => {
  await server?.close();
});

test('imported point-to-point roads are separate from racetracks and remain available', async () => {
  const { courses, roads, racetracks } = await server.ssrLoadModule('/src/courses.ts');
  assert.ok(roads.length > 0);
  for (const road of roads) {
    assert.equal(road.closed, false);
    assert.ok(courses.includes(road));
    assert.ok(!racetracks.some(({ id }) => id === road.id));
  }
  for (const track of racetracks) {
    assert.notEqual(track.closed, false);
    assert.ok(courses.includes(track));
  }
});

test('open routes retain endpoints, reverse direction, and do not close previews', () => {
  const route = courseRoute(definition);
  assert.ok(route.getLength() > Math.hypot(100, 100) && route.getLength() < 200);
  assert.deepEqual(route.getPointAt(0).toArray(), [0, 0, 0]);
  assert.deepEqual(route.getPointAt(1).toArray(), [100, 0, 100]);
  assert.equal(courseProfileHeight([0, 50, 100], 1, false), 100);
  const svg = coursePreviewSvg(definition);
  assert.ok(!svg.match(/<path d="([^"]+)"/)[1].includes('Z'));
  assert.equal((svg.match(/stroke-dasharray=/g) ?? []).length, 2);
});

test('open roads grid every car on pavement behind a start line inset from the road end', () => {
  for (const reverse of [false, true]) {
    const directed = { ...definition, reverse };
    const route = courseRoute(directed);
    const length = route.getLength();
    const line = route.getPointAt(openRoadLineDistance / length);
    const forward = route.getTangentAt(openRoadLineDistance / length);
    const roadStart = route.getPointAt(0);
    // The player takes the slot after every bot.
    for (let slot = 0; slot <= maxRaceBots; slot++) {
      const [x, z] = raceGridSpawn(directed, slot).position;
      const behindLine = (line.x - x) * forward.x + (line.z - z) * forward.z;
      assert.ok(behindLine > 0, 'grid starts behind the start line');
      assert.ok(Math.hypot(x - roadStart.x, z - roadStart.z) > 5, 'grid stays on pavement');
    }
  }
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
  for (const reverse of [false, true]) {
    const directed = { ...definition, reverse };
    const route = courseRoute(directed);
    const t = 1 - openRoadLineDistance / route.getLength();
    const finish = route.getPointAt(t);
    const forward = route.getTangentAt(t);
    const start = route.getPointAt(0);
    const timer = new LapTimer(directed);
    timer.reset(start);
    assert.equal(timer.lap, 1);
    timer.update(start, 30, [start], true);
    assert.equal(timer.elapsedTime, 0);
    const before = finish.clone().addScaledVector(forward, -10);
    timer.update(before, 9, [before]);
    assert.equal(timer.finished, false, 'the road end is beyond the finish line');
    timer.update(finish.clone().addScaledVector(forward, 10), 2, [finish]);
    assert.equal(timer.finished, true);
    assert.equal(timer.lap, 1);
    assert.ok(Math.abs(timer.last - 10) < 1e-6);
    timer.update(start, 20, [start]);
    assert.ok(Math.abs(timer.current - 10) < 1e-6);
    timer.reset(start);
    assert.equal(timer.finished, false);
    assert.equal(timer.last, null);
  }
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
  assert.equal(convertTrack(source).shoulderWidth, undefined);
  assert.equal(convertTrack(source, { shoulderWidth: 0 }).shoulderWidth, 0);
  assert.equal(convertTrack(source, { shoulderWidth: 0.5 }).shoulderWidth, 0.5);
  for (const shoulderWidth of [-1, NaN, Infinity])
    assert.throws(() => convertTrack(source, { shoulderWidth }), /--shoulder-width/);
  assert.equal(convertTrack(source, { terrainTransition: 6 }).terrainTransition, 6);
  for (const terrainTransition of [0, -1, NaN, Infinity])
    assert.throws(() => convertTrack(source, { terrainTransition }), /--terrain-transition/);
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
  const route = courseRoute(imported);
  const center = route.getPointAt(0.5),
    tangent = route.getTangentAt(0.5);
  const branch = [center.x + tangent.z * 40, center.z - tangent.x * 40];
  const course = createCourse(
    scene,
    {
      ...imported,
      flat: true,
      scenery: {
        version: 1,
        buildings: [],
        water: [],
        waterways: [],
        vegetation: [],
        roads: [{ points: [[center.x, center.z], branch], width: 6 }],
      },
    },
    1.8,
  );
  try {
    let masked = 0;
    scene.traverse((mesh) => {
      if (!mesh.isMesh || !mesh.geometry.hasAttribute('junction')) return;
      const mask = mesh.geometry.getAttribute('junction');
      if (!mask.array.some((value) => value < 0)) return;
      masked++;
      const shader = {
        uniforms: {},
        vertexShader: '#include <common>\n#include <begin_vertex>',
        fragmentShader: '#include <common>\n#include <alphatest_fragment>',
      };
      mesh.material.onBeforeCompile(shader, {});
      assert.ok(shader.fragmentShader.includes('junctionsVisible'));
      course.setScenery({
        showBuildings: true,
        showWater: true,
        showVegetation: true,
        showNearbyRoads: false,
      });
      assert.equal(
        shader.uniforms.junctionsVisible.value,
        0,
        'hiding side roads restores the original shoulder, edge paint and grass',
      );
      course.setScenery({
        showBuildings: true,
        showWater: true,
        showVegetation: true,
        showNearbyRoads: true,
      });
      assert.equal(shader.uniforms.junctionsVisible.value, 1);
    });
    assert.ok(masked > 0, 'junctions interrupt roadside geometry');
  } finally {
    course.dispose();
  }
  const { MeshStandardMaterial, Texture, TextureLoader } = await import('three');
  const { loadTerrainSurfaces, addNearbyRoadDirt } = await server.ssrLoadModule('/src/surfaces.ts');
  const loadAsync = TextureLoader.prototype.loadAsync;
  const textures = [];
  TextureLoader.prototype.loadAsync = async () => {
    const texture = new Texture();
    textures.push(texture);
    return texture;
  };
  try {
    await loadTerrainSurfaces();
  } finally {
    TextureLoader.prototype.loadAsync = loadAsync;
  }
  t.after(() => textures.forEach((texture) => texture.dispose()));
  for (const shoulder of [0.2, 2]) {
    const soil = new MeshStandardMaterial();
    try {
      assert.ok(addNearbyRoadDirt(soil, { value: 1 }, shoulder));
      assert.ok(Number(soil.defines.DIRT_HANDOFF) <= shoulder);
      const shader = {
        uniforms: {},
        vertexShader: '#include <common>\n#include <begin_vertex>',
        fragmentShader: '#include <common>\n#include <map_fragment>\n#include <alphatest_fragment>',
      };
      soil.onBeforeCompile(shader, {});
      assert.ok(
        shader.fragmentShader.includes('smoothstep(-DIRT_HANDOFF, 0.0, vMainRoad)'),
        'side soil finishes its fade at the shoulder instead of beyond the main soil overlay',
      );
    } finally {
      soil.dispose();
    }
  }
  const structures = [
    { type: 'bridge', start: 0.213, end: 0.387 },
    { type: 'tunnel', start: 0.601, end: 0.79 },
  ];
  const structured = createCourse(
    scene,
    {
      ...imported,
      flat: true,
      points: [
        [0, -100],
        [0, 100],
      ],
      structures,
    },
    1.8,
  );
  try {
    let marked = 0;
    scene.traverse((object) => {
      const structure = object.geometry?.getAttribute('structure');
      if (!structure) return;
      const positions = object.geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        const fraction = (positions.getZ(i) + 100) / 200;
        const inside = structures.some(
          ({ start, end }) => fraction > start + 0.01 && fraction < end - 0.01,
        );
        const outside = structures.every(
          ({ start, end }) => fraction < start - 0.01 || fraction > end + 0.01,
        );
        if (inside) marked++;
        if (inside || outside)
          assert.equal(
            structure.getX(i),
            inside ? 1 : 0,
            'dirt spill stops at bridges and tunnels',
          );
      }
    });
    assert.ok(marked > 0, 'structure spans are marked on the road surfaces');
  } finally {
    structured.dispose();
  }
  await t.test(
    'gate paint follows mapped pavement and shares its dirt toggle after repositioning',
    () => {
      const close = (actual, expected, tolerance) =>
        assert.ok(Math.abs(actual - expected) < tolerance, `${actual} should equal ${expected}`);
      for (const overlay of [false, true]) {
        const roadWidth = 6;
        const definition = {
          ...imported,
          flat: true,
          points: [
            [0, -100],
            [0, 100],
          ],
          ...(overlay
            ? {
                scenery: {
                  version: 1,
                  bounds: { minX: -20, maxX: 20, minZ: -120, maxZ: 120 },
                  buildings: [],
                  water: [],
                  waterways: [],
                  vegetation: [],
                  roads: [
                    {
                      points: [
                        [1, -100],
                        [3, 100],
                      ],
                      width: roadWidth,
                    },
                    {
                      points: [
                        [-12, -40],
                        [12, -40],
                      ],
                      width: 8,
                    },
                  ],
                },
              }
            : {}),
        };
        const course = createCourse(scene, definition, 1.8);
        try {
          for (const gates of [
            { start: 60, finish: 140 },
            { start: 70, finish: 150 },
          ]) {
            course.setGates({ start: gates.start / 200, finish: gates.finish / 200 });
            const meshes = scene.getObjectByName('start-finish-lines').children;
            assert.equal(meshes.length, 4, 'two draws per line, not one per checker tile');
            const tangent = overlay
              ? { x: 1 / Math.hypot(1, 100), z: 100 / Math.hypot(1, 100) }
              : { x: 0, z: 1 };
            for (const [gate, distance] of Object.values(gates).entries()) {
              const z = distance - 100,
                x = overlay ? 2 + z / 100 : 0;
              const across = [],
                along = [];
              for (const mesh of meshes.slice(gate * 2, gate * 2 + 2)) {
                const positions = mesh.geometry.getAttribute('position');
                for (let i = 0; i < positions.count; i++) {
                  const dx = positions.getX(i) - x,
                    dz = positions.getZ(i) - z;
                  across.push(dx * tangent.z - dz * tangent.x);
                  along.push(dx * tangent.x + dz * tangent.z);
                  close(positions.getY(i), overlay ? 0.09 : 0.02, 1e-5);
                }
                assert.ok(mesh.geometry.hasAttribute('structure'));
                if (overlay) assert.ok(mesh.geometry.hasAttribute('mainRoad'));
                const shader = {
                  uniforms: {},
                  vertexShader: '#include <common>\n#include <begin_vertex>',
                  fragmentShader:
                    '#include <common>\n#include <map_fragment>\n#include <alphatest_fragment>',
                };
                mesh.material.onBeforeCompile(shader, {});
                assert.ok(shader.uniforms.roadDirtVisible);
                course.setRoadEdgeDirt(false);
                assert.equal(shader.uniforms.roadDirtVisible.value, 0);
                course.setRoadEdgeDirt(true);
                assert.equal(shader.uniforms.roadDirtVisible.value, 1);
              }
              const width = overlay ? roadWidth : definition.width;
              close(Math.min(...across), -width / 2, 1e-5);
              close(Math.max(...across), width / 2, 1e-5);
              close(Math.min(...along), -0.5, 1e-5);
              close(Math.max(...along), 0.5, 1e-5);
            }
          }
        } finally {
          course.dispose();
        }
      }
    },
  );
});

test('real driver recordings and open-road gates trim to the stretch both cover', async () => {
  const { trimRealDriver } = await server.ssrLoadModule('/src/real-driver.ts');
  const { courseGateDistances } = await server.ssrLoadModule('/src/courses.ts');
  const straight = {
    ...definition,
    points: [
      [0, 0],
      [0, 200],
      [0, 400],
    ],
  };
  const length = courseRoute(straight).getLength();
  // One meter every 0.1 s between two directed distances.
  const drive = (from, to, reverse = false) => ({
    source: 'test',
    reverse,
    interval: 0.1,
    progress: Array.from({ length: to - from + 1 }, (_, i) => {
      const fraction = (from + i) / length;
      return reverse ? 1 - fraction : fraction;
    }),
  });
  const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual}`);
  const cases = [
    // Inside the map: the gates move to the recording's ends.
    { data: drive(100, 300), gates: [100, 300], trims: true },
    // Beyond both map gates: the recording is cut to them.
    {
      data: drive(0, 400),
      gates: [openRoadLineDistance, length - openRoadLineDistance],
      trims: false,
    },
    // Reverse, starting before the map's start and ending inside it.
    { data: drive(0, 200, true), gates: [openRoadLineDistance, 200], trims: true },
  ];
  for (const { data, gates, trims } of cases) {
    const trimmed = trimRealDriver(straight, data);
    const course = { ...straight, reverse: data.reverse, gates: trimmed.gates };
    const [start, finish] = courseGateDistances(course, length);
    close(start, gates[0]);
    close(finish, gates[1]);
    assert.equal(trimmed.trimsCourse, trims);
    close(trimmed.duration, (gates[1] - gates[0]) * 0.1);
    close(trimmed.progress[0], data.reverse ? 1 - gates[0] / length : gates[0] / length);
  }
  assert.equal(trimRealDriver(straight, drive(0, 40)), null);
});

test('real driver position, heading, and glowing line share the optimized racing line', async () => {
  const { trimRealDriver, realDriverLap, realDriverPath, createRealDriverLine } =
    await server.ssrLoadModule('/src/real-driver.ts');
  const { createReplayFrame } = await server.ssrLoadModule('/src/lap-recording.ts');
  const { Mesh, Vector3 } = await server.ssrLoadModule('three');
  const straight = {
    ...definition,
    width: 8,
    points: [
      [0, 0],
      [0, 200],
      [0, 400],
    ],
  };
  const centers = [-1, 1].flatMap((x) => [-1, 1].map((z) => new Vector3(x, 0, z)));
  const geometry = { centers, radii: centers.map(() => 0.3) };
  for (const reverse of [false, true]) {
    const data = trimRealDriver(straight, {
      source: 'test',
      reverse,
      interval: 1,
      progress: reverse ? [0.75, 0.5, 0.25] : [0.25, 0.5, 0.75],
      // Old imported sensor fields must not affect the racing line.
      offset: [-3, -2, -1],
      heading: [Math.PI / 2, Math.PI / 2, Math.PI / 2],
    });
    const path = realDriverPath(straight, reverse);
    const frame = createReplayFrame();
    realDriverLap(straight, data, () => 0, geometry).read(1, frame);
    const point = path.pointAt(0.5, new Vector3());
    assert.ok(Math.abs(frame.position.x - point.x) < 1e-5);
    assert.ok(Math.abs(frame.position.z - point.z) < 1e-5);
    assert.ok(
      Math.abs(point.x - (reverse ? 2 : -2)) < 1e-5,
      'uses directional lane, not sensor offset',
    );
    const direction = path.tangentAt(0.5, new Vector3()).multiplyScalar(reverse ? -1 : 1);
    const forward = new Vector3(0, 0, 1).applyQuaternion(frame.quaternion);
    assert.ok(
      forward.distanceTo(direction) < 1e-5,
      'points along actual motion, not independent yaw',
    );
    let called = false;
    const line = createRealDriverLine(
      (offsetAt, width, lift, material, from, to, relative) => {
        called = true;
        assert.equal(offsetAt(0.5), path.offsetAt(0.5));
        assert.equal(offsetAt(0.625), path.offsetAt(0.625));
        assert.equal(relative, true);
        assert.ok(Math.abs(from - 0.25) < 1e-6);
        assert.ok(Math.abs(to - 0.75) < 1e-6);
        return new Mesh(undefined, material);
      },
      straight,
      data,
    );
    assert.ok(called);
    line.geometry.dispose();
    line.material.dispose();
  }
});

test('open racing-line optimization smooths corners within bounds without joining endpoints', async () => {
  const { optimizeRacingLine, racingLinePath } = await server.ssrLoadModule('/src/racing-line.ts');
  const route = courseRoute(definition);
  const count = Math.max(5, Math.ceil(route.getLength() / 5));
  const centers = Array.from({ length: count }, (_, i) => route.getPointAt(i / (count - 1)));
  const limit = definition.width / 2 - 1;
  const points = optimizeRacingLine(centers, limit, false);
  assert.ok(points[0].distanceTo(centers[0]) < 1e-6);
  assert.ok(points.at(-1).distanceTo(centers.at(-1)) < 1e-6);
  const cost = (samples) =>
    samples.slice(1, -1).reduce(
      (sum, point, j) =>
        sum +
        point
          .clone()
          .multiplyScalar(-2)
          .add(samples[j])
          .add(samples[j + 2])
          .lengthSq(),
      0,
    );
  assert.ok(cost(points) < cost(centers), 'reduces curvature cost');
  assert.ok(points.every((point, i) => point.distanceTo(centers[i]) <= limit + 1e-6));
  const path = racingLinePath(definition, 'full');
  assert.equal(racingLinePath(definition, 'full'), path, 'optimization is cached');
  let maxOffset = 0;
  for (let i = 0; i < count; i++) {
    const fraction = i / (count - 1);
    const point = path.pointAt(fraction, new Vector3());
    maxOffset = Math.max(maxOffset, Math.abs(path.offsetAt(fraction)));
    assert.ok(point.distanceTo(centers[i]) <= limit + 1e-6);
  }
  assert.ok(maxOffset > 0.1, 'follows a racing line rather than a fixed road-center offset');
});

test('racing-line paths have smooth bounded offsets in both lanes and across a closed seam', async () => {
  const { racingLinePath } = await server.ssrLoadModule('/src/racing-line.ts');
  for (const closed of [false, true]) {
    const course = {
      ...definition,
      width: 8,
      closed,
      points: closed
        ? [
            [0, 0],
            [100, 0],
            [100, 100],
            [0, 100],
          ]
        : definition.points,
    };
    const route = courseRoute(course);
    const count = Math.max(5, Math.ceil(route.getLength() / 5));
    const divisions = closed ? count : count - 1;
    for (const mode of ['full', 'lane']) {
      for (const reverse of [false, true]) {
        const path = racingLinePath(course, mode, reverse);
        const center = mode === 'full' ? 0 : reverse ? 2 : -2;
        const limit = mode === 'full' ? 3 : 1;
        for (let i = 0; i <= 2000; i++) {
          assert.ok(Math.abs(path.offsetAt(i / 2000) - center) <= limit + 1e-6);
        }
        const sample = (u) =>
          path.offsetAt(closed ? (((u / divisions) % 1) + 1) % 1 : u / divisions);
        const h = 0.001;
        for (let i = closed ? 0 : 1; i < (closed ? count : count - 1); i++) {
          const value = sample(i);
          const leftSlope = (value - sample(i - h)) / h;
          const rightSlope = (sample(i + h) - value) / h;
          assert.ok(Math.abs(leftSlope - rightSlope) < 0.01, 'continuous offset slope');
          const leftCurve = (value - 2 * sample(i - h) + sample(i - 2 * h)) / h ** 2;
          const rightCurve = (sample(i + 2 * h) - 2 * sample(i + h) + value) / h ** 2;
          assert.ok(Math.abs(leftCurve - rightCurve) < 0.03, 'continuous offset curvature');
        }
        if (!closed) {
          assert.ok(Math.abs(path.offsetAt(0) - center) < 1e-6);
          assert.ok(Math.abs(path.offsetAt(1) - center) < 1e-6);
        }
      }
    }
  }
});

test('open-road grip bots target the smooth optimized path with their vehicle clearance', async () => {
  const { createDrivingMap } = await server.ssrLoadModule('/src/race-bot.ts');
  const { racingLinePath } = await server.ssrLoadModule('/src/racing-line.ts');
  const terrain = { heightAt: () => 0, normalAt: () => new Vector3(0, 1, 0) };
  const halfWidth = 0.9;
  const edgeMargin = 0.4;
  for (const reverse of [false, true]) {
    const course = { ...definition, reverse };
    const map = createDrivingMap(course, terrain, halfWidth, edgeMargin);
    const path = racingLinePath(course, 'full', reverse, halfWidth + edgeMargin);
    let deviation = 0;
    for (let i = 0; i < map.samples.length; i++) {
      const fraction = i / (map.samples.length - 1);
      const point = path.pointAt(reverse ? 1 - fraction : fraction, new Vector3());
      assert.ok(Math.hypot(map.samples[i].x - point.x, map.samples[i].z - point.z) < 1e-6);
      const distance = Math.hypot(point.x - map.centers[i].x, point.z - map.centers[i].z);
      assert.ok(distance <= course.width / 2 - halfWidth - edgeMargin + 1e-6);
      deviation = Math.max(deviation, distance);
    }
    assert.ok(deviation > 0.1, 'does not bypass optimization for open roads');
  }
});
