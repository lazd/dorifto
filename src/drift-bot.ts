import * as THREE from 'three';
import { vehicleSettings } from './vehicle-settings';
import driftBotTuningsJson from './drift-bot-tunings.json';
import type { PhysicsConfiguration, PhysicsControls } from './vehicle-physics';
import type { BotThinking, DrivingMap, RaceBotOptions, VehicleState } from './race-bot';

/**
 * Drift driver after Joa et al. (2020), "A new control approach for automated drifting in
 * consideration of the driving characteristics of an expert human driver". A supervisor picks
 * a desired yaw rate and rear slip ratio; steering tracks the yaw rate through the front axle's
 * lateral force and throttle holds the rear wheels at a constant slip ratio, which keeps the
 * rear tires saturated and the car sideways. Modes follow the paper's grip, initiation, drift
 * and termination cycle. The paper leaves path tracking to future work; here the desired yaw
 * rate comes from a pure-pursuit curvature on the velocity direction toward the centerline.
 */
export const driftBotPresets = ['drift-default'] as const;
export type DriftBotPreset = (typeof driftBotPresets)[number];
export type DriftBotTuning = {
  /** Desired rear wheel slip ratio while drifting; the paper uses 0.3, beyond the peak. */
  rearSlipRatio: number;
  /** Slip ratio given up per m/s over the corner's drift speed. */
  speedSlipGain: number;
  /** Throttle per unit of rear slip ratio error. */
  slipGain: number;
  /** Integral throttle per unit of slip ratio error per second; adapts the feedforward. */
  slipIntegral: number;
  /** Yaw-rate error feedback, 1/s. */
  yawGain: number;
  /** Path lookahead, seconds of travel beyond a fixed 6 m. */
  lookaheadTime: number;
  /** How far ahead (seconds of travel) a corner switches drifting on. */
  previewTime: number;
  /** Centerline curvature (1/m) worth drifting through. */
  driftCurvature: number;
  /** Lateral acceleration (m/s²) the speed profile allows while drifting. */
  driftGrip: number;
  /** Deceleration (m/s²) the speed profile brakes at before corners. */
  brakingLimit: number;
  /** Throttle held while terminating a drift. */
  exitThrottle: number;
  /** Body slip angle (rad) held while drifting. */
  driftAngle: number;
  /** Extra yaw rate (rad/s) per rad of body slip short of the drift angle. */
  angleGain: number;
  /** Body slip (rad) below which an under-rotating car taps the handbrake; 0 disables it. */
  handbrakeSlip: number;
};
export const driftBotTunings: Record<DriftBotPreset, DriftBotTuning> = driftBotTuningsJson;

export type DriftMode = 'grip' | 'initiation' | 'drift' | 'termination';
/** Rear tire slip angle (rad) beyond which the paper considers the car drifting. */
const driftSlipAngle = (6 * Math.PI) / 180;
const minDriftSpeed = 10;
/** Seconds per handbrake tap; at least as long passes between taps. */
const handbrakePulse = 0.3;
const maxSpeed = 45;
const clamp = THREE.MathUtils.clamp;
const wrap = THREE.MathUtils.euclideanModulo;
const angle = (value: number) => Math.atan2(Math.sin(value), Math.cos(value));

export function isDriftBotPreset(preset: string | undefined): preset is DriftBotPreset {
  return driftBotPresets.includes(preset as DriftBotPreset);
}

/** Smoothed centerline curvature, positive toward positive yaw. */
export function centerlineCurvatures(map: DrivingMap) {
  const { centers, spacing } = map;
  const count = centers.length;
  const headings = centers.map((_, i) => {
    const after = centers[(i + 1) % count];
    const before = centers[(i - 1 + count) % count];
    return Math.atan2(after.x - before.x, after.z - before.z);
  });
  const raw = headings.map(
    (_, i) => angle(headings[(i + 1) % count] - headings[(i - 1 + count) % count]) / (2 * spacing),
  );
  const span = 2;
  return raw.map((_, i) => {
    let sum = 0;
    for (let k = -span; k <= span; k++) sum += raw[wrap(i + k, count)];
    return sum / (2 * span + 1);
  });
}

