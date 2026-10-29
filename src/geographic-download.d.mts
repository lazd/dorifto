export interface GeographicBox {
  west: number;
  east: number;
  south: number;
  north: number;
}

export const geographicDownloadConcurrency: { readonly osm: number; readonly terrain: number };

export function forEachConcurrent<T>(
  items: readonly T[],
  concurrency: number,
  visit: (item: T, index: number) => Promise<void>,
): Promise<void>;

export function geographicTiles(box: GeographicBox): (GeographicBox & {
  key: string;
  metersPerDegree: number;
  metersPerLongitude: number;
})[];

export interface GeographicDownloadCache {
  read(url: string): Promise<Uint8Array | undefined>;
  write(url: string, bytes: Uint8Array): Promise<void>;
}

export const geographicDownloadCache: GeographicDownloadCache;
