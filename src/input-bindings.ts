export const keyboardActions = [
  { id: 'steerLeft', label: 'Steer left', group: 'driving', defaultCode: 'ArrowLeft' },
  { id: 'steerRight', label: 'Steer right', group: 'driving', defaultCode: 'ArrowRight' },
  { id: 'accelerate', label: 'Accelerate', group: 'driving', defaultCode: 'KeyZ' },
  { id: 'brake', label: 'Brake / Reverse', group: 'driving', defaultCode: 'KeyX' },
  { id: 'handbrake', label: 'Handbrake', group: 'driving', defaultCode: 'Space' },
  { id: 'reset', label: 'Reset car & run', group: 'driving', defaultCode: 'KeyR' },
  { id: 'camera', label: 'Cycle camera', group: 'shortcuts', defaultCode: 'KeyV' },
  { id: 'map', label: 'Toggle map', group: 'shortcuts', defaultCode: 'KeyM' },
  { id: 'driveMode', label: 'Switch Grip / Drift', group: 'shortcuts', defaultCode: 'KeyD' },
  { id: 'hud', label: 'Cycle HUD visibility', group: 'shortcuts', defaultCode: 'KeyU' },
  { id: 'timeOfDay', label: 'Cycle time of day', group: 'shortcuts', defaultCode: 'KeyW' },
  { id: 'stereo', label: 'Cycle stereo station', group: 'shortcuts', defaultCode: 'KeyS' },
  { id: 'headlights', label: 'Headlights', group: 'shortcuts', defaultCode: 'KeyH' },
  { id: 'highBeams', label: 'Flash high beams', group: 'shortcuts', defaultCode: 'KeyF' },
  { id: 'mapZoomIn', label: 'Map zoom in', group: 'shortcuts', defaultCode: 'ArrowUp' },
  { id: 'mapZoomOut', label: 'Map zoom out', group: 'shortcuts', defaultCode: 'ArrowDown' },
] as const;

export type KeyboardAction = (typeof keyboardActions)[number]['id'];
export type KeyboardGroup = (typeof keyboardActions)[number]['group'];

export const controllerActions = [
  { id: 'accelerate', label: 'Accelerate', defaultButton: 7 },
  { id: 'brake', label: 'Brake / Reverse', defaultButton: 6 },
  { id: 'handbrake', label: 'Handbrake', defaultButton: 5 },
  { id: 'clutch', label: 'Clutch kick', defaultButton: 0 },
  { id: 'highBeams', label: 'High beams', defaultButton: 4 },
  { id: 'headlights', label: 'Headlights', defaultButton: 2 },
  { id: 'driveMode', label: 'Switch Grip / Drift', defaultButton: 3 },
  { id: 'map', label: 'Toggle map / Return to driving', defaultButton: 1 },
  { id: 'reset', label: 'Reset car & run', defaultButton: 9 },
  { id: 'camera', label: 'Cycle camera', defaultButton: 8 },
  { id: 'timeOfDay', label: 'Cycle time of day', defaultButton: 13 },
  { id: 'record', label: 'Record lap', defaultButton: 12 },
  { id: 'previousLap', label: 'Previous lap / station', defaultButton: 14 },
  { id: 'nextLap', label: 'Next lap / station', defaultButton: 15 },
  { id: 'lookBehind', label: 'Look behind', defaultButton: 11 },
] as const;

export type ControllerAction = (typeof controllerActions)[number]['id'];

export const axisOptions = [
  { index: 0, label: 'Left stick · Horizontal' },
  { index: 1, label: 'Left stick · Vertical' },
  { index: 2, label: 'Right stick · Horizontal' },
  { index: 3, label: 'Right stick · Vertical' },
] as const;

export type AxisAction = 'steering' | 'cameraX' | 'cameraY' | 'mapZoom' | 'mapPanX' | 'mapPanY';

export interface AxisBinding {
  index: number;
  inverted: boolean;
}

