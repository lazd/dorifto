import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import * as THREE from 'three';
import { createServer } from 'vite';

let server;
let createDrivingCamera;
let cabinCameraMotion;
let fpvCameraMotion;
let courses;
let courseRoute;
let generateCustomCourse;
let defaultCourseWeights;
let DrivingControls;
let carLightLayers;
let inputBindings;
let hideMirrorScenery;
let mirrorEnabled;

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  ({ createDrivingCamera, cabinCameraMotion, fpvCameraMotion } =
    await server.ssrLoadModule('/src/camera.ts'));
  ({ carLightLayers } = await server.ssrLoadModule('/src/car.ts'));
  ({ hideMirrorScenery, mirrorEnabled } = await server.ssrLoadModule('/src/mirror-rendering.ts'));
  ({ DrivingControls } = await server.ssrLoadModule('/src/controls.ts'));
  ({ inputBindings } = await server.ssrLoadModule('/src/input-bindings.ts'));
  ({ courses, courseRoute } = await server.ssrLoadModule('/src/courses.ts'));
  ({ generateCustomCourse, defaultCourseWeights } = await server.ssrLoadModule(
    '/src/course-generation.ts',
  ));
});

after(async () => {
  await server?.close();
});

test('mirror passes omit scenery and grass without changing the main view or settings', () => {
  const scene = new THREE.Scene();
  const scenery = new THREE.Group();
  scenery.name = 'scenery';
  const grass = new THREE.Group();
  grass.name = 'roadside-grass';
  const course = new THREE.Group();
  scene.add(course, scenery, grass);
  for (const visible of [true, false]) {
    scenery.visible = visible;
    const restore = hideMirrorScenery(scene);
    try {
      assert.equal(scenery.visible, false);
      assert.equal(grass.visible, false);
      assert.equal(course.visible, true);
      const restoreNested = hideMirrorScenery(scene);
      restoreNested();
      assert.equal(scenery.visible, false);
    } finally {
      restore();
    }
    assert.equal(scenery.visible, visible);
    assert.equal(grass.visible, true);
  }
  for (const cabin of [true, false])
    for (const resolution of ['off', 'low', 'medium', 'high'])
      for (const passenger of [true, false])
        for (const enabled of [true, false])
          assert.equal(
            mirrorEnabled(cabin, resolution, passenger, enabled),
            cabin && resolution !== 'off' && (!passenger || enabled),
          );
});

test('only cabin view enables interior illumination, while all driving views enable headlights', () => {
  const camera = new THREE.PerspectiveCamera();
  const controls = {
    mapView: false,
    mapZoom: 0,
    mapWheelZoom: 0,
    mapDragX: 0,
    mapDragY: 0,
    cameraX: 0,
    cameraY: 0,
    lookBehind: false,
  };
  const car = { chassis: new THREE.Group(), aimMirrors() {} };
  const driving = createDrivingCamera(camera, car, controls, courses[0], { heightAt: () => 0 });
  driving.reset(0);
  for (const style of ['fpv', 'classic', 'cabin', 'classic', 'fpv', 'cabin', 'fpv']) {
    driving.update(1 / 60, new THREE.Vector3(), 'drift', style, false);
    assert.equal(camera.layers.isEnabled(carLightLayers.headlights), true);
    assert.equal(camera.layers.isEnabled(carLightLayers.interior), style === 'cabin');
  }
});

