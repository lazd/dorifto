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

/** Grows (positive) or shrinks (negative) polygons by a distance, with rounded corners. */
export function offset(polygons: MultiPolygon, delta: number) {
  const tree = new PolyTreeD();
  booleanOpDWithPolyTree(
    ClipType.Union,
    inflatePathsD(paths(polygons), delta, JoinType.Round, EndType.Polygon, 2, precision),
    [],
    tree,
    FillRule.NonZero,
    precision,
  );
  return multiPolygon(tree);
}
