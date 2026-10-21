class VehicleSoundProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.target = { rpm: 850, load: 0, boost: 0, cut: 0, limiter: 0 };
    this.state = { ...this.target };
    this.phase = 0;
    this.crankPhase = 0;
    this.exhaustBody = 0;
    this.whistlePhase = 0;
    this.turboX1 = this.turboX2 = this.turboY1 = this.turboY2 = 0;
    this.pulse = 0;
    this.exhaust = 0;
    this.noiseLow = 0;
    this.tireLow = 0;
    this.tires = Array.from({ length: 4 }, (_, i) => ({
      target: { level: 0, speed: 0, load: 0 },
      level: 0, speed: 0, load: 0, phase: i * 0.23, pulse: 0,
      random: 918273 + i * 135791, drift: 0, roughness: 0,
      squealPhase: i * 0.17, overtonePhase: i * 0.31,
      modes: [620, 1130, 1930].map((frequency, mode) => ({
        frequency: frequency * [0.92, 1.07, 0.85, 1.16][i],
        q: [7, 10, 6][mode], b: 0, a1: 0, a2: 0,
        x1: 0, x2: 0, y1: 0, y2: 0,
      })),
    }));
    this.blow = 0;
    this.random = 123456789;
    this.impact = 0;
    this.impactPhase = 0;
    this.parameters = ['rpm', 'load', 'boost', 'cut', 'limiter'];
    this.smoothing = 1 - Math.exp(-1 / (sampleRate * 0.025));
    this.limiterSmoothing = 1 - Math.exp(-1 / (sampleRate * 0.003));
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
        this.target = { rpm: 850, load: 0, boost: 0, cut: 0, limiter: 0 };
        this.state = { ...this.target };
        this.turboX1 = this.turboX2 = this.turboY1 = this.turboY2 = 0;
        for (const tire of this.tires) {
          tire.target = { level: 0, speed: 0, load: 0 };
          tire.level = tire.pulse = 0;
          for (const mode of tire.modes) mode.x1 = mode.x2 = mode.y1 = mode.y2 = 0;
        }
      } else if (data.impact !== undefined) {
        this.impact = Math.max(this.impact, data.impact);
        this.impactPhase = 0;
      } else {
        this.target = data;
        for (let i = 0; i < 4; i++) this.tires[i].target = data.tires[i];
        this.blow = Math.max(this.blow, data.blow || 0);
      }
    };
  }

  process(inputs, outputs) {
    const engine = outputs[0][0];
    const turbo = outputs[1][0];
    const tires = outputs[2][0];
    const tiresRight = outputs[2][1];
    const impacts = outputs[3][0];
    const state = this.state;
    const smoothing = this.smoothing;
    const whistleFrequency = 3200 + state.boost * 1400;
    const turboOmega = 2 * Math.PI * whistleFrequency / sampleRate;
    const turboAlpha = Math.sin(turboOmega) / 14;
    const turboB = turboAlpha / (1 + turboAlpha);
    const turboA1 = -2 * Math.cos(turboOmega) / (1 + turboAlpha);
    const turboA2 = (1 - turboAlpha) / (1 + turboAlpha);
    for (const tire of this.tires) {
      tire.speed += (tire.target.speed - tire.speed) * 0.1;
      tire.load += (tire.target.load - tire.load) * 0.04;
      // Broad, non-harmonic structural modes, with different tuning per wheel.
      const tuning = 1 + Math.min(tire.speed, 25) * 0.004
        - (tire.load - 1) * 0.025 + tire.drift * 0.07;
      for (const mode of tire.modes) {
        const omega = 2 * Math.PI * mode.frequency * tuning / sampleRate;
        const alpha = Math.sin(omega) / (2 * mode.q);
        mode.b = alpha / (1 + alpha);
        mode.a1 = -2 * Math.cos(omega) / (1 + alpha);
        mode.a2 = (1 - alpha) / (1 + alpha);
      }
    }
    for (let i = 0; i < engine.length; i++) {
      for (const key of this.parameters) {
        state[key] += (this.target[key] - state[key]) * (key === 'limiter' ? this.limiterSmoothing : smoothing);
      }
      this.random ^= this.random << 13;
      this.random ^= this.random >>> 17;
      this.random ^= this.random << 5;
      const noise = (this.random >>> 0) / 2147483648 - 1;
      this.noiseLow += (noise - this.noiseLow) * 0.04;
      // A four-stroke V6 fires three times per revolution. Each firing excites
      // an exhaust pulse; alternating amplitudes keep it from sounding like a pure tone.
      const limiterCut = state.limiter;
      const audibleRpm = state.rpm;
      this.phase += audibleRpm / 60 * 3 / sampleRate;
      this.crankPhase = (this.crankPhase + audibleRpm / 120 / sampleRate) % 1;
      if (this.phase >= 1) {
        this.phase -= 1;
        this.pulse = 0.8 + noise * 0.2;
      }
      this.pulse *= this.pulseDecay;
      const cycle = this.phase * Math.PI * 2;
      const crank = this.crankPhase * Math.PI * 2;
      const bankPulse = Math.sin(crank * 3 + Math.sin(crank) * 0.15);
      const firing = (this.pulse - 0.15) * 0.6 + Math.sin(cycle) * 0.2
        + Math.sin(crank) * 0.48 + Math.sin(crank * 2) * 0.28
        + Math.sin(crank * 3) * 0.18;
      const combustion = firing * (0.24 + state.load * 0.55)
        + this.noiseLow * state.load * 0.45 + bankPulse * state.load * 0.08;
      this.exhaust += (combustion - this.exhaust)
        * Math.min(0.65, (380 + state.rpm * 0.08) / sampleRate * 6.28);
      this.exhaustBody += (this.exhaust - this.exhaustBody) * (220 / sampleRate * 6.28);
      engine[i] = (Math.tanh(this.exhaust * (2 + state.load)) * 0.65 + this.exhaustBody * 0.55)
        * (1 - state.cut * 0.75) * (1 - limiterCut * 0.88);

      const whistleNoise = turboB * (noise - this.turboX2)
        - turboA1 * this.turboY1 - turboA2 * this.turboY2;
      this.turboX2 = this.turboX1;
      this.turboX1 = noise;
      this.turboY2 = this.turboY1;
      this.turboY1 = whistleNoise;
      this.whistlePhase = (this.whistlePhase
        + whistleFrequency * (1 + this.noiseLow * 0.006) / sampleRate) % 1;
      this.blow *= this.blowDecay;
      turbo[i] = noise * (state.boost * 0.025 + this.blow * 0.65)
        + (whistleNoise * 0.65
          + Math.sin(this.whistlePhase * Math.PI * 2) * 0.025) * state.boost;

      this.tireLow += (noise - this.tireLow) * 0.18;
      let left = 0;
      let right = 0;
      for (let wheel = 0; wheel < 4; wheel++) {
        const tire = this.tires[wheel];
        tire.level += (tire.target.level - tire.level)
          * (tire.target.level > tire.level ? this.squealAttack : this.squealRelease);
        tire.random ^= tire.random << 13;
        tire.random ^= tire.random >>> 17;
        tire.random ^= tire.random << 5;
        const frictionNoise = (tire.random >>> 0) / 2147483648 - 1;
        tire.drift += (frictionNoise - tire.drift) * (50 / sampleRate);
        tire.roughness += (frictionNoise - tire.roughness) * 0.12;
        tire.phase += (180 + tire.speed * 38) * (1 + frictionNoise * 0.65) / sampleRate;
        if (tire.phase >= 1) {
          tire.phase -= 1;
          tire.pulse = 0.4 + Math.abs(frictionNoise) * 0.6;
        }
        tire.pulse *= 0.86;
        const excitation = frictionNoise * 0.65 + (tire.pulse - 0.08) * 0.9;
        let resonances = 0;
        for (const mode of tire.modes) {
          const value = mode.b * (excitation - mode.x2) - mode.a1 * mode.y1 - mode.a2 * mode.y2;
          mode.x2 = mode.x1;
          mode.x1 = excitation;
          mode.y2 = mode.y1;
          mode.y1 = value;
          resonances += value;
        }
        const scrub = tire.roughness * 0.12;
        const squealPitch = tire.modes[1].frequency
          * (1 + Math.min(tire.speed, 25) * 0.004 - (tire.load - 1) * 0.025)
          * (1 + tire.drift * 1.5);
        tire.squealPhase = (tire.squealPhase + squealPitch / sampleRate) % 1;
        tire.overtonePhase = (tire.overtonePhase + squealPitch * 1.63 / sampleRate) % 1;
        const tonalAmount = Math.max(0, Math.min(1, (tire.level - 0.12) / 0.55));
        const squealTone = (Math.sin(tire.squealPhase * Math.PI * 2) * 0.2
          + Math.sin(tire.overtonePhase * Math.PI * 2) * 0.09)
          * tonalAmount * (0.85 + tire.roughness * 0.3);
        const voice = Math.tanh(resonances * 2.5 + scrub + squealTone) * tire.level
          * Math.min(1.25, Math.sqrt(Math.max(0, tire.load))) * 0.35;
        left += voice * (wheel % 2 === 0 ? 0.9 : 0.4);
        right += voice * (wheel % 2 === 0 ? 0.4 : 0.9);
      }
      tires[i] = left;
      tiresRight[i] = right;
      this.impact *= this.impactDecay;
      this.impactPhase = (this.impactPhase + (85 + this.impact * 45) / sampleRate) % 1;
      impacts[i] = (Math.sin(this.impactPhase * Math.PI * 2) * 0.7
        + this.tireLow * 0.6) * this.impact;
    }
    return true;
  }
}

registerProcessor('vehicle-sound', VehicleSoundProcessor);
