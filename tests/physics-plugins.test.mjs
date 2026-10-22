import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import * as THREE from 'three';
import AmmoFactory from 'ammojs-typed';
import { createServer } from 'vite';

let server;
let Ammo;
let createVehiclePhysics;
let createPhysicsResources;
let createConePhysics;
let createPhysicsVisuals;
let createGameState;

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  ({ createVehiclePhysics, createPhysicsResources } = await server.ssrLoadModule('/src/vehicle-physics.ts'));
  ({ createConePhysics } = await server.ssrLoadModule('/src/cone-physics.ts'));
  ({ createPhysicsVisuals } = await server.ssrLoadModule('/src/physics-plugin.ts'));
  ({ createGameState } = await server.ssrLoadModule('/src/game-state.ts'));
  Ammo = await AmmoFactory.call({});
});

after(async () => {
  await server?.close();
});

function fixture() {
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
    setBraking() {}, setReversing() {}, setHazards() {},
  };
  const cones = [new THREE.Group(), new THREE.Group()];
  cones[0].position.set(5, 1, 5);
  cones[0].rotation.z = 0.2;
  cones[1].position.set(8, 1, 5);
  const course = {
    cones, cornerCones: [cones[0]],
    terrain: {
      heights: new Float32Array(16 * 16),
      columns: 16, rows: 16, spacing: 2, minX: -16, minZ: -16,
      minHeight: -0.01, maxHeight: 0.01,
      normalAt: () => new THREE.Vector3(0, 1, 0), heightAt: () => 0,
    },
    isAsphalt: () => true,
  };
  const hits = [];
  const laps = { reset() {}, update() {}, hitCone(index) { hits.push(index); } };
  const physics = createVehiclePhysics({
    Ammo, resources: createPhysicsResources(Ammo), car, course, laps,
    controls: { throttle: 0, brake: 0, reverse: 0, steer: 0, handbrake: false },
    gameState: createGameState(), spawn: { position: [0, 0], heading: 0 },
  });
  return { physics, course, laps, hits };
}

test('object plugins receive lifecycle hooks and managed bodies are freed before shapes', () => {
  const { physics, laps } = fixture();
  const events = [];
  let context;
  let body;
  let shape;
  let motion;
  const destroy = Ammo.destroy;
  const destroyed = [];
  try {
    const plugin = physics.addPlugin((value) => {
      context = value;
      const size = new Ammo.btVector3(0.5, 0.5, 0.5);
      shape = new Ammo.btBoxShape(size);
      Ammo.destroy(size);
      body = context.createRigidBody(2, shape, new THREE.Vector3(6, 2, 0));
      motion = body.getMotionState();
      return {
        reset() { events.push('reset'); },
        beforeStep(dt) { assert.equal(dt, physics.fixedStep); events.push('before'); },
        afterStep(dt) { assert.equal(dt, physics.fixedStep); events.push('after'); },
        captureVisuals(snap) { events.push(['capture', snap]); },
        interpolate(alpha) { events.push(['interpolate', alpha]); },
        dispose() { events.push('dispose'); Ammo.destroy(shape); },
        setEnabled(enabled) { context.setBodyEnabled(body, enabled); },
      };
    });
    physics.addPlugin(() => ({}));
    assert.equal(context.laps, laps);
    const membership = [];
    const addRigidBody = context.world.addRigidBody.bind(context.world);
    const removeRigidBody = context.world.removeRigidBody.bind(context.world);
    context.world.addRigidBody = (value) => {
      if (value === body) membership.push('add');
      addRigidBody(value);
    };
    context.world.removeRigidBody = (value) => {
      if (value === body) membership.push('remove');
      removeRigidBody(value);
    };
    plugin.setEnabled(false);
    plugin.setEnabled(false);
    assert.deepEqual(membership, ['remove']);
    plugin.setEnabled(true);
    plugin.setEnabled(true);
    assert.deepEqual(membership, ['remove', 'add']);
    physics.reset();
    physics.step();
    physics.captureVisuals();
    physics.interpolate(0.25);
    assert.deepEqual(events, [
      'reset', ['capture', true], 'before', 'after', ['capture', false], ['interpolate', 0.25],
    ]);
    const nextLaps = { ...laps };
    physics.setCourseDirection({ position: [0, 0], heading: Math.PI }, nextLaps);
    assert.equal(context.laps, nextLaps);
    plugin.setEnabled(false);
    const pointers = [body, motion, shape].map((object) => Ammo.getPointer(object));
    Ammo.destroy = (object) => {
      const index = pointers.indexOf(Ammo.getPointer(object));
      if (index !== -1) destroyed.push(index);
      destroy(object);
    };
    physics.dispose();
    physics.dispose();
    assert.deepEqual(destroyed, [0, 1, 2]);
    assert.deepEqual(membership, ['remove', 'add', 'remove']);
    assert.equal(events.at(-1), 'dispose');
    assert.throws(() => physics.addPlugin(() => ({})), /disposed/);
    assert.throws(() => plugin.setEnabled(true), /disposed/);
    assert.throws(() => context.createRigidBody(2, shape, new THREE.Vector3()), /disposed/);
  } finally {
    physics.dispose();
    Ammo.destroy = destroy;
  }
});

