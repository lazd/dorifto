import * as THREE from 'three';
import type { CourseDefinition } from './courses';

/** Physics steps between recorded samples (120 Hz physics → 30 Hz samples). */
export const sampleSteps = 4;

export interface ReplayTireState { slip: number; speed: number; load: number }

export interface ReplayFrame {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  /** Hub poses in chassis space plus cumulative wheel spin. Order matches `car.wheels`. */
  wheels: { position: THREE.Vector3; quaternion: THREE.Quaternion; spin: number }[];
  rpm: number;
  gear: number;
  throttle: number;
  load: number;
  boost: number;
  steering: number;
  braking: boolean;
  reversing: boolean;
  shifting: boolean;
  limiterCut: boolean;
  handbrake: boolean;
  highBeams: boolean;
  /** Null in older recordings: use the current time-of-day headlight setting. */
  headlights: boolean | null;
  fogLights: boolean;
  leftSignal: boolean;
  rightSignal: boolean;
  burnout: boolean;
  contacts: boolean[];
  tires: ReplayTireState[];
}

export function createReplayFrame(): ReplayFrame {
  return {
    position: new THREE.Vector3(), quaternion: new THREE.Quaternion(),
    wheels: Array.from({ length: 4 }, () => ({ position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), spin: 0 })),
    rpm: 0, gear: 1, throttle: 0, load: 0, boost: 0, steering: 0,
    braking: false, reversing: false, shifting: false, limiterCut: false, handbrake: false,
    highBeams: false, headlights: null, fogLights: false, leftSignal: false, rightSignal: false, burnout: false,
    contacts: [false, false, false, false],
    tires: Array.from({ length: 4 }, () => ({ slip: 0, speed: 0, load: 0 })),
  };
}

type SlotType = 'f32' | 'i8' | 'i16' | 'u8' | 'u16';
const slots: { type: SlotType; scale: number }[] = [];
const slot = (count: number, type: SlotType, scale = 1) => {
  const index = slots.length;
  for (let i = 0; i < count; i++) slots.push({ type, scale });
  return index;
};
const POSITION = slot(3, 'f32');
const QUATERNION = slot(4, 'i16', 32767);
const WHEELS = slots.length;
for (let i = 0; i < 4; i++) {
  slot(3, 'i16', 1000);
  slot(4, 'i16', 32767);
  slot(1, 'f32');
}
const WHEEL_STRIDE = 8;
const RPM = slot(1, 'u16');
const GEAR = slot(1, 'i8');
const THROTTLE = slot(1, 'u8', 255);
const LOAD = slot(1, 'u8', 255);
const BOOST = slot(1, 'u8', 255);
const FLAGS = slot(1, 'u16');
const STEERING = slot(1, 'i16', 20000);
const TIRES = slot(12, 'u8');
const tireScales = [255, 5, 100];
for (let i = 0; i < 12; i++) slots[TIRES + i].scale = tireScales[i % 3];
export const frameStride = slots.length;
const byteSizes: Record<SlotType, number> = { f32: 4, i8: 1, i16: 2, u8: 1, u16: 2 };
const frameBytes = slots.reduce((sum, { type }) => sum + byteSizes[type], 0);

const Flag = {
  Braking: 1, Reversing: 2, Shifting: 4, Limiter: 8, Handbrake: 16, Burnout: 32,
  Contact: 64, HighBeams: 1024, FogLights: 2048, LeftSignal: 4096, RightSignal: 8192,
  HeadlightsOn: 16384, HeadlightsSet: 32768,
} as const;

