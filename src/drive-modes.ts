export const driveModes = {
  drift: {
    steeringLow: 1.2,
    steeringHigh: 1.1,
    steeringScale: 1.01,
    steeringExpo: 0.65,
    steeringRate: 2,
    steeringAssist: true,
    steeringSlipLimit: 0.16,
    friction: 1.65,
    rearStiffness: 72000,
    rearSlidingGrip: 0.88,
    frontSlidingGrip: 0.9,
    frontStiffness: 62000,
    frontGrip: 1.35,
    rearGrip: 1,
    engineTorque: 560 * 700 / 483,
    enginePower: 360000 * 700 / 483,
    cameraTravelBlend: 0.85,
    cameraDirectionResponse: 1.8,
    cameraPositionResponse: 5,
    cameraRecenterResponse: 9,
  },
  grip: {
    steeringLow: 0.65,
    steeringHigh: 0.4,
    steeringScale: 1,
    steeringExpo: 0.6,
    steeringRate: 2.2,
    steeringAssist: true,
    steeringSlipLimit: 0.12,
    friction: 1.8,
    rearStiffness: 68000,
    rearSlidingGrip: 0.95,
    frontSlidingGrip: 0.9,
    frontStiffness: 62000,
    frontGrip: 1.2,
    rearGrip: 1.2,
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

export function assistedSteeringAngle(input: number, limit: number, forward: number, lateral: number,
  slipLimit = Infinity): number {
  const manual = input * limit;
  if (forward <= 2) return manual;
  const angle = Math.atan2(lateral, forward);
  const smoothstep = (value: number, low: number, high: number) => {
    const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
    return t * t * (3 - 2 * t);
  };
  const scrubBlend = Number.isFinite(slipLimit)
    ? smoothstep(Math.abs(manual - angle), slipLimit, slipLimit + 0.1) : 0;
  const blend = Math.max(smoothstep(Math.abs(angle), 0.08, 0.35), scrubBlend) * smoothstep(forward, 2, 6);
  // Leave a small driver-controlled slip angle for cornering force instead of
  // aligning perfectly with travel and removing all front lateral force.
  const assisted = angle + input * Math.min(0.22, slipLimit);
  return Math.max(-limit, Math.min(limit, manual + (assisted - manual) * blend));
}