test('cone plugin preserves collision penalties, sound threshold/cooldown, filtering, and resets', () => {
  const { physics, course, hits } = fixture();
  const sounds = [];
  const bodies = [];
  let vehicleBody;
  let contacts = [];
  let reversed = false;
  let otherBody;
  const dispatcher = {
    getNumManifolds: () => 1,
    getManifoldByIndexInternal: () => ({
      getBody0: () => reversed ? bodies[0] : vehicleBody,
      getBody1: () => reversed ? vehicleBody : otherBody ?? bodies[0],
      getNumContacts: () => contacts.length,
      getContactPoint: (index) => ({
        getDistance: () => contacts[index].distance,
        getAppliedImpulse: () => contacts[index].impulse,
      }),
    }),
  };
  try {
    const plugin = physics.addPlugin((context) => {
      vehicleBody = context.vehicleBody;
      return createConePhysics({
        ...context, dispatcher, get laps() { return context.laps; },
        createRigidBody(...args) {
          const body = context.createRigidBody(...args);
          bodies.push(body);
          return body;
        },
      }, { course, audio: { hitCone: (impulse) => sounds.push(impulse) } });
    });
    physics.reset();
    contacts = [{ distance: 0.01, impulse: 10 }];
    plugin.afterStep();
    assert.deepEqual(hits, []);
    contacts = [{ distance: 0, impulse: 0.49 }];
    plugin.afterStep();
    assert.deepEqual(hits, [0]);
    assert.deepEqual(sounds, []);
    contacts = [{ distance: -0.01, impulse: 0.2 }, { distance: 0, impulse: 0.3 }];
    reversed = true;
    plugin.afterStep();
    plugin.afterStep();
    assert.deepEqual(sounds, [0.5]);
    plugin.beforeStep(0.29);
    plugin.afterStep();
    assert.deepEqual(sounds, [0.5]);
    plugin.beforeStep(0.02);
    plugin.afterStep();
    assert.deepEqual(sounds, [0.5, 0.5]);
    plugin.reset();
    plugin.afterStep();
    assert.deepEqual(sounds, [0.5, 0.5, 0.5]);
    reversed = false;
    otherBody = bodies[1];
    plugin.afterStep();
    assert.equal(hits.at(-1), 1);
    const nextHits = [];
    physics.setCourseDirection({ position: [0, 0], heading: Math.PI }, {
      reset() {}, update() {}, hitCone(index) { nextHits.push(index); },
    });
    plugin.afterStep();
    assert.deepEqual(nextHits, [1]);
    plugin.setEnabled(true, true);
    plugin.afterStep();
    assert.deepEqual(nextHits, [1]);
    assert.deepEqual(course.cones.map(({ visible }) => visible), [true, false]);
    plugin.setEnabled(false);
    assert.equal(course.cones[0].visible, false);
    assert.equal(course.cones[1].visible, false);
    plugin.setEnabled(true);
    const cone = course.cones[0];
    const start = cone.position.clone();
    const rotation = cone.quaternion.clone();
    const transform = bodies[0].getWorldTransform();
    const offset = new Ammo.btVector3(start.x + 4, start.y, start.z);
    transform.setOrigin(offset);
    bodies[0].setCenterOfMassTransform(transform);
    Ammo.destroy(offset);
    plugin.captureVisuals(false);
    plugin.interpolate(0.25);
    assert.ok(Math.abs(cone.position.x - start.x - 1) < 1e-5);
    plugin.reset();
    plugin.captureVisuals(true);
    plugin.interpolate(0.5);
    assert.ok(cone.position.distanceTo(start) < 1e-5);
    assert.ok(cone.quaternion.angleTo(rotation) < 1e-3);
  } finally {
    physics.dispose();
  }
});

test('shared pose interpolation handles rotation, snapping, and inactive objects', () => {
  const object = new THREE.Group();
  let active = true;
  const visuals = createPhysicsVisuals([object], () => active);
  object.position.x = 4;
  object.rotation.y = Math.PI;
  visuals.capture();
  visuals.interpolate(0.5);
  assert.equal(object.position.x, 2);
  assert.ok(Math.abs(object.rotation.y - Math.PI / 2) < 1e-6);
  object.position.x = 8;
  visuals.capture(true);
  visuals.interpolate(0);
  assert.equal(object.position.x, 8);
  active = false;
  object.position.x = 10;
  visuals.capture();
  visuals.interpolate(1);
  assert.equal(object.position.x, 10);
});

test('registered cones report real Ammo vehicle collisions and disabled cones do not', () => {
  const { physics, course, hits } = fixture();
  try {
    const plugin = physics.addPlugin((context) => {
      const origin = context.vehicleBody.getWorldTransform().getOrigin();
      course.cones[0].position.set(origin.x() + 0.6, origin.y(), origin.z());
      return createConePhysics(context, { course, audio: { hitCone() {} } });
    });
    plugin.setEnabled(false);
    physics.reset();
    physics.step();
    assert.deepEqual(hits, []);
    plugin.setEnabled(true);
    physics.reset();
    for (let i = 0; i < 10; i++) {
      physics.step();
      physics.captureVisuals();
    }
    assert.ok(hits.includes(0), 'cone collision reaches the lap timer through plugin hooks');
  } finally {
    physics.dispose();
  }
});
