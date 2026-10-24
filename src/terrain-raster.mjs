export function geographicRasterSampler(raster) {
  const { columns, rows, heights, west, east, south, north } = raster;
  if (
    !Number.isInteger(columns) ||
    columns < 2 ||
    !Number.isInteger(rows) ||
    rows < 2 ||
    heights.length !== columns * rows ||
    !heights.every(Number.isFinite) ||
    ![west, east, south, north].every(Number.isFinite) ||
    east <= west ||
    north <= south
  )
    throw new Error('Invalid terrain elevation raster');
  return (lat, lon) => {
    const gx = Math.max(0, Math.min(columns - 1, ((lon - west) / (east - west)) * columns - 0.5));
    const gy = Math.max(0, Math.min(rows - 1, ((north - lat) / (north - south)) * rows - 0.5));
    const ix = Math.min(Math.floor(gx), columns - 2);
    const iy = Math.min(Math.floor(gy), rows - 2);
    const u = gx - ix;
    const v = gy - iy;
    const a = heights[iy * columns + ix] * (1 - u) + heights[iy * columns + ix + 1] * u;
    const b = heights[(iy + 1) * columns + ix] * (1 - u) + heights[(iy + 1) * columns + ix + 1] * u;
    return a * (1 - v) + b * v;
  };
}
