import * as THREE from 'three';

const tolerance = 1e4;

/**
 * Indexes a non-indexed geometry, sharing vertices whose attributes agree to 1e-4, like three's
 * `mergeVertices` but with integer hashing, which is several times faster on large road meshes.
 */
export function mergeVertices(geometry: THREE.BufferGeometry) {
  const names = Object.keys(geometry.attributes);
  const attributes = names.map((name) => geometry.getAttribute(name) as THREE.BufferAttribute);
  const count = attributes[0].count;
  const width = attributes.reduce((sum, attribute) => sum + attribute.itemSize, 0);
  const quantized = new Int32Array(count * width);
  for (let i = 0; i < count; i++) {
    let k = i * width;
    for (const { array, itemSize } of attributes)
      for (let c = 0; c < itemSize; c++)
        quantized[k++] = Math.trunc(array[i * itemSize + c] * tolerance + 0.5);
  }
  const slots = 2 ** Math.ceil(Math.log2(Math.max(2, count * 2)));
  const table = new Int32Array(slots).fill(-1);
  const sources: number[] = [];
  const indices = new Uint32Array(count);
  for (let i = 0; i < count; i++) {
    let hash = 0;
    for (let k = i * width; k < (i + 1) * width; k++)
      hash = Math.imul(hash ^ quantized[k], 0x9e3779b1) ^ (hash >>> 15);
    let slot = hash & (slots - 1);
    for (;;) {
      const unique = table[slot];
      if (unique < 0) {
        table[slot] = indices[i] = sources.length;
        sources.push(i);
        break;
      }
      const j = sources[unique];
      let same = true;
      for (let k = 0; k < width && same; k++)
        same = quantized[i * width + k] === quantized[j * width + k];
      if (same) {
        indices[i] = unique;
        break;
      }
      slot = (slot + 1) & (slots - 1);
    }
  }
  const merged = new THREE.BufferGeometry();
  names.forEach((name, n) => {
    const { array, itemSize, normalized } = attributes[n];
    const copy = new (array.constructor as Float32ArrayConstructor)(sources.length * itemSize);
    sources.forEach((source, unique) => {
      for (let c = 0; c < itemSize; c++) copy[unique * itemSize + c] = array[source * itemSize + c];
    });
    merged.setAttribute(name, new THREE.BufferAttribute(copy, itemSize, normalized));
  });
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  merged.boundingSphere = geometry.boundingSphere?.clone() ?? null;
  return merged;
}
