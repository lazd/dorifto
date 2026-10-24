export function terrainBaseHeight(x: number, z: number) {
  return 5 * Math.sin(x / 65) + 4 * Math.sin(z / 75) + 2 * Math.cos((x + z) / 90);
}

export interface TerrainRaster {
  source: string;
  resolution: number;
  west: number;
  east: number;
  south: number;
  north: number;
  columns: number;
  rows: number;
  /** Row-major absolute elevations, starting at the northwest pixel. */
  heights: readonly number[];
  originLat: number;
  originLon: number;
  metersPerLongitude: number;
  elevationOffset: number;
}

export function terrainRasterSampler(raster: TerrainRaster) {
  const { columns, rows, heights } = raster;
  if (
    !Number.isInteger(columns) ||
    columns < 2 ||
    !Number.isInteger(rows) ||
    rows < 2 ||
    heights.length !== columns * rows ||
    !heights.every(Number.isFinite) ||
    ![
      raster.west,
      raster.east,
      raster.south,
      raster.north,
      raster.originLat,
      raster.originLon,
      raster.metersPerLongitude,
      raster.elevationOffset,
    ].every(Number.isFinite) ||
    raster.east <= raster.west ||
    raster.north <= raster.south ||
    raster.metersPerLongitude <= 0
  )
    throw new Error('Invalid terrain elevation raster');
  const metersPerDegree = (6371008.8 * Math.PI) / 180;
  return (x: number, z: number) => {
    const lon = raster.originLon - x / raster.metersPerLongitude;
    const lat = raster.originLat + z / metersPerDegree;
    const gx = Math.max(
      0,
      Math.min(columns - 1, ((lon - raster.west) / (raster.east - raster.west)) * columns - 0.5),
    );
    const gy = Math.max(
      0,
      Math.min(rows - 1, ((raster.north - lat) / (raster.north - raster.south)) * rows - 0.5),
    );
    const ix = Math.min(Math.floor(gx), columns - 2);
    const iy = Math.min(Math.floor(gy), rows - 2);
    const u = gx - ix;
    const v = gy - iy;
    const a = heights[iy * columns + ix] * (1 - u) + heights[iy * columns + ix + 1] * u;
    const b = heights[(iy + 1) * columns + ix] * (1 - u) + heights[(iy + 1) * columns + ix + 1] * u;
    return a * (1 - v) + b * v - raster.elevationOffset;
  };
}
