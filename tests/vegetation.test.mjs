import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import * as THREE from 'three';

test('shared vegetation stays within mesh budgets and applies detail, density and culling live', async () => {
  const server = await createServer({
    cacheDir: 'node_modules/.vite-vegetation-test',
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  const load = THREE.TextureLoader.prototype.load;
  const plants = new THREE.Group();
  const parent = new THREE.Group();
  parent.position.set(8, 0, -12);
  parent.add(plants);
  THREE.TextureLoader.prototype.load = () => new THREE.Texture();
  try {
    const {
      addVegetation,
      setVegetationDetail,
      setVegetationMode,
      setVegetationTransition,
      setVegetationTime,
      vegetationDetails,
    } = await server.ssrLoadModule('/src/vegetation.ts');
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
    setVegetationMode(plants, 'quality');
    const lods = [],
      cover = [];
    for (const root of [plants])
      root.traverse((object) => {
        assert.equal(object.matrixAutoUpdate, false);
        assert.equal(object.matrixWorldAutoUpdate, false);
        if (object instanceof THREE.LOD) lods.push(object);
        if (!(object instanceof THREE.InstancedMesh)) return;
        assert.ok(object.matrixWorld.equals(parent.matrixWorld));
        assert.notEqual(object.name, 'grass-clumps');
        assert.ok(object.geometry.getAttribute('normal'));
        assert.ok(object.geometry.getAttribute('uv'));
        assert.ok(object.geometry.index.count / 3 <= 3000, object.name);
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
        assert.equal(lod.levels.at(-1).distance, Math.min(vegetationDetails[detail].trees, 600));
        assert.equal(lod.levels[1].object.children[0].geometry.index.count / 3, 4);
        assert.equal(lod.levels[1].object.children[0].castShadow, false);
      }
    }
    setVegetationMode(plants, 'performance');
    for (const lod of lods.filter((lod) => lod.userData.vegetationKind === 'trees')) {
      assert.equal(lod.levels[1].distance, 65);
      assert.equal(lod.levels.at(-1).distance, 300);
    }
    for (const mesh of cover) {
      let lod = mesh.parent;
      while (lod && !(lod instanceof THREE.LOD)) lod = lod.parent;
      const density = lod.userData.vegetationKind === 'bush' ? 0.6 : 1;
      assert.equal(mesh.count, Math.ceil(mesh.userData.groundCoverCount * density));
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
    const tree = lods.find((lod) => lod.userData.vegetationKind === 'trees');
    const bakedMaterial = tree.levels[1].object.children[0].material;
    for (const time of ['sunset', 'night', 'noon']) {
      setVegetationTime(plants, time);
      assert.equal(bakedMaterial.map, bakedMaterial.userData.vegetationAtlases[time]);
      assert.ok(bakedMaterial.map instanceof THREE.Texture);
    }
    const center = new THREE.Vector3().setFromMatrixPosition(tree.matrixWorld);
    camera.position.copy(center).add(new THREE.Vector3(65, 0, 0));
    camera.updateMatrixWorld(true);
    setVegetationTransition(plants, true);
    tree.update(camera);
    assert.equal(tree.levels[0].object.visible, true);
    assert.equal(tree.levels[1].object.visible, true);
    assert.equal(tree.levels[0].object.children[0].material.userData.vegetationRange.value, 65);
    setVegetationTransition(plants, false);
    tree.update(camera);
    assert.equal(tree.levels[0].object.visible, false);
    assert.equal(tree.levels[1].object.visible, true);
    setVegetationMode(plants, 'ultra');
    for (const detail of Object.keys(vegetationDetails)) {
      setVegetationDetail(plants, detail);
      const range = vegetationDetails[detail].ultraTrees;
      for (const distance of [65, range - 1, range + 1]) {
        camera.position.copy(center).add(new THREE.Vector3(distance, 0, 0));
        camera.updateMatrixWorld(true);
        tree.update(camera);
        assert.equal(tree.levels[0].object.visible, distance < range);
        assert.equal(tree.levels[1].object.visible, false);
      }
      assert.equal(
        tree.levels[0].object.children[0].count,
        Math.ceil(
          tree.levels[0].object.children[0].userData.groundCoverCount *
            vegetationDetails[detail].density,
        ),
      );
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
