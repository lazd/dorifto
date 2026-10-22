import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let Drivetrain;
let idleRpm;

const dt = 1 / 600;
const input = {
  throttle: 0,
  reversing: false,
  wheelSpeed: 0,
  roadWheelSpeed: 0,
  handbrake: true,
  speedLimited: false,
  peakTorque: 400,
  peakPower: 220000,
};

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  ({ Drivetrain, idleRpm } = await server.ssrLoadModule('/src/drivetrain.ts'));
});

after(async () => {
  await server?.close();
});

function revEngine() {
  const drivetrain = new Drivetrain();
  for (let i = 0; i < 6000 && drivetrain.state.rpm < 6000; i++) {
    drivetrain.step(dt, { ...input, throttle: 1 });
  }
  assert.ok(drivetrain.state.rpm >= 6000);
  return drivetrain;
}

test('closed-throttle free revs fall three times as fast across the RPM range', () => {
  for (const rpm of [1500, 3000, 6000]) {
    const drivetrain = new Drivetrain();
    drivetrain.engineSpeed = (rpm * 2 * Math.PI) / 60;
    drivetrain.state.rpm = rpm;
    const previousTorque = -(22 + drivetrain.engineSpeed * 0.055);
    assert.equal(drivetrain.getEngineTorque(input, 0, 0), previousTorque * 3);
  }
});

test('free-rev fall time is one third without changing powered acceleration', () => {
  const faster = revEngine();
  const previous = revEngine();
  const currentTorque = previous.getEngineTorque;
  previous.getEngineTorque = function (...args) {
    const torque = currentTorque.apply(this, args);
    return torque < 0 ? torque / (3 - args[1] * 2) : torque;
  };
  assert.equal(faster.state.rpm, previous.state.rpm);
  const fallTime = (drivetrain) => {
    let steps = 0;
    while (drivetrain.state.rpm > 1500 && steps < 12000) {
      drivetrain.step(dt, input);
      steps++;
    }
    assert.ok(drivetrain.state.rpm <= 1500);
    return steps * dt;
  };
  const ratio = fallTime(faster) / fallTime(previous);
  assert.ok(Math.abs(ratio - 1 / 3) < 0.005, `fall time ratio: ${ratio}`);
});

test('rev release settles at the configured idle without stalling', () => {
  const drivetrain = revEngine();
  for (let i = 0; i < 12000; i++) {
    drivetrain.step(dt, input);
    assert.ok(Number.isFinite(drivetrain.state.rpm));
    assert.ok(drivetrain.state.rpm >= idleRpm - 1);
  }
  assert.ok(Math.abs(drivetrain.state.rpm - idleRpm) < 1);
});

test('positive torque and full-throttle drag retain their existing behavior', () => {
  const drivetrain = new Drivetrain();
  for (const rpm of [idleRpm, 3000, 6000]) {
    drivetrain.engineSpeed = (rpm * 2 * Math.PI) / 60;
    drivetrain.state.rpm = rpm;
    for (const load of [0, 1]) {
      const t = (value, low, high) => {
        const x = Math.max(0, Math.min(1, (value - low) / (high - low)));
        return x * x * (3 - 2 * x);
      };
      const curve = (0.65 + 0.35 * t(rpm, 1000, 4000)) * (1 - 0.18 * t(rpm, 5500, 7500));
      const combustion =
        load * Math.min(input.peakTorque * curve * 0.8, input.peakPower / drivetrain.engineSpeed);
      const drag = (22 + drivetrain.engineSpeed * 0.055) * (1 - load * 0.85);
      assert.equal(drivetrain.getEngineTorque(input, 1, load), combustion - drag);
    }
  }
});
