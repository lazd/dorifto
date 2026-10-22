import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { createServer } from 'vite';

const source = await readFile(new URL('../src/engine-worklet.js', import.meta.url), 'utf8');

function createProcessor(sampleRate = 48000, workletSource = source) {
  let Processor;
  vm.runInNewContext(workletSource, {
    sampleRate,
    AudioWorkletProcessor: class {
      port = {};
    },
    registerProcessor(name, constructor) {
      assert.equal(name, 'vehicle-sound');
      Processor = constructor;
    },
  });
  return new Processor({ processorOptions: { idleRpm: 750 } });
}

function trigger(processor, boost) {
  processor.port.onmessage({ data: {
    rpm: 750, load: 0, boost: 0, cut: 0, limiter: 0, blow: boost,
    tires: Array.from({ length: 4 }, () => ({ level: 0, speed: 0, load: 0 })),
  } });
}

function render(processor, seconds, sampleRate = 48000, channel = 1) {
  const samples = [];
  for (let i = 0; i < Math.ceil(seconds * sampleRate / 128); i++) {
    const outputs = [1, 1, 2, 1].map((channels) =>
      Array.from({ length: channels }, () => new Float32Array(128)));
    assert.equal(processor.process([], outputs), true);
    for (const channels of outputs) {
      for (const channel of channels) assert.ok(channel.every(Number.isFinite));
    }
    samples.push(...outputs[channel][0]);
  }
  return samples;
}

function energy(samples) {
  return samples.reduce((sum, value) => sum + value * value, 0) / samples.length;
}

test('metal crashes scale with impulse, decay quickly, and clear on reset at supported sample rates', () => {
  for (const rate of [44100, 48000, 96000]) {
    const soft = createProcessor(rate);
    const hard = createProcessor(rate);
    soft.port.onmessage({ data: { clank: 0.2 } });
    hard.port.onmessage({ data: { clank: 1 } });
    const quiet = render(soft, 0.08, rate, 3);
    const loud = render(hard, 0.08, rate, 3);
    assert.ok(energy(loud) > energy(quiet) * 20);
    const tail = render(hard, 0.15, rate, 3);
    assert.ok(energy(tail) > 0.00001, 'short crunch tail follows the strike');
    assert.ok(energy(tail) < energy(loud) * 0.05, 'no sustained bell-like ring');
    render(hard, 0.6, rate, 3);
    assert.ok(energy(render(hard, 0.05, rate, 3)) < 1e-8);
    hard.port.onmessage({ data: { clank: 1 } });
    hard.port.onmessage({ data: { reset: true } });
    assert.equal(energy(render(hard, 0.05, rate, 3)), 0);
  }
});

test('sign crash is dominated by noise rather than ringing tones', () => {
  const withoutModes = source.replace(
    'ring += Math.sin(mode.phase * Math.PI * 2) * mode.amplitude * 0.065;',
    'ring += 0;',
  );
  assert.notEqual(withoutModes, source);
  const full = createProcessor();
  const noiseOnly = createProcessor(48000, withoutModes);
  full.port.onmessage({ data: { clank: 1 } });
  noiseOnly.port.onmessage({ data: { clank: 1 } });
  const crash = render(full, 0.15, 48000, 3);
  const noise = render(noiseOnly, 0.15, 48000, 3);
  const tones = crash.map((value, index) => value - noise[index]);
  assert.ok(energy(noise) > energy(tones) * 3, 'crunch outweighs resonant modes');
});

test('sign crash gain is reduced without changing other channels', () => {
  const unitySource = source.replace(
    '+ (crunch + noise * 0.25) * this.crash) * 0.75;',
    '+ (crunch + noise * 0.25) * this.crash);',
  );
  assert.notEqual(unitySource, source);
  const quiet = createProcessor();
  const unity = createProcessor(48000, unitySource);
  quiet.port.onmessage({ data: { clank: 1 } });
  unity.port.onmessage({ data: { clank: 1 } });
  const ratio = energy(render(quiet, 0.15, 48000, 3))
    / energy(render(unity, 0.15, 48000, 3));
  assert.ok(Math.abs(ratio - 0.75 ** 2) < 0.00001);
});

