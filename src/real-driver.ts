import * as THREE from 'three';
import { realDrivers } from 'virtual:course-catalog';
import {
  courseGateDistances,
  courseRoute,
  directedDistance,
  type CourseDefinition,
} from './courses';
import { idleRpm, overallRatio, redlineRpm } from './drivetrain';
import { RunRecording, createReplayFrame, type ReplayFrame } from './lap-recording';
import type { GroundHeight } from './ground-glow';
import { racingLinePath } from './racing-line';

/** Written by scripts/import-real-data.mjs. */
export interface RealDriverData {
  source: string;
  /** Whether the recording was driven against the course's point order. */
  reverse: boolean;
  /** Seconds between progress samples. */
  interval: number;
  /** Arc-length fraction along the forward route, per sample. */
  progress: number[];
  /** Leftward acceleration in g, per sample, when the phone sat still in the car. */
  lateral?: number[];
  /** Forward acceleration in g, per sample. */
  longitudinal?: number[];
}

export function hasRealDriver(course: Pick<CourseDefinition, 'id'>, reverse: boolean) {
  return realDrivers[course.id]?.reverse === reverse;
}

export async function loadRealDriver(course: Pick<CourseDefinition, 'id'>) {
  const entry = realDrivers[course.id];
  if (!entry) return null;
  const response = await fetch(entry.url);
  if (!response.ok) throw new Error(`Unable to load real driver data (${response.status})`);
  const data: RealDriverData = await response.json();
  if (
    !(data.interval > 0) ||
    !Array.isArray(data.progress) ||
    data.progress.length < 2 ||
    !data.progress.every((value) => value >= 0 && value <= 1) ||
    [data.lateral, data.longitudinal].some(
      (values) =>
        values !== undefined &&
        (!Array.isArray(values) ||
          values.length !== data.progress.length ||
          !values.every(Number.isFinite)),
    )
  )
    throw new Error('Corrupt real driver data');
  return data;
}

type Gates = NonNullable<CourseDefinition['gates']>;

/** A recording cut to the timed section it shares with the course. */
export interface TrimmedRealDriver extends RealDriverData {
  gates: Gates;
  /** Whether the gates differ from the course's own, i.e. the recording doesn't span them. */
  trimsCourse: boolean;
  /** Seconds from crossing the start gate to crossing the finish gate. */
  duration: number;
}

/**
 * Narrows the course's gates to the stretch the recording covers and cuts the recording to the
 * gates, so the ghost starts and finishes with the player. Null when they don't overlap.
 */
export function trimRealDriver(
  definition: CourseDefinition,
  data: RealDriverData,
): TrimmedRealDriver | null {
  const directed = { ...definition, reverse: data.reverse, gates: undefined };
  const length = courseRoute(directed).getLength();
  const [mapStart, mapFinish] = courseGateDistances(directed, length);
  const start = Math.max(mapStart, directedDistance(directed, data.progress[0], length));
  const finish = Math.min(mapFinish, directedDistance(directed, data.progress.at(-1)!, length));
  if (finish <= start) return null;
  // Directed distances are symmetric, so the same mapping converts them back to fractions.
  const gates = {
    start: directedDistance(directed, start / length, 1),
    finish: directedDistance(directed, finish / length, 1),
  };
  const sign = data.reverse ? -1 : 1;
  /** Fractional sample index where the driver passes a fraction; strict skips resting at it. */
  const crossing = (target: number, strict: boolean) => {
    const i = data.progress.findIndex((value) =>
      strict ? sign * value > sign * target : sign * value >= sign * target,
    );
    if (i < 0) return data.progress.length - 1;
    if (i === 0) return 0;
    const before = data.progress[i - 1];
    return i - 1 + (target - before) / (data.progress[i] - before);
  };
  const from = crossing(gates.start, true);
  const to = crossing(gates.finish, false);
  const count = Math.ceil(to - from) + 1;
  const resample = <T extends number[] | undefined>(values: T) =>
    (values &&
      Array.from({ length: count }, (_, k) => {
        const at = Math.min(from + k, values.length - 1);
        const i = Math.floor(at);
        const next = values[Math.min(i + 1, values.length - 1)];
        return values[i] + (next - values[i]) * (at - i);
      })) as T;
  return {
    ...data,
    progress: resample(data.progress),
    lateral: resample(data.lateral),
    longitudinal: resample(data.longitudinal),
    gates,
    trimsCourse: start > mapStart || finish < mapFinish,
    duration: (to - from) * data.interval,
  };
}

/** The real driver uses only the lane for their direction; timing remains road-relative. */
export function realDriverPath(definition: CourseDefinition, reverse = false) {
  return racingLinePath(definition, 'lane', reverse);
}

const probeLength = 1.25;
const probeWidth = 0.75;
const maxSteer = 0.6;
/** Extra steering a road car needs per g of cornering as its front tires slip. */
const understeerPerG = THREE.MathUtils.degToRad(3);
/**
 * Body roll per g of cornering. The phone tilt measured ~2.7°, but its mount soaks up some roll
 * and that reads as flat on screen, so this leans harder to sell the cornering load.
 */
