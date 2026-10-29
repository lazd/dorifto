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
  roadMapDefinition,
  roadDraftPoints,
  roadDraftWaypoints,
  type MapDefinition,
  type RoadMap,
  type RoadDraft,
  type RoadBuildStep,
} from './course-builder-data';
import { matchRoadStructures } from './road-structures.mjs';
import { fetchCourseScenery, requestMappedNetwork } from './scenery-import';
import { sceneryImportRevision } from './scenery-data';
import { completeMapSize } from './scenery-data';

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

function completeMapCoordinates(points: readonly GPSPoint[]) {
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
  return { origin, metersPerLongitude, metersPerDegree, minX, maxX, minZ, maxZ };
}

function fitsCompleteMap(points: readonly GPSPoint[]) {
  const bounds = completeMapCoordinates(points);
  return (
    !bounds ||
    (bounds.maxX - bounds.minX <= completeMapSize && bounds.maxZ - bounds.minZ <= completeMapSize)
  );
}

function completeMapSquarePoints(points: readonly GPSPoint[], padding = 0): GPSPoint[] {
  const bounds = completeMapCoordinates(points);
  if (!bounds) throw new Error('Complete-map terrain requires selected course points.');
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;
  const half = completeMapSize / 2 + padding;
  return [
    [-half, -half],
    [half, -half],
    [half, half],
    [-half, half],
  ].map(([x, z]) => ({
    lat: bounds.origin.lat + (centerZ + z) / bounds.metersPerDegree,
    lon: bounds.origin.lon + (centerX + x) / bounds.metersPerLongitude,
  }));
}

interface BuildOptions {
  rebuildTerrain?: boolean;
  refreshScenery?: boolean;
  progress?: (step: RoadBuildStep, detail?: string) => void;
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
  const definition: MapDefinition = roadMapDefinition(request.draft);
  validateImportRoute(
    request.points,
    request.closed,
    definition === 'complete-map' ? Infinity : undefined,
  );
  if (definition === 'complete-map' && !fitsCompleteMap(request.points))
    throw new Error('Complete-map roads must fit inside the moving 5 × 5 km map square.');
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
  const previousDefinition = request.existingCourse?.courseBuilder
    ? roadMapDefinition(request.existingCourse.courseBuilder)
    : request.existingCourse?.scenery?.roads.length
      ? 'nearby-roads'
      : 'course';
  const fetchesScenery =
    refreshScenery ||
    request.existingCourse?.scenery?.importRevision !== sceneryImportRevision ||
    definition !== previousDefinition;
  // The Overpass query is the slowest download, so start it alongside terrain using a padded square.
  const square =
    definition === 'complete-map' && fetchesScenery
      ? completeMapSquarePoints(request.points, 50)
      : undefined;
  const network = square
    ? requestMappedNetwork({
        south: Math.min(...square.map(({ lat }) => lat)),
        west: Math.min(...square.map(({ lon }) => lon)),
        north: Math.max(...square.map(({ lat }) => lat)),
        east: Math.max(...square.map(({ lon }) => lon)),
      })
    : undefined;
  const needsTerrainRebuild =
    rebuildTerrain || (definition === 'complete-map' && previousDefinition !== 'complete-map');
  const terrainRebuilt = !request.existingCourse || needsTerrainRebuild;
  if (request.existingCourse && !needsTerrainRebuild) {
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
      const rasterSource =
        definition === 'complete-map'
          ? {
              ...data,
              featured_lap: { points: completeMapSquarePoints(request.points) },
            }
          : data;
      data.terrain = await raster(rasterSource, { resolution: 5 });
    } catch (error) {
      throw new Error("Sorry, we couldn't fetch elevation data. Try a different location.", {
        cause: error,
      });
    }
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
  progress('course');
  const includeNearbyRoads = definition !== 'course';
  course.courseBuilder = {
    ...request.draft,
    waypoints: request.draft.waypoints ?? roadDraftWaypoints(request.draft),
    definition,
    includeNearbyRoads,
  };
  if (fetchesScenery) {
    progress('scenery');
    course.scenery = await fetchScenery(course, definition, { progress, network });
  } else if (!includeNearbyRoads && course.scenery?.roads.length) {
    course.scenery = { ...course.scenery, roads: [] };
  }
  if (definition === 'complete-map' && terrainRebuilt) {
    progress('corridor');
    const terrain = course.terrain;
    if (!terrain) throw new Error('Complete-map elevation requires downloaded terrain.');
    const metersPerDegree = (6371008.8 * Math.PI) / 180;
    const roadwayLines = (course.scenery?.roads ?? []).map(({ points }) =>
      points.map(([x, z]) => ({
        lat: terrain.originLat + z / metersPerDegree,
        lon: terrain.originLon - x / terrain.metersPerLongitude,
      })),
    );
    const detailData = Object.assign({}, data, { roadwayLines });
    terrain.detail = await detail(detailData);
    course.terrain = { ...terrain, detail: terrain.detail };
  } else if (terrainRebuilt) {
    progress('corridor');
    const terrain = course.terrain;
    if (!terrain) throw new Error('Terrain detail requires downloaded terrain.');
    const detailData = {
      ...data,
      featured_lap: { points: request.points },
    };
    terrain.detail = await detail(detailData);
    course.terrain = { ...terrain, detail: terrain.detail };
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
  const definition = course.courseBuilder
    ? roadMapDefinition(course.courseBuilder)
    : course.scenery
      ? course.scenery.roads.length > 0
        ? 'nearby-roads'
        : 'course'
      : 'nearby-roads';
  if (!full) {
    const fetchScenery = options.fetchScenery ?? fetchCourseScenery;
    return {
      ...course,
      scenery: await fetchScenery(course, definition, { progress: options.progress }),
    };
  }
  if (!course.courseBuilder)
    throw new Error(
      `${course.name}: missing saved builder waypoints; recreate this map in the course builder before a full reimport`,
    );
  const draft = {
    ...restoreRoadDraft(course),
    definition,
    includeNearbyRoads: definition !== 'course',
  };
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