function writeFrame(target: Float32Array, offset: number, frame: ReplayFrame) {
  frame.position.toArray(target, offset + POSITION);
  frame.quaternion.toArray(target, offset + QUATERNION);
  frame.wheels.forEach((wheel, i) => {
    const base = offset + WHEELS + i * WHEEL_STRIDE;
    wheel.position.toArray(target, base);
    wheel.quaternion.toArray(target, base + 3);
    target[base + 7] = wheel.spin;
  });
  target[offset + RPM] = frame.rpm;
  target[offset + GEAR] = frame.gear;
  target[offset + THROTTLE] = frame.throttle;
  target[offset + LOAD] = frame.load;
  target[offset + BOOST] = frame.boost;
  target[offset + STEERING] = frame.steering;
  let flags = (frame.braking ? Flag.Braking : 0) | (frame.reversing ? Flag.Reversing : 0)
    | (frame.shifting ? Flag.Shifting : 0) | (frame.limiterCut ? Flag.Limiter : 0)
    | (frame.handbrake ? Flag.Handbrake : 0) | (frame.burnout ? Flag.Burnout : 0)
    | (frame.highBeams ? Flag.HighBeams : 0) | (frame.fogLights ? Flag.FogLights : 0)
    | (frame.leftSignal ? Flag.LeftSignal : 0) | (frame.rightSignal ? Flag.RightSignal : 0)
    | (frame.headlights === null ? 0 : Flag.HeadlightsSet)
    | (frame.headlights ? Flag.HeadlightsOn : 0);
  frame.contacts.forEach((contact, i) => { if (contact) flags |= Flag.Contact << i; });
  target[offset + FLAGS] = flags;
  frame.tires.forEach((tire, i) => {
    target[offset + TIRES + i * 3] = Math.min(Math.max(tire.slip, 0), 1);
    target[offset + TIRES + i * 3 + 1] = Math.min(Math.max(tire.speed, 0), 51);
    target[offset + TIRES + i * 3 + 2] = Math.min(Math.max(tire.load, 0), 2.55);
  });
}

const quaternionA = new THREE.Quaternion();
const quaternionB = new THREE.Quaternion();

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t;
  return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - p0 - 3 * p2 + p3) * t2 * t);
}

export interface RunSummary {
  id: string;
  createdAt: number;
  laps: number[];
  cones: number[];
  duration: number;
}

/** A continuous run from launch. Times are seconds from the first recorded sample. */
export class RunRecording {
  data: Float32Array;
  count = 0;
  /** Start/finish crossing times; index 0 is the first crossing. Empty until the car reaches the line. */
  readonly lapStarts: number[] = [];
  readonly lapTimes: number[] = [];
  readonly lapCones: number[] = [];

  constructor(
    public firstTime = 0,
    public readonly interval = sampleSteps / 120,
    data?: Float32Array,
    count = 0,
  ) {
    this.data = data ?? new Float32Array(frameStride * 1024);
    this.count = count;
  }

  get duration() {
    return this.count ? this.firstTime + (this.count - 1) * this.interval : 0;
  }

  push(frame: ReplayFrame) {
    if ((this.count + 1) * frameStride > this.data.length) {
      const grown = new Float32Array(this.data.length * 2);
      grown.set(this.data);
      this.data = grown;
    }
    writeFrame(this.data, this.count * frameStride, frame);
    this.count++;
  }

  /** Whether the car has crossed the start/finish line, i.e. the run is a real lap attempt. */
  get started() {
    return this.lapStarts.length > 0;
  }

  completeLap(start: number, time: number, cones: number) {
    this.lapStarts.push(start);
    this.lapTimes.push(time);
    this.lapCones.push(cones);
  }

  /** Index of the fastest completed lap, or null. */
  get bestLap() {
    let best: number | null = null;
    this.lapTimes.forEach((time, i) => { if (best === null || time < this.lapTimes[best]) best = i; });
    return best;
  }

  replayLapAt(t: number) {
    const { lap } = this.timingAt(t);
    const index = lap - 1;
    const time = this.lapTimes[index] ?? null;
    return {
      lap, time,
      fastest: time !== null && this.bestLap !== null && time === this.lapTimes[this.bestLap],
      previous: index > 0 ? this.lapStarts[index - 1] : null,
      next: this.lapStarts[index + 1] ?? null,
    };
  }

  /** Copy only one completed lap, keeping neighboring samples for interpolation at the line. */
  extractLap(index: number) {
    const time = this.lapTimes[index];
    const start = this.lapStarts[index];
    if (time === undefined || start === undefined || !this.count)
      throw new Error('Completed lap not found');
    const first = Math.max(0, Math.floor((start - this.firstTime) / this.interval) - 1);
    const end = Math.min(this.count, Math.ceil((start + time - this.firstTime) / this.interval) + 2);
    const lap = new RunRecording(
      this.firstTime + first * this.interval - start,
      this.interval, this.data.slice(first * frameStride, end * frameStride), end - first,
    );
    lap.lapStarts.push(0);
    lap.completeLap(time, time, this.lapCones[index]);
    return lap;
  }

