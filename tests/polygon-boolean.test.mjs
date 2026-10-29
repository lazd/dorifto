import assert from 'node:assert/strict';
import { test } from 'node:test';
import { difference, union, roundConcaveCorners } from '../src/polygon-boolean.ts';

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

test('junction fillets add tangent circular corners without trimming pavement or rounding road ends', () => {
  const pavement = union([
    ribbon(
      [
        [-20, 0],
        [20, 0],
      ],
      4,
    ),
    ribbon(
      [
        [0, 0],
        [0, 20],
      ],
      2,
    ),
  ]);
  const rounded = roundConcaveCorners(pavement, ([x, z]) =>
    Math.abs(x) < 5 && Math.abs(z) < 7 ? 2 : 0,
  );
  assert.equal(area(difference(pavement, rounded)), 0, 'existing lanes remain paved');
  assert.ok(Math.abs(area(rounded) - area(pavement) - 2 * (4 - Math.PI)) < 0.06);
  for (const [x, z] of rounded[0][0]) {
    if (Math.abs(x) > 2.01 && Math.abs(x) < 3.99 && z > 4.01 && z < 5.99)
      assert.ok(
        Math.abs(Math.hypot(Math.abs(x) - 4, z - 6) - 2) < 0.002,
        'corner samples follow the requested circular radius',
      );
  }
});
