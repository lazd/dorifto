import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import { createServer } from 'vite';
import * as THREE from 'three';
import AmmoFactory from 'ammojs-typed';

let server;
let createScenery;
let smoothSceneryLine;
let joinSceneryRoads;
let normalizeCourseScenery;
let PavementSurface;
let nearbyBridgeClearance;
let nearbyRoadLift;
let sceneryRoadProfiles;
let validateCourseScenery;
const groups = [];
before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  ({ createScenery } = await server.ssrLoadModule('/src/scenery.ts'));
  ({ smoothSceneryLine, joinSceneryRoads, normalizeCourseScenery } =
    await server.ssrLoadModule('/src/scenery-data.ts'));
  ({ PavementSurface } = await server.ssrLoadModule('/src/terrain-query.ts'));
  ({ nearbyBridgeClearance, nearbyRoadLift, sceneryRoadProfiles } =
    await server.ssrLoadModule('/src/scenery-roads.ts'));
  ({ validateCourseScenery } = await server.ssrLoadModule('/src/scenery-data.ts'));
});
after(async () => server?.close());
afterEach(() => {
  const resources = new Set();
  for (const group of groups.splice(0))
    group.traverse((object) => {
      if (!object.isMesh) return;
      resources.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material])
        resources.add(material);
    });
  for (const resource of resources) resource.dispose();
});

const square = (x0, z0, x1, z1) => [
  [x0, z0],
  [x1, z0],
  [x1, z1],
  [x0, z1],
  [x0, z0],
];
const emptyScenery = () => ({
  version: 1,
  buildings: [],
  water: [],
  waterways: [],
  vegetation: [],
  roads: [],
});
const definition = (scenery = emptyScenery()) => ({
  id: 'scenery-test',
  name: 'Scenery test',
  width: 8,
  shoulderWidth: 1,
  points: [
    [0, -100],
    [0, 100],
  ],
  closed: false,
  scenery,
});

function terrain(ground = () => 0, road = ground) {
  const spacing = 2,
    columns = 101,
    rows = 121,
    minX = -100,
    minZ = -120;
  const heights = Float32Array.from({ length: columns * rows }, (_, i) =>
    ground(minX + (i % columns) * spacing, minZ + Math.floor(i / columns) * spacing),
  );
  const query = {
    spacing,
    columns,
    rows,
    minX,
    minZ,
    heights,
    minHeight: -20,
    maxHeight: 40,
    segments: [{ a: { x: 0, z: -100 }, b: { x: 0, z: 100 }, bank: 0 }],
    halfWidth: 5,
  };
  return {
    groundHeightAt: ground,
    heightAt: road,
    physicsData: () => query,
    contains: (x, z) => x >= -100 && x < 100 && z >= -120 && z < 120,
  };
}
function build(course, ground, options) {
  const scenery = createScenery(
    { ...course, scenery: course.scenery && normalizeCourseScenery(course.scenery) },
    ground,
    options,
  );
  groups.push(scenery.group);
  scenery.group.updateMatrixWorld(true);
  return scenery;
}

test('nearby roads share vertices and smooth normals and have locally culled bounds', () => {
  const data = emptyScenery();
  data.roads.push({
    points: [
      [30, -110],
      [30, 110],
    ],
    width: 6,
  });

  const result = build(
    definition(data),
    terrain((x, z) => Math.sin(z / 14) * 2),
  );
  const meshes = result.group.getObjectByName('nearbyRoads').children;
  assert.ok(meshes.length >= 2, 'long ribbons are split into spatial chunks');
  for (const mesh of meshes) {
    const geometry = mesh.geometry;
    const positions = geometry.getAttribute('position');
    const uv = geometry.getAttribute('uv');
    assert.equal(uv.count, positions.count);
    for (let i = 0; i < uv.count; i++) {
      assert.ok(Math.abs(uv.getX(i) - positions.getX(i) / 5) < 1e-5);
      assert.ok(Math.abs(uv.getY(i) - positions.getZ(i) / 5) < 1e-5);
    }
    assert.ok(geometry.index, 'terrain intersections reuse shared vertices');
    assert.ok(geometry.attributes.position.count < geometry.index.count / 2);
    const normals = geometry.getAttribute('normal');
    assert.ok(
      Array.from({ length: geometry.index.count / 3 }, (_, i) => {
        const a = geometry.index.getX(i * 3),
          b = geometry.index.getX(i * 3 + 1);
        return Math.abs(normals.getZ(a) - normals.getZ(b)) > 1e-4;
      }).some(Boolean),
      'slope changes interpolate normals rather than shading each panel flat',
    );
    geometry.computeBoundingBox();
    assert.ok(
      geometry.boundingBox.getSize(new THREE.Vector3()).z < 150,
      'each chunk can be culled independently',
    );
  }
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 40);
  camera.position.set(30, 4, -110);
  camera.lookAt(30, 0, 0);
  camera.updateMatrixWorld(true);
  const frustum = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
  );
  assert.ok(
    meshes.some((mesh) => !frustum.intersectsObject(mesh)),
    'off-screen road sections are rejected by the renderer frustum',
  );
});

