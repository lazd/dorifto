/** Coarsen only distant terrain; unit-spaced boundaries keep adjacent patches watertight. */
export function terrainVisualIndices(
  columns: number,
  rows: number,
  roadDistances: Float32Array,
  spacing: number,
  detailedCell: (x: number, z: number) => readonly number[],
) {
  // Road queries cap distances at 50 m. Extend a conservative distance field so
  // larger patches are allowed only well beyond the detailed roadside band.
  const distances = Float32Array.from(roadDistances, (distance) =>
    distance < 32 ? distance : Infinity,
  );
  for (const direction of [1, -1]) {
    for (let z = direction === 1 ? 0 : rows - 1; z >= 0 && z < rows; z += direction) {
      for (let x = direction === 1 ? 0 : columns - 1; x >= 0 && x < columns; x += direction) {
        const i = z * columns + x;
        const previousX = x - direction;
        if (previousX >= 0 && previousX < columns)
          distances[i] = Math.min(distances[i], distances[z * columns + previousX] + spacing);
        const previousZ = z - direction;
        if (previousZ < 0 || previousZ >= rows) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (x + dx < 0 || x + dx >= columns) continue;
          distances[i] = Math.min(distances[i], distances[previousZ * columns + x + dx] + spacing);
        }
      }
    }
  }
  const indices: number[] = [];
  const patch = (x: number, z: number, size: number) => {
    if (size === 1) {
      indices.push(...detailedCell(x, z));
      return;
    }
    let distant = x + size < columns && z + size < rows;
    const clearance = size <= 32 ? 32 : size * spacing * 2;
    const patchDistances = size <= 32 ? roadDistances : distances;
    for (let dz = 0; distant && dz <= size; dz++)
      for (let dx = 0; dx <= size; dx++)
        if (patchDistances[(z + dz) * columns + x + dx] < clearance) {
          distant = false;
          break;
        }
    if (distant) {
      const center = (z + size / 2) * columns + x + size / 2;
      for (let i = 0; i < size; i++) {
        const top = z * columns + x + i;
        const bottom = (z + size) * columns + x + i;
        const left = (z + i) * columns + x;
        const right = left + size;
        indices.push(center, top + 1, top, center, bottom, bottom + 1);
        indices.push(center, left, left + columns, center, right + columns, right);
      }
      return;
    }
    const half = size / 2;
    for (const dz of [0, half])
      for (const dx of [0, half])
        if (x + dx < columns - 1 && z + dz < rows - 1) patch(x + dx, z + dz, half);
  };
  for (let z = 0; z < rows - 1; z += 128)
    for (let x = 0; x < columns - 1; x += 128) patch(x, z, 128);
  return new Uint32Array(indices);
}
