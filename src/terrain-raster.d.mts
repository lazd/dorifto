export interface GeographicRasterBounds {
  west: number;
  east: number;
  south: number;
  north: number;
  columns: number;
  rows: number;
}

export interface GeographicRaster extends GeographicRasterBounds {
  /** Row-major absolute elevations, starting at the northwest pixel. */
  heights: readonly number[];
  /** High-resolution heights kept only near the road. */
  detail?: TerrainDetail;
}

export interface TerrainDetail extends GeographicRasterBounds {
  resolution: number;
  /** Distance from the road centerline covered by detail heights, in meters. */
  width: number;
  /** Row runs of absolute elevations: `[row, column, ...heights]`. */
  runs: readonly (readonly number[])[];
}

export function geographicRasterSampler(
  raster: GeographicRaster,
): (lat: number, lon: number, roadDistance?: number) => number;
