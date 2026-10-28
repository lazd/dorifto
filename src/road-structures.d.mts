import type { GPSPoint } from './track-conversion.mjs';

export interface RoadStructure {
  type: 'bridge' | 'tunnel';
  /** Arc-length fractions of the forward geographic route. */
  start: number;
  end: number;
}

export interface RoadStructureLine {
  type: RoadStructure['type'];
  coordinates: readonly (readonly number[])[];
}

export function matchRoadStructures(
  points: readonly GPSPoint[],
  lines: readonly RoadStructureLine[],
  closed?: boolean,
): RoadStructure[];
export function repairStructureElevation(
  heights: readonly number[],
  spacing: number,
  structures: readonly RoadStructure[],
  closed?: boolean,
): number[];
