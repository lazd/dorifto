import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import * as THREE from 'three';

test('shared vegetation stays within mesh budgets and applies detail, density and culling live', async () => {
  const server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  const load = THREE.TextureLoader.prototype.load;
  const plants = new THREE.Group();
  THREE.TextureLoader.prototype.load = () => new THREE.Texture();
  try {
    const { addVegetation, setVegetationDetail, vegetationDetails } =
      await server.ssrLoadModule('/src/vegetation.ts');
    const { isVegetationDetail, createConfigurationState } = await server.ssrLoadModule(
      '/src/configuration-state.ts',
    );
    const entries = {
      matrices: Array.from({ length: 12 }, (_, i) =>
        new THREE.Matrix4().makeTranslation(i * 2, 0, 0),
      ),
      shades: Array.from({ length: 12 }, (_, i) => i / 12),
    };
    addVegetation(plants, { trees: entries, bush: entries, rocks: entries });
    const lods = [],
      cover = [];
    for (const root of [plants])
      root.traverse((object) => {
        if (object instanceof THREE.LOD) lods.push(object);
        if (!(object instanceof THREE.InstancedMesh)) return;
        assert.notEqual(object.name, 'grass-clumps');
        assert.ok(object.geometry.getAttribute('normal'));
        assert.ok(object.geometry.getAttribute('uv'));
        assert.ok(object.geometry.index.count / 3 <= 2000, object.name);
        if (object.userData.groundCoverCount) cover.push(object);
      });
    assert.equal(lods.filter((lod) => lod.userData.vegetationKind === 'trees').length, 3);
    for (const detail of Object.keys(vegetationDetails)) {
      setVegetationDetail(plants, detail);
      for (const mesh of cover) {
        assert.equal(
          mesh.count,
          Math.ceil(mesh.userData.groundCoverCount * vegetationDetails[detail].density),
        );
      }
      for (const lod of lods.filter((lod) => lod.userData.vegetationKind === 'trees')) {
        assert.equal(lod.levels[1].distance, vegetationDetails[detail].near);
        assert.equal(lod.levels.at(-1).distance, vegetationDetails[detail].trees);
        assert.equal(lod.levels[1].object.children[0].geometry.index.count / 3, 4);
        assert.equal(lod.levels[1].object.children[0].castShadow, false);
      }
    }
    plants.updateMatrixWorld(true);
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(5000, 0, 5000);
    camera.updateMatrixWorld(true);
    for (const lod of lods) {
      lod.update(camera);
      assert.equal(lod.levels.at(-1).object.visible, true);
      assert.equal(lod.levels[0].object.visible, false);
    }
    assert.equal(createConfigurationState().getState().vegetationDetail, 'medium');
    assert.ok(isVegetationDetail('high'));
    assert.equal(isVegetationDetail('unlimited'), false);
  } finally {
    THREE.TextureLoader.prototype.load = load;
    const resources = new Set();
    for (const root of [plants])
      root.traverse((object) => {
        if (!object.isMesh) return;
        resources.add(object.geometry);
        resources.add(object.material);
        if (object.material.map) resources.add(object.material.map);
        if (object.isInstancedMesh) object.dispose();
      });
    resources.forEach((resource) => resource.dispose());
    await server.close();
  }
});
