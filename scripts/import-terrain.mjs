import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fromArrayBuffer } from 'geotiff';

const endpoint =
  'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage';
const defaultCacheDir = fileURLToPath(new URL('../road-imports/cache/', import.meta.url));
const radius = 6371008.8;

export async function fetchTerrainRaster(
  data,
  { resolution = 5, margin = 250, cacheDir = defaultCacheDir, fetch = globalThis.fetch } = {},
) {
  if (!Number.isFinite(resolution) || resolution < 1 || !Number.isFinite(margin) || margin < 210) {
    throw new Error('Terrain resolution must be at least 1 m and margin at least 210 m');
  }
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
  const west = Math.min(...longitudes) - margin / metersPerLongitude;
  const east = Math.max(...longitudes) + margin / metersPerLongitude;
  const south = Math.min(...latitudes) - margin / metersPerDegree;
  const north = Math.max(...latitudes) + margin / metersPerDegree;
  const columns = Math.ceil(((east - west) * metersPerLongitude) / resolution);
  const rows = Math.ceil(((north - south) * metersPerDegree) / resolution);
  if (columns > 4096 || rows > 4096 || columns * rows > 4_000_000)
    throw new Error(
      'Terrain raster is too large; select a shorter segment or increase --terrain-resolution',
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
  const hash = createHash('sha256').update(url.href).digest('hex');
  const cacheFile = path.join(cacheDir, `terrain-${hash}.tif`);
  let bytes;
  try {
    bytes = await readFile(cacheFile);
    console.log(`  📦 Using cached USGS terrain raster`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const cached = bytes !== undefined;
  if (!cached) {
    console.log(
      `  🏔️  Downloading USGS terrain: ${columns} × ${rows} pixels, requested ${resolution} m spacing…`,
    );
    const response = await fetch(url, { signal: AbortSignal.timeout(180000) });
    if (!response.ok)
      throw new Error(
        `USGS terrain request failed: HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`,
      );
    bytes = new Uint8Array(await response.arrayBuffer());
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
  const values = Array.from(heights);
  if (values.some((height) => !Number.isFinite(height) || height === noData || height <= -100000))
    throw new Error('USGS terrain raster has missing elevation data; adjust the selected region');
  if (!cached) {
    await mkdir(cacheDir, { recursive: true });
    await writeFile(cacheFile, bytes);
    console.log(`  💾 Terrain raster cached (${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB)`);
  }
  return {
    source: 'USGS 3DEP',
    resolution,
    west: rasterWest,
    east: rasterEast,
    south: rasterSouth,
    north: rasterNorth,
    columns,
    rows,
    heights: values.map((height) => Math.round(height * 100) / 100),
  };
}
