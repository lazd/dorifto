import * as THREE from 'three';
import { courseRoute, courseStartDistance } from './courses';
import type { CourseDefinition } from './courses';

export class LapTimer {
  lap = 0;
  current = 0;
  last: number | null = null;
  best: number | null = null;
  lastCones: number | null = null;
  private readonly hitCones = new Set<number>();
  private elapsed = 0;
  private startedAt = 0;
  private nextGate = 0;
  private readonly previous = new THREE.Vector3();
  private readonly crossing = new THREE.Vector3();
  private readonly gates;
  private readonly halfWidth: number;

  constructor(definition: CourseDefinition) {
    const route = courseRoute(definition);
    const length = route.getLength();
    const startDistance = courseStartDistance(definition, length);
    this.halfWidth = definition.width / 2 + 0.8;
    this.gates = Array.from({ length: 16 }, (_, i) => {
      const t = ((startDistance + (i * length) / 16) % length) / length;
      return { center: route.getPointAt(t), forward: route.getTangentAt(t) };
    });
  }

  reset(position: THREE.Vector3) {
    this.lap = this.current = this.elapsed = this.startedAt = this.nextGate = 0;
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

  update(position: THREE.Vector3, dt: number) {
    const gate = this.gates[this.nextGate];
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
      if (Math.abs(across) <= this.halfWidth) {
        const time = this.elapsed + dt * fraction;
        if (this.nextGate === 0) {
          if (this.lap > 0) {
            this.lastCones = this.conesHit;
            this.last = time - this.startedAt;
            this.best = this.best === null ? this.last : Math.min(this.best, this.last);
          }
          this.hitCones.clear();
          this.startedAt = time;
          this.lap++;
        }
        this.nextGate = (this.nextGate + 1) % this.gates.length;
      }
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
