import { inputBindings, type AxisAction, type ControllerAction } from './input-bindings';
import type { DriveMode } from './drive-modes';

const STICK_DEADZONE = 0.0;
const TRIGGER_DEADZONE = 0.0;
const T300_DRIFT_STEERING_GAIN = 4;

export function isT300(pad: Gamepad): boolean {
  return /Thrustmaster FFB|\bt300(?:rs)?\b|044f.*b66[def]/i.test(pad.id ?? '');
}

const t300Buttons = [5, 4, 3, 2, 9, 8, -1, -1, 6, 7, 10, 11];
const t300PedalAxes = {
  compact: { accelerate: 1, brake: 2, clutch: 3 },
  sparse: { accelerate: 5, brake: 1, clutch: 6 },
};
const t300HatDirections = [
  [7, 0, 1],
  [3, 4, 5],
  [5, 6, 7],
  [1, 2, 3],
];

function t300Button(
  pad: Gamepad,
  index: number,
  needsInitialization: boolean,
): GamepadButton | undefined {
  if (needsInitialization && index >= 4 && index <= 7) return undefined;
  if (index < 12) return pad.buttons[t300Buttons[index]];
  let pressed = false;
  if (pad.axes.length === 6) {
    const horizontal = pad.axes[4];
    const vertical = pad.axes[5];
    pressed =
      [vertical < -0.5, vertical > 0.5, horizontal < -0.5, horizontal > 0.5][index - 12] ?? false;
  } else {
    const hat = pad.axes[pad.axes.length >= 10 ? 9 : 4];
    if (hat === undefined || hat < -1 || hat > 1) return undefined;
    const direction = Math.round(((hat + 1) * 7) / 2);
    pressed = t300HatDirections[index - 12]?.includes(direction) ?? false;
  }
  return { pressed, touched: pressed, value: Number(pressed) };
}

function t300Pedal(pad: Gamepad, index: number): number {
  return Math.max(0, Math.min(1, (1 - (pad.axes[index] ?? 1)) / 2));
}

type LightingRequest = 'press' | 'tap' | 'hold';

export function updateVehicleLights(
  state: { headlights: boolean; fogLights: boolean; headlightsAtPress: boolean },
  request: LightingRequest,
) {
  if (request === 'press')
    return { ...state, headlights: true, headlightsAtPress: state.headlights };
  if (request === 'hold') return { ...state, headlights: true, fogLights: !state.fogLights };
  return {
    ...state,
    headlights: !state.headlightsAtPress,
    fogLights: state.headlightsAtPress ? false : state.fogLights,
  };
}

export class DrivingControls {
  readonly keys = new Set<string>();
  steer = 0;
  throttle = 0;
  brake = 0;
  reverse = 0;
  handbrake = false;
  /** Held to disengage the clutch; releasing it at high revs kicks the rear loose. */
  clutch = false;
  shiftUp = false;
  shiftDown = false;
  highBeams = false;
  leftSignal = false;
  rightSignal = false;
  cameraX = 0;
  cameraY = 0;
  mapZoom = 0;
  lookBehind = false;
  mapView = false;
  resetRequested = false;
  cameraRequested = false;
  lightingRequested: LightingRequest | null = null;
  driveModeRequested = false;
  timeOfDayRequested = false;
  recordRequested = false;
  previousLapRequested = false;
  nextLapRequested = false;
  controllerStatus = '';
  private recordHeld = false;
  private previousLapHeld = false;
  private nextLapHeld = false;
  private resetHeld = false;
  private cameraHeld = false;
  private driveModeHeld = false;
  private timeOfDayHeld = false;
  private mapViewHeld = false;
  private highBeamPressedAt: number | null = null;
  private highBeamToggled = false;
  private highBeamsLatched = false;
  private headlightsPressedAt: number | null = null;
  private headlightsGamepadHeld = false;
  private lightingHoldTriggered = false;
  private signalHoldDirection = 0;
  private signalHeldAt = 0;
  private signalTriggered = false;
  private signalDirection = 0;
  private signalStartedAt = 0;
  private focused = document.hasFocus();

  private setCursorHidden(hidden: boolean) {
    document.documentElement.style.cursor = hidden ? 'none' : '';
    document.body.style.cursor = hidden ? 'none' : '';
  }

  constructor() {
    window.addEventListener('mousemove', () => this.setCursorHidden(false));
    window.addEventListener('mousedown', () => this.setCursorHidden(false));
    window.addEventListener('blur', () => {
      this.focused = false;
      this.clear();
    });
    window.addEventListener('focus', () => {
      this.focused = true;
    });
    document.addEventListener('visibilitychange', () => {
      this.focused = !document.hidden && document.hasFocus();
      this.clear();
    });
  }