for (const style of ['classic', 'fpv', 'cabin']) {
  test(`${style}: map view snaps on and off in one frame and preserves the driving camera`, () => {
    const definition = courses.find((course) => course.id === 'hillside');
    const terrain = { heightAt: () => 0 };
    const car = { chassis: new THREE.Group(), aimMirrors() {} };
    car.chassis.position.set(20, 2, 10);
    const controls = {
      mapView: false,
      mapZoom: 0,
      mapWheelZoom: 0,
      mapDragX: 0,
      mapDragY: 0,
      cameraX: 0,
      cameraY: 0,
      lookBehind: false,
    };
    const referenceControls = { ...controls };
    const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 1500);
    const reference = camera.clone();
    const driving = createDrivingCamera(camera, car, controls, definition, terrain);
    const referenceDriving = createDrivingCamera(
      reference,
      car,
      referenceControls,
      definition,
      terrain,
    );
    const velocity = new THREE.Vector3(0, 0, 10);
    const update = () => {
      driving.update(1 / 1000, velocity, 'drift', style, false);
      referenceDriving.update(1 / 1000, velocity, 'drift', style, false);
    };
    const assertDrivingPose = () => {
      assert.ok(camera.position.distanceTo(reference.position) < 1e-8);
      assert.ok(camera.quaternion.angleTo(reference.quaternion) < 1e-7);
      assert.equal(camera.near, reference.near);
      assert.equal(camera.far, reference.far);
    };
    driving.reset(0);
    referenceDriving.reset(0);
    update();
    assertDrivingPose();

    controls.mapView = true;
    update();
    const route = courseRoute(definition);
    const points = route.getSpacedPoints(Math.ceil(route.getLength() / 2));
    points.pop();
    const bounds = new THREE.Box3().setFromPoints(points).expandByScalar(definition.width);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const halfHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const height =
      1.1 * Math.max(size.z / 2 / halfHeight, size.x / 2 / (halfHeight * camera.aspect));
    assert.ok(
      camera.position.distanceTo(new THREE.Vector3(center.x, bounds.max.y + height, center.z)) <
        1e-8,
    );
    const direction = camera.getWorldDirection(new THREE.Vector3());
    assert.ok(direction.distanceTo(new THREE.Vector3(0, -1, 0)) < 1e-8);
    assert.equal(camera.near, height * 0.05);

    for (let i = 0; i < 5; i++) {
      car.chassis.position.z += 1;
      update();
    }

    controls.mapView = false;
    update();
    assertDrivingPose();

    controls.mapView = true;
    update();
    car.chassis.position.set(-40, 2, -30);
    driving.reset(0.5);
    referenceDriving.reset(0.5);
    update();
    controls.mapView = false;
    update();
    assertDrivingPose();
  });
}

test('chase cameras follow irregular physics translations without car-relative jitter', () => {
  for (const style of ['classic', 'fpv']) {
    const controls = {
      mapView: false,
      mapZoom: 0,
      mapWheelZoom: 0,
      mapDragX: 0,
      mapDragY: 0,
      cameraX: 0,
      cameraY: 0,
      lookBehind: true,
    };
    const car = { chassis: new THREE.Group(), aimMirrors() {} };
    const camera = new THREE.PerspectiveCamera();
    const driving = createDrivingCamera(camera, car, controls, courses[0], {
      heightAt: () => -100,
    });
    const velocity = new THREE.Vector3(0, 0, 20);
    driving.reset(0);
    for (let i = 0; i < 600; i++) driving.update(1 / 60, velocity, 'grip', style, false);
    const relative = camera.position.clone().sub(car.chassis.position);
    const rotation = camera.quaternion.clone();
    for (const distance of [0.16, 0.5, 0, 0.33, 0.17, 0.66]) {
      car.chassis.position.z += distance;
      driving.update(1 / 60, velocity, 'grip', style, false);
      assert.ok(camera.position.clone().sub(car.chassis.position).distanceTo(relative) < 1e-8);
      assert.ok(camera.quaternion.angleTo(rotation) < 1e-7);
    }
  }
});

