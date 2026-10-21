import { driveModes, isDriveMode, type DriveMode } from "./drive-modes";
import { createDrivingTuning } from "./drift-tuning";
import { redlineRpm } from "./drivetrain";
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

function bindDialog(
  store: Store<GameState>,
  trigger: string,
  selector: string,
  key: "helpOpen" | "settingsOpen" | "tuningOpen",
) {
  const dialog = element<HTMLDialogElement>(selector);
  let displayedOpen = dialog.open;
  const close = () => store.update({ [key]: false });
  element(trigger).addEventListener("click", () => store.update({ [key]: true }));
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener("close", () => {
    if (!dialog.open) close();
  });
  const outside = (event: MouseEvent) => {
    const bounds = dialog.getBoundingClientRect();
    return (
      event.target === dialog &&
      (event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom)
    );
  };
  let pressedOutside = false;
  dialog.addEventListener("pointerdown", (event) => {
    pressedOutside = outside(event);
  });
  dialog.addEventListener("click", (event) => {
    if (pressedOutside && outside(event)) close();
    pressedOutside = false;
  });
  store.subscribe((state) => {
    if (state[key] === displayedOpen) return;
    displayedOpen = state[key];
    if (displayedOpen && !dialog.open) {
      dialog.showModal();
      dialog.scrollTop = 0;
    } else if (!displayedOpen && dialog.open) dialog.close();
  });
}

function bindTachometer() {
  const tach = element("#tachometer");
  const dial = tach.querySelector<SVGSVGElement>(".tach-dial")!;
  const maxRpm = Number(tach.getAttribute("aria-valuemax"));
  const segmentCount = 64;
  const point = (radius: number, fraction: number) => {
    const angle = (135 + fraction * 270) * Math.PI / 180;
    return `${140 + radius * Math.cos(angle)},${140 + radius * Math.sin(angle)}`;
  };
  dial.innerHTML = Array.from({ length: segmentCount }, (_, index) => {
    const start = (index + 0.16) / segmentCount;
    const end = (index + 0.84) / segmentCount;
    const rpm = (index + 1) / segmentCount * maxRpm;
    const zone = rpm >= redlineRpm ? "redline" : rpm >= 6000 ? "warning" : "";
    return `<path class="tach-segment ${zone}" d="M${point(116, start)} A116 116 0 0 1 ${point(116, end)} L${point(101, end)} A101 101 0 0 0 ${point(101, start)} Z"/>`;
  }).join("") + Array.from({ length: 9 }, (_, index) =>
    `<text class="tach-number ${index * 1000 >= redlineRpm ? "redline" : ""}" x="${point(86, index / 8).split(",")[0]}" y="${point(86, index / 8).split(",")[1]}">${index}</text>`,
  ).join("");
  const segments = [...dial.querySelectorAll(".tach-segment")];

  const led = document.querySelector<SVGSVGElement>("#speed-led")!;
  const shapes = [
    "7,2 29,2 33,6 29,10 7,10 3,6",
    "30,11 34,7 34,27 30,31 26,27 26,15",
    "30,33 34,37 34,57 30,61 26,57 26,37",
    "7,54 29,54 33,58 29,62 7,62 3,58",
    "2,37 6,33 10,37 10,57 6,61 2,57",
    "2,7 6,11 10,15 10,27 6,31 2,27",
    "7,28 29,28 33,32 29,36 7,36 3,32",
  ];
  const digits = ["abcdef", "bc", "abdeg", "abcdg", "bcfg", "acdfg", "acdefg", "abc", "abcdefg", "abcdfg"];
  led.innerHTML = Array.from({ length: 3 }, (_, index) =>
    `<g transform="translate(${index * 44} 0)">${shapes.map((points) => `<polygon points="${points}"/>`).join("")}</g>`,
  ).join("");
  const ledDigits = [...led.querySelectorAll("g")].map((group) => [...group.children]);
  let previousSpeed = "";
  let previousRpm = -1;
  let previousSegments = -1;
  let previousLimiter = false;
  return (rpm: number, mph: string, limiter: boolean) => {
    const count = Math.round(Math.max(0, Math.min(1, rpm / maxRpm)) * segmentCount);
    if (count !== previousSegments) {
      segments.forEach((segment, index) => segment.classList.toggle("lit", index < count));
      previousSegments = count;
    }
    const displayedRpm = Math.max(0, Math.min(maxRpm, Math.round(rpm / 50) * 50));
    if (displayedRpm !== previousRpm) {
      tach.setAttribute("aria-valuenow", String(displayedRpm));
      previousRpm = displayedRpm;
    }
    if (limiter !== previousLimiter) {
      tach.classList.toggle("limiter", limiter);
      previousLimiter = limiter;
    }
    if (mph !== previousSpeed) {
      const display = mph.padStart(3, " ").slice(-3);
      ledDigits.forEach((segments, index) => {
        const active = display[index] === " " ? "" : digits[Number(display[index])];
        segments.forEach((segment, part) => segment.classList.toggle("lit", active.includes("abcdefg"[part])));
      });
      previousSpeed = mph;
    }
  };
}

