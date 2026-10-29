import { createDownloadCache } from './download-cache.mjs';
import {
  fetchTerrainDetail as downloadDetail,
  fetchTerrainRaster as downloadRaster,
} from '../src/terrain-import.mjs';

function optionsWithCache({ cacheDir, ...options } = {}) {
  const cache = createDownloadCache({ cacheDir, prefix: 'terrain', extension: 'tif' });
  return {
    ...options,
    cache: {
      async read(url) {
        const bytes = await cache.read(url);
        if (bytes !== undefined) console.log('  Using cached USGS terrain');
        return bytes;
      },
      write: cache.write,
    },
  };
}

export function fetchTerrainRaster(data, options) {
  return downloadRaster(data, optionsWithCache(options));
}

export function fetchTerrainDetail(data, options) {
  return downloadDetail(data, optionsWithCache(options));
}
