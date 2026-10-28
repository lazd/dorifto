import { geographicRasterSampler } from './terrain-raster.mjs';
import { cleanRoadElevation } from './road-elevation.mjs';
import { repairStructureElevation } from './road-structures.mjs';

const earthRadius = 6371008.8;
export const roadImportDefaults = { width: 8, doubleYellow: true };
const defaults = { width: 15, spacing: 8, elevationSpacing: 5, elevationSmoothing: 15 };

/** Evenly resamples a closed polyline; the closing segment bridges any gap at the start line. */
export function resampleLoop(points, spacing, closed = true) {
  const distances = [0];
  const segments = closed ? points.length : points.length - 1;
  for (let i = 1; i <= segments; i++) {
    const [ax, az] = points[i - 1];
    const [bx, bz] = points[i % points.length];
    distances.push(distances[i - 1] + Math.hypot(bx - ax, bz - az));
  }
  const length = distances[segments];
  const count = Math.max(8, Math.round(length / spacing));
  const result = [];
  let segment = 0;
  for (let i = 0; i < count; i++) {
    const target = (i / (closed ? count : count - 1)) * length;
    while (distances[segment + 1] < target) segment++;
    const [ax, az] = points[segment];
    const [bx, bz] = points[(segment + 1) % points.length];
    const u = (target - distances[segment]) / (distances[segment + 1] - distances[segment] || 1);
    result.push([ax + (bx - ax) * u, az + (bz - az) * u]);
  }
  return { points: result, length };
}

export function sampleProfile(profile, fraction) {
  const high = profile.findIndex((point) => point.dist_frac >= fraction);
  if (high === -1) return profile[profile.length - 1].altitude_m;
  if (high === 0) return profile[0].altitude_m;
  const low = profile[high - 1];
  const next = profile[high];
  const u = (fraction - low.dist_frac) / (next.dist_frac - low.dist_frac || 1);
  return low.altitude_m + (next.altitude_m - low.altitude_m) * u;
}

function smoothElevationSeam(heights, spacing) {
  const count = heights.length;
  const radius = Math.min(Math.round(100 / spacing), Math.floor((count - 1) / 4));
  if (radius < 1) return;
  const start = count - radius;
  const end = radius;
  const span = 2 * radius;
  const startHeight = heights[start];
  const endHeight = heights[end];
  const startSlope = (heights[(start + 1) % count] - heights[start - 1]) / 2;
  const endSlope = (heights[end + 1] - heights[end - 1]) / 2;
  // Bridge the lap boundary with a cubic Hermite curve, matching both grades so
  // closing a GPS/elevation recording cannot turn an endpoint mismatch into a bump.
  for (let offset = 1; offset < span; offset++) {
    const t = offset / span;
    const t2 = t * t;
    const t3 = t2 * t;
    heights[(start + offset) % count] =
      (2 * t3 - 3 * t2 + 1) * startHeight +
      (t3 - 2 * t2 + t) * span * startSlope +
      (-2 * t3 + 3 * t2) * endHeight +
      (t3 - t2) * span * endSlope;
  }
}

const round = (value, digits) => Number(value.toFixed(digits));

export function projectLap(data) {
  const lap = data.featured_lap?.points;
  if (!data.slug) throw new Error('Track JSON is missing slug');
  if (!Array.isArray(lap) || lap.length < (data.closed === false ? 2 : 8))
    throw new Error(`${data.slug}: featured_lap.points is missing`);
  const lat0 = lap.reduce((sum, point) => sum + point.lat, 0) / lap.length;
  const lon0 = lap.reduce((sum, point) => sum + point.lon, 0) / lap.length;
  const cosLat = Math.cos((lat0 * Math.PI) / 180);
  // Local equirectangular projection. The map view shows +Z at the top with +X on
  // the left, so north -> +Z and east -> -X keeps the layout unmirrored, north up.
  const projected = lap.map(({ lat, lon }) => [
    ((-(lon - lon0) * Math.PI) / 180) * earthRadius * cosLat,
    (((lat - lat0) * Math.PI) / 180) * earthRadius,
  ]);
  // Drop duplicate fixes and a trailing point that repeats the start.
  const unique = projected.filter(
    (point, i) =>
      i === 0 || Math.hypot(point[0] - projected[i - 1][0], point[1] - projected[i - 1][1]) > 0.05,
  );
  const last = unique[unique.length - 1];
  if (data.closed !== false && Math.hypot(last[0] - unique[0][0], last[1] - unique[0][1]) < 0.5)
    unique.pop();
  return { unique, lat0, lon0, cosLat };
}

export function roadDistances(coordinates) {
  const distances = [0];
  const radians = Math.PI / 180;
  for (let i = 1; i < coordinates.length; i++) {
    const a = coordinates[i - 1];
    const b = coordinates[i];
    const haversine =
      Math.sin(((b.lat - a.lat) * radians) / 2) ** 2 +
      Math.cos(a.lat * radians) *
        Math.cos(b.lat * radians) *
        Math.sin(((b.lon - a.lon) * radians) / 2) ** 2;
    distances.push(
      distances[i - 1] + 2 * earthRadius * Math.asin(Math.sqrt(Math.min(1, haversine))),
    );
  }
  return distances;
}