  /** Lap timing as the HUD would have shown it at time `t`. */
  timingAt(t: number) {
    let lap = 0;
    while (lap < this.lapStarts.length && this.lapStarts[lap] <= t) lap++;
    const completed = this.lapTimes.slice(0, Math.max(lap - 1, 0));
    return {
      lap,
      current: lap ? t - this.lapStarts[lap - 1] : 0,
      last: completed.length ? completed[completed.length - 1] : null,
      best: completed.length ? Math.min(...completed) : null,
      lastCones: completed.length ? this.lapCones[completed.length - 1] : null,
    };
  }

  /** Interpolated frame at time `t` (clamped to the recording). Returns false when empty. */
  read(t: number, out: ReplayFrame) {
    if (!this.count) return false;
    const position = Math.min(Math.max((t - this.firstTime) / this.interval, 0), this.count - 1);
    const i1 = Math.min(Math.floor(position), this.count - 1);
    const i2 = Math.min(i1 + 1, this.count - 1);
    const i0 = Math.max(i1 - 1, 0);
    const i3 = Math.min(i2 + 1, this.count - 1);
    const alpha = position - i1;
    const d = this.data;
    const [o0, o1, o2, o3] = [i0, i1, i2, i3].map((i) => i * frameStride);
    const lerp = (slotIndex: number) => d[o1 + slotIndex] + (d[o2 + slotIndex] - d[o1 + slotIndex]) * alpha;
    const spline = (slotIndex: number) => catmullRom(d[o0 + slotIndex], d[o1 + slotIndex], d[o2 + slotIndex], d[o3 + slotIndex], alpha);
    const slerp = (slotIndex: number, target: THREE.Quaternion) => {
      quaternionA.fromArray(d, o1 + slotIndex).normalize();
      quaternionB.fromArray(d, o2 + slotIndex).normalize();
      target.slerpQuaternions(quaternionA, quaternionB, alpha);
    };
    out.position.set(spline(POSITION), spline(POSITION + 1), spline(POSITION + 2));
    slerp(QUATERNION, out.quaternion);
    out.wheels.forEach((wheel, i) => {
      const base = WHEELS + i * WHEEL_STRIDE;
      wheel.position.set(lerp(base), lerp(base + 1), lerp(base + 2));
      slerp(base + 3, wheel.quaternion);
      wheel.spin = lerp(base + 7);
    });
    out.rpm = lerp(RPM);
    out.throttle = lerp(THROTTLE);
    out.load = lerp(LOAD);
    out.boost = lerp(BOOST);
    out.steering = lerp(STEERING);
    const nearest = alpha < 0.5 ? o1 : o2;
    out.gear = d[nearest + GEAR];
    const flags = d[nearest + FLAGS];
    out.braking = (flags & Flag.Braking) !== 0;
    out.reversing = (flags & Flag.Reversing) !== 0;
    out.shifting = (flags & Flag.Shifting) !== 0;
    out.limiterCut = (flags & Flag.Limiter) !== 0;
    out.handbrake = (flags & Flag.Handbrake) !== 0;
    out.highBeams = (flags & Flag.HighBeams) !== 0;
    out.headlights = flags & Flag.HeadlightsSet ? (flags & Flag.HeadlightsOn) !== 0 : null;
    out.fogLights = (flags & Flag.FogLights) !== 0;
    out.leftSignal = (flags & Flag.LeftSignal) !== 0;
    out.rightSignal = (flags & Flag.RightSignal) !== 0;
    out.burnout = (flags & Flag.Burnout) !== 0;
    out.contacts.forEach((_, i) => { out.contacts[i] = (flags & (Flag.Contact << i)) !== 0; });
    out.tires.forEach((tire, i) => {
      tire.slip = lerp(TIRES + i * 3);
      tire.speed = lerp(TIRES + i * 3 + 1);
      tire.load = lerp(TIRES + i * 3 + 2);
    });
    return true;
  }
}

const chassisInverse = new THREE.Quaternion();
const localOffset = new THREE.Vector3();

