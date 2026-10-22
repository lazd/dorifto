import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import * as THREE from 'three';
import { createServer } from 'vite';

let server;
let createGhostCar;

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  ({ createGhostCar } = await server.ssrLoadModule('/src/ghost-car.ts'));
});

after(async () => {
  await server?.close();
});

test('proximity fading is subtle in chase view, full in cabin view, and updates on switching', () => {
  const chassis = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  body.name = 'Body2_Paint';
  chassis.add(body);
  const scene = new THREE.Scene();
  const ghost = createGhostCar(scene, { chassis, wheels: [] });
  const material = ghost.chassis.children[1].material;
  const player = new THREE.Vector3();
  ghost.visible = true;

  for (const [distance, opacity] of [
    [0, 0.266],
    [2.5, 0.266],
    [4.75, 0.323],
    [7, 0.38],
    [20, 0.38],
  ]) {
    ghost.chassis.position.set(distance, 0, 0);
    ghost.fadeNear(player, false);
    assert.ok(Math.abs(material.opacity - opacity) < 1e-10);
    assert.equal(ghost.visible, true);
  }

  for (const [distance, opacity] of [
    [0, 0],
    [2.5, 0],
    [4.75, 0.19],
    [7, 0.38],
    [20, 0.38],
  ]) {
    ghost.chassis.position.set(distance, 0, 0);
    ghost.fadeNear(player, true);
    assert.equal(material.opacity, opacity);
  }

  ghost.chassis.position.copy(player);
  ghost.fadeNear(player, true);
  assert.equal(material.opacity, 0);
  ghost.fadeNear(player, false);
  assert.ok(Math.abs(material.opacity - 0.266) < 1e-10);
  ghost.fadeNear(player, true);
  assert.equal(material.opacity, 0);
});
