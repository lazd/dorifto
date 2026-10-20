import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const WHEEL_MATERIALS = new Set([
  'Material.004', 'brake_disc1', 'brake_disc', 'nothing.', 'rubber.001',
]);

export async function loadCar() {
  const { scene: model } = await new GLTFLoader().loadAsync(
    `${import.meta.env.BASE_URL}nissan_fairlady_300zx_z32_1989/scene.gltf`,
  );
  const chassis = new THREE.Group();
  chassis.add(model);
  let bounds = new THREE.Box3().setFromObject(model);
  model.scale.setScalar(4.52 / bounds.getSize(new THREE.Vector3()).z);
  bounds = new THREE.Box3().setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  model.position.set(-center.x, -bounds.min.y - 0.55, -center.z);
  chassis.updateMatrixWorld(true);

  const wheelMeshes: THREE.Mesh<THREE.BufferGeometry, THREE.Material>[] = [];
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      if (material.name === 'Material.001' || material.name === 'Material.005') {
        material.color.set(0xb90816);
        material.metalness = 0.65;
        material.roughness = 0.28;
      } else if (material.name === 'Material.004') {
        material.color.set(0x111216);
        material.metalness = 0.35;
        material.roughness = 0.6;
      }
    }
    if (!Array.isArray(object.material) && WHEEL_MATERIALS.has(object.material.name)) {
      wheelMeshes.push(object);
    }
  });

  // This export merges all four wheels per material. Partition triangles in
  // normalized chassis space: front left/right, then rear left/right (+Z front).
  const wheels = Array.from({ length: 4 }, () => new THREE.Group());
  const tireBounds = wheels.map(() => new THREE.Box3());
  const vertex = new THREE.Vector3();
  for (const mesh of wheelMeshes) {
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    const positions = geometry.getAttribute('position');
    const index = geometry.getIndex();
    const partitions: number[][] = [[], [], [], []];
    for (let i = 0; i < (index?.count ?? positions.count); i += 3) {
      const triangle = [0, 1, 2].map((j) => index ? index.getX(i + j) : i + j);
      let x = 0;
      let z = 0;
      for (const v of triangle) {
        x += positions.getX(v);
        z += positions.getZ(v);
      }
      const wheel = (z > 0 ? 0 : 2) + (x > 0 ? 1 : 0);
      partitions[wheel].push(...triangle);
      if (mesh.material.name === 'rubber.001') {
        for (const v of triangle) {
          tireBounds[wheel].expandByPoint(vertex.fromBufferAttribute(positions, v));
        }
      }
    }
    partitions.forEach((indices, i) => {
      const part = geometry.clone();
      part.setIndex(indices);
      part.computeBoundingSphere();
      const visual = new THREE.Mesh(part, mesh.material);
      visual.castShadow = true;
      wheels[i].add(visual);
    });
    geometry.dispose();
    mesh.removeFromParent();
  }

  const centers = tireBounds.map((box) => {
    if (box.isEmpty()) throw new Error('The car model is missing expected wheel geometry.');
    return box.getCenter(new THREE.Vector3());
  });
  const radii = tireBounds.map((box) => box.getSize(new THREE.Vector3()).y / 2);
  wheels.forEach((wheel, i) => {
    for (const object of wheel.children) object.position.copy(centers[i]).negate();
  });
  return { chassis, wheels, centers, radii };
}
