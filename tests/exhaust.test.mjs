import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer } from 'vite';
import * as THREE from 'three';
import { loadTrainingCarModel } from '../scripts/bot-assets.mjs';

let server;
let createExhaustActivity;
let createExhaustEffects;
let exhaustOutlets;
let Drivetrain;
let startRevLimitRpm;
before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  ({ createExhaustActivity, createExhaustEffects, exhaustOutlets } =
    await server.ssrLoadModule('/src/exhaust.ts'));
  ({ Drivetrain, startRevLimitRpm } = await server.ssrLoadModule('/src/drivetrain.ts'));
});
after(async () => server?.close());

test('pre-start pops are irregular and overrun burbles are quieter, sparser, and smoke-free', () => {
  const engine = { ...new Drivetrain().state, gear: 0, rpm: startRevLimitRpm, throttle: 0.8 };
  const randomValues = [0.15, 0.85, 0.4, 0.65, 0.2, 0.7];
  let next = 0;
  const activity = createExhaustActivity(() => randomValues[next++ % randomValues.length]);
  const times = [];
  for (let step = 0; step < 180; step++) {
    const event = activity.update(1 / 60, engine);
    assert.equal(event.smoke, true);
    if (event.backfire) times.push(step / 60);
  }
  assert.ok(times.length >= 2 && times.length < 12);
  const intervals = times.slice(1).map((time, index) => time - times[index]);
  assert.ok(Math.max(...intervals) - Math.min(...intervals) > 0.1);
  activity.reset();
  activity.update(0.01, { ...engine, gear: 1 });
  let burbles = 0;
  for (let i = 0; i < 120; i++) {
    const event = activity.update(1 / 60, { ...engine, gear: 1, throttle: 0 });
    assert.equal(event.smoke, false);
    if (event.backfire) {
      assert.ok(event.backfire <= 0.38);
      burbles++;
    }
  }
  assert.ok(burbles < times.length);
  activity.reset();
  assert.equal(activity.update(0.1, { ...engine, gear: 1, throttle: 0 }).backfire, 0);
  assert.equal(activity.update(0.1, { ...engine, rpm: 1000 }).smoke, false);
});

test('gradual throttle lift triggers audible overrun without requiring a single-frame drop', () => {
  const activity = createExhaustActivity(() => 0.5);
  const engine = { ...new Drivetrain().state, gear: 2, rpm: 4000 };
  for (const throttle of [0.8, 0.6, 0.4, 0.2, 0.15, 0.1, 0.05])
    activity.update(1 / 60, { ...engine, throttle });
  let burbles = 0;
  for (let i = 0; i < 90; i++) {
    const event = activity.update(1 / 60, { ...engine, throttle: 0 });
    if (event.backfire) {
      assert.equal(event.backfireBody, 1);
      assert.ok(event.backfire >= 0.22 && event.backfire <= 0.38);
      burbles++;
    }
  }
  assert.ok(burbles > 0 && burbles < 5);
  assert.equal(activity.update(1, { ...engine, throttle: 0 }).backfire, 0);
});

test('four exhaust outlets emit bounded smoke and flames and reset/dispose cleanly', async () => {
  const chassis = new THREE.Group();
  chassis.add(await loadTrainingCarModel(server));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const effects = createExhaustEffects(scene, chassis);
  const engine = { ...new Drivetrain().state, gear: 0, rpm: startRevLimitRpm, throttle: 0.8 };
  try {
    const outlets = exhaustOutlets(chassis);
    chassis.updateMatrixWorld(true);
    const inverse = new THREE.Matrix4().copy(chassis.matrixWorld).invert();
    const vertices = [];
    const bounds = new THREE.Box3();
    chassis.traverse((mesh) => {
      if (!mesh.isMesh || !mesh.name.endsWith('_Mufflers_0')) return;
      const positions = mesh.geometry.getAttribute('position');
      const transform = new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld);
      for (let i = 0; i < positions.count; i++) {
        const point = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(transform);
        vertices.push(point);
        bounds.expandByPoint(point);
      }
    });
    const lips = vertices.filter((point) => point.z < bounds.min.z + 0.02);
    const lipBounds = new THREE.Box3().setFromPoints(lips);
    const radius = (lipBounds.max.y - lipBounds.min.y) / 2;
    for (const point of lips) {
      const distance = Math.min(
        ...outlets.map((outlet) => Math.hypot(point.x - outlet.x, point.y - outlet.y)),
      );
      assert.ok(distance <= radius + 0.001, 'each tailpipe rim surrounds an emitter');
    }
    const smoke = scene.children.find((mesh) => mesh.geometry?.isInstancedBufferGeometry);
    const flames = scene.children.filter((mesh) => mesh !== smoke);
    assert.equal(flames.length, 4);
    assert.equal(new Set(flames.map((mesh) => mesh)).size, 4);
    let previousOutlet = -1;
    let pops = 0;
    for (let i = 0; i < 600; i++) {
      const event = effects.update(1 / 60, engine, camera);
      const visible = flames.filter((flame) => flame.visible);
      assert.ok(visible.length <= 1, 'ANTILAG never flames from multiple pipes simultaneously');
      if (event.backfire) {
        const outlet = flames.indexOf(visible[0]);
        assert.ok(outlet >= 0);
        assert.notEqual(outlet, previousOutlet, 'consecutive pops choose different pipes');
        previousOutlet = outlet;
        pops++;
      }
    }
    assert.ok(pops > 1);
    assert.equal(smoke.visible, true);
    const shades = Array.from(smoke.geometry.getAttribute('shade').array);
    assert.ok(shades.some((shade) => shade > 0.8));
    assert.ok(shades.some((shade) => shade > 0 && shade < 0.05));
    assert.equal(new Set(flames.map((mesh) => mesh.position.x.toFixed(3))).size, 4);
    flames.forEach((flame, index) => {
      const expected = outlets[index].clone();
      expected.z -= 0.08;
      expected.applyMatrix4(chassis.matrixWorld);
      assert.ok(flame.position.distanceTo(expected) < 1e-8);
    });
    assert.ok(smoke.geometry.instanceCount <= 120);
    effects.reset();
    let overrunPops = 0;
    previousOutlet = -1;
    for (let lift = 0; lift < 8; lift++) {
      effects.update(0.1, { ...engine, gear: 2, throttle: 0.8 }, camera);
      for (let step = 0; step < 90; step++) {
        const event = effects.update(1 / 60, { ...engine, gear: 2, throttle: 0 }, camera);
        const visible = flames.filter((flame) => flame.visible);
        assert.ok(visible.length <= 1, 'overrun flames use only one pipe at a time');
        if (event.backfire) {
          const outlet = flames.indexOf(visible[0]);
          assert.ok(outlet >= 0);
          assert.notEqual(outlet, previousOutlet);
          previousOutlet = outlet;
          overrunPops++;
        }
      }
    }
    assert.ok(overrunPops > 1);
    effects.reset();
    assert.ok(scene.children.every((mesh) => !mesh.visible));
    effects.update(0.1, { ...engine, gear: 1, throttle: 0 }, camera);
    assert.equal(smoke.visible, false, 'reset particles do not reappear');
  } finally {
    effects.dispose();
    assert.equal(scene.children.length, 0);
    chassis.traverse((mesh) => {
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      mesh.material.dispose();
    });
  }
});
