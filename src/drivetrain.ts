import { TransmissionTCU, redlineRpm, downshiftRpm } from './transmission';

const radiansToRpm = 60 / (2 * Math.PI);
const idleSpeed = 850 / radiansToRpm;
const engineInertia = 0.35;
export const wheelInertia = 2;
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
    rpm: 850, gear: 1, throttle: 0, load: 0, boost: 0, shifting: false, limiterCut: false,
  };
  private engineSpeed = idleSpeed;
  private gearIndex = 0;
  private reversing = false;
  private shiftTime = 0;
  private shiftCooldown = 0;
  private readonly transmission = new TransmissionTCU();
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
      rpm: 850, gear: 1, throttle: 0, load: 0, boost: 0, shifting: false, limiterCut: false,
    });
  }

  // Called alongside the tire integration; clutch reaction loads the engine
  // while the equal and opposite geared torque drives the two rear wheels.
  step(dt: number, input: DrivetrainInput): number {
    const state = this.state;
    if (input.throttle < this.previousPedal) this.liftingOffThrottle = true;
    else if (input.throttle > this.previousPedal) this.liftingOffThrottle = false;
    this.previousPedal = input.throttle;
    const throttle = this.transmission.remapThrottle(input.throttle);
    this.shiftTime = Math.max(0, this.shiftTime - dt);
    this.shiftCooldown = Math.max(0, this.shiftCooldown - dt);
    if (input.reversing !== this.reversing) {
      this.reversing = input.reversing;
      this.gearIndex = 0;
      this.shiftTime = 0.18;
      this.shiftCooldown = 0.65;
    }
    const direction = this.reversing ? -1 : 1;
    const wheelSpeed = input.wheelSpeed * direction;
    if (!this.reversing && !this.shiftCooldown && !input.handbrake) {
      const gear = this.gearIndex + 1;
      const requested = this.transmission.determineGear(
        gear, state.rpm, this.liftingOffThrottle,
      );
      const nextRatio = this.transmission.getRatio(requested);
      const nextWheelRpm = Math.max(0, wheelSpeed) * nextRatio * radiansToRpm;
      const nextRoadRpm = Math.max(0, input.roadWheelSpeed) * nextRatio * radiansToRpm;
      // Do not run through the gears during a stationary burnout or select
      // a lower gear that would mechanically over-rev the engine.
      if ((requested > gear && nextRoadRpm >= downshiftRpm)
        || (requested < gear && nextWheelRpm < 6000)) {
        this.gearIndex = requested - 1;
        this.shiftTime = 0.22;
      }
      if (this.shiftTime > 0) this.shiftCooldown = 0.65;
    }
    const ratio = this.transmission.getRatio(this.reversing ? -1 : this.gearIndex + 1);
    const shaftSpeed = wheelSpeed * ratio;
    const shaftRpm = shaftSpeed * radiansToRpm;
    const shiftEngagement = 1 - smoothstep(this.shiftTime, 0, 0.12);
    const launchEngagement = Math.max(
      smoothstep(state.rpm, 2500, 4400), smoothstep(shaftRpm, 1400, 2400),
    );
    const clutchCapacity = input.handbrake ? 0
      : Math.max(560, input.peakTorque * 1.25) * launchEngagement * shiftEngagement;
    if (state.rpm >= redlineRpm) state.limiterCut = true;
    else if (state.rpm <= redlineRpm - 350) state.limiterCut = false;
    const firing = !state.limiterCut && this.shiftTime === 0 && !input.speedLimited;
    const load = firing ? throttle : 0;
    const boostTarget = throttle * smoothstep(state.rpm, 1700, 4500);
    state.boost += (boostTarget - state.boost) * (1 - Math.exp(-dt * (boostTarget > state.boost ? 2 : 10)));
    const torqueCurve = (0.65 + 0.35 * smoothstep(state.rpm, 1000, 4000))
      * (1 - 0.18 * smoothstep(state.rpm, 5500, 7500));
    const combustion = load * Math.min(
      input.peakTorque * torqueCurve * (0.8 + state.boost * 0.2),
      input.peakPower / Math.max(this.engineSpeed, idleSpeed),
    );
    const drag = (22 + this.engineSpeed * 0.055) * (1 - load * 0.85);
    const idleTorque = clamp(drag + (idleSpeed - this.engineSpeed) * 3, 0, 120) * (1 - throttle);
    const freeSpeed = this.engineSpeed + (combustion + idleTorque - drag) / engineInertia * dt;
    const efficiency = freeSpeed >= shaftSpeed ? 0.9 : 1 / 0.9;
    // Solve the locking impulse using engine and reflected wheel inertia.
    // A viscous coupling would keep wasting power in clutch slip even at speed.
    const inverseInertia = 1 / engineInertia + ratio * ratio * efficiency / (2 * wheelInertia);
    const clutchTorque = clamp((freeSpeed - shaftSpeed) / (dt * inverseInertia), -clutchCapacity, clutchCapacity);
    this.engineSpeed = Math.max(0, freeSpeed - clutchTorque / engineInertia * dt);
    state.rpm = this.engineSpeed * radiansToRpm;
    state.gear = this.reversing ? -1 : this.gearIndex + 1;
    state.throttle = throttle;
    state.load = load;
    state.shifting = this.shiftTime > 0;
    return clutchTorque * ratio * direction * efficiency / 2;
  }
}
