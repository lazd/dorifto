import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export async function loadTrainingCarModel(server) {
  const { normalizeCarModel } = await server.ssrLoadModule('/src/car-geometry.ts');
  const source = JSON.parse(
    await readFile(new URL('../models/nissan_300zx/scene.gltf', import.meta.url), 'utf8'),
  );
  // Physics requires geometry only; skip browser-only image loading and materials.
  delete source.images;
  delete source.textures;
  delete source.materials;
  for (const mesh of source.meshes)
    for (const primitive of mesh.primitives) delete primitive.material;
  for (const buffer of source.buffers) {
    const bytes = await readFile(new URL(`../models/nissan_300zx/${buffer.uri}`, import.meta.url));
    buffer.uri = `data:application/octet-stream;base64,${bytes.toString('base64')}`;
  }
  if (!globalThis.ProgressEvent) {
    globalThis.ProgressEvent = class ProgressEvent extends Event {
      constructor(type, init) {
        super(type);
        Object.assign(this, init);
      }
    };
  }
  const { scene } = await new GLTFLoader().parseAsync(JSON.stringify(source), '');
  normalizeCarModel(scene);
  return scene;
}

export async function loadTrainingCarGeometry(server) {
  const { carPhysicsGeometry } = await server.ssrLoadModule('/src/car-geometry.ts');
  const scene = await loadTrainingCarModel(server);
  const geometry = carPhysicsGeometry(scene);
  scene.traverse((object) => {
    if (!object.isMesh) return;
    object.geometry.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material])
      material.dispose();
  });
  return geometry;
}
