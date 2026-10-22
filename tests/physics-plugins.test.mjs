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
let createTurnSignPhysics;
let createConfigurationState;

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  ({ createVehiclePhysics, createPhysicsResources } = await server.ssrLoadModule('/src/vehicle-physics.ts'));
  ({ createConePhysics } = await server.ssrLoadModule('/src/cone-physics.ts'));
  ({ createPhysicsVisuals } = await server.ssrLoadModule('/src/physics-plugin.ts'));
  ({ createTurnSignPhysics } = await server.ssrLoadModule('/src/turn-sign-physics.ts'));
  ({ createConfigurationState } = await server.ssrLoadModule('/src/configuration-state.ts'));
  Ammo = await AmmoFactory.call({});
});

after(async () => {
  await server?.close();
});

function fixture(slopeX = 0, slopeZ = 0) {
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
      [-1, 1].map((z) => new THREE.Vector3(x * 0.75, y < 0 ? -0.1 : 0.3, z * 2)))),
    setBraking() {}, setReversing() {}, setHazards() {},
  };
  const cones = [new THREE.Group(), new THREE.Group()];
  cones[0].position.set(5, 1, 5);
  cones[0].rotation.z = 0.2;
  cones[1].position.set(8, 1, 5);
  const course = {
    cones, cornerCones: [cones[0]],
    terrain: {
      heights: Float32Array.from({ length: 16 * 16 }, (_, i) =>
        (i % 16 - 7.5) * 2 * slopeX + (Math.floor(i / 16) - 7.5) * 2 * slopeZ),
      columns: 16, rows: 16, spacing: 2, minX: -16, minZ: -16,
      minHeight: -15 * (Math.abs(slopeX) + Math.abs(slopeZ)) - 0.01,
      maxHeight: 15 * (Math.abs(slopeX) + Math.abs(slopeZ)) + 0.01,
      normalAt: () => new THREE.Vector3(-slopeX, 1, -slopeZ).normalize(),
      heightAt: (x, z) => (x + 1) * slopeX + (z + 1) * slopeZ,
    },
    isAsphalt: () => true,
  };
  const hits = [];
  const laps = { reset() {}, update() {}, hitCone(index) { hits.push(index); } };
  const controls = { throttle: 0, brake: 0, reverse: 0, steer: 0, handbrake: false };
  const configurationState = createConfigurationState();
  const physics = createVehiclePhysics({
    Ammo, resources: createPhysicsResources(Ammo), car, course, laps,
    controls,
    configurationState, spawn: { position: [0, 0], heading: 0 },
  });
  return { physics, course, laps, hits, car, controls, configurationState };
}

test('static tire friction holds on banks and hills but releases under throttle', () => {
  for (const [slopeX, slopeZ] of [[0.3, 0], [-0.3, 0], [0, 0.2], [0.2, -0.15]]) {
    const { physics, car, controls } = fixture(slopeX, slopeZ);
    try {
      physics.reset();
      for (let i = 0; i < 600; i++) physics.step();
      physics.captureVisuals(true);
      const start = car.chassis.position.clone();
      for (let i = 0; i < 1200; i++) physics.step();
      physics.captureVisuals(true);
      const drift = Math.hypot(car.chassis.position.x - start.x, car.chassis.position.z - start.z);
      assert.ok(drift < 0.05, `slope ${slopeX}, ${slopeZ}: drifted ${drift} m in 10 seconds`);
      controls.throttle = 1;
      for (let i = 0; i < 120; i++) physics.step();
      physics.captureVisuals(true);
      assert.ok(car.chassis.position.distanceTo(start) > 0.2, 'throttle must release the parked car');
    } finally {
      physics.dispose();
    }
  }
});

test('static friction cannot hold beyond tire grip or stop freely rolling wheels', () => {
  for (const release of ['grip', 'brakes']) {
    const { physics, car, controls, configurationState } = fixture(0, 0.3);
    try {
      physics.reset();
      for (let i = 0; i < 600; i++) physics.step();
      physics.captureVisuals(true);
      const start = car.chassis.position.clone();
      if (release === 'grip') {
        const { profiles } = configurationState.getState();
        configurationState.update({
          profiles: { ...profiles, drift: { ...profiles.drift, frontGrip: 0.01, rearGrip: 0.01 } },
        });
      } else {
        controls.throttle = 1;
        physics.step();
        controls.throttle = 0;
      }
      for (let i = 0; i < 120; i++) physics.step();
      physics.captureVisuals(true);
      assert.ok(car.chassis.position.z < start.z - 0.2, `${release}: gravity must move the car downhill`);
    } finally {
      physics.dispose();
    }
  }
});

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

