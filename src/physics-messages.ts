import type { CourseDefinition, courseSpawn } from './courses';
import type * as THREE from 'three';
import type { DrivetrainState } from './drivetrain';
import type { LapTimer } from './laps';
import { frameStride, type RunRecording, type ReplayTireState } from './lap-recording';
import type { TerrainQueryData, TriangleMeshData } from './terrain-query';
import type { PhysicsCar, PhysicsConfiguration, PhysicsControls } from './vehicle-physics';
import type { Bot, RaceBotOptions, VehicleState } from './race-bot';
import type { RaceStanding } from './race-standings';
import type { RaceOptions } from './race-rules';

export const physicsStep = 1 / 120;
export const raceStartDelay = 3;
export const poseStride = 7;
export const vehiclePoseCount = 9;
export const snapshotStride = 1 + poseStride * 2;

export interface PoseData {
  position: [number, number, number];
  quaternion: [number, number, number, number];
}

export interface PhysicsInit {
  race?: RaceOptions;
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
  junctionCones?: number[];
  signGroups: { visible: boolean; poses: PoseData[] }[];
  configuration: PhysicsConfiguration;
}

export function createPhysicsInit(
  definition: CourseDefinition,
  car: Pick<PhysicsCar, 'centers' | 'radii' | 'widths' | 'collisionVertices'>,
  course: {
    cones: THREE.Object3D[];
    cornerCones: THREE.Object3D[];
    junctionCones?: THREE.Object3D[];
    scenery?: {
      collisionMesh?: TriangleMeshData;
      roadMesh?: TriangleMeshData;
      structureMesh?: TriangleMeshData;
    };
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
    terrain: {
      ...course.terrain.physicsData(),
      buildingMesh: course.scenery?.collisionMesh,
      nearbyRoadMesh: course.scenery?.roadMesh,
      nearbyStructureMesh: course.scenery?.structureMesh,
    },
    car: {
      centers: car.centers.map((center) => center.toArray()),
      radii: car.radii,
      widths: car.widths,
      collisionVertices: car.collisionVertices.map((point) => point.toArray()),
    },
    cones: course.cones.map(pose),
    cornerCones: course.cornerCones.map((cone) => course.cones.indexOf(cone)),
    junctionCones: course.junctionCones?.map((cone) => course.cones.indexOf(cone)),
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
  | 'finished'
  | 'retired'
  | 'invalid'
  | 'current'
  | 'last'
  | 'best'
  | 'lastCones'
  | 'elapsedTime'
  | 'lapStartedAt'
  | 'conesHit'
  | 'completed'
  | 'lastAttempt'
  | 'trackLimits'
  | 'mayoTouched'
  | 'mustard'
  | 'mustardTouched'
  | 'mustardCrossed'
>;

export function emptyLapState(): LapState {
  return {
    lap: 0,
    finished: false,
    retired: false,
    invalid: false,
    current: 0,
    last: null,
    best: null,
    lastCones: null,
    elapsedTime: 0,
    lapStartedAt: 0,
    conesHit: 0,
    completed: 0,
    lastAttempt: null,
    trackLimits: true,
    mayoTouched: false,
    mustard: null,
    mustardTouched: false,
    mustardCrossed: false,
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
  time?: number;
  elapsed?: number;
  active?: boolean;
  raceFinished?: boolean;
  field?: PhysicsRecord[];
  laps: LapState;
  sample?: Float32Array;
  speed?: number;
  driftTime?: number;
  conesHit?: number;
  carContacts?: number;
  timeInFirst?: number;
}

export interface ReplayData {
  field?: ReplayData[];
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
    ...(recording.field.length ? { field: recording.field.map(replayData) } : {}),
  };
}

export type PhysicsCommand =
  | { type: 'init'; data: PhysicsInit }
  | { type: 'advance'; dt: number; input: PhysicsInput; recycled: ArrayBuffer[] }
  | { type: 'reset'; input: PhysicsInput }
  | { type: 'retire'; input: PhysicsInput }
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
  standings?: RaceStanding[];
  bots: {
    laps: LapState;
    metrics: Bot['metrics'];
    thinking: Bot['thinking'];
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
  | { type: 'startup'; stage: string }
  | { type: 'error'; revision: number; message: string; stack?: string };
