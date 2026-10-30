import { fromArrayBuffer } from 'geotiff';
import {
  geographicDownloadCache,
  geographicDownloadConcurrency,
  geographicTiles,
  forEachConcurrent,
} from './geographic-download.mjs';

const endpoint =
  'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage';
const radius = 6371008.8;

async function downloadBytes(
  url,
  fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
) {
  const attempts = 4;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let failure;
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(180000),
        ...(attempt > 1 ? { cache: 'reload' } : {}),
      });
      if (response.ok) return new Uint8Array(await response.arrayBuffer());
      failure = new Error(
        `USGS terrain request failed: HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`,
      );
      if (response.status !== 429 && response.status < 500) throw failure;
    } catch (error) {
      if (!(error instanceof TypeError) && error.name !== 'TimeoutError') throw error;
      failure = new Error(
        'USGS terrain download failed: a network error, timeout, or blocked cross-origin (CORS) response prevented access. Check your connection and try building again later.',
        { cause: error },
      );
    }
    if (attempt === attempts) {
      console.error(
        `USGS elevation download failed after ${attempts} attempts: ${url.href}`,
        failure,
      );
      throw failure;
    }
    console.warn(
      `USGS elevation download attempt ${attempt}/${attempts} failed: ${url.href}. Retrying in ${attempt}s…`,
      failure,
    );
    await sleep(1000 * attempt);
  }
}

function roadBounds(data, margin) {
  const points = data.featured_lap?.points;
  if (!Array.isArray(points) || points.length < 2)
    throw new Error('Terrain requires GPS coordinates');
  const latitudes = points.map((point) => point.lat);
  const longitudes = points.map((point) => point.lon);
  if (!latitudes.every(Number.isFinite) || !longitudes.every(Number.isFinite))
    throw new Error('Terrain requires valid GPS coordinates');
  const lat0 = latitudes.reduce((sum, value) => sum + value, 0) / points.length;
  const metersPerDegree = (radius * Math.PI) / 180;
  const metersPerLongitude = metersPerDegree * Math.cos((lat0 * Math.PI) / 180);
  return {
    points,
    metersPerDegree,
    metersPerLongitude,
    west: Math.min(...longitudes) - margin / metersPerLongitude,
    east: Math.max(...longitudes) + margin / metersPerLongitude,
    south: Math.min(...latitudes) - margin / metersPerDegree,
    north: Math.max(...latitudes) + margin / metersPerDegree,
  };
}

