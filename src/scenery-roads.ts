import * as THREE from 'three';
import type { CourseScenery, SceneryPoint } from './scenery-data';
import { smoothSceneryLine } from './scenery-data';

export const nearbyBridgeClearance = 6.5;
export const nearbyRoadLift = 0.035;

export function isMajorSceneryRoad(road: CourseScenery['roads'][number]) {
  return road.roadClass
    ? ['motorway', 'trunk', 'primary'].includes(road.roadClass)
    : road.width >= 10;
}

/** Arc-length parameterization keeps structure geometry on the mapped, rounded polyline. */
class SceneryRoadCurve extends THREE.Curve<THREE.Vector3> {
  readonly distances = [0];

  constructor(readonly points: SceneryPoint[]) {
    super();
    for (let i = 1; i < points.length; i++)
      this.distances.push(
        this.distances[i - 1] +
          Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]),
      );
  }

  getLength() {
    return this.distances.at(-1)!;
  }

  segment(t: number) {
    const distance = THREE.MathUtils.clamp(t, 0, 1) * this.getLength();
    let low = 1,
      high = this.points.length - 1;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (this.distances[mid] < distance) low = mid + 1;
      else high = mid;
    }
    return {
      i: low,
      t: (distance - this.distances[low - 1]) / (this.distances[low] - this.distances[low - 1]),
    };
  }

  getPoint(t: number, target = new THREE.Vector3()) {
    const { i, t: fraction } = this.segment(t);
    const a = this.points[i - 1],
      b = this.points[i];
    return target.set(
      THREE.MathUtils.lerp(a[0], b[0], fraction),
      0,
      THREE.MathUtils.lerp(a[1], b[1], fraction),
    );
  }

  getPointAt(t: number, target = new THREE.Vector3()) {
    return this.getPoint(t, target);
  }

  getTangentAt(t: number, target = new THREE.Vector3()) {
    const { i } = this.segment(t);
    const a = this.points[i - 1],
      b = this.points[i];
    return target.set(b[0] - a[0], 0, b[1] - a[1]).normalize();
  }
}

