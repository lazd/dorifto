export const driveModes = {
  drift: {
    steeringLow: 1.2,
    steeringHigh: 1.1,
    steeringScale: 1.01,
    steeringExpo: 0.65,
    steeringRate: 2,
    steeringAssist: true,
    steeringSlipLimit: 0.16,
    steeringAssistResponse: 0.08,
    steeringReturnScale: 1,
    steeringResponse: 6,
    tireRelaxationLength: 0.3,
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
    steeringAssistResponse: 0,
    steeringReturnScale: 1.6,
    steeringResponse: 10,
    tireRelaxationLength: 0,
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

export function driftSteeringAngle(input: number, limit: number, forward: number, lateral: number,
  response: { blend: number }, responseTime: number, dt: number): number {
  const manual = input * limit;
  if (forward <= 2) {
    response.blend = 0;
    return manual;
  }
  const angle = Math.atan2(lateral, forward);
  const speedBlend = Math.max(0, Math.min(1, (forward - 2) / 4));
  const slideBlend = Math.max(0, Math.min(1, (Math.abs(angle) - 0.04) / 0.2));
  const target = speedBlend * slideBlend;
  response.blend = responseTime > 0
    ? response.blend + (target - response.blend) * (1 - Math.exp(-dt / responseTime))
    : target;
  // Assistance adds a bounded correction, fading out as the driver takes lock.
  // It never remaps the stick to a requested front-tire slip angle.
  const authority = 0.22 * (1 - Math.min(1, Math.abs(input)));
  const correction = Math.max(-authority, Math.min(authority, angle * 0.35)) * response.blend;
  return Math.max(-limit, Math.min(limit, manual + correction));
}

export function assistedSteeringAngle(input: number, limit: number, forward: number, lateral: number,
  slipLimit = Infinity, response?: { blend: number }, responseTime = 0, dt = 0): number {
  const manual = input * limit;
  if (forward <= 2) {
    if (response) response.blend = 0;
    return manual;
  }
  const angle = Math.atan2(lateral, forward);
  const smoothstep = (value: number, low: number, high: number) => {
    const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
    return t * t * (3 - 2 * t);
  };
  const scrubBlend = Number.isFinite(slipLimit)
    ? smoothstep(Math.abs(manual - angle), slipLimit, slipLimit + 0.1) : 0;
  const targetBlend = Math.max(smoothstep(Math.abs(angle), 0.08, 0.35), scrubBlend) * smoothstep(forward, 2, 6);
  if (response) response.blend = responseTime > 0
    ? response.blend + (targetBlend - response.blend) * (1 - Math.exp(-dt / responseTime))
    : targetBlend;
  // Do not delay scrub protection while the slide-assist blend catches up.
  const blend = Math.max(response?.blend ?? targetBlend, scrubBlend * smoothstep(forward, 2, 6));
  // Leave a small driver-controlled slip angle for cornering force instead of
  // aligning perfectly with travel and removing all front lateral force.
  const assisted = angle + input * Math.min(0.22, slipLimit);
  return Math.max(-limit, Math.min(limit, manual + (assisted - manual) * blend));
}
