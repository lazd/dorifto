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
let buildBridgeGeometry;
let createBridgeMeshes;
let bridgeDimensions;
let createPhysicsWorld;
let createPhysicsResources;
let createCoursePreviewModel;
let definition;
let terrainRasterSampler;
let TerrainSurface;
let tunnelShoulderClearance;
let vertexPosition;

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  ({ CourseTerrain } = await server.ssrLoadModule('/src/terrain.ts'));
  ({ terrainRasterSampler } = await server.ssrLoadModule('/src/terrain-profile.ts'));
  ({ TerrainSurface, vertexPosition } = await server.ssrLoadModule('/src/terrain-query.ts'));
  ({ tunnelShoulderClearance } = await server.ssrLoadModule('/src/tunnels.ts'));
  ({ courseRoute, courseShoulderWidth } = await server.ssrLoadModule('/src/courses.ts'));
  ({ buildBridgeGeometry, createBridgeMeshes, bridgeDimensions } =
    await server.ssrLoadModule('/src/bridges.ts'));
  ({ createPhysicsWorld, createPhysicsResources } =
    await server.ssrLoadModule('/src/physics-world.ts'));
  ({ createCoursePreviewModel } = await server.ssrLoadModule('/src/course-preview-3d.ts'));
  const course = JSON.parse(
    await readFile(new URL('./fixtures/road-course.json', import.meta.url)),
  );
  // Reuse the exported road and terrain, with vertical separation to exercise an elevated deck.
  definition = {
    ...course,
    terrain: { ...course.terrain, elevationOffset: course.terrain.elevationOffset + 20 },
    structures: [{ type: 'bridge', start: 0.3, end: 0.6 }],
  };
});

after(async () => server?.close());

test('long elevated bridges get batched under-deck trusses; short and low bridges do not', () => {
  const length = bridgeDimensions.trussMinLength * 3;
  const bridge = {
    id: 'truss-test',
    name: 'Truss test',
    width: 8,
    shoulderWidth: 1,
    closed: false,
    points: [
      [0, 0],
      [0, length],
    ],
    structures: [{ type: 'bridge', start: 0, end: 1 }],
  };
  const build = (course, clearance) =>
    buildBridgeGeometry(
      course,
      () => 0,
      () => -clearance,
      (geometry) => geometry.clone(),
    );
  const data = build(bridge, 100);
  assert.ok(data.trussCount > 0);
  assert.deepEqual(build({ ...bridge, reverse: true }, 100), data);
  assert.equal(build(bridge, 2).trussCount, 0, 'low bridges retain simple supports');
  assert.equal(
    build(
      {
        ...bridge,
        points: [
          [0, 0],
          [0, bridgeDimensions.trussMinLength / 2],
        ],
      },
      100,
    ).trussCount,
    0,
    'short bridges retain simple supports',
  );
  const group = createBridgeMeshes(data);
  try {
    const trusses = group.getObjectByName('bridge-trusses');
    assert.ok(trusses, 'trusses share one mesh and material rather than one draw call per beam');
    assert.equal(trusses.geometry.index.count, data.trussCount);
    assert.ok(data.trussCount / 3 < length * 12, 'truss geometry stays bounded per meter');
    const indices = trusses.geometry.index;
    const positions = trusses.geometry.getAttribute('position');
    let lowest = Infinity;
    for (let i = 0; i < indices.count; i++) {
      const vertex = indices.getX(i);
      assert.ok(Number.isFinite(positions.getX(vertex)) && Number.isFinite(positions.getZ(vertex)));
      const y = positions.getY(vertex);
      assert.ok(y < -bridgeDimensions.deckThickness, 'no truss member pokes through the deck');
      assert.ok(y > -100, 'deep members stay above the valley');
      lowest = Math.min(lowest, y);
    }
    assert.ok(lowest < -10, 'tall bridges have deep, visible trusswork');
  } finally {
    group.traverse((object) => {
      if (object.isMesh) {
        object.geometry.dispose();
        object.material.dispose();
      }
    });
  }
});