export interface InputBindings {
  keyboard: Record<KeyboardAction, string>;
  controller: {
    buttons: Record<ControllerAction, number>;
    axes: Record<AxisAction, AxisBinding>;
  };
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const inputBindingsStorageKey = 'dorifto.input-bindings.v1';

export function defaultInputBindings(): InputBindings {
  return {
    keyboard: Object.fromEntries(
      keyboardActions.map(({ id, defaultCode }) => [id, defaultCode]),
    ) as Record<KeyboardAction, string>,
    controller: {
      buttons: Object.fromEntries(
        controllerActions.map(({ id, defaultButton }) => [id, defaultButton]),
      ) as Record<ControllerAction, number>,
      axes: {
        steering: { index: 0, inverted: true },
        cameraX: { index: 2, inverted: false },
        cameraY: { index: 3, inverted: false },
        mapZoom: { index: 1, inverted: false },
        mapPanX: { index: 2, inverted: false },
        mapPanY: { index: 3, inverted: false },
      },
    },
  };
}

const keyboardCodePattern =
  /^(?:Key[A-Z]|Digit[0-9]|Numpad(?:[0-9]|Add|Subtract|Multiply|Divide|Decimal|Enter)|Arrow(?:Left|Right|Up|Down)|Space|Enter|Tab|Backspace|Delete|Insert|Home|End|PageUp|PageDown|Shift(?:Left|Right)|Control(?:Left|Right)|Alt(?:Left|Right)|Meta(?:Left|Right)|CapsLock|NumLock|ScrollLock|PrintScreen|Pause|Escape|F(?:[1-9]|1[0-2])|Backquote|Minus|Equal|Bracket(?:Left|Right)|Backslash|Semicolon|Quote|Comma|Period|Slash|Intl(?:Backslash|Ro)|ContextMenu)$/;

export function isKeyboardCode(value: unknown): value is string {
  return typeof value === 'string' && keyboardCodePattern.test(value) && value !== 'Escape';
}

export function validateInputBindings(value: unknown): InputBindings {
  if (!value || typeof value !== 'object') throw new Error('Bindings must be an object');
  const candidate = value as Partial<InputBindings>;
  if (!candidate.keyboard || !candidate.controller?.buttons || !candidate.controller?.axes)
    throw new Error('Bindings are missing required sections');

  const keyboard = {} as InputBindings['keyboard'];
  const seenKeys = new Set<string>();
  for (const { id } of keyboardActions) {
    const code = candidate.keyboard[id];
    if (!isKeyboardCode(code)) throw new Error(`Invalid keyboard binding for ${id}`);
    if (seenKeys.has(code)) throw new Error(`Duplicate keyboard binding: ${code}`);
    seenKeys.add(code);
    keyboard[id] = code;
  }

  const buttons = {} as InputBindings['controller']['buttons'];
  const seenButtons = new Set<number>();
  for (const { id } of controllerActions) {
    const button = candidate.controller.buttons[id];
    if (!Number.isInteger(button) || button < 0 || button > 15)
      throw new Error(`Invalid controller button for ${id}`);
    if (seenButtons.has(button)) throw new Error(`Duplicate controller button: ${button}`);
    seenButtons.add(button);
    buttons[id] = button;
  }

  const axes = {} as InputBindings['controller']['axes'];
  for (const axis of Object.keys(defaultInputBindings().controller.axes) as AxisAction[]) {
    const binding = candidate.controller.axes[axis];
    if (
      !binding ||
      !Number.isInteger(binding.index) ||
      binding.index < 0 ||
      binding.index > 3 ||
      typeof binding.inverted !== 'boolean'
    )
      throw new Error(`Invalid controller axis for ${axis}`);
    axes[axis] = { index: binding.index, inverted: binding.inverted };
  }

  return { keyboard, controller: { buttons, axes } };
}

// Actions added since the bindings were saved get their defaults instead of failing validation.
function withNewDefaults(stored: Partial<InputBindings>) {
  const defaults = defaultInputBindings();
  return {
    ...stored,
    keyboard: stored.keyboard && { ...defaults.keyboard, ...stored.keyboard },
    controller: stored.controller && {
      ...stored.controller,
      buttons: stored.controller.buttons && {
        ...defaults.controller.buttons,
        ...stored.controller.buttons,
      },
    },
  };
}

export class InputBindingsStore {
  private bindings = defaultInputBindings();
  private captureActive = false;

  get(): InputBindings {
    return this.bindings;
  }

  isCaptureActive(): boolean {
    return this.captureActive;
  }

  setCaptureActive(active: boolean): void {
    this.captureActive = active;
  }

  load(storage: StorageLike | null, reportError: (error: Error) => void = () => {}): InputBindings {
    this.bindings = defaultInputBindings();
    if (!storage) {
      reportError(new Error('Browser storage is unavailable; using default controls.'));
      return this.bindings;
    }
    try {
      const stored = storage.getItem(inputBindingsStorageKey);
      if (stored) this.bindings = validateInputBindings(withNewDefaults(JSON.parse(stored)));
    } catch (error) {
      this.bindings = defaultInputBindings();
      reportError(
        new Error(
          `Unable to load saved controls: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
    return this.bindings;
  }

  save(
    value: InputBindings,
    storage: StorageLike | null,
    reportError: (error: Error) => void = () => {},
  ): boolean {
    try {
      const bindings = validateInputBindings(value);
      if (!storage) throw new Error('Browser storage is unavailable');
      storage.setItem(inputBindingsStorageKey, JSON.stringify(bindings));
      this.bindings = bindings;
      return true;
    } catch (error) {
      reportError(
        new Error(
          `Unable to save controls: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
      return false;
    }
  }
}

export const inputBindings = new InputBindingsStore();

export function keyboardActionForCode(code: string): KeyboardAction | undefined {
  return keyboardActions.find(({ id }) => inputBindings.get().keyboard[id] === code)?.id;
}

export function keyboardCodes(): Set<string> {
  return new Set(Object.values(inputBindings.get().keyboard));
}

export function formatKeyboardCode(code: string): string {
  if (code === 'Space') return 'Space';
  const arrowLabels: Record<string, string> = {
    ArrowLeft: '←',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowRight: '→',
  };
  if (arrowLabels[code]) return arrowLabels[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

export function formatControllerButton(button: number): string {
  return (
    ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'LS', 'RS', '↑', '↓', '←', '→'][
      button
    ] ?? `Button ${button + 1}`
  );
}
