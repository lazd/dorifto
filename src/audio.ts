import processorUrl from './engine-worklet.js?url';

const ratios = [3.214, 1.925, 1.302, 1, 0.752];
const finalDrive = 3.692;
const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const damp = (value: number, target: number, response: number, dt: number) =>
  target + (value - target) * Math.exp(-response * dt);

export interface VehicleSoundState {
  speed: number;
  throttle: number;
  reversing: boolean;
  drivenWheelSpeed: number;
  drivenRoadSpeed: number;
  tires: readonly TireSoundState[];
}

export interface TireSoundState {
  slip: number;
  speed: number;
  load: number;
}

export class VehicleAudio {
  private context?: AudioContext;
  private node?: AudioWorkletNode;
  private master?: GainNode;
  private starting?: Promise<void>;
  private muted = false;
  private gear = 0;
  private rpm = 850;
  private boost = 0;
  private previousThrottle = 0;
  private shiftTime = 0;
  private shiftCooldown = 0;
  private wasReversing = false;
  private failed = false;
  private wheelspin = 0;

  constructor(private readonly button: HTMLButtonElement, private readonly reportError: (error: unknown) => void) {
    button.addEventListener('click', () => {
      if (!this.node || this.context?.state !== 'running') {
        this.muted = false;
        this.activate();
      } else {
        this.muted = !this.muted;
      }
      this.updateButton();
      button.blur();
    });
    const unlock = () => this.activate();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('blur', () => this.setAudible(false));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.setAudible(false);
    });
  }

  private activate() {
    if (this.starting || this.failed || (this.node && this.context?.state === 'running')) return;
    this.starting = this.start().catch((error: unknown) => {
      this.muted = true;
      this.failed = true;
      this.button.textContent = 'Sound unavailable';
      this.reportError(error);
    }).finally(() => { this.starting = undefined; });
  }

  private async start() {
    if (!this.context) this.context = new AudioContext();
    const context = this.context;
    // Resume directly in the gesture handler before awaiting worklet loading.
    const resumed = context.resume();
    if (!this.node) {
      await context.audioWorklet.addModule(processorUrl);
      const node = new AudioWorkletNode(context, 'vehicle-sound', {
        numberOfInputs: 0, numberOfOutputs: 4, outputChannelCount: [1, 1, 2, 1],
      });
      node.onprocessorerror = () => {
        this.failed = true;
        this.setAudible(false);
        this.button.textContent = 'Sound unavailable';
        this.reportError(new Error('Vehicle audio processor failed. Reload to restart sound.'));
      };
      const master = context.createGain();
      master.gain.value = 0;
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -12;
      limiter.knee.value = 12;
      limiter.ratio.value = 8;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.15;
      const rumbleFilter = context.createBiquadFilter();
      rumbleFilter.type = 'highpass';
      rumbleFilter.frequency.value = 25;
      master.connect(rumbleFilter).connect(limiter).connect(context.destination);
      const channels: { type: BiquadFilterType; frequency: number; gain: number; q: number }[] = [
        { type: 'lowpass', frequency: 1500, gain: 0.65, q: 0.7 },
        { type: 'highpass', frequency: 1100, gain: 0.28, q: 0.7 },
        { type: 'lowpass', frequency: 4800, gain: 0.28, q: 0.7 },
        { type: 'lowpass', frequency: 950, gain: 0.9, q: 0.8 },
      ];
      channels.forEach((channel, i) => {
        const filter = context.createBiquadFilter();
        filter.type = channel.type;
        filter.frequency.value = channel.frequency;
        filter.Q.value = channel.q;
        const gain = context.createGain();
        gain.gain.value = channel.gain;
        node.connect(filter, i);
        filter.connect(gain).connect(master);
      });
      this.node = node;
      this.master = master;
    }
    await resumed;
    this.updateButton();
  }

  private updateButton() {
    this.button.textContent = !this.node || this.context?.state !== 'running'
      ? 'Enable sound' : this.muted ? 'Sound: Off' : 'Sound: On';
    this.button.setAttribute('aria-pressed', String(Boolean(this.node) && !this.muted));
  }

  private setAudible(enabled: boolean) {
    if (!this.context || !this.master) return;
    this.master.gain.setTargetAtTime(enabled && !this.muted && !this.failed ? 0.55 : 0, this.context.currentTime, 0.04);
  }

  hitCone(impulse: number) {
    if (impulse < 0.5) return;
    this.node?.port.postMessage({ impact: clamp(Math.sqrt(impulse / 80), 0.1, 1) });
  }

  silence() {
    this.setAudible(false);
  }

  reset() {
    this.gear = 0;
    this.rpm = 850;
    this.boost = this.previousThrottle = this.shiftTime = this.shiftCooldown = 0;
    this.wasReversing = false;
    this.wheelspin = 0;
    this.node?.port.postMessage({ reset: true });
  }

  update(dt: number, state: VehicleSoundState, audible: boolean) {
    this.setAudible(audible);
    this.shiftCooldown = Math.max(0, this.shiftCooldown - dt);
    this.shiftTime = Math.max(0, this.shiftTime - dt);
    if (state.reversing !== this.wasReversing) {
      this.gear = 0;
      this.shiftCooldown = 0.6;
      this.wasReversing = state.reversing;
    }
    const wheelRpm = Math.abs(state.speed) / (2 * Math.PI * 0.336) * 60;
    const excessSpeed = Math.max(0, Math.abs(state.drivenWheelSpeed) * 0.336 - Math.abs(state.drivenRoadSpeed));
    const driveSlip = excessSpeed / Math.max(Math.abs(state.drivenRoadSpeed), 4);
    const spinTarget = clamp((driveSlip - 0.06) / 0.16) * clamp(excessSpeed / 2);
    this.wheelspin = damp(this.wheelspin, spinTarget, spinTarget > this.wheelspin ? 8 : 5, dt);
    const roadRpm = wheelRpm * ratios[this.gear] * finalDrive;
    let shifted = false;
    if (!state.reversing && this.shiftCooldown === 0 && this.wheelspin < 0.25) {
      if (roadRpm > 4800 + state.throttle * 1500 && this.gear < ratios.length - 1) {
        this.gear++;
        shifted = true;
      } else if (roadRpm < 2300 && this.gear > 0) {
        this.gear--;
        shifted = true;
      }
      if (shifted) {
        this.shiftTime = 0.18;
        this.shiftCooldown = 0.65;
      }
    }
    const ratio = state.reversing ? 3.369 : ratios[this.gear];
    const spinningRpm = Math.abs(state.drivenWheelSpeed) * 60 / (2 * Math.PI) * ratio * finalDrive;
    const roadCoupledRpm = wheelRpm * ratio * finalDrive;
    const coupledRpm = Math.max(roadCoupledRpm, spinningRpm);
    const spinRevs = 850 + state.throttle * this.wheelspin * 6750;
    const targetRpm = clamp(Math.max(850 + state.throttle * 1800, coupledRpm, spinRevs), 850, 7200);
    this.rpm = damp(this.rpm, targetRpm, this.shiftTime > 0 ? 18 : 9, dt);
    const load = state.throttle * (this.shiftTime > 0 ? 0.2 : 1);
    const boostTarget = load * clamp((this.rpm - 1800) / 3000);
    const release = this.previousThrottle - state.throttle > 0.15 || shifted;
    const blow = release && this.boost > 0.12 ? this.boost : 0;
    this.boost = damp(this.boost, boostTarget, boostTarget > this.boost ? 2 : 10, dt);
    this.previousThrottle = state.throttle;
    this.node?.port.postMessage({
      rpm: this.rpm, load, boost: this.boost, blow,
      tires: state.tires.map((tire) => ({
        level: Math.pow(clamp(tire.slip), 1.6),
        speed: clamp(tire.speed, 0, 50), load: clamp(tire.load, 0, 2),
      })),
      cut: this.shiftTime > 0 ? 1 : 0,
      limiter: this.rpm > 6950 && state.throttle > 0.5 ? 1 : 0,
    });
  }
}
