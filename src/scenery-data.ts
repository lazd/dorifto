/** Saved map scenery in the course's local meter coordinates, independent of driving direction. */
export type SceneryPoint = [number, number];
export type SceneryPolygon = SceneryPoint[][];

export interface CourseScenery {
  version: 1;
  importRevision?: number;
  buildings: { rings: SceneryPolygon; height: number }[];
  water: { rings: SceneryPolygon }[];
  waterways: { points: SceneryPoint[]; width: number }[];
  vegetation: { rings: SceneryPolygon; kind: 'trees' | 'scrub' | 'grass' }[];
  roads: { points: SceneryPoint[]; width: number }[];
}

export const sceneryImportRevision = 2;

export type SceneryCategory = 'buildings' | 'water' | 'vegetation' | 'nearbyRoads';

export function validateCourseScenery(value: CourseScenery) {
  const point = (p: SceneryPoint) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
  const line = (points: SceneryPoint[]) =>
    Array.isArray(points) && points.length >= 2 && points.every(point);
  const polygon = (rings: SceneryPolygon) =>
    Array.isArray(rings) &&
    rings.length > 0 &&
    rings.every((ring) => line(ring) && ring.length >= 3);
  const width = (n: number) => Number.isFinite(n) && n > 0 && n <= 100;
  if (
    !value ||
    value.version !== 1 ||
    !Array.isArray(value.buildings) ||
    !Array.isArray(value.water) ||
    !Array.isArray(value.waterways) ||
    !Array.isArray(value.vegetation) ||
    !Array.isArray(value.roads) ||
    !value.buildings.every(
      (b) => b && polygon(b.rings) && Number.isFinite(b.height) && b.height > 0 && b.height <= 1000,
    ) ||
    !value.water.every((w) => w && polygon(w.rings)) ||
    !value.waterways.every((w) => w && line(w.points) && width(w.width)) ||
    !value.vegetation.every(
      (v) => v && polygon(v.rings) && ['trees', 'scrub', 'grass'].includes(v.kind),
    ) ||
    !value.roads.every((r) => r && line(r.points) && width(r.width))
  )
    throw new Error('Invalid saved course scenery');
}