export function bindGameActions(actions: {
  sound: (muted: boolean) => void;
  clearInput: () => void;
}) {
  const sound = element<HTMLSelectElement>("#sound");
  sound.addEventListener("change", () => {
    const muted = sound.value === "off";
    actions.sound(muted);
    const url = new URL(location.href);
    if (muted) url.searchParams.set("sound", "off");
    else url.searchParams.delete("sound");
    history.replaceState(null, "", url);
  });
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
  const gear = bindText("#gear");
  const tachometer = bindTachometer();
  const lap = bindText("#lap-number");
  const current = bindText("#lap-current");
  const last = bindText("#lap-last");
  const best = bindText("#lap-best");
  const cones = bindText("#lap-cones");
  const lastCones = bindText("#lap-last-cones");
  const controller = bindText("#controller-status");
  const modeHint = bindText("#drift-tuning-mode");
  const status = element("#status");
  const statusText = bindText("#status");
  createDrivingTuning(element("#drift-tuning-sliders"), element("#drift-tuning-reset"), store);
  bindDialog(store, "#tuning", "#drift-tuning", "tuningOpen");
  bindDialog(store, "#settings", "#settings-dialog", "settingsOpen");
  bindDialog(store, "#help", "#help-dialog", "helpOpen");

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
  const focus = () => store.update({ focused: document.hasFocus() && !document.hidden });
  window.addEventListener("focus", focus);
  window.addEventListener("blur", focus);
  document.addEventListener("visibilitychange", focus);
  focus();
  const sound = element<HTMLSelectElement>("#sound");
  const soundStatus = bindText("#sound-status");
  const telemetryPanel = element(".telemetry");
  store.subscribe((state) => {
    // The cabin camera shows the car's own working gauges instead.
    telemetryPanel.hidden = state.cameraStyle === "cabin";
    const t = state.telemetry;
    const mph = String(Math.round(Math.abs(t.speed) / 0.44704));
    speed(mph);
    tachometer(t.rpm, mph, t.limiter);
    engine(`${Math.round(t.rpm / 50) * 50} RPM`);
    gear(t.gear < 0 ? "R" : String(t.gear));
    lap(t.lap ? `LAP ${t.lap}` : "CROSS START TO BEGIN");
    current(formatLapTime(t.lap ? t.current : null));
    last(formatLapTime(t.last));
    best(formatLapTime(t.best));
    cones(String(t.cones));
    lastCones(t.lastCones === null ? "--" : String(t.lastCones));
    controller(state.controllerStatus);
    const soundValue = state.sound.muted ? "off" : "on";
    if (sound.value !== soundValue) sound.value = soundValue;
    sound.disabled = state.sound.failed;
    soundStatus(
      state.sound.failed
        ? `Sound unavailable: ${state.sound.error ?? "Reload to retry."}`
        : "",
    );
    const name = state.driveMode === "grip" ? "Grip" : "Drift";
    modeHint(`Live in ${name} mode / base friction ${driveModes[state.driveMode].friction}`);
    if (status.hidden === state.status.visible) status.hidden = !state.status.visible;
    if (status.classList.contains("error") !== state.status.error)
      status.classList.toggle("error", state.status.error);
    const role = state.status.error ? "alert" : "status";
    if (status.getAttribute("role") !== role) status.setAttribute("role", role);
    statusText(state.status.message);
  });
}
