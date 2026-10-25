import * as THREE from 'three';
import { courseGateDistances, courseLineWidth, courseRoute } from './courses';
import type { CourseDefinition } from './courses';
import { TerrainSurface } from './terrain-query';
import { validForMode, type RaceOptions, type LapAttempt } from './race-rules';

export class LapTimer {
  lap = 0;
  invalid = false;
  current = 0;
  last: number | null = null;
  best: number | null = null;
  lastCones: number | null = null;
  finished = false;
  retired = false;
  completed = 0;
  lastAttempt: LapAttempt | null = null;
  trackLimits = true;
  mayoTouched = false;
  mustard: boolean | null;
  mustardTouched = false;
  mustardCrossed = false;
  private laneSide = 1;
  private readonly hitCones = new Set<number>();
  private elapsed = 0;
  private startedAt = 0;
  private readonly previous = new THREE.Vector3();
  private readonly crossing = new THREE.Vector3();
  private readonly start;
  private readonly finish;
  private readonly open;
  private readonly surface;
  private readonly halfWidth: number;

  constructor(
    definition: CourseDefinition,
    private readonly options: RaceOptions = { mode: 'track-limits', laps: Infinity },
  ) {
    this.mustard = definition.doubleYellow ? true : null;
    if (options.mode === 'mustard' && !definition.doubleYellow)
      throw new Error('Mustard mode requires a course with a centerline');
    this.halfWidth = (definition.width + courseLineWidth) / 2;
    const route = courseRoute(definition);
    const length = route.getLength();
    const [start, finish = start] = courseGateDistances(definition, length).map((distance) => {
      const t = distance / length;
      return { center: route.getPointAt(t), forward: route.getTangentAt(t) };
    });
    this.start = start;
    this.finish = finish;
    this.open = definition.closed === false;
    const count = Math.ceil(length);
    this.surface = new TerrainSurface(
      Array.from({ length: count }, (_, i) => ({
        a: route.getPointAt(i / count),
        b: route.getPointAt((i + 1) / count),
        bank: 0,
      })),
      this.halfWidth,
    );
  }

  reset(position: THREE.Vector3) {
    this.lap = this.current = this.elapsed = this.startedAt = 0;
    this.invalid = false;
    this.last = this.best = null;
    this.lastCones = null;
    this.hitCones.clear();
    this.previous.copy(position);
    this.finished = false;
    this.retired = false;
    this.completed = 0;
    this.lastAttempt = null;
    this.trackLimits = true;
    this.mayoTouched = false;
    this.mustardTouched = this.mustardCrossed = false;
    if (this.mustard !== null) this.mustard = true;
    this.laneSide = Math.sign(this.surface.nearest(position.x, position.z).across) || 1;
    if (this.open) this.lap = 1;
  }

  /** Seconds since reset, advanced once per physics step. */
  get elapsedTime() {
    return this.elapsed;
  }

  /** Time (on the `elapsedTime` clock) the current lap started at its exact line crossing. */
  get lapStartedAt() {
    return this.startedAt;
  }

  get conesHit() {
    return this.hitCones.size;
  }

  hitCone(id: number) {
    if (this.lap > 0) this.hitCones.add(id);
  }

  private startCrossing(position: THREE.Vector3, gate = this.start) {
    const before =
      (this.previous.x - gate.center.x) * gate.forward.x +
      (this.previous.z - gate.center.z) * gate.forward.z;
    const after =
      (position.x - gate.center.x) * gate.forward.x + (position.z - gate.center.z) * gate.forward.z;
    if (before < 0 && after >= 0) {
      const fraction = -before / (after - before);
      this.crossing.lerpVectors(this.previous, position, fraction);
      const across =
        (this.crossing.x - gate.center.x) * gate.forward.z -
        (this.crossing.z - gate.center.z) * gate.forward.x;
      return { fraction, withinWidth: Math.abs(across) <= this.halfWidth };
    }
    return null;
  }

  /** Tire samples include the center and both tread edges, in world coordinates. */
  update(position: THREE.Vector3, dt: number, tirePoints: readonly THREE.Vector3[], held = false) {
    if (this.finished || this.retired) return;
    if (this.open && held) {
      this.previous.copy(position);
      return;
    }
    if (this.lap > 0) {
      if (
        this.trackLimits &&
        tirePoints.length > 0 &&
        tirePoints.every((point) => !this.surface.isAsphalt(point))
      )
        this.trackLimits = false;
      if (this.mustard !== null) {
        const yellowEdge = courseLineWidth * 1.5;
        const yellowInner = courseLineWidth * 0.5;
        for (let i = 0; i < tirePoints.length; i += 3) {
          let min = Infinity;
          let max = -Infinity;
          for (let j = i; j < Math.min(i + 3, tirePoints.length); j++) {
            const point = tirePoints[j];
            const across = this.surface.nearest(point.x, point.z).across * this.laneSide;
            min = Math.min(min, across);
            max = Math.max(max, across);
          }
          this.mustardTouched ||=
            (min <= yellowEdge + 1e-6 && max >= yellowInner - 1e-6) ||
            (min <= -yellowInner + 1e-6 && max >= -yellowEdge - 1e-6);
          const whiteInner = this.halfWidth - courseLineWidth;
          this.mayoTouched ||=
            (min <= this.halfWidth + 1e-6 && max >= whiteInner - 1e-6) ||
            (min <= -whiteInner + 1e-6 && max >= -this.halfWidth - 1e-6);
          this.mustardCrossed ||= max < -yellowEdge - 1e-6;
        }
        this.mustard = this.mustard && !this.mustardCrossed && this.trackLimits;
      }
      this.invalid ||= !validForMode(this, this.options.mode);
    }
    const crossing = this.startCrossing(position, this.open ? this.finish : this.start);
    if (crossing?.withinWidth) {
      const time = this.elapsed + dt * crossing.fraction;
      if (this.lap > 0) {
        this.completed++;
        this.lastAttempt = {
          time: time - this.startedAt,
          cones: this.conesHit,
          valid: !this.invalid,
          trackLimits: this.trackLimits,
          mayoTouched: this.mayoTouched,
          mustard: this.mustard,
          mustardTouched: this.mustardTouched,
          mustardCrossed: this.mustardCrossed,
        };
      }
      if (this.lap > 0 && !this.invalid) {
        this.lastCones = this.conesHit;
        this.last = time - this.startedAt;
        this.best = this.best === null ? this.last : Math.min(this.best, this.last);
      }
      if (this.open || this.completed >= this.options.laps) {
        this.finished = true;
        this.current = time - this.startedAt;
        this.elapsed = time;
        this.startedAt = time;
        return;
      }
      if (!this.invalid) this.lap++;
      this.startedAt = time;
      this.invalid = false;
      this.trackLimits = true;
      this.mayoTouched = false;
      this.mustardTouched = this.mustardCrossed = false;
      if (this.mustard !== null) this.mustard = true;
      this.hitCones.clear();
    }
    this.elapsed += dt;
    this.current = this.lap ? this.elapsed - this.startedAt : 0;
    this.previous.copy(position);
  }
}

export function formatLapTime(seconds: number | null) {
  if (seconds === null) return '--:--.---';
  const milliseconds = Math.floor(seconds * 1000);
  return `${Math.floor(milliseconds / 60000)}:${String(Math.floor(milliseconds / 1000) % 60).padStart(2, '0')}.${String(milliseconds % 1000).padStart(3, '0')}`;
}