test('high bridges restore the entire raised shoulder band instead of leaving valley walls', () => {
  const highBridge = {
    ...definition,
    terrain: { ...definition.terrain, elevationOffset: definition.terrain.elevationOffset + 180 },
  };
  const terrain = new CourseTerrain(highBridge, false);
  const query = terrain.physicsData();
  const surface = new TerrainSurface(query.segments, query.halfWidth);
  const raster = terrainRasterSampler(highBridge.terrain);
  const transition = highBridge.terrainTransition ?? 8;
  const shoulderEnd =
    query.halfWidth +
    Math.max(tunnelShoulderClearance, bridgeDimensions.edgeWidth) +
    terrain.spacing * Math.SQRT2 +
    transition;
  let checked = 0;
  for (let i = 0; i < terrain.heights.length; i++) {
    const { x, z } = vertexPosition(query, i);
    const near = surface.nearest(x, z);
    if (
      near.fraction < 0.4 ||
      near.fraction > 0.5 ||
      near.distance < query.halfWidth + terrain.spacing * Math.SQRT2 ||
      near.distance > shoulderEnd
    )
      continue;
    const expected = Math.min(
      terrain.heights[i],
      raster(x, z, near.distance) * (highBridge.elevationScale ?? 1),
    );
    assert.ok(
      Math.abs(query.groundSurface.heights[i] - expected) < 1e-3,
      'bridge shoulders reach natural ground before the lateral restoration fades',
    );
    checked++;
  }
  assert.ok(checked > 20, 'exercise both sides of the elevated span');
});

