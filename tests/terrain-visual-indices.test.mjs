import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let terrainVisualIndices;
before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  ({ terrainVisualIndices } = await server.ssrLoadModule('/src/terrain-visual-indices.ts'));
});
after(async () => server?.close());

test('extreme-distance terrain uses larger patches despite capped road-query distances', () => {
  const columns = 257;
  const rows = 257;
  const distances = new Float32Array(columns * rows).fill(44);
  const indices = terrainVisualIndices(columns, rows, distances, 1.5, () => {
    assert.fail('Distant patches should not need detailed cells');
  });
  assert.equal(indices.length / 3, 4 * 128 * 4);
});

test('terrain coarsening preserves road cells and forms a watertight upward-facing mesh', () => {
  const columns = 70;
  const rows = 67;
  const distances = new Float32Array(columns * rows).fill(500);
  const detailed = new Set();
  distances[20 * columns + 20] = 0;
  const indices = terrainVisualIndices(columns, rows, distances, 1.5, (x, z) => {
    const a = z * columns + x;
    const triangles = [a, a + columns, a + 1, a + 1, a + columns, a + columns + 1];
    if (x === 20 && z === 20) detailed.add(a);
    return triangles;
  });
  assert.ok(detailed.has(20 * columns + 20));
  assert.ok(indices.length < (columns - 1) * (rows - 1) * 6 * 0.5);
  const edges = new Map();
  let area = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const triangle = Array.from(indices.subarray(i, i + 3));
    const [a, b, c] = triangle.map((index) => {
      assert.ok(index < columns * rows);
      return [index % columns, Math.floor(index / columns)];
    });
    const winding = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]);
    assert.ok(winding > 0);
    area += winding / 2;
    for (let e = 0; e < 3; e++) {
      const edge = [triangle[e], triangle[(e + 1) % 3]].sort((a, b) => a - b).join(',');
      edges.set(edge, (edges.get(edge) ?? 0) + 1);
    }
  }
  assert.equal(area, (columns - 1) * (rows - 1));
  for (const [edge, count] of edges) {
    const [a, b] = edge.split(',').map(Number);
    const boundary =
      (a % columns === 0 && b % columns === 0) ||
      (a % columns === columns - 1 && b % columns === columns - 1) ||
      (a < columns && b < columns) ||
      (a >= (rows - 1) * columns && b >= (rows - 1) * columns);
    assert.equal(count, boundary ? 1 : 2, `edge ${edge}`);
  }
});
