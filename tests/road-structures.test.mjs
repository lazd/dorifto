import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchRoadStructures, repairStructureElevation } from '../src/road-structures.mjs';

const metersPerDegree = (6371008.8 * Math.PI) / 180;
const coordinate = (x, y = 0) => [x / metersPerDegree, y / metersPerDegree];
const point = (x, y = 0) => {
  const [lon, lat] = coordinate(x, y);
  return { lon, lat };
};

test('matches clipped, duplicated and reversed structure tiles but not nearby or crossing roads', () => {
  const route = [point(0), point(100), point(200), point(300)];
  const bridge = { type: 'bridge', coordinates: [coordinate(60), coordinate(130)] };
  const lines = [
    bridge,
    bridge,
    { type: 'bridge', coordinates: [coordinate(170), coordinate(130)] },
    { type: 'tunnel', coordinates: [coordinate(200, -50), coordinate(200, 50)] },
    { type: 'tunnel', coordinates: [coordinate(200, 12), coordinate(250, 12)] },
  ];
  const spans = matchRoadStructures(route, lines);
  assert.equal(spans.length, 1);
  assert.equal(spans[0].type, 'bridge');
  assert.ok(Math.abs(spans[0].start - 60 / 300) < 1e-10);
  assert.ok(Math.abs(spans[0].end - 170 / 300) < 1e-10);
  const reversed = matchRoadStructures(route.toReversed(), lines);
  assert.ok(Math.abs(reversed[0].start - (1 - spans[0].end)) < 1e-10);
  assert.ok(Math.abs(reversed[0].end - (1 - spans[0].start)) < 1e-10);
});

test('repairs tagged bridge dips and tunnel peaks without changing untagged terrain', () => {
  const baseline = Array.from({ length: 101 }, (_, i) => 100 + i * 0.25);
  for (const [type, sign] of [
    ['bridge', -1],
    ['tunnel', 1],
  ]) {
    const heights = baseline.map((h, i) => h + sign * Math.max(0, 40 - Math.abs(i - 50) * 4));
    const structures = [{ type, start: 0.4, end: 0.6 }];
    const repaired = repairStructureElevation(heights, 5, structures);
    assert.deepEqual(repaired, baseline);
    assert.deepEqual(repairStructureElevation(heights, 5, []), heights);
    assert.notDeepEqual(heights, baseline, 'Repair does not mutate source heights');
  }
});

test('joins adjacent spans and the closed seam, but leaves unbracketed endpoints unchanged', () => {
  const heights = Array.from({ length: 41 }, () => 100);
  heights.fill(40, 16, 25);
  assert.deepEqual(
    repairStructureElevation(heights, 5, [
      { type: 'bridge', start: 0.4, end: 0.5 },
      { type: 'bridge', start: 0.5, end: 0.6 },
    ]),
    Array(41).fill(100),
  );
  const seam = Array(40).fill(100);
  seam.fill(40, 0, 4);
  seam.fill(40, 36);
  const structures = [
    { type: 'bridge', start: 0, end: 0.1 },
    { type: 'bridge', start: 0.9, end: 1 },
  ];
  assert.deepEqual(repairStructureElevation(seam, 5, structures, true), Array(40).fill(100));
  assert.deepEqual(repairStructureElevation(seam, 5, structures), seam);
  assert.deepEqual(
    repairStructureElevation(seam, 5, [{ type: 'tunnel', start: 0, end: 1 }], true),
    seam,
  );
  assert.throws(() => repairStructureElevation(heights, 0, structures), /spacing/);
});
