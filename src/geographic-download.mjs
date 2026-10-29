const metersPerDegree = (6371008.8 * Math.PI) / 180;
const latitudeStep = 1000 / metersPerDegree;

/** A fixed ~1 km grid, independent of the selected course and its bounds. */
export function geographicTiles({ west, east, south, north }) {
  if (
    ![west, east, south, north].every(Number.isFinite) ||
    east <= west ||
    north <= south ||
    south <= -90 ||
    north >= 90
  )
    throw new Error('Geographic downloads require finite bounds between the poles.');
  const tiles = [];
  for (let y = Math.floor(south / latitudeStep); y < Math.ceil(north / latitudeStep); y++) {
    const tileSouth = y * latitudeStep;
    const tileNorth = (y + 1) * latitudeStep;
    const metersPerLongitude =
      metersPerDegree * Math.cos(((tileSouth + tileNorth) * Math.PI) / 360);
    const longitudeStep = 1000 / metersPerLongitude;
    for (let x = Math.floor(west / longitudeStep); x < Math.ceil(east / longitudeStep); x++) {
      tiles.push({
        key: `${y}/${x}`,
        west: x * longitudeStep,
        east: (x + 1) * longitudeStep,
        south: tileSouth,
        north: tileNorth,
        metersPerDegree,
        metersPerLongitude,
      });
    }
  }
  return tiles;
}

const cacheName = 'dorifto-geographic-downloads-v1';
const maxAge = 30 * 24 * 60 * 60 * 1000;
const maxBytes = 128 * 1024 * 1024;
let writes = Promise.resolve();

// Cache failures must not discard a valid download, but must be visible to the user in the console.
export const geographicDownloadCache = {
  async read(url) {
    if (typeof caches === 'undefined') return;
    try {
      const cache = await caches.open(cacheName);
      const response = await cache.match(url);
      if (!response) return;
      if (Date.now() - Number(response.headers.get('x-downloaded-at')) > maxAge) {
        await cache.delete(url);
        return;
      }
      return new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      console.warn('Could not read the geographic download cache; downloading again.', error);
    }
  },
  async write(url, bytes) {
    if (typeof caches === 'undefined') return;
    writes = writes.then(async () => {
      try {
        const cache = await caches.open(cacheName);
        await cache.put(
          url,
          new Response(bytes, {
            headers: {
              'x-downloaded-at': String(Date.now()),
              'content-length': String(bytes.byteLength),
            },
          }),
        );
        const keys = await cache.keys();
        let size = 0;
        for (const key of keys.reverse()) {
          const response = await cache.match(key);
          size += Number(response?.headers.get('content-length') ?? 0);
          if (size > maxBytes) await cache.delete(key);
        }
      } catch (error) {
        console.warn(
          'Could not persist geographic downloads; future builds may download again.',
          error,
        );
      }
    });
    await writes;
  },
};
