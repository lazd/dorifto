import { idleRpm } from './drivetrain';
import { createStore } from './store';
import type { DriveMode } from './drive-modes';

export interface SavedRunOption {
  id: string;
  label: string;
}

export interface GameState {
  observedDriver: Readonly<{ driveMode: DriveMode; profile: string }> | null;
  /** off: nothing to show; ready: saved laps can be replayed; recording: run in progress; replay: watching. */
  lapRecorder: Readonly<{
    mode: 'off' | 'ready' | 'recording' | 'replay';
    runs: readonly SavedRunOption[];
    selectedRun: string | null;
    replayLap: Readonly<{
      lap: number;
      time: number | null;
      fastest: boolean;
      previous: number | null;
      next: number | null;
    }> | null;
  }>;
  focused: boolean;
  controllerStatus: string;
  sound: Readonly<{ running: boolean; failed: boolean; error: string | null }>;
  status: Readonly<{
    message: string;
    error: boolean;
    visible: boolean;
    fatal?: boolean;
    progress?: number;
  }>;
  telemetry: Readonly<{
    speed: number;
    rpm: number;
    gear: number;
    limiter: boolean;
    current: number;
    driving:
      | 'brakes-held'
      | 'handbrake'
      | 'brakestand'
      | 'reverse'
      | 'braking'
      | 'burnout'
      | 'sliding'
      | 'driving';
  }>;
  lapTelemetry: Readonly<{
    lap: number;
    finished: boolean;
    invalid: boolean;
    last: number | null;
    best: number | null;
    cones: number;
    lastCones: number | null;
  }>;
}

export function createGameState() {
  return createStore<GameState>({
    observedDriver: null,
    lapRecorder: { mode: 'off', runs: [], selectedRun: null, replayLap: null },
    focused: true,
    controllerStatus: '',
    sound: { running: false, failed: false, error: null },
    status: { message: 'Starting…', error: false, visible: true, progress: 0 },
    telemetry: {
      speed: 0,
      rpm: idleRpm,
      gear: 1,
      limiter: false,
      current: 0,
      driving: 'brakes-held',
    },
    lapTelemetry: {
      lap: 0,
      finished: false,
      invalid: false,
      last: null,
      best: null,
      cones: 0,
      lastCones: null,
    },
  });
}
