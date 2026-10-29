import { courseRoute, type CourseDefinition } from './courses';
import { cleanRoadRoute, routeLength } from './road-selection';
import type { GPSPoint } from './track-conversion.mjs';
import type { RoadStructureLine } from './road-structures.mjs';
import { validateCourseScenery } from './scenery-data';
import { validateCompleteMapDimensions, type CompleteMapDimensions } from './complete-map';

export const roadBuildSteps = {
  starting: 'Starting the course builder',
  terrain: 'Downloading USGS terrain elevation data',
  course: 'Sampling road elevation and building the course',
  scenery: 'Downloading nearby roads, buildings, water and vegetation',
  network: 'Downloading OpenStreetMap road layout, stop signs and parking',
  corridor: 'Downloading high-resolution USGS road elevation data',
  saving: 'Saving the course on this device',
  preview: 'Building the 3D terrain preview',
} as const;

export type MapDefinition = 'course' | 'nearby-roads' | 'complete-map';

export type RoadBuildStep = keyof typeof roadBuildSteps;
export type RoadBuildState = 'active' | 'complete';
export type RoadBuildProgress = (
  step: RoadBuildStep,
  detail?: string,
  state?: RoadBuildState,
) => void;

export interface RoadDraft {
  sections: GPSPoint[][];
  /** Snapped user-selected waypoint positions, not samples of the exported centerline. */
  waypoints?: GPSPoint[];
  closingSection?: GPSPoint[];
  resolution: number;
  structureLines?: RoadStructureLine[];
  definition?: MapDefinition;
  completeMapDimensions?: CompleteMapDimensions;
  /** Legacy saved setting, retained for older maps. */
  includeNearbyRoads?: boolean;
}

export function roadMapDefinition(draft: RoadDraft): MapDefinition {
  return draft.definition ?? (draft.includeNearbyRoads ? 'nearby-roads' : 'course');
}

export function roadDraftPoints(draft: RoadDraft): GPSPoint[] {
  return cleanRoadRoute(
    [...draft.sections, ...(draft.closingSection ? [draft.closingSection] : [])].flatMap(
      (points, i) => (i ? points.slice(1) : points),
    ),
  );
}

export function roadDraftWaypoints(draft: RoadDraft): GPSPoint[] {
  return draft.sections.map((section) => ({ ...section.at(-1)! }));
}

export interface RoadMap extends CourseDefinition {
  courseBuilder?: RoadDraft;
}

export function readRoadMap(json: string): RoadMap {
  const value = JSON.parse(json) as RoadMap;
  if (
    !value ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    !Number.isFinite(value.width) ||
    !Array.isArray(value.points) ||
    value.points.length < 2 ||
    value.points.some(
      (point) => !Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite),
    )
  )
    throw new Error('Invalid saved course');
  if (value.scenery !== undefined) {
    validateCourseScenery(value.scenery);
  }
  if (
    value.courseBuilder?.definition !== undefined &&
    !['course', 'nearby-roads', 'complete-map'].includes(value.courseBuilder.definition)
  )
    throw new Error('Invalid saved map definition');
  if (value.courseBuilder?.completeMapDimensions !== undefined)
    validateCompleteMapDimensions(value.courseBuilder.completeMapDimensions);
  return value;
}

export function restoreRoadDraft(course: RoadMap): RoadDraft {
  if (course.courseBuilder) {
    const draft = structuredClone(course.courseBuilder);
    const parts = [...draft.sections, ...(draft.closingSection ? [draft.closingSection] : [])];
    if (
      !draft.sections.length ||
      parts.some(
        (part) =>
          !part.length ||
          part.some(
            (p) =>
              !Number.isFinite(p.lat) ||
              !Number.isFinite(p.lon) ||
              Math.abs(p.lat) > 85 ||
              Math.abs(p.lon) > 180,
          ),
      )
    )
      throw new Error('Saved course has invalid editable waypoints');
    return draft;
  }
  const terrain = course.terrain;
  if (
    !terrain ||
    ![terrain.originLat, terrain.originLon, terrain.metersPerLongitude].every(Number.isFinite) ||
    terrain.metersPerLongitude <= 0
  )
    throw new Error('This course has no geographic source for editing.');
  const points = course.points.map(([x, z]) => ({
    lat: terrain.originLat + z / ((6371008.8 * Math.PI) / 180),
    lon: terrain.originLon - x / terrain.metersPerLongitude,
  }));
  // Older exports contain road geometry, but not the original clicked waypoints.
  const sections: GPSPoint[][] = [[points[0]]];
  let section = [points[0]];
  for (const point of points.slice(1)) {
    section.push(point);
    if (routeLength(section) >= 200) {
      sections.push(section);
      section = [point];
    }
  }
  if (section.length > 1) sections.push(section);
  const closingSection = course.closed === false ? undefined : [points.at(-1)!, points[0]];
  return { sections, closingSection, resolution: terrain.resolution };
}

export function roadMapMeta(course: RoadMap) {
  return `${(courseRoute(course).getLength() / 1000).toFixed(2)} km · ${course.closed === false ? 'Open route' : 'Closed loop'}`;
}

export function roadMapThumbnail(course: RoadMap) {
  const bounds = course.points.reduce(
    (b, [x, z]) => ({
      minX: Math.min(b.minX, x),
      maxX: Math.max(b.maxX, x),
      minZ: Math.min(b.minZ, z),
      maxZ: Math.max(b.maxZ, z),
    }),
    { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
  );
  const scale = 46 / Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ, 1);
  const points = course.closed === false ? course.points : [...course.points, course.points[0]];
  return points
    .map(
      ([x, z]) =>
        `${33 - (x - (bounds.minX + bounds.maxX) / 2) * scale},${29 - (z - (bounds.minZ + bounds.maxZ) / 2) * scale}`,
    )
    .join(' ');
}
