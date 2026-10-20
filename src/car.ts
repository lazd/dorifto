import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Reflector } from 'three/addons/objects/Reflector.js';

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
  const detailMeshes: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[] = [];
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      if (material.name === 'Material.001' || material.name === 'Material.005') {
        material.color.set(0xe51b23);
        material.metalness = 0.25;
        material.roughness = 0.16;
        material.envMapIntensity = 0.3;
      } else if (material.name === 'Material.004') {
        material.color.set(0x111216);
        material.metalness = 0.35;
        material.roughness = 0.6;
      }
    }
    if (!Array.isArray(object.material) && WHEEL_MATERIALS.has(object.material.name)) {
      wheelMeshes.push(object);
    }
    if (object.material instanceof THREE.MeshStandardMaterial && object.material.name === 'Material.005') {
      detailMeshes.push(object);
    }
  });

  const mirrors: Reflector[] = [];
  const headlightBounds = [new THREE.Box3(), new THREE.Box3()];
  const silver = new THREE.MeshStandardMaterial({
    color: 0xdce1e6, metalness: 0.92, roughness: 0.18,
  });
  for (const mesh of detailMeshes) {
    const positions = mesh.geometry.getAttribute('position');
    const index = mesh.geometry.getIndex();
    const parts: number[][] = [[], [], [], []];
    const point = new THREE.Vector3();
    for (let i = 0; i < (index?.count ?? positions.count); i += 3) {
      const triangle = [0, 1, 2].map((j) => index ? index.getX(i + j) : i + j);
      const center = new THREE.Vector3();
      for (const v of triangle) center.add(point.fromBufferAttribute(positions, v));
      center.divideScalar(3);
      // These are the supplied OBJ's local axes, before its glTF axis conversion.
      const part = center.y < -3.9 ? 1 : Math.abs(center.x) > 2.1 && center.y > -0.6 ? center.x < 0 ? 2 : 3 : 0;
      parts[part].push(...triangle);
    }
    mesh.geometry = mesh.geometry.clone();
    mesh.geometry.setIndex(parts[0]);
    for (let part = 1; part < parts.length; part++) {
      if (!parts[part].length) continue;
      const geometry = mesh.geometry.clone();
      geometry.setIndex(parts[part]);
      geometry.applyMatrix4(mesh.matrixWorld);
      const selected = new THREE.Box3();
      const normalized = geometry.getAttribute('position');
      for (const i of parts[part]) {
        point.fromBufferAttribute(normalized, i);
        selected.expandByPoint(point);
        if (part === 1) headlightBounds[point.x < 0 ? 0 : 1].expandByPoint(point);
      }
      if (part === 1) {
        const insert = new THREE.Mesh(geometry, silver);
        insert.castShadow = true;
        chassis.add(insert);
      } else {
        const center = selected.getCenter(new THREE.Vector3());
        const normals = geometry.getAttribute('normal');
        const normal = new THREE.Vector3();
        for (const i of parts[part]) normal.add(point.fromBufferAttribute(normals, i));
        normal.normalize();
        if (normal.z > 0) normal.negate();
        const orientation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
        geometry.translate(-center.x, -center.y, -center.z);
        geometry.applyQuaternion(orientation.clone().invert());
        const mirror = new Reflector(geometry, {
          color: 0xe8efff, textureWidth: 512, textureHeight: 256, clipBias: 0.003, multisample: 0,
        });
        mirror.position.copy(center).addScaledVector(normal, 0.002);
        mirror.quaternion.copy(orientation);
        // Do not recursively render the other mirror in a reflection pass.
        const reflect = mirror.onBeforeRender;
        mirror.onBeforeRender = function (...args) {
          const others = mirrors.filter((other) => other !== mirror);
          others.forEach((other) => { other.visible = false; });
          try {
            reflect.apply(this, args);
          } finally {
            others.forEach((other) => { other.visible = true; });
          }
        };
        mirrors.push(mirror);
        chassis.add(mirror);
      }
    }
  }
  for (const bounds of headlightBounds) {
    if (bounds.isEmpty()) throw new Error('Missing headlight inserts in the car model.');
    const center = bounds.getCenter(new THREE.Vector3());
    const light = new THREE.SpotLight(0xfff3dc, 1800, 65, Math.PI / 7, 0.55, 1.2);
    light.position.set(center.x, center.y, bounds.max.z + 0.12);
    light.target.position.set(center.x * 1.5, center.y - 1.1, light.position.z + 20);
    light.castShadow = true;
    light.shadow.mapSize.set(512, 512);
    light.shadow.camera.near = 0.08;
    light.shadow.camera.far = 65;
    light.shadow.normalBias = 0.02;
    chassis.add(light, light.target);
    const projector = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 12, 8),
      new THREE.MeshStandardMaterial({
        color: 0xffffff, metalness: 0.5, roughness: 0.1,
        emissive: 0xffedca, emissiveIntensity: 3,
      }),
    );
    projector.position.copy(center);
    chassis.add(projector);
  }

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
  const widths = tireBounds.map((box) => box.getSize(new THREE.Vector3()).x);
  wheels.forEach((wheel, i) => {
    for (const object of wheel.children) object.position.copy(centers[i]).negate();
  });
  return { chassis, wheels, centers, radii, widths };
}
