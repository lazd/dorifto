export const driveModes = {
  drift: {
    steeringLow: 1.2,
    steeringHigh: 1.1,
    friction: 1.45,
    rearStiffness: 54000,
    rearSlidingGrip: 0.83,
    frontStiffness: 52000,
    frontGrip: 1.45,
    rearGrip: 1,
    engineTorque: 560,
    enginePower: 360000,
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
    rearSlidingGrip: 0.78,
    frontStiffness: 42000,
    frontGrip: 1,
    rearGrip: 1,
    engineTorque: 400,
    enginePower: 255000,
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

export function assistedSteeringAngle(input: number, limit: number, forward: number, lateral: number): number {
  const manual = input * limit;
  if (forward <= 2) return manual;
  const angle = Math.atan2(lateral, forward);
  const smoothstep = (value: number, low: number, high: number) => {
    const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
    return t * t * (3 - 2 * t);
  };
  const blend = smoothstep(Math.abs(angle), 0.08, 0.35) * smoothstep(forward, 2, 6);
  // Leave a small driver-controlled slip angle for cornering force instead of
  // aligning perfectly with travel and removing all front lateral force.
  const assisted = angle + input * 0.22;
  return Math.max(-limit, Math.min(limit, manual + (assisted - manual) * blend));
}