/** Store the car's current visual pose (world-space objects) into `frame`. */
export function captureCarPose(
  frame: ReplayFrame,
  chassis: THREE.Object3D,
  hubs: readonly THREE.Object3D[],
  spins: readonly number[],
) {
  frame.position.copy(chassis.position);
  frame.quaternion.copy(chassis.quaternion);
  chassisInverse.copy(chassis.quaternion).invert();
  hubs.forEach((hub, i) => {
    const wheel = frame.wheels[i];
    wheel.position.copy(localOffset.subVectors(hub.position, chassis.position).applyQuaternion(chassisInverse));
    wheel.quaternion.copy(chassisInverse).multiply(hub.quaternion);
    wheel.spin = spins[i];
  });
}

// Rolling axis of the wheel groups (the model's lateral axis), signed so tire angles roll forward.
const spinAxis = new THREE.Vector3(1, 0, 0);
const spinRotation = new THREE.Quaternion();

/** Pose a car (or ghost) from a frame. Hubs are optional; wheels include spin. */
export function applyCarPose(
  frame: ReplayFrame,
  chassis: THREE.Object3D,
  wheels: readonly THREE.Object3D[],
  hubs?: readonly THREE.Object3D[],
) {
  chassis.position.copy(frame.position);
  chassis.quaternion.copy(frame.quaternion);
  frame.wheels.forEach((pose, i) => {
    const wheel = wheels[i];
    wheel.position.copy(pose.position).applyQuaternion(frame.quaternion).add(frame.position);
    wheel.quaternion.copy(frame.quaternion).multiply(pose.quaternion);
    if (hubs) {
      hubs[i].position.copy(wheel.position);
      hubs[i].quaternion.copy(wheel.quaternion);
    }
    wheel.quaternion.multiply(spinRotation.setFromAxisAngle(spinAxis, pose.spin));
  });
}

// ---- Persistence -----------------------------------------------------------

const storagePrefix = 'dorifto.laps.v1';
const recordPrefix = 'dorifto.record.v1';

interface StoredRecord {
  time: number;
  cones: number;
  firstTime: number;
  interval: number;
  frames: string;
}

function readRecord(key: string, storage: Storage): StoredRecord | null {
  const text = storage.getItem(`${recordPrefix}:${key}`);
  if (text === null) return null;
  const record: StoredRecord = JSON.parse(text);
  if (!record || !Number.isFinite(record.time) || record.time <= 0
    || !Number.isFinite(record.firstTime) || !Number.isFinite(record.interval) || record.interval <= 0
    || !Number.isInteger(record.cones) || record.cones < 0 || typeof record.frames !== 'string')
    throw new Error('Corrupt record lap');
  return record;
}

export async function loadRecordLap(key: string, storage: Storage = localStorage) {
  const stored = readRecord(key, storage);
  if (!stored) return null;
  const { data, count } = decodeFrames(await transform(fromBase64(stored.frames), new DecompressionStream('deflate')));
  if (!count) throw new Error('Empty record lap');
  const lap = new RunRecording(stored.firstTime, stored.interval, data, count);
  lap.lapStarts.push(0);
  lap.completeLap(stored.time, stored.time, stored.cones);
  return lap;
}

/** Stored independently from saved runs; recheck after compression so a slower async save cannot win. */
export async function saveRecordLap(key: string, lap: RunRecording, storage: Storage = localStorage) {
  const time = lap.lapTimes[0];
  if (!lap.count || !Number.isFinite(time) || time <= 0) throw new Error('Invalid record lap');
  const previous = readRecord(key, storage);
  if (previous && previous.time <= time) return false;
  const frames = toBase64(await transform(encodeFrames(lap), new CompressionStream('deflate')));
  const latest = readRecord(key, storage);
  if (latest && latest.time <= time) return false;
  const record: StoredRecord = {
    time, cones: lap.lapCones[0], firstTime: lap.firstTime, interval: lap.interval, frames,
  };
  storage.setItem(`${recordPrefix}:${key}`, JSON.stringify(record));
  return true;
}

