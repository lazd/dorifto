export interface MapLocation {
  name: string;
  center: [number, number];
  bounds?: [[number, number], [number, number]];
}

/** Nominatim permits submitted searches, not client-side autocomplete. */
export function createLocationSearch(fetchImpl: typeof fetch = fetch) {
  const cache = new Map<string, MapLocation>();
  let nextRequest = 0;
  let busy = false;
  return async (input: string): Promise<MapLocation> => {
    const query = input.trim();
    if (!query) throw new Error('Enter a place, address, or latitude, longitude.');
    const numericPair = /^[+\-\d.\s]+,[+\-\d.\s]+$/;
    if (numericPair.test(query)) {
      const [lat, lon] = query.split(',').map(Number);
      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        Math.abs(lat) > 85 ||
        Math.abs(lon) > 180
      )
        throw new Error('Coordinates must be latitude (-85 to 85), longitude (-180 to 180).');
      return { name: query, center: [lon, lat] };
    }
    const key = query.toLowerCase();
    const cached = cache.get(key);
    if (cached) return cached;
    if (busy) throw new Error('A location search is already in progress.');
    busy = true;
    try {
      const delay = nextRequest - Date.now();
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      nextRequest = Date.now() + 1100;
      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.search = new URLSearchParams({ q: query, format: 'jsonv2', limit: '1' }).toString();
      const response = await fetchImpl(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(20000),
        referrerPolicy: 'strict-origin-when-cross-origin',
      });
      if (!response.ok)
        throw new Error(`Location search failed: HTTP ${response.status}. Try again later.`);
      const data: unknown = await response.json();
      if (!Array.isArray(data)) throw new Error('Location search returned an invalid response.');
      if (!data.length)
        throw new Error(`No location found for "${query}". Try a more specific place or address.`);
      const result: unknown = data[0];
      if (typeof result !== 'object' || result === null)
        throw new Error('Location search returned an invalid result.');
      const location = result as Record<string, unknown>;
      const lat = Number(location.lat);
      const lon = Number(location.lon);
      const raw = location.boundingbox;
      if (
        typeof location.display_name !== 'string' ||
        typeof location.lat !== 'string' ||
        typeof location.lon !== 'string' ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        Math.abs(lat) > 85 ||
        Math.abs(lon) > 180 ||
        !Array.isArray(raw) ||
        raw.length !== 4 ||
        raw.some((value) => typeof value !== 'string' || !value.trim())
      )
        throw new Error('Location search returned an invalid or unsupported location.');
      const [south, north, west, east] = raw.map(Number);
      if (
        ![south, north, west, east].every(Number.isFinite) ||
        south > north ||
        west > east ||
        south < -90 ||
        north > 90 ||
        west < -180 ||
        east > 180
      )
        throw new Error('Location search returned invalid geographic bounds.');
      const found: MapLocation = {
        name: location.display_name,
        center: [lon, lat],
        bounds: [
          [west, Math.max(-85, south)],
          [east, Math.min(85, north)],
        ],
      };
      cache.set(key, found);
      return found;
    } finally {
      busy = false;
    }
  };
}
