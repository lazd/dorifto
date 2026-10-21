import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import * as THREE from 'three';
import AmmoFactory from 'ammojs-typed';
import { createServer } from 'vite';

let server;
let Ammo;
let createVehiclePhysics;
let createPhysicsResources;
let createGameState;

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  ({ createVehiclePhysics, createPhysicsResources } = await server.ssrLoadModule('/src/vehicle-physics.ts'));
  ({ createGameState } = await server.ssrLoadModule('/src/game-state.ts'));
  Ammo = await AmmoFactory.call({});
});

after(async () => {
  await server?.close();
});

test('heightfield pooling keeps active worlds isolated and reuses released buffers', () => {
  const resources = createPhysicsResources(Ammo);
  const first = resources.acquireHeightfield(new Float32Array(16).fill(1));
  const second = resources.acquireHeightfield(new Float32Array(64).fill(2));
  assert.notEqual(first.pointer, second.pointer);
  first.release();
  const replacement = resources.acquireHeightfield(new Float32Array(16).fill(3));
  assert.equal(replacement.pointer, first.pointer);
  assert.equal(Ammo.HEAPF32[replacement.pointer / 4], 3);
  assert.equal(Ammo.HEAPF32[second.pointer / 4], 2);
  second.release();
  replacement.release();
  const larger = resources.acquireHeightfield(new Float32Array(256).fill(4));
  assert.notEqual(larger.pointer, first.pointer);
  assert.notEqual(larger.pointer, second.pointer);
  larger.release();
  const reused = resources.acquireHeightfield(new Float32Array(256).fill(5));
  assert.equal(reused.pointer, larger.pointer);
  reused.release();
});

test('replaces real Ammo worlds while reusing car assets and heightfields and freeing bodies', () => {
  const car = {
    chassis: new THREE.Group(),
    wheels: Array.from({ length: 4 }, () => new THREE.Group()),
    hubs: Array.from({ length: 4 }, () => new THREE.Group()),
    centers: [
      new THREE.Vector3(-0.75, 0, 1.3), new THREE.Vector3(0.75, 0, 1.3),
      new THREE.Vector3(-0.75, 0, -1.3), new THREE.Vector3(0.75, 0, -1.3),
    ],
    radii: [0.32, 0.32, 0.32, 0.32],
    collisionVertices: [-1, 1].flatMap((x) => [-1, 1].flatMap((y) =>
      [-1, 1].map((z) => new THREE.Vector3(x * 0.75, y * 0.3, z * 2)))),
    setBraking() {},
    setReversing() {},
    setHazards() {},
  };
  const gameState = createGameState();
  const controls = { throttle: 0, brake: 0, reverse: 0, steer: 0, handbrake: false };
  const audio = { hitCone() {} };
  const laps = { reset() {}, update() {}, hitCone() {} };
  const resources = createPhysicsResources(Ammo);
  const malloc = Ammo._malloc;
  const destroy = Ammo.destroy;
  const heightfields = new Set();
  const destroyed = new Map();
  const allocate = (size) => {
    const pointer = malloc(size);
    Ammo._malloc = allocate;
    if (size === 32 * 32 * 4) heightfields.add(pointer);
    return pointer;
  };
  Ammo._malloc = allocate;
  Ammo.destroy = (object) => {
    const type = Ammo.getClass(object);
    destroyed.set(type, (destroyed.get(type) ?? 0) + 1);
    destroy(object);
  };
  const coneCount = 3;
  const replacements = 12;
  let current;
  try {
    for (let i = 0; i < replacements; i++) {
      const next = createVehiclePhysics({
        Ammo, resources, car, controls, gameState, laps, audio,
        spawn: { position: [i, 0], heading: i * 0.2 },
        course: {
          cones: Array.from({ length: coneCount }, (_, index) => {
            const cone = new THREE.Group();
            cone.position.set(index * 2, i, 5);
            return cone;
          }),
          terrain: {
            heights: new Float32Array(32 * 32).fill(i),
            columns: 32, rows: 32, spacing: 1.5, minX: -24, minZ: -24,
            minHeight: i - 0.01, maxHeight: i + 0.01,
            normalAt: () => new THREE.Vector3(0, 1, 0),
            heightAt: () => i,
          },
          isAsphalt: () => true,
        },
      });
      current?.dispose();
      current = next;
      current.reset();
      assert.equal(current.spawnBrakeHeld, true);
      assert.ok(Math.abs(car.chassis.position.x - i) < 1e-4);
      assert.ok(car.chassis.position.y >= i);
      current.step();
      current.captureVisuals();
      current.interpolate(0.5);
      assert.ok(car.chassis.position.toArray().every(Number.isFinite));
      assert.equal(heightfields.size, Math.min(i + 1, 2));
    }
    current.dispose();
    current = undefined;
    assert.equal(heightfields.size, 2);
    assert.equal(destroyed.get(Ammo.btRigidBody), replacements * (coneCount + 2));
    assert.equal(destroyed.get(Ammo.btDefaultMotionState), replacements * (coneCount + 2));
    for (const type of [
      Ammo.btRaycastVehicle, Ammo.btDefaultVehicleRaycaster, Ammo.btHeightfieldTerrainShape,
      Ammo.btDiscreteDynamicsWorld, Ammo.btCollisionDispatcher, Ammo.btDbvtBroadphase,
      Ammo.btSequentialImpulseConstraintSolver, Ammo.btDefaultCollisionConfiguration,
      Ammo.btCompoundShape, Ammo.btBoxShape,
    ]) assert.equal(destroyed.get(type), replacements);
    assert.equal(destroyed.get(Ammo.btConvexHullShape), replacements * 2);
    assert.equal(destroyed.get(Ammo.btVehicleTuning), undefined);
  } finally {
    current?.dispose();
    Ammo._malloc = malloc;
    Ammo.destroy = destroy;
  }
});
