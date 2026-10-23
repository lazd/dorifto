import processorUrl from './engine-worklet.js?url';
import { idleRpm, type DrivetrainState } from './drivetrain';

const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value));

export interface VehicleSoundState {
  backfire?: number;
  backfireBody?: number;
  drivetrain: Readonly<DrivetrainState>;
  tires: readonly TireSoundState[];
}

export interface TireSoundState {
  slip: number;
  speed: number;
  load: number;
}

export interface OpponentSoundState extends VehicleSoundState {
  distance: number;
  pan: number;
}

function soundMessage(
  state: VehicleSoundState,
  previous: { throttle: number; gear: number; boost: number },
) {
  const engine = state.drivetrain;
  const release = previous.throttle - engine.throttle > 0.15 || previous.gear !== engine.gear;
  const boost = Math.max(previous.boost, engine.boost);
  Object.assign(previous, { throttle: engine.throttle, gear: engine.gear, boost: engine.boost });
  return {
    backfire: state.backfire ?? 0,
    backfireBody: state.backfireBody ?? 0,
    rpm: engine.rpm,
    load: engine.load,
    boost: engine.boost,
    blow: release && boost > 0.12 ? boost : 0,
    tires: state.tires.map((tire) => ({
      level: Math.pow(clamp(tire.slip), 1.6),
      speed: clamp(tire.speed, 0, 50),
      load: clamp(tire.load, 0, 2),
    })),
    cut: engine.shifting ? 1 : 0,
    limiter: engine.limiterCut ? 1 : 0,
  };
}

export class VehicleAudio {
  private context?: AudioContext;
  private node?: AudioWorkletNode;
  private master?: GainNode;
  private starting?: Promise<void>;
  private muted = false;
  private previous = { throttle: 0, gear: 1, boost: 0 };
  private readonly opponents: {
    node: AudioWorkletNode;
    gain: GainNode;
    panner: StereoPannerNode;
    filters: BiquadFilterNode[];
    gains: GainNode[];
    previous: { throttle: number; gear: number; boost: number };
  }[] = [];
  private failed = false;

