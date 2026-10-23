import type { CourseDefinition, courseSpawn } from './courses';
import type * as THREE from 'three';
import type { DrivetrainState } from './drivetrain';
import type { LapTimer } from './laps';
import { frameStride, type RunRecording, type ReplayTireState } from './lap-recording';
import type { TerrainQueryData } from './terrain-query';
import type { PhysicsCar, PhysicsConfiguration, PhysicsControls } from './vehicle-physics';
import type { RaceBotOptions, VehicleState, createRaceBot } from './race-bot';

export const physicsStep = 1 / 120;
export const poseStride = 7;
export const vehiclePoseCount = 9;
export const snapshotStride = 1 + poseStride * 2;

export interface PoseData {
  position: [number, number, number];
  quaternion: [number, number, number, number];
}

export interface PhysicsInit {
  botsOnly?: boolean;
  bots?: RaceBotOptions[];
  definition: CourseDefinition;
  terrain: TerrainQueryData;
  car: {
    centers: [number, number, number][];
    radii: number[];
    widths: number[];
    collisionVertices: [number, number, number][];
  };
  cones: PoseData[];
  cornerCones: number[];
  signGroups: { visible: boolean; poses: PoseData[] }[];
  configuration: PhysicsConfiguration;
}

export function createPhysicsInit(
  definition: CourseDefinition,
  car: Pick<PhysicsCar, 'centers' | 'radii' | 'widths' | 'collisionVertices'>,
  course: {
    cones: THREE.Object3D[];
    cornerCones: THREE.Object3D[];
    turnSignGroups: THREE.Group[];
    terrain: { physicsData(): TerrainQueryData };
  },
  configuration: PhysicsConfiguration,
  bots: RaceBotOptions[] = [],
  botsOnly = false,
): PhysicsInit {
  const pose = (object: { position: THREE.Vector3; quaternion: THREE.Quaternion }): PoseData => ({
    position: object.position.toArray(),
    quaternion: object.quaternion.toArray(),
  });
  return {
    bots,
    botsOnly,
    definition,
    terrain: course.terrain.physicsData(),
    car: {
      centers: car.centers.map((center) => center.toArray()),
      radii: car.radii,
      widths: car.widths,
      collisionVertices: car.collisionVertices.map((point) => point.toArray()),
    },
    cones: course.cones.map(pose),
    cornerCones: course.cornerCones.map((cone) => course.cones.indexOf(cone)),
    signGroups: course.turnSignGroups.map((group) => ({
      visible: group.visible,
      poses: group.children.map(pose),
    })),
    configuration,
  };
}

export type LapState = Pick<
  LapTimer,
  | 'lap'
  | 'invalid'
  | 'current'
  | 'last'
  | 'best'
  | 'lastCones'
  | 'elapsedTime'
  | 'lapStartedAt'
  | 'conesHit'
>;

export function emptyLapState(): LapState {
  return {
    lap: 0,
    invalid: false,
    current: 0,
    last: null,
    best: null,
    lastCones: null,
    elapsedTime: 0,
    lapStartedAt: 0,
    conesHit: 0,
  };
}

export interface PhysicsInput {
  controls: PhysicsControls;
  configuration: PhysicsConfiguration;
  signs: boolean[];
  lights: {
    highBeams: boolean;
    headlights: boolean | null;
    fogLights: boolean;
    leftSignal: boolean;
    rightSignal: boolean;
  };
}

export interface PhysicsTelemetry {
  motion: VehicleState;
  tires: {
    slipAngle: number;
    slipRatio: number;
    load: number;
    capacity: number;
    longitudinalForce: number;
    lateralForce: number;
  }[];
  engine: DrivetrainState;
  steering: number;
  burnout: number;
  brakestand: boolean;
  reversing: boolean;
  spawnBrakeHeld: boolean;
  braking: boolean;
  hazards: boolean;
  hazardsEnabled: boolean;
  wheelContacts: boolean[];
  tireSounds: ReplayTireState[];
  velocity: [number, number, number];
  previousVelocity: [number, number, number];
}

export interface PhysicsRecord {
  laps: LapState;
  sample?: Float32Array;
}

export interface ReplayData {
  data: Float32Array;
  count: number;
  firstTime: number;
  interval: number;
}

export function replayData(recording: RunRecording): ReplayData {
  return {
    data: recording.data.slice(0, recording.count * frameStride),
    count: recording.count,
    firstTime: recording.firstTime,
    interval: recording.interval,
  };
}

export type PhysicsCommand =
  | { type: 'init'; data: PhysicsInit }
  | { type: 'advance'; dt: number; input: PhysicsInput; recycled: ArrayBuffer[] }
  | { type: 'reset'; input: PhysicsInput }
  | {
      type: 'direction';
      spawn: ReturnType<typeof courseSpawn>;
      definition: CourseDefinition;
      input: PhysicsInput;
    }
  | { type: 'replay'; recording: ReplayData; time: number; input: PhysicsInput }
  | { type: 'snap'; input: PhysicsInput };

export type PhysicsRequest = PhysicsCommand & { revision: number };

export interface PhysicsSnapshot {
  type: 'snapshot';
  revision: number;
  buffer: ArrayBuffer;
  count: number;
  alpha: number;
  duration: number;
  replayTime: number | null;
  telemetry: PhysicsTelemetry;
  laps: LapState;
  bots: {
    laps: LapState;
    metrics: ReturnType<typeof createRaceBot>['metrics'];
    engine: DrivetrainState;
    tireSounds: ReplayTireState[];
    wheelContacts: boolean[];
    burnout: number;
    braking: boolean;
    steering: number;
    reversing: boolean;
    spawnBrakeHeld: boolean;
    brakestand: boolean;
    velocity: [number, number, number];
    previousVelocity: [number, number, number];
  }[];
  records: PhysicsRecord[];
  impacts: { type: 'cone' | 'sign'; impulse: number }[];
}

export type PhysicsResponse =
  | PhysicsSnapshot
  | { type: 'error'; revision: number; message: string; stack?: string };
