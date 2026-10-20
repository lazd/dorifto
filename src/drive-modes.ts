export const driveModes = {
  drift: {
    steeringLow: 0.65,
    steeringHigh: 0.5,
    friction: 1.4,
    rearStiffness: 48000,
    frontStiffness: 38000,
    wheelTorque: 2000,
    wheelPower: 110000,
    tractionControl: false,
    cameraTravelBlend: 0.85,
    cameraDirectionResponse: 1.8,
    cameraPositionResponse: 5,
  },
  grip: {
    steeringLow: 0.45,
    steeringHigh: 0.2,
    friction: 1.5,
    rearStiffness: 52000,
    frontStiffness: 42000,
    wheelTorque: 1900,
    wheelPower: 115000,
    tractionControl: true,
    cameraTravelBlend: 0.2,
    cameraDirectionResponse: 6,
    cameraPositionResponse: 9,
  },
} as const;

export type DriveMode = keyof typeof driveModes;

export function isDriveMode(value: string): value is DriveMode {
  return value === 'grip' || value === 'drift';
}
