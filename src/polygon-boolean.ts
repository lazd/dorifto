import {
  ClipType,
  EndType,
  FillRule,
  JoinType,
  PolyTreeD,
  booleanOpDWithPolyTree,
  inflatePathsD,
  type PathD,
} from 'clipper2-ts';
import type { SceneryPoint, SceneryPolygon } from './scenery-data';

type MultiPolygon = SceneryPolygon[];

// Millimetre integer coordinates keep Clipper's boolean operations exact and robust.
const precision = 3;

function signedArea(ring: readonly SceneryPoint[]) {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
    area += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  return area / 2;
}

/** Outer rings wind positively and holes negatively, so overlapping inputs combine under NonZero. */
function paths(polygons: readonly SceneryPolygon[]): PathD[] {
  return polygons.flatMap((rings) =>
    rings.map((ring, index) => {
      const path = ring.map(([x, y]) => ({ x, y }));
      return signedArea(ring) > 0 === (index === 0) ? path : path.reverse();
    }),
  );
}

function multiPolygon(tree: PolyTreeD): MultiPolygon {
  const result: MultiPolygon = [];
  const ring = (path: PathD): SceneryPoint[] => [
    ...path.map(({ x, y }): SceneryPoint => [x, y]),
    [path[0].x, path[0].y],
  ];
  const visit = (outer: PolyTreeD | ReturnType<PolyTreeD['child']>) => {
    for (let i = 0; i < outer.count; i++) {
      const shape = outer.child(i);
      const holes: SceneryPoint[][] = [];
      for (let j = 0; j < shape.count; j++) {
        const hole = shape.child(j);
        holes.push(ring(hole.poly!));
        visit(hole);
      }
      result.push([ring(shape.poly!), ...holes]);
    }
  };
  visit(tree);
  return result;
}

function booleanOp(
  type: ClipType,
  subject: readonly SceneryPolygon[],
  clip: readonly SceneryPolygon[],
) {
  const tree = new PolyTreeD();
  booleanOpDWithPolyTree(type, paths(subject), paths(clip), tree, FillRule.NonZero, precision);
  return multiPolygon(tree);
}

export const union = (...polygons: MultiPolygon[]) =>
  booleanOp(ClipType.Union, polygons.flat(), []);

export const difference = (subject: MultiPolygon, clip: MultiPolygon) =>
  booleanOp(ClipType.Difference, subject, clip);

export const intersection = (subject: MultiPolygon, clip: MultiPolygon) =>
  booleanOp(ClipType.Intersection, subject, clip);

export function offset(polygons: MultiPolygon, distance: number): MultiPolygon {
  const tree = new PolyTreeD();
  const expanded = inflatePathsD(
    paths(polygons),
    distance,
    JoinType.Miter,
    EndType.Polygon,
    2,
    precision,
  );
  booleanOpDWithPolyTree(ClipType.Union, expanded, [], tree, FillRule.NonZero, precision);
  return multiPolygon(tree);
}

/** Add tangent circular fillets inside pavement notches, without trimming drivable pavement. */
export function roundConcaveCorners(
  polygons: MultiPolygon,
  radiusAt: (point: SceneryPoint) => number,
): MultiPolygon {
  const rounded = polygons.map((rings) =>
    rings.map((ring) => {
      const points = ring.slice(0, -1),
        result: SceneryPoint[] = [];
      for (let i = 0; i < points.length; i++) {
        const p = points[i],
          before = points[(i + points.length - 1) % points.length],
          after = points[(i + 1) % points.length];
        const a = Math.hypot(before[0] - p[0], before[1] - p[1]);
        const b = Math.hypot(after[0] - p[0], after[1] - p[1]);
        const ux = (before[0] - p[0]) / a,
          uz = (before[1] - p[1]) / a;
        const vx = (after[0] - p[0]) / b,
          vz = (after[1] - p[1]) / b;
        const dot = Math.max(-1, Math.min(1, ux * vx + uz * vz));
        const radius = radiusAt(p);
        if (!radius || !a || !b || ux * vz - uz * vx < 0.1 || dot > 0.99) {
          result.push(p);
          continue;
        }
        const tangent = Math.sqrt((1 + dot) / (1 - dot));
        const distance = Math.min(radius * tangent, a / 2, b / 2);
        const r = distance / tangent;
        const cx = p[0] + ((ux + vx) * distance) / (1 + dot);
        const cz = p[1] + ((uz + vz) * distance) / (1 + dot);
        const start = Math.atan2(p[1] + uz * distance - cz, p[0] + ux * distance - cx);
        const sweep = -(Math.PI - Math.acos(dot));
        const steps = Math.max(2, Math.ceil((-sweep * r) / 0.5));
        for (let step = 0; step <= steps; step++) {
          const angle = start + (sweep * step) / steps;
          result.push([cx + Math.cos(angle) * r, cz + Math.sin(angle) * r]);
        }
      }
      return [...result, result[0]];
    }),
  );
  return union(rounded);
}