test('road and river bends share continuous full-width joins without overlapping panels', () => {
  const points = [
    [30, -60],
    [30, 0],
    [30, 0],
    [70, 0],
    [70, 60],
  ];
  for (const river of [false, true])
    for (const reverse of [false, true]) {
      const data = emptyScenery();
      data[river ? 'waterways' : 'roads'].push({
        points: reverse ? points.toReversed() : points,
        width: 8,
      });
      const result = build(definition(data), terrain());
      const layer = result.group.getObjectByName(river ? 'water' : 'nearbyRoads');
      const ray = new THREE.Raycaster();
      for (const [x, z] of [
        ...(river
          ? [
              [27, 3],
              [73, -3],
            ]
          : [
              [31, -1],
              [69, 1],
            ]),
        [30, -20],
        [50, 0],
        [70, 30],
      ]) {
        ray.set(new THREE.Vector3(x, 10, z), new THREE.Vector3(0, -1, 0));
        assert.ok(
          ray.intersectObject(layer).length,
          'outer corners and straight sections remain covered in either direction',
        );
      }
      let area = 0;
      layer.traverse((mesh) => {
        if (!mesh.isMesh) return;
        const positions = mesh.geometry.getAttribute('position');
        const indices = mesh.geometry.index;
        for (let i = 0; i < indices.count; i += 3) {
          const [a, b, c] = [0, 1, 2].map((j) =>
            new THREE.Vector3().fromBufferAttribute(positions, indices.getX(i + j)),
          );
          area += Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)) / 2;
        }
      });
      assert.ok(
        river ? Math.abs(area - 160 * 8) < 0.01 : area > 160 * 8 * 0.9 && area < 160 * 8,
        'joined strips cover the road once, without bend overlaps or gaps',
      );
    }
});

test('road smoothing rounds corners locally, preserves endpoints and is direction-independent', () => {
  const points = [
    [30, -60],
    [30, 0],
    [70, 0],
    [70, 60],
  ];
  const smooth = smoothSceneryLine(points, 8);
  assert.deepEqual(smooth[0], points[0]);
  assert.deepEqual(smooth.at(-1), points.at(-1));
  assert.ok(smooth.length > points.length);
  const reverse = smoothSceneryLine(points.toReversed(), 8).toReversed();
  smooth.forEach((p, i) => {
    assert.ok(Math.hypot(p[0] - reverse[i][0], p[1] - reverse[i][1]) < 1e-10);
  });
  let maxBend = 0;
  for (let i = 1; i < smooth.length - 1; i++) {
    const a = new THREE.Vector2(...smooth[i]).sub(new THREE.Vector2(...smooth[i - 1])).normalize();
    const b = new THREE.Vector2(...smooth[i + 1]).sub(new THREE.Vector2(...smooth[i])).normalize();
    maxBend = Math.max(maxBend, Math.acos(Math.min(1, a.dot(b))));
  }
  assert.ok(maxBend < Math.PI / 12, 'a right-angle corner becomes gentle sampled turns');
});

