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
  type RoadBuildProgress,
} from './course-builder-data';
import { matchRoadStructures } from './road-structures.mjs';
import { fetchCourseScenery, requestMappedNetwork, requestSceneryTiles } from './scenery-import';
import { sceneryImportRevision } from './scenery-data';
import type { GeographicDownloadCache } from './geographic-download.mjs';
import {
  completeMapBounds,
  completeMapCorners,
  defaultCompleteMapDimensions,
  validateCompleteMapDimensions,
} from './complete-map';

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
  cache?: GeographicDownloadCache;
  rebuildTerrain?: boolean;
  refreshScenery?: boolean;
  progress?: RoadBuildProgress;
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
    cache,
  }: BuildOptions = {},
): Promise<RoadMap> {
  const definition: MapDefinition = roadMapDefinition(request.draft);
  const dimensions = request.draft.completeMapDimensions ?? defaultCompleteMapDimensions;
  validateImportRoute(
    request.points,
    request.closed,
    definition === 'complete-map' ? Infinity : undefined,
  );
  if (definition === 'complete-map') {
    validateCompleteMapDimensions(dimensions);
    if (!completeMapBounds(request.points, dimensions)?.fits)
      throw new Error('Keep all selected roads inside the complete-map selection.');
  }
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
  const dimensionsChanged =
    definition === 'complete-map' &&
    (dimensions.width !==
      (request.existingCourse?.courseBuilder?.completeMapDimensions ?? defaultCompleteMapDimensions)
        .width ||
      dimensions.height !==
        (
          request.existingCourse?.courseBuilder?.completeMapDimensions ??
          defaultCompleteMapDimensions
        ).height);
  const fetchesScenery =
    refreshScenery ||
    dimensionsChanged ||
    request.existingCourse?.scenery?.importRevision !== sceneryImportRevision ||
    definition !== previousDefinition;
  progress('starting', undefined, 'complete');
  if (fetchesScenery && definition === 'complete-map')
    progress('scenery', 'Connecting to OpenFreeMap', 'active');
  else if (!fetchesScenery) progress('scenery', 'Using saved scenery', 'complete');
  if (definition !== 'complete-map' || !fetchesScenery)
    progress(
      'network',
      definition === 'complete-map' ? 'Using saved roads' : 'Not required',
      'complete',
    );
  // Complete-map bounds are known before terrain decoding or course conversion.
  const selection =
    definition === 'complete-map' && fetchesScenery
      ? completeMapCorners(request.points, dimensions)
      : undefined;
  const tileRequest = selection
    ? requestSceneryTiles(
        {
          south: Math.min(...selection.map(({ lat }) => lat)),
          west: Math.min(...selection.map(({ lon }) => lon)),
          north: Math.max(...selection.map(({ lat }) => lat)),
          east: Math.max(...selection.map(({ lon }) => lon)),
        },
        cache,
        (completed, total) => progress('scenery', `Tiles ${completed}/${total}`, 'active'),
      )
    : undefined;
  const corners =
    definition === 'complete-map' && fetchesScenery
      ? completeMapCorners(request.points, dimensions, 50)
      : undefined;
  const network = corners
    ? requestMappedNetwork(
        {
          south: Math.min(...corners.map(({ lat }) => lat)),
          west: Math.min(...corners.map(({ lon }) => lon)),
          north: Math.max(...corners.map(({ lat }) => lat)),
          east: Math.max(...corners.map(({ lon }) => lon)),
        },
        cache,
        (detail, state) => progress('network', detail, state),
      )
    : undefined;
  const needsTerrainRebuild =
    rebuildTerrain ||
    dimensionsChanged ||
    (definition === 'complete-map' && previousDefinition !== 'complete-map');
  const terrainRebuilt = !request.existingCourse || needsTerrainRebuild;
  if (request.existingCourse && !needsTerrainRebuild) {
    progress('terrain', 'Using saved terrain', 'complete');
    progress('course', undefined, 'active');
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
      progress('terrain', undefined, 'active');
      const rasterSource =
        definition === 'complete-map'
          ? {
              ...data,
              featured_lap: { points: completeMapCorners(request.points, dimensions) },
            }
          : data;
      data.terrain = await raster(rasterSource, {
        cache,
        resolution: 5,
        onProgress: (completed, total) =>
          progress('terrain', `Tiles ${completed}/${total}`, 'active'),
      });
    } catch (error) {
      throw new Error(
        `Could not download terrain. ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
    progress('terrain', undefined, 'complete');
    progress('course', undefined, 'active');
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
  progress('course', undefined, 'complete');
  const includeNearbyRoads = definition !== 'course';
  course.courseBuilder = {
    ...request.draft,
    waypoints: request.draft.waypoints ?? roadDraftWaypoints(request.draft),
    definition,
    includeNearbyRoads,
  };
  if (fetchesScenery) {
    progress('scenery', 'Processing downloaded scenery', 'active');
    course.scenery = await fetchScenery(course, definition, {
      progress,
      network,
      cache,
      tileRequest,
    });
    progress('scenery', undefined, 'complete');
  } else if (!includeNearbyRoads && course.scenery?.roads.length) {
    course.scenery = { ...course.scenery, roads: [] };
  }
  if (definition === 'complete-map' && terrainRebuilt) {
    progress('corridor', undefined, 'active');
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
    terrain.detail = await detail(detailData, {
      cache,
      onProgress: (completed, total) =>
        progress('corridor', `Tiles ${completed}/${total}`, 'active'),
    });
    course.terrain = { ...terrain, detail: terrain.detail };
  } else if (terrainRebuilt) {
    progress('corridor', undefined, 'active');
    const terrain = course.terrain;
    if (!terrain) throw new Error('Terrain detail requires downloaded terrain.');
    const detailData = {
      ...data,
      featured_lap: { points: request.points },
    };
    terrain.detail = await detail(detailData, {
      cache,
      onProgress: (completed, total) =>
        progress('corridor', `Tiles ${completed}/${total}`, 'active'),
    });
    course.terrain = { ...terrain, detail: terrain.detail };
  }
  progress('corridor', terrainRebuilt ? undefined : 'Using saved road elevation', 'complete');
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
      scenery: await fetchScenery(course, definition, {
        progress: options.progress,
        cache: options.cache,
      }),
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
