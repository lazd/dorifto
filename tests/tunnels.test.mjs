import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import * as THREE from 'three';
import AmmoFactory from 'ammojs-typed';

let server;
let CourseTerrain;
let courseRoute;
let courseProfileHeight;
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
  ({ courseRoute, courseProfileHeight, courseShoulderWidth } =
    await server.ssrLoadModule('/src/courses.ts'));
  ({ createPhysicsWorld, createPhysicsResources } =
    await server.ssrLoadModule('/src/physics-world.ts'));
  ({ createCoursePreviewModel } = await server.ssrLoadModule('/src/course-preview-3d.ts'));
  ({ buildTunnelGeometry, createTunnelMeshes, tunnelShoulderClearance } =
    await server.ssrLoadModule('/src/tunnels.ts'));
  const course = JSON.parse(
    await readFile(new URL('./fixtures/road-course.json', import.meta.url)),
  );
  definition = {
    ...course,
    terrain: { ...course.terrain, elevationOffset: course.terrain.elevationOffset - 20 },
    structures: [{ type: 'tunnel', start: 0.3, end: 0.6 }],
  };
});

after(async () => server?.close());

test('tunnels bore through retained terrain with a separate floor and identical reverse geometry', () => {
  const terrain = new CourseTerrain(definition, false);
  const data = terrain.collisionMesh;
  assert.ok(data.indices.length > data.liningCount);
  assert.deepEqual(terrain.physicsData().collisionMesh, data);
  const reverse = new CourseTerrain({ ...definition, reverse: true }, false);
  assert.equal(reverse.collisionMesh.positions.length, data.positions.length);
  assert.ok(reverse.collisionMesh.positions.every((v, i) => v === data.positions[i]));
  assert.ok(reverse.collisionMesh.collisionIndices.every((v, i) => v === data.collisionIndices[i]));
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
  assert.equal(group.getObjectByName('tunnel-mountain'), undefined, 'no replacement mountain cap');
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
  assert.ok(
    Math.abs(ray.intersectObject(group)[0].point.y - floor) < 0.02,
    'floor stays on its profile',
  );
  terrain.mesh.updateMatrixWorld(true);
  const top = terrain.exteriorHeightAt(center.x, center.z);
  ray.set(new THREE.Vector3(center.x, top + 5, center.z), new THREE.Vector3(0, -1, 0));
  assert.ok(
    Math.abs(ray.intersectObject(terrain.mesh)[0].point.y - top) < 0.02,
    'terrain above the bore retains its original height',
  );
  for (const fraction of [0.3, 0.6]) {
    const portal = route.getPointAt(fraction);
    const tangent = route.getTangentAt(fraction);
    const height = terrain.heightAt(portal.x, portal.z);
    const origin = portal.clone().addScaledVector(tangent, fraction === 0.3 ? -1 : 1);
    origin.y = height + 1.5;
    ray.set(origin, tangent.clone().multiplyScalar(fraction === 0.3 ? 1 : -1));
    ray.far = 2;
    assert.equal(ray.intersectObject(group).length, 0, 'portal is open at car height');
  }
  group.traverse((object) => {
    if (object.isMesh) {
      object.geometry.dispose();
      object.material.dispose();
    }
  });
});

test('tunnel lining ends at the hillside instead of standing above exposed approaches', () => {
  const data = buildTunnelGeometry(
    definition,
    () => 0,
    () => 1,
  );
  for (const index of data.indices.subarray(0, data.liningCount))
    assert.ok(data.positions[index * 3 + 1] <= 0.981);
});

