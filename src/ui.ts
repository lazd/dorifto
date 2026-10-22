import { driveModes, isDriveMode, type DriveMode } from "./drive-modes";
import { createDrivingTuning } from "./drift-tuning";
import { redlineRpm } from "./drivetrain";
import { isCameraStyle, isGhostMode, isMinimapOrientation, isTimeOfDay, type GameState } from "./game-state";
import { formatLapTime } from "./laps";
import type { Store } from "./store";
import { isTurnSignMode } from "./turn-sign";
import {
  courseGenerationFields,
  defaultCourseWeights,
  validateCourseWeights,
  type CourseGenerationWeights,
} from "./course-generation";

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

function bindCourseDisclosure(store: Store<GameState>) {
  const hud = element(".course-hud");
  const map = element<HTMLButtonElement>("#minimap");
  const menu = element("#course-menu");
  const setOpen = (open: boolean) => {
    store.update({ courseMenuOpen: open });
  };
  store.subscribe(({ courseMenuOpen }) => {
    if (!courseMenuOpen && !menu.hidden && menu.contains(document.activeElement)) map.focus();
    if (menu.hidden !== !courseMenuOpen) menu.hidden = !courseMenuOpen;
    const expanded = String(courseMenuOpen);
    if (map.getAttribute("aria-expanded") !== expanded) map.setAttribute("aria-expanded", expanded);
  });
  map.addEventListener("click", () => setOpen(Boolean(menu.hidden)));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.hidden && !document.querySelector("dialog[open]")) {
      event.preventDefault();
      setOpen(false);
      map.focus();
    }
  }, true);
  hud.addEventListener("keydown", (event) => event.stopPropagation());
  hud.addEventListener("keyup", (event) => event.stopPropagation());
  document.addEventListener("pointerdown", (event) => {
    if (store.getState().customCourseOpen) return;
    if (event.target instanceof Node && !hud.contains(event.target)) setOpen(false);
  });
}

