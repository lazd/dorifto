import { vehicleSettings } from './vehicle-settings';

export const redlineRpm = 7500;
export const downshiftRpm = 4000;
export const idleRpm = 700;
const ratios = [2.97, 2.1, 1.46, 1.0, 0.8, 0.63];
const finalDrive = 3.692;
const reverseRatio = 3.369;

const radiansToRpm = 60 / (2 * Math.PI);
const idleSpeed = idleRpm / radiansToRpm;
const engineInertia = vehicleSettings.engineInertiaKgM2;
export const wheelInertia = vehicleSettings.wheelInertiaKgM2;
const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const smoothstep = (value: number, low: number, high: number) => {
  const t = clamp((value - low) / (high - low));
  return t * t * (3 - 2 * t);
};

export interface DrivetrainInput {
  throttle: number;
  reversing: boolean;
  wheelSpeed: number;
  roadWheelSpeed: number;
  handbrake: boolean;
  speedLimited: boolean;
  peakTorque: number;
  peakPower: number;
}

export interface DrivetrainState {
  rpm: number;
  gear: number;
  throttle: number;
  load: number;
  boost: number;
  shifting: boolean;
  limiterCut: boolean;
}

export class Drivetrain {
  readonly state: DrivetrainState = {
    rpm: idleRpm,
    gear: 1,
    throttle: 0,
    load: 0,
    boost: 0,
    shifting: false,
    limiterCut: false,
  };
  private engineSpeed = idleSpeed;
  private gearIndex = 0;
  private reversing = false;
  private shiftTime = 0;
  private shiftCooldown = 0;
  private previousPedal = 0;
  private liftingOffThrottle = false;

  reset() {
    this.engineSpeed = idleSpeed;
    this.gearIndex = 0;
    this.reversing = false;
    this.shiftTime = this.shiftCooldown = 0;
    this.previousPedal = 0;
    this.liftingOffThrottle = false;
    Object.assign(this.state, {
      rpm: idleRpm,
      gear: 1,
      throttle: 0,
      load: 0,
      boost: 0,
      shifting: false,
      limiterCut: false,
    });
  }

  // Called alongside the tire integration; clutch reaction loads the engine
  // while the equal and opposite geared torque drives the two rear wheels.
  step(dt: number, input: DrivetrainInput): number {
    const throttle = this.updateThrottle(input.throttle);
    this.updateShifting(dt, input);
    const direction = this.reversing ? -1 : 1;
    const ratio = this.getRatio(this.reversing ? -1 : this.gearIndex + 1);
    const shaftSpeed = input.wheelSpeed * direction * ratio;
    const clutchCapacity = this.getClutchCapacity(input, shaftSpeed);
    this.updateRevLimiter();
    const load = this.getEngineLoad(throttle, input.speedLimited);
    this.updateBoost(dt, throttle);
    const engineTorque = this.getEngineTorque(input, throttle, load);
    const wheelTorque = this.transferClutchTorque(
      dt,
      engineTorque,
      shaftSpeed,
      ratio,
      clutchCapacity,
    );
    this.updateState(throttle, load);
    return wheelTorque * direction;
  }

  private updateThrottle(pedal: number): number {
    if (pedal < this.previousPedal) this.liftingOffThrottle = true;
    else if (pedal > this.previousPedal) this.liftingOffThrottle = false;
    this.previousPedal = pedal;
    return Math.sqrt(pedal);
  }

  private getRatio(gear: number): number {
    if (gear === -1) return reverseRatio * finalDrive;
    if (!Number.isInteger(gear) || gear < 1 || gear > ratios.length) {
      throw new Error(`Invalid transmission gear: ${gear}`);
    }
    return ratios[gear - 1] * finalDrive;
  }

  private determineGear(): number {
    const gear = this.gearIndex + 1;
    if (this.state.rpm < downshiftRpm && gear > 1) return gear - 1;
    if (!this.liftingOffThrottle && this.state.rpm >= redlineRpm && gear < ratios.length)
      return gear + 1;
    return gear;
  }

  private canShiftTo(gear: number, input: DrivetrainInput): boolean {
    const ratio = this.getRatio(gear);
    const wheelRpm = Math.max(0, input.wheelSpeed) * ratio * radiansToRpm;
    const roadRpm = Math.max(0, input.roadWheelSpeed) * ratio * radiansToRpm;
    // Avoid stationary-wheelspin upshifts and mechanically unsafe downshifts.
    return (
      (gear > this.gearIndex + 1 && roadRpm >= downshiftRpm) ||
      (gear < this.gearIndex + 1 && wheelRpm < 6000)
    );
  }

