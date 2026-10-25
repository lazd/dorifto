import { courseRoute, type CourseDefinition } from './courses';
import { routeLength } from './road-selection';
import type { GPSPoint } from './track-conversion.mjs';

export const roadBuildSteps = {
  starting: 'Starting the course builder',
  terrain: 'Downloading USGS terrain elevation',
  corridor: 'Downloading high-resolution road corridor',
  course: 'Sampling road elevation and building the course',
  preview: 'Building the 3D terrain preview',
  saving: 'Saving the course on this device',
} as const;

export type RoadBuildStep = keyof typeof roadBuildSteps;

export interface RoadDraft {
  sections: GPSPoint[][];
  closingSection?: GPSPoint[];
  resolution: number;
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
