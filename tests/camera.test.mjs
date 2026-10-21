import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import * as THREE from 'three';
import { createServer } from 'vite';

let server;
let createDrivingCamera;
let courses;
let courseRoute;

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  ({ createDrivingCamera } = await server.ssrLoadModule('/src/camera.ts'));
  ({ courses, courseRoute } = await server.ssrLoadModule('/src/courses.ts'));
});

after(async () => {
  await server?.close();
});

for (const style of ['corner', 'classic', 'cabin']) {
  test(`${style}: map view snaps on and off in one frame and preserves the driving camera`, () => {
    const definition = courses.find((course) => course.id === 'hillside');
    const terrain = { heightAt: () => 0 };
    const car = { chassis: new THREE.Group(), aimMirrors() {} };
    car.chassis.position.set(20, 2, 10);
    const controls = { mapView: false, cameraX: 0, cameraY: 0, lookBehind: false };
    const referenceControls = { ...controls };
    const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 1500);
    const reference = camera.clone();
    const driving = createDrivingCamera(camera, car, controls, definition, terrain);
    const referenceDriving = createDrivingCamera(reference, car, referenceControls, definition, terrain);
    const velocity = new THREE.Vector3(0, 0, 10);
    const update = () => {
      driving.update(1 / 1000, velocity, 'drift', style, false);
      referenceDriving.update(1 / 1000, velocity, 'drift', style, false);
    };
    const assertDrivingPose = () => {
      assert.ok(camera.position.distanceTo(reference.position) < 1e-8);
      assert.ok(camera.quaternion.angleTo(reference.quaternion) < 1e-7);
      assert.equal(camera.near, reference.near);
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
    const height = 1.1 * Math.max(size.z / 2 / halfHeight, size.x / 2 / (halfHeight * camera.aspect));
    assert.ok(camera.position.distanceTo(new THREE.Vector3(center.x, bounds.max.y + height, center.z)) < 1e-8);
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
