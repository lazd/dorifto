export const raceModes = {
  'track-limits': {
    name: 'Track Limits',
    description: 'Your lap is invalid if all 4 tires go beyond the white lines.',
  },
  mustard: {
    name: "Don't Cross the Mustard",
    description: 'Keep it between the mustard and the mayo or your lap is invalid.',
  },
  'anything-goes': {
    name: 'Anything Goes',
    description: "As long as you cross the finish line, it's a win.",
  },
} as const;

export type RaceMode = keyof typeof raceModes;
export interface RaceOptions {
  mode: RaceMode;
  laps: number;
}
export const defaultRaceOptions: RaceOptions = { mode: 'track-limits', laps: 3 };

export function isRaceMode(value: string): value is RaceMode {
  return Object.hasOwn(raceModes, value);
}

export interface LapValidity {
  trackLimits: boolean;
  mayoTouched?: boolean;
  mustard: boolean | null;
  mustardTouched?: boolean;
  mustardCrossed?: boolean;
}

export interface LapAttempt extends LapValidity {
  time: number;
  cones: number;
  valid: boolean;
}

export function validForMode(validity: LapValidity, mode: RaceMode) {
  return (
    mode === 'anything-goes' ||
    (mode === 'mustard' ? validity.mustard === true : validity.trackLimits)
  );
}

export function recordStorageKey(key: string, mode: RaceMode) {
  return mode === 'track-limits' ? key : `${key}:${mode}`;
}
