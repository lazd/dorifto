export interface GeographicBox {
  west: number;
  east: number;
  south: number;
  north: number;
}

export function geographicTiles(box: GeographicBox): (GeographicBox & {
  key: string;
  metersPerDegree: number;
  metersPerLongitude: number;
})[];

export const geographicDownloadCache: {
  read(url: string): Promise<Uint8Array | undefined>;
  write(url: string, bytes: Uint8Array): Promise<void>;
};