test('side-road junctions meet pavement and expose a shoulder coverage mask', () => {
  const data = emptyScenery();
  data.roads.push({
    points: [
      [0, 0],
      [60, 0],
    ],
    width: 6,
  });
  const result = build(definition(data), terrain(), {
    createRoadDirtMaterial: () => new THREE.MeshStandardMaterial(),
  });
  const dirt = result.group.getObjectByName('nearby-road-dirt');
  const dirtPositions = dirt.geometry.getAttribute('position');
  const handoff = dirt.geometry.getAttribute('mainRoad');
  for (let i = 0; i < handoff.count; i++) {
    if (Math.abs(dirtPositions.getX(i)) > 10) continue;
    assert.ok(
      Math.abs(handoff.getX(i) - (Math.abs(dirtPositions.getX(i)) - 5)) < 1e-5,
      'side-road dirt hands off at the outer shoulder, not the white line',
    );
  }
  const layer = result.group.getObjectByName('nearbyRoads');
  const ray = new THREE.Raycaster();
  for (const x of [3.6, 4, 5, 6, 8, 12, 30, 59]) {
    ray.set(new THREE.Vector3(x, 10, 0.3), new THREE.Vector3(0, -1, 0));
    assert.ok(ray.intersectObject(layer).length, 'no dropped panel between road and shoulder');
    assert.equal(result.roadCoverage(x, 0), 1);
  }
  assert.equal(result.roadCoverage(8, 8), 0, 'dirt away from the mouth is untouched');
  assert.ok(
    result.roadDistance(-4, 0, true) > 0,
    'the branch endpoint does not erase dirt on the opposite side of the main road',
  );
  assert.ok(
    result.roadDistance(6, 4.8, true) > 0,
    'the dirt transition stays outside the actual widened pavement edge',
  );
  for (const sign of [-1, 1]) {
    assert.equal(
      result.isAsphalt({ x: 6, z: sign * 4.3 }),
      true,
      'turning radius widens the pavement beyond the straight branch edge',
    );
    assert.equal(
      result.isAsphalt({ x: 12, z: sign * 3.2 }),
      false,
      'pavement returns to the mapped branch width past the turn',
    );
    assert.ok(
      result.roadDistance(6, sign * 4.3, true) < 0,
      'paint and dirt masks follow the widened mouth',
    );
  }
  const workerSurface = new PavementSurface(structuredClone(result.roadMesh));
  for (const [position, paved] of [
    [{ x: 30, y: 0.4, z: 0 }, true],
    [{ x: 30, y: 0.4, z: 3.2 }, false],
    [{ x: 61, y: 0.4, z: 0 }, false],
    [{ x: 30, y: 20, z: 0 }, false],
  ]) {
    assert.equal(result.isAsphalt(position), paved);
    assert.equal(
      workerSurface.isAsphalt(position),
      paved,
      'worker uses the same rendered footprint',
    );
  }
  assert.ok(result.roadDistance(8, 2.8) < 0);
  assert.ok(result.roadDistance(12, 3.2) > 0);
  result.setVisible('nearbyRoads', false);
  assert.equal(result.isAsphalt({ x: 30, z: 0 }), false, 'hidden roads restore terrain traction');
  assert.ok(result.junctionCones.length > 0, 'joined pavement retains junction barriers');
});

