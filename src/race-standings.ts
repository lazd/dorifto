import { MathUtils } from 'three';
import { courseRoute, courseStartDistance, type CourseDefinition } from './courses';
import type { LapState } from './physics-messages';

export const standingsInterval = 0.1;
export const standingsGapInterval = 0.5;

export interface RaceStanding {
  entrant: number;
  lastLap: number | null;
  gap: number | null;
  lapsBehind: number;
  finished?: boolean;
  disqualified?: boolean;
  retired?: boolean;
  finishTime?: number;
}

interface RaceEntrant {
  position: { x: number; z: number };
  laps: Pick<LapState, 'lap' | 'lapStartedAt' | 'last'> &
    Partial<Pick<LapState, 'finished' | 'completed' | 'lastAttempt' | 'retired'>>;
}

/** One circuit of distance-indexed passage times, independent of simulation frequency. */
class PassageTimes {
  private readonly distances: Float64Array;
  private readonly times: Float64Array;
  private start = 0;
  private count = 0;
  private latestDistance = 0;
  private latestTime = 0;

  constructor(capacity: number) {
    this.distances = new Float64Array(capacity);
    this.times = new Float64Array(capacity);
  }

  reset(distance: number, time: number) {
    this.start = this.count = 0;
    this.latestDistance = distance;
    this.latestTime = time;
    this.push(distance, time);
  }

  record(distance: number, time: number) {
    if (distance > this.latestDistance) {
      this.latestDistance = distance;
      this.latestTime = time;
    }
  }

  push(distance: number, time: number) {
    const capacity = this.times.length;
    const index = (this.start + this.count) % capacity;
    this.distances[index] = distance;
    this.times[index] = time;
    if (this.count < capacity) this.count++;
    else this.start = (this.start + 1) % capacity;
  }

  at(distance: number): number | null {
    const indexAt = (index: number) => (this.start + index) % this.times.length;
    if (distance < this.distances[this.start] || distance > this.latestDistance) return null;
    let low = 0;
    let high = this.count;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (this.distances[indexAt(mid)] <= distance) low = mid + 1;
      else high = mid;
    }
    const before = indexAt(low - 1);
    const after = indexAt(low);
    const endDistance = low === this.count ? this.latestDistance : this.distances[after];
    const endTime = low === this.count ? this.latestTime : this.times[after];
    const span = endDistance - this.distances[before];
    return span > 0
      ? MathUtils.lerp(this.times[before], endTime, (distance - this.distances[before]) / span)
      : this.times[before];
  }
}

