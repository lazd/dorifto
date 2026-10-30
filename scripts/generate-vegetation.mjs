#!/usr/bin/env node
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import * as THREE from 'three';
import draco from 'draco3dgltf';
import { createServer } from 'vite';

const output = new URL('../src/vegetation-assets/', import.meta.url);
const library = new URL('../node_modules/@dgreenheck/ez-tree/', import.meta.url);
await mkdir(output, { recursive: true });

// EZ-Tree eagerly loads textures. This geometry-only offline pass never decodes images.
const loadTexture = THREE.TextureLoader.prototype.load;

function packed(geometry) {
  return {
    position: Array.from(
      geometry.getAttribute('position').array,
      (n) => Math.round(n * 10000) / 10000,
    ),
    normal: Array.from(geometry.getAttribute('normal').array, (n) => Math.round(n * 10000) / 10000),
    uv: Array.from(geometry.getAttribute('uv').array, (n) => Math.round(n * 10000) / 10000),
    index: Array.from(geometry.index.array),
  };
}

const models = {};
const generator = await createServer({
  cacheDir: 'node_modules/.vite-vegetation-generator',
  configFile: false,
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
});
THREE.TextureLoader.prototype.load = () => new THREE.Texture();
try {
  const { generateVegetationModels } = await generator.ssrLoadModule('/src/vegetation-presets.ts');
  for (const [species, parts] of Object.entries(await generateVegetationModels())) {
    models[species] = {};
    for (const [part, geometry] of Object.entries(parts)) {
      models[species][part] = packed(geometry);
      console.log(`${species} ${part}: ${geometry.index.count / 3} triangles`);
      geometry.dispose();
    }
  }
} finally {
  THREE.TextureLoader.prototype.load = loadTexture;
  await generator.close();
}

for (const [source, target] of [
  ['src/lib/assets/leaves/pine_color.png', 'pine.png'],
  ['src/lib/assets/leaves/oak_color.png', 'oak.png'],
  ['src/lib/assets/leaves/aspen_color.png', 'aspen.png'],
  ['src/lib/assets/leaves/ash_color.png', 'ash.png'],
  ['src/lib/assets/bark/birch_color_1k.jpg', 'aspen-bark.jpg'],
  ['src/lib/assets/bark/pine_color_1k.jpg', 'bark.jpg'],
  ['LICENSE', 'EZ-TREE-LICENSE.txt'],
])
  await copyFile(new URL(source, library), new URL(target, output));

const decoderModule = await draco.createDecoderModule({});
const revision = 'dcf309bd86bd521083d9c70f01f2de45fdc7c457';
const demo = `https://raw.githubusercontent.com/dgreenheck/ez-tree/${revision}/src/app/public/models/`;
for (const name of ['rock1', 'rock2', 'rock3']) {
  const response = await fetch(`${demo}${name}.glb`);
  if (!response.ok) throw new Error(`Could not download ${name}: ${response.status}`);
  const file = Buffer.from(await response.arrayBuffer());
  const jsonLength = file.readUInt32LE(12);
  const json = JSON.parse(file.subarray(20, 20 + jsonLength).toString());
  const binary = file.subarray(28 + jsonLength);
  const primitive = json.meshes[0].primitives[0];
  const geometry = new THREE.BufferGeometry();
  const compressed = primitive.extensions?.KHR_draco_mesh_compression;
  if (compressed) {
    const view = json.bufferViews[compressed.bufferView];
    const bytes = binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    const decoder = new decoderModule.Decoder();
    const buffer = new decoderModule.DecoderBuffer();
    const mesh = new decoderModule.Mesh();
    buffer.Init(bytes, bytes.length);
    try {
      const status = decoder.DecodeBufferToMesh(buffer, mesh);
      if (!status.ok()) throw new Error(`Invalid Draco mesh: ${status.error_msg()}`);
      for (const [semantic, attributeName, size] of [
        ['POSITION', 'position', 3],
        ['NORMAL', 'normal', 3],
        ['TEXCOORD_0', 'uv', 2],
      ]) {
        const attribute = decoder.GetAttributeByUniqueId(mesh, compressed.attributes[semantic]);
        const values = new decoderModule.DracoFloat32Array();
        try {
          decoder.GetAttributeFloatForAllPoints(mesh, attribute, values);
          geometry.setAttribute(
            attributeName,
            new THREE.Float32BufferAttribute(
              Array.from({ length: values.size() }, (_, i) => values.GetValue(i)),
              size,
            ),
          );
        } finally {
          decoderModule.destroy(values);
        }
      }
      const face = new decoderModule.DracoInt32Array();
      const indices = [];
      try {
        for (let i = 0; i < mesh.num_faces(); i++) {
          decoder.GetFaceFromMesh(mesh, i, face);
          indices.push(face.GetValue(0), face.GetValue(1), face.GetValue(2));
        }
      } finally {
        decoderModule.destroy(face);
      }
      geometry.setIndex(indices);
    } finally {
      decoderModule.destroy(mesh);
      decoderModule.destroy(buffer);
      decoderModule.destroy(decoder);
    }
  } else {
    for (const [semantic, attributeName, size] of [
      ['POSITION', 'position', 3],
      ['NORMAL', 'normal', 3],
      ['TEXCOORD_0', 'uv', 2],
      ['indices', 'index', 1],
    ]) {
      const accessor =
        json.accessors[semantic === 'indices' ? primitive.indices : primitive.attributes[semantic]];
      const view = json.bufferViews[accessor.bufferView];
      const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
      const bytes = binary.subarray(
        offset,
        offset + accessor.count * size * (accessor.componentType === 5126 ? 4 : 2),
      );
      const values = Array.from({ length: accessor.count * size }, (_, i) =>
        accessor.componentType === 5126 ? bytes.readFloatLE(i * 4) : bytes.readUInt16LE(i * 2),
      );
      if (attributeName === 'index') geometry.setIndex(values);
      else geometry.setAttribute(attributeName, new THREE.Float32BufferAttribute(values, size));
    }
  }
  const node = json.nodes.find((item) => item.mesh === 0);
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3().fromArray(node.translation ?? [0, 0, 0]),
    new THREE.Quaternion().fromArray(node.rotation ?? [0, 0, 0, 1]),
    new THREE.Vector3().fromArray(node.scale ?? [1, 1, 1]),
  );
  geometry.applyMatrix4(matrix);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const height = 0.8;
  const scale = height / (box.max.y - box.min.y);
  geometry
    .translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2)
    .scale(scale, scale, scale);
  models[name] = packed(geometry);
  geometry.dispose();
  const material = json.materials[primitive.material];
  const colorIndex = material.pbrMetallicRoughness.baseColorTexture.index;
  const texture = json.textures[colorIndex];
  const image = json.images[texture.extensions?.EXT_texture_webp?.source ?? texture.source];
  const view = json.bufferViews[image.bufferView];
  if (name === 'rock1') {
    await writeFile(
      new URL(`${name}.webp`, output),
      binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength),
    );
  }
}
await writeFile(new URL('models.json', output), `${JSON.stringify(models)}\n`);
console.log(`Vegetation generated in ${output.pathname}`);