test('road fragments are joined before smoothing, without joining branches or mutating saved data', () => {
  const roads = [
    {
      points: [
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
  ];
  const saved = structuredClone(roads);
  const joined = joinSceneryRoads(roads);
  assert.equal(joined.length, 1);
  assert.deepEqual(joined[0].points, [
    [30, -40],
    [30, 0],
    [70, 0],
  ]);
  assert.deepEqual(roads, saved);
  const whole = smoothSceneryLine(joined[0].points, 6);
  assert.ok(
    whole.some(([x, z]) => x > 30 && z < 0),
    'rounding crosses the former fragment seam',
  );
  roads.push({
    points: [
      [30, 0],
      [30, 40],
    ],
    width: 6,
  });
  assert.equal(joinSceneryRoads(roads).length, 3, 'a real junction remains separate branches');
});

test('width changes share an edge cross-section and dirt verges remain batched and optional', () => {
  const data = emptyScenery();
  data.roads.push(
    {
      points: [
        [30, -40],
        [30, 0],
      ],
      width: 4,
    },
    {
      points: [
        [30, 0],
        [30, 40],
      ],
      width: 6,
    },
  );
  const result = build(definition(data), terrain(), {
    createRoadDirtMaterial: () => new THREE.MeshStandardMaterial(),
  });
  for (const z of [-0.05, 0, 0.05]) {
    assert.equal(result.isAsphalt({ x: 32.4, z }), true, 'both pieces meet at the average width');
    assert.equal(result.isAsphalt({ x: 32.6, z }), false, 'no abrupt wider rectangle at the seam');
  }
  assert.ok(Math.abs(result.roadDistance(32.5, 0)) < 1e-5);
  const dirt = result.group.getObjectByName('nearby-road-dirt');
  assert.ok(dirt);
  assert.ok(dirt.geometry.getAttribute('lateral').array.every(Number.isFinite));
  result.setRoadEdgeDirt(false);
  assert.equal(dirt.visible, false);
  assert.equal(result.group.getObjectByName('nearby-road-surfaces').visible, true);
  assert.equal(result.isAsphalt({ x: 30, z: 0 }), true);
  result.setRoadEdgeDirt(true);
  assert.equal(dirt.visible, true);
});

test('sloped building shells retain courtyards and share exact rendered collider triangles', () => {
  const data = emptyScenery();
  data.buildings.push({
    rings: [square(20, -20, 40, 0), square(26, -16, 34, -4)],
    height: 8,
  });
  const ground = (x, z) => x * 0.05 + z * 0.02;
  const result = build(definition(data), terrain(ground));
  const mesh = result.group.getObjectByName('building-shells');
  const collider = result.collisionMesh;
  assert.ok(collider);
  assert.strictEqual(collider.positions, mesh.geometry.getAttribute('position').array);
  assert.equal(collider.indices.length, collider.positions.length / 3);
  assert.ok(collider.positions.every(Number.isFinite));
  collider.indices.forEach((value, i) => assert.equal(value, i));
  let baseVertices = 0;
  for (let i = 0; i < collider.positions.length; i += 3) {
    const [x, y, z] = collider.positions.subarray(i, i + 3);
    if (y < 9) {
      assert.ok(Math.abs(y - (ground(x, z) - 0.15)) < 1e-5);
      baseVertices++;
    }
  }
  assert.ok(baseVertices > 20, 'walls follow subdivided terrain edges');
  const ray = new THREE.Raycaster(new THREE.Vector3(23, 30, -10), new THREE.Vector3(0, -1, 0));
  assert.ok(Math.abs(ray.intersectObject(mesh)[0].point.y - 10) < 1e-5);
  ray.ray.origin.set(30, 30, -10);
  assert.equal(ray.intersectObject(mesh).length, 0, 'courtyard has no roof');
  ray.ray.origin.set(10, 4, -10);
  ray.ray.direction.set(1, 0, 0);
  assert.ok(Math.abs(ray.intersectObject(mesh)[0].point.x - 20) < 1e-5, 'outer wall faces outward');
  assert.equal(mesh.castShadow, true);
  assert.equal(mesh.receiveShadow, true);
  assert.equal(mesh.material.shadowSide, THREE.BackSide);
});

test('vegetation is deterministic, bounded and clear of shoulders, buildings, water and nearby roads', () => {
  const data = emptyScenery();
  data.buildings.push({ rings: [square(20, -30, 40, -10)], height: 6 });
  data.water.push({ rings: [square(-50, -30, -20, -10)] });
  data.roads.push({
    points: [
      [10, 40],
      [80, 40],
    ],
    width: 6,
  });
  data.waterways.push({
    points: [
      [-80, 40],
      [-10, 40],
    ],
    width: 4,
  });
  data.vegetation.push(
    { rings: [square(-80, -80, 80, 80)], kind: 'trees' },
    { rings: [square(-80, -80, 80, 80)], kind: 'scrub' },
  );
  const course = definition(data);
  const first = build(course, terrain());
  const second = build({ ...course, reverse: true }, terrain());
  let plants = 0;
  for (const name of ['tree-crowns', 'shrubs']) {
    const mesh = first.group.getObjectByName(name);
    const repeat = second.group.getObjectByName(name);
    assert.ok(mesh.count > 30);
    assert.equal(mesh.material.flatShading, false, 'foliage uses interpolated smooth normals');
    assert.equal(mesh.material.vertexColors, true, 'foliage shading is baked into the shared mesh');
    assert.ok(mesh.geometry.getAttribute('color').array.every(Number.isFinite));
    assert.ok(mesh.geometry.index.count / 3 <= 160, 'each plant has a bounded geometry budget');
    assert.deepEqual(mesh.instanceMatrix.array, repeat.instanceMatrix.array);
    plants += mesh.count;
    const matrix = new THREE.Matrix4();
    const radius = name === 'tree-crowns' ? 2.8 : 1.4;
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      const { x, z } = new THREE.Vector3().setFromMatrixPosition(matrix);
      assert.ok(Math.abs(x) > 5 + radius);
      assert.ok(!(x > 20 - radius && x < 40 + radius && z > -30 && z < -10), 'building margin');
      assert.ok(!(x > -50 - radius && x < -20 + radius && z > -30 && z < -10), 'water margin');
      if (x > 10 && x < 80) assert.ok(Math.abs(z - 40) >= 3 + radius);
      if (x > -80 && x < -10) assert.ok(Math.abs(z - 40) >= 2 + radius);
    }
  }
  assert.ok(plants <= 4000);
  const steep = build(
    course,
    terrain((x) => x * 2),
  );
  assert.equal(
    steep.group.getObjectByName('vegetation').children.length,
    0,
    'steep slopes reject plants',
  );
});

test('branch mouth cones are deduplicated and never obstruct the selected paved shoulder', () => {
  const data = emptyScenery();
  data.roads.push(
    {
      points: [
        [0, 0],
        [40, 0],
      ],
      width: 6,
    },
    {
      points: [
        [40, 0],
        [0, 0],
      ],
      width: 6,
    },
    {
      points: [
        [0, -80],
        [0, 80],
      ],
      width: 8,
    },
  );
  const result = build(definition(data), terrain());
  assert.ok(result.junctionCones.length >= 4 && result.junctionCones.length <= 6);
  for (const p of result.junctionCones) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z));
    assert.ok(p.x > 5.65 && p.x < 15);
    assert.ok(Math.abs(p.z) <= 3);
  }
  for (let i = 0; i < result.junctionCones.length; i++)
    for (let j = i + 1; j < result.junctionCones.length; j++)
      assert.ok(
        Math.hypot(
          result.junctionCones[i].x - result.junctionCones[j].x,
          result.junctionCones[i].z - result.junctionCones[j].z,
        ) >= 1.2,
      );
  const selectedOnly = emptyScenery();
  selectedOnly.roads.push(data.roads[2]);
  const duplicate = build(definition(selectedOnly), terrain());
  assert.equal(duplicate.group.getObjectByName('nearbyRoads').children.length, 0);
  assert.equal(duplicate.junctionCones.length, 0);
});