  private updateShifting(dt: number, input: DrivetrainInput) {
    this.shiftTime = Math.max(0, this.shiftTime - dt);
    this.shiftCooldown = Math.max(0, this.shiftCooldown - dt);
    if (input.reversing !== this.reversing) {
      this.reversing = input.reversing;
      this.gearIndex = 0;
      this.shiftTime = 0.18;
      this.shiftCooldown = 0.65;
    }
    if (!this.reversing && !this.shiftCooldown && !input.handbrake) {
      const requested = this.determineGear();
      if (this.canShiftTo(requested, input)) {
        this.gearIndex = requested - 1;
        this.shiftTime = 0.22;
      }
      if (this.shiftTime > 0) this.shiftCooldown = 0.65;
    }
  }

  private getClutchCapacity(input: DrivetrainInput, shaftSpeed: number): number {
    const shaftRpm = shaftSpeed * radiansToRpm;
    const shiftEngagement = 1 - smoothstep(this.shiftTime, 0, 0.12);
    const launchEngagement = Math.max(
      smoothstep(this.state.rpm, 2500, 4400),
      smoothstep(shaftRpm, 1400, 2400),
    );
    return input.handbrake
      ? 0
      : Math.max(560, input.peakTorque * 1.25) * launchEngagement * shiftEngagement;
  }

  private updateRevLimiter() {
    const state = this.state;
    if (state.rpm >= redlineRpm) state.limiterCut = true;
    else if (state.rpm <= redlineRpm - 350) state.limiterCut = false;
  }

  private getEngineLoad(throttle: number, speedLimited: boolean): number {
    const firing = !this.state.limiterCut && this.shiftTime === 0 && !speedLimited;
    return firing ? throttle : 0;
  }

  private updateBoost(dt: number, throttle: number) {
    const state = this.state;
    const boostTarget = throttle * smoothstep(state.rpm, 1700, 4500);
    state.boost +=
      (boostTarget - state.boost) * (1 - Math.exp(-dt * (boostTarget > state.boost ? 2 : 10)));
  }

  private getEngineTorque(input: DrivetrainInput, throttle: number, load: number): number {
    const state = this.state;
    const torqueCurve =
      (0.65 + 0.35 * smoothstep(state.rpm, 1000, 4000)) *
      (1 - 0.18 * smoothstep(state.rpm, 5500, 7500));
    const combustion =
      load *
      Math.min(
        input.peakTorque * torqueCurve * (0.8 + state.boost * 0.2),
        input.peakPower / Math.max(this.engineSpeed, idleSpeed),
      );
    const drag = (22 + this.engineSpeed * 0.055) * (1 - load * 0.85);
    const idleTorque = clamp(drag + (idleSpeed - this.engineSpeed) * 3, 0, 120) * (1 - throttle);
    const torque = combustion + idleTorque - drag;
    return torque < 0 ? torque * (3 - throttle * 2) : torque;
  }

  private transferClutchTorque(
    dt: number,
    engineTorque: number,
    shaftSpeed: number,
    ratio: number,
    clutchCapacity: number,
  ): number {
    const freeSpeed = this.engineSpeed + (engineTorque / engineInertia) * dt;
    const efficiency = freeSpeed >= shaftSpeed ? 0.9 : 1 / 0.9;
    // Solve the locking impulse using engine and reflected wheel inertia.
    // A viscous coupling would keep wasting power in clutch slip even at speed.
    const inverseInertia = 1 / engineInertia + (ratio * ratio * efficiency) / (2 * wheelInertia);
    const clutchTorque = clamp(
      (freeSpeed - shaftSpeed) / (dt * inverseInertia),
      -clutchCapacity,
      clutchCapacity,
    );
    this.engineSpeed = Math.max(0, freeSpeed - (clutchTorque / engineInertia) * dt);
    return (clutchTorque * ratio * efficiency) / 2;
  }

  private updateState(throttle: number, load: number) {
    const state = this.state;
    state.rpm = this.engineSpeed * radiansToRpm;
    state.gear = this.reversing ? -1 : this.gearIndex + 1;
    state.throttle = throttle;
    state.load = load;
    state.shifting = this.shiftTime > 0;
  }
}
