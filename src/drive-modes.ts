export const driveModes = {
  drift: {
    cameraTravelBlend: 0.85,
    cameraDirectionResponse: 1.8,
    cameraPositionResponse: 5,
    cameraRecenterResponse: 9,
  },
  grip: {
    cameraTravelBlend: 0.08,
    cameraDirectionResponse: 18,
    cameraPositionResponse: 20,
    cameraRecenterResponse: 28,
  },
} as const;

export type DriveMode = keyof typeof driveModes;

export function isDriveMode(value: string): value is DriveMode {
  return value === 'grip' || value === 'drift';
}