async function downloadRasterTile(
  { west, east, south, north, metersPerDegree, metersPerLongitude },
  resolution,
  { cache, fetch, sleep, label, resolutionOption },
) {
  const columns = Math.ceil(((east - west) * metersPerLongitude) / resolution);
  const rows = Math.ceil(((north - south) * metersPerDegree) / resolution);
  if (columns > 8000 || rows > 8000 || columns * rows > 16_000_000)
    throw new Error(
      `${label} is too large; select a shorter segment or increase ${resolutionOption}`,
    );
  const url = new URL(endpoint);
  url.search = new URLSearchParams({
    bbox: [west, south, east, north].join(','),
    bboxSR: '4326',
    imageSR: '4326',
    size: `${columns},${rows}`,
    format: 'tiff',
    pixelType: 'F32',
    interpolation: 'RSP_BilinearInterpolation',
    renderingRule: JSON.stringify({ rasterFunction: 'None' }),
    adjustAspectRatio: 'false',
    f: 'image',
  });
  let bytes = await cache?.read(url.href);
  const cached = bytes !== undefined;
  if (!cached) {
    console.log(
      `  🏔️  Downloading ${label}: ${columns} × ${rows} pixels, requested ${resolution} m spacing…`,
    );
    bytes = await downloadBytes(url, fetch, sleep);
  }
  let image;
  try {
    const tiff = await fromArrayBuffer(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
    image = await tiff.getImage();
  } catch (error) {
    throw new Error(`Invalid USGS terrain GeoTIFF: ${error.message}`, { cause: error });
  }
  if (
    image.getWidth() !== columns ||
    image.getHeight() !== rows ||
    image.getSamplesPerPixel() !== 1
  )
    throw new Error('USGS terrain raster dimensions do not match the request');
  const [rasterWest, rasterSouth, rasterEast, rasterNorth] = image.getBoundingBox();
  if (![rasterWest, rasterSouth, rasterEast, rasterNorth].every(Number.isFinite))
    throw new Error('USGS terrain raster is missing geographic bounds');
  const heights = await image.readRasters({ samples: [0], interleave: true });
  const noData = image.getGDALNoData();
  if (heights.some((height) => !Number.isFinite(height) || height === noData || height <= -100000))
    throw new Error('USGS terrain raster has missing elevation data; adjust the selected region');
  if (!cached) {
    await cache?.write(url.href, bytes);
    if (cache)
      console.log(`  💾 Terrain raster cached (${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB)`);
  }
  return {
    resolution,
    west: rasterWest,
    east: rasterEast,
    south: rasterSouth,
    north: rasterNorth,
    columns,
    rows,
    heights,
  };
}

async function downloadRaster(bounds, resolution, options) {
  const { west, east, south, north, metersPerDegree, metersPerLongitude } = bounds;
  const columns = Math.ceil(((east - west) * metersPerLongitude) / resolution);
  const rows = Math.ceil(((north - south) * metersPerDegree) / resolution);
  if (columns > 8000 || rows > 8000 || columns * rows > 16_000_000)
    throw new Error(
      `${options.label} is too large; select a shorter segment or increase ${options.resolutionOption}`,
    );
  const heights = new Float32Array(columns * rows);
  const tiles = geographicTiles(bounds);
  let completed = 0;
  options.onProgress?.(0, tiles.length);
  await forEachConcurrent(tiles, geographicDownloadConcurrency.terrain, async (tile) => {
    const apronLat = (resolution * 2) / tile.metersPerDegree;
    const apronLon = (resolution * 2) / tile.metersPerLongitude;
    const raster = await downloadRasterTile(
      {
        ...tile,
        west: tile.west - apronLon,
        east: tile.east + apronLon,
        south: tile.south - apronLat,
        north: tile.north + apronLat,
      },
      resolution,
      options,
    );
    const x0 = Math.max(0, Math.ceil(((tile.west - west) / (east - west)) * columns - 0.5));
    const x1 = Math.min(columns, Math.ceil(((tile.east - west) / (east - west)) * columns - 0.5));
    const y0 = Math.max(0, Math.ceil(((north - tile.north) / (north - south)) * rows - 0.5));
    const y1 = Math.min(rows, Math.ceil(((north - tile.south) / (north - south)) * rows - 0.5));
    // Resample onto the original pixel-center grid; the apron avoids seams at tile edges.
    for (let y = y0; y < y1; y++) {
      const lat = north - ((y + 0.5) / rows) * (north - south);
      const gy = ((raster.north - lat) / (raster.north - raster.south)) * raster.rows - 0.5;
      const iy = Math.max(0, Math.min(raster.rows - 2, Math.floor(gy)));
      const v = gy - iy;
      for (let x = x0; x < x1; x++) {
        const lon = west + ((x + 0.5) / columns) * (east - west);
        const gx = ((lon - raster.west) / (raster.east - raster.west)) * raster.columns - 0.5;
        const ix = Math.max(0, Math.min(raster.columns - 2, Math.floor(gx)));
        const u = gx - ix;
        const offset = iy * raster.columns + ix;
        const top = raster.heights[offset] * (1 - u) + raster.heights[offset + 1] * u;
        const bottom =
          raster.heights[offset + raster.columns] * (1 - u) +
          raster.heights[offset + raster.columns + 1] * u;
        heights[y * columns + x] = top * (1 - v) + bottom * v;
      }
    }
    options.onProgress?.(++completed, tiles.length);
  });
  return { resolution, west, east, south, north, columns, rows, heights };
}

const roundHeight = (height) => Math.round(height * 100) / 100;

export async function fetchTerrainRaster(
  data,
  {
    resolution = 5,
    margin = 250,
    cache = geographicDownloadCache,
    fetch = globalThis.fetch,
    sleep,
    onProgress,
  } = {},
) {
  if (!Number.isFinite(resolution) || resolution < 1 || !Number.isFinite(margin) || margin < 210) {
    throw new Error('Terrain resolution must be at least 1 m and margin at least 210 m');
  }
  const bounds = roadBounds(data, margin);
  const columns = Math.ceil(((bounds.east - bounds.west) * bounds.metersPerLongitude) / resolution);
  const rows = Math.ceil(((bounds.north - bounds.south) * bounds.metersPerDegree) / resolution);
  if (columns > 4096 || rows > 4096 || columns * rows > 4_000_000)
    throw new Error(
      'Terrain raster is too large; select a shorter segment or use coarser terrain spacing',
    );
  const raster = await downloadRaster(bounds, resolution, {
    cache,
    fetch,
    sleep,
    label: 'USGS terrain raster',
    resolutionOption: 'the terrain resolution',
    onProgress,
  });
  return { source: 'USGS 3DEP', ...raster, heights: Array.from(raster.heights, roundHeight) };
}

/**
 * Downloads high-resolution terrain and keeps only pixels within `width` meters of
 * the road centerline (plus a sampling apron), stored as row runs.
 */
export async function fetchTerrainDetail(
  data,
  {
    resolution = 1.5,
    width = 40,
    cache = geographicDownloadCache,
    fetch = globalThis.fetch,
    onProgress,
  } = {},
) {
  if (!Number.isFinite(resolution) || resolution < 1 || !Number.isFinite(width) || width <= 0)
    throw new Error('Terrain detail resolution must be at least 1 m and width positive');
  // The game's anti-alias blur and cubic sampling each reach two pixels past stored data.
  const reach = width + resolution * 5;
  const lines = [data.featured_lap?.points, ...(data.roadwayLines ?? [])].filter(
    (line) => Array.isArray(line) && line.length >= 2,
  );
  if (!lines.length) throw new Error('Terrain detail requires at least one road centerline');
  const bounds = roadBounds({ ...data, featured_lap: { points: lines.flat() } }, reach);
  const raster = await downloadRaster(bounds, resolution, {
    cache,
    fetch,
    label: 'USGS terrain detail',
    resolutionOption: 'the terrain detail resolution (or disable road-corridor detail)',
    onProgress,
  });
  const { columns, rows, west, east, south, north, heights } = raster;
  const pixelWidth = ((east - west) * bounds.metersPerLongitude) / columns;
  const pixelHeight = ((north - south) * bounds.metersPerDegree) / rows;
  const toPixel = ({ lat, lon }) => [
    ((lon - west) * bounds.metersPerLongitude) / pixelWidth - 0.5,
    ((north - lat) * bounds.metersPerDegree) / pixelHeight - 0.5,
  ];
  const keep = new Uint8Array(columns * rows);
  for (const line of lines) {
    const points = line.map(toPixel);
    for (let i = 1; i < points.length; i++) {
      const [ax, ay] = points[i - 1];
      const [bx, by] = points[i];
      const dx = (bx - ax) * pixelWidth;
      const dy = (by - ay) * pixelHeight;
      const lengthSquared = dx * dx + dy * dy || 1;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - reach / pixelWidth));
      const x1 = Math.min(columns - 1, Math.ceil(Math.max(ax, bx) + reach / pixelWidth));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by) - reach / pixelHeight));
      const y1 = Math.min(rows - 1, Math.ceil(Math.max(ay, by) + reach / pixelHeight));
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const px = (x - ax) * pixelWidth;
          const py = (y - ay) * pixelHeight;
          const t = Math.max(0, Math.min(1, (px * dx + py * dy) / lengthSquared));
          if (Math.hypot(px - t * dx, py - t * dy) <= reach) keep[y * columns + x] = 1;
        }
    }
  }
  const runs = [];
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < columns; x++) {
      if (!keep[y * columns + x] || (x > 0 && keep[y * columns + x - 1])) continue;
      const run = [y, x];
      for (let end = x; end < columns && keep[y * columns + end]; end++)
        run.push(roundHeight(heights[y * columns + end]));
      runs.push(run);
    }
  return { resolution, width, west, east, south, north, columns, rows, runs };
}
