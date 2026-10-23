import * as THREE from 'three';
import { courseLineWidth, courseRoute, courseStartDistance } from './courses';
import type { CourseDefinition } from './courses';
import { TerrainSurface } from './terrain-query';

export class LapTimer {
  lap = 0;
  invalid = false;
  current = 0;
  last: number | null = null;
  best: number | null = null;
  lastCones: number | null = null;
  private readonly hitCones = new Set<number>();
  private elapsed = 0;
  private startedAt = 0;
  private readonly previous = new THREE.Vector3();
  private readonly crossing = new THREE.Vector3();
  private readonly start;
  private readonly surface;
  private readonly halfWidth: number;

  constructor(definition: CourseDefinition) {
    this.halfWidth = (definition.width + courseLineWidth) / 2;
    const route = courseRoute(definition);
    const length = route.getLength();
    const t = courseStartDistance(definition, length) / length;
    this.start = { center: route.getPointAt(t), forward: route.getTangentAt(t) };
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

  private startCrossing(position: THREE.Vector3) {
    const gate = this.start;
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
  update(position: THREE.Vector3, dt: number, tirePoints: readonly THREE.Vector3[]) {
    if (
      this.lap > 0 &&
      !this.invalid &&
      tirePoints.every((point) => !this.surface.isAsphalt(point))
    ) {
      this.invalid = true;
    }
    const crossing = this.startCrossing(position);
    if (crossing?.withinWidth) {
      const time = this.elapsed + dt * crossing.fraction;
      if (this.lap > 0 && !this.invalid) {
        this.lastCones = this.conesHit;
        this.last = time - this.startedAt;
        this.best = this.best === null ? this.last : Math.min(this.best, this.last);
      }
      if (!this.invalid) this.lap++;
      this.startedAt = time;
      this.invalid = false;
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
