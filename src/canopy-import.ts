import { fromArrayBuffer } from 'geotiff';
import type { CourseDefinition } from './courses';
import type { CourseScenery, TreeCanopy } from './scenery-data';
import {
  geographicDownloadCache,
  geographicTiles,
  forEachConcurrent,
  type GeographicDownloadCache,
} from './geographic-download.mjs';

const endpoint =
  'https://imagery.geoplatform.gov/iipp/rest/services/Vegetation/USFS_EDW_NLCD_TCC_CONUS/ImageServer/exportImage';
export const canopyYear = 2025;
const spacing = 30;
const metersPerDegree = (6371008.8 * Math.PI) / 180;

export async function fetchTreeCanopy(
  course: CourseDefinition,
  {
    cache = geographicDownloadCache,
    fetch = globalThis.fetch,
    onProgress,
  }: {
    cache?: GeographicDownloadCache;
    fetch?: typeof globalThis.fetch;
    onProgress?: (completed: number, total: number) => void;
  } = {},
): Promise<TreeCanopy> {
  const terrain = course.terrain;
  if (!terrain) throw new Error('Tree canopy requires geographic terrain.');
  const bounds: NonNullable<CourseScenery['bounds']> = course.scenery?.bounds ?? {
    minX: (terrain.originLon - terrain.east) * terrain.metersPerLongitude,
    maxX: (terrain.originLon - terrain.west) * terrain.metersPerLongitude,
    minZ: (terrain.south - terrain.originLat) * metersPerDegree,
    maxZ: (terrain.north - terrain.originLat) * metersPerDegree,
  };
  const columns = Math.ceil((bounds.maxX - bounds.minX) / spacing);
  const rows = Math.ceil((bounds.maxZ - bounds.minZ) / spacing);
  if (columns <= 0 || rows <= 0 || columns * rows > 1_000_000)
    throw new Error('Tree canopy bounds exceed the supported map size.');
  const cover = new Uint8Array(columns * rows).fill(255);
  const geographic = {
    west: terrain.originLon - bounds.maxX / terrain.metersPerLongitude,
    east: terrain.originLon - bounds.minX / terrain.metersPerLongitude,
    south: terrain.originLat + bounds.minZ / metersPerDegree,
    north: terrain.originLat + bounds.maxZ / metersPerDegree,
  };
  const tiles = geographicTiles(geographic);
  let completed = 0;
  onProgress?.(0, tiles.length);
  await forEachConcurrent(tiles, 4, async (tile) => {
    const url = new URL(endpoint);
    url.search = new URLSearchParams({
      bbox: [tile.west, tile.south, tile.east, tile.north].join(','),
      bboxSR: '4326',
      imageSR: '4326',
      size: '34,34',
      format: 'tiff',
      pixelType: 'U8',
      interpolation: 'RSP_NearestNeighbor',
      renderingRule: JSON.stringify({ rasterFunction: 'None' }),
      mosaicRule: JSON.stringify({ where: `endyear = ${canopyYear}` }),
      adjustAspectRatio: 'false',
      f: 'image',
    }).toString();
    const cached = await cache.read(url.href);
    let bytes = cached;
    if (!bytes) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
          if (!response.ok) throw new Error(`Tree canopy request failed (${response.status}).`);
          bytes = new Uint8Array(await response.arrayBuffer());
          break;
        } catch (error) {
          if (attempt === 2)
            throw new Error('Could not download USFS tree canopy data. Please try again.', {
              cause: error,
            });
          console.warn('Tree canopy download failed; retrying.', error);
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    }
    if (!bytes) throw new Error('Tree canopy response is empty.');
    const tiff = await fromArrayBuffer(Uint8Array.from(bytes).buffer);
    const image = await tiff.getImage();
    if (image.getSamplesPerPixel() !== 1 || image.getWidth() !== 34 || image.getHeight() !== 34)
      throw new Error('USFS tree canopy raster dimensions do not match the request.');
    const values = await image.readRasters({ samples: [0], interleave: true });
    if (!(values instanceof Uint8Array))
      throw new Error('USFS tree canopy raster must contain 8-bit coverage values.');
    if (
      values.some(
        (value) =>
          !Number.isInteger(value) || (value > 100 && value !== 254 && value !== 255) || value < 0,
      )
    )
      throw new Error('USFS tree canopy raster contains invalid coverage values.');
    const [west, south, east, north] = image.getBoundingBox();
    if (![west, south, east, north].every(Number.isFinite) || east <= west || north <= south)
      throw new Error('USFS tree canopy raster is missing geographic bounds.');
    const x0 = Math.max(
      0,
      Math.ceil(
        (((terrain.originLon - tile.east) * terrain.metersPerLongitude - bounds.minX) /
          (bounds.maxX - bounds.minX)) *
          columns -
          0.5,
      ),
    );
    const x1 = Math.min(
      columns,
      Math.ceil(
        (((terrain.originLon - tile.west) * terrain.metersPerLongitude - bounds.minX) /
          (bounds.maxX - bounds.minX)) *
          columns -
          0.5,
      ),
    );
    const y0 = Math.max(
      0,
      Math.ceil(
        (((tile.south - terrain.originLat) * metersPerDegree - bounds.minZ) /
          (bounds.maxZ - bounds.minZ)) *
          rows -
          0.5,
      ),
    );
    const y1 = Math.min(
      rows,
      Math.ceil(
        (((tile.north - terrain.originLat) * metersPerDegree - bounds.minZ) /
          (bounds.maxZ - bounds.minZ)) *
          rows -
          0.5,
      ),
    );
    for (let y = y0; y < y1; y++) {
      const lat =
        terrain.originLat +
        (bounds.minZ + ((y + 0.5) / rows) * (bounds.maxZ - bounds.minZ)) / metersPerDegree;
      const iy = Math.max(0, Math.min(33, Math.floor(((north - lat) / (north - south)) * 34)));
      for (let x = x0; x < x1; x++) {
        const lon =
          terrain.originLon -
          (bounds.minX + ((x + 0.5) / columns) * (bounds.maxX - bounds.minX)) /
            terrain.metersPerLongitude;
        const ix = Math.max(0, Math.min(33, Math.floor(((lon - west) / (east - west)) * 34)));
        const value = values[iy * 34 + ix];
        cover[y * columns + x] = value <= 100 ? value : 255;
      }
    }
    if (!cached) await cache.write(url.href, bytes);
    onProgress?.(++completed, tiles.length);
  });
  if (cover.every((value) => value === 255))
    throw new Error('USFS tree canopy data is not available for this map region.');
  return {
    ...bounds,
    source: 'USDA Forest Service NLCD Tree Canopy Cover',
    year: canopyYear,
    columns,
    rows,
    cover: Array.from(cover),
  };
}