test('selected road copies and parallel carriageways are omitted on bridges and ground-level approaches', () => {
  for (const height of [0, 80]) {
    for (const reverse of [false, true]) {
      const data = emptyScenery();
      for (const x of [1, 9]) {
        const points = [
          [x, -90],
          [x, 90],
        ];
        data.roads.push({ points: reverse ? points.toReversed() : points, width: 8 });
      }
      const result = build(
        definition(data),
        terrain(
          () => 0,
          () => height,
        ),
        { createRoadDirtMaterial: () => new THREE.MeshStandardMaterial() },
      );
      assert.equal(
        result.group.getObjectByName('nearbyRoads').children.length,
        0,
        'copies leave neither asphalt nor dirt on bridges or their approaches',
      );
      assert.equal(result.junctionCones.length, 0);
    }
  }
});

test('water stays shallow and level; waterways and crossing roads drape below elevated selected roads', () => {
  const data = emptyScenery();
  data.water.push({ rings: [square(-40, -40, 40, -20)] });
  data.waterways.push({
    points: [
      [-60, 30],
      [60, 30],
    ],
    width: 4,
  });
  data.roads.push({
    points: [
      [-60, 60],
      [60, 60],
    ],
    width: 6,
  });
  const atGrade = build(definition(data), terrain());
  const pond = atGrade.group.getObjectByName('shallow-water-surfaces');
  assert.ok(pond.geometry.getAttribute('position').count > 0);
  atGrade.group.getObjectByName('water').traverse((mesh) => {
    if (!mesh.isMesh) return;
    const positions = mesh.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      assert.ok(Math.abs(positions.getX(i)) > 5.7, 'water never floods selected pavement');
      assert.ok(positions.getY(i) > 0 && positions.getY(i) < 0.2);
    }
  });
  const elevated = build(
    definition(data),
    terrain(
      () => 0,
      () => 20,
    ),
  );
  assert.equal(elevated.junctionCones.length, 0, 'grade-separated crossings are not junctions');
  for (const name of ['draped-waterways', 'nearby-road-surfaces']) {
    const positions = elevated.group.getObjectByName(name).geometry.getAttribute('position');
    let beneath = false;
    for (let i = 0; i < positions.count; i++) {
      assert.ok(positions.getY(i) > 0 && positions.getY(i) < 0.2);
      if (Math.abs(positions.getX(i)) < 1) beneath = true;
    }
    assert.ok(beneath, 'ground ribbon continues beneath bridge instead of climbing deck');
  }
});

