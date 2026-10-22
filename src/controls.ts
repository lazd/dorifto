const STICK_DEADZONE = 0.0;
const TRIGGER_DEADZONE = 0.0;

type LightingRequest = "press" | "tap" | "hold";

export function updateVehicleLights(
  state: { headlights: boolean; fogLights: boolean; headlightsAtPress: boolean },
  request: LightingRequest,
) {
  if (request === "press")
    return { ...state, headlights: true, headlightsAtPress: state.headlights };
  if (request === "hold")
    return { ...state, headlights: true, fogLights: !state.fogLights };
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
  controllerStatus = "";
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
    document.documentElement.style.cursor = hidden ? "none" : "";
    document.body.style.cursor = hidden ? "none" : "";
  }

  constructor() {
    window.addEventListener("mousemove", () => this.setCursorHidden(false));
    window.addEventListener("mousedown", () => this.setCursorHidden(false));
    window.addEventListener("blur", () => {
      this.focused = false;
      this.clear();
    });
    window.addEventListener("focus", () => {
      this.focused = true;
    });
    document.addEventListener("visibilitychange", () => {
      this.focused = !document.hidden && document.hasFocus();
      this.clear();
    });
  }

  clear() {
    this.keys.clear();
    this.steer = this.throttle = this.brake = this.reverse = 0;
    this.cameraX = this.cameraY = 0;
    this.mapZoom = 0;
    this.handbrake = this.lookBehind = false;
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

  poll(enabled = true, steeringExpo = 0, dismissError?: () => boolean) {
    const available = typeof navigator.getGamepads === "function";
    const pads = available ? Array.from(navigator.getGamepads()) : [];
    const pad = pads.find((pad) => pad?.connected && pad.mapping === "standard");
    const message = pad
      ? "✅ Connected"
      : pads.some((pad) => pad?.connected)
        ? "🛑 Controller unsupported"
        : available
          ? "⏳ Waiting for controller"
          : "🛑 Gamepad API unavailable";
    this.controllerStatus = message;
    const resetPressed = Boolean(pad?.buttons[9]?.pressed);
    this.resetRequested = resetPressed && !this.resetHeld;
    this.resetHeld = resetPressed;
    const cameraPressed = Boolean(pad?.buttons[8]?.pressed);
    this.cameraRequested = cameraPressed && !this.cameraHeld;
    this.cameraHeld = cameraPressed;
    const driveModePressed = Boolean(pad?.buttons[3]?.pressed);
    this.driveModeRequested = driveModePressed && !this.driveModeHeld;
    this.driveModeHeld = driveModePressed;
    const timeOfDayPressed = Boolean(pad?.buttons[13]?.pressed);
    this.timeOfDayRequested = timeOfDayPressed && !this.timeOfDayHeld;
    this.timeOfDayHeld = timeOfDayPressed;
    const recordPressed = Boolean(pad?.buttons[12]?.pressed);
    this.recordRequested = recordPressed && !this.recordHeld;
    this.recordHeld = recordPressed;
    const previousLapPressed = Boolean(pad?.buttons[14]?.pressed);
    this.previousLapRequested = previousLapPressed && !this.previousLapHeld;
    this.previousLapHeld = previousLapPressed;
    const nextLapPressed = Boolean(pad?.buttons[15]?.pressed);
    this.nextLapRequested = nextLapPressed && !this.nextLapHeld;
    this.nextLapHeld = nextLapPressed;
    const mapViewPressed = Boolean(pad?.buttons[1]?.pressed);
    if (mapViewPressed && !this.mapViewHeld && this.focused && !document.hidden) {
      if (!dismissError?.()) this.mapView = !this.mapView;
    }
    this.mapViewHeld = mapViewPressed;
    if (!enabled || !this.focused || document.hidden) {
      this.clear();
      return;
    }
    const axis = (index: number) => {
      const value = Math.max(-1, Math.min(1, pad?.axes[index] ?? 0));
      return (
        Math.sign(value) * Math.max(0, (Math.abs(value) - STICK_DEADZONE) / (1 - STICK_DEADZONE))
      );
    };
    const trigger = (index: number) => {
      const value = Math.max(0, Math.min(1, pad?.buttons[index]?.value ?? 0));
      return Math.max(0, (value - TRIGGER_DEADZONE) / (1 - TRIGGER_DEADZONE));
    };
    const keyboardSteer = Number(this.keys.has("ArrowLeft")) - Number(this.keys.has("ArrowRight"));
    const stick = -axis(0);
    this.steer = keyboardSteer || stick * (1 - steeringExpo) + stick ** 3 * steeringExpo;
    this.throttle = Math.max(Number(this.keys.has("KeyZ")), trigger(7));
    this.brake = Math.max(Number(this.keys.has("KeyX")), trigger(6));
    this.reverse = this.brake;
    this.handbrake = this.keys.has("Space") || Boolean(pad?.buttons[5]?.pressed);
    const highBeamPressed = this.keys.has("KeyF") || Boolean(pad?.buttons[4]?.pressed);
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
    const headlightsPressed = this.keys.has("KeyH") || Boolean(pad?.buttons[2]?.pressed);
    this.lightingRequested = null;
    if (headlightsPressed) {
      if (this.headlightsPressedAt === null) this.lightingRequested = "press";
      this.headlightsPressedAt ??= now;
      if (!this.lightingHoldTriggered && now - this.headlightsPressedAt >= 1000) {
        this.lightingRequested = "hold";
        this.lightingHoldTriggered = true;
      }
    } else {
      if (this.headlightsPressedAt !== null && !this.lightingHoldTriggered &&
        !(this.headlightsGamepadHeld && !pad)) {
        this.lightingRequested = "tap";
      }
      this.headlightsPressedAt = null;
      this.lightingHoldTriggered = false;
    }
    this.headlightsGamepadHeld = Boolean(pad?.buttons[2]?.pressed);
    this.cameraX = axis(2);
    this.cameraY = axis(3);
    this.mapZoom = this.mapView ? axis(1) : 0;
    this.lookBehind = Boolean(pad?.buttons[11]?.pressed);
    const signalDirection = !this.mapView && Math.abs(this.cameraX) >= 0.5
      ? Math.sign(this.cameraX) : 0;
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
      Boolean(pad?.axes.some((value) => Math.abs(value) > 0.2));
    if (this.keys.size > 0 || padActive) this.setCursorHidden(true);
  }
}
