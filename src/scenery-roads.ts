import * as THREE from 'three';
import type { CourseScenery, SceneryPoint } from './scenery-data';
import { sceneryPointKey, smoothSceneryRoads } from './scenery-data';

export const nearbyBridgeClearance = 6.5;
export const nearbyRoadLift = 0.035;
export const nearbyRoadTaperLength = 20;

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

const approachSmoothing = 15;

/** Adjacent carriageways keep their decks but share one under-deck frame. */
export function sceneryBridgeGroups<
  T extends {
    road: CourseScenery['roads'][number];
    curve: THREE.Curve<THREE.Vector3>;
    heightAt: (x: number, z: number) => number;
  },
>(profiles: T[]) {
  const remaining = profiles.filter(({ road }) => road.structure === 'bridge');
  const groups = [];
  while (remaining.length) {
    const first = remaining.shift()!;
    const length = first.curve.getLength();
    const steps = Math.max(4, Math.ceil(length / 12));
    const match = remaining.findIndex((other) => {
      if (
        (first.road.layer ?? 0) !== (other.road.layer ?? 0) ||
        Math.abs(other.curve.getLength() - length) > Math.max(4, length * 0.05)
      )
        return false;
      const reverse = first.curve.getTangentAt(0.5).dot(other.curve.getTangentAt(0.5)) < 0;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps,
          u = reverse ? 1 - t : t;
        const a = first.curve.getPointAt(t),
          b = other.curve.getPointAt(u);
        const tangent = first.curve.getTangentAt(t);
        const delta = b.clone().sub(a);
        const separation = Math.abs(delta.x * tangent.z - delta.z * tangent.x);
        if (
          Math.abs(tangent.dot(other.curve.getTangentAt(u))) < 0.98 ||
          Math.abs(delta.dot(tangent)) >
            Math.max(4, (Math.min(20, first.road.width) + Math.min(20, other.road.width)) / 2) ||
          separation < 1 ||
          separation > (Math.min(20, first.road.width) + Math.min(20, other.road.width)) / 2 + 4 ||
          Math.abs(first.heightAt(a.x, a.z) - other.heightAt(b.x, b.z)) > 2
        )
          return false;
      }
      return true;
    });
    if (match < 0) {
      groups.push({
        members: [first],
        curve: first.curve,
        width: Math.min(20, first.road.width),
        heightAt: first.heightAt,
      });
      continue;
    }
    const second = remaining.splice(match, 1)[0];
    const reverse = first.curve.getTangentAt(0.5).dot(second.curve.getTangentAt(0.5)) < 0;
    let width = 0;
    const points: SceneryPoint[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = first.curve.getPointAt(t),
        b = second.curve.getPointAt(reverse ? 1 - t : t);
      const tangent = first.curve.getTangentAt(t);
      const separation = Math.abs((b.x - a.x) * tangent.z - (b.z - a.z) * tangent.x);
      points.push([(a.x + b.x) / 2, (a.z + b.z) / 2]);
      width = Math.max(
        width,
        separation + Math.max(Math.min(20, first.road.width), Math.min(20, second.road.width)),
      );
    }
    groups.push({
      members: [first, second],
      curve: new SceneryRoadCurve(points),
      width,
      heightAt: (x: number, z: number) => (first.heightAt(x, z) + second.heightAt(x, z)) / 2,
    });
  }
  return groups;
}

/**
 * Smooths a profile without dropping below it: a running maximum followed by an average over
 * the same window. A radius of zero leaves a sample untouched.
 */