const rollPerG = THREE.MathUtils.degToRad(6);
/** Typical sports car dive/squat; the phone can't separate it from road grade. */
const pitchPerG = THREE.MathUtils.degToRad(1.5);
/** Deceleration beyond engine braking and drag, so the brake lights mean the pedal is pressed. */
const brakeLightG = 0.15;
/** The recorded drive stayed in 2nd and 3rd; it has no engine data, so shift points are guesses. */
const lowestGear = 2;
const highestGear = 3;
const upshiftRpm = 6500;
const downshiftRpm = 4000;
/** Braking for a corner drops a gear earlier, ready to drive out of it. */
const brakingDownshiftRpm = 4800;
const radiansToRpm = 60 / (2 * Math.PI);

/**
 * Fills a frame's engine and tire state from speed and longitudinal g: the pedal follows
 * acceleration, the gear holds between shift points, and tires only squeal near the limit.
 * Returns the gear for the next sample.
 */
function estimateEngine(
  frame: ReplayFrame,
  speed: number,
  longitudinal: number,
  lateral: number,
  gear: number,
  wheelRadius: number,
) {
  const throttle =
    longitudinal > 0.02
      ? THREE.MathUtils.clamp(0.15 + longitudinal / 0.3, 0, 1)
      : longitudinal > -0.08 && speed > 1
        ? 0.12
        : 0;
  const wheelRpm = (speed / wheelRadius) * radiansToRpm;
  let next = gear;
  if (throttle > 0.4 && wheelRpm * overallRatio(next) > upshiftRpm && next < highestGear) next++;
  const braking = longitudinal < -brakeLightG;
  const floor = braking ? brakingDownshiftRpm : downshiftRpm;
  while (next > lowestGear && wheelRpm * overallRatio(next) < floor) next--;
  frame.gear = next;
  frame.shifting = next !== gear;
  frame.rpm = THREE.MathUtils.clamp(wheelRpm * overallRatio(next), idleRpm, redlineRpm);
  frame.throttle = throttle;
  frame.load = throttle;
  frame.boost = throttle * THREE.MathUtils.smoothstep(frame.rpm, 2500, 4500);
  frame.braking = braking;
  const squeal = Math.max(0, Math.abs(lateral) - 0.7) * 1.5;
  for (const tire of frame.tires) {
    tire.slip = squeal;
    tire.speed = speed;
    tire.load = 1;
  }
  return next;
}

/**
 * A one-lap recording that drives the real driver's progress in their lane, settled onto the
 * road surface, so it plays back through the same path as any other ghost lap.
 */
