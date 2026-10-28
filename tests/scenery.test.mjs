import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import { createServer } from 'vite';
import * as THREE from 'three';

let server;
let createScenery;
const groups = [];
before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  ({ createScenery } = await server.ssrLoadModule('/src/scenery.ts'));
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
function build(course, ground) {
  const scenery = createScenery(course, ground);
  groups.push(scenery.group);
  scenery.group.updateMatrixWorld(true);
  return scenery;
}

test('nearby roads share vertices and have locally culled bounds', () => {
  const data = emptyScenery();
  data.roads.push({
    points: [
      [30, -110],
      [30, 110],
    ],
    width: 6,
  });

  test('sloped building shells retain courtyards and share exact rendered collider triangles', () => {
    const data = emptyScenery();
    data.buildings.push({
      rings: [square(20, -20, 40, 0), square(26, -16, 34, -4)],
      height: 8,
    });
    const result = build(definition(data), terrain());
    const meshes = result.group.getObjectByName('nearbyRoads').children;
    assert.ok(meshes.length >= 2, 'long ribbons are split into spatial chunks');
    for (const mesh of meshes) {
      const geometry = mesh.geometry;
      assert.ok(geometry.index, 'terrain intersections reuse shared vertices');
      assert.ok(geometry.attributes.position.count < geometry.index.count / 2);
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
