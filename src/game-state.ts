import { idleRpm } from './drivetrain';
import { createStore } from './store';

export interface SavedRunOption { id: string; label: string }

export interface GameState {
  /** off: nothing to show; ready: saved laps can be replayed; recording: run in progress; replay: watching. */
  lapRecorder: Readonly<{
    mode: 'off' | 'ready' | 'recording' | 'replay';
    runs: readonly SavedRunOption[];
    selectedRun: string | null;
    replayLap: Readonly<{ lap: number; time: number | null; fastest: boolean; previous: number | null; next: number | null }> | null;
  }>;
  focused: boolean;
  controllerStatus: string;
  sound: Readonly<{ running: boolean; failed: boolean; error: string | null }>;
  status: Readonly<{ message: string; error: boolean; visible: boolean; fatal?: boolean }>;
  telemetry: Readonly<{
    speed: number; rpm: number; gear: number; limiter: boolean;
    lap: number; current: number; last: number | null; best: number | null;
    cones: number; lastCones: number | null;
    driving: 'brakes-held' | 'handbrake' | 'brakestand' | 'reverse' | 'braking' | 'burnout' | 'sliding' | 'driving';
  }>;
}

export function createGameState() {
  return createStore<GameState>({
    lapRecorder: { mode: 'off', runs: [], selectedRun: null, replayLap: null },
    focused: true, controllerStatus: '',
    sound: { running: false, failed: false, error: null },
    status: { message: 'Loading car and physics...', error: false, visible: true },
    telemetry: {
      speed: 0, rpm: idleRpm, gear: 1, limiter: false,
      lap: 0, current: 0, last: null, best: null, cones: 0, lastCones: null, driving: 'brakes-held',
    },
  });
}
