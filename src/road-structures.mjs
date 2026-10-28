const metersPerDegree = (6371008.8 * Math.PI) / 180;
const matchTolerance = 5;

/** Match aligned road segments, not roads that merely cross a bridge or tunnel. */
export function matchRoadStructures(points, lines, closed = false) {
  if (!lines.length) return [];
  const latitude = points.reduce((sum, point) => sum + point.lat, 0) / points.length;
  const longitudeScale = metersPerDegree * Math.cos((latitude * Math.PI) / 180);
  const project = ([lon, lat]) => [
    (lon - points[0].lon) * longitudeScale,
    (lat - points[0].lat) * metersPerDegree,
  ];
  const route = points.map(({ lon, lat }) => project([lon, lat]));
  if (closed) route.push(route[0]);
  const segments = [];
  let length = 0;
  for (let i = 1; i < route.length; i++) {
    const [x, y] = route[i - 1];
    const dx = route[i][0] - x;
    const dy = route[i][1] - y;
    const size = Math.hypot(dx, dy);
    if (!size) continue;
    segments.push({ x, y, ux: dx / size, uy: dy / size, size, distance: length });
    length += size;
  }
  const spans = [];
  for (const { coordinates, type } of lines) {
    if (type !== 'bridge' && type !== 'tunnel') throw new Error('Invalid road structure type');
    const projected = coordinates.map(project);
    for (let i = 1; i < projected.length; i++) {
      const a = projected[i - 1];
      const b = projected[i];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const size = Math.hypot(dx, dy);
      if (!Number.isFinite(size)) throw new Error('Invalid road structure coordinates');
      if (!size) continue;
      for (const segment of segments) {
        const { x, y, ux, uy } = segment;
        if (Math.abs((dx * ux + dy * uy) / size) < 0.95) continue;
        const from = (a[0] - x) * ux + (a[1] - y) * uy;
        const to = (b[0] - x) * ux + (b[1] - y) * uy;
        const start = Math.max(0, Math.min(from, to));
        const end = Math.min(segment.size, Math.max(from, to));
        if (end <= start) continue;
        const gap = (offset) => {
          const t = (offset - from) / (to - from);
          return Math.abs((a[0] + t * dx - x) * uy - (a[1] + t * dy - y) * ux);
        };
        if (Math.max(gap(start), gap(end)) > matchTolerance) continue;
        spans.push({
          type,
          start: (segment.distance + start) / length,
          end: (segment.distance + end) / length,
        });
      }
    }
  }
  const merged = [];
  for (const type of ['bridge', 'tunnel']) {
    let previous;
    for (const span of spans.filter((s) => s.type === type).sort((a, b) => a.start - b.start)) {
      if (previous && (span.start - previous.end) * length <= matchTolerance) {
        previous.end = Math.max(previous.end, span.end);
      } else {
        previous = { ...span };
        merged.push(previous);
      }
    }
  }
  return merged.sort((a, b) => a.start - b.start);
}

/** Interpolate between terrain approaches; never guess a deck height from an unbracketed span. */
export function repairStructureElevation(heights, spacing, structures, closed = false) {
  if (!Number.isFinite(spacing) || spacing <= 0)
    throw new Error('Road elevation spacing must be positive');
  const count = heights.length;
  const denominator = closed ? count : count - 1;
  const apron = Math.ceil(15 / spacing);
  const masked = new Uint8Array(count);
  for (const { start, end, type } of structures) {
    if (
      (type !== 'bridge' && type !== 'tunnel') ||
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      end > 1 ||
      end <= start
    )
      throw new Error('Invalid road structure span');
    for (
      let i = Math.floor(start * denominator) - apron;
      i <= Math.ceil(end * denominator) + apron;
      i++
    ) {
      if (closed) masked[((i % count) + count) % count] = 1;
      else if (i >= 0 && i < count) masked[i] = 1;
    }
  }
  const result = [...heights];
  const anchor = masked.findIndex((value) => !value);
  if (anchor < 0) return result;
  const origin = closed ? anchor : 0;
  let before = closed ? anchor : -1;
  for (let offset = closed ? 1 : 0; offset <= (closed ? count : count - 1); offset++) {
    const i = origin + offset;
    const index = i % count;
    if (masked[index]) continue;
    if (before >= 0 && i - before > 1) {
      for (let j = before + 1; j < i; j++) {
        const t = (j - before) / (i - before);
        result[j % count] =
          heights[before % count] + (heights[index] - heights[before % count]) * t;
      }
    }
    before = i;
  }
  return result;
}
