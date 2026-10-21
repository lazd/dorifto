export function terrainBaseHeight(x: number, z: number) {
  return 5 * Math.sin(x / 65) + 4 * Math.sin(z / 75) + 2 * Math.cos((x + z) / 90);
}