function hashString(text: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** Identifies a course layout and direction, including generated courses. */
export function replayStorageKey(definition: CourseDefinition) {
  const shape = hashString(JSON.stringify([definition.points, definition.elevation ?? null, definition.width]));
  return `${definition.id}:${shape}:${definition.reverse ? 'reverse' : 'forward'}`;
}

export function encodeFrames(recording: RunRecording) {
  const bytes = new Uint8Array(recording.count * frameBytes);
  const view = new DataView(bytes.buffer);
  let offset = 0;
  for (let i = 0; i < recording.count; i++) {
    const base = i * frameStride;
    for (let s = 0; s < frameStride; s++) {
      const { type, scale } = slots[s];
      const value = recording.data[base + s] * scale;
      switch (type) {
        case 'f32': view.setFloat32(offset, value, true); break;
        case 'i8': view.setInt8(offset, Math.max(-128, Math.min(127, Math.round(value)))); break;
        case 'u8': view.setUint8(offset, Math.max(0, Math.min(255, Math.round(value)))); break;
        case 'i16': view.setInt16(offset, Math.max(-32768, Math.min(32767, Math.round(value))), true); break;
        case 'u16': view.setUint16(offset, Math.max(0, Math.min(65535, Math.round(value))), true); break;
      }
      offset += byteSizes[type];
    }
  }
  return bytes;
}

export function decodeFrames(bytes: Uint8Array) {
  if (bytes.byteLength % frameBytes) throw new Error('Corrupt lap recording');
  const count = bytes.byteLength / frameBytes;
  const data = new Float32Array(Math.max(count, 1) * frameStride);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  for (let i = 0; i < count; i++) {
    const base = i * frameStride;
    for (let s = 0; s < frameStride; s++) {
      const { type, scale } = slots[s];
      let value: number;
      switch (type) {
        case 'f32': value = view.getFloat32(offset, true); break;
        case 'i8': value = view.getInt8(offset); break;
        case 'u8': value = view.getUint8(offset); break;
        case 'i16': value = view.getInt16(offset, true); break;
        case 'u16': value = view.getUint16(offset, true); break;
      }
      data[base + s] = value / scale;
      offset += byteSizes[type];
    }
  }
  return { data, count };
}

async function transform(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const response = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await response.arrayBuffer());
}

function toBase64(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function fromBase64(text: string) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

interface StoredRun extends RunSummary {
  firstTime: number;
  interval: number;
  lapStarts: number[];
}

function readIndex(storage: Storage, key: string): StoredRun[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(`${storagePrefix}:${key}`) ?? '[]');
    return Array.isArray(parsed) ? parsed as StoredRun[] : [];
  } catch {
    return [];
  }
}

export function listSavedRuns(key: string, storage: Storage = localStorage): RunSummary[] {
  return readIndex(storage, key).map(({ id, createdAt, laps, cones, duration }) => ({ id, createdAt, laps, cones, duration }));
}

export async function saveRun(key: string, recording: RunRecording, storage: Storage = localStorage): Promise<RunSummary> {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const run: StoredRun = {
    id, createdAt: Date.now(), laps: [...recording.lapTimes], cones: [...recording.lapCones],
    duration: recording.duration, firstTime: recording.firstTime, interval: recording.interval,
    lapStarts: [...recording.lapStarts],
  };
  const payload = toBase64(await transform(encodeFrames(recording), new CompressionStream('deflate')));
  const dataKey = `${storagePrefix}:${key}:${id}`;
  storage.setItem(dataKey, payload);
  try {
    storage.setItem(`${storagePrefix}:${key}`, JSON.stringify([...readIndex(storage, key), run]));
  } catch (error) {
    storage.removeItem(dataKey);
    throw error;
  }
  return { id, createdAt: run.createdAt, laps: run.laps, cones: run.cones, duration: run.duration };
}

export async function loadRun(key: string, id: string, storage: Storage = localStorage) {
  const run = readIndex(storage, key).find((run) => run.id === id);
  const payload = storage.getItem(`${storagePrefix}:${key}:${id}`);
  if (!run || payload === null) throw new Error('Saved laps not found');
  const { data, count } = decodeFrames(await transform(fromBase64(payload), new DecompressionStream('deflate')));
  const recording = new RunRecording(run.firstTime, run.interval, data, count);
  recording.lapStarts.splice(0, recording.lapStarts.length, ...run.lapStarts);
  recording.lapTimes.push(...run.laps);
  recording.lapCones.push(...run.cones);
  return recording;
}

export function deleteRun(key: string, id: string, storage: Storage = localStorage) {
  storage.removeItem(`${storagePrefix}:${key}:${id}`);
  storage.setItem(`${storagePrefix}:${key}`, JSON.stringify(readIndex(storage, key).filter((run) => run.id !== id)));
}
