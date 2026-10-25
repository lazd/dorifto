import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fetchTerrainDetail as downloadDetail,
  fetchTerrainRaster as downloadRaster,
} from '../src/terrain-import.mjs';

const defaultCacheDir = fileURLToPath(new URL('../road-imports/cache/', import.meta.url));

function optionsWithCache({ cacheDir = defaultCacheDir, ...options } = {}) {
  const cacheFile = (url) =>
    path.join(cacheDir, `terrain-${createHash('sha256').update(url).digest('hex')}.tif`);
  return {
    ...options,
    cache: {
      async read(url) {
        try {
          const bytes = await readFile(cacheFile(url));
          console.log('  Using cached USGS terrain');
          return bytes;
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      },
      async write(url, bytes) {
        await mkdir(cacheDir, { recursive: true });
        await writeFile(cacheFile(url), bytes);
      },
    },
  };
}

export function fetchTerrainRaster(data, options) {
  return downloadRaster(data, optionsWithCache(options));
}

export function fetchTerrainDetail(data, options) {
  return downloadDetail(data, optionsWithCache(options));
}
