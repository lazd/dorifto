import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { ObjectLoader, Raycaster, Vector3 } from 'three';

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
    const doubleYellow = definition.padRadius === undefined;
    const { group, dispose } = createCoursePreviewModel({ ...definition, doubleYellow }, colors);
    const road = group.children[0];
    const ground = group.children.at(-1);
    const centerLine = group.getObjectByName('double-yellow-center-line');
    assert.equal(!!centerLine, doubleYellow);
    if (centerLine) {
      const linePositions = centerLine.geometry.getAttribute('position');
      for (let i = 0; i < linePositions.count; i += 37)
        assert.ok(
          Math.abs(
            linePositions.getY(i) -
              terrain.heightAt(linePositions.getX(i), linePositions.getZ(i)) -
              0.3,
          ) < 1e-4,
          'center lines follow the terrain above the road',
        );
      assert.equal(centerLine.material.color.getHex(), 0xffd32a);
    }
    const position = road.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i += 37)
      assert.ok(
        Math.abs(position.getY(i) - terrain.heightAt(position.getX(i), position.getZ(i)) - 0.15) <
          1e-4,
        definition.id,
      );
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
    group.traverse(({ geometry, material }) => {
      geometry?.addEventListener('dispose', () => disposed.push(geometry));
      material?.addEventListener('dispose', () => disposed.push(material));
    });
    dispose();
    assert.equal(group.children.length, 0);
    assert.equal(disposed.length, doubleYellow ? 8 : 6);
  }
});
