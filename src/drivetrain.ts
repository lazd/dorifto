const ratios = [3.214, 1.925, 1.302, 1, 0.752];
const finalDrive = 3.692;
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
  sliding: boolean;
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
  private slideHold = 0;

  reset() {
    this.engineSpeed = idleSpeed;
    this.gearIndex = 0;
    this.reversing = false;
    this.shiftTime = this.shiftCooldown = this.slideHold = 0;
    Object.assign(this.state, {
      rpm: 850, gear: 1, throttle: 0, load: 0, boost: 0, shifting: false, limiterCut: false,
    });
  }

  // Called alongside the tire integration; clutch reaction loads the engine
  // while the equal and opposite geared torque drives the two rear wheels.
  step(dt: number, input: DrivetrainInput): number {
    const state = this.state;
    this.shiftTime = Math.max(0, this.shiftTime - dt);
    this.shiftCooldown = Math.max(0, this.shiftCooldown - dt);
    this.slideHold = input.sliding || input.handbrake ? 0.6 : Math.max(0, this.slideHold - dt);
    if (input.reversing !== this.reversing) {
      this.reversing = input.reversing;
      this.gearIndex = 0;
      this.shiftTime = 0.18;
      this.shiftCooldown = 0.65;
    }
    const direction = this.reversing ? -1 : 1;
    const wheelSpeed = input.wheelSpeed * direction;
    if (!this.reversing && !this.shiftCooldown) {
      const upshiftRpm = 4800 + input.throttle * 1800;
      const lowerGearRpm = wheelSpeed * (ratios[this.gearIndex - 1] ?? ratios[0]) * finalDrive * radiansToRpm;
      if (!this.slideHold && state.rpm > upshiftRpm && this.gearIndex < ratios.length - 1) {
        this.gearIndex++;
        this.shiftTime = 0.22;
      } else if (!input.handbrake && this.gearIndex > 0
        && (state.rpm < (input.throttle > 0.65 ? 3800 : 2300)
          || (wheelSpeed < -1 && input.throttle > 0.25)) && lowerGearRpm < 6000) {
        this.gearIndex--;
        this.shiftTime = 0.22;
      }
      if (this.shiftTime > 0) this.shiftCooldown = 0.65;
    }
    const ratio = (this.reversing ? 3.369 : ratios[this.gearIndex]) * finalDrive;
    const shaftSpeed = wheelSpeed * ratio;
    const shaftRpm = shaftSpeed * radiansToRpm;
    const shiftEngagement = 1 - smoothstep(this.shiftTime, 0, 0.12);
    const launchEngagement = Math.max(
      smoothstep(state.rpm, 2500, 4400), smoothstep(shaftRpm, 1400, 2400),
    );
    const clutchCapacity = input.handbrake ? 0 : 560 * launchEngagement * shiftEngagement;
    if (state.rpm >= 7200) state.limiterCut = true;
    else if (state.rpm <= 6850) state.limiterCut = false;
    const firing = !state.limiterCut && this.shiftTime === 0 && !input.speedLimited;
    const load = firing ? input.throttle : 0;
    const boostTarget = input.throttle * smoothstep(state.rpm, 1700, 4500);
    state.boost += (boostTarget - state.boost) * (1 - Math.exp(-dt * (boostTarget > state.boost ? 2 : 10)));
    const torqueCurve = (0.65 + 0.35 * smoothstep(state.rpm, 1000, 4000))
      * (1 - 0.18 * smoothstep(state.rpm, 5500, 7500));
    const combustion = load * Math.min(
      input.peakTorque * torqueCurve * (0.8 + state.boost * 0.2),
      input.peakPower / Math.max(this.engineSpeed, idleSpeed),
    );
    const drag = (22 + this.engineSpeed * 0.055) * (1 - load * 0.85);
    const idleTorque = clamp(drag + (idleSpeed - this.engineSpeed) * 3, 0, 120) * (1 - input.throttle);
    const freeSpeed = this.engineSpeed + (combustion + idleTorque - drag) / engineInertia * dt;
    const efficiency = freeSpeed >= shaftSpeed ? 0.9 : 1 / 0.9;
    // Solve the locking impulse using engine and reflected wheel inertia.
    // A viscous coupling would keep wasting power in clutch slip even at speed.
    const inverseInertia = 1 / engineInertia + ratio * ratio * efficiency / (2 * wheelInertia);
    const clutchTorque = clamp((freeSpeed - shaftSpeed) / (dt * inverseInertia), -clutchCapacity, clutchCapacity);
    this.engineSpeed = Math.max(0, freeSpeed - clutchTorque / engineInertia * dt);
    state.rpm = this.engineSpeed * radiansToRpm;
    state.gear = this.reversing ? -1 : this.gearIndex + 1;
    state.throttle = input.throttle;
    state.load = load;
    state.shifting = this.shiftTime > 0;
    return clutchTorque * ratio * direction * efficiency / 2;
  }
}