export function realDriverLap(
  definition: CourseDefinition,
  data: TrimmedRealDriver,
  heightAt: GroundHeight,
  car: { centers: readonly THREE.Vector3[]; radii: readonly number[] },
) {
  const path = realDriverPath(definition, data.reverse);
  const length = path.length;
  const direction = data.reverse ? -1 : 1;
  const rideHeight =
    car.centers.reduce((sum, center, i) => sum + car.radii[i] - center.y, 0) / car.centers.length;
  const front = car.centers.filter(({ z }) => z > 0);
  const rear = car.centers.filter(({ z }) => z <= 0);
  const wheelbase =
    front.reduce((sum, { z }) => sum + z, 0) / front.length -
    rear.reduce((sum, { z }) => sum + z, 0) / rear.length;
  const recording = new RunRecording(0, data.interval);
  const frame = createReplayFrame();
  const center = new THREE.Vector3();
  const travel = new THREE.Vector3();
  const left = new THREE.Vector3();
  const before = new THREE.Vector3();
  const after = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const up = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const steer = new THREE.Quaternion();
  const lean = new THREE.Quaternion();
  const unlean = new THREE.Quaternion();
  const leanEuler = new THREE.Euler(0, 0, 0, 'ZXY');
  const height = (x: number, z: number, along: number, across: number) =>
    heightAt(x + travel.x * along + left.x * across, z + travel.z * along + left.z * across);
  const tangent = (fraction: number, target: THREE.Vector3) =>
    path.tangentAt(fraction, target).multiplyScalar(direction);
  const spins = car.centers.map(() => 0);
  const rearRadii = car.radii.filter((_, i) => car.centers[i].z <= 0);
  const wheelRadius = rearRadii.reduce((sum, radius) => sum + radius, 0) / rearRadii.length;
  const last = data.progress.length - 1;
  const speeds = data.progress.map((_, i) => {
    const a = Math.max(i - 1, 0);
    const b = Math.min(i + 1, last);
    return b > a
      ? (Math.abs(data.progress[b] - data.progress[a]) * length) / ((b - a) * data.interval)
      : 0;
  });
  let gear = lowestGear;
  data.progress.forEach((fraction, i) => {
    path.pointAt(fraction, center);
    tangent(fraction, travel);
    left.set(travel.z, 0, -travel.x).normalize();
    const ahead = height(center.x, center.z, probeLength, 0);
    const behind = height(center.x, center.z, -probeLength, 0);
    const leftSide = height(center.x, center.z, 0, probeWidth);
    const rightSide = height(center.x, center.z, 0, -probeWidth);
    forward
      .copy(travel)
      .multiplyScalar(2 * probeLength)
      .setY(ahead - behind)
      .normalize();
    left.multiplyScalar(2 * probeWidth).setY(leftSide - rightSide);
    up.crossVectors(forward, left).normalize();
    left.crossVectors(up, forward);
    frame.quaternion.setFromRotationMatrix(basis.makeBasis(left, up, forward));
    frame.position
      .set(center.x, (ahead + behind + leftSide + rightSide) / 4, center.z)
      .addScaledVector(up, rideHeight);
    // The body rolls away from the turn and dives under braking; the wheels stay planted.
    lean.setFromEuler(
      leanEuler.set(
        -pitchPerG * (data.longitudinal?.[i] ?? 0),
        0,
        rollPerG * (data.lateral?.[i] ?? 0),
      ),
    );
    frame.quaternion.multiply(lean);
    unlean.copy(lean).invert();
    // Positive yaw turns left; steering follows the racing line rather than sensor heading.
    const span = 2 / length;
    tangent(fraction - direction * span, before);
    tangent(fraction + direction * span, after);
    const bend = Math.atan2(before.z * after.x - before.x * after.z, before.dot(after)) / 4;
    steer.setFromAxisAngle(
      THREE.Object3D.DEFAULT_UP,
      THREE.MathUtils.clamp(
        Math.atan(wheelbase * bend) + understeerPerG * (data.lateral?.[i] ?? 0),
        -maxSteer,
        maxSteer,
      ),
    );
    const moved = i ? Math.abs(fraction - data.progress[i - 1]) * length : 0;
    const longitudinal =
      data.longitudinal?.[i] ??
      (speeds[Math.min(i + 1, last)] - speeds[Math.max(i - 1, 0)]) / (2 * data.interval * 9.81);
    gear = estimateEngine(
      frame,
      speeds[i],
      longitudinal,
      data.lateral?.[i] ?? 0,
      gear,
      wheelRadius,
    );
    frame.wheels.forEach((wheel, j) => {
      wheel.position.copy(car.centers[j]).applyQuaternion(unlean);
      wheel.quaternion.copy(unlean);
      if (car.centers[j].z > 0) wheel.quaternion.multiply(steer);
      spins[j] += moved / car.radii[j];
      wheel.spin = spins[j];
    });
    recording.push(frame);
  });
  recording.lapStarts.push(0);
  recording.lapTimes.push(data.duration);
  return recording;
}

const lineWidth = 1.4;
const lineLift = 0.02;

/** Unlit additive glow: a bright core fading into a soft halo, painted along the driven lane. */
function createLineMaterial(color: THREE.ColorRepresentation) {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        color: { value: new THREE.Color(color) },
        halfWidth: { value: lineWidth / 2 },
      },
    ]),
    vertexShader: `
      #include <fog_pars_vertex>
      attribute float lateral;
      uniform float halfWidth;
      varying float vAcross;
      void main() {
        vAcross = lateral / halfWidth;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      #include <fog_pars_fragment>
      uniform vec3 color;
      varying float vAcross;
      void main() {
        float distance = min(abs(vAcross), 1.0);
        float core = 1.0 - smoothstep(0.05, 0.12, distance);
        float glow = core * 1.6 + pow(1.0 - distance, 3.0) * 0.7;
        #ifdef USE_FOG
          glow *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
        #endif
        gl_FragColor = vec4(mix(color, vec3(1.0), core * 0.5) * glow, 1.0);
      }
    `,
    fog: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

type Drape = (
  offset: number | ((fraction: number) => number),
  width: number,
  lift: number,
  material: THREE.Material,
  from: number,
  to: number,
  relativeLateral?: boolean,
) => THREE.Mesh;

/** The glowing line covering the stretch of road the real driver recorded. */
export function createRealDriverLine(
  drape: Drape,
  definition: CourseDefinition,
  data: TrimmedRealDriver,
) {
  return createRacingLineDisplay(
    drape,
    realDriverPath(definition, data.reverse),
    0x2f8bff,
    Math.min(data.gates.start, data.gates.finish),
    Math.max(data.gates.start, data.gates.finish),
  );
}

/** Reuses the ghost's terrain-draped, unlit glow for a HUD driving aid. */
export function createRacingLineDisplay(
  drape: Drape,
  path: ReturnType<typeof racingLinePath>,
  color: THREE.ColorRepresentation,
  from = 0,
  to = 1,
) {
  const material = createLineMaterial(color);
  const mesh = drape(path.offsetAt, lineWidth, lineLift, material, from, to, true);
  mesh.name = 'real-driver-line';
  mesh.receiveShadow = false;
  mesh.renderOrder = 5;
  mesh.visible = false;
  return Object.assign(mesh, { material });
}
