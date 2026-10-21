import { driveModes, isDriveMode, type DriveMode } from "./drive-modes";
import { createDrivingTuning } from "./drift-tuning";
import { isCameraStyle, isTimeOfDay, type GameState } from "./game-state";
import { formatLapTime } from "./laps";
import type { Store } from "./store";

export function element<T extends HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Missing UI element: ${selector}`);
  return found;
}

function bindText(selector: string) {
  const node = element(selector);
  return (text: string) => {
    if (node.textContent !== text) node.textContent = text;
  };
}

const drivingLabels: Record<GameState["telemetry"]["driving"], string> = {
  "brakes-held": "BRAKES HELD",
  handbrake: "HANDBRAKE",
  brakestand: "BRAKESTAND",
  reverse: "REVERSE",
  braking: "BRAKING",
  burnout: "BURNOUT",
  sliding: "SLIDING",
  driving: "REAR-WHEEL DRIVE",
};

export function bindGameActions(actions: {
  reset: () => void;
  sound: () => void;
  clearInput: () => void;
}) {
  for (const [selector, action] of [
    ["#reset", actions.reset],
    ["#sound", actions.sound],
  ] as const) {
    const button = element<HTMLButtonElement>(selector);
    button.addEventListener("click", () => {
      action();
      button.blur();
    });
  }
  element("#drift-tuning").addEventListener("focusin", actions.clearInput);
}

export function bindCoursePicker(
  options: readonly { id: string; name: string }[],
  selected: { id: string; name: string },
) {
  const input = element<HTMLSelectElement>("#course");
  for (const course of options) input.add(new Option(course.name, course.id));
  input.add(new Option(selected.id === "random" ? selected.name : "Random Circuit", "random"));
  input.value = selected.id;
  const randomCourse = () => {
    const url = new URL(location.href);
    url.searchParams.set("course", "random");
    url.searchParams.set("seed", String(crypto.getRandomValues(new Uint32Array(1))[0]));
    location.assign(url.href);
  };
  element("#random-course").addEventListener("click", randomCourse);
  input.addEventListener("change", () => {
    if (input.value === "random") {
      randomCourse();
      return;
    }
    const url = new URL(location.href);
    url.searchParams.set("course", input.value);
    url.searchParams.delete("seed");
    location.assign(url.href);
  });
}

export function bindGameUI(store: Store<GameState>, reportError: (error: unknown) => void) {
  const speed = bindText("#speed");
  const engine = bindText("#engine-state");
  const driving = bindText("#state");
  const lap = bindText("#lap-number");
  const current = bindText("#lap-current");
  const last = bindText("#lap-last");
  const best = bindText("#lap-best");
  const cones = bindText("#lap-cones");
  const lastCones = bindText("#lap-last-cones");
  const controller = bindText("#controller-status");
  const title = bindText("#drift-tuning summary");
  const modeHint = bindText("#drift-tuning-mode");
  const status = element("#status");
  const statusText = bindText("#status");
  createDrivingTuning(element("#drift-tuning-sliders"), element("#drift-tuning-reset"), store);
  const tuningDisclosure = element<HTMLDetailsElement>("#drift-tuning");
  document.addEventListener("click", (event) => {
    if (tuningDisclosure.open && event.target instanceof Node && !tuningDisclosure.contains(event.target)) {
      tuningDisclosure.open = false;
    }
  });

  function select<Value extends string>(
    selector: string,
    parameter: string,
    read: (state: Readonly<GameState>) => Value,
    write: (value: Value) => Partial<GameState>,
    valid: (value: string) => value is Value,
  ) {
    const input = element<HTMLSelectElement>(selector);
    input.addEventListener("change", () => {
      const value = input.value;
      if (!valid(value)) {
        reportError(new Error(`Unknown ${parameter}: ${value}`));
        return;
      }
      store.update(write(value));
      const url = new URL(location.href);
      url.searchParams.set(parameter, input.value);
      history.replaceState(null, "", url);
      input.blur();
    });
    store.subscribe((state) => {
      const value = read(state);
      if (input.value !== value) input.value = value;
    });
  }
  select<DriveMode>(
    "#drive-mode",
    "mode",
    (state) => state.driveMode,
    (driveMode) => ({ driveMode }),
    isDriveMode,
  );
  select<GameState["cameraStyle"]>(
    "#camera-style",
    "camera",
    (state) => state.cameraStyle,
    (cameraStyle) => ({ cameraStyle }),
    isCameraStyle,
  );
  select<GameState["timeOfDay"]>(
    "#time-of-day",
    "time",
    (state) => state.timeOfDay,
    (timeOfDay) => ({ timeOfDay }),
    isTimeOfDay,
  );
  const help = element<HTMLDialogElement>("#help-dialog");
  let displayedHelpOpen = help.open;
  element("#help").addEventListener("click", () => store.update({ helpOpen: true }));
  help.addEventListener("cancel", (event) => {
    event.preventDefault();
    store.update({ helpOpen: false });
  });
  help.addEventListener("close", () => {
    store.update({ helpOpen: false });
    element("#help").blur();
  });
  const focus = () => store.update({ focused: document.hasFocus() && !document.hidden });
  window.addEventListener("focus", focus);
  window.addEventListener("blur", focus);
  document.addEventListener("visibilitychange", focus);
  focus();
  const sound = element<HTMLButtonElement>("#sound");
  const soundText = bindText("#sound");
  store.subscribe((state) => {
    const t = state.telemetry;
    speed(String(Math.round(t.speed / 0.44704)));
    engine(
      `${t.gear < 0 ? "R" : t.gear} / ${Math.round(t.rpm / 50) * 50} RPM${t.limiter ? "🔴" : ""}`,
    );
    driving(drivingLabels[t.driving]);
    lap(t.lap ? `LAP ${t.lap}` : "CROSS START TO BEGIN");
    current(formatLapTime(t.lap ? t.current : null));
    last(formatLapTime(t.last));
    best(formatLapTime(t.best));
    cones(String(t.cones));
    lastCones(t.lastCones === null ? "--" : String(t.lastCones));
    controller(state.controllerStatus);
    soundText(
      state.sound.failed
        ? "Sound unavailable"
        : !state.sound.running
          ? "Enable sound"
          : state.sound.muted
            ? "Sound: Off"
            : "Sound: On",
    );
    const pressed = String(state.sound.running && !state.sound.muted && !state.sound.failed);
    if (sound.getAttribute("aria-pressed") !== pressed) sound.setAttribute("aria-pressed", pressed);
    const soundTitle =
      state.sound.error === null ? "" : `Audio unavailable: ${state.sound.error}. Reload to retry.`;
    if (sound.title !== soundTitle) sound.title = soundTitle;
    const name = state.driveMode === "grip" ? "Grip" : "Drift";
    title(`${name} tuning`);
    modeHint(`Live in ${name} mode / base friction ${driveModes[state.driveMode].friction}`);
    if (status.hidden === state.status.visible) status.hidden = !state.status.visible;
    if (status.classList.contains("error") !== state.status.error)
      status.classList.toggle("error", state.status.error);
    const role = state.status.error ? "alert" : "status";
    if (status.getAttribute("role") !== role) status.setAttribute("role", role);
    statusText(state.status.message);
    if (state.helpOpen !== displayedHelpOpen) {
      displayedHelpOpen = state.helpOpen;
      if (state.helpOpen && !help.open) help.showModal();
      else if (!state.helpOpen && help.open) help.close();
    }
  });
}
