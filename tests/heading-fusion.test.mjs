import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fuseHeading } from '../scripts/heading-fusion.mjs';

const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const times = Array.from({ length: 401 }, (_, i) => i * 0.1);
const truth = times.map((time) => 3 + 0.025 * time);
const rates = times.map(() => 0.028);
const fixes = times.flatMap((time, i) =>
  i % 10 ? [] : [{ time, speed: 20, heading: wrap(truth[i]), headingAccuracy: Math.PI / 180 }],
);
const compass = truth.map((angle, i) => wrap(angle - 0.7 + 0.01 * Math.sin(i)));

test('fuses gyro/GPS/compass across north, corrects drift, and rejects compass spikes', () => {
  const clean = fuseHeading(times, rates, compass, fixes);
  assert.ok(clean.every((heading, i) => Math.abs(wrap(heading - truth[i])) < 0.03));
  const corrupted = compass.map((angle, i) => (i > 200 && i < 250 ? wrap(angle + 1.5) : angle));
  const headings = fuseHeading(times, rates, corrupted, fixes);
  const errors = headings.map((heading, i) => wrap(heading - truth[i]));
  const rms = Math.sqrt(errors.reduce((sum, error) => sum + error ** 2, 0) / errors.length);
  assert.ok(rms < 0.02, `RMS heading error ${rms} radians`);
  assert.ok(headings.at(-1) > Math.PI, 'heading remains unwrapped');
  for (let i = 1; i < headings.length; i++)
    assert.ok(Math.abs(headings[i] - headings[i - 1]) < 0.01, 'no abrupt GPS/compass snap');
});

test('unreliable compass calibration is ignored; gyro/GPS still supplies heading', () => {
  const absent = fuseHeading(
    times,
    rates,
    times.map(() => null),
    fixes,
  );
  const unreliable = fuseHeading(
    times,
    rates,
    compass.map((angle, i) => wrap(angle + (i % 20 < 10 ? -0.8 : 0.8))),
    fixes,
  );
  assert.deepEqual(unreliable, absent);
  assert.ok(Math.abs(wrap(absent.at(-1) - truth.at(-1))) < 0.03);
});

test('GPS constrains temporary gyro errors instead of exaggerating vehicle turns', () => {
  const biased = rates.map((rate, i) => rate + (i >= 100 && i < 150 ? 0.15 : 0));
  const headings = fuseHeading(
    times,
    biased,
    times.map(() => null),
    fixes,
  );
  const errors = headings.map((heading, i) => Math.abs(wrap(heading - truth[i])));
  assert.ok(Math.max(...errors) < (3 * Math.PI) / 180, 'gyro error stays below three degrees');
  assert.ok(errors[170] < Math.PI / 180, 'heading recovers after the gyro error');
});
