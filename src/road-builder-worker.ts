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
import type { PreviewModel } from './road-builder-preview';
import type { RoadMap, RoadDraft } from './road-builder-data';

export interface BuildRequest {
  points: GPSPoint[];
  name: string;
  width: number;
  shoulderWidth: number;
  id?: string;
  draft: RoadDraft;
  terrainTransition: number;
  doubleYellow: boolean;
  colors: CoursePreviewColors;
  closed: boolean;
}

export type BuildResponse =
  | { type: 'progress'; message: string }
  | { type: 'complete'; course: RoadMap; json: Blob; model: PreviewModel }
  | { type: 'preview'; model: PreviewModel }
  | { type: 'error'; message: string };

function progress(message: string) {
  self.postMessage({ type: 'progress', message } satisfies BuildResponse);
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
  const data: TrackSource = {
    slug: request.id ?? `road-${crypto.randomUUID()}`,
    display_name: request.name.trim(),
    closed: request.closed,
    featured_lap: { points: request.points },
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
  progress('Downloading USGS terrain elevation...');
  data.terrain = await fetchTerrainRaster(data, { resolution: 5 });
  progress('Downloading high-resolution road corridor...');
  data.terrain.detail = await fetchTerrainDetail(data);
  progress('Sampling road elevation and building the course...');
  data.elevation = terrainElevationProfile(data);
  const course: RoadMap = convertTrack(data, {
    width: request.width,
    shoulderWidth: request.shoulderWidth,
    terrainTransition: request.terrainTransition,
    doubleYellow: request.doubleYellow,
  });
  course.roadBuilder = request.draft;
  course.attribution =
    'OpenStreetMap contributors (ODbL): https://www.openstreetmap.org/copyright; vector tiles by OpenFreeMap; elevation: USGS 3DEP';
  const json = new Blob([JSON.stringify(course)], { type: 'application/json' });
  progress('Building the 3D terrain preview...');
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
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    } satisfies BuildResponse);
  });
};
