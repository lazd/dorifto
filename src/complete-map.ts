import { completeMapSize } from './scenery-data';
import type { GPSPoint } from './track-conversion.mjs';

export interface CompleteMapDimensions {
  width: number;
  height: number;
}

export const defaultCompleteMapDimensions: CompleteMapDimensions = {
  width: completeMapSize,
  height: completeMapSize,
};
export const maximumCompleteMapArea = completeMapSize ** 2;

export function validateCompleteMapDimensions(dimensions: CompleteMapDimensions) {
  if (
    !dimensions ||
    !Number.isFinite(dimensions.width) ||
    !Number.isFinite(dimensions.height) ||
    dimensions.width <= 0 ||
    dimensions.height <= 0 ||
    dimensions.width * dimensions.height > maximumCompleteMapArea + 0.001
  )
    throw new Error('Complete-map dimensions must be positive with an area of at most 6.25 km².');
}

export function completeMapBounds(
  points: readonly GPSPoint[],
  dimensions = defaultCompleteMapDimensions,
) {
  const origin = points[0];
  if (!origin) return;
  const metersPerLongitude = (6371008.8 * Math.PI * Math.cos((origin.lat * Math.PI) / 180)) / 180;
  const metersPerDegree = (6371008.8 * Math.PI) / 180;
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (const point of points) {
    const x = (point.lon - origin.lon) * metersPerLongitude;
    const z = (point.lat - origin.lat) * metersPerDegree;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  return {
    origin,
    metersPerLongitude,
    metersPerDegree,
    centerX,
    centerZ,
    west: centerX - dimensions.width / 2,
    east: centerX + dimensions.width / 2,
    south: centerZ - dimensions.height / 2,
    north: centerZ + dimensions.height / 2,
    fits: maxX - minX <= dimensions.width + 0.001 && maxZ - minZ <= dimensions.height + 0.001,
  };
}

export function completeMapCorners(
  points: readonly GPSPoint[],
  dimensions = defaultCompleteMapDimensions,
  padding = 0,
): GPSPoint[] {
  const bounds = completeMapBounds(points, dimensions);
  if (!bounds) throw new Error('Complete-map terrain requires selected course points.');
  return [
    [bounds.west - padding, bounds.south - padding],
    [bounds.east + padding, bounds.south - padding],
    [bounds.east + padding, bounds.north + padding],
    [bounds.west - padding, bounds.north + padding],
  ].map(([x, z]) => ({
    lat: bounds.origin.lat + z / bounds.metersPerDegree,
    lon: bounds.origin.lon + x / bounds.metersPerLongitude,
  }));
}