test('turn signs topple silently on terrain, reset, and follow visibility and course direction', () => {
  const { physics, hits } = fixture();
  const groups = [new THREE.Group(), new THREE.Group()];
  groups[1].visible = false;
  const signs = groups.map((group, index) => {
    const sign = new THREE.Group();
    sign.position.set(6 + index * 4, 0, 0);
    sign.rotation.y = 0.4;
    group.add(sign);
    return sign;
  });
  const starts = signs.map((sign) => ({ position: sign.position.clone(), rotation: sign.quaternion.clone() }));
  const bodies = [];
  const clanks = [];
  const destroy = Ammo.destroy;
  const destroyed = [];
  let context;
  try {
    physics.addPlugin((value) => {
      context = value;
      const updateAabb = value.world.updateSingleAabb.bind(value.world);
      value.world.updateSingleAabb = (body) => {
        assert.notEqual(Ammo.getPointer(body.getBroadphaseHandle()), 0,
          'never update the AABB of a body removed from the world');
        updateAabb(body);
      };
      return createTurnSignPhysics({
        ...value,
        createRigidBody(...args) {
          const body = value.createRigidBody(...args);
          bodies.push(body);
          return body;
        },
      }, groups, { hitTurnSign: (impulse) => clanks.push(impulse) });
    });
    const membership = [];
    const add = context.world.addRigidBody.bind(context.world);
    const remove = context.world.removeRigidBody.bind(context.world);
    context.world.addRigidBody = (body) => { membership.push(['add', bodies.indexOf(body)]); add(body); };
    context.world.removeRigidBody = (body) => { membership.push(['remove', bodies.indexOf(body)]); remove(body); };
    physics.reset();
    for (let i = 0; i < 120; i++) physics.step();
    physics.captureVisuals(true);
    assert.ok(signs[0].position.distanceTo(starts[0].position) < 1e-5, 'unhit sign stays planted');
    const impulse = new Ammo.btVector3(45, 0, 0);
    const lever = new Ammo.btVector3(0, 0.8, 0);
    bodies[0].activate(true);
    bodies[0].applyImpulse(impulse, lever);
    Ammo.destroy(impulse);
    Ammo.destroy(lever);
    for (let i = 0; i < 240; i++) {
      physics.step();
      physics.captureVisuals();
    }
    physics.interpolate(1);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(signs[0].quaternion);
    assert.ok(up.y < 0.5, `sign knocked over: up.y=${up.y}`);
    assert.deepEqual(clanks, [], 'falling sign does not clank on terrain');
    assert.deepEqual(hits, [], 'sign collisions do not count as cone penalties');
    physics.reset();
    physics.interpolate(0.5);
    assert.ok(signs[0].position.distanceTo(starts[0].position) < 1e-5);
    assert.ok(signs[0].quaternion.angleTo(starts[0].rotation) < 1e-3);
    groups[0].visible = false;
    groups[1].visible = true;
    physics.step();
    assert.deepEqual(membership, [['remove', 0], ['add', 1]]);
    groups[1].visible = false;
    physics.step();
    assert.deepEqual(membership.at(-1), ['remove', 1]);
    groups[0].visible = true;
    physics.reset();
    assert.deepEqual(membership.at(-1), ['add', 0]);
    Ammo.destroy = (object) => {
      destroyed.push(Ammo.getClass(object));
      destroy(object);
    };
    physics.dispose();
    physics.dispose();
    assert.equal(destroyed.filter((type) => type === Ammo.btRigidBody).length, 4);
    assert.equal(destroyed.filter((type) => type === Ammo.btCompoundShape).length, 1);
    assert.equal(destroyed.filter((type) => type === Ammo.btBoxShape).length, 2);
  } finally {
    physics.dispose();
    Ammo.destroy = destroy;
  }
});