test('coarse complete-map terrain stays on the road profile across both tunnel mouths', () => {
  const bounds = new THREE.Box2().setFromPoints(
    definition.points.map(([x, z]) => new THREE.Vector2(x, z)),
  );
  const terrain = new CourseTerrain(
    {
      ...definition,
      bankingScale: 0,
      scenery: {
        bounds: { minX: bounds.min.x, minZ: bounds.min.y, maxX: bounds.max.x, maxZ: bounds.max.y },
        roads: [],
        waterways: [],
      },
    },
    false,
  );
  const route = courseRoute(definition);
  const floorMesh = createTunnelMeshes(terrain.collisionMesh).getObjectByName('tunnel-floor');
  floorMesh.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  for (const portal of [definition.structures[0].start, definition.structures[0].end]) {
    for (const distance of [-terrain.spacing, 0, terrain.spacing]) {
      const t = portal + distance / route.getLength();
      const p = route.getPointAt(t),
        tangent = route.getTangentAt(t);
      const expected = courseProfileHeight(definition.elevation, t, definition.closed !== false);
      for (const side of [-1, 0, 1]) {
        const x = p.x + (tangent.z * side * definition.width) / 2;
        const z = p.z - (tangent.x * side * definition.width) / 2;
        assert.ok(Math.abs(terrain.heightAt(x, z) - expected) < 0.05, 'no portal pavement bumps');
      }
    }
    for (let distance = -20; distance <= 20; distance++) {
      const p = route.getPointAt(portal + distance / route.getLength());
      const floor = terrain.heightAt(p.x, p.z);
      ray.set(new THREE.Vector3(p.x, floor + 1, p.z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObject(floorMesh)[0];
      if (Math.abs(distance) < 19) {
        assert.ok(hit, 'the bore has a continuous floor');
        assert.ok(terrain.isAsphalt(p), 'approaches retain pavement traction');
      }
      if (hit)
        assert.ok(
          Math.abs(hit.point.y - floor) < 0.0001,
          'floor cannot cover the asphalt at approaches',
        );
    }
  }
  floorMesh.geometry.dispose();
  floorMesh.material.dispose();
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
    const top = terrain.exteriorHeightAt(center.x, center.z);
    assert.ok(
      Math.abs(ray([center.x, top + 5, center.z], [center.x, top - 1, center.z]) - top) < 0.02,
      'restored hillside has matching collision above the tunnel',
    );
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

test('mapped tunnel pavement and dirt edges join both approaches without gaps or roof asphalt', async () => {
  const { createScenery } = await server.ssrLoadModule('/src/scenery.ts');
  const route = courseRoute(definition);
  const length = route.getLength();
  const width = definition.width - 1.5;
  const portals = [0.315, 0.585];
  const points = (from, to) => {
    const steps = Math.ceil(((to - from) * length) / 12);
    return Array.from({ length: steps + 1 }, (_, i) => {
      const p = route.getPointAt(from + ((to - from) * i) / steps);
      return [p.x + 0.8, p.z];
    });
  };
  const bounds = new THREE.Box2().setFromPoints(
    definition.points.map(([x, z]) => new THREE.Vector2(x, z)),
  );
  const mapped = {
    ...definition,
    bankingScale: 0,
    scenery: {
      bounds: { minX: bounds.min.x, minZ: bounds.min.y, maxX: bounds.max.x, maxZ: bounds.max.y },
      buildings: [],
      water: [],
      waterways: [],
      vegetation: [],
      roads: [
        { points: points(0, portals[0]), width },
        { points: points(...portals), width, structure: 'tunnel' },
        { points: points(portals[1], 1), width },
      ].map((road) => ({ ...road, centerline: 'double-yellow' })),
    },
  };
  const terrain = new CourseTerrain(mapped, false);
  terrain.mesh.add(createTunnelMeshes(terrain.collisionMesh));
  const scenery = createScenery(mapped, terrain, {
    addRoadDirt: () => true,
    projectGroundGeometry: (source, lift) => terrain.projectGroundGeometry(source, lift),
  });
  try {
    scenery.group.updateMatrixWorld(true);
    const roads = [];
    scenery.group.traverse((object) => {
      if (object.isMesh && object.name.startsWith('nearby-road-surfaces')) roads.push(object);
    });
    const ray = new THREE.Raycaster();
    for (const portal of portals) {
      for (const distance of [-3, -0.25, 0, 0.25, 3]) {
        const fraction = portal + distance / length;
        const center = route.getPointAt(fraction);
        center.x += 0.8;
        const tangent = route.getTangentAt(fraction);
        for (const side of [-0.25, 0, 0.25]) {
          const x = center.x + tangent.z * width * side;
          const z = center.z - tangent.x * width * side;
          const floor = terrain.heightAt(x, z);
          ray.set(new THREE.Vector3(x, floor + 1, z), new THREE.Vector3(0, -1, 0));
          const hit = ray.intersectObjects(roads)[0];
          assert.ok(hit, `asphalt covers portal ${portal}, distance ${distance}, side ${side}`);
          assert.ok(
            Math.abs(hit.point.y - floor - 0.035) < 1e-4,
            'pavement follows the driving floor',
          );
          if (side !== 0) continue;
          assert.ok(scenery.roadDistance(x, z) < -1, 'no internal dirt edge at the portal');
          const geometry = hit.object.geometry;
          assert.ok(geometry.hasAttribute('lateral'));
          assert.ok(geometry.hasAttribute('mainRoad'));
        }
      }
    }
    const middle = route.getPointAt(0.45);
    middle.x += 0.8;
    middle.y = terrain.heightAt(middle.x, middle.z) + 1;
    ray.set(middle, new THREE.Vector3(0, 1, 0));
    assert.equal(ray.intersectObjects(roads).length, 0, 'no tunnel pavement on the hillside above');
  } finally {
    const resources = new Set();
    for (const group of [scenery.group, terrain.mesh])
      group.traverse((object) => {
        if (!object.isMesh) return;
        resources.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material])
          resources.add(material);
      });
    resources.forEach((resource) => resource.dispose());
  }
});

test('glancing tunnel wall contacts slide across triangle seams in both directions', async () => {
  const tunnel = {
    ...definition,
    closed: false,
    points: [
      [0, 0],
      [0, 200],
    ],
    structures: [{ type: 'tunnel', start: 0, end: 1 }],
  };
  const collisionMesh = buildTunnelGeometry(tunnel, () => 0);
  const Ammo = await AmmoFactory.call({});
  const resources = createPhysicsResources(Ammo);
  const width =
    tunnel.width / 2 + (tunnel.shoulderWidth ?? courseShoulderWidth) + tunnelShoulderClearance;
  for (const side of [-1, 1]) {
    for (const direction of [-1, 1]) {
      const physics = createPhysicsWorld(Ammo, resources, {
        columns: 2,
        rows: 2,
        spacing: 200,
        minX: -100,
        minZ: 0,
        minHeight: -0.01,
        maxHeight: 0.01,
        heights: new Float32Array(4),
        collisionMesh,
      });
      const vector = new Ammo.btVector3();
      physics.world.setGravity(vector);
      vector.setValue(0.9, 0.4, 2.1);
      const shape = new Ammo.btBoxShape(vector);
      const transform = new Ammo.btTransform();
      transform.setIdentity();
      vector.setValue(side * (width - 0.93), 1.5, 100);
      transform.setOrigin(vector);
      const motion = new Ammo.btDefaultMotionState(transform);
      vector.setValue(0, 0, 0);
      shape.calculateLocalInertia(1500, vector);
      const info = new Ammo.btRigidBodyConstructionInfo(1500, motion, shape, vector);
      const body = new Ammo.btRigidBody(info);
      physics.world.addRigidBody(body);
      vector.setValue(side, 0, direction * 20);
      body.setLinearVelocity(vector);
      let contacts = 0,
        largestAlongNormal = 0;
      try {
        for (let i = 0; i < 120; i++) {
          physics.step(1 / 120);
          for (let j = 0; j < physics.dispatcher.getNumManifolds(); j++) {
            const manifold = physics.dispatcher.getManifoldByIndexInternal(j);
            for (let k = 0; k < manifold.getNumContacts(); k++) {
              const contact = manifold.getContactPoint(k);
              if (contact.getDistance() > 0) continue;
              contacts++;
              largestAlongNormal = Math.max(
                largestAlongNormal,
                Math.abs(contact.get_m_normalWorldOnB().z()),
              );
            }
          }
        }
        assert.ok(contacts > 0, 'exercise actual wall contacts');
        assert.ok(largestAlongNormal < 0.01, 'seams must not push against travel');
        assert.ok(direction * body.getLinearVelocity().z() > 18, 'retain sliding speed');
        assert.ok(Math.abs(body.getAngularVelocity().y()) < 0.5, 'no abrupt spin');
      } finally {
        physics.world.removeRigidBody(body);
        Ammo.destroy(body);
        Ammo.destroy(info);
        Ammo.destroy(motion);
        Ammo.destroy(transform);
        Ammo.destroy(shape);
        Ammo.destroy(vector);
        physics.dispose();
      }
    }
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