test('map view fits a 5 km course within the clipping planes on a portrait display', () => {
  const definition = generateCustomCourse(123, { ...defaultCourseWeights, length: 5000 });
  const terrain = { heightAt: () => 0 };
  const car = { chassis: new THREE.Group(), aimMirrors() {} };
  const controls = {
    mapView: true,
    mapZoom: 0,
    mapWheelZoom: 0,
    mapDragX: 0,
    mapDragY: 0,
    cameraX: 0,
    cameraY: 0,
    lookBehind: false,
  };
  const camera = new THREE.PerspectiveCamera(55, 9 / 16, 0.1, 1500);
  const driving = createDrivingCamera(camera, car, controls, definition, terrain);
  driving.reset(0);
  driving.update(1 / 60, new THREE.Vector3(), 'grip', 'classic', false);
  camera.updateMatrixWorld();
  assert.ok(camera.far > 1500);
  for (const point of courseRoute(definition).getSpacedPoints(256)) {
    const projected = point.project(camera);
    assert.ok(Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1);
    assert.ok(projected.z > -1 && projected.z < 1);
  }
  controls.mapView = false;
  driving.update(1 / 60, new THREE.Vector3(), 'grip', 'classic', false);
  assert.equal(camera.far, 1500);
});

function cabinRig(rotation = new THREE.Quaternion()) {
  let mirrorAims = 0;
  const car = {
    chassis: new THREE.Group(),
    aimMirrors() {
      mirrorAims++;
    },
  };
  car.chassis.position.set(20, 2, 10);
  car.chassis.quaternion.copy(rotation);
  const controls = {
    mapView: false,
    mapZoom: 0,
    mapWheelZoom: 0,
    mapDragX: 0,
    mapDragY: 0,
    cameraX: 0,
    cameraY: 0,
    lookBehind: false,
  };
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 1500);
  const driving = createDrivingCamera(camera, car, controls, courses[0], { heightAt: () => 0 });
  const eye = new THREE.Vector3(-0.38, 0.43, -0.25);
  const velocity = new THREE.Vector3();
  driving.reset(0);
  const update = (dt, acceleration = new THREE.Vector3(), style = 'cabin') => {
    velocity.addScaledVector(acceleration, dt);
    car.chassis.position.addScaledVector(velocity, dt);
    driving.update(dt, velocity, 'drift', style, false);
  };
  const offset = () =>
    camera.position
      .clone()
      .sub(car.chassis.position)
      .applyQuaternion(car.chassis.quaternion.clone().invert())
      .sub(eye);
  update(1 / 60);
  return {
    camera,
    car,
    controls,
    driving,
    eye,
    velocity,
    update,
    offset,
    mirrorAims: () => mirrorAims,
  };
}

for (const style of ['classic', 'fpv', 'cabin']) {
  test(`${style}: right stick pans horizontally while looking behind and recenters on release`, () => {
    const { camera, controls, update } = cabinRig();
    const settle = () => {
      for (let i = 0; i < 240; i++) update(1 / 60, new THREE.Vector3(), style);
      return camera.getWorldDirection(new THREE.Vector3());
    };
    const front = settle();
    controls.lookBehind = true;
    const rear = settle();
    assert.ok(front.z * rear.z < 0, 'look-behind faces the opposite direction');
    for (const cameraX of [-1, 1]) {
      controls.cameraX = cameraX;
      const panned = settle();
      assert.ok(panned.z * rear.z > 0, 'pan stays rear-facing');
      assert.ok(Math.abs(panned.x) > 0.3, 'horizontal stick pans the rear view');
      assert.equal(Math.sign(panned.x), cameraX);
      assert.ok(panned.angleTo(rear) > 0.3);
    }
    controls.cameraX = 0;
    assert.ok(settle().angleTo(rear) < 1e-5, 'stick release centers the rear view');
    controls.lookBehind = false;
    assert.ok(settle().angleTo(front) < 1e-5, 'R3 release restores the forward view');
  });
}

