import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { ObjectLoader, Raycaster, Vector3 } from 'three';
import { readFile } from 'node:fs/promises';

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

test('nearby roads and rivers follow the rendered preview grid, not the finer game grid', async () => {
  const definition = JSON.parse(
    await readFile(new URL('./fixtures/road-course.json', import.meta.url), 'utf8'),
  );
  definition.scenery = {
    version: 1,
    buildings: [],
    water: [],
    vegetation: [],
    roads: [{ points: definition.points.map(([x, z]) => [x + 80, z]), width: 6 }],
    waterways: [{ points: definition.points.map(([x, z]) => [x - 80, z]), width: 3 }],
  };
  const preview = createCoursePreviewModel(definition, colors, 24);
  try {
    const ground = preview.group.getObjectByName('preview-ground');
    ground.updateMatrixWorld(true);
    for (const name of ['nearby-road-surfaces', 'draped-waterways']) {
      const mesh = preview.group.getObjectByName(name);
      assert.ok(mesh, `${name} is rendered`);
      const positions = mesh.geometry.getAttribute('position');
      const indices = mesh.geometry.index;
      const count = indices?.count ?? positions.count;
      const ray = new Raycaster();
      const stride = Math.max(3, Math.floor(count / 100) * 3);
      for (let i = 0; i < count; i += stride) {
        const center = new Vector3();
        for (let j = 0; j < 3; j++)
          center.add(
            new Vector3().fromBufferAttribute(positions, indices ? indices.getX(i + j) : i + j),
          );
        center.divideScalar(3);
        ray.set(new Vector3(center.x, center.y + 100, center.z), new Vector3(0, -1, 0));
        const hit = ray.intersectObject(ground)[0];
        assert.ok(hit, `${name} has terrain beneath it`);
        assert.ok(
          Math.abs(center.y - hit.point.y - 0.15) < 1e-3,
          `${name} stays above the coarse terrain at triangle interiors`,
        );
      }
    }
  } finally {
    preview.dispose();
  }
});

test('3-D previews keep overlays above rendered terrain and dispose every resource', async () => {
  const imported = JSON.parse(
    await readFile(new URL('./fixtures/road-course.json', import.meta.url), 'utf8'),
  );
  for (const definition of [
    courses.find(({ id }) => id === 'hillside'),
    courses.find(({ padRadius }) => padRadius),
    { ...imported, terrainTransition: 2 },
  ]) {
    const terrain = new CourseTerrain(definition, false);
    const doubleYellow = definition.padRadius === undefined;
    const { group, dispose } = createCoursePreviewModel({ ...definition, doubleYellow }, colors);
    const road = group.children[0];
    const ground = group.children.at(-1);
    const centerLine = group.getObjectByName('double-yellow-center-line');
    assert.equal(!!centerLine, doubleYellow);
    if (centerLine) {
      assert.equal(centerLine.material.color.getHex(), 0xffd32a);
    }
    ground.updateMatrixWorld(true);
    for (const overlay of [road, centerLine].filter(Boolean)) {
      const position = overlay.geometry.getAttribute('position');
      const ray = new Raycaster();
      const stride = Math.max(3, Math.floor(position.count / 300) * 3);
      for (let i = 0; i < position.count; i += stride) {
        const center = new Vector3();
        for (let j = 0; j < 3; j++) center.add(new Vector3().fromBufferAttribute(position, i + j));
        center.divideScalar(3);
        ray.set(new Vector3(center.x, terrain.maxHeight + 100, center.z), new Vector3(0, -1, 0));
        const hit = ray.intersectObject(ground)[0];
        assert.ok(hit, 'terrain exists under every sampled overlay triangle');
        const lift = overlay === road ? 0.15 : 0.3;
        assert.ok(
          Math.abs(center.y - hit.point.y - lift) < 1e-3,
          `${definition.id}: overlay triangle interior stays above the rendered terrain`,
        );
      }
    }
    assert.ok(ground.geometry.getIndex().count > 0);
    const vertices = ground.geometry.getAttribute('position');
    const triangles = ground.geometry.getIndex();
    const base = Math.min(...Array.from({ length: vertices.count }, (_, i) => vertices.getY(i)));
    const edges = new Map();
    const a = new Vector3();
    const b = new Vector3();
    const c = new Vector3();
    const normal = new Vector3();
    ground.geometry.computeBoundingBox();
    const center = ground.geometry.boundingBox.getCenter(new Vector3());
    let bottomFaces = 0;
    let wallFaces = 0;
    for (let i = 0; i < triangles.count; i += 3) {
      const ids = [triangles.getX(i), triangles.getX(i + 1), triangles.getX(i + 2)];
      a.fromBufferAttribute(vertices, ids[0]);
      b.fromBufferAttribute(vertices, ids[1]);
      c.fromBufferAttribute(vertices, ids[2]);
      normal.subVectors(b, a).cross(new Vector3().subVectors(c, a));
      if (a.y === base && b.y === base && c.y === base) {
        assert.ok(normal.y < 0, 'underside faces downward');
        bottomFaces++;
      } else if (a.y === base || b.y === base || c.y === base) {
        const outward = new Vector3(
          (a.x + b.x + c.x) / 3 - center.x,
          0,
          (a.z + b.z + c.z) / 3 - center.z,
        );
        assert.ok(normal.dot(outward) > 0, 'walls face outward');
        wallFaces++;
      }
      const keys = ids.map((id) =>
        [vertices.getX(id), vertices.getY(id), vertices.getZ(id)].join(','),
      );
      for (let j = 0; j < 3; j++) {
        const from = keys[j];
        const to = keys[(j + 1) % 3];
        const key = [from, to].sort().join('/');
        const edge = edges.get(key) ?? { count: 0, balance: 0 };
        edge.count++;
        edge.balance += from < to ? 1 : -1;
        edges.set(key, edge);
      }
    }
    assert.ok(bottomFaces > 0 && wallFaces > 0);
    for (const edge of edges.values()) {
      assert.equal(edge.count, 2, 'every edge is shared by two faces');
      assert.equal(edge.balance, 0, 'shared faces have consistent winding');
    }
    const restored = new ObjectLoader().parse(ground.toJSON());
    restored.updateMatrixWorld(true);
    const bounds = ground.geometry.boundingBox;
    const wallTarget = new Vector3(center.x, base + 1, center.z);
    for (const direction of [
      new Vector3(1, 0, 0),
      new Vector3(-1, 0, 0),
      new Vector3(0, 0, 1),
      new Vector3(0, 0, -1),
    ]) {
      const origin = wallTarget
        .clone()
        .addScaledVector(direction, bounds.getSize(new Vector3()).length());
      const ray = new Raycaster(origin, direction.clone().negate());
      assert.ok(
        ray.intersectObject(restored).length > 0,
        'each wall is visible from outside after worker serialization',
      );
    }
    restored.geometry.dispose();
    restored.material.dispose();
    const disposed = [];
    const resourceCount = group.children.length * 2;
    group.traverse(({ geometry, material }) => {
      geometry?.addEventListener('dispose', () => disposed.push(geometry));
      material?.addEventListener('dispose', () => disposed.push(material));
    });
    dispose();
    assert.equal(group.children.length, 0);
    assert.equal(disposed.length, resourceCount);
  }
});
