import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import * as THREE from 'three';
import AmmoFactory from 'ammojs-typed';

let server;
let CourseTerrain;
let courseRoute;
let courseShoulderWidth;
let tunnelShoulderClearance;
let createPhysicsWorld;
let createPhysicsResources;
let createCoursePreviewModel;
let buildTunnelGeometry;
let createTunnelMeshes;
let definition;

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  ({ CourseTerrain } = await server.ssrLoadModule('/src/terrain.ts'));
  ({ courseRoute, courseShoulderWidth } = await server.ssrLoadModule('/src/courses.ts'));
  ({ createPhysicsWorld, createPhysicsResources } =
    await server.ssrLoadModule('/src/physics-world.ts'));
  ({ createCoursePreviewModel } = await server.ssrLoadModule('/src/course-preview-3d.ts'));
  ({ buildTunnelGeometry, createTunnelMeshes, tunnelShoulderClearance } =
    await server.ssrLoadModule('/src/tunnels.ts'));
  const course = JSON.parse(
    await readFile(new URL('./fixtures/road-course.json', import.meta.url)),
  );
  definition = { ...course, structures: [{ type: 'tunnel', start: 0.3, end: 0.6 }] };
});

after(async () => server?.close());

test('tunnel shell has an open road bore, closed portals, and identical forward/reverse geometry', () => {
  const terrain = new CourseTerrain(definition, false);
  const data = terrain.collisionMesh;
  assert.ok(data.indices.length > data.liningCount);
  assert.deepEqual(terrain.physicsData().collisionMesh, data);
  const reverse = buildTunnelGeometry({ ...definition, reverse: true }, (x, z) =>
    terrain.heightAt(x, z),
  );
  assert.deepEqual(reverse, data);
  assert.equal(
    buildTunnelGeometry({ ...definition, structures: [] }, () => 0),
    undefined,
  );
  assert.equal(
    buildTunnelGeometry(
      { ...definition, structures: [{ type: 'bridge', start: 0.3, end: 0.6 }] },
      () => 0,
    ),
    undefined,
  );
  const group = createTunnelMeshes(data, {}, new THREE.MeshStandardMaterial());
  group.updateMatrixWorld(true);
  const route = courseRoute({ ...definition, reverse: false });
  const center = route.getPointAt(0.45);
  const floor = terrain.heightAt(center.x, center.z);
  const tangent = route.getTangentAt(0.45);
  const boreWidth =
    definition.width / 2 +
    (definition.shoulderWidth ?? courseShoulderWidth) +
    tunnelShoulderClearance;
  for (const side of [-1, 1]) {
    const edge = terrain.heightAt(
      center.x + tangent.z * side * boreWidth,
      center.z - tangent.x * side * boreWidth,
    );
    assert.ok(Math.abs(edge - floor) < 1, 'terrain cut stays outside the tunnel lining');
  }
  const ray = new THREE.Raycaster(
    new THREE.Vector3(center.x, floor + 1, center.z),
    new THREE.Vector3(0, 1, 0),
  );
  const ceiling = ray.intersectObject(group)[0];
  assert.ok(
    ceiling && ceiling.distance > 4 && ceiling.distance < 6,
    'arched ceiling above the road',
  );
  ray.set(new THREE.Vector3(center.x, floor + 1, center.z), new THREE.Vector3(0, -1, 0));
  assert.equal(ray.intersectObject(group).length, 0, 'shell does not obstruct the floor');
  for (const fraction of [0.3, 0.6]) {
    const portal = route.getPointAt(fraction);
    const tangent = route.getTangentAt(fraction);
    const height = terrain.heightAt(portal.x, portal.z);
    const origin = portal.clone().addScaledVector(tangent, fraction === 0.3 ? -1 : 1);
    origin.y = height + 1.5;
    ray.set(origin, tangent.clone().multiplyScalar(fraction === 0.3 ? 1 : -1));
    ray.far = 2;
    assert.equal(ray.intersectObject(group).length, 0, 'portal is open at car height');
    origin.y = height + 6.9;
    ray.set(origin, tangent.clone().multiplyScalar(fraction === 0.3 ? 1 : -1));
    assert.ok(ray.intersectObject(group).length, 'portal face seals the roof to the mountain');
  }
  group.traverse((object) => {
    if (object.isMesh) {
      object.geometry.dispose();
      object.material.dispose();
    }
  });
});

test('Ammo tunnel collision matches lining rays and leaves floor and portal driveable', async () => {
  const terrain = new CourseTerrain(definition, false);
  const Ammo = await AmmoFactory.call({});
  const physics = createPhysicsWorld(
    Ammo,
    createPhysicsResources(Ammo),
    structuredClone(terrain.physicsData()),
  );
  const route = courseRoute({ ...definition, reverse: false });
  const center = route.getPointAt(0.45);
  const tangent = route.getTangentAt(0.45);
  const floor = terrain.heightAt(center.x, center.z);
  const from = new Ammo.btVector3();
  const to = new Ammo.btVector3();
  function ray(a, b) {
    from.setValue(...a);
    to.setValue(...b);
    const callback = new Ammo.ClosestRayResultCallback(from, to);
    try {
      physics.world.rayTest(from, to, callback);
      return callback.hasHit() ? callback.get_m_hitPointWorld().y() : undefined;
    } finally {
      Ammo.destroy(callback);
    }
  }
  try {
    const ceiling = ray([center.x, floor + 1, center.z], [center.x, floor + 10, center.z]);
    assert.ok(ceiling > floor + 6 && ceiling < floor + 7);
    const road = ray([center.x, floor + 1, center.z], [center.x, floor - 1, center.z]);
    assert.ok(Math.abs(road - floor) < 0.02);
    const side = ray(
      [center.x, floor + 2, center.z],
      [center.x + tangent.z * 20, floor + 2, center.z - tangent.x * 20],
    );
    assert.ok(side !== undefined, 'sidewall collision exists');
    const portal = route.getPointAt(0.3);
    const direction = route.getTangentAt(0.3);
    const y = terrain.heightAt(portal.x, portal.z) + 1.5;
    assert.equal(
      ray(
        [portal.x - direction.x, y, portal.z - direction.z],
        [portal.x + direction.x, y, portal.z + direction.z],
      ),
      undefined,
    );
  } finally {
    physics.dispose();
    physics.dispose();
    Ammo.destroy(from);
    Ammo.destroy(to);
  }
});

test('course previews include serializable tunnels and dispose their geometry and materials', () => {
  const model = createCoursePreviewModel(
    definition,
    { ground: '#665b43', road: '#77756e', start: '#ffffff' },
    32,
  );
  const tunnels = model.group.getObjectByName('tunnels');
  assert.ok(tunnels);
  const loaded = new THREE.ObjectLoader().parse(model.group.toJSON());
  assert.ok(loaded.getObjectByName('tunnel-lining'));
  let disposed = 0;
  tunnels.traverse((object) => {
    if (object.isMesh) {
      object.geometry.addEventListener('dispose', () => disposed++);
      object.material.addEventListener('dispose', () => disposed++);
    }
  });
  model.dispose();
  assert.equal(disposed, 4);
});
