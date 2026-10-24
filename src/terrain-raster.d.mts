export interface GeographicRaster {
  west: number;
  east: number;
  south: number;
  north: number;
  columns: number;
  rows: number;
  /** Row-major absolute elevations, starting at the northwest pixel. */
  heights: readonly number[];
}

export function geographicRasterSampler(
  raster: GeographicRaster,
): (lat: number, lon: number) => number;
