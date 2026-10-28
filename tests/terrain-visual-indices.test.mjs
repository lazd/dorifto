import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import * as THREE from 'three';

let server;
let terrainVisualIndices;
let projectTerrainGeometry;
let terrainGeometryTriangles;
before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  ({ terrainVisualIndices } = await server.ssrLoadModule('/src/terrain-visual-indices.ts'));
  ({ projectTerrainGeometry, terrainGeometryTriangles } =
    await server.ssrLoadModule('/src/terrain.ts'));
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

test('scenery corridors retain detailed verges and banks without refining distant terrain', () => {
  const columns = 257,
    rows = 257,
    spacing = 1.5;
  const distances = new Float32Array(columns * rows).fill(44);
  const detailed = new Set();
  const line = {
    points: [
      [60, 30],
      [60, 350],
    ],
    width: 8,
  };
  const indices = terrainVisualIndices(
    columns,
    rows,
    distances,
    spacing,
    (x, z) => {
      detailed.add(`${x},${z}`);
      const a = z * columns + x;
      return [a, a + columns, a + 1, a + 1, a + columns, a + columns + 1];
    },
    { minX: 0, minZ: 0, lines: [line] },
  );
  for (const x of [34, 40, 46])
    assert.ok(detailed.has(`${x},100`), 'surface and both 9 m verges retain native terrain detail');
  assert.ok(!detailed.has('180,100'), 'unrelated landscape stays simplified');
  assert.ok(
    indices.length < (columns - 1) * (rows - 1) * 6 * 0.3,
    'local detail does not restore the full grid',
  );
  assert.ok(
    distances.every((d) => d === 44),
    'scenery never modifies the driving-road distance field',
  );
});

test('ground overlays follow coarse rendered triangles, including interiors and horizontal shorelines', () => {
  const terrain = {
    columns: 5,
    rows: 5,
    spacing: 1,
    minX: 0,
    minZ: 0,
    minHeight: -2,
    maxHeight: 4,
    heights: new Float32Array(25).fill(-2),
  };
  for (const i of [0, 4, 20, 24]) terrain.heights[i] = 0;
  terrain.heights[12] = 4;
  const ground = new THREE.BufferGeometry();
  ground.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      Array.from(terrain.heights).flatMap((y, i) => [i % 5, y, Math.floor(i / 5)]),
      3,
    ),
  );
  ground.setIndex([12, 4, 0, 12, 24, 4, 12, 20, 24, 12, 0, 20]);
  const mesh = new THREE.Mesh(ground, new THREE.MeshBasicMaterial());
  mesh.updateMatrixWorld(true);
  const source = new THREE.BufferGeometry();
  source.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [0.2, 2, 0.2, 0.2, 2, 3.8, 3.8, 2, 0.2, 3.8, 2, 0.2, 0.2, 2, 3.8, 3.8, 2, 3.8],
      3,
    ),
  );
  const triangles = terrainGeometryTriangles(terrain, ground);
  const ray = new THREE.Raycaster();
  try {
    for (const horizontal of [false, true]) {
      const projected = projectTerrainGeometry(terrain, source, 0.035, triangles, horizontal);
      try {
        const positions = projected.getAttribute('position');
        assert.ok(positions.count > 0);
        assert.ok(positions.array.every(Number.isFinite));
        for (let i = 0; i < positions.count; i += 3) {
          const vertices = [0, 1, 2].map((j) =>
            new THREE.Vector3().fromBufferAttribute(positions, i + j),
          );
          const center = vertices
            .reduce((sum, p) => sum.add(p), new THREE.Vector3())
            .divideScalar(3);
          for (const p of [...vertices, center]) {
            ray.set(new THREE.Vector3(p.x, 10, p.z), new THREE.Vector3(0, -1, 0));
            const hit = ray.intersectObject(mesh)[0];
            assert.ok(hit, 'overlay stays within the rendered ground');
            const clearance = p.y - hit.point.y;
            if (horizontal) {
              assert.equal(p.y, 2, 'water retains its horizontal level');
              assert.ok(clearance >= 0.025 - 1e-5 && clearance <= 0.65 + 1e-5);
            } else {
              assert.ok(
                Math.abs(clearance - 0.035) < 1e-5,
                'terrain cannot pierce an overlay at triangle interiors',
              );
            }
          }
        }
      } finally {
        projected.dispose();
      }
    }
  } finally {
    source.dispose();
    ground.dispose();
    mesh.material.dispose();
  }
});