test('gamepad left vertical axis controls map zoom only in map view and clears when disabled', () => {
  const descriptors = new Map(
    ['document', 'window', 'navigator'].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  const pad = { connected: true, mapping: 'standard', axes: [0.4, -0.7, 0.3, -0.5], buttons: [] };
  try {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        hasFocus: () => true,
        hidden: false,
        addEventListener() {},
        documentElement: { style: {} },
        body: { style: {} },
      },
    });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { addEventListener() {} },
    });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { getGamepads: () => [pad] },
    });
    const controls = new DrivingControls();
    controls.poll();
    assert.equal(controls.mapZoom, 0);
    assert.equal(controls.steer, -0.4);
    pad.buttons[1] = { pressed: true };
    controls.poll();
    assert.equal(controls.mapView, true);
    assert.equal(controls.mapZoom, -0.7);
    assert.equal(controls.cameraX, 0.3);
    assert.equal(controls.cameraY, -0.5);
    pad.axes[1] = 0.8;
    controls.poll();
    assert.equal(controls.mapZoom, 0.8);
    controls.poll(false);
    assert.equal(controls.mapZoom, 0);
    assert.equal(controls.cameraX, 0);
    assert.equal(controls.cameraY, 0);
  } finally {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test('gamepad D-pad up controls the lap recorder and left/right request replay lap skips once per press', () => {
  const descriptors = new Map(
    ['document', 'window', 'navigator'].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  const pad = { connected: true, mapping: 'standard', axes: [], buttons: [] };
  try {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        hasFocus: () => true,
        hidden: false,
        addEventListener() {},
        documentElement: { style: {} },
        body: { style: {} },
      },
    });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { addEventListener() {} },
    });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { getGamepads: () => [pad] },
    });
    const controls = new DrivingControls();
    const press = (index) => {
      pad.buttons[index] = { pressed: true };
      controls.poll();
    };
    const release = (index) => {
      pad.buttons[index] = { pressed: false };
      controls.poll();
    };

    press(12);
    assert.equal(controls.recordRequested, true);
    controls.poll();
    assert.equal(controls.recordRequested, false);
    release(12);
    press(14);
    assert.equal(controls.previousLapRequested, true);
    controls.poll();
    assert.equal(controls.previousLapRequested, false);
    release(14);
    press(15);
    assert.equal(controls.nextLapRequested, true);
    controls.poll();
    assert.equal(controls.nextLapRequested, false);
    release(15);
    press(13);
    assert.equal(controls.recordRequested, false);
    assert.equal(controls.previousLapRequested, false);
    assert.equal(controls.nextLapRequested, false);
    const reset = inputBindings.get().controller.buttons.reset;
    pad.buttons[reset] = { pressed: true };
    controls.poll(false, 0, undefined, true);
    assert.equal(controls.resetRequested, true, 'reset remains available in results');
    assert.equal(controls.throttle, 0, 'driving stays blocked in results');
    controls.poll(false, 0, undefined, true);
    assert.equal(controls.resetRequested, false, 'holding reset does not immediately restart');
    pad.buttons[reset] = { pressed: false };
    controls.poll(false, 0, undefined, true);
    pad.buttons[reset] = { pressed: true };
    controls.poll(false, 0, undefined, true);
    assert.equal(controls.resetRequested, true, 'a second press restarts the race');
  } finally {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test('map zoom is directional, bounded, frame-rate independent, and retained until reset', () => {
  const heights = [];
  for (const fps of [30, 60, 144]) {
    const rig = cabinRig();
    rig.controls.mapView = true;
    rig.update(0);
    const initial = rig.camera.position.clone();
    const initialHeight = rig.camera.near / 0.05;
    rig.controls.mapZoom = -1;
    for (let i = 0; i < fps; i++) rig.update(1 / fps);
    assert.ok(Math.abs(rig.camera.near / 0.05 - initialHeight / Math.E) < 1e-8);
    heights.push(rig.camera.position.y);
    rig.controls.mapZoom = 1;
    rig.update(1);
    assert.ok(rig.camera.position.distanceTo(initial) < 1e-8);
    for (const [input, limit] of [
      [-1, 0.02],
      [1, 4],
    ]) {
      rig.controls.mapZoom = input;
      for (let i = 0; i < 12; i++) rig.update(1);
      assert.ok(Math.abs(rig.camera.near / 0.05 - initialHeight * limit) < 1e-8);
      assert.ok(rig.camera.far > rig.camera.near);
    }
    rig.controls.mapZoom = 0;
    const zoomed = rig.camera.position.clone();
    rig.controls.mapView = false;
    rig.update(1 / fps);
    rig.controls.mapView = true;
    rig.update(1 / fps);
    assert.ok(rig.camera.position.distanceTo(zoomed) < 1e-8);
    rig.driving.reset(0);
    rig.update(0);
    assert.ok(rig.camera.position.distanceTo(initial) < 1e-8);
  }
  assert.ok(Math.max(...heights) - Math.min(...heights) < 1e-8);
});

test('map stick pans in all screen directions, stops on release, and resets framing', () => {
  for (const [axis, basis] of [
    ['cameraX', new THREE.Vector3(1, 0, 0)],
    ['cameraY', new THREE.Vector3(0, -1, 0)],
  ]) {
    for (const sign of [-1, 1]) {
      const rig = cabinRig();
      rig.controls.mapView = true;
      rig.update(0);
      const initial = rig.camera.position.clone();
      const orientation = rig.camera.quaternion.clone();
      const direction = basis.clone().applyQuaternion(orientation);
      rig.controls[axis] = sign;
      rig.update(0.5);
      const displacement = rig.camera.position.clone().sub(initial);
      const distance =
        (rig.camera.near / 0.05) * Math.tan(THREE.MathUtils.degToRad(rig.camera.fov) / 2) * 0.5;
      assert.ok(displacement.distanceTo(direction.multiplyScalar(sign * distance)) < 1e-8);
      assert.ok(rig.camera.quaternion.angleTo(orientation) < 1e-7);
      rig.controls[axis] = 0;
      const panned = rig.camera.position.clone();
      rig.update(0.5);
      assert.ok(rig.camera.position.distanceTo(panned) < 1e-8);
      rig.controls.mapView = false;
      rig.update(1 / 60);
      rig.controls.mapView = true;
      rig.update(1 / 60);
      assert.ok(rig.camera.position.distanceTo(panned) < 1e-8);
      rig.driving.reset(0);
      rig.update(0);
      assert.ok(rig.camera.position.distanceTo(initial) < 1e-8);
    }
  }
});

test('map panning and zoom do not alter the hidden driving camera', () => {
  for (const style of ['classic', 'fpv', 'cabin']) {
    const rig = cabinRig();
    const reference = cabinRig();
    rig.controls.mapView = true;
    rig.controls.mapZoom = -0.6;
    rig.controls.cameraX = 0.8;
    rig.controls.cameraY = -0.5;
    for (let i = 0; i < 60; i++) {
      rig.update(1 / 60, new THREE.Vector3(), style);
      reference.update(1 / 60, new THREE.Vector3(), style);
    }
    rig.controls.mapView = false;
    rig.controls.cameraX = rig.controls.cameraY = 0;
    rig.update(1 / 60, new THREE.Vector3(), style);
    reference.update(1 / 60, new THREE.Vector3(), style);
    assert.ok(rig.camera.position.distanceTo(reference.camera.position) < 1e-8);
    assert.ok(rig.camera.quaternion.angleTo(reference.camera.quaternion) < 1e-7);
    assert.equal(rig.camera.near, reference.camera.near);
    assert.equal(rig.camera.far, reference.camera.far);
  }
});

test('cabin offsets oppose measured acceleration on all three car-local axes, including a tilted car', () => {
  for (const rotation of [
    new THREE.Quaternion(),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.35, 1.2, 0.25)),
  ]) {
    for (const [axis, movement] of [
      ['x', cabinCameraMotion.lateralMovement],
      ['y', cabinCameraMotion.verticalMovement],
      ['z', cabinCameraMotion.longitudinalMovement],
    ]) {
      for (const sign of [-1, 1]) {
        const rig = cabinRig(rotation);
        const localAcceleration = new THREE.Vector3();
        localAcceleration[axis] = sign * 9.81;
        const acceleration = localAcceleration.applyQuaternion(rotation);
        for (let i = 0; i < 60; i++) rig.update(1 / 60, acceleration);
        const expected = new THREE.Vector3();
        expected[axis] = -sign * movement;
        assert.ok(
          rig.offset().distanceTo(expected) < 1e-6,
          `${axis}, ${sign}: ${rig.offset().toArray()}`,
        );
        const direction = rig.camera
          .getWorldDirection(new THREE.Vector3())
          .applyQuaternion(rotation.clone().invert());
        if (axis === 'z') assert.equal(Math.sign(direction.y), sign);
        assert.equal(rig.mirrorAims(), 1);
      }
    }
  }
});

