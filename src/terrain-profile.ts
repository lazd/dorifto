import { geographicRasterSampler, type GeographicRaster } from './terrain-raster.mjs';

export function terrainBaseHeight(x: number, z: number) {
  return 5 * Math.sin(x / 65) + 4 * Math.sin(z / 75) + 2 * Math.cos((x + z) / 90);
}

export interface TerrainRaster extends GeographicRaster {
  source: string;
  resolution: number;
  originLat: number;
  originLon: number;
  metersPerLongitude: number;
  elevationOffset: number;
}

export function terrainRasterSampler(raster: TerrainRaster) {
  const sample = geographicRasterSampler(raster);
  if (
    ![raster.originLat, raster.originLon, raster.metersPerLongitude, raster.elevationOffset].every(
      Number.isFinite,
    ) ||
    raster.metersPerLongitude <= 0
  )
    throw new Error('Invalid terrain elevation raster');
  const metersPerDegree = (6371008.8 * Math.PI) / 180;
  return (x: number, z: number) => {
    const lon = raster.originLon - x / raster.metersPerLongitude;
    const lat = raster.originLat + z / metersPerDegree;
    return sample(lat, lon) - raster.elevationOffset;
  };
}