export function sceneryRoadProfiles(
  roads: CourseScenery['roads'],
  ground: (x: number, z: number) => number,
  trackHeight: (x: number, z: number) => number,
  trackDistance: (x: number, z: number) => number,
  selectedRoadCopy: (x: number, z: number, dx: number, dz: number, width: number) => boolean,
) {
  const bridges = roads.filter((road) => road.structure === 'bridge');
  const profiles = roads
    .filter((road) => road.structure !== 'tunnel')
    .map((road) => {
      const rounded = smoothSceneryLine(road.points, road.width);
      const major = isMajorSceneryRoad(road);
      const needsProfile =
        major ||
        road.structure === 'bridge' ||
        bridges.some((bridge) =>
          [road.points[0], road.points.at(-1)!].some((p) =>
            [bridge.points[0], bridge.points.at(-1)!].some(
              (q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.1,
            ),
          ),
        );
      const points: SceneryPoint[] = [rounded[0]];
      for (let i = 1; i < rounded.length; i++) {
        const a = rounded[i - 1],
          b = rounded[i];
        const steps = needsProfile
          ? Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2))
          : 1;
        for (let j = 1; j <= steps; j++)
          points.push([
            THREE.MathUtils.lerp(a[0], b[0], j / steps),
            THREE.MathUtils.lerp(a[1], b[1], j / steps),
          ]);
      }
      const curve = new SceneryRoadCurve(points);
      const heights = points.map(([x, z], i) => {
        if (!needsProfile) return 0;
        const tangent = curve.getTangentAt(curve.distances[i] / curve.getLength());
        const halfWidth = Math.min(20, road.width) / 2;
        return Math.max(
          ...[-1, 0, 1].map((side) =>
            ground(x + tangent.z * side * halfWidth, z - tangent.x * side * halfWidth),
          ),
        );
      });
      const selected = points.slice(1).every(([x, z], i) => {
        const a = points[i];
        const size = Math.hypot(x - a[0], z - a[1]);
        return selectedRoadCopy(
          (x + a[0]) / 2,
          (z + a[1]) / 2,
          (x - a[0]) / size,
          (z - a[1]) / size,
          road.width,
        );
      });
      return {
        road,
        points,
        curve,
        heights,
        selected,
        major,
        raised: major,
        bridgeApproach: false,
      };
    })
    .filter(({ selected }) => !selected);

  for (const profile of profiles) {
    if (profile.road.structure !== 'bridge') continue;
    const { points, heights, curve } = profile;
    const start = heights[0],
      end = heights.at(-1)!;
    let lift = 0;
    for (let i = 0; i < points.length; i++) {
      const [x, z] = points[i];
      heights[i] = THREE.MathUtils.lerp(start, end, curve.distances[i] / curve.getLength());
      const tangent = curve.getTangentAt(curve.distances[i] / curve.getLength());
      for (const side of [-0.5, 0, 0.5]) {
        const offset = Math.min(20, profile.road.width) * side;
        const px = x + tangent.z * offset,
          pz = z - tangent.x * offset;
        if (trackDistance(px, pz) <= 2)
          lift = Math.max(lift, trackHeight(px, pz) + nearbyBridgeClearance - heights[i]);
      }
    }
    for (let i = 0; i < heights.length; i++) heights[i] += lift;
    profile.raised = true;
  }

  // When approach terrain cannot establish clearance, carry the fallback rise onto
  // connected ground roads rather than leaving a vertical step at the abutment.
  for (const profile of profiles) {
    if (profile.road.structure) continue;
    for (const bridge of profiles) {
      if (bridge.road.structure !== 'bridge') continue;
      for (const end of [0, bridge.points.length - 1]) {
        const anchor = bridge.points[end];
        for (const reverse of [false, true]) {
          const endpoint = reverse ? profile.points.at(-1)! : profile.points[0];
          if (Math.hypot(endpoint[0] - anchor[0], endpoint[1] - anchor[1]) >= 0.1) continue;
          const index = reverse ? profile.points.length - 1 : 0;
          const rise = bridge.heights[end] - profile.heights[index];
          const rampLength = Math.min(profile.curve.getLength(), Math.max(40, rise / 0.1));
          for (let i = 0; i < profile.points.length; i++) {
            const distance = reverse
              ? profile.curve.getLength() - profile.curve.distances[i]
              : profile.curve.distances[i];
            const blend = 1 - THREE.MathUtils.smoothstep(distance, 0, rampLength);
            profile.heights[i] += rise * blend;
          }
          profile.raised = true;
          profile.bridgeApproach = true;
        }
      }
    }
  }

  return profiles.map((profile) => {
    const segments = new Map<string, number[]>();
    if (profile.raised) {
      for (let i = 1; i < profile.points.length; i++) {
        const a = profile.points[i - 1],
          b = profile.points[i];
        for (
          let x = Math.floor((Math.min(a[0], b[0]) - 24) / 32);
          x <= Math.floor((Math.max(a[0], b[0]) + 24) / 32);
          x++
        )
          for (
            let z = Math.floor((Math.min(a[1], b[1]) - 24) / 32);
            z <= Math.floor((Math.max(a[1], b[1]) + 24) / 32);
            z++
          ) {
            const key = `${x},${z}`;
            const bucket = segments.get(key) ?? [];
            bucket.push(i);
            segments.set(key, bucket);
          }
      }
    }
    return {
      ...profile,
      heightAt(x: number, z: number) {
        let nearest = Infinity,
          height = 0;
        const candidates =
          segments.get(`${Math.floor(x / 32)},${Math.floor(z / 32)}`) ??
          profile.points.slice(1).map((_, i) => i + 1);
        for (const i of candidates) {
          const a = profile.points[i - 1],
            b = profile.points[i];
          const dx = b[0] - a[0],
            dz = b[1] - a[1];
          const t = THREE.MathUtils.clamp(
            ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz),
            0,
            1,
          );
          const distance = (x - a[0] - dx * t) ** 2 + (z - a[1] - dz * t) ** 2;
          if (distance < nearest) {
            nearest = distance;
            height = THREE.MathUtils.lerp(profile.heights[i - 1], profile.heights[i], t);
          }
        }
        if (profile.major && !profile.road.structure && !profile.bridgeApproach) {
          const blend = THREE.MathUtils.smoothstep(
            trackDistance(x, z),
            profile.road.width / 2 + 5,
            profile.road.width / 2 + 25,
          );
          height = THREE.MathUtils.lerp(ground(x, z), height, blend);
        }
        return height + nearbyRoadLift;
      },
    };
  });
}
