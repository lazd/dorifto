import assert from 'node:assert/strict';
import { test } from 'node:test';
import { difference, union } from '../src/polygon-boolean.ts';

const area = (polygons) =>
  polygons.reduce(
    (total, rings) =>
      total +
      rings.reduce((sum, ring, index) => {
        let twice = 0;
        for (let i = 1; i < ring.length; i++)
          twice += ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1];
        return sum + (index ? -1 : 1) * Math.abs(twice / 2);
      }, 0),
    0,
  );

function ribbon(points, halfWidth) {
  const left = [],
    right = [];
  points.forEach((point, i) => {
    const a = points[Math.max(0, i - 1)],
      b = points[Math.min(points.length - 1, i + 1)];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const nx = ((b[1] - a[1]) / length) * halfWidth,
      nz = (-(b[0] - a[0]) / length) * halfWidth;
    left.push([point[0] - nx, point[1] - nz]);
    right.push([point[0] + nx, point[1] + nz]);
  });
  return [[...left, ...right.reverse()]];
}

test('road outline unions stay robust for overlapping, duplicated and reversed ribbons', () => {
  let seed = 1;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // These networks made the previous floating-point library fail to close output rings.
  for (let network = 0; network < 40; network++) {
    const junctions = Array.from({ length: 12 }, () => [
      random() * 600 - 300,
      random() * 600 - 300,
    ]);
    const roads = [];
    for (let road = 0; road < 25; road++) {
      const a = junctions[Math.floor(random() * junctions.length)],
        b = junctions[Math.floor(random() * junctions.length)];
      if (a === b) continue;
      const bend = [
        (a[0] + b[0]) / 2 + (random() - 0.5) * 40,
        (a[1] + b[1]) / 2 + (random() - 0.5) * 40,
      ];
      const points = Array.from({ length: 21 }, (_, step) => {
        const s = step / 20,
          u = 1 - s;
        return [0, 1].map((k) => u * u * a[k] + 2 * u * s * bend[k] + s * s * b[k]);
      });
      const halfWidth = 2 + random() * 4;
      roads.push(ribbon(points, halfWidth));
      if (random() < 0.3) roads.push(ribbon(points.toReversed(), halfWidth));
    }
    const pavement = union(roads);
    assert.ok(
      pavement.length && pavement.every((rings) => rings.every((ring) => ring.length >= 4)),
    );
    difference(
      roads.map((road) => ribbon(road[0].slice(0, 21), 1.5)),
      pavement,
    );
  }
});

test('polygon booleans honour holes, overlaps and closed output rings', () => {
  const square = (x, z, size) => [
    [x, z],
    [x + size, z],
    [x + size, z + size],
    [x, z + size],
  ];
  assert.equal(area(union([[square(0, 0, 10)], [square(5, 5, 10)]])), 175);
  const courtyard = [[square(0, 0, 10), square(3, 3, 4)]];
  assert.equal(area(union(courtyard)), 84);
  assert.equal(area(union(courtyard, [[square(3, 3, 4)]])), 100, 'another area fills the hole');
  assert.equal(area(difference([[square(0, 0, 10)]], [[square(5, 0, 10)]])), 50);
  const [[ring]] = union([[square(0, 0, 1)]]);
  assert.deepEqual(ring[0], ring.at(-1));
});
