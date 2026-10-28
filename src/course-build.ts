import { fetchTerrainDetail, fetchTerrainRaster } from './terrain-import.mjs';
import {
  convertTrack,
  terrainElevationProfile,
  type GPSPoint,
  type TrackSource,
} from './track-conversion.mjs';
import { validateImportRoute } from './road-selection';
import type { CoursePreviewColors } from './course-preview-3d';
import {
  restoreRoadDraft,
  roadDraftPoints,
  roadDraftWaypoints,
  type RoadMap,
  type RoadDraft,
  type RoadBuildStep,
} from './course-builder-data';
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

interface BuildOptions {
  rebuildTerrain?: boolean;
  refreshScenery?: boolean;
  progress?: (step: RoadBuildStep) => void;
  raster?: typeof fetchTerrainRaster;
  detail?: typeof fetchTerrainDetail;
  fetchScenery?: typeof fetchCourseScenery;
}

export async function buildRoadCourse(
  request: Omit<BuildRequest, 'colors' | 'skipPreview'>,
  {
    rebuildTerrain = false,
    refreshScenery = false,
    progress = () => {},
    raster = fetchTerrainRaster,
    detail = fetchTerrainDetail,
    fetchScenery = fetchCourseScenery,
  }: BuildOptions = {},
): Promise<RoadMap> {
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
  const structures =
    request.draft.structureLines === undefined && request.existingCourse
      ? (request.existingCourse.structures ?? [])
      : matchRoadStructures(request.points, request.draft.structureLines ?? [], request.closed);
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
  if (request.existingCourse && !rebuildTerrain) {
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
      data.terrain = await raster(data, { resolution: 5 });
      progress('corridor');
      data.terrain.detail = await detail(data);
    } catch (error) {
      throw new Error("Sorry, we couldn't fetch elevation data. Try a different location.", {
        cause: error,
      });
    }
    progress('course');
    data.elevation = terrainElevationProfile(data);
    const converted = convertTrack(data, settings);
    course = {
      ...request.existingCourse,
      ...converted,
      ...(request.existingCourse
        ? {
            venueName: request.existingCourse.venueName,
            configName: request.existingCourse.configName,
            location: request.existingCourse.location,
            coneSpacing: request.existingCourse.coneSpacing,
          }
        : {}),
    };
    course.attribution =
      'OpenStreetMap contributors (ODbL): https://www.openstreetmap.org/copyright; vector tiles by OpenFreeMap; elevation: USGS 3DEP';
  }
  const includeNearbyRoads = request.draft.includeNearbyRoads ?? false;
  course.courseBuilder = {
    ...request.draft,
    waypoints: request.draft.waypoints ?? roadDraftWaypoints(request.draft),
    includeNearbyRoads,
  };
  if (
    refreshScenery ||
    course.scenery?.importRevision !== sceneryImportRevision ||
    (includeNearbyRoads && !request.existingCourse?.courseBuilder?.includeNearbyRoads)
  ) {
    progress('scenery');
    course.scenery = await fetchScenery(course, includeNearbyRoads);
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
  return course;
}

export async function reimportRoadCourse(
  course: RoadMap,
  { full = false, ...options }: BuildOptions & { full?: boolean } = {},
) {
  if (!course.terrain) throw new Error(`${course.name}: no geographic terrain to reimport`);
  const includeNearbyRoads =
    course.courseBuilder?.includeNearbyRoads ??
    (course.scenery ? course.scenery.roads.length > 0 : true);
  if (!full) {
    const fetchScenery = options.fetchScenery ?? fetchCourseScenery;
    return { ...course, scenery: await fetchScenery(course, includeNearbyRoads) };
  }
  if (!course.courseBuilder)
    throw new Error(
      `${course.name}: missing saved builder waypoints; recreate this map in the course builder before a full reimport`,
    );
  const draft = { ...restoreRoadDraft(course), includeNearbyRoads };
  return buildRoadCourse(
    {
      points: roadDraftPoints(draft),
      draft,
      existingCourse: course,
      id: course.id,
      name: course.name,
      width: course.width,
      shoulderWidth: course.shoulderWidth ?? 1.6,
      terrainTransition: course.terrainTransition ?? 8,
      doubleYellow: course.doubleYellow ?? false,
      closed: !!draft.closingSection,
    },
    {
      ...options,
      rebuildTerrain: true,
      refreshScenery: true,
    },
  );
}