test('bridge decks, railings and grounded piers share forward/reverse geometry', () => {
  const terrain = new CourseTerrain(definition, false);
  const data = terrain.bridgeMesh;
  assert.ok(data.concreteCount > 0 && data.indices.length > data.concreteCount);
  assert.deepEqual(terrain.physicsData().bridgeMesh, data);
  assert.ok(terrain.physicsData().groundSurface);
  assert.deepEqual(
    buildBridgeGeometry(
      { ...definition, reverse: true },
      (x, z) => terrain.heightAt(x, z),
      (x, z) => terrain.groundHeightAt(x, z),
      (geometry, lift) => terrain.projectGeometry(geometry, lift),
    ),
    data,
  );
  assert.equal(
    buildBridgeGeometry(
      { ...definition, structures: [] },
      () => 0,
      () => 0,
      (geometry) => geometry.clone(),
    ),
    undefined,
  );
  const route = courseRoute({ ...definition, reverse: false });
  const group = createBridgeMeshes(data);
  group.traverse((object) => {
    if (object.isMesh) assert.equal(object.material.shadowSide, THREE.BackSide);
  });
  group.updateMatrixWorld(true);
  const collisionGeometry = new THREE.BufferGeometry();
  collisionGeometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  collisionGeometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
  const collisionMesh = new THREE.Mesh(
    collisionGeometry,
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
  );
  collisionMesh.updateMatrixWorld(true);
  const center = route.getPointAt(0.45);
  const road = terrain.heightAt(center.x, center.z);
  const ground = terrain.groundHeightAt(center.x, center.z);
  assert.ok(road - ground > 10, 'the valley is not raised to the bridge deck');
  const ray = new THREE.Raycaster(
    new THREE.Vector3(center.x, road + 2, center.z),
    new THREE.Vector3(0, -1, 0),
  );
  assert.ok(
    Math.abs(ray.intersectObject(collisionMesh)[0].point.y - road) < 0.04,
    'slab meets asphalt',
  );
  for (let i = 1; i < 60; i++) {
    const fraction = THREE.MathUtils.lerp(0.3, 0.6, i / 60);
    const point = route.getPointAt(fraction);
    const tangent = route.getTangentAt(fraction);
    const halfWidth = definition.width / 2 + (definition.shoulderWidth ?? courseShoulderWidth);
    for (const across of [-0.8, -0.3, 0, 0.3, 0.8]) {
      const x = point.x + tangent.z * halfWidth * across;
      const z = point.z - tangent.x * halfWidth * across;
      const height = terrain.heightAt(x, z);
      ray.set(new THREE.Vector3(x, height + 2, z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObject(collisionMesh)[0];
      assert.ok(hit, 'deck covers the pavement');
      assert.ok(
        Math.abs(hit.point.y - (height - 0.015)) < 1e-4,
        'deck triangle interiors follow the road triangulation below the asphalt',
      );
      const visible = ray.intersectObject(group)[0];
      assert.ok(
        !visible || visible.point.y < height - 0.3,
        'no visible concrete face competes with the asphalt surface',
      );
    }
  }
  const tangent = route.getTangentAt(0.45);
  ray.set(
    new THREE.Vector3(center.x, road + 0.7, center.z),
    new THREE.Vector3(tangent.z, 0, -tangent.x),
  );
  assert.ok(ray.intersectObject(group).length, 'continuous rails protect the road');
  for (const fraction of [0.29, 0.61]) {
    const p = route.getPointAt(fraction);
    assert.ok(
      Math.abs(terrain.heightAt(p.x, p.z) - terrain.groundHeightAt(p.x, p.z)) < 0.01,
      'approaches retain the original ground surface',
    );
  }
  for (const fraction of [0.3, 0.6]) {
    const point = route.getPointAt(fraction);
    const tangent = route.getTangentAt(fraction);
    const direction = tangent.clone().multiplyScalar(fraction === 0.3 ? 1 : -1);
    const height = terrain.heightAt(point.x, point.z);
    const origin = point.clone().addScaledVector(direction, -0.1);
    origin.y = height - bridgeDimensions.deckThickness / 2;
    ray.set(origin, direction);
    ray.far = 0.2;
    assert.equal(
      ray.intersectObject(group).length,
      0,
      'buried abutment caps are not rendered across the road join',
    );
    assert.ok(
      ray.intersectObject(collisionMesh).length,
      'abutment caps remain in the collision mesh',
    );
  }
  group.traverse((object) => {
    if (object.isMesh) {
      object.geometry.dispose();
      object.material.dispose();
    }
  });
  collisionGeometry.dispose();
  collisionMesh.material.dispose();
});

test('real Ammo collision supports the deck, underside, rails and valley without a phantom embankment', async () => {
  const terrain = new CourseTerrain(definition, false);
  const Ammo = await AmmoFactory.call({});
  const physics = createPhysicsWorld(
    Ammo,
    createPhysicsResources(Ammo),
    structuredClone(terrain.physicsData()),
  );
  const route = courseRoute({ ...definition, reverse: false });
  const { start, end } = definition.structures[0];
  const bays = Math.ceil(((end - start) * route.getLength()) / bridgeDimensions.pierSpacing);
  const fraction = start + (end - start) / bays / 2;
  const center = route.getPointAt(fraction);
  const tangent = route.getTangentAt(fraction);
  const road = terrain.heightAt(center.x, center.z);
  const ground = terrain.groundHeightAt(center.x, center.z);
  const from = new Ammo.btVector3();
  const to = new Ammo.btVector3();
  const ray = (a, b) => {
    from.setValue(...a);
    to.setValue(...b);
    const callback = new Ammo.ClosestRayResultCallback(from, to);
    try {
      physics.world.rayTest(from, to, callback);
      if (!callback.hasHit()) return;
      const p = callback.get_m_hitPointWorld();
      return new THREE.Vector3(p.x(), p.y(), p.z());
    } finally {
      Ammo.destroy(callback);
    }
  };
  try {
    assert.ok(
      Math.abs(ray([center.x, road + 2, center.z], [center.x, road - 2, center.z]).y - road) < 0.04,
    );
    assert.ok(
      Math.abs(
        ray([center.x, road - 2, center.z], [center.x, road + 2, center.z]).y -
          (road - bridgeDimensions.deckThickness),
      ) < 0.04,
      'underside collision',
    );
    assert.ok(
      Math.abs(ray([center.x, road - 2, center.z], [center.x, ground - 2, center.z]).y - ground) <
        0.03,
      'ground below the bridge matches the restored valley',
    );
    const offset = definition.width / 2 + (definition.shoulderWidth ?? courseShoulderWidth) + 2;
    const x = center.x + tangent.z * offset;
    const z = center.z - tangent.x * offset;
    const valley = terrain.groundHeightAt(x, z);
    assert.ok(
      Math.abs(ray([x, road + 2, z], [x, valley - 2, z]).y - valley) < 0.03,
      'there is no invisible roadway alongside the deck',
    );
    const edgeOffset =
      definition.width / 2 +
      (definition.shoulderWidth ?? courseShoulderWidth) +
      bridgeDimensions.edgeWidth / 2;
    const railHeight =
      terrain.heightAt(center.x + tangent.z * edgeOffset, center.z - tangent.x * edgeOffset) + 0.8;
    assert.ok(
      ray(
        [center.x, railHeight, center.z],
        [center.x + tangent.z * 20, railHeight, center.z - tangent.x * 20],
      ),
      'rail collision',
    );
  } finally {
    physics.dispose();
    physics.dispose();
    Ammo.destroy(from);
    Ammo.destroy(to);
  }
});

test('glancing bridge curb and rail contacts slide across triangle seams without catching', async () => {
  const bridge = {
    ...definition,
    points: [
      [0, 0],
      [0, bridgeDimensions.trussMinLength],
    ],
    structures: [{ type: 'bridge', start: 0, end: 1 }],
  };
  const bridgeMesh = buildBridgeGeometry(
    bridge,
    () => 0,
    () => -20,
    (geometry) => geometry.clone(),
  );
  const Ammo = await AmmoFactory.call({});
  const resources = createPhysicsResources(Ammo);
  const halfWidth = bridge.width / 2 + (bridge.shoulderWidth ?? courseShoulderWidth);
  for (const height of [
    bridgeDimensions.curbHeight / 2,
    (bridgeDimensions.curbHeight + 0.8) / 2,
    0.8,
  ]) {
    for (const side of [-1, 1]) {
      for (const direction of [-1, 1]) {
        const physics = createPhysicsWorld(Ammo, resources, {
          columns: 2,
          rows: 2,
          spacing: bridgeDimensions.trussMinLength,
          minX: -bridgeDimensions.trussMinLength / 2,
          minZ: 0,
          minHeight: -20,
          maxHeight: -20,
          heights: new Float32Array(4).fill(-20),
          bridgeMesh,
        });
        const vector = new Ammo.btVector3(0, 0, 0);
        physics.world.setGravity(vector);
        vector.setValue(0.9, 0.1, 2.1);
        const shape = new Ammo.btBoxShape(vector);
        const transform = new Ammo.btTransform();
        transform.setIdentity();
        const innerEdge =
          height < bridgeDimensions.curbHeight
            ? halfWidth
            : halfWidth + bridgeDimensions.edgeWidth / 2 - 0.07;
        vector.setValue(side * (innerEdge - 0.93), height, bridgeDimensions.trussMinLength / 2);
        transform.setOrigin(vector);
        const motion = new Ammo.btDefaultMotionState(transform);
        vector.setValue(0, 0, 0);
        shape.calculateLocalInertia(1500, vector);
        const info = new Ammo.btRigidBodyConstructionInfo(1500, motion, shape, vector);
        const body = new Ammo.btRigidBody(info);
        physics.world.addRigidBody(body);
        vector.setValue(side, 0, direction * 20);
        body.setLinearVelocity(vector);
        let contacts = 0;
        let largestAlongNormal = 0;
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
          assert.ok(contacts > 0, 'exercise actual curb and rail contacts');
          assert.ok(
            largestAlongNormal < 0.01,
            `seams must not push against travel: height=${height}, side=${side}, direction=${direction}, normal=${largestAlongNormal}`,
          );
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
  }
});

test('previews retain bridge structures, keep asphalt above the valley and dispose resources', () => {
  const model = createCoursePreviewModel(
    definition,
    { ground: '#665b43', road: '#77756e', start: '#ffffff' },
    64,
  );
  const bridges = model.group.getObjectByName('bridges');
  assert.ok(bridges);
  model.group.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  const asphalt = model.group.children[0];
  const vertices = asphalt.geometry.getAttribute('position');
  for (let i = 0; i < vertices.count; i += Math.max(3, Math.floor(vertices.count / 100) * 3)) {
    const point = new THREE.Vector3();
    for (let j = 0; j < 3; j++) point.add(new THREE.Vector3().fromBufferAttribute(vertices, i + j));
    point.divideScalar(3);
    ray.set(point.clone().add(new THREE.Vector3(0, 2, 0)), new THREE.Vector3(0, -1, 0));
    const road = ray.intersectObject(asphalt)[0];
    const deck = ray.intersectObject(bridges)[0];
    if (deck && road)
      assert.ok(
        road.point.y > deck.point.y + 0.14,
        'preview asphalt stays above the bridge rather than using a coarse road height',
      );
  }
  assert.ok(
    new THREE.ObjectLoader().parse(model.group.toJSON()).getObjectByName('bridge-railings'),
  );
  let disposed = 0;
  let resources = 0;
  bridges.traverse((object) => {
    if (object.isMesh) {
      resources += 2;
      object.geometry.addEventListener('dispose', () => disposed++);
      object.material.addEventListener('dispose', () => disposed++);
    }
  });
  model.dispose();
  assert.equal(disposed, resources);
});