export function createRaceStandings(
  definition: CourseDefinition,
  entrants: readonly RaceEntrant[],
) {
  const route = courseRoute(definition);
  const length = route.getLength();
  const count = Math.ceil(length / 3);
  const spacing = length / count;
  const start = courseStartDistance(definition, length);
  const open = definition.closed === false;
  const points = Array.from({ length: count + (open ? 1 : 0) }, (_, i) =>
    route.getPointAt(open ? i / count : ((start + i * spacing) % length) / length),
  );
  const wrap = (distance: number) => MathUtils.euclideanModulo(distance, length);
  const states = entrants.map(() => ({
    segment: -1,
    phase: 0,
    distance: 0,
    lap: 0,
    lapStartedAt: 0,
    marker: 0,
    history: new PassageTimes(count + 3),
  }));
  let elapsed = 0;
  let nextStandings = 0;
  let nextGaps = 0;
  let gapLeader = -1;
  const gaps: (number | null)[] = entrants.map(() => null);
  const order = entrants.map((_, i) => i);
  const positions = entrants.map(() => 0);

  function disqualified(index: number) {
    const laps = entrants[index].laps;
    const valid = laps.lap - 1 + Number(laps.lastAttempt?.valid ?? false);
    return Boolean(laps.finished && (laps.completed ?? 0) > valid);
  }

  function rank() {
    order.sort((a, b) => {
      const left = entrants[a].laps;
      const right = entrants[b].laps;
      const category = (index: number) =>
        disqualified(index)
          ? 3
          : entrants[index].laps.retired
            ? 2
            : entrants[index].laps.finished
              ? 0
              : 1;
      const difference = category(a) - category(b);
      if (difference) return difference;
      if (left.finished && right.finished && !disqualified(a))
        return left.lapStartedAt - right.lapStartedAt || a - b;
      return states[b].distance - states[a].distance || a - b;
    });
    order.forEach((entrant, index) => {
      positions[entrant] = index + 1;
    });
  }

  function project(
    position: RaceEntrant['position'],
    state: (typeof states)[number],
    global = false,
  ) {
    const previous = global ? -1 : state.segment;
    const radius = Math.min(12, Math.floor(count / 2));
    const first = previous < 0 ? 0 : previous - radius;
    const end = previous < 0 ? count : previous + radius + 1;
    let best = Infinity;
    let segment = 0;
    let phase = 0;
    for (let i = first; i < end; i++) {
      if (open && (i < 0 || i >= count)) continue;
      const candidate = MathUtils.euclideanModulo(i, count);
      const a = points[candidate];
      const b = points[(candidate + 1) % count];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const squaredLength = dx * dx + dz * dz;
      const t =
        squaredLength > 0
          ? MathUtils.clamp(
              ((position.x - a.x) * dx + (position.z - a.z) * dz) / squaredLength,
              0,
              1,
            )
          : 0;
      const distance = (position.x - a.x - t * dx) ** 2 + (position.z - a.z - t * dz) ** 2;
      if (distance < best) {
        best = distance;
        segment = candidate;
        phase = (candidate + t) * spacing;
      }
    }
    state.segment = segment;
    state.phase = open ? phase : wrap(phase);
  }

  function reset() {
    elapsed = nextStandings = nextGaps = 0;
    gapLeader = -1;
    gaps.fill(null);
    entrants.forEach((entrant, index) => {
      const state = states[index];
      project(entrant.position, state, true);
      state.distance = !open && state.phase > length / 2 ? state.phase - length : state.phase;
      state.lap = entrant.laps.lap;
      state.lapStartedAt = entrant.laps.lapStartedAt;
      state.marker = state.distance;
      state.history.reset(state.distance, elapsed);
    });
    rank();
  }

  function update(dt: number): RaceStanding[] | undefined {
    elapsed += dt;
    entrants.forEach((entrant, index) => {
      const state = states[index];
      if (entrant.laps.retired) return;
      if (entrant.laps.finished && state.lapStartedAt === entrant.laps.lapStartedAt) return;
      const phase = state.phase;
      project(entrant.position, state);
      const delta = open
        ? state.phase - phase
        : wrap(state.phase - phase + length / 2) - length / 2;
      const before = state.distance;
      state.distance += delta;
      // The timer keeps its lap number on an invalid finish; charge it only at that crossing.
      if (
        !open &&
        state.lap > 0 &&
        entrant.laps.lapStartedAt !== state.lapStartedAt &&
        (entrant.laps.lastAttempt
          ? !entrant.laps.lastAttempt.valid
          : entrant.laps.lap === state.lap)
      ) {
        state.distance -= length;
        state.marker = state.distance;
        state.history.reset(state.distance, elapsed);
        nextGaps = 0;
      } else {
        while (state.marker + spacing <= state.distance) {
          state.marker += spacing;
          const fraction = (state.marker - before) / delta;
          state.history.push(state.marker, elapsed - dt + dt * fraction);
        }
        state.history.record(state.distance, elapsed);
      }
      state.lap = entrant.laps.lap;
      state.lapStartedAt = entrant.laps.lapStartedAt;
    });
    rank();
    if (elapsed + 1e-9 < nextStandings) return;
    nextStandings = elapsed + standingsInterval;
    const leader = states[order[0]];
    if (!leader) return [];
    if (elapsed + 1e-9 >= nextGaps || gapLeader !== order[0]) {
      nextGaps = elapsed + standingsGapInterval;
      gapLeader = order[0];
      for (const index of order) {
        const passage = leader.history.at(states[index].distance);
        gaps[index] = passage === null ? null : Math.max(0, elapsed - passage);
      }
    }
    return order.map((index) => ({
      entrant: index,
      lastLap: entrants[index].laps.last,
      gap: gaps[index],
      lapsBehind: Math.max(0, Math.floor((leader.distance - states[index].distance) / length)),
      ...(entrants[index].laps.finished
        ? {
            finished: true,
            disqualified: disqualified(index),
            finishTime: entrants[index].laps.lapStartedAt,
          }
        : {}),
      ...(entrants[index].laps.retired ? { retired: true } : {}),
    }));
  }

  reset();
  return { reset, update, position: (entrant: number) => positions[entrant] };
}