test('cabin motion is consistent at different and varying frame rates', () => {
  const offsets = [];
  const rotations = [];
  for (const steps of [[1 / 30], [1 / 60], [1 / 144], [1 / 48, 1 / 90, 1 / 35, 1 / 144]]) {
    const rig = cabinRig();
    const acceleration = new THREE.Vector3(5, -3, 7);
    let elapsed = 0;
    let frame = 0;
    while (elapsed < 1 - 1e-9) {
      const dt = Math.min(steps[frame++ % steps.length], 1 - elapsed);
      rig.update(dt, acceleration);
      elapsed += dt;
    }
    offsets.push(rig.offset());
    rotations.push(rig.camera.quaternion.clone());
  }
  for (let i = 1; i < offsets.length; i++) {
    assert.ok(offsets[i].distanceTo(offsets[0]) < 1e-8);
    assert.ok(rotations[i].angleTo(rotations[0]) < 1e-7);
  }
});

test('cabin motion is bounded during impacts and settles at constant velocity without re-aiming mirrors', () => {
  const rig = cabinRig();
  const limits = new THREE.Vector3(
    cabinCameraMotion.lateralMovement,
    cabinCameraMotion.verticalMovement,
    cabinCameraMotion.longitudinalMovement,
  ).multiplyScalar(cabinCameraMotion.maxGForce);
  const steps = [1 / 144, 1 / 30, 0.05, 0.5];
  for (let i = 0; i < 120; i++) {
    const dt = steps[i % steps.length];
    const direction = i % 2 ? -1 : 1;
    rig.velocity.addScalar(direction * 10000);
    rig.update(dt);
    const offset = rig.offset();
    for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs(offset[axis]) <= limits[axis] + 1e-8);
    assert.ok(rig.camera.quaternion.toArray().every(Number.isFinite));
  }
  for (let i = 0; i < 180; i++) rig.update(1 / 60);
  assert.ok(rig.offset().length() < 1e-8);
  assert.equal(rig.mirrorAims(), 1);
  rig.driving.setCabinEye(rig.eye.clone().add(new THREE.Vector3(0, 0.01, 0)));
  assert.equal(rig.mirrorAims(), 2);
  for (let i = 0; i < 60; i++) rig.update(1 / 60, new THREE.Vector3(9.81, 0, 0));
  assert.equal(rig.mirrorAims(), 2);
});

