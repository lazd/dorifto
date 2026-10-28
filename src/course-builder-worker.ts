import { fetchTerrainDetail, fetchTerrainRaster } from './terrain-import.mjs';
import {
  convertTrack,
  terrainElevationProfile,
  type GPSPoint,
  type TrackSource,
} from './track-conversion.mjs';
import { validateImportRoute } from './road-selection';
import type { CourseDefinition } from './courses';
import { createCoursePreviewModel } from './course-preview-3d';
import type { CoursePreviewColors } from './course-preview-3d';
import type { PreviewModel } from './course-builder-preview';
import type { RoadMap, RoadDraft, RoadBuildStep } from './course-builder-data';
import { matchRoadStructures } from './road-structures.mjs';
import { fetchCourseScenery } from './scenery-import';
import { sceneryImportRevision } from './scenery-data';

export interface BuildRequest {
  points: GPSPoint[];
  name: string;
  width: number;
  shoulderWidth: number;
  id?: string;
  existingCourse?: RoadMap;
  draft: RoadDraft;
  terrainTransition: number;
  doubleYellow: boolean;
  colors: CoursePreviewColors;
  closed: boolean;
  skipPreview: boolean;
}

export type BuildResponse =
  | { type: 'progress'; step: RoadBuildStep }
  | { type: 'complete'; course: RoadMap; json: Blob; model?: PreviewModel }
  | { type: 'preview'; model: PreviewModel }
  | { type: 'error'; message: string };

function progress(step: RoadBuildStep) {
  self.postMessage({ type: 'progress', step } satisfies BuildResponse);
}

async function build(request: BuildRequest) {
  validateImportRoute(request.points, request.closed);
  if (
    !request.name.trim() ||
    !Number.isFinite(request.width) ||
    request.width < 3 ||
    request.width > 30
  )
    throw new Error('Enter a name and a road width between 3 and 30 m');
  if (
    !Number.isFinite(request.shoulderWidth) ||
    request.shoulderWidth < 0 ||
    request.shoulderWidth > 10
  )
    throw new Error('Enter a shoulder width between 0 and 10 m');
  if (!Number.isFinite(request.terrainTransition) || request.terrainTransition < 1)
    throw new Error('Enter a terrain transition of at least 1 m');
  const structures = matchRoadStructures(
    request.points,
    request.draft.structureLines ?? [],
    request.closed,
  );
  const data: TrackSource = {
    slug: request.id ?? request.existingCourse?.id ?? `road-${crypto.randomUUID()}`,
    display_name: request.name.trim(),
    closed: request.closed,
    featured_lap: { points: request.points },
    structures,
  };
  const settings = {
    width: request.width,
    shoulderWidth: request.shoulderWidth,
    terrainTransition: request.terrainTransition,
    doubleYellow: request.doubleYellow,
  };
  if (request.closed && request.points.length < 9) {
    const subdivisions = Math.ceil(8 / (request.points.length - 1));
    data.featured_lap.points = request.points.flatMap((point, i, points) => {
      const next = points[i + 1];
      if (!next) return [point];
      return Array.from({ length: subdivisions }, (_, step) => ({
        lat: point.lat + ((next.lat - point.lat) * step) / subdivisions,
        lon: point.lon + ((next.lon - point.lon) * step) / subdivisions,
      }));
    });
  }
  let course: RoadMap;
  if (request.existingCourse) {
    progress('course');
    course = {
      ...request.existingCourse,
      name: request.name.trim(),
      width: request.width,
      shoulderWidth: request.shoulderWidth,
      terrainTransition: request.terrainTransition,
      doubleYellow: request.doubleYellow,
    };
    if (
      course.terrain &&
      structures.length &&
      JSON.stringify(structures) !== JSON.stringify(course.structures)
    ) {
      data.terrain = course.terrain;
      data.elevation = terrainElevationProfile(data);
      const repaired = convertTrack(data, settings);
      course.elevation = repaired.elevation;
      course.structures = structures;
      course.terrain = { ...course.terrain, elevationOffset: repaired.terrain!.elevationOffset };
    }
  } else {
    try {
      progress('terrain');
      data.terrain = await fetchTerrainRaster(data, { resolution: 5 });
      progress('corridor');
      data.terrain.detail = await fetchTerrainDetail(data);
    } catch (error) {
      throw new Error("Sorry, we couldn't fetch elevation data. Try a different location.", {
        cause: error,
      });
    }
    progress('course');
    data.elevation = terrainElevationProfile(data);
    course = convertTrack(data, settings);
    course.attribution =
      'OpenStreetMap contributors (ODbL): https://www.openstreetmap.org/copyright; vector tiles by OpenFreeMap; elevation: USGS 3DEP';
  }
  const includeNearbyRoads = request.draft.includeNearbyRoads ?? false;
  course.courseBuilder = { ...request.draft, includeNearbyRoads };
  if (
    course.scenery?.importRevision !== sceneryImportRevision ||
    (includeNearbyRoads && !request.existingCourse?.courseBuilder?.includeNearbyRoads)
  ) {
    progress('scenery');
    course.scenery = await fetchCourseScenery(course, includeNearbyRoads);
  } else if (!includeNearbyRoads && course.scenery.roads.length) {
    course.scenery = { ...course.scenery, roads: [] };
  }
  if (!course.attribution?.includes('OpenStreetMap'))
    course.attribution = [
      course.attribution,
      'OpenStreetMap contributors (ODbL): https://www.openstreetmap.org/copyright; vector tiles by OpenFreeMap',
    ]
      .filter(Boolean)
      .join('; ');
  const json = new Blob([JSON.stringify(course)], { type: 'application/json' });
  if (request.skipPreview) {
    self.postMessage({ type: 'complete', course, json } satisfies BuildResponse);
    return;
  }
  progress('preview');
  const preview = createCoursePreviewModel(course, request.colors, 512);
  try {
    self.postMessage({
      type: 'complete',
      course,
      json,
      model: preview.group.toJSON(),
    } satisfies BuildResponse);
  } finally {
    preview.dispose();
  }
}

self.onmessage = (
  event: MessageEvent<
    BuildRequest | { type: 'preview'; course: CourseDefinition; colors: CoursePreviewColors }
  >,
) => {
  const request = event.data;
  const run = async () => {
    if ('type' in request) {
      const preview = createCoursePreviewModel(request.course, request.colors, 512);
      try {
        self.postMessage({
          type: 'preview',
          model: preview.group.toJSON(),
        } satisfies BuildResponse);
      } finally {
        preview.dispose();
      }
    } else await build(request);
  };
  run().catch((error: unknown) => {
    console.error('Course builder failed:', error);
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    } satisfies BuildResponse);
  });
};