  constructor(
    private readonly reportState: (state: {
      running: boolean;
      muted: boolean;
      failed: boolean;
    }) => void,
    private readonly reportError: (error: unknown) => void,
    startMuted = false,
  ) {
    this.muted = startMuted;
    const unlock = () => this.activate();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('pointerup', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('keyup', unlock);
    window.addEventListener('click', unlock);
    this.activate();
    if (startMuted) this.publishState();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (!muted) this.activate();
    this.setAudible(true);
    this.publishState();
  }

  private activate() {
    if (this.failed || this.muted) return;
    if (!this.context) {
      this.context = new AudioContext();
      this.context.addEventListener('statechange', () => this.publishState());
    }
    // A blocked resume can remain pending; never let it prevent a later
    // user gesture from issuing another resume directly in that handler.
    if (this.context.state !== 'running') {
      void this.context
        .resume()
        .then(() => {
          this.setAudible(true);
          this.publishState();
        })
        .catch((error: unknown) => {
          this.publishState();
          this.reportError(error);
        });
    }
    if (this.starting || this.node) return;
    this.starting = this.start()
      .catch((error: unknown) => {
        this.muted = true;
        this.failed = true;
        this.publishState();
        this.reportError(error);
      })
      .finally(() => {
        this.starting = undefined;
      });
  }

  private async start() {
    const context = this.context;
    if (!context) throw new Error('Audio context must be created before loading sound.');
    if (!this.node) {
      await context.audioWorklet.addModule(processorUrl);
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
      this.node = this.createSource(context, master).node;
      this.master = master;
    }
    this.setAudible(true);
    this.publishState();
  }

  private createSource(context: AudioContext, destination: AudioNode) {
    const node = new AudioWorkletNode(context, 'vehicle-sound', {
      numberOfInputs: 0,
      numberOfOutputs: 4,
      outputChannelCount: [1, 1, 2, 1],
      processorOptions: { idleRpm },
    });
    node.onprocessorerror = () => {
      this.failed = true;
      this.setAudible(false);
      this.publishState();
      this.reportError(new Error('Vehicle audio processor failed. Reload to restart sound.'));
    };
    const channels: { type: BiquadFilterType; frequency: number; gain: number; q: number }[] = [
      { type: 'lowpass', frequency: 800, gain: 0.65, q: 0.7 },
      { type: 'highpass', frequency: 900, gain: 0.28, q: 0.7 },
      { type: 'lowpass', frequency: 4800, gain: 0.28, q: 0.7 },
      { type: 'lowpass', frequency: 6500, gain: 0.9, q: 0.8 },
    ];
    const filters: BiquadFilterNode[] = [];
    const gains: GainNode[] = [];
    channels.forEach((channel, i) => {
      const filter = context.createBiquadFilter();
      filter.type = channel.type;
      filter.frequency.value = channel.frequency;
      filter.Q.value = channel.q;
      const gain = context.createGain();
      gain.gain.value = channel.gain;
      node.connect(filter, i);
      filter.connect(gain).connect(destination);
      filters.push(filter);
      gains.push(gain);
    });
    return { node, filters, gains };
  }

  private publishState() {
    this.reportState({
      running: Boolean(this.node) && this.context?.state === 'running',
      muted: this.muted,
      failed: this.failed,
    });
  }

  private setAudible(enabled: boolean) {
    if (!this.context || !this.master) return;
    this.master.gain.setTargetAtTime(
      enabled && !this.muted && !this.failed ? 0.55 : 0,
      this.context.currentTime,
      0.04,
    );
  }

  hitCone(impulse: number) {
    if (impulse < 0.5) return;
    this.node?.port.postMessage({ impact: clamp(Math.sqrt(impulse / 80), 0.1, 1) });
  }

  hitTurnSign(impulse: number) {
    if (impulse < 1) return;
    this.node?.port.postMessage({ clank: clamp(Math.sqrt(impulse / 100), 0.1, 1) });
  }

  silence() {
    this.setAudible(false);
  }

  reset() {
    this.previous = { throttle: 0, gear: 1, boost: 0 };
    this.node?.port.postMessage({ reset: true });
    this.clearOpponents();
  }

  update(state: VehicleSoundState) {
    this.setAudible(true);
    this.node?.port.postMessage(soundMessage(state, this.previous));
  }

  clearOpponents() {
    for (const voice of this.opponents.splice(0)) {
      voice.node.port.postMessage({ dispose: true });
      voice.node.port.close();
      voice.node.disconnect();
      voice.filters.forEach((node) => node.disconnect());
      voice.gains.forEach((node) => node.disconnect());
      voice.panner.disconnect();
      voice.gain.disconnect();
    }
  }

  updateOpponents(states: readonly OpponentSoundState[]) {
    const context = this.context;
    if (!context || !this.node || !this.master || this.failed) return;
    if (states.length !== this.opponents.length) {
      this.clearOpponents();
      for (let i = 0; i < states.length; i++) {
        const gain = context.createGain();
        gain.gain.value = 0;
        const panner = context.createStereoPanner();
        panner.connect(gain).connect(this.master);
        this.opponents.push({
          ...this.createSource(context, panner),
          gain,
          panner,
          previous: { throttle: 0, gear: 1, boost: 0 },
        });
      }
    }
    this.opponents.forEach((voice, index) => {
      const state = states[index];
      const volume = state.distance >= 100 ? 0 : 0.65 / (1 + (state.distance / 12) ** 2);
      voice.gain.gain.setTargetAtTime(volume, context.currentTime, 0.04);
      voice.panner.pan.setTargetAtTime(clamp(state.pan, -1, 1), context.currentTime, 0.04);
      voice.node.port.postMessage(soundMessage(state, voice.previous));
    });
  }
}