test('vehicle collisions wake planted signs and trigger clanks without cone penalties', () => {
  const { physics, hits } = fixture();
  const group = new THREE.Group();
  const sign = new THREE.Group();
  sign.position.set(0.6, 0, 0);
  group.add(sign);
  const clanks = [];
  try {
    physics.addPlugin((context) => createTurnSignPhysics(context, [group], {
      hitTurnSign: (impulse) => clanks.push(impulse),
    }));
    physics.reset();
    for (let i = 0; i < 120; i++) {
      physics.step();
      physics.captureVisuals();
    }
    physics.interpolate(1);
    assert.ok(clanks.length > 0, 'car impact triggers metallic sound');
    assert.ok(sign.quaternion.angleTo(new THREE.Quaternion()) > 0.2, 'car wakes and rotates sign');
    assert.deepEqual(hits, []);
  } finally {
    physics.dispose();
  }
});

test('sign clanks only for car contacts in either manifold order', () => {
  const { physics } = fixture();
  const group = new THREE.Group();
  group.add(new THREE.Group(), new THREE.Group());
  const bodies = [];
  const clanks = [];
  let pair;
  let vehicle;
  const dispatcher = {
    getNumManifolds: () => pair ? 1 : 0,
    getManifoldByIndexInternal: () => ({
      getBody0: () => pair[0],
      getBody1: () => pair[1],
      getNumContacts: () => 1,
      getContactPoint: () => ({
        getDistance: () => -0.01,
        getAppliedImpulse: () => 10,
      }),
    }),
  };
  try {
    const plugin = physics.addPlugin((context) => {
      vehicle = context.vehicleBody;
      return createTurnSignPhysics({
        ...context, dispatcher,
        createRigidBody(...args) {
          const body = context.createRigidBody(...args);
          bodies.push(body);
          return body;
        },
      }, [group], { hitTurnSign: (impulse) => clanks.push(impulse) });
    });
    pair = [bodies[0], bodies[1]];
    plugin.afterStep();
    pair = [bodies[1], bodies[0]];
    plugin.afterStep();
    assert.deepEqual(clanks, [], 'sign-to-sign impacts are silent');
    pair = [vehicle, bodies[0]];
    plugin.afterStep();
    assert.deepEqual(clanks, [10]);
    plugin.afterStep();
    assert.deepEqual(clanks, [10], 'car impacts retain their cooldown');
    plugin.beforeStep(0.21);
    pair = [bodies[0], vehicle];
    plugin.afterStep();
    assert.deepEqual(clanks, [10, 10]);
  } finally {
    physics.dispose();
  }
});

test('moving vehicle strikes sleeping cones and signs from a distance', () => {
  for (const kind of ['cone', 'sign']) {
    const { physics, course, hits } = fixture();
    const object = course.cones[0];
    object.position.set(0, kind === 'cone' ? 0.095 : 0, 8);
    object.quaternion.identity();
    const start = object.position.clone();
    const group = new THREE.Group();
    group.add(object);
    let body;
    const sounds = [];
    try {
      const plugin = physics.addPlugin((context) => {
        body = context.vehicleBody;
        if (kind === 'cone') return createConePhysics(context, {
          course, audio: { hitCone: (impulse) => sounds.push(impulse) },
        });
        return createTurnSignPhysics(context, [group], {
          hitTurnSign: (impulse) => sounds.push(impulse),
        });
      });
      if (kind === 'cone') plugin.setEnabled(true, true);
      const signGroups = [new THREE.Group(), new THREE.Group()];
      signGroups[1].visible = false;
      signGroups.forEach((group, direction) => {
        for (let i = 0; i < 3; i++) {
          const sign = new THREE.Group();
          sign.position.set(20 + direction * 5, 0, i * 3);
          group.add(sign);
        }
      });
      physics.addPlugin((context) => createTurnSignPhysics(context, signGroups, { hitTurnSign() {} }));
      physics.reset();
      for (let i = 0; i < 360; i++) {
        physics.step();
        physics.captureVisuals();
        physics.interpolate(0.5);
      }
      const velocity = new Ammo.btVector3(0, 0, 15);
      body.setLinearVelocity(velocity);
      Ammo.destroy(velocity);
      for (let i = 0; i < 120; i++) {
        physics.step();
        physics.captureVisuals();
        physics.interpolate(0.5);
      }
      assert.ok(object.position.distanceTo(start) > 0.5, `${kind} moves after car impact`);
      assert.ok(sounds.length > 0, `${kind} impact is audible`);
      if (kind === 'cone') assert.ok(hits.includes(0));
    } finally {
      physics.dispose();
    }
  }
});
