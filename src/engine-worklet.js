class VehicleSoundProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.target = { rpm: 850, load: 0, boost: 0, squeal: 0, slip: 0, cut: 0 };
    this.state = { ...this.target };
    this.phase = 0;
    this.crankPhase = 0;
    this.whistlePhase = 0;
    this.tirePhase = 0;
    this.pulse = 0;
    this.exhaust = 0;
    this.noiseLow = 0;
    this.tireLow = 0;
    this.tireWaver = 0;
    this.tireFlutterPhase = 0;
    this.blow = 0;
    this.random = 123456789;
    this.impact = 0;
    this.impactPhase = 0;
    this.parameters = ['rpm', 'load', 'boost', 'squeal', 'slip', 'cut'];
    this.smoothing = 1 - Math.exp(-1 / (sampleRate * 0.025));
    this.squealAttack = 1 - Math.exp(-1 / (sampleRate * 0.14));
    this.squealRelease = 1 - Math.exp(-1 / (sampleRate * 0.08));
    this.pulseDecay = Math.exp(-1 / (sampleRate * 0.0035));
    this.blowDecay = Math.exp(-1 / (sampleRate * 0.16));
    this.impactDecay = Math.exp(-1 / (sampleRate * 0.055));
    this.port.onmessage = ({ data }) => {
      if (data.reset) {
        this.blow = 0;
        this.pulse = 0;
        this.impact = 0;
        this.target = { rpm: 850, load: 0, boost: 0, squeal: 0, slip: 0, cut: 0 };
      } else if (data.impact !== undefined) {
        this.impact = Math.max(this.impact, data.impact);
        this.impactPhase = 0;
      } else {
        this.target = data;
        this.blow = Math.max(this.blow, data.blow || 0);
      }
    };
  }

  process(inputs, outputs) {
    const engine = outputs[0][0];
    const turbo = outputs[1][0];
    const tires = outputs[2][0];
    const impacts = outputs[3][0];
    const state = this.state;
    const smoothing = this.smoothing;
    for (let i = 0; i < engine.length; i++) {
      for (const key of this.parameters) {
        const response = key === 'squeal'
          ? this.target[key] > state[key] ? this.squealAttack : this.squealRelease : smoothing;
        state[key] += (this.target[key] - state[key]) * response;
      }
      this.random ^= this.random << 13;
      this.random ^= this.random >>> 17;
      this.random ^= this.random << 5;
      const noise = (this.random >>> 0) / 2147483648 - 1;
      this.noiseLow += (noise - this.noiseLow) * 0.04;
      // A four-stroke V6 fires three times per revolution. Each firing excites
      // an exhaust pulse; alternating amplitudes keep it from sounding like a pure tone.
      this.phase += state.rpm / 60 * 3 / sampleRate;
      this.crankPhase = (this.crankPhase + state.rpm / 60 / sampleRate) % 1;
      if (this.phase >= 1) {
        this.phase -= 1;
        this.pulse = 0.8 + noise * 0.2;
      }
      this.pulse *= this.pulseDecay;
      const cycle = this.phase * Math.PI * 2;
      const firing = this.pulse - 0.15 + Math.sin(cycle) * 0.25
        + Math.sin(cycle * 2) * 0.1 + Math.sin(this.crankPhase * Math.PI * 2) * 0.08;
      const combustion = firing * (0.2 + state.load * 0.65)
        + this.noiseLow * state.load * 0.3;
      this.exhaust += (combustion - this.exhaust)
        * Math.min(0.65, (600 + state.rpm * 0.15) / sampleRate * 6.28);
      engine[i] = Math.tanh(this.exhaust * 2) * (1 - state.cut * 0.75);

      this.whistlePhase = (this.whistlePhase + (1800 + state.boost * 2200) / sampleRate) % 1;
      this.blow *= this.blowDecay;
      turbo[i] = noise * (state.boost * 0.11 + this.blow * 0.65)
        + Math.sin(this.whistlePhase * Math.PI * 2) * state.boost * 0.035;

      this.tireLow += (noise - this.tireLow) * 0.18;
      this.tireWaver += (noise - this.tireWaver) * (35 / sampleRate);
      this.tireFlutterPhase = (this.tireFlutterPhase + (17 + state.slip * 14) / sampleRate) % 1;
      const flutter = Math.sin(this.tireFlutterPhase * Math.PI * 2);
      const pitch = 1050 + state.slip * 480 + this.tireWaver * 1800 + flutter * 18;
      this.tirePhase = (this.tirePhase + pitch / sampleRate) % 1;
      const tireCycle = this.tirePhase * Math.PI * 2;
      // Stick-slip vibration is pitched and unstable, with a little friction noise.
      const squeal = Math.sin(tireCycle) * 0.48 + Math.sin(tireCycle * 2) * 0.18
        + Math.sin(tireCycle * 3) * 0.07;
      tires[i] = (squeal + this.tireLow * 0.09)
        * (0.85 + flutter * 0.15) * state.squeal;
      this.impact *= this.impactDecay;
      this.impactPhase = (this.impactPhase + (85 + this.impact * 45) / sampleRate) % 1;
      impacts[i] = (Math.sin(this.impactPhase * Math.PI * 2) * 0.7
        + this.tireLow * 0.6) * this.impact;
    }
    return true;
  }
}

registerProcessor('vehicle-sound', VehicleSoundProcessor);