export function terrainElevationProfile(data) {
  const { unique, lat0, lon0, cosLat } = projectLap(data);
  const { points } = resampleLoop(unique, 10, data.closed !== false);
  const sample = geographicRasterSampler(data.terrain);
  return {
    source: data.terrain.source,
    points: points.map(([x, z], i) => ({
      dist_frac: i / (data.closed === false ? points.length - 1 : points.length),
      altitude_m: sample(
        lat0 + ((z / earthRadius) * 180) / Math.PI,
        lon0 - ((x / (earthRadius * cosLat)) * 180) / Math.PI,
      ),
    })),
  };
}

export function convertTrack(data, options = {}) {
  const settings = {
    ...defaults,
    ...(data.closed === false ? roadImportDefaults : {}),
    ...options,
  };
  if (!Number.isFinite(settings.width) || settings.width <= 0)
    throw new Error('--width must be a positive finite number');
  if (
    settings.shoulderWidth !== undefined &&
    (!Number.isFinite(settings.shoulderWidth) || settings.shoulderWidth < 0)
  )
    throw new Error('--shoulder-width must be a nonnegative finite number');
  if (
    settings.terrainTransition !== undefined &&
    (!Number.isFinite(settings.terrainTransition) || settings.terrainTransition <= 0)
  )
    throw new Error('--terrain-transition must be a positive finite number');
  const closed = data.closed !== false;
  const { unique, lat0, lon0, cosLat } = projectLap(data);
  const { points, length } = resampleLoop(unique, settings.spacing, closed);

  const profile = data.elevation?.points
    ?.filter((point) => Number.isFinite(point.altitude_m) && Number.isFinite(point.dist_frac))
    .sort((a, b) => a.dist_frac - b.dist_frac);
  let elevation = [0];
  let elevationOffset = 0;
  if (profile?.length >= 2) {
    const count = Math.max(8, Math.round(length / settings.elevationSpacing));
    let raw = Array.from({ length: count }, (_, i) =>
      sampleProfile(profile, i / (closed ? count : count - 1)),
    );
    if (!closed && data.terrain) raw = cleanRoadElevation(raw, length / (count - 1));
    if (closed) smoothElevationSeam(raw, length / count);
    if (data.structures?.length)
      raw = repairStructureElevation(
        raw,
        length / (closed ? count : count - 1),
        data.structures,
        closed,
      );
    // Open-road terrain samples need a wider, smoothly weighted filter, not a periodic seam.
    const radius = Math.round(settings.elevationSmoothing / 2 / (length / count));
    const smoothed = raw.map((_, i) => {
      if (!closed) {
        const spacing = length / (count - 1);
        const sigma = settings.elevationSmoothing / spacing;
        const extent = Math.ceil(3 * sigma);
        if (!(sigma > 0)) return raw[i];
        let sum = 0;
        let weights = 0;
        for (let offset = -extent; offset <= extent; offset++) {
          const index = i + offset;
          const weight = Math.exp(-0.5 * (offset / sigma) ** 2);
          const height =
            index < 0
              ? raw[0] + index * (raw[1] - raw[0])
              : index >= count
                ? raw[count - 1] + (index - count + 1) * (raw[count - 1] - raw[count - 2])
                : raw[index];
          sum += height * weight;
          weights += weight;
        }
        return sum / weights;
      }
      let sum = 0;
      for (let j = -radius; j <= radius; j++)
        sum += raw[closed ? (i + j + count) % count : Math.max(0, Math.min(count - 1, i + j))];
      return sum / (2 * radius + 1);
    });
    const min = Math.min(...smoothed);
    elevationOffset = min;
    elevation = smoothed.map((height) => round(height - min, 2));
  }

  return {
    id: data.slug,
    ...(!closed ? { closed: false } : {}),
    name: data.display_name ?? data.slug,
    venueName: data.venue_name,
    configName: data.config_name,
    location: data.location,
    width: settings.width,
    ...(settings.shoulderWidth !== undefined ? { shoulderWidth: settings.shoulderWidth } : {}),
    ...(settings.terrainTransition !== undefined
      ? { terrainTransition: settings.terrainTransition }
      : {}),
    ...(settings.doubleYellow ? { doubleYellow: true } : {}),
    coneSpacing: 10,
    points: points.map(([x, z]) => [round(x, 2), round(z, 2)]),
    elevation,
    ...(data.terrain
      ? {
          terrain: {
            ...data.terrain,
            originLat: lat0,
            originLon: lon0,
            metersPerLongitude: ((earthRadius * Math.PI) / 180) * cosLat,
            elevationOffset,
          },
        }
      : {}),
    ...(data.elevation?.source ? { elevationSource: data.elevation.source } : {}),
    ...(data.structures?.length ? { structures: data.structures } : {}),
  };
}