  clear() {
    this.keys.clear();
    this.steer = this.throttle = this.brake = this.reverse = 0;
    this.cameraX = this.cameraY = 0;
    this.mapZoom = 0;
    this.handbrake = this.clutch = this.lookBehind = false;
    this.shiftUp = this.shiftDown = false;
    this.highBeams = false;
    this.highBeamPressedAt = null;
    this.highBeamToggled = this.highBeamsLatched = false;
    this.headlightsPressedAt = null;
    this.headlightsGamepadHeld = false;
    this.lightingHoldTriggered = false;
    this.lightingRequested = null;
    this.leftSignal = this.rightSignal = false;
    this.signalHoldDirection = this.signalDirection = 0;
    this.signalHeldAt = this.signalStartedAt = 0;
    this.signalTriggered = false;
    this.resetRequested = false;
    this.cameraRequested = false;
    this.driveModeRequested = false;
    this.timeOfDayRequested = false;
    this.recordRequested = false;
    this.previousLapRequested = false;
    this.nextLapRequested = false;
  }

  poll(
    enabled = true,
    steeringExpo = 0,
    dismissError?: () => boolean,
    allowReset = false,
    driveMode: DriveMode = 'grip',
  ) {
    const available = typeof navigator.getGamepads === 'function';
    const pads = available ? Array.from(navigator.getGamepads()) : [];
    const pad =
      pads.find((pad) => pad?.connected && isT300(pad)) ??
      pads.find((pad) => pad?.connected && pad.mapping === 'standard');
    const wheel = pad && isT300(pad) && pad.mapping !== 'standard';
    const needsInitialization = Boolean(wheel && /\bb65d\b/i.test(pad.id));
    const pedalAxes = t300PedalAxes[pad && pad.axes.length >= 9 ? 'sparse' : 'compact'];
    const message = pad
      ? needsInitialization
        ? 'Wheel initialization required: pedal axes unavailable'
        : '✅ Connected'
      : pads.some((pad) => pad?.connected)
        ? '🛑 Controller unsupported'
        : available
          ? '⏳ Waiting for controller'
          : '🛑 Gamepad API unavailable';
    this.controllerStatus = message;
    const bindings = inputBindings.get();
    const captureActive = inputBindings.isCaptureActive();
    const button = (action: ControllerAction) => {
      const index = bindings.controller.buttons[action];
      return wheel ? t300Button(pad, index, needsInitialization) : pad?.buttons[index];
    };
    const mapViewPressed = Boolean(button('map')?.pressed);
    if (mapViewPressed && !this.mapViewHeld && this.focused && !document.hidden && !captureActive) {
      const dismissed = dismissError?.() ?? false;
      if (enabled && !dismissed) this.mapView = !this.mapView;
    }
    this.mapViewHeld = mapViewPressed;
    if (!enabled || !this.focused || document.hidden || captureActive) {
      const resetDown = Boolean(button('reset')?.pressed);
      const reset =
        allowReset &&
        this.focused &&
        !document.hidden &&
        !captureActive &&
        resetDown &&
        !this.resetHeld;
      this.clear();
      this.resetHeld = resetDown;
      this.resetRequested = reset;
      return;
    }
    const pressed = (action: ControllerAction) => Boolean(button(action)?.pressed);
    const value = (action: ControllerAction) => {
      if (wheel && (action === 'accelerate' || action === 'brake'))
        return needsInitialization ? 0 : t300Pedal(pad, pedalAxes[action]);
      const input = button(action);
      const triggerValue = Math.max(
        0,
        Math.min(1, input?.value ?? Number(input?.pressed ?? false)),
      );
      return Math.max(0, (triggerValue - TRIGGER_DEADZONE) / (1 - TRIGGER_DEADZONE));
    };
    const axis = (action: AxisAction) => {
      if (wheel) return action === 'steering' ? -(pad.axes[0] ?? 0) : 0;
      const binding = bindings.controller.axes[action];
      const raw = Math.max(-1, Math.min(1, pad?.axes[binding.index] ?? 0));
      const adjusted = binding.inverted ? -raw : raw;
      return (
        Math.sign(adjusted) *
        Math.max(0, (Math.abs(adjusted) - STICK_DEADZONE) / (1 - STICK_DEADZONE))
      );
    };
    const edge = (
      action: ControllerAction,
      held: boolean,
      updateHeld: (value: boolean) => void,
    ) => {
      const down = pressed(action);
      updateHeld(down);
      return down && !held;
    };
    this.resetRequested = edge('reset', this.resetHeld, (value) => (this.resetHeld = value));
    this.cameraRequested = edge('camera', this.cameraHeld, (value) => (this.cameraHeld = value));
    this.driveModeRequested = edge('driveMode', this.driveModeHeld, (value) => {
      this.driveModeHeld = value;
    });
    this.timeOfDayRequested = edge('timeOfDay', this.timeOfDayHeld, (value) => {
      this.timeOfDayHeld = value;
    });
    this.recordRequested = edge('record', this.recordHeld, (value) => (this.recordHeld = value));
    this.previousLapRequested = edge('previousLap', this.previousLapHeld, (value) => {
      this.previousLapHeld = value;
    });
    this.nextLapRequested = edge(
      'nextLap',
      this.nextLapHeld,
      (value) => (this.nextLapHeld = value),
    );
    const keyboard = bindings.keyboard;
    const keyDown = (action: keyof typeof keyboard) => this.keys.has(keyboard[action]);
    const keyboardSteer = Number(keyDown('steerLeft')) - Number(keyDown('steerRight'));
    const stick = axis('steering');
    const wheelSteer = Math.max(
      -1,
      Math.min(1, stick * (driveMode === 'drift' ? T300_DRIFT_STEERING_GAIN : 1)),
    );
    const steering = wheel ? wheelSteer : stick;
    const expo = wheel && driveMode === 'grip' ? 0 : steeringExpo;
    this.steer = keyboardSteer || steering * (1 - expo) + steering ** 3 * expo;
    this.throttle = Math.max(Number(keyDown('accelerate')), value('accelerate'));
    this.brake = Math.max(Number(keyDown('brake')), value('brake'));
    this.reverse = this.brake;
    this.handbrake = keyDown('handbrake') || pressed('handbrake');
    this.clutch =
      pressed('clutch') ||
      Boolean(wheel && !needsInitialization && t300Pedal(pad, pedalAxes.clutch) > 0.5);
    this.shiftUp = Boolean(wheel && pad.buttons[1]?.pressed);
    this.shiftDown = Boolean(wheel && pad.buttons[0]?.pressed);
    const highBeamPressed = keyDown('highBeams') || pressed('highBeams');
    const now = performance.now();
    if (highBeamPressed) {
      this.highBeamPressedAt ??= now;
      if (!this.highBeamToggled && now - this.highBeamPressedAt >= 1000) {
        this.highBeamsLatched = !this.highBeamsLatched;
        this.highBeamToggled = true;
      }
    } else {
      this.highBeamPressedAt = null;
      this.highBeamToggled = false;
    }
    this.highBeams = this.highBeamsLatched || (highBeamPressed && !this.highBeamToggled);
    const headlightsPressed = keyDown('headlights') || pressed('headlights');
    this.lightingRequested = null;
    if (headlightsPressed) {
      if (this.headlightsPressedAt === null) this.lightingRequested = 'press';
      this.headlightsPressedAt ??= now;
      if (!this.lightingHoldTriggered && now - this.headlightsPressedAt >= 1000) {
        this.lightingRequested = 'hold';
        this.lightingHoldTriggered = true;
      }
    } else {
      if (
        this.headlightsPressedAt !== null &&
        !this.lightingHoldTriggered &&
        !(this.headlightsGamepadHeld && !pad)
      ) {
        this.lightingRequested = 'tap';
      }
      this.headlightsPressedAt = null;
      this.lightingHoldTriggered = false;
    }
    this.headlightsGamepadHeld = pressed('headlights');
    this.cameraX = axis(this.mapView ? 'mapPanX' : 'cameraX');
    this.cameraY = axis(this.mapView ? 'mapPanY' : 'cameraY');
    this.mapZoom = this.mapView
      ? Math.max(
          -1,
          Math.min(
            1,
            axis('mapZoom') + Number(keyDown('mapZoomIn')) - Number(keyDown('mapZoomOut')),
          ),
        )
      : 0;
    this.lookBehind = !this.mapView && pressed('lookBehind');
    const signalDirection =
      !this.mapView && Math.abs(this.cameraX) >= 0.5 ? Math.sign(this.cameraX) : 0;
    if (signalDirection !== this.signalHoldDirection) {
      this.signalHoldDirection = signalDirection;
      this.signalHeldAt = now;
      this.signalTriggered = false;
    }
    if (signalDirection && !this.signalTriggered && now - this.signalHeldAt >= 1000) {
      this.signalDirection = signalDirection;
      this.signalStartedAt = now;
      this.signalTriggered = true;
    }
    const signalElapsed = now - this.signalStartedAt;
    if (signalElapsed >= 3200) this.signalDirection = 0;
    const signalOn = signalElapsed % 800 < 400;
    this.leftSignal = this.signalDirection === -1 && signalOn;
    this.rightSignal = this.signalDirection === 1 && signalOn;
    const padActive =
      Boolean(pad?.buttons.some((button) => button.pressed)) ||
      (wheel
        ? Math.abs(this.steer) > 0.2 || this.throttle > 0.2 || this.brake > 0.2 || this.clutch
        : Boolean(pad?.axes.some((value) => Math.abs(value) > 0.2)));
    if (this.keys.size > 0 || padActive) this.setCursorHidden(true);
  }
}
