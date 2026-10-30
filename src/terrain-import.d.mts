import type { TrackSource } from './track-conversion.mjs';
import type { GeographicRaster } from './terrain-raster.mjs';
import type { GeographicDownloadCache } from './geographic-download.mjs';

interface TerrainOptions {
  resolution?: number;
  margin?: number;
  width?: number;
  fetch?: typeof fetch;
  cache?: GeographicDownloadCache;
  onProgress?: (completed: number, total: number) => void;
}

export function fetchTerrainRaster(
  data: TrackSource,
  options?: TerrainOptions,
): Promise<GeographicRaster & { source: string; resolution: number }>;
export function fetchTerrainDetail(
  data: TrackSource,
  options?: TerrainOptions,
): Promise<NonNullable<GeographicRaster['detail']>>;