test('sign crash has a stronger initial punch without increasing its tail', () => {
  const withoutPunch = source.replace(
    'const punch = Math.sin(this.crashPunchPhase * Math.PI * 2) * this.crashPunch * 1.6;',
    'const punch = 0;',
  );
  assert.notEqual(withoutPunch, source);
  const full = createProcessor();
  const light = createProcessor(48000, withoutPunch);
  full.port.onmessage({ data: { clank: 1 } });
  light.port.onmessage({ data: { clank: 1 } });
  const hit = render(full, 0.25, 48000, 3);
  const baseline = render(light, 0.25, 48000, 3);
  assert.ok(energy(hit.slice(0, 960)) > energy(baseline.slice(0, 960)) * 2,
    'first 20 ms has a weighty impact');
  const difference = hit.map((value, index) => value - baseline[index]);
  assert.ok(energy(difference.slice(7200)) < 1e-7, 'punch is gone after 150 ms');
});

test('blow-off intensity and duration increase with released boost', () => {
  const levels = [0.15, 0.5, 1].map((boost) => {
    const processor = createProcessor();
    trigger(processor, boost);
    const samples = render(processor, 0.4);
    return { energy: energy(samples), remaining: processor.blow };
  });
  assert.ok(levels[1].energy > levels[0].energy * 4);
  assert.ok(levels[2].energy > levels[1].energy * 2);
  assert.ok(levels[2].remaining > levels[1].remaining);
  assert.ok(levels[1].remaining > levels[0].remaining);
});

test('blow-off adds a high-pitched tone without changing other sound channels', () => {
  const active = createProcessor();
  const quiet = createProcessor();
  trigger(active, 1);
  trigger(quiet, 0);
  const outputs = () => [1, 1, 2, 1].map((channels) =>
    Array.from({ length: channels }, () => new Float32Array(128)));
  const a = outputs();
  const b = outputs();
  active.process([], a);
  quiet.process([], b);
  for (const channel of [0, 2, 3]) assert.deepEqual(a[channel], b[channel]);
  assert.ok(energy(a[1][0]) > energy(b[1][0]));

  const withoutTone = source.replace(
    'Math.sin(this.blowPhase * Math.PI * 2) * 0.1',
    'Math.sin(this.blowPhase * Math.PI * 2) * 0',
  );
  assert.notEqual(withoutTone, source);
  const tonal = createProcessor();
  const hiss = createProcessor(48000, withoutTone);
  trigger(tonal, 1);
  trigger(hiss, 1);
  const full = render(tonal, 0.02);
  const noise = render(hiss, 0.02);
  const tone = full.map((value, i) => value - noise[i]);
  let crossings = 0;
  for (let i = 1; i < tone.length; i++) {
    if (tone[i - 1] <= 0 && tone[i] > 0) crossings++;
  }
  const frequency = crossings * 48000 / tone.length;
  assert.ok(frequency > 4500 && frequency < 5100, `${frequency} Hz release squeal`);
  assert.ok(energy(tone) > 0.003);
});

test('audio uses pre-release boost for lift-off and gear changes, and clears it on reset', async () => {
  const server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  try {
    const { VehicleAudio } = await server.ssrLoadModule('/src/audio.ts');
    const messages = [];
    const audio = Object.create(VehicleAudio.prototype);
    audio.node = { port: { postMessage: (message) => messages.push(message) } };
    audio.hitTurnSign(0.9);
    assert.equal(messages.length, 0);
    audio.hitTurnSign(25);
    assert.deepEqual(messages.at(-1), { clank: 0.5 });
    audio.hitTurnSign(1000);
    assert.deepEqual(messages.at(-1), { clank: 1 });
    audio.reset();
    const update = (throttle, boost, gear = 1) => {
      audio.update({
        drivetrain: { rpm: 4500, load: throttle, throttle, boost, gear, shifting: false, limiterCut: false },
        tires: Array.from({ length: 4 }, () => ({ slip: 0, speed: 0, load: 0 })),
      });
      return messages.at(-1).blow;
    };
    assert.equal(update(1, 0.9), 0);
    assert.equal(update(0, 0.6), 0.9);
    assert.equal(update(0, 0.4), 0);
    update(1, 0.8);
    assert.equal(update(1, 0.5, 2), 0.8);
    audio.reset();
    assert.equal(update(0, 0, 2), 0);
    update(1, 0.1, 2);
    assert.equal(update(0, 0.05, 2), 0);
  } finally {
    await server.close();
  }
});

test('blow-off decays and clears on reset at supported sample rates', () => {
  for (const sampleRate of [44100, 48000, 96000]) {
    const processor = createProcessor(sampleRate);
    trigger(processor, 1);
    render(processor, 2, sampleRate);
    assert.ok(processor.blow < 0.0002);
    trigger(processor, 1);
    processor.port.onmessage({ data: { reset: true } });
    assert.equal(processor.blow, 0);
    assert.equal(processor.blowPhase, 0);
    assert.equal(energy(render(processor, 0.05, sampleRate)), 0);
  }
});
