// USGS resamples by point sampling, which aliases sharp road cuts into pixel staircases.
// A separable [1 2 1] binomial blur removes that stair-stepping without flattening hillsides.
function antiAlias(heights, columns, rows, passes = 2) {
  let source = heights;
  let target = new Float32Array(source.length);
  const clampX = (x) => Math.max(0, Math.min(columns - 1, x));
  const clampY = (y) => Math.max(0, Math.min(rows - 1, y));
  for (let pass = 0; pass < passes; pass++) {
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < columns; x++)
        target[y * columns + x] =
          (source[y * columns + clampX(x - 1)] +
            2 * source[y * columns + x] +
            source[y * columns + clampX(x + 1)]) /
          4;
    [source, target] = [target, source];
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < columns; x++)
        target[y * columns + x] =
          (source[clampY(y - 1) * columns + x] +
            2 * source[y * columns + x] +
            source[clampY(y + 1) * columns + x]) /
          4;
    [source, target] = [target, source];
  }
  return source;
}

const validBounds = ({ columns, rows, west, east, south, north }) =>
  Number.isInteger(columns) &&
  columns >= 2 &&
  Number.isInteger(rows) &&
  rows >= 2 &&
  [west, east, south, north].every(Number.isFinite) &&
  east > west &&
  north > south;

// Catmull-Rom keeps slopes continuous across raster cells; bilinear creases them into visible ridges.
const cubic = (a, b, c, d, t) =>
  b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));

/** Samples a grid; missing (NaN) cells propagate so callers can fall back. */
function gridSampler({ columns, rows, west, east, south, north }, grid, clamp) {
  const heights = antiAlias(grid, columns, rows);
  const at = (x, y) =>
    heights[Math.max(0, Math.min(rows - 1, y)) * columns + Math.max(0, Math.min(columns - 1, x))];
  return (lat, lon) => {
    let gx = ((lon - west) / (east - west)) * columns - 0.5;
    let gy = ((north - lat) / (north - south)) * rows - 0.5;
    if (!clamp && (gx < 0 || gy < 0 || gx > columns - 1 || gy > rows - 1)) return NaN;
    gx = Math.max(0, Math.min(columns - 1, gx));
    gy = Math.max(0, Math.min(rows - 1, gy));
    const ix = Math.min(Math.floor(gx), columns - 2);
    const iy = Math.min(Math.floor(gy), rows - 2);
    const u = gx - ix;
    const row = (y) => cubic(at(ix - 1, y), at(ix, y), at(ix + 1, y), at(ix + 2, y), u);
    return cubic(row(iy - 1), row(iy), row(iy + 1), row(iy + 2), gy - iy);
  };
}

function detailSampler(detail) {
  const { columns, rows, runs, width } = detail;
  if (!validBounds(detail) || !Array.isArray(runs) || !(width > 0))
    throw new Error('Invalid terrain detail raster');
  const grid = new Float32Array(columns * rows).fill(NaN);
  for (const [row, column, ...heights] of runs) {
    if (
      !Number.isInteger(row) ||
      !Number.isInteger(column) ||
      row < 0 ||
      row >= rows ||
      column < 0 ||
      column + heights.length > columns ||
      !heights.every(Number.isFinite)
    )
      throw new Error('Invalid terrain detail raster');
    grid.set(heights, row * columns + column);
  }
  return gridSampler(detail, grid, false);
}

const smoothstep = (value, start, end) => {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
};

/**
 * Samples absolute elevation. Within `detail.width` of the road centerline, the
 * high-resolution corridor raster fades in over the coarse surroundings.
 */
export function geographicRasterSampler(raster) {
  const { columns, rows, heights } = raster;
  if (!validBounds(raster) || heights.length !== columns * rows || !heights.every(Number.isFinite))
    throw new Error('Invalid terrain elevation raster');
  const coarse = gridSampler(raster, Float32Array.from(heights), true);
  if (!raster.detail) return coarse;
  const detail = detailSampler(raster.detail);
  const { width } = raster.detail;
  return (lat, lon, roadDistance = 0) => {
    const height = coarse(lat, lon);
    const weight = 1 - smoothstep(roadDistance, width * 0.75, width);
    if (weight <= 0) return height;
    const fine = detail(lat, lon);
    return Number.isFinite(fine) ? height + (fine - height) * weight : height;
  };
}