export function createDriftBot(
  map: DrivingMap,
  configuration: PhysicsConfiguration,
  dimensions: { wheelbase: number; halfWidth: number; halfLength: number },
  options: { preset?: RaceBotOptions['preset']; tuning?: DriftBotTuning } = {},
) {
  const driver =
    options.tuning ??
    driftBotTunings[isDriftBotPreset(options.preset) ? options.preset : 'drift-default'];
  const tuning = configuration.profiles[configuration.driveMode];
  const { centers, rights, spacing } = map;
  const count = centers.length;
  const curvatures = centerlineCurvatures(map);
  const mass = vehicleSettings.massKg;
  const yawInertia = vehicleSettings.inertiaKgM2.yaw;
  const wheelbase = dimensions.wheelbase;
  const frontLength = wheelbase * (1 - vehicleSettings.frontWeightFraction);
  const rearLength = wheelbase - frontLength;
  const frontStiffness = 2 * tuning.frontStiffness;
  const frontCapacity =
    ((mass * 9.81 * rearLength) / wheelbase) * tuning.friction * tuning.frontGrip;
  // Corner speeds for a drift held at the profile's lateral acceleration, braked into backward.
  const speeds = curvatures.map((curvature) =>
    Math.min(maxSpeed, Math.sqrt(driver.driftGrip / Math.max(Math.abs(curvature), 1e-4))),
  );
  for (let pass = 0; pass < 2; pass++)
    for (let i = count - 1; i >= 0; i--) {
      const next = speeds[(i + 1) % count];
      speeds[i] = Math.min(speeds[i], Math.sqrt(next ** 2 + 2 * driver.brakingLimit * spacing));
    }

  const controls: PhysicsControls = {
    throttle: 0,
    brake: 0,
    reverse: 0,
    steer: 0,
    handbrake: false,
    clutch: false,
  };
  const thinking: BotThinking = {
    phase: 'driving',
    maneuver: 'grip',
    racePosition: null,
    conditions: { slowing: false, braking: false, stabilizing: false, stoppingBackward: false },
  };
  let index = -1;
  let mode: DriftMode = 'grip';
  let elapsed = 0;
  let progress = 0;
  let lateralError = 0;
  let targetSpeed = 0;
  let desiredYawRate = 0;
  let previousDesiredYawRate = 0;
  let desiredYawAcceleration = 0;
  let lateralAcceleration = 0;
  let previousVx = 0;
  let previousVz = 0;
  let slipRatio = 0;
  let rearSlipAngle = 0;
  let slipThrottle = 0;
  let offTrackSeconds = 0;
  let maxSlip = 0;
  let handbrakeTime = 0;

  function reset() {
    index = -1;
    mode = 'grip';
    elapsed = progress = lateralError = targetSpeed = 0;
    desiredYawRate = previousDesiredYawRate = desiredYawAcceleration = 0;
    lateralAcceleration = previousVx = previousVz = 0;
    slipRatio = rearSlipAngle = slipThrottle = offTrackSeconds = maxSlip = handbrakeTime = 0;
    thinking.maneuver = 'grip';
    for (const key of Object.keys(thinking.conditions) as (keyof BotThinking['conditions'])[])
      thinking.conditions[key] = false;
    Object.assign(controls, {
      throttle: 0,
      brake: 0,
      reverse: 0,
      steer: 0,
      handbrake: false,
      clutch: false,
    });
  }

  /** Largest centerline curvature over a distance ahead, signed. */
  function curvatureAhead(distance: number) {
    let peak = 0;
    for (let k = 0; k * spacing <= distance; k++) {
      const curvature = curvatures[(index + k) % count];
      if (Math.abs(curvature) > Math.abs(peak)) peak = curvature;
    }
    return peak;
  }

  function locate(state: VehicleState) {
    let nearest = index;
    let best = Infinity;
    const search = index < 0 ? count : 20;
    for (
      let i = index < 0 ? 0 : index - search;
      i < (index < 0 ? count : index + search + 1);
      i++
    ) {
      const candidate = wrap(i, count);
      const distance =
        (centers[candidate].x - state.x) ** 2 + (centers[candidate].z - state.z) ** 2;
      if (distance < best) {
        nearest = candidate;
        best = distance;
      }
    }
    if (index >= 0)
      progress += (angle(((nearest - index) * Math.PI * 2) / count) * map.length) / (Math.PI * 2);
    index = nearest;
    const center = centers[index];
    const right = rights[index];
    lateralError = (state.x - center.x) * right.x + (state.z - center.z) * right.z;
  }

  function update(state: VehicleState, dt: number) {
    locate(state);
    elapsed += dt;
    const sin = Math.sin(state.heading);
    const cos = Math.cos(state.heading);
    const vx = state.vx * sin + state.vz * cos;
    const vy = state.vx * cos - state.vz * sin;
    const forward = Math.max(vx, 1);
    // Body-frame lateral acceleration, low-passed against step-to-step contact noise.
    if (elapsed > dt) {
      const ay = ((state.vx - previousVx) * cos - (state.vz - previousVz) * sin) / dt;
      lateralAcceleration += (ay - lateralAcceleration) * Math.min(1, dt / 0.05);
    }
    previousVx = state.vx;
    previousVz = state.vz;
    slipRatio = (state.rearWheelSpeed - vx) / Math.max(Math.abs(vx), 4);
    rearSlipAngle = Math.atan2(vy - rearLength * state.yawRate, forward);
    maxSlip = Math.max(maxSlip, Math.abs(state.slipAngle));
    const relativeHeading = state.heading - Math.atan2(-rights[index].z, rights[index].x);
    const footprint =
      Math.abs(Math.cos(relativeHeading)) * dimensions.halfWidth +
      Math.abs(Math.sin(relativeHeading)) * dimensions.halfLength;
    if (Math.abs(lateralError) + footprint > map.definition.width / 2) offTrackSeconds += dt;

    // Supervisor: path curvature from the velocity direction, so a sideways car still aims
    // its travel at the centerline, and the desired yaw rate γ = vₓ·κ of the paper (eq 5).
    const lookahead = 6 + state.speed * driver.lookaheadTime;
    const targetIndex = (index + Math.max(1, Math.round(lookahead / spacing))) % count;
    const target = centers[targetIndex];
    const dx = target.x - state.x;
    const dz = target.z - state.z;
    const travel = state.speed > 1 ? Math.atan2(state.vx, state.vz) : state.heading;
    const pathCurvature =
      (2 * Math.sin(angle(Math.atan2(dx, dz) - travel))) / Math.max(Math.hypot(dx, dz), 2);
    desiredYawRate = vx * pathCurvature;
    desiredYawAcceleration +=
      ((desiredYawRate - previousDesiredYawRate) / dt - desiredYawAcceleration) *
      Math.min(1, dt / 0.1);
    previousDesiredYawRate = desiredYawRate;

    const preview = curvatureAhead(state.speed * driver.previewTime);
    const cornering = Math.abs(preview) > driver.driftCurvature;
    const sliding = Math.abs(rearSlipAngle) > driftSlipAngle;
    if (mode === 'grip' && cornering && state.speed > minDriftSpeed) mode = 'initiation';
    else if (mode === 'initiation' && sliding) mode = 'drift';
    else if (mode === 'initiation' && !cornering) mode = 'grip';
    else if (mode === 'drift' && !cornering) mode = 'termination';
    else if (mode === 'termination' && cornering) mode = sliding ? 'drift' : 'initiation';
    else if (mode === 'termination' && !sliding) mode = 'grip';
    thinking.maneuver = mode;
    // Our tires keep most of their side force under wheelspin, so throttle alone settles at a
    // shallow angle; while drifting, also yaw the car toward the drift angle on the corner side.
    const driftSide = Math.sign(curvatures[targetIndex]);
    if (mode === 'initiation' || mode === 'drift')
      desiredYawRate += driver.angleGain * (state.slipAngle + driftSide * driver.driftAngle);

    // Lateral control (eqs 12–14): front axle force for the yaw-rate response, then the
    // steering angle that produces it, inverting the tire model's saturation.
    const yawError = state.yawRate - desiredYawRate;
    const frontForce = clamp(
      (rearLength * mass * lateralAcceleration +
        yawInertia * (desiredYawAcceleration - driver.yawGain * yawError)) /
        wheelbase,
      -0.97 * frontCapacity,
      0.97 * frontCapacity,
    );
    const frontSlip = (Math.atanh(frontForce / frontCapacity) * frontCapacity) / frontStiffness;
    const wheelAngle = frontSlip + Math.atan2(vy + frontLength * state.yawRate, forward);
    const steeringLimit =
      THREE.MathUtils.lerp(
        tuning.steeringLow,
        tuning.steeringHigh,
        Math.min((state.speed * 3.6) / 140, 1),
      ) * tuning.steeringScale;
    controls.steer = clamp(wheelAngle / steeringLimit, -1, 1);

    // Longitudinal control: excessive throttle to initiate, a slip-ratio loop to sustain
    // (eq 9), minimum throttle to terminate, and speed tracking with grip.
    targetSpeed = speeds[index];
    const overspeed = state.speed - targetSpeed;
    let throttle: number;
    let brake = 0;
    if (mode === 'drift') {
      // Lifting regains rear grip when the car rotates past the drift angle.
      const overrotation = THREE.MathUtils.smoothstep(
        Math.abs(state.slipAngle),
        driver.driftAngle,
        driver.driftAngle + 0.25,
      );
      const desiredSlip =
        Math.max(0, driver.rearSlipRatio - driver.speedSlipGain * Math.max(0, overspeed)) *
        (1 - overrotation);
      const error = desiredSlip - slipRatio;
      slipThrottle = clamp(slipThrottle + driver.slipIntegral * error * dt, 0, 1);
      throttle = clamp(slipThrottle + driver.slipGain * error, 0, 1);
    } else if (mode === 'initiation' && overspeed <= 0) {
      throttle = 1;
      slipThrottle = 1;
    } else if (mode === 'termination') {
      throttle = driver.exitThrottle;
    } else {
      throttle = clamp(-overspeed * 0.5, 0, 1);
      brake = overspeed > 2 ? clamp((overspeed - 2) * 0.3, 0, 1) : 0;
    }
    // The paper initiates on throttle alone, but at our speeds the engine can't always break the
    // rear loose; tap the handbrake when the car won't rotate. A clutch kick (`controls.clutch`)
    // revs but doesn't rotate the car enough. Training can disable this with a zero handbrake slip.
    const wantHandbrake =
      (mode === 'initiation' || mode === 'drift') &&
      state.speed > minDriftSpeed &&
      Math.abs(state.slipAngle) < driver.handbrakeSlip &&
      driftSide * (desiredYawRate - state.yawRate) > 0;
    handbrakeTime = handbrakeTime > 0 ? handbrakeTime + dt : 0;
    if (handbrakeTime > handbrakePulse * 2) handbrakeTime = 0;
    if (wantHandbrake && handbrakeTime === 0) handbrakeTime = dt;
    thinking.conditions.braking = brake > 0;
    thinking.conditions.slowing = throttle === 0 && brake === 0;
    thinking.conditions.stabilizing = Math.abs(state.slipAngle) > 1;
    controls.throttle = brake > 0 ? 0 : throttle;
    controls.brake = brake;
    controls.handbrake = handbrakeTime > 0 && handbrakeTime <= handbrakePulse;
    return controls;
  }

  return {
    controls,
    update,
    reset,
    finishRun() {},
    get thinking(): BotThinking {
      return { ...thinking, conditions: { ...thinking.conditions } };
    },
    get metrics() {
      return {
        elapsed,
        index,
        progress,
        maxSlip,
        offTrackSeconds,
        targetSpeed,
        lateralError,
        mode,
        desiredYawRate,
        slipRatio,
        rearSlipAngle,
      };
    },
  };
}