test('initialization and resets do not interpret existing speed or teleports as head acceleration', () => {
  const rig = cabinRig();
  for (let i = 0; i < 60; i++) rig.update(1 / 60, new THREE.Vector3(9.81, 9.81, 9.81));
  assert.ok(rig.offset().length() > 0.02);
  rig.car.chassis.position.set(-500, 50, 250);
  rig.velocity.set(40, -5, -20);
  rig.driving.reset(0);
  rig.update(1 / 60);
  assert.ok(rig.offset().length() < 1e-8);
  rig.update(0);
  assert.ok(rig.offset().length() < 1e-8);
  for (let i = 0; i < 60; i++) rig.update(1 / 60);
  assert.ok(rig.offset().length() < 1e-8);
});

test('head motion continues through map view and preserves manual look controls', () => {
  const rig = cabinRig();
  const reference = cabinRig();
  const acceleration = new THREE.Vector3(-4, 2, 6);
  rig.controls.mapView = true;
  for (let i = 0; i < 60; i++) {
    rig.update(1 / 60, acceleration);
    reference.update(1 / 60, acceleration);
  }
  rig.controls.mapView = false;
  rig.update(1 / 60, acceleration);
  reference.update(1 / 60, acceleration);
  assert.ok(rig.camera.position.distanceTo(reference.camera.position) < 1e-8);
  assert.ok(rig.camera.quaternion.angleTo(reference.camera.quaternion) < 1e-7);
  rig.controls.lookBehind = true;
  for (let i = 0; i < 60; i++) rig.update(1 / 60, acceleration);
  assert.ok(rig.camera.getWorldDirection(new THREE.Vector3()).z < -0.99);
  assert.equal(rig.mirrorAims(), 1);
});