test('static scenery round-trips through ObjectLoader and category visibility only changes groups', () => {
  const data = emptyScenery();
  data.buildings.push({ rings: [square(20, 0, 30, 10)], height: 5 });
  data.vegetation.push({ rings: [square(-60, -60, -20, 60)], kind: 'trees' });
  const result = build(definition(data), terrain());
  const collider = result.collisionMesh;
  result.setVisible('buildings', false);
  assert.equal(result.group.getObjectByName('buildings').visible, false);
  assert.equal(result.group.getObjectByName('vegetation').visible, true);
  assert.strictEqual(result.collisionMesh, collider);
  const restored = new THREE.ObjectLoader().parse(result.group.toJSON());
  groups.push(restored);
  assert.equal(restored.getObjectByName('buildings').visible, false);
  assert.deepEqual(
    restored.getObjectByName('tree-crowns').instanceMatrix.array,
    result.group.getObjectByName('tree-crowns').instanceMatrix.array,
  );
  restored.traverse((mesh) => {
    if (!mesh.isMesh) return;
    assert.ok(mesh.geometry.getAttribute('position').array.every(Number.isFinite));
    if (mesh.isInstancedMesh) assert.ok(mesh.instanceMatrix.array.every(Number.isFinite));
  });
  const empty = build({ ...definition(), scenery: undefined }, terrain());
  assert.equal(empty.collisionMesh, undefined);
  assert.equal(empty.junctionCones.length, 0);
});

test('features beyond the supported terrain grid do not become floating scenery', () => {
  const data = emptyScenery();
  data.buildings.push({ rings: [square(95, 0, 110, 10)], height: 5 });
  data.water.push({ rings: [square(90, 20, 120, 40)] });
  data.roads.push({
    points: [
      [90, -20],
      [130, -20],
    ],
    width: 6,
  });

  data.vegetation.push({ rings: [square(90, -80, 130, -40)], kind: 'trees' });
  const result = build(definition(data), terrain());
  assert.equal(result.collisionMesh, undefined, 'partially unsupported building is omitted');
  for (const name of ['shallow-water-surfaces', 'nearby-road-surfaces']) {
    const positions = result.group.getObjectByName(name).geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      assert.ok(Number.isFinite(positions.getY(i)));
      assert.ok(positions.getX(i) <= 100);
    }
  }
  const plants = result.group.getObjectByName('tree-crowns');
  assert.ok(plants.count > 0);
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < plants.count; i++) {
    plants.getMatrixAt(i, matrix);
    assert.ok(new THREE.Vector3().setFromMatrixPosition(matrix).x < 98);
  }
});

test('road normalization preserves structure and layer boundaries and validates saved tags', () => {
  const data = emptyScenery();
  const fragment = (start, end, extra = {}) => ({
    points: [
      [start, 30],
      [end, 30],
    ],
    width: 8,
    ...extra,
  });
  data.roads = [
    fragment(-80, -40),
    fragment(-40, -20, { structure: 'bridge', layer: 1 }),
    fragment(-20, 0, { structure: 'bridge', layer: 1 }),
    fragment(0, 20, { structure: 'bridge', layer: 2 }),
    fragment(20, 40, { structure: 'tunnel', layer: -1 }),
  ];
  assert.equal(normalizeCourseScenery(data).roads.length, 4);
  validateCourseScenery(data);
  for (const extra of [{ structure: 'motorway' }, { layer: 1.5 }]) {
    assert.throws(
      () =>
        validateCourseScenery({
          ...data,
          roads: [fragment(0, 10, extra)],
        }),
      /Invalid saved course scenery/,
    );
  }
});