function bindDialog(
  store: Store<GameState>,
  trigger: string,
  selector: string,
  key: "helpOpen" | "settingsOpen" | "tuningOpen" | "customCourseOpen",
) {
  const dialog = element<HTMLDialogElement>(selector);
  let displayedOpen = dialog.open;
  const close = () => store.update({ [key]: false });
  element(trigger).addEventListener("click", () => store.update({ [key]: true, courseMenuOpen: false }));
  dialog.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    close();
  });
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
    const angle = ((135 + fraction * 270) * Math.PI) / 180;
    return `${140 + radius * Math.cos(angle)},${140 + radius * Math.sin(angle)}`;
  };
  dial.innerHTML =
    Array.from({ length: segmentCount }, (_, index) => {
      const start = (index + 0.16) / segmentCount;
      const end = (index + 0.84) / segmentCount;
      const rpm = ((index + 1) / segmentCount) * maxRpm;
      const zone = rpm >= redlineRpm ? "redline" : rpm >= 6000 ? "warning" : "";
      return `<path class="tach-segment ${zone}" d="M${point(116, start)} A116 116 0 0 1 ${point(116, end)} L${point(101, end)} A101 101 0 0 0 ${point(101, start)} Z"/>`;
    }).join("") +
    Array.from(
      { length: 9 },
      (_, index) =>
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
  const digits = [
    "abcdef",
    "bc",
    "abdeg",
    "abcdg",
    "bcfg",
    "acdfg",
    "acdefg",
    "abc",
    "abcdefg",
    "abcdfg",
  ];
  led.innerHTML = Array.from(
    { length: 3 },
    (_, index) =>
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
        segments.forEach((segment, part) =>
          segment.classList.toggle("lit", active.includes("abcdefg"[part])),
        );
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

export function bindLapRecorder(
  store: Store<GameState>,
  actions: { press: () => void; select: (id: string) => void; remove: (id: string) => void },
) {
  const container = element(".lap-recorder");
  const button = element<HTMLButtonElement>("#lap-recorder-button");
  const label = bindText("#lap-recorder-label");
  const picker = element(".lap-replay-picker");
  const runs = element<HTMLSelectElement>("#lap-replay-run");
  const remove = element<HTMLButtonElement>("#lap-replay-delete");
  button.addEventListener("click", () => {
    actions.press();
    button.blur();
  });
  runs.addEventListener("change", () => {
    actions.select(runs.value);
    runs.blur();
  });
  remove.addEventListener("click", () => {
    if (runs.value && confirm("Delete these saved laps?")) actions.remove(runs.value);
    remove.blur();
  });
  const text = {
    off: ["", ""],
    ready: ["REPLAY", "Play saved laps"],
    recording: ["REC", "Stop recording, save laps and replay them"],
    replay: ["REPLAY", "Stop replay"],
  } as const;
  let shownRuns: GameState["lapRecorder"]["runs"] | null = null;
  store.subscribe(({ lapRecorder }) => {
    const { mode } = lapRecorder;
    if (container.hidden !== (mode === "off")) container.hidden = mode === "off";
    if (button.dataset.mode !== mode) button.dataset.mode = mode;
    label(text[mode][0]);
    if (button.title !== text[mode][1]) {
      button.title = text[mode][1];
      button.setAttribute("aria-label", text[mode][1]);
    }
    const picking = mode === "ready";
    if (picker.hidden !== !picking) picker.hidden = !picking;
    if (shownRuns !== lapRecorder.runs) {
      shownRuns = lapRecorder.runs;
      runs.replaceChildren(...lapRecorder.runs.map((run) => new Option(run.label, run.id)));
    }
    const selected = lapRecorder.selectedRun ?? "";
    if (runs.value !== selected) runs.value = selected;
  });
}

export function bindCoursePicker(
  options: readonly { id: string; name: string }[],
  selected: { id: string; name: string },
  changeCourse: (
    id: string,
    seed?: number,
    weights?: CourseGenerationWeights,
  ) => Promise<{ id: string; name: string }>,
  changeDirection: (reverse: boolean) => Promise<void>,
  reportError: (error: unknown) => void,
  store: Store<GameState>,
) {
  const input = element<HTMLSelectElement>("#course");
  const button = element<HTMLButtonElement>("#random-course");
  const reverse = element<HTMLInputElement>("#reverse-course");
  const customButton = element<HTMLButtonElement>("#custom-course");
  const generateButton = element<HTMLButtonElement>("#custom-course-generate");
  const resetButton = element<HTMLButtonElement>("#custom-course-reset");
  const fieldset = element<HTMLFieldSetElement>("#custom-course-sliders");
  const customStatus = bindText("#custom-course-status");
  const customError = bindText("#custom-course-error");
  const courseName = bindText("#course-name");
  courseName(selected.name);
  for (const course of options) input.add(new Option(course.name, course.id));
  const randomOption = new Option(
    selected.id === "random" ? selected.name : "Random Circuit",
    "random",
  );
  input.add(randomOption);
  const customOption = new Option(
    selected.id === "custom" ? selected.name : "Custom Circuit",
    "custom",
  );
  input.add(customOption);
  input.value = selected.id;
  const setBusy = (busy: boolean) => {
    input.disabled =
      button.disabled =
      reverse.disabled =
      customButton.disabled =
      generateButton.disabled =
      resetButton.disabled =
      fieldset.disabled =
        busy;
  };
  setBusy(false);
  reverse.checked = store.getState().courseReverse;
  let changing = false;
  const selectCourse = async (id: string) => {
    if (changing) return;
    changing = true;
    store.update({ courseMenuOpen: false });
    setBusy(true);
    customError("");
    let closeCustom = false;
    try {
      const generated = id === "random" || id === "custom";
      const weights = id === "custom" ? store.getState().courseWeights : undefined;
      if (weights) validateCourseWeights(weights);
      if (id === "custom") customStatus("Generating course…");
      selected = await changeCourse(
        id,
        generated ? crypto.getRandomValues(new Uint32Array(1))[0] : undefined,
        weights,
      );
      courseName(selected.name);
      randomOption.text = selected.id === "random" ? selected.name : "Random Circuit";
      customOption.text = selected.id === "custom" ? selected.name : "Custom Circuit";
      closeCustom = id === "custom";
    } catch (error) {
      reportError(error);
      if (store.getState().customCourseOpen) {
        customError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      input.value = selected.id;
      setBusy(false);
      customStatus("");
      changing = false;
      if (closeCustom) store.update({ customCourseOpen: false });
    }
  };
  button.addEventListener("click", () => {
    void selectCourse("random");
  });
  generateButton.addEventListener("click", () => {
    void selectCourse("custom");
  });
  async function reverseCourse() {
    if (changing) {
      reverse.checked = store.getState().courseReverse;
      return;
    }
    changing = true;
    store.update({ courseMenuOpen: false });
    setBusy(true);
    try {
      await changeDirection(reverse.checked);
    } catch (error) {
      reportError(error);
    } finally {
      reverse.checked = store.getState().courseReverse;
      setBusy(false);
      changing = false;
    }
  }
  reverse.addEventListener("change", () => {
    void reverseCourse();
  });
  input.addEventListener("change", () => {
    if (input.value === "custom") {
      input.value = selected.id;
      customError("");
      store.update({ customCourseOpen: true, courseMenuOpen: false });
      return;
    }
    void selectCourse(input.value);
  });
}

function bindCourseWeights(store: Store<GameState>) {
  const fieldset = element<HTMLFieldSetElement>("#custom-course-sliders");
  let weights = store.getState().courseWeights;
  const refresh: (() => void)[] = [];
  for (const { key, label: text, description, min, max, step } of courseGenerationFields) {
    const label = document.createElement("label");
    const title = document.createElement("span");
    const output = document.createElement("output");
    const input = document.createElement("input");
    const hint = document.createElement("small");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.id = `course-${key}`;
    label.htmlFor = output.htmlFor = input.id;
    title.id = `${input.id}-title`;
    title.textContent = text;
    hint.id = `${input.id}-hint`;
    hint.textContent = description;
    input.setAttribute("aria-labelledby", title.id);
    input.setAttribute("aria-describedby", hint.id);
    const sync = () => {
      input.value = String(weights[key]);
      output.value =
        key === "length" ? `${(weights[key] / 1000).toFixed(1)} km` : weights[key].toFixed(2);
      input.setAttribute("aria-valuetext", output.value);
    };
    input.addEventListener("input", () => {
      const next = { ...store.getState().courseWeights, [key]: input.valueAsNumber };
      validateCourseWeights(next);
      store.update({ courseWeights: next });
    });
    refresh.push(sync);
    sync();
    label.append(title, output, input, hint);
    fieldset.append(label);
  }
  element("#custom-course-reset").addEventListener("click", () => {
    store.update({ courseWeights: { ...defaultCourseWeights } });
  });
  store.subscribe((state) => {
    if (state.courseWeights === weights) return;
    weights = state.courseWeights;
    refresh.forEach((sync) => sync());
  });
}

export function bindGameUI(store: Store<GameState>, reportError: (error: unknown) => void) {
  bindCourseDisclosure(store);
  const speed = bindText("#speed");
  const gear = bindText("#gear");
  const tachometer = bindTachometer();
  const lap = bindText("#lap-number");
  const current = bindText("#lap-current");
  const best = bindText("#lap-best");
  const controller = bindText("#controller-status");
  const modeHint = bindText("#drift-tuning-mode");
  const status = element("#status");
  const statusText = bindText("#status");
  const footer = element("footer");
  createDrivingTuning(element("#drift-tuning-sliders"), element("#drift-tuning-reset"), store);
  bindDialog(store, "#tuning", "#drift-tuning", "tuningOpen");
  bindDialog(store, "#settings", "#settings-dialog", "settingsOpen");
  bindDialog(store, "#help", "#help-dialog", "helpOpen");
  bindCourseWeights(store);
  bindDialog(store, "#custom-course", "#custom-course-dialog", "customCourseOpen");

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
  select<GameState["minimapOrientation"]>(
    "#minimap-orientation",
    "minimap",
    (state) => state.minimapOrientation,
    (minimapOrientation) => ({ minimapOrientation }),
    isMinimapOrientation,
  );
  const isToggle = (value: string): value is "on" | "off" => value === "on" || value === "off";
  select<"on" | "off">(
    "#cabin-head-motion",
    "head-motion",
    (state) => (state.cabinHeadMotion ? "on" : "off"),
    (value) => ({ cabinHeadMotion: value === "on" }),
    isToggle,
  );
  select<GameState["coneMode"]>(
    "#show-cones",
    "cones",
    (state) => state.coneMode,
    (coneMode) => ({ coneMode }),
    (value): value is GameState["coneMode"] => value === "all" || value === "corners" || value === "off",
  );
  select<GameState["turnSignMode"]>(
    "#show-turn-signs",
    "signs",
    (state) => state.turnSignMode,
    (turnSignMode) => ({ turnSignMode }),
    isTurnSignMode,
  );
  select<GameState["ghostMode"]>(
    "#ghost-mode",
    "ghost",
    (state) => state.ghostMode,
    (ghostMode) => ({ ghostMode }),
    isGhostMode,
  );
  select<"on" | "off">(
    "#show-grass",
    "grass",
    (state) => (state.showGrass ? "on" : "off"),
    (value) => ({ showGrass: value === "on" }),
    isToggle,
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
    const chaseView = state.cameraStyle !== "cabin";
    if (document.body.classList.contains("chase-view") !== chaseView)
      document.body.classList.toggle("chase-view", chaseView);
    const t = state.telemetry;
    const mph = String(Math.round(Math.abs(t.speed) / 0.44704));
    speed(mph);
    tachometer(t.rpm, mph, t.limiter);
    gear(t.gear < 0 ? "R" : String(t.gear));
    lap(t.lap ? String(t.lap) : "--");
    current(formatLapTime(t.lap ? t.current : null));
    best(formatLapTime(t.best));
    controller(state.controllerStatus);
    const soundValue = state.sound.muted ? "off" : "on";
    if (sound.value !== soundValue) sound.value = soundValue;
    sound.disabled = state.sound.failed;
    soundStatus(
      state.sound.failed ? `Sound unavailable: ${state.sound.error ?? "Reload to retry."}` : "",
    );
    const name = state.driveMode === "grip" ? "Grip" : "Drift";
    modeHint(`Live in ${name} mode / base friction ${driveModes[state.driveMode].friction}`);
    if (status.hidden === state.status.visible) status.hidden = !state.status.visible;
    if (status.classList.contains("error") !== state.status.error)
      status.classList.toggle("error", state.status.error);
    const role = state.status.error ? "alert" : "status";
    if (status.getAttribute("role") !== role) status.setAttribute("role", role);
    const loaded = !state.status.visible && !state.status.error;
    if (footer.classList.contains("loaded") !== loaded) footer.classList.toggle("loaded", loaded);
    statusText(state.status.message);
  });
}