function smoothAbove(
  heights: number[],
  distances: number[],
  radiusAt: (distance: number) => number,
) {
  const radii = distances.map(radiusAt);
  const window = (i: number, each: (j: number, offset: number) => void) => {
    for (let j = i; j >= 0 && Math.abs(distances[i] - distances[j]) <= radii[i]; j--)
      each(j, Math.abs(distances[i] - distances[j]));
    for (
      let j = i + 1;
      j < heights.length && Math.abs(distances[j] - distances[i]) <= radii[i];
      j++
    )
      each(j, Math.abs(distances[j] - distances[i]));
  };
  const envelope = heights.map((_, i) => {
    let max = -Infinity;
    window(i, (j) => (max = Math.max(max, heights[j])));
    return max;
  });
  return heights.map((_, i) => {
    let sum = 0,
      weight = 0;
    window(i, (j, offset) => {
      const w = radii[i] ? Math.exp(-((offset / (radii[i] / 2)) ** 2)) : 1;
      sum += envelope[j] * w;
      weight += w;
    });
    return sum / weight;
  });
}

export function sceneryRoadProfiles(
  roads: CourseScenery['roads'],
  ground: (x: number, z: number) => number,
  trackHeight: (x: number, z: number) => number,
  trackDistance: (x: number, z: number) => number,
  selectedRoadCopy: (x: number, z: number, dx: number, dz: number, width: number) => boolean,
  includeSelected = false,
  includeTunnels = false,
) {
  const bridges = roads.filter((road) => road.structure === 'bridge');
  const roundedRoads = smoothSceneryRoads(roads);
  const endpointWidths = new Map<string, Set<number>>();
  const endpointKey = (road: CourseScenery['roads'][number], point: SceneryPoint) =>
    `${road.layer ?? 0}:${sceneryPointKey(point)}`;
  const junctionArms = new Map<string, { arms: Set<string>; width: number }>();
  for (const road of roads) {
    if (road.structure) continue;
    for (let i = 0; i < road.points.length; i++) {
      const key = endpointKey(road, road.points[i]);
      const junction = junctionArms.get(key) ?? { arms: new Set<string>(), width: 0 };
      for (const neighbor of [road.points[i - 1], road.points[i + 1]])
        if (neighbor) junction.arms.add(sceneryPointKey(neighbor));
      junction.width = Math.max(junction.width, Math.min(20, road.width));
      junctionArms.set(key, junction);
    }
  }
  for (const road of roads)
    for (const point of [road.points[0], road.points.at(-1)!]) {
      const key = endpointKey(road, point),
        widths = endpointWidths.get(key) ?? new Set<number>();
      widths.add(road.width);
      endpointWidths.set(key, widths);
    }
  const profiles = roads
    .filter((road) => includeTunnels || road.structure !== 'tunnel')
    .map((road) => {
      const rounded = roundedRoads.get(road)!;
      const roundedCurve = new SceneryRoadCurve(rounded);
      const taperEnds = [road.points[0], road.points.at(-1)!].map(
        (point) => endpointWidths.get(endpointKey(road, point))!.size > 1,
      );
      const major = isMajorSceneryRoad(road);
      const needsProfile =
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
        const from = roundedCurve.distances[i - 1],
          to = roundedCurve.distances[i];
        const cuts = [from, to];
        for (const boundary of [
          taperEnds[0] ? nearbyRoadTaperLength : 0,
          taperEnds[1]
            ? roundedCurve.getLength() - nearbyRoadTaperLength
            : roundedCurve.getLength(),
        ])
          if (boundary > from && boundary < to) cuts.push(boundary);
        cuts.sort((a, b) => a - b);
        for (let part = 1; part < cuts.length; part++) {
          const start = cuts[part - 1],
            end = cuts[part],
            middle = (start + end) / 2;
          const taper =
            (taperEnds[0] && middle < nearbyRoadTaperLength) ||
            (taperEnds[1] && roundedCurve.getLength() - middle < nearbyRoadTaperLength);
          const spacing = needsProfile
            ? road.structure === 'bridge'
              ? 2
              : 0.5
            : taper
              ? 1
              : Infinity;
          const steps = Math.max(1, Math.ceil((end - start) / spacing));
          for (let j = 1; j <= steps; j++) {
            const t = (THREE.MathUtils.lerp(start, end, j / steps) - from) / (to - from);
            points.push([THREE.MathUtils.lerp(a[0], b[0], t), THREE.MathUtils.lerp(a[1], b[1], t)]);
          }
        }
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
        raised: road.structure === 'bridge',
        bridgeApproach: false,
      };
    })
    .filter(({ selected }) => includeSelected || !selected);

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
        if (
          trackDistance(px, pz) <= 2 &&
          !selectedRoadCopy(px, pz, tangent.x, tangent.z, profile.road.width)
        )
          lift = Math.max(lift, trackHeight(px, pz) + nearbyBridgeClearance - heights[i]);
      }
    }
    for (let i = 0; i < heights.length; i++) heights[i] += lift;
    profile.raised = true;
  }

  type Profile = (typeof profiles)[number];
  const approachLimit = (profile: Profile, reverse: boolean) => {
    const length = profile.curve.getLength();
    let limit = length;
    for (let i = 0; i < profile.points.length; i++) {
      const distance = reverse ? length - profile.curve.distances[i] : profile.curve.distances[i];
      const junction = junctionArms.get(endpointKey(profile.road, profile.points[i]));
      if (distance > 0.1 && junction && junction.arms.size >= 3)
        limit = Math.min(limit, distance - junction.width / 2);
    }
    return Math.min(length, Math.max(0.5, limit));
  };
  const paired = new Map<Profile, { other: Profile; reverse: boolean }>();
  const pairs = sceneryBridgeGroups(
    profiles.map((profile) => ({
      profile,
      road: profile.road,
      curve: profile.curve,
      heightAt(x: number, z: number) {
        const start = profile.curve.getPointAt(0),
          end = profile.curve.getPointAt(1);
        const delta = end.sub(start);
        const t = THREE.MathUtils.clamp(
          ((x - start.x) * delta.x + (z - start.z) * delta.z) / delta.lengthSq(),
          0,
          1,
        );
        return THREE.MathUtils.lerp(profile.heights[0], profile.heights.at(-1)!, t);
      },
    })),
  );
  const moves: { from: SceneryPoint; to: SceneryPoint; direction: SceneryPoint }[] = [];
  const moveBridgeEnds = (profile: Profile, previous = profile.points) => {
    for (const end of [false, true]) {
      const point = end ? profile.points.at(-1)! : profile.points[0];
      const inside = end ? profile.points.at(-2)! : profile.points[1];
      const length = Math.hypot(point[0] - inside[0], point[1] - inside[1]);
      moves.push({
        from: end ? previous.at(-1)! : previous[0],
        to: point,
        direction: [(point[0] - inside[0]) / length, (point[1] - inside[1]) / length],
      });
    }
  };
  for (const { members, curve } of pairs) {
    if (members.length !== 2) continue;
    const [first, second] = members.map(({ profile }) => profile);
    const reverse = first.curve.getTangentAt(0.5).dot(second.curve.getTangentAt(0.5)) < 0;
    paired.set(first, { other: second, reverse });
    paired.set(second, { other: first, reverse });
    const direction = curve.getPointAt(1).sub(curve.getPointAt(0)).normalize();
    const across = new THREE.Vector3(direction.z, 0, -direction.x);
    const separation = second.curve.getPointAt(0.5).sub(first.curve.getPointAt(0.5)).dot(across);
    const start = Math.max(
      first.heights[0],
      second.heights[reverse ? second.heights.length - 1 : 0],
    );
    const end = Math.max(
      first.heights.at(-1)!,
      second.heights[reverse ? 0 : second.heights.length - 1],
    );
    const steps = Math.max(1, Math.ceil(curve.getLength() / 2));
    for (const [index, profile] of [first, second].entries()) {
      const backwards = index === 1 && reverse;
      const points: SceneryPoint[] = Array.from({ length: steps + 1 }, (_, i) => {
        const point = curve
          .getPointAt(backwards ? 1 - i / steps : i / steps)
          .addScaledVector(across, ((index === 0 ? -1 : 1) * separation) / 2);
        return [point.x, point.z];
      });
      const previous = profile.points;
      profile.points = points;
      profile.road = { ...profile.road, points };
      profile.curve = new SceneryRoadCurve(points);
      profile.heights = profile.curve.distances.map((distance) =>
        THREE.MathUtils.lerp(
          backwards ? end : start,
          backwards ? start : end,
          distance / profile.curve.getLength(),
        ),
      );
      moveBridgeEnds(profile, previous);
    }
  }
  for (const profile of profiles)
    if (profile.road.structure === 'bridge' && !paired.has(profile)) moveBridgeEnds(profile);
  for (const profile of profiles) {
    if (profile.road.structure) continue;
    const length = profile.curve.getLength();
    const adjustments = moves.filter(({ from }) =>
      [profile.points[0], profile.points.at(-1)!].some(
        (p) => Math.hypot(p[0] - from[0], p[1] - from[1]) < 0.1,
      ),
    );
    if (!adjustments.length) continue;
    const joins = adjustments.map(({ from, to, direction }) => {
      const fromStart =
        Math.hypot(profile.points[0][0] - from[0], profile.points[0][1] - from[1]) < 0.1;
      return {
        to,
        direction,
        fromStart,
        reach: Math.min(approachSmoothing, length / 2, approachLimit(profile, !fromStart)),
      };
    });
    profile.points = profile.points.map(([x, z], i) => {
      let px = x,
        pz = z;
      for (const { to, direction, fromStart, reach } of joins) {
        const distance = fromStart
          ? profile.curve.distances[i]
          : length - profile.curve.distances[i];
        const weight = 1 - THREE.MathUtils.smoothstep(distance, Math.min(2, reach / 4), reach);
        px += (to[0] + direction[0] * distance - x) * weight;
        pz += (to[1] + direction[1] * distance - z) * weight;
      }
      return [px, pz];
    });
    profile.road = { ...profile.road, points: profile.points };
    profile.curve = new SceneryRoadCurve(profile.points);
    profile.heights = profile.points.map(([x, z], i) => {
      const tangent = profile.curve.getTangentAt(
        profile.curve.distances[i] / profile.curve.getLength(),
      );
      return Math.max(
        ...[-0.5, 0, 0.5].map((side) =>
          ground(
            x + tangent.z * side * Math.min(20, profile.road.width),
            z - tangent.x * side * Math.min(20, profile.road.width),
          ),
        ),
      );
    });
  }

  // When approach terrain cannot establish clearance, carry the fallback rise onto
  // connected ground roads rather than leaving a vertical step at the abutment.
  const approaches = profiles.flatMap((profile) =>
    profile.road.structure
      ? []
      : profiles.flatMap((bridge) =>
          bridge.road.structure !== 'bridge'
            ? []
            : [0, bridge.points.length - 1].flatMap((end) =>
                [false, true].flatMap((reverse) => {
                  const endpoint = reverse ? profile.points.at(-1)! : profile.points[0];
                  const anchor = bridge.points[end];
                  if (Math.hypot(endpoint[0] - anchor[0], endpoint[1] - anchor[1]) >= 0.1)
                    return [];
                  const length = profile.curve.getLength();
                  const index = reverse ? profile.points.length - 1 : 0;
                  const distances = profile.curve.distances.map((distance) =>
                    reverse ? length - distance : distance,
                  );
                  const rampLength = Math.min(
                    length,
                    approachLimit(profile, reverse),
                    Math.max(40, Math.abs(bridge.heights[end] - profile.heights[index]) / 0.1),
                  );
                  return [{ profile, bridge, end, reverse, index, distances, rampLength }];
                }),
              ),
        ),
  );
  // Ramps follow a smoothed envelope of the ground, and decks rise to meet it where the
  // envelope ends above them; both only ever lift, so the terrain stays below the road.
  for (const { profile, distances, rampLength } of approaches)
    profile.heights = smoothAbove(profile.heights, distances, (distance) =>
      Math.max(0, Math.min(approachSmoothing, rampLength + approachSmoothing - distance)),
    );
  type Approach = (typeof approaches)[number];
  const raiseDeck = ({ bridge, end }: Approach, raise: number) => {
    if (raise <= 0) return;
    const pair = paired.get(bridge);
    for (const profile of pair ? [bridge, pair.other] : [bridge]) {
      const anchor = profile !== bridge && pair?.reverse ? profile.points.length - 1 - end : end;
      for (let i = 0; i < profile.heights.length; i++)
        profile.heights[i] +=
          raise *
          (1 -
            Math.abs(profile.curve.distances[i] - profile.curve.distances[anchor]) /
              profile.curve.getLength());
    }
  };
  // Decks are straight, so their whole length gives the abutment grade.
  const deckSlope = ({ bridge, end }: Approach) =>
    (bridge.heights[end] - bridge.heights[bridge.points.length - 1 - end]) /
    bridge.curve.getLength();
  const rise = ({ profile, bridge, end, index }: Approach) =>
    bridge.heights[end] - profile.heights[index];
  const groundSlope = ({ profile, reverse, rampLength }: Approach) => {
    const length = profile.curve.getLength();
    const sampleAt = (distance: number) => {
      const { i, t } = profile.curve.segment(reverse ? 1 - distance / length : distance / length);
      return THREE.MathUtils.lerp(profile.heights[i - 1], profile.heights[i], t);
    };
    const step = Math.min(
      rampLength,
      reverse ? length - profile.curve.distances.at(-2)! : profile.curve.distances[1],
    );
    return (sampleAt(step) - sampleAt(0)) / step;
  };
  for (const approach of approaches) raiseDeck(approach, -rise(approach));
  // The quintic offset stays non-negative with a slope term of at least -2.5 * rise / length.
  // Lifting one abutment changes the opposite end's grade, including its paired deck.
  for (let pass = 0; ; pass++) {
    let raised = false;
    for (const approach of approaches) {
      const { bridge, rampLength } = approach;
      const lift =
        ((-(deckSlope(approach) - groundSlope(approach)) * rampLength) / 2.5 - rise(approach)) /
        (1 + rampLength / (2.5 * bridge.curve.getLength()));
      if (lift <= 1e-7) continue;
      raiseDeck(approach, lift);
      raised = true;
    }
    if (!raised) break;
    if (pass === 127) throw new Error('Unable to match bridge approach grades');
  }
  for (const approach of approaches) {
    const { profile, distances, rampLength } = approach;
    const base = profile.heights.slice();
    const lift = rise(approach);
    const slope = Math.max(deckSlope(approach) - groundSlope(approach), (-2.5 * lift) / rampLength);
    // Ease the offset from the ground-following profile, not the height itself, so the
    // ramp keeps to the same surface the terrain is shaped to instead of cutting a chord
    // through crests below it.
    for (let i = 0; i < profile.points.length; i++) {
      if (distances[i] > rampLength) continue;
      const t = distances[i] / rampLength;
      const offset =
        (1 - 10 * t ** 3 + 15 * t ** 4 - 6 * t ** 5) * lift +
        (t - 6 * t ** 3 + 8 * t ** 4 - 3 * t ** 5) * rampLength * slope;
      profile.heights[i] = base[i] + Math.max(0, offset);
    }
    profile.raised = true;
    profile.bridgeApproach = true;
  }

  return profiles.map((profile) => {
    const length = profile.curve.getLength();
    const ramps = approaches.filter((approach) => approach.profile === profile);
    const groundBlendAt = (distance: number) =>
      profile.bridgeApproach
        ? ramps.reduce(
            (blend, { reverse, rampLength }) =>
              Math.max(
                blend,
                1 -
                  THREE.MathUtils.smoothstep(
                    reverse ? length - distance : distance,
                    Math.max(0, rampLength - approachSmoothing),
                    rampLength,
                  ),
              ),
            0,
          )
        : 1;
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
      groundBlendAt,
      heightAt(x: number, z: number) {
        let nearest = Infinity,
          height = 0,
          distanceAlong = 0;
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
            distanceAlong = THREE.MathUtils.lerp(
              profile.curve.distances[i - 1],
              profile.curve.distances[i],
              t,
            );
          }
        }
        if (profile.bridgeApproach)
          height = THREE.MathUtils.lerp(ground(x, z), height, groundBlendAt(distanceAlong));
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