test('nearby overpasses clear the track, connect their approaches and never become junctions', () => {
  for (const approachHeight of [0, 12]) {
    const data = emptyScenery();
    data.roads = [
      {
        points: [
          [-90, 0],
          [-30, 0],
        ],
        width: 10,
      },
      {
        points: [
          [-30, 0],
          [30, 0],
        ],
        width: 10,
        structure: 'bridge',
        layer: 1,
      },
      {
        points: [
          [30, 0],
          [90, 0],
        ],
        width: 10,
      },
      {
        points: [
          [-80, 50],
          [80, 50],
        ],
        width: 10,
        structure: 'tunnel',
        layer: -1,
      },
    ];
    const ground = terrain((x) => (Math.abs(x) >= 29 ? approachHeight : 0));
    const result = build(definition(data), ground, {
      projectGroundGeometry(source) {
        const geometry = source.clone();
        const positions = geometry.getAttribute('position');
        for (let i = 0; i < positions.count; i++) {
          assert.ok(positions.getY(i) < 0.1, 'raised decks bypass ground projection');
          positions.setY(i, ground.groundHeightAt(positions.getX(i), positions.getZ(i)) + 0.035);
        }
        return geometry;
      },
    });
    const height = Math.max(approachHeight, nearbyBridgeClearance);
    assert.ok(result.structureMesh);
    assert.equal(result.junctionCones.length, 0);
    assert.equal(result.roadCoverage(0, 0), 0);
    assert.equal(result.roadDistance(0, 0, true), 3);
    assert.equal(result.isAsphalt({ x: 0, z: 0, y: 0 }), false);
    assert.equal(result.isAsphalt({ x: 0, z: 0, y: height }), true);
    assert.equal(result.isAsphalt({ x: 0, z: 50, y: 0 }), false, 'tunnel is not surface pavement');
    const ray = new THREE.Raycaster();
    const layer = result.group.getObjectByName('nearbyRoads');
    for (const x of [-30.01, -29.99, 0, 29.99, 30.01]) {
      ray.set(new THREE.Vector3(x, height + 3, 0), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObject(layer)[0];
      assert.ok(hit, 'the approaches and deck remain connected at both abutments');
      assert.ok(
        Math.abs(hit.point.y - height) < 0.05,
        `approach ${approachHeight}, x ${x}: ${hit.point.y} vs ${height} (${hit.object.name})`,
      );
    }
    ray.set(new THREE.Vector3(0, 1, -60), new THREE.Vector3(0, 0, 1));
    assert.equal(ray.intersectObject(layer).length, 0, 'no pier or tunnel portal blocks the track');
    result.setVisible('nearbyRoads', false);
    assert.equal(result.isAsphalt({ x: 0, z: 0, y: height }), false);
  }
});

test('nearby bridge collision supports the deck and underside without blocking the track, and can be hidden', async () => {
  const data = emptyScenery();
  data.roads = [
    {
      points: [
        [-60, 0],
        [60, 0],
      ],
      width: 10,
      structure: 'bridge',
      layer: 1,
    },
  ];
  const ground = terrain();
  const result = build(definition(data), ground);
  const { createPhysicsWorld, createPhysicsResources } =
    await server.ssrLoadModule('/src/physics-world.ts');
  const Ammo = await AmmoFactory.call({});
  const resources = createPhysicsResources(Ammo);
  const physics = createPhysicsWorld(Ammo, resources, {
    ...ground.physicsData(),
    nearbyStructureMesh: result.structureMesh,
  });
  const from = new Ammo.btVector3(),
    to = new Ammo.btVector3();
  const ray = (a, b) => {
    from.setValue(...a);
    to.setValue(...b);
    const callback = new Ammo.ClosestRayResultCallback(from, to);
    try {
      physics.world.rayTest(from, to, callback);
      if (callback.hasHit()) return callback.get_m_hitPointWorld().y();
    } finally {
      Ammo.destroy(callback);
    }
  };
  try {
    assert.ok(Math.abs(ray([0, 10, 0], [0, 4, 0]) - nearbyBridgeClearance - nearbyRoadLift) < 0.03);
    const { bridgeDimensions } = await server.ssrLoadModule('/src/bridges.ts');
    assert.ok(
      Math.abs(
        ray([0, 4, 0], [0, 10, 0]) -
          (nearbyBridgeClearance + nearbyRoadLift - bridgeDimensions.deckThickness),
      ) < 0.03,
    );
    assert.equal(ray([0, 1, -60], [0, 1, 60]), undefined);
    physics.setNearbyRoadsEnabled(false);
    assert.equal(ray([0, 10, 0], [0, 4, 0]), undefined);
    physics.setNearbyRoadsEnabled(true);
    assert.ok(ray([0, 10, 0], [0, 4, 0]) > 4);
  } finally {
    physics.dispose();
    Ammo.destroy(from);
    Ammo.destroy(to);
  }
});

test('highway approaches meet the full bridge width on sloping terrain and have grounded roadbeds', () => {
  const data = emptyScenery();
  data.roads = [
    {
      points: [
        [-90, 0],
        [-30, 0],
      ],
      width: 12,
      roadClass: 'trunk',
    },
    {
      points: [
        [-30, 0],
        [30, 0],
      ],
      width: 12,
      roadClass: 'trunk',
      structure: 'bridge',
      layer: 1,
    },
    {
      points: [
        [30, 0],
        [90, 0],
      ],
      width: 12,
      roadClass: 'trunk',
    },
    {
      points: [
        [50, 40],
        [80, 40],
      ],
      width: 6,
      roadClass: 'minor',
    },
  ];
  const ground = terrain((x, z) => (Math.abs(x) >= 25 ? 8 + z * 0.5 : 0));
  const course = definition(data);
  const profiles = sceneryRoadProfiles(
    data.roads,
    ground.groundHeightAt,
    () => 0,
    (x) => Math.abs(x) - 5,
    () => false,
  );
  assert.ok(profiles.filter((p) => p.road.roadClass === 'trunk').every((p) => p.raised));
  assert.equal(profiles.find((p) => p.road.roadClass === 'minor').raised, false);
  const bridge = profiles.find((p) => p.road.structure === 'bridge');
  for (const approach of profiles.filter((p) => p.bridgeApproach)) {
    const x = approach.points.some((p) => p[0] === -30) ? -30 : 30;
    for (const z of [-5, 0, 5])
      assert.ok(
        Math.abs(bridge.heightAt(x, z) - approach.heightAt(x, z)) < 1e-5,
        'bridge and approach cross-sections share a single elevation even without fallback lift',
      );
  }
  const result = build(course, ground);
  const layer = result.group.getObjectByName('nearbyRoads');
  assert.ok(layer.getObjectByName('nearby-road-embankments'));
  assert.ok(layer.getObjectByName('nearby-road-abutments'));
  assert.ok(layer.getObjectByName('nearby-road-edge-lines'));
  const ray = new THREE.Raycaster();
  for (const x of [-30.01, -29.99, 29.99, 30.01]) {
    for (const z of [-4, 0, 4]) {
      ray.set(new THREE.Vector3(x, 20, z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObject(layer)[0];
      assert.ok(hit, 'pavement covers the entire abutment');
      assert.ok(
        Math.abs(hit.point.y - bridge.heightAt(x, z)) < 0.05,
        `no floating edges or buried approach at ${x},${z}: ${hit.point.y} vs ${bridge.heightAt(x, z)} (${hit.object.name})`,
      );
    }
  }
  ray.set(new THREE.Vector3(-45, 20, -8), new THREE.Vector3(0, -1, 0));
  assert.ok(
    ray.intersectObject(layer.getObjectByName('nearby-road-embankments')).length,
    'the raised approach is supported outside its pavement edge',
  );
  const abutment = layer.getObjectByName('nearby-road-abutments').geometry.getAttribute('position');
  assert.ok(
    Array.from(
      { length: abutment.count },
      (_, i) => abutment.getY(i) - ground.groundHeightAt(abutment.getX(i), abutment.getZ(i)),
    ).some((d) => d < 0),
    'abutment walls extend into the terrain rather than floating',
  );
  const roadbeds = layer.children.filter((mesh) => mesh.name.startsWith('nearby-road-embankments'));
  for (const x of [-30, 30]) {
    for (const side of [-1, 1]) {
      let cap;
      for (const mesh of roadbeds) {
        const positions = mesh.geometry.getAttribute('position');
        for (let i = 0; i < positions.count; i += 3) {
          const vertices = [0, 1, 2].map((j) =>
            new THREE.Vector3().fromBufferAttribute(positions, i + j),
          );
          if (
            vertices.every((p) => Math.abs(p.x - x) < 1e-5) &&
            vertices.some((p) => p.z * side > 6.4) &&
            vertices.every((p) => p.z * side >= 6)
          ) {
            cap = vertices
              .reduce((center, p) => center.add(p), new THREE.Vector3())
              .divideScalar(3);
          }
        }
      }
      assert.ok(cap, 'both sides of each approach close against the abutment');
      ray.set(cap.clone().add(new THREE.Vector3(2, 0, 0)), new THREE.Vector3(-1, 0, 0));
      ray.far = 4;
      assert.ok(
        ray.intersectObjects(roadbeds).some((hit) => Math.abs(hit.point.x - x) < 1e-5),
        'looking from beneath the span cannot see through the roadbed end',
      );
    }
  }
  ray.far = Infinity;
  assert.equal(result.roadCoverage(0, 0), 0);
  assert.equal(result.junctionCones.length, 0);
  const junctionData = emptyScenery();
  junctionData.roads = [
    {
      points: [
        [-90, 40],
        [90, 40],
      ],
      width: 12,
      roadClass: 'primary',
    },
  ];
  const junction = build(
    definition(junctionData),
    terrain((x, z) => x * 0.05 + z * 0.01),
  );
  assert.ok(
    junction.roadCoverage(4.5, 40) > 0,
    'at-grade highways still blend into the track shoulder',
  );
  assert.ok(junction.isAsphalt({ x: 8, y: 0.8, z: 40 }));
  assert.ok(junction.junctionCones.length > 0, 'real highway intersections retain mouth barriers');
});
