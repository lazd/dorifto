import type { CourseDefinition } from './courses';
import type { GeographicRaster } from './terrain-raster.mjs';
import type { RoadStructure } from './road-structures.mjs';

export interface GPSPoint {
  lat: number;
  lon: number;
}

export interface TrackSource {
  slug: string;
  display_name?: string;
  closed: boolean;
  featured_lap: { points: GPSPoint[] };
  elevation?: {
    source: string;
    points: { dist_frac: number; altitude_m: number }[];
  };
  terrain?: GeographicRaster & { source: string; resolution: number };
  structures?: readonly RoadStructure[];
}

export const roadImportDefaults: { width: number; doubleYellow: boolean };
export function roadDistances(points: readonly GPSPoint[]): number[];
export function terrainElevationProfile(data: TrackSource): NonNullable<TrackSource['elevation']>;
export function convertTrack(
  data: TrackSource,
  options?: {
    width?: number;
    shoulderWidth?: number;
    terrainTransition?: number;
    doubleYellow?: boolean;
  },
): CourseDefinition;
export function projectLap(data: TrackSource): {
  unique: [number, number][];
  lat0: number;
  lon0: number;
  cosLat: number;
};
export function resampleLoop(
  points: [number, number][],
  spacing: number,
  closed?: boolean,
): { points: [number, number][]; length: number };
export function sampleProfile(
  points: { dist_frac: number; altitude_m: number }[],
  fraction: number,
): number;
