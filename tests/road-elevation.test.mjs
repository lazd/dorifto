import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanRoadElevation } from '../src/road-elevation.mjs';

test('removes a short high obstacle without flattening a sustained hill', () => {
  const heights = Array.from({ length: 121 }, (_, i) => 100 - i * 0.2);
  const noisy = heights.map((h, i) => h + Math.max(0, 60 * (1 - Math.abs(i - 50) / 15)));
  assert.deepEqual(cleanRoadElevation(noisy, 5), heights);
  const hill = heights.map((h, i) => h + 12 * Math.sin((i / 120) * Math.PI));
  assert.deepEqual(cleanRoadElevation(hill, 5), hill);
  assert.deepEqual(cleanRoadElevation(heights, 5), heights);
});
