import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import * as THREE from 'three';

test('visible smoke uses depth testing without an extra scene render', async () => {
  const server = await createServer({
    cacheDir: 'node_modules/.vite-smoke-test',
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  let smoke;
  try {
    const { TireSmoke } = await server.ssrLoadModule('/src/smoke.ts');
    const scene = new THREE.Scene();
    const chassis = new THREE.Group();
    scene.add(chassis);
    smoke = new TireSmoke(scene, chassis);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.y = 1;
    const wheels = Array.from({ length: 4 }, () => {
      const wheel = new THREE.Object3D();
      wheel.position.set(0, 0, -10);
      return wheel;
    });
    smoke.update(
      0.05,
      wheels,
      [true, true, true, true],
      true,
      new THREE.Vector3(),
      camera,
      [true, true, true, true],
      () => 0,
    );
    assert.ok(smoke.active);
    assert.ok(smoke.mesh.visible);
    const renderer = {
      getDrawingBufferSize: (size) => size.set(800, 600),
      render: () => assert.fail('Smoke must not render the scene again'),
    };
    assert.equal(smoke.captureDepth(renderer, scene, camera), null);
    assert.equal(smoke.mesh.material.uniforms.softDepth.value, false);
    assert.equal(smoke.mesh.material.depthTest, true);
    const shared = new THREE.DepthTexture(800, 600);
    assert.equal(smoke.captureDepth(renderer, scene, camera, false, shared), shared);
    assert.equal(smoke.mesh.material.uniforms.softDepth.value, true);
    shared.dispose();
  } finally {
    smoke?.dispose();
    await server.close();
  }
});
