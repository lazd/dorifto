import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';

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
  const rearLightMeshes: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[] = [];
  const tintedMeshes: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[] = [];
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    if (!Array.isArray(object.material)
      && (object.material.name === 'numberplate.001' || object.material.name === 'plastic.003')) {
      const positions = object.geometry.getAttribute('position');
      const index = object.geometry.getIndex();
      const rear: number[] = [];
      const point = new THREE.Vector3();
      for (let i = 0; i < (index?.count ?? positions.count); i += 3) {
        const triangle = [0, 1, 2].map((j) => index ? index.getX(i + j) : i + j);
        let z = 0;
        for (const v of triangle) z += point.fromBufferAttribute(positions, v).applyMatrix4(object.matrixWorld).z;
        if (z < 0) rear.push(...triangle);
      }
      object.geometry = object.geometry.clone();
      object.geometry.setIndex(rear);
      object.geometry.computeBoundingSphere();
    }
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
    if (object.material instanceof THREE.MeshStandardMaterial && object.material.name === 'Material.011') {
      rearLightMeshes.push(object);
    }
    if (object.material instanceof THREE.MeshStandardMaterial && object.material.name === 'Material.003') {
      tintedMeshes.push(object);
    }
  });

  const clearLensCover = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, transparent: true, opacity: 0.12, depthWrite: false,
    roughness: 0.18, metalness: 0, specularIntensity: 0.15,
    envMapIntensity: 0.15, side: THREE.DoubleSide,
  });
  const coverMaterials = [clearLensCover.clone(), clearLensCover.clone(), clearLensCover.clone()];
  function setCoverLit(material: THREE.MeshPhysicalMaterial, lit: boolean) {
    material.color.set(lit ? 0xffffff : 0x101216);
    material.opacity = lit ? 0.06 : 0.35;
  }
  coverMaterials.forEach((material) => setCoverLit(material, false));
  const lensSamples: { center: THREE.Vector3; group: number }[] = [];
  for (const mesh of rearLightMeshes) {
    const positions = mesh.geometry.getAttribute('position');
    const uv = mesh.geometry.getAttribute('uv');
    const index = mesh.geometry.getIndex();
    for (let i = 0; i < (index?.count ?? positions.count); i += 3) {
      const center = new THREE.Vector3();
      let u = 0;
      for (let j = 0; j < 3; j++) {
        const v = index ? index.getX(i + j) : i + j;
        center.add(new THREE.Vector3().fromBufferAttribute(positions, v));
        u += uv.getX(v) / 3;
      }
      center.divideScalar(3);
      if (center.y > 4.8 && center.z > 1.7) {
        lensSamples.push({ center: center.applyMatrix4(mesh.matrixWorld), group: u < 1 / 3 ? 2 : u < 2 / 3 ? 1 : 0 });
      }
    }
  }
  if (!lensSamples.length) throw new Error('Missing rear lens geometry for cover tint.');
  for (const mesh of tintedMeshes) {
    const positions = mesh.geometry.getAttribute('position');
    const index = mesh.geometry.getIndex();
    const glass: number[] = [];
    const covers: number[][] = [[], [], [], []];
    const headlightTint = mesh.material.clone();
    headlightTint.opacity *= 0.5;
    const point = new THREE.Vector3();
    for (let i = 0; i < (index?.count ?? positions.count); i += 3) {
      const triangle = [0, 1, 2].map((j) => index ? index.getX(i + j) : i + j);
      const center = new THREE.Vector3();
      for (const v of triangle) center.add(point.fromBufferAttribute(positions, v));
      center.divideScalar(3);
      // Separate lamp covers from the shared black window-glass material.
      if (center.y < -3.9) {
        covers[3].push(...triangle);
      } else if (center.y > 4.8 && center.z > 1.7) {
        center.applyMatrix4(mesh.matrixWorld);
        let nearest = lensSamples[0];
        for (const sample of lensSamples) {
          if (sample.center.distanceToSquared(center) < nearest.center.distanceToSquared(center)) nearest = sample;
        }
        covers[nearest.group].push(...triangle);
      } else glass.push(...triangle);
    }
    if (!covers.some((indices) => indices.length)) continue;
    covers.forEach((indices, group) => {
      if (!indices.length) return;
      const geometry = mesh.geometry.clone();
      geometry.setIndex(indices);
      geometry.applyMatrix4(mesh.matrixWorld);
      geometry.computeBoundingSphere();
      const cover = new THREE.Mesh(geometry, group === 3 ? headlightTint : coverMaterials[group]);
      cover.name = group === 3 ? 'headlight-covers' : `rear-light-cover-${group}`;
      chassis.add(cover);
    });
    mesh.geometry = mesh.geometry.clone();
    mesh.geometry.setIndex(glass);
    mesh.geometry.computeBoundingSphere();
  }

  const brakeMaterials: { material: THREE.MeshStandardMaterial; restingColor: number; running: boolean }[] = [];
  const brakeLights: THREE.SpotLight[] = [];
  const signalMaterials: { material: THREE.MeshStandardMaterial; front: boolean }[] = [];
  const markerMaterials: THREE.MeshStandardMaterial[] = [];
  const reverseMaterials: THREE.MeshStandardMaterial[] = [];
  const reverseLights: THREE.SpotLight[] = [];
  const reverseCounts = [0, 0, 0, 0];
  const brakeCounts = [0, 0, 0];
  for (const mesh of rearLightMeshes) {
    const positions = mesh.geometry.getAttribute('position');
    const uv = mesh.geometry.getAttribute('uv');
    const index = mesh.geometry.getIndex();
    const parts: number[][] = [[], [], [], [], [], [], [], [], [], [], []];
    const point = new THREE.Vector3();
    for (let i = 0; i < (index?.count ?? positions.count); i += 3) {
      const triangle = [0, 1, 2].map((j) => index ? index.getX(i + j) : i + j);
      const center = new THREE.Vector3();
      let u = 0;
      for (const v of triangle) {
        center.add(point.fromBufferAttribute(positions, v));
        u += uv.getX(v);
      }
      center.divideScalar(3);
      u /= 3;
      // The atlas's middle third is red; exclude amber/clear lenses and bumper reflectors.
      const brakeLens = u > 1 / 3 && u < 2 / 3 && center.y > 4.8 && center.z > 1.8;
      const reverseLens = u < 1 / 3 && center.y > 4.8 && center.z > 1.8;
      const sideMarker = u < 1 / 3 && center.y > -3 && center.y < 0;
      const part = sideMarker ? 9 : u > 2 / 3 ? center.y < 0 ? 10 : 8 : brakeLens ? center.z > 2.2 ? 3 : center.x < 0 ? 1 : 2
        : reverseLens ? 4 + (center.x > 0 ? 2 : 0) + (center.z > 1.98 ? 1 : 0) : 0;
      parts[part].push(...triangle);
    }
    mesh.geometry = mesh.geometry.clone();
    mesh.geometry.setIndex(parts[0]);
    mesh.geometry.computeBoundingSphere();
    for (let part = 1; part < parts.length; part++) {
      if (!parts[part].length) continue;
      const geometry = mesh.geometry.clone();
      geometry.setIndex(parts[part]);
      geometry.applyMatrix4(mesh.matrixWorld);
      geometry.computeBoundingSphere();
      const material = mesh.material.clone();
      if (part >= 8) {
        material.map = null;
        material.color.set(0xdce1e6);
        material.metalness = 0.15;
        material.roughness = 0.25;
        material.emissive.set(0x000000);
        material.emissiveIntensity = 0;
        material.toneMapped = false;
        if (part === 9) markerMaterials.push(material);
        else signalMaterials.push({ material, front: part === 10 });
        const lens = new THREE.Mesh(geometry, material);
        lens.name = part === 9 ? 'side-marker-lenses'
          : part === 10 ? 'front-turn-signal-lenses' : 'rear-turn-signal-lenses';
        chassis.add(lens);
        continue;
      }
      const reverse = part >= 4;
      const restingColor = reverse ? 0xbfc6ca : part === 3 ? 0x65070b : 0xc52025;
      material.color.set(restingColor);
      material.metalness = 0;
      material.roughness = 0.25;
      material.emissive.set(reverse ? 0xfff6df : 0xff0000);
      material.emissiveIntensity = 0;
      material.toneMapped = false;
      const lens = new THREE.Mesh(geometry, material);
      lens.name = reverse ? `reverse-light-${part - 3}` : `brake-light-${part}`;
      chassis.add(lens);
      if (reverse) {
        reverseMaterials.push(material);
        reverseCounts[part - 4] += parts[part].length;
      } else {
        brakeMaterials.push({ material, restingColor, running: part !== 3 });
        brakeCounts[part - 1] += parts[part].length;
      }
      const bounds = new THREE.Box3();
      for (const vertex of parts[part]) {
        bounds.expandByPoint(point.fromBufferAttribute(geometry.getAttribute('position'), vertex));
      }
      const light = new THREE.SpotLight(reverse ? 0xfff6df : 0xff0000, 0, 4, Math.PI / 5, 0.9, 2);
      light.position.copy(bounds.getCenter(new THREE.Vector3()));
      light.position.z = bounds.min.z - 0.18;
      light.target.position.set(light.position.x, light.position.y - 0.35, light.position.z - 2.5);
      light.castShadow = true;
      light.shadow.mapSize.set(256, 256);
      light.shadow.camera.near = 0.03;
      light.shadow.normalBias = 0.015;
      light.visible = false;
      chassis.add(light, light.target);
      (reverse ? reverseLights : brakeLights).push(light);
    }
  }
  if (brakeCounts.some((count) => count === 0)) throw new Error('Missing brake light lenses in the car model.');
  if (reverseCounts.some((count) => count === 0)) throw new Error('Missing reverse light lenses in the car model.');
  if (!signalMaterials.length) throw new Error('Missing turn signal lenses in the car model.');
  if (!markerMaterials.length) throw new Error('Missing side marker lenses in the car model.');
  let headlightsOn = false;
  const headlights: THREE.SpotLight[] = [];
  const projectors: THREE.MeshStandardMaterial[] = [];
  let brakingActive = false;
  let hazardsActive = false;
  function setHazards(illuminated: boolean) {
    hazardsActive = illuminated;
    setCoverLit(coverMaterials[0], illuminated);
    for (const { material, front } of signalMaterials) {
      const running = headlightsOn && front;
      const lit = illuminated || running;
      material.color.set(lit ? 0xff9900 : 0xdce1e6);
      material.emissive.set(0xff8800);
      material.emissiveIntensity = illuminated ? 1 : running ? 0.25 : 0;
    }
  }
  function setReversing(reversing: boolean) {
    setCoverLit(coverMaterials[2], reversing);
    for (const material of reverseMaterials) {
      material.color.set(reversing ? 0xffffff : 0xbfc6ca);
      material.emissiveIntensity = reversing ? 5 : 0;
    }
    for (const light of reverseLights) {
      light.intensity = reversing ? 4 : 0;
      light.visible = reversing;
    }
  }
  function setBraking(braking: boolean) {
    brakingActive = braking;
    setCoverLit(coverMaterials[1], braking || headlightsOn);
    for (const { material, restingColor, running } of brakeMaterials) {
      const runningLit = headlightsOn && running;
      material.color.set(braking ? 0xff0000 : runningLit ? 0xc52025 : restingColor);
      material.emissive.set(braking ? 0xff0804 : 0xff0000);
      material.emissiveIntensity = braking ? 6 : runningLit ? 0.4 : 0;
    }
    for (const light of brakeLights) {
      light.intensity = braking ? 8 : 0;
      light.visible = braking;
    }
  }

  RectAreaLightUniformsLib.init();
  const underglow: THREE.RectAreaLight[] = [];
  const lightStrips = [
    { x: -0.76, z: 0, width: 0.08, length: 1.6 },
    { x: 0.76, z: 0, width: 0.08, length: 1.6 },
    { x: 0, z: 1.95, width: 1.5, length: 0.08 },
    { x: 0, z: -1.95, width: 1.5, length: 0.08 },
  ];
  for (const strip of lightStrips) {
    const light = new THREE.RectAreaLight(0xff1824, 18, strip.width, strip.length);
    light.name = 'red-underglow';
    light.position.set(strip.x, -0.25, strip.z);
    light.rotation.x = -Math.PI / 2;
    light.visible = false;
    chassis.add(light);
    underglow.push(light);
  }
  function setLighting(enabled: boolean, underglowEnabled: boolean) {
    headlightsOn = enabled;
    setBraking(brakingActive);
    setHazards(hazardsActive);
    for (const material of markerMaterials) {
      material.color.set(enabled ? 0xff9900 : 0xdce1e6);
      material.emissive.set(0xff8800);
      material.emissiveIntensity = enabled ? 0.4 : 0;
    }
    silver.emissiveIntensity = enabled ? 0.7 : 0;
    for (const material of projectors) material.emissiveIntensity = enabled ? 3 : 0;
    for (const light of headlights) light.visible = enabled;
    for (const light of underglow) light.visible = underglowEnabled;
  }

  const mirrors: Reflector[] = [];
  const headlightBounds = [new THREE.Box3(), new THREE.Box3()];
  const silver = new THREE.MeshStandardMaterial({
    color: 0xdce1e6, metalness: 0.92, roughness: 0.18,
    emissive: 0xfff3dc, emissiveIntensity: 0.7,
  });
  const highBeamSilver = silver.clone();
  highBeamSilver.emissiveIntensity = 0;
  for (const mesh of detailMeshes) {
    const positions = mesh.geometry.getAttribute('position');
    const index = mesh.geometry.getIndex();
    const parts: number[][] = [[], [], [], [], []];
    const point = new THREE.Vector3();
    for (let i = 0; i < (index?.count ?? positions.count); i += 3) {
      const triangle = [0, 1, 2].map((j) => index ? index.getX(i + j) : i + j);
      const center = new THREE.Vector3();
      for (const v of triangle) center.add(point.fromBufferAttribute(positions, v));
      center.divideScalar(3);
      // These are the supplied OBJ's local axes, before its glTF axis conversion.
      const part = center.y < -3.9 ? Math.abs(center.x + 0.047) < 1.2 ? 4 : 1
        : Math.abs(center.x) > 2.1 && center.y > -0.6 ? center.x < 0 ? 2 : 3 : 0;
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
      if (part === 1 || part === 4) {
        const insert = new THREE.Mesh(geometry, part === 4 ? highBeamSilver : silver);
        insert.name = part === 4 ? 'high-beam-inserts' : 'low-beam-inserts';
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
    const light = new THREE.SpotLight(0xfff3dc, 1100, 65, Math.PI / 7, 0.55, 1.2);
    light.name = 'headlight-beam';
    headlights.push(light);
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
    projectors.push(projector.material);
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
  // Preserve underbody clearance while covering the actual roof, hatch and spoiler.
  const collisionPoints: THREE.Vector3[] = [];
  for (const x of [-0.86, 0.86]) {
    for (const y of [-0.23, 0.23]) {
      for (const z of [-2.02, 2.02]) collisionPoints.push(new THREE.Vector3(x, y, z));
    }
  }
  chassis.updateMatrixWorld(true);
  chassis.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || object.material.name !== 'Material.001') return;
    const positions = object.geometry.getAttribute('position');
    const index = object.geometry.getIndex();
    const used = new Set<number>();
    for (let i = 0; i < (index?.count ?? positions.count); i++) {
      const v = index ? index.getX(i) : i;
      if (used.has(v)) continue;
      used.add(v);
      const point = new THREE.Vector3().fromBufferAttribute(positions, v).applyMatrix4(object.matrixWorld);
      if (point.y >= 0) collisionPoints.push(point);
    }
  });
  if (collisionPoints.length === 8) throw new Error('Missing car body geometry for collision hull.');
  const hull = new ConvexHull().setFromPoints(collisionPoints);
  const collisionVertices = new Set<THREE.Vector3>();
  for (const face of hull.faces) {
    let edge = face.edge;
    do {
      collisionVertices.add(edge.head().point);
      edge = edge.next;
    } while (edge !== face.edge);
  }
  return { chassis, wheels, centers, radii, widths, collisionVertices: [...collisionVertices],
    setBraking, setReversing, setHazards, setLighting };
}
