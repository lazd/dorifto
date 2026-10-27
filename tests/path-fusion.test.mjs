import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fuseRoadOffsets } from '../scripts/path-fusion.mjs';

test('fuses GPS and heading into a smooth lateral line, with outliers and reverse travel', () => {
  const times = Array.from({ length: 301 }, (_, i) => i * 0.1);
  const width = 8;
  for (const reverse of [false, true]) {
    const sign = reverse ? -1 : 1;
    const truth = times.map((time) => sign * (-2 + Math.sin(time / 4)));
    const speeds = times.map(() => 20);
    const headings = times.map(
      (time) => (reverse ? Math.PI : 0) + Math.asin(Math.cos(time / 4) / 80),
    );
    const fixes = times.flatMap((time, i) =>
      i % 10
        ? []
        : [
            {
              time,
              offset: i === 150 ? 80 : truth[i] + 0.1 * Math.sin(i),
              accuracy: 0.2,
            },
          ],
    );
    const fused = fuseRoadOffsets(
      times,
      speeds,
      headings,
      times.map(() => 0),
      fixes,
      width,
      reverse,
    );
    const rms = Math.sqrt(
      fused.reduce((sum, offset, i) => sum + (offset - truth[i]) ** 2, 0) / fused.length,
    );
    assert.ok(rms < 0.5, `lateral RMS error ${rms} m`);
    assert.ok(Math.max(...fused) - Math.min(...fused) > 1.5, 'preserves the cornering line');
    assert.ok(
      fused.every((value) => Math.abs(value) <= width / 2 - 1),
      'stays on pavement',
    );
    assert.ok(
      fused.slice(1).every((value, i) => Math.abs(value - fused[i]) < 0.1),
      'no GPS jumps',
    );
  }
});

test('uncertain GPS and sustained heading bias do not invent oncoming-lane driving', () => {
  const times = Array.from({ length: 601 }, (_, i) => i * 0.1);
  for (const reverse of [false, true]) {
    const sign = reverse ? -1 : 1;
    const fixes = times.flatMap((time, i) =>
      i % 10 ? [] : [{ time, offset: sign * 2, accuracy: 10 }],
    );
    const offsets = fuseRoadOffsets(
      times,
      times.map(() => 25),
      times.map(() => (reverse ? Math.PI : 0) + 0.04),
      times.map(() => 0),
      fixes,
      8,
      reverse,
    );
    assert.ok(
      offsets.every((offset) => sign * offset < 0),
      'stays on driving side',
    );
    assert.ok(
      offsets.some((offset) => Math.abs(offset - sign * -2) > 0.1),
      'not a fixed rail',
    );
  }
});

test('consecutive accurate GPS supports crossings, but a single precise outlier does not', () => {
  const times = Array.from({ length: 401 }, (_, i) => i * 0.1);
  for (const reverse of [false, true]) {
    const sign = reverse ? -1 : 1;
    const run = (sustained) => {
      const fixes = times.flatMap((time, i) =>
        i % 10
          ? []
          : [
              {
                time,
                offset: sign * ((sustained ? time >= 10 && time <= 25 : time === 15) ? 2 : -2),
                accuracy: 0.25,
              },
            ],
      );
      return fuseRoadOffsets(
        times,
        times.map(() => 20),
        times.map(() => (reverse ? Math.PI : 0)),
        times.map(() => 0),
        fixes,
        8,
        reverse,
      );
    };
    const supported = run(true);
    assert.ok(sign * supported[200] > 1, 'allows a corroborated crossing');
    assert.ok(sign * supported[350] < -1, 'returns to lane after crossing');
    assert.ok(
      run(false).every((offset) => sign * offset < 0),
      'rejects isolated crossing fix',
    );
  }
});
