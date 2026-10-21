export const driveModes = {
  drift: {
    steeringLow: 0.95,
    steeringHigh: 0.8,
    friction: 1.45,
    rearStiffness: 44000,
    frontStiffness: 52000,
    frontGrip: 1.3,
    wheelTorque: 2000,
    wheelPower: 110000,
    tractionControl: false,
    cameraTravelBlend: 0.85,
    cameraDirectionResponse: 1.8,
    cameraPositionResponse: 5,
    cameraRecenterResponse: 9,
  },
  grip: {
    steeringLow: 0.45,
    steeringHigh: 0.2,
    friction: 1.5,
    rearStiffness: 52000,
    frontStiffness: 42000,
    frontGrip: 1,
    wheelTorque: 1900,
    wheelPower: 115000,
    tractionControl: true,
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
