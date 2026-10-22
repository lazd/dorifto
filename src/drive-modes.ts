const handling = {
  steeringLow: 0.65,
  steeringHigh: 0.3,
  steeringScale: 1,
  steeringExpo: 0.6,
  steeringRate: 2,
  frontStiffness: 45000,
  rearStiffness: 48000,
  frontGrip: 1.05,
  rearGrip: 1,
};

export const driveModes = {
  drift: {
    ...handling,
    steeringRate: (160 * Math.PI) / 180,
    steeringLow: (55 * Math.PI) / 180,
    steeringHigh: (45 * Math.PI) / 180,
    friction: 1.25,
    engineTorque: 560,
    enginePower: 360000,
    cameraTravelBlend: 0.85,
    cameraDirectionResponse: 1.8,
    cameraPositionResponse: 5,
    cameraRecenterResponse: 9,
  },
  grip: {
    ...handling,
    friction: 1.35,
    engineTorque: 400,
    enginePower: 255000,
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