test('vertical camera velocity does not change any chase camera framing', () => {
  for (const style of ['classic', 'fpv']) {
    const rig = cabinRig();
    const reference = cabinRig();
    rig.velocity.set(4, 12, 10);
    reference.velocity.set(4, 0, 10);
    for (let i = 0; i < 60; i++) {
      rig.driving.update(1 / 60, rig.velocity, 'drift', style, false);
      reference.driving.update(1 / 60, reference.velocity, 'drift', style, false);
    }
    assert.ok(rig.camera.position.distanceTo(reference.camera.position) < 1e-8);
    assert.ok(rig.camera.quaternion.angleTo(reference.camera.quaternion) < 1e-7);
  }
});

test('fpv drone chases along the course through drifts and banks into turns', () => {
  const definition = courses.find((course) => course.id === 'hillside');
  const route = courseRoute(definition);
  const car = { chassis: new THREE.Group(), aimMirrors() {} };
  const controls = {
    mapView: false,
    mapZoom: 0,
    mapWheelZoom: 0,
    mapDragX: 0,
    mapDragY: 0,
    cameraX: 0,
    cameraY: 0,
    lookBehind: false,
  };
  const camera = new THREE.PerspectiveCamera();
  const driving = createDrivingCamera(camera, car, controls, definition, { heightAt: () => -100 });
  const speed = 20;
  const length = route.getLength();
  const tangent = new THREE.Vector3();
  let distance = 0;
  const place = () => {
    route.getPointAt((distance / length) % 1, car.chassis.position);
    route
      .getTangentAt((distance / length) % 1, tangent)
      .setY(0)
      .normalize();
    // Sideways drift: the body points 50 degrees off the direction of travel.
    car.chassis.rotation.set(0, Math.atan2(tangent.x, tangent.z) + 0.9, 0);
  };
  place();
  driving.reset(Math.atan2(tangent.x, tangent.z));
  driving.update(1 / 60, tangent.clone().multiplyScalar(speed), 'drift', 'fpv', false);
  assert.equal(camera.fov, fpvCameraMotion.fov);
  let maxBank = 0;
  for (let i = 0; i < 600; i++) {
    distance += speed / 60;
    place();
    const velocity = tangent.clone().multiplyScalar(speed);
    driving.update(1 / 60, velocity, 'drift', 'fpv', false);
    const behind = camera.position.clone().sub(car.chassis.position).setY(0).normalize();
    if (i > 120) {
      // Trailing the drifting body's heading instead would put this near -cos(0.9) ≈ -0.62.
      assert.ok(behind.dot(tangent) < -0.9, 'drone trails along the course, not the body');
    }
    const left = new THREE.Vector3(tangent.z, 0, -tangent.x);
    const turn = route.getTangentAt(((distance + 8) / length) % 1, new THREE.Vector3());
    const turning = tangent.x * turn.z - tangent.z * turn.x;
    if (Math.abs(turning) > 0.1 && i > 120) {
      assert.equal(Math.sign(camera.up.dot(left)), -Math.sign(turning), 'banks into the turn');
    }
    maxBank = Math.max(maxBank, Math.acos(camera.up.y));
  }
  assert.ok(maxBank > 0.05 && maxBank <= fpvCameraMotion.maxBank + 1e-6);
});
