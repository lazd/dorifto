import { isDriveMode, type DriveMode } from './drive-modes';
import { bindBotDialog } from './bot-dialog';
import { createDrivingTuning } from './drift-tuning';
import { redlineRpm } from './drivetrain';
import { speedInUnit } from './speed-units';
import {
  courseRoute,
  generateCourse,
  loadCourseDefinition,
  racetracks,
  roads,
  type CourseDefinition,
} from './courses';
import { coursePreviewSvg } from './course-preview';
import { CourseBuilderPreview } from './course-builder-preview';
import type { BuildResponse } from './course-builder-worker';
import { startTextSpinner } from './text-spinner';
import { download } from './download';
import { browserStorage } from './browser-storage';
import {
  courseDirectionRecords,
  bestRunTime,
  describeRun,
  exportRun,
  replayStorageKey,
  type RunSummary,
} from './lap-recording';
import './course-picker.css';
import { bindSettingsLayout } from './settings';
import { bindControlsSettings } from './controls-settings';
import {
  isCameraStyle,
  courseGhostMode,
  isGhostMode,
  isLapGateMode,
  isMinimapOrientation,
  isMirrorResolution,
  isPixelRatio,
  isSpeedUnit,
  isTerrainShadows,
  isTimeOfDay,
  type ConfigurationState,
  type LapGateMode,
} from './configuration-state';
import type { GameState } from './game-state';
import {
  nextCustomPresetName,
  nextTuningPresetId,
  persistTuningPresets,
  type TuningPreset,
} from './tuning-presets';
import { formatLapTime } from './laps';
import { hasRealDriver } from './real-driver';
import { defaultRaceOptions, raceModes, isRaceMode, type RaceOptions } from './race-rules';
import type { Store } from './store';
import { isTurnSignMode } from './turn-sign';
import { isStereoStationSelection, stereoStations } from './stereo';
import type { RaceBotOptions } from './race-bot';
import {
  courseGenerationFields,
  defaultCourseWeights,
  generateCustomCourse,
  validateCourseWeights,
  type CourseGenerationWeights,
} from './course-generation';

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

function notifyUIVisibility() {
  document.dispatchEvent(new Event('driving-ui-change'));
}

const hudVisibilityStates = new WeakMap<HTMLElement, { content: boolean; hud: boolean }>();

export function setHudElementHidden(
  node: HTMLElement,
  hidden: boolean,
  reason: 'content' | 'hud' = 'content',
) {
  let state = hudVisibilityStates.get(node);
  if (!state) {
    state = { content: node.hidden, hud: false };
    hudVisibilityStates.set(node, state);
  }
  state[reason] = hidden;
  const next = state.content || state.hud;
  if (node.hidden !== next) node.hidden = next;
}

export function createHudVisibilityCycle() {
  const groups = [
    [element('.controls')],
    [element('.telemetry'), element('.lap-recorder')],
    [element('.course-hud'), element('footer')],
  ];
  let level = 0;
  const set = (nextLevel: number) => {
    if (!Number.isInteger(nextLevel) || nextLevel < 0 || nextLevel > groups.length)
      throw new RangeError(`Invalid HUD visibility level: ${nextLevel}`);
    level = nextLevel;
    groups.forEach((nodes, index) => {
      nodes.forEach((node) => setHudElementHidden(node, level > index, 'hud'));
    });
  };
  return {
    set,
    cycle() {
      set((level + 1) % (groups.length + 1));
      return level;
    },
  };
}

function bindCourseHud() {
  const hud = element('.course-hud');
  hud.addEventListener('keydown', (event) => event.stopPropagation());
  hud.addEventListener('keyup', (event) => event.stopPropagation());
}

function bindDialog(trigger: string, selector: string, onOpen?: () => void) {
  const dialog = element<HTMLDialogElement>(selector);
  const opener = element(trigger);
  let returnFocus = opener;
  const close = () => {
    if (dialog.getAttribute('aria-busy') === 'true') return;
    dialog.close();
    notifyUIVisibility();
  };
  const open = (source: HTMLElement = opener) => {
    if (dialog.open) return;
    returnFocus = source;
    onOpen?.();
    dialog.dispatchEvent(new Event('dialog-open'));
    dialog.showModal();
    dialog.scrollTop = 0;
    notifyUIVisibility();
  };
  opener.addEventListener('click', () => open());
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    event.preventDefault();
    const disclosure = dialog.querySelector<HTMLDetailsElement>('details.action-disclosure[open]');
    if (disclosure) {
      disclosure.open = false;
      disclosure.querySelector<HTMLElement>('summary')?.focus();
      return;
    }
    close();
  });
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    notifyUIVisibility();
    (returnFocus.closest('[hidden]') ? element('#minimap') : returnFocus).focus();
  });
  bindDialogBackdrop(dialog, close);
  dialog.addEventListener('click', (event) => {
    for (const disclosure of dialog.querySelectorAll<HTMLDetailsElement>(
      'details.action-disclosure[open]',
    )) {
      if (event.target instanceof Node && !disclosure.contains(event.target)) {
        disclosure.open = false;
      }
    }
  });
  return open;
}

export function bindDialogBackdrop(dialog: HTMLDialogElement, close: () => void) {
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
  dialog.addEventListener('pointerdown', (event) => {
    pressedOutside = outside(event);
  });
  dialog.addEventListener('click', (event) => {
    if (pressedOutside && outside(event)) close();
    pressedOutside = false;
  });
}

export function formatHudSpeed(speed: number, unit: ConfigurationState['speedUnit']) {
  return String(Math.round(speedInUnit(speed, unit)));
}

function bindTachometer() {
  const tach = element('#tachometer');
  const dial = tach.querySelector<SVGSVGElement>('.tach-dial')!;
  const maxRpm = Number(tach.getAttribute('aria-valuemax'));
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
      const zone = rpm >= redlineRpm ? 'redline' : rpm >= 6000 ? 'warning' : '';
      return `<path class="tach-segment ${zone}" d="M${point(116, start)} A116 116 0 0 1 ${point(116, end)} L${point(101, end)} A101 101 0 0 0 ${point(101, start)} Z"/>`;
    }).join('') +
    Array.from(
      { length: 9 },
      (_, index) =>
        `<text class="tach-number ${index * 1000 >= redlineRpm ? 'redline' : ''}" x="${point(86, index / 8).split(',')[0]}" y="${point(86, index / 8).split(',')[1]}">${index}</text>`,
    ).join('');
  const segments = [...dial.querySelectorAll('.tach-segment')];

  const displaySpeed = bindSegmentedReadout('#speed-led', 3);
  let previousRpm = -1;
  let previousSegments = -1;
  let previousLimiter = false;
  return (rpm: number, speed: string, limiter: boolean) => {
    const count = Math.round(Math.max(0, Math.min(1, rpm / maxRpm)) * segmentCount);
    if (count !== previousSegments) {
      segments.forEach((segment, index) => segment.classList.toggle('lit', index < count));
      previousSegments = count;
    }
    const displayedRpm = Math.max(0, Math.min(maxRpm, Math.round(rpm / 50) * 50));
    if (displayedRpm !== previousRpm) {
      tach.setAttribute('aria-valuenow', String(displayedRpm));
      previousRpm = displayedRpm;
    }
    if (limiter !== previousLimiter) {
      tach.classList.toggle('limiter', limiter);
      previousLimiter = limiter;
    }
    displaySpeed(speed);
  };
}

function bindSegmentedReadout(selector: string, columns: number) {
  const led = document.querySelector<SVGSVGElement>(selector);
  if (!led) throw new Error(`Missing segmented readout: ${selector}`);
  const shapes = [
    '7,2 29,2 33,6 29,10 7,10 3,6',
    '30,11 34,7 34,27 30,31 26,27 26,15',
    '30,33 34,37 34,57 30,61 26,57 26,37',
    '7,54 29,54 33,58 29,62 7,62 3,58',
    '2,37 6,33 10,37 10,57 6,61 2,57',
    '2,7 6,11 10,15 10,27 6,31 2,27',
    '7,28 29,28 33,32 29,36 7,36 3,32',
  ];
  const digits: Record<string, string> = {
    '0': 'abcdef',
    '1': 'bc',
    '2': 'abdeg',
    '3': 'abcdg',
    '4': 'bcfg',
    '5': 'acdfg',
    '6': 'acdefg',
    '7': 'abc',
    '8': 'abcdefg',
    '9': 'abcdfg',
    N: 'ceg',
    R: 'eg',
    ' ': '',
  };
  led.innerHTML = Array.from(
    { length: columns },
    (_, index) =>
      `<g transform="translate(${index * 44} 0)">${shapes.map((points) => `<polygon points="${points}"/>`).join('')}</g>`,
  ).join('');
  const ledDigits = [...led.querySelectorAll('g')].map((group) => [...group.children]);
  let previous = '';
  return (value: string) => {
    if (value !== previous) {
      const display = value.padStart(columns, ' ').slice(-columns);
      ledDigits.forEach((segments, index) => {
        const active = digits[display[index]];
        if (active === undefined)
          throw new Error(`Unsupported segmented character: ${display[index]}`);
        segments.forEach((segment, part) =>
          segment.classList.toggle('lit', active.includes('abcdefg'[part])),
        );
      });
      previous = value;
    }
  };
}

export function bindGameActions(actions: {
  sound: (muted: boolean) => void;
  clearInput: () => void;
  setUIOpen: (open: boolean) => void;
}) {
  const syncUIOpen = () => actions.setUIOpen(document.querySelector('dialog[open]') !== null);
  document.addEventListener('driving-ui-change', syncUIOpen);
  syncUIOpen();
  const sound = element<HTMLInputElement>('#sound');
  sound.addEventListener('change', () => {
    const muted = !sound.checked;
    actions.sound(muted);
    const url = new URL(location.href);
    if (muted) url.searchParams.set('sound', 'off');
    else url.searchParams.delete('sound');
    history.replaceState(null, '', url);
  });
  element('#drift-tuning').addEventListener('focusin', actions.clearInput);
}

export function bindLapRecorder(
  store: Store<GameState>,
  actions: {
    press: () => void;
    seek: (time: number) => void;
  },
) {
  const container = element('.lap-recorder');
  const button = element<HTMLButtonElement>('#lap-recorder-button');
  const label = bindText('#lap-recorder-label');
  const replayControls = element('#lap-replay-controls');
  const replayTime = bindText('#lap-replay-time');
  const previous = element<HTMLButtonElement>('#lap-replay-previous');
  const next = element<HTMLButtonElement>('#lap-replay-next');
  for (const [button, direction] of [
    [previous, 'previous'],
    [next, 'next'],
  ] as const) {
    button.addEventListener('click', () => {
      const time = store.getState().lapRecorder.replayLap?.[direction];
      if (time !== null && time !== undefined) actions.seek(time);
      button.blur();
    });
  }
  button.addEventListener('click', () => {
    actions.press();
    button.blur();
  });
  label('REC');
  button.title = 'Stop recording, save laps and replay them';
  button.setAttribute('aria-label', button.title);
  store.subscribe(
    ({ lapRecorder }) => {
      const { mode } = lapRecorder;
      const lap = lapRecorder.replayLap;
      button.hidden = mode !== 'recording';
      replayControls.hidden = mode !== 'replay';
      previous.disabled = lap?.previous == null;
      next.disabled = lap?.next == null;
      replayTime(
        lap
          ? lap.lap
            ? `Lap ${lap.lap} · ${lap.time === null ? 'Partial lap' : formatLapTime(lap.time)}${lap.fastest ? ' 🏆' : ''}`
            : 'Launch'
          : '',
      );
      setHudElementHidden(container, mode === 'off' || mode === 'ready');
      if (button.dataset.mode !== mode) button.dataset.mode = mode;
    },
    ['lapRecorder'],
  );
}

function writeTuningPresetQuery(mode: DriveMode, presetId: string | null) {
  const url = new URL(location.href);
  url.searchParams.set('mode', mode);
  url.searchParams.set('preset', presetId ?? 'custom');
  history.replaceState(null, '', url);
}

function bindTuningPresets(
  store: Store<ConfigurationState>,
  reportError: (error: unknown) => void,
) {
  const title = bindText('#tuning-preset-title');
  const presetError = element<HTMLElement>('#tuning-profile-error');
  const presetsSelect = element<HTMLSelectElement>('#tuning-preset');
  const editInput = element<HTMLInputElement>('#tuning-preset-edit-name');
  const edit = element<HTMLButtonElement>('#tuning-preset-edit');
  const remove = element<HTMLButtonElement>('#tuning-preset-delete');
  let renderedMode: ConfigurationState['driveMode'] | null = null;
  let renderedPresets: ConfigurationState['tuningPresets'] | null = null;
  let editingPresetId: string | null = null;

  const clearPresetError = () => {
    presetError.textContent = '';
    editInput.removeAttribute('aria-invalid');
  };
  const showPresetError = (message: string, problem?: unknown, invalidName = false) => {
    presetError.textContent = message;
    if (invalidName) editInput.setAttribute('aria-invalid', 'true');
    else editInput.removeAttribute('aria-invalid');
    if (problem !== undefined) reportError(problem);
  };
  const showNameEditor = (preset: TuningPreset) => {
    editingPresetId = preset.id;
    editInput.value = preset.name;
    clearPresetError();
    edit.closest('details')?.removeAttribute('open');
    presetsSelect.hidden = true;
    edit.hidden = true;
    editInput.hidden = false;
    editInput.focus();
    editInput.select();
  };

  presetsSelect.addEventListener('change', () => {
    const state = store.getState();
    const presetId = presetsSelect.value;
    if (presetId === 'new') {
      const preset: TuningPreset = {
        id: nextTuningPresetId(state.driveMode, state.tuningPresets),
        name: nextCustomPresetName(state.driveMode, state.tuningPresets),
        mode: state.driveMode,
        tuning: { ...state.profiles[state.driveMode] },
      };
      const tuningPresets = [...state.tuningPresets, preset];
      try {
        persistTuningPresets(browserStorage, tuningPresets);
        store.update({
          tuningPresets,
          selectedTuningPresets: { ...state.selectedTuningPresets, [state.driveMode]: preset.id },
        });
        writeTuningPresetQuery(state.driveMode, preset.id);
        showNameEditor(preset);
      } catch (error) {
        showPresetError('Unable to create tuning profile.', error);
      }
      return;
    }
    const preset = state.tuningPresets.find(
      ({ id, mode }) => id === presetId && mode === state.driveMode,
    );
    if (!preset) return;
    clearPresetError();
    edit.closest('details')?.removeAttribute('open');
    store.update({
      profiles: {
        ...state.profiles,
        [state.driveMode]: { ...preset.tuning },
      },
      selectedTuningPresets: { ...state.selectedTuningPresets, [state.driveMode]: preset.id },
    });
    writeTuningPresetQuery(state.driveMode, preset.id);
  });

  editInput.addEventListener('input', () => {
    if (!editingPresetId) return;
    const state = store.getState();
    const preset = state.tuningPresets.find(({ id }) => id === editingPresetId);
    if (!preset) return;
    const name = editInput.value.trim();
    if (!name) {
      showPresetError('Enter a profile name.', undefined, true);
      return;
    }
    const duplicate = state.tuningPresets.some(
      (entry) =>
        entry.mode === preset.mode &&
        entry.id !== preset.id &&
        entry.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
    );
    if (duplicate) {
      showPresetError(
        'A profile with that name already exists for this drive mode.',
        undefined,
        true,
      );
      return;
    }
    if (name === preset.name) {
      clearPresetError();
      return;
    }
    const tuningPresets = state.tuningPresets.map((entry) =>
      entry.id === preset.id ? { ...entry, name } : entry,
    );
    try {
      persistTuningPresets(browserStorage, tuningPresets);
      store.update({ tuningPresets });
      clearPresetError();
    } catch (error) {
      showPresetError('Unable to save tuning profile name.', error);
    }
  });

  edit.addEventListener('click', () => {
    const state = store.getState();
    const preset = state.tuningPresets.find(
      ({ id, mode }) => id === presetsSelect.value && mode === state.driveMode,
    );
    if (!preset || preset.readonly) return;
    showNameEditor(preset);
  });

  editInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      editInput.blur();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      editInput.blur();
    }
  });

  editInput.addEventListener('blur', () => {
    const presetId = editingPresetId;
    editingPresetId = null;
    presetsSelect.hidden = false;
    editInput.hidden = true;
    edit.hidden = false;
    if (!presetId) return;
    const state = store.getState();
    const preset = state.tuningPresets.find(({ id }) => id === presetId);
    if (!preset) return;
    editInput.value = preset.name;
    clearPresetError();
  });

  remove.addEventListener('click', () => {
    const state = store.getState();
    const preset = state.tuningPresets.find(
      ({ id, mode }) => id === presetsSelect.value && mode === state.driveMode,
    );
    if (!preset || preset.readonly) return;
    const defaultPreset = state.tuningPresets.find(
      ({ id, mode }) => id === `${state.driveMode}-default` && mode === state.driveMode,
    );
    if (!defaultPreset) {
      showPresetError(
        `Missing Default tuning profile for ${state.driveMode} mode.`,
        new Error(`Missing Default tuning preset for ${state.driveMode} mode`),
      );
      return;
    }
    const tuningPresets = state.tuningPresets.filter(({ id }) => id !== preset.id);
    try {
      persistTuningPresets(browserStorage, tuningPresets);
      store.update({
        tuningPresets,
        profiles: {
          ...state.profiles,
          [state.driveMode]: { ...defaultPreset.tuning },
        },
        selectedTuningPresets: {
          ...state.selectedTuningPresets,
          [state.driveMode]: defaultPreset.id,
        },
      });
      writeTuningPresetQuery(state.driveMode, defaultPreset.id);
      clearPresetError();
    } catch (error) {
      showPresetError('Unable to delete tuning profile.', error);
    }
    remove.closest('details')?.removeAttribute('open');
    presetsSelect.focus();
  });

  store.subscribe(
    (state) => {
      const modeName = state.driveMode === 'grip' ? 'Grip' : 'Drift';
      if (renderedMode !== state.driveMode && editingPresetId !== null) {
        editingPresetId = null;
        editInput.blur();
        presetsSelect.hidden = false;
        editInput.hidden = true;
        edit.hidden = false;
      }
      title(`${modeName} tuning profile`);
      presetsSelect.setAttribute('aria-label', `${modeName} tuning preset`);
      const modePresets = state.tuningPresets.filter(({ mode }) => mode === state.driveMode);
      if (renderedMode !== state.driveMode || renderedPresets !== state.tuningPresets) {
        const emptyOption = new Option('', '');
        emptyOption.hidden = true;
        emptyOption.disabled = true;
        presetsSelect.replaceChildren(
          emptyOption,
          new Option('New preset...', 'new'),
          ...modePresets.map(({ id, name }) => new Option(name, id)),
        );
        renderedMode = state.driveMode;
        renderedPresets = state.tuningPresets;
      }
      const selectedPresetId = state.selectedTuningPresets[state.driveMode] ?? '';
      presetsSelect.value = selectedPresetId;
      const selectedPreset = modePresets.find(({ id }) => id === selectedPresetId);
      remove.disabled = !selectedPreset || selectedPreset.readonly === true;
      edit.disabled = !selectedPreset || selectedPreset.readonly === true;
    },
    ['driveMode', 'tuningPresets', 'selectedTuningPresets'],
  );
}

export interface CoursePickerActions {
  isSavedCourse: (id: string) => boolean;
  refreshCourses: () => Promise<readonly CourseDefinition[]>;
  changeCourse: (
    id: string,
    seed?: number,
    weights?: CourseGenerationWeights,
    reverse?: boolean,
    race?: RaceOptions,
  ) => Promise<CourseDefinition>;
  changeDirection: (reverse: boolean) => Promise<void>;
  saveCourse: (name: string, definition?: CourseDefinition) => Promise<CourseDefinition>;
  updateCourse: (course: CourseDefinition) => Promise<CourseDefinition>;
  /** Deleting the active course loads a fallback; returns the active course afterwards. */
  deleteCourse: (id: string) => Promise<CourseDefinition>;
  /** Plays a saved run of the active course and direction, resetting the race. */
  playRun: (runId: string) => Promise<void>;
  deleteReplay: (course: CourseDefinition, reverse: boolean, runId: string) => Promise<void>;
  reportError: (error: unknown) => void;
  getCourseWeights: () => CourseGenerationWeights;
  setCourseWeights: (weights: CourseGenerationWeights) => void;
  getRaceOptions: () => RaceOptions;
}

const courseGroups = [
  { id: 'stored', label: 'Your tracks', badge: 'Saved' },
  { id: 'current', label: 'Current layout', badge: 'Unsaved' },
  { id: 'roads', label: 'Roads', badge: 'Road' },
  { id: 'racetracks', label: 'Racetracks', badge: 'Racetrack' },
  { id: 'built-in', label: 'Built-in courses', badge: 'Built-in' },
] as const;

const isUnsavedCourse = ({ id }: { id: string }) => id === 'random' || id === 'custom';

function courseGroup(course: CourseDefinition, saved: boolean) {
  if (isUnsavedCourse(course)) return courseGroups[1];
  if (saved) return courseGroups[0];
  if (roads.some(({ id }) => id === course.id)) return courseGroups[2];
  return racetracks.some(({ id }) => id === course.id) ? courseGroups[3] : courseGroups[4];
}

const courseDistances = new WeakMap<CourseDefinition, string>();
function courseDistance(course: CourseDefinition) {
  let distance = courseDistances.get(course);
  if (!distance) {
    const length = courseRoute(course).getLength();
    distance = length < 1000 ? `${Math.round(length)} m` : `${(length / 1000).toFixed(2)} km`;
    courseDistances.set(course, distance);
  }
  return distance;
}

const directionLabel = (reverse: boolean) => (reverse ? 'Reverse' : 'Forward');
const routeLabel = (course: CourseDefinition) =>
  course.closed === false ? 'Open route' : 'Closed loop';

function syncGhostOptions(
  selector: string,
  course: CourseDefinition,
  reverse: boolean,
  mode: ConfigurationState['ghostMode'],
) {
  const input = element<HTMLSelectElement>(selector);
  const realDriver = hasRealDriver(course, reverse);
  for (const option of input.options) {
    option.hidden =
      option.value === 'real'
        ? !realDriver
        : course.closed === false && (option.value === 'fastest' || option.value === 'previous');
    option.disabled = option.hidden;
  }
  input.value = courseGhostMode(mode, course.closed, realDriver);
}
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

function textElement(tag: string, className: string, text: string) {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

export function bindCoursePicker(
  options: readonly CourseDefinition[],
  selected: CourseDefinition,
  store: Store<ConfigurationState>,
  actions: CoursePickerActions,
) {
  const groupForCourse = (course: CourseDefinition) =>
    courseGroup(course, actions.isSavedCourse(course.id));
  const courses = [...options];
  const pickerButton = element<HTMLButtonElement>('#minimap');
  const picker = element<HTMLDialogElement>('#course-picker-dialog');
  const pickerError = bindText('#course-picker-error');
  const list = element('#course-list');
  const overview = element('#course-overview');
  const previewContainer = element('#course-preview-visual');
  const previewError = bindText('#course-preview-error');
  const previewName = bindText('#course-preview-name');
  const previewDistance = bindText('#course-preview-distance');
  const raceMode = element<HTMLSelectElement>('#course-race-mode');
  const raceLaps = element<HTMLInputElement>('#course-race-laps');
  const raceDescription = bindText('#course-race-description');
  const lapField = element('#course-laps-field');
  raceMode.value = actions.getRaceOptions().mode;
  raceLaps.value = String(actions.getRaceOptions().laps);
  function selectedRace(): RaceOptions {
    if (!isRaceMode(raceMode.value)) throw new Error('Choose a valid race mode');
    const laps = Number(raceLaps.value);
    if (!Number.isSafeInteger(laps) || laps < 1)
      throw new Error('Laps must be a positive whole number');
    return { mode: raceMode.value, laps: preview.closed === false ? 1 : laps };
  }
  function syncRaceOptions() {
    raceMode.querySelector<HTMLOptionElement>('[value="mustard"]')!.disabled =
      !preview.doubleYellow;
    if (!preview.doubleYellow && raceMode.value === 'mustard')
      raceMode.value = defaultRaceOptions.mode;
    lapField.hidden = preview.closed === false;
    syncGhostOptions('#course-ghost-mode', preview, direction, store.getState().ghostMode);
    const mode = raceMode.value;
    if (isRaceMode(mode)) raceDescription(raceModes[mode].description);
  }
  raceMode.addEventListener('change', () => {
    syncRaceOptions();
    renderRecords(preview);
  });
  const courseActions = element<HTMLDetailsElement>('#course-actions');
  const courseActionsSummary = courseActions.querySelector('summary')!;
  const downloadAction = element<HTMLButtonElement>('#course-download');
  let downloading = false;
  const editAction = element<HTMLButtonElement>('#course-edit');
  const deleteAction = element<HTMLButtonElement>('#course-delete');
  const records = element('#course-records');
  const viewReplays = element<HTMLButtonElement>('#course-view-replays');
  const replays = element('#course-replays');
  const replaysBack = element<HTMLButtonElement>('#course-replays-back');
  const replaysTitle = element('#course-replays-title');
  const replaysDirection = bindText('#course-replays-direction');
  const replayRuns = element('#course-replay-runs');
  const loadButton = element<HTMLButtonElement>('#course-load');
  const savedDialog = element<HTMLDialogElement>('#saved-course-dialog');
  const savedForm = element<HTMLFormElement>('#saved-course-form');
  const savedTitle = bindText('#saved-course-title');
  const savedDescription = element<HTMLDivElement>('#saved-course-description');
  const savedNameField = element('#saved-course-name-field');
  const savedNameInput = element<HTMLInputElement>('#saved-course-name');
  const savedError = bindText('#saved-course-error');
  const savedCancel = element<HTMLButtonElement>('#saved-course-cancel');
  const savedConfirm = element<HTMLButtonElement>('#saved-course-confirm');
  const courseName = bindText('#course-name');
  const generator = element<HTMLDialogElement>('#course-generator');
  const generatorForm = element<HTMLFormElement>('#course-generator-form');
  const draftName = element<HTMLInputElement>('#course-draft-name');
  const createButton = element<HTMLButtonElement>('#course-create');
  const savePreview = element<HTMLButtonElement>('#course-save-preview');
  const editDraft = element<HTMLButtonElement>('#course-edit-draft');
  const directions = [...picker.querySelectorAll<HTMLInputElement>('[name="course-direction"]')];
  const generationTypes = [...generator.querySelectorAll<HTMLInputElement>('[name="generation"]')];
  const generationFields = element<HTMLFieldSetElement>('#custom-course-sliders');
  const regenerate = element<HTMLButtonElement>('#custom-course-generate');
  let generationTimer: ReturnType<typeof setTimeout> | undefined;
  const roadEditor = element<HTMLIFrameElement>('#course-road-editor');
  const roadLoading = element('#course-road-loading');
  let stopRoadSpinner: (() => void) | undefined;
  const pickerLoading = element('#course-picker-loading');
  let stopPickerSpinner: (() => void) | undefined;
  let roadLoadingTimer: ReturnType<typeof setTimeout> | undefined;
  const creationPreview = element('#creation-preview');
  const creationDistance = bindText('#creation-distance');
  const creationError = bindText('#course-creation-error');
  const creationSave = element<HTMLButtonElement>('#course-creation-save');
  const roadCancel = element<HTMLButtonElement>('#course-road-cancel');
  let roadCanSave = false;
  let roadBuilding = false;
  let generationSeed = 0;
  let automaticCourseName = true;
  let editingCourse: CourseDefinition | undefined;
  const previewToggle = element<HTMLButtonElement>('#course-preview-toggle');
  let preview3d: CourseBuilderPreview | undefined;
  let showing3d = false;
  let previewWorker: Worker | undefined;
  let previewLoading = false;
  const items = new Map<string, HTMLButtonElement>();
  let preview = selected;
  let previewToken = 0;
  let previewTimer: ReturnType<typeof setTimeout> | undefined;
  let stopPreviewSpinner: (() => void) | undefined;
  let changing = false;
  let draft: { course?: CourseDefinition; name: string } | undefined;
  let creating = false;
  let draftSelected = false;
  let direction = store.getState().courseReverse;

  function renderList() {
    items.clear();
    // An unsaved generated layout is listed only while it is the active course.
    const listed = isUnsavedCourse(selected) ? [selected, ...courses] : courses;
    let savedSection: HTMLElement | undefined;
    list.replaceChildren(
      ...courseGroups.flatMap((group) => {
        const members = listed.filter((course) => groupForCourse(course) === group);
        if (!members.length && group.id === 'current') return [];
        const section = document.createElement('section');
        section.className = 'selection-group course-list';
        section.setAttribute('role', 'group');
        section.setAttribute('aria-labelledby', `courses-${group.id}-heading`);
        const heading = document.createElement('h3');
        heading.className = 'selection-group-heading';
        heading.id = `courses-${group.id}-heading`;
        heading.append(
          textElement('span', '', group.label),
          textElement('span', '', `${members.length}`),
        );
        section.append(heading);
        if (group.id === 'stored') {
          savedSection = section;
          section.append(createButton);
        }
        if (!members.length && group.id === 'stored' && !draft)
          section.append(textElement('p', 'help-text', 'Create a course to save your own layout.'));
        for (const course of members) {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'selection-item';
          item.setAttribute('role', 'option');
          const main = textElement('span', 'selection-item-main', '');
          const avatar = textElement('span', 'selection-avatar course-thumbnail', '');
          avatar.setAttribute('aria-hidden', 'true');
          avatar.innerHTML = coursePreviewSvg(course, { size: 64, padding: 4 });
          const text = document.createElement('span');
          text.append(
            textElement('span', 'selection-item-title', course.name),
            textElement(
              'span',
              'selection-item-meta',
              `${courseDistance(course)} · ${routeLabel(course)}`,
            ),
          );
          main.append(avatar, text);
          item.append(main);
          if (course.id === selected.id) {
            item.setAttribute('aria-current', 'true');
            item.append(textElement('span', 'selection-item-status', 'Current'));
          }
          item.addEventListener('click', () => previewCourse(course));
          section.append(item);
          items.set(course.id, item);
        }
        return section;
      }),
    );
    if (draft) {
      const item = textElement('button', 'selection-item', '') as HTMLButtonElement;
      item.type = 'button';
      item.setAttribute('role', 'option');
      const main = textElement('span', 'selection-item-main', '');
      const text = document.createElement('span');
      text.append(
        textElement('span', 'selection-item-title', draft.name || 'New course'),
        textElement('span', 'selection-item-meta', draft.course ? 'Unsaved preview' : 'Unsaved'),
      );
      const avatar = textElement('span', 'selection-avatar', '+');
      avatar.setAttribute('aria-hidden', 'true');
      main.append(avatar, text);
      item.append(main);
      item.addEventListener('click', () => {
        if (draft?.course) previewCourse(draft.course, true);
        else showGenerator();
      });
      if (!savedSection) throw new Error('Missing saved courses group');
      savedSection.append(item);
      items.set('new-course', item);
    }
    syncListSelection();
    syncBusy();
  }

  function syncListSelection() {
    for (const [id, item] of items) {
      const selected = draftSelected ? id === 'new-course' : id === preview.id;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
    }
  }

  list.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const options = [...items.entries()].filter(([, item]) => !item.disabled);
    const index = options.findIndex(([, item]) => item === event.target);
    if (index < 0) return;
    let next: number;
    switch (event.key) {
      case 'ArrowUp':
        next = Math.max(0, index - 1);
        break;
      case 'ArrowDown':
        next = Math.min(options.length - 1, index + 1);
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = options.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    if (next !== index) options[next][1].click();
    const item = items.get(options[next][0]);
    item?.focus({ preventScroll: true });
    item?.scrollIntoView({ block: 'nearest' });
  });

  function renderRecords(course: CourseDefinition) {
    viewReplays.hidden = true;
    viewReplays.onclick = null;
    let summaries;
    try {
      summaries = (
        draftSelected ? [] : courseDirectionRecords(course, browserStorage, selectedRace().mode)
      ).filter(
        (summary) =>
          summary.reverse === direction && (summary.record !== null || summary.runs.length),
      );
    } catch (error) {
      records.replaceChildren();
      previewError(`Unable to read records: ${errorText(error)}`);
      return;
    }
    if (!summaries.length) {
      const row = textElement('li', 'record-row', '');
      const text = document.createElement('div');
      text.append(textElement('div', 'record-time', 'No recorded lap yet'));
      row.append(text);
      records.replaceChildren(row);
      return;
    }
    records.replaceChildren(
      ...summaries.map(({ reverse, record, runs }) => {
        const row = textElement('li', 'record-row', '');
        const text = document.createElement('div');
        const recordRun =
          record === null
            ? undefined
            : runs.find((run) => bestRunTime(run, selectedRace().mode) === record);
        const time = textElement(recordRun ? 'button' : 'div', 'record-time', '');
        if (record !== null) time.append(textElement('span', 'badge badge-highlight', '🏆 Record'));
        time.append(
          textElement(
            'span',
            'record-time-value',
            record === null ? 'No full lap yet' : formatLapTime(record),
          ),
        );
        if (time instanceof HTMLButtonElement && recordRun && record !== null) {
          time.type = 'button';
          time.classList.add('button-link');
          time.setAttribute('aria-label', `Watch record lap ${formatLapTime(record)}`);
          time.addEventListener('click', () => void watchRun(course, reverse, recordRun.id));
        }
        text.append(time);
        if (runs.length) {
          viewReplays.hidden = false;
          viewReplays.textContent = `View replays (${runs.length})`;
          viewReplays.onclick = () => {
            courseActions.open = false;
            showReplays(course, reverse, record, runs);
          };
        }
        row.append(text);
        return row;
      }),
    );
  }

  function showReplays(
    course: CourseDefinition,
    direction: boolean,
    record: number | null,
    runs: readonly RunSummary[],
  ) {
    overview.hidden = true;
    replays.hidden = false;
    replaysTitle.textContent = `${course.name} replays`;
    replaysDirection(`Saved runs · ${directionLabel(direction)}`);
    replayRuns.replaceChildren(
      ...[...runs].reverse().map((run) => {
        const best = bestRunTime(run);
        const { date, laps } = describeRun(run);
        const driver = run.driver?.startsWith('bot') ? ' · Bot' : '';
        const row = textElement('li', 'record-row', '');
        row.title = 'Right-click to copy run JSON';
        row.addEventListener('contextmenu', async (event) => {
          event.preventDefault();
          pickerError('');
          try {
            const key = replayStorageKey({ ...course, reverse: direction });
            await navigator.clipboard.writeText(exportRun(key, run.id));
          } catch (error) {
            actions.reportError(error);
            pickerError(`Unable to copy run JSON: ${errorText(error)}`);
          }
        });
        const time = textElement(
          'div',
          'record-time',
          best === null ? '--:--.---' : formatLapTime(best),
        );
        time.append(textElement('span', 'help-text', best === null ? 'Partial lap' : 'Best lap'));
        if (best !== null && best === record)
          time.append(textElement('span', 'badge badge-highlight', '🏆 Record'));
        const text = document.createElement('div');
        text.append(
          time,
          textElement(
            'div',
            'help-text',
            `${date} · ${laps}${driver} · ${raceModes[run.mode ?? 'track-limits'].name}`,
          ),
        );
        const watch = textElement(
          'button',
          'button button-secondary',
          'Watch ↗',
        ) as HTMLButtonElement;
        watch.type = 'button';
        watch.setAttribute('aria-label', `Watch ${date} run, ${laps}`);
        watch.addEventListener('click', () => void watchRun(course, direction, run.id));
        const remove = textElement(
          'button',
          'button button-quiet danger',
          'Delete',
        ) as HTMLButtonElement;
        remove.type = 'button';
        remove.setAttribute('aria-label', `Delete ${date} run, ${laps}`);
        remove.addEventListener('click', () => {
          editSavedCourse('delete-replay', course, remove, { id: run.id, direction, date, laps });
        });
        const runActions = textElement('div', 'record-actions', '');
        runActions.append(remove, watch);
        row.append(text, runActions);
        return row;
      }),
    );
    syncBusy();
    replaysTitle.focus();
  }

  function showOverview() {
    replays.hidden = true;
    overview.hidden = false;
    creating = false;
  }

  function previewColors() {
    const style = getComputedStyle(previewContainer);
    const color = (name: string) => {
      const value = style.getPropertyValue(`--course-preview-${name}`).trim();
      if (!value) throw new Error(`Missing --course-preview-${name} color`);
      return value;
    };
    return {
      ground: color('ground'),
      road: color('road'),
      start: color('start'),
      light: color('light'),
      shade: color('shade'),
    };
  }

  function stopPreview() {
    ++previewToken;
    clearTimeout(previewTimer);
    previewTimer = undefined;
    previewWorker?.terminate();
    previewWorker = undefined;
    preview3d?.dispose();
    preview3d = undefined;
    showing3d = false;
    previewLoading = false;
    stopPreviewSpinner?.();
    stopPreviewSpinner = undefined;
    previewContainer.removeAttribute('aria-busy');
    previewToggle.textContent = '3D';
    previewToggle.setAttribute('aria-label', 'Show 3D course preview');
  }

  function render2d(course: CourseDefinition) {
    stopPreview();
    previewContainer.innerHTML = coursePreviewSvg(course, {
      size: 400,
      padding: 64,
      title: course.name,
    });
  }

  function showPreview3d(show: boolean) {
    stopPreviewSpinner?.();
    stopPreviewSpinner = undefined;
    showing3d = show;
    const canvas = previewContainer.querySelector('canvas');
    const svg = previewContainer.querySelector('svg');
    if (canvas) canvas.style.display = show ? '' : 'none';
    if (svg) svg.style.display = show ? 'none' : '';
    previewToggle.textContent = show ? '2D' : '3D';
    previewToggle.setAttribute('aria-label', `Show ${show ? '2D' : '3D'} course preview`);
  }

  async function buildPreview3d() {
    if (!picker.open || previewLoading || preview3d) return;
    clearTimeout(previewTimer);
    previewTimer = undefined;
    const course = preview;
    const token = ++previewToken;
    previewError('');
    previewLoading = true;
    previewToggle.textContent = '3D';
    previewToggle.setAttribute('aria-label', 'Building 3D course preview');
    stopPreviewSpinner = startTextSpinner(previewToggle);
    previewContainer.setAttribute('aria-busy', 'true');
    syncBusy();
    const fail = (error: unknown) => {
      if (token !== previewToken) return;
      console.error('Unable to show 3-D course preview:', error);
      render2d(course);
      previewError(`Unable to show 3-D preview: ${errorText(error)}`);
      syncBusy();
    };
    try {
      const definition = await loadCourseDefinition(course);
      if (token !== previewToken || !picker.open) return;
      const colors = previewColors();
      const active = new Worker(new URL('./course-builder-worker.ts', import.meta.url), {
        type: 'module',
      });
      previewWorker = active;
      active.onmessage = (event: MessageEvent<BuildResponse>) => {
        if (token !== previewToken || !picker.open) return;
        if (event.data.type === 'error') {
          fail(new Error(event.data.message));
          return;
        }
        if (event.data.type !== 'preview') return;
        active.terminate();
        previewWorker = undefined;
        try {
          preview3d = new CourseBuilderPreview(
            previewContainer,
            event.data.model,
            { ...colors, background: colors.ground },
            `Interactive 3D terrain preview of ${course.name}`,
          );
          previewLoading = false;
          previewContainer.removeAttribute('aria-busy');
          showPreview3d(true);
          syncBusy();
        } catch (error) {
          fail(error);
        }
      };
      active.onerror = (event) => {
        event.preventDefault();
        fail(new Error(event.message || 'The course preview worker stopped unexpectedly.'));
      };
      active.onmessageerror = () => fail(new Error('The course preview returned unreadable data.'));
      active.postMessage({ type: 'preview', course: definition, colors });
    } catch (error) {
      fail(error);
    }
  }

  previewToggle.addEventListener('click', () => {
    if (changing || previewLoading) return;
    if (preview3d) showPreview3d(!showing3d);
    else void buildPreview3d();
  });

  function previewCourse(course: CourseDefinition, isDraft = false) {
    const group = groupForCourse(course).id;
    if (course.id !== preview.id && (group === 'racetracks' || group === 'built-in')) {
      raceMode.value = defaultRaceOptions.mode;
      raceLaps.value = String(defaultRaceOptions.laps);
    }
    draftSelected = isDraft;
    preview = course;
    syncListSelection();
    showOverview();
    previewError('');
    previewName(course.name);
    previewDistance(
      `${courseDistance(course)}${course.closed === false ? '' : ' per lap'} · ${routeLabel(course)}`,
    );
    courseActions.open = false;
    editAction.hidden = groupForCourse(course).id !== 'stored';
    deleteAction.hidden = groupForCourse(course).id !== 'stored';
    savePreview.hidden = !isUnsavedCourse(course);
    editDraft.hidden = !isDraft;
    syncRaceOptions();
    renderRecords(course);
    render2d(course);
    syncBusy();
    previewTimer = setTimeout(() => {
      previewTimer = undefined;
      void buildPreview3d();
    }, 100);
  }

  function syncCourseName() {
    courseName(selected.name);
    syncGhostOptions(
      '#ghost-mode',
      selected,
      store.getState().courseReverse,
      store.getState().ghostMode,
    );
  }

  function syncBusy() {
    picker.setAttribute('aria-busy', String(changing));
    for (const control of picker.querySelectorAll<
      HTMLButtonElement | HTMLInputElement | HTMLSelectElement
    >('button, .master-detail input, .master-detail select'))
      control.disabled = changing;
    courseActionsSummary.toggleAttribute('aria-disabled', changing);
    downloadAction.disabled = changing || downloading;
    previewToggle.disabled = changing || previewLoading;
    savedConfirm.disabled = savedCancel.disabled = savedNameInput.disabled = changing;
    pickerButton.disabled = generationFields.disabled = changing;
    loadButton.disabled = changing || creating;
    loadButton.textContent = draftSelected && !creating ? 'Save & start race →' : 'Start race →';
    generator.setAttribute('aria-busy', String(changing || roadBuilding));
    for (const control of generator.querySelectorAll<
      HTMLButtonElement | HTMLInputElement | HTMLFieldSetElement
    >('button, input, fieldset'))
      control.disabled = changing || roadBuilding;
    creationSave.disabled =
      changing ||
      roadBuilding ||
      (creationMode() === 'roads'
        ? !roadCanSave || !roadEditor.hasAttribute('data-ready')
        : !draft?.course);
  }

  async function refreshPickerCourses() {
    pickerLoading.hidden = false;
    stopPickerSpinner = startTextSpinner(pickerLoading);
    try {
      return await actions.refreshCourses();
    } finally {
      stopPickerSpinner?.();
      stopPickerSpinner = undefined;
      pickerLoading.hidden = true;
    }
  }

  /** Runs one course operation at a time; returns false if another is already running. */
  async function exclusive(operation: () => Promise<void>) {
    if (changing) return false;
    changing = true;
    syncBusy();
    try {
      await operation();
    } finally {
      changing = false;
      syncBusy();
    }
    return true;
  }

  /** Loads a course; `generation` rebuilds a previewed unsaved layout instead of a new one. */
  async function selectCourse(id: string, generation?: CourseDefinition['generation']) {
    pickerError('');
    await exclusive(async () => {
      try {
        const race = selectedRace();
        const weights =
          generation?.type === 'custom'
            ? generation.weights
            : id === 'custom'
              ? actions.getCourseWeights()
              : undefined;
        if (weights) validateCourseWeights(weights);
        picker.close();
        selected = await actions.changeCourse(
          id,
          generation?.seed ??
            (isUnsavedCourse({ id }) ? crypto.getRandomValues(new Uint32Array(1))[0] : undefined),
          weights,
          direction,
          race,
        );
        syncCourseName();
      } catch (error) {
        actions.reportError(error);
        pickerError(errorText(error));
      }
    });
  }

  function showGenerator() {
    if (changing) return;
    automaticCourseName = true;
    editingCourse = undefined;
    element('#course-generator-title').textContent = 'Create course';
    generator.querySelector<HTMLFieldSetElement>('.creation-modes')!.hidden = false;
    for (const input of generationTypes) input.closest('label')!.hidden = false;
    if (!draft) {
      const names = new Set(courses.map(({ name }) => name));
      let name = 'New course';
      for (let number = 2; names.has(name); number++) name = `New course ${number}`;
      draft = { name };
    }
    creating = true;
    draftName.value = draft.name;
    creationError('');
    generator.showModal();
    notifyUIVisibility();
    updateCreationMode();
  }

  editAction.addEventListener('click', () => {
    if (changing) return;
    courseActions.open = false;
    editingCourse = preview;
    draft = { name: preview.name, course: structuredClone(preview) };
    draftName.value = preview.name;
    creating = true;
    creationError('');
    element('#course-generator-title').textContent = 'Edit course';
    generator.querySelector<HTMLFieldSetElement>('.creation-modes')!.hidden = true;
    const mode = preview.generation?.type ?? 'roads';
    generationSeed = preview.generation?.seed ?? 0;
    if (preview.generation?.type === 'custom') {
      actions.setCourseWeights({ ...preview.generation.weights });
      generator.dispatchEvent(new Event('refresh-weights'));
    }
    for (const input of generationTypes) {
      input.checked = input.value === mode;
      input.closest('label')!.hidden = input.value !== mode;
    }
    generator.showModal();
    notifyUIVisibility();
    updateCreationMode();
  });

  const creationMode = () => generationTypes.find((input) => input.checked)!.value;

  function generateDraft(newSeed = true) {
    if (!draft || changing || roadBuilding) return;
    creationError('');
    try {
      if (newSeed) generationSeed = crypto.getRandomValues(new Uint32Array(1))[0];
      const course =
        creationMode() === 'custom'
          ? generateCustomCourse(generationSeed, actions.getCourseWeights())
          : generateCourse(generationSeed);
      draft.course = {
        ...course,
        id: editingCourse?.id ?? course.id,
        name:
          (creationMode() === 'random' || automaticCourseName) && !editingCourse
            ? course.name
            : draftName.value.trim() || draft.name,
      };
      if ((creationMode() === 'random' || automaticCourseName) && !editingCourse) {
        draft.name = draft.course.name;
        draftName.value = draft.name;
      }
      creationPreview.innerHTML = coursePreviewSvg(draft.course, { size: 400, padding: 24 });
      creationDistance(`${courseDistance(draft.course)} · ${routeLabel(draft.course)}`);
    } catch (error) {
      draft.course = undefined;
      creationPreview.replaceChildren();
      creationDistance('');
      actions.reportError(error);
      creationError(`Unable to generate preview: ${errorText(error)}`);
    }
    syncBusy();
  }

  function updateCreationMode() {
    const mode = creationMode();
    const realRoads = mode === 'roads';
    generatorForm.dataset.mode = mode;
    draftName.closest<HTMLElement>('.field')!.hidden = mode === 'random';
    draftName.required = mode !== 'random';
    roadEditor.hidden = !realRoads;
    roadLoading.hidden = !realRoads || roadEditor.hasAttribute('data-ready');
    generatorForm.hidden = realRoads;
    creationSave.hidden = false;
    creationSave.textContent = 'Save course';
    roadCancel.hidden = !editingCourse;
    generationFields.hidden = mode !== 'custom';
    regenerate.hidden = mode !== 'random';
    clearTimeout(generationTimer);
    generationTimer = undefined;
    if (realRoads) {
      if (!roadEditor.hasAttribute('src')) {
        roadEditor.removeAttribute('data-ready');
        stopRoadSpinner = startTextSpinner(roadLoading);
        roadLoadingTimer = setTimeout(() => {
          roadLoadingTimer = undefined;
          roadLoading.hidden = true;
          stopRoadSpinner?.();
          stopRoadSpinner = undefined;
          const error = new Error('Course builder did not start. Close and reopen to try again.');
          actions.reportError(error);
          creationError(error.message);
        }, 30000);
        const url = new URL('./course-builder.html', location.href);
        url.searchParams.set('embedded', '1');
        if (editingCourse) url.searchParams.set('edit', editingCourse.id);
        roadEditor.src = url.href;
      }
    } else {
      if (editingCourse && draft?.course) {
        creationPreview.innerHTML = coursePreviewSvg(draft.course, { size: 400, padding: 24 });
        creationDistance(`${courseDistance(draft.course)} · ${routeLabel(draft.course)}`);
      } else generateDraft();
    }
    syncBusy();
  }

  async function savePreviewCourse(name: string) {
    const saved = await actions.saveCourse(name, preview);
    courses.push(saved);
    if (selected === preview) {
      selected = saved;
      syncCourseName();
    }
    if (draftSelected) draft = undefined;
    draftSelected = false;
    renderList();
    previewCourse(saved);
    return saved;
  }

  createButton.addEventListener('click', showGenerator);
  editDraft.addEventListener('click', showGenerator);
  draftName.addEventListener('input', () => {
    automaticCourseName = false;
    draftName.setCustomValidity('');
    if (!draft) return;
    draft.name = draftName.value;
    if (draft.course) draft.course.name = draft.name;
    const title = items.get('new-course')?.querySelector('.selection-item-title');
    if (title) title.textContent = draft.name.trim() || 'New course';
  });
  generationFields.addEventListener('input', () => {
    clearTimeout(generationTimer);
    generationTimer = setTimeout(() => {
      generationTimer = undefined;
      generateDraft(false);
    }, 120);
  });
  generationTypes.forEach((input) => input.addEventListener('change', updateCreationMode));
  generatorForm.addEventListener('submit', (event) => {
    event.preventDefault();
    generateDraft();
  });
  creationSave.addEventListener('click', async () => {
    if (creationMode() === 'roads') {
      if (!creationSave.disabled)
        roadEditor.contentWindow?.postMessage({ type: 'course-builder:save' }, location.origin);
      return;
    }
    if (generationTimer !== undefined) {
      clearTimeout(generationTimer);
      generationTimer = undefined;
      generateDraft(false);
    }
    draftName.setCustomValidity(
      creationMode() === 'random' || draftName.value.trim() ? '' : 'Enter a course name',
    );
    if (!generatorForm.reportValidity() || !draft?.course) return;
    await exclusive(async () => {
      try {
        if (!draft?.course) return;
        if (editingCourse) {
          const saved = await actions.updateCourse({
            ...draft.course,
            name: draftName.value.trim(),
          });
          courses[courses.findIndex((course) => course.id === saved.id)] = saved;
          if (selected.id === saved.id) selected = saved;
          draft = undefined;
          draftSelected = false;
          renderList();
          previewCourse(saved);
          syncCourseName();
        } else {
          preview = draft.course;
          draftSelected = true;
          await savePreviewCourse(draftName.value.trim());
        }
        generator.close();
      } catch (error) {
        actions.reportError(error);
        creationError(`Unable to save course: ${errorText(error)}`);
      }
    });
  });
  roadCancel.addEventListener('click', () => {
    if (!changing && !roadBuilding) generator.close();
  });
  generator.addEventListener('cancel', (event) => {
    if (changing || roadBuilding) event.preventDefault();
  });
  generator.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && (changing || roadBuilding)) {
      event.preventDefault();
      event.stopPropagation();
    }
  });
  generator.addEventListener('close', () => {
    clearTimeout(generationTimer);
    generationTimer = undefined;
    roadEditor.removeAttribute('src');
    roadEditor.removeAttribute('data-ready');
    roadCanSave = false;
    roadLoading.hidden = true;
    stopRoadSpinner?.();
    stopRoadSpinner = undefined;
    clearTimeout(roadLoadingTimer);
    roadLoadingTimer = undefined;
    roadBuilding = false;
    creating = false;
    editingCourse = undefined;
    if (!draftSelected) draft = undefined;
    renderList();
    syncBusy();
    notifyUIVisibility();
  });
  window.addEventListener('message', async (event: MessageEvent<unknown>) => {
    if (
      event.origin !== location.origin ||
      event.source !== roadEditor.contentWindow ||
      !generator.open ||
      typeof event.data !== 'object' ||
      event.data === null ||
      !('type' in event.data)
    )
      return;
    if (event.data.type === 'course-builder:ready') {
      clearTimeout(roadLoadingTimer);
      roadLoadingTimer = undefined;
      roadEditor.dataset.ready = 'true';
      roadLoading.hidden = true;
      stopRoadSpinner?.();
      stopRoadSpinner = undefined;
      creationError('');
      syncBusy();
    } else if (
      event.data.type === 'course-builder:controls' &&
      'canSave' in event.data &&
      typeof event.data.canSave === 'boolean'
    ) {
      roadCanSave = event.data.canSave;
      syncBusy();
    } else if (
      event.data.type === 'course-builder:busy' &&
      'busy' in event.data &&
      typeof event.data.busy === 'boolean'
    ) {
      roadBuilding = event.data.busy;
      syncBusy();
    } else if (event.data.type === 'course-builder:cancel') {
      if (!roadBuilding) generator.close();
    } else if (
      event.data.type === 'course-builder:saved' &&
      'id' in event.data &&
      typeof event.data.id === 'string'
    ) {
      const id = event.data.id;
      roadBuilding = false;
      await exclusive(async () => {
        try {
          const refreshed = await refreshPickerCourses();
          const saved = refreshed.find((course) => course.id === id);
          if (!saved) throw new Error('The saved road course was not found in OPFS.');
          courses.splice(0, courses.length, ...refreshed);
          draft = undefined;
          draftSelected = false;
          renderList();
          previewCourse(saved);
          generator.close();
        } catch (error) {
          actions.reportError(error);
          creationError(`Unable to open saved course: ${errorText(error)}`);
        }
      });
    }
  });
  directions.forEach((input) =>
    input.addEventListener('change', () => {
      direction = input.value === 'reverse';
      syncRaceOptions();
      renderRecords(preview);
    }),
  );

  async function watchRun(course: CourseDefinition, direction: boolean, runId: string) {
    pickerError('');
    await exclusive(async () => {
      try {
        if (course.id !== selected.id) {
          selected = await actions.changeCourse(course.id, undefined, undefined, direction);
          syncCourseName();
        } else if (store.getState().courseReverse !== direction)
          await actions.changeDirection(direction);
        await actions.playRun(runId);
        picker.close();
      } catch (error) {
        actions.reportError(error);
        pickerError(`Unable to play replay: ${errorText(error)}`);
      }
    });
  }

  let editing: {
    kind: 'delete' | 'save' | 'delete-replay';
    course: CourseDefinition;
    returnFocus: HTMLElement;
    replay?: { id: string; direction: boolean; date: string; laps: string };
  } | null = null;
  function editSavedCourse(
    kind: 'delete' | 'save' | 'delete-replay',
    course: CourseDefinition,
    returnFocus: HTMLElement,
    replay?: { id: string; direction: boolean; date: string; laps: string },
  ) {
    if (changing || savedDialog.open) return;
    editing = { kind, course, returnFocus, replay };
    courseActions.open = false;
    const deletingReplay = kind === 'delete-replay';
    const deleting = kind === 'delete' || deletingReplay;
    savedTitle(
      deletingReplay ? 'Delete replay?' : deleting ? 'Delete saved course?' : 'Save course',
    );
    if (deletingReplay && replay) {
      const request = textElement('p', '', '');
      const replayName = textElement('strong', '', `${replay.date} replay (${replay.laps})`);
      const courseName = textElement('strong', '', course.name);
      request.append(
        document.createTextNode('Remove the '),
        replayName,
        document.createTextNode(' from '),
        courseName,
        document.createTextNode(` (${directionLabel(replay.direction)})?`),
      );
      savedDescription.replaceChildren(request, textElement('p', '', 'This cannot be undone.'));
    } else if (deleting) {
      const request = textElement('p', '', '');
      request.append(
        document.createTextNode('Remove '),
        textElement('strong', '', course.name),
        document.createTextNode(' from your saved courses?'),
      );
      savedDescription.replaceChildren(request, textElement('p', '', 'This cannot be undone.'));
      if (course.id === selected.id)
        savedDescription.append(
          textElement('p', '', 'It is the current course, so the first built-in course will load.'),
        );
    } else {
      savedDescription.textContent = 'Name this layout to add it to your saved courses.';
    }
    savedNameField.hidden = deleting;
    savedNameInput.value = course.name;
    savedError('');
    savedConfirm.textContent = deletingReplay
      ? 'Delete replay'
      : deleting
        ? 'Delete course'
        : 'Save course';
    savedConfirm.classList.toggle('danger', deleting);
    savedDialog.showModal();
    notifyUIVisibility();
    if (deletingReplay) savedConfirm.focus();
    else if (deleting) savedCancel.focus();
    else savedNameInput.select();
  }

  async function confirmSavedCourse() {
    if (!editing) return;
    const { kind, course } = editing;
    savedError('');
    if (kind === 'delete-replay') {
      const replay = editing.replay;
      if (!replay) throw new Error('Missing replay to delete');
      try {
        await actions.deleteReplay(course, replay.direction, replay.id);
        const summary = courseDirectionRecords(course).find(
          ({ reverse }) => reverse === replay.direction,
        );
        renderRecords(course);
        if (summary?.runs.length)
          showReplays(course, replay.direction, summary.record, summary.runs);
        else showOverview();
        savedDialog.close();
      } catch (error) {
        console.error('Unable to delete replay:', error);
        savedError(`Unable to delete replay: ${errorText(error)}`);
      }
      return;
    }
    if (kind === 'save') {
      await exclusive(async () => {
        try {
          await savePreviewCourse(savedNameInput.value);
          savedDialog.close();
        } catch (error) {
          savedError(errorText(error));
        }
      });
      return;
    }
    const busy = await exclusive(async () => {
      try {
        selected = await actions.deleteCourse(course.id);
        courses.splice(courses.indexOf(course), 1);
        syncCourseName();
        renderList();
        if (picker.open) previewCourse(selected);
        savedDialog.close();
      } catch (error) {
        actions.reportError(error);
        savedError(errorText(error));
      }
    });
    if (!busy) savedError('Wait for the current course change to finish.');
  }

  savedForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void confirmSavedCourse();
  });
  savedCancel.addEventListener('click', () => savedDialog.close());
  savedDialog.addEventListener('cancel', (event) => {
    if (changing) event.preventDefault();
  });
  savedDialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    event.preventDefault();
    if (!changing) savedDialog.close();
  });
  savedDialog.addEventListener('close', () => {
    notifyUIVisibility();
    const target = editing?.returnFocus;
    editing = null;
    const fallback = picker.open
      ? !replays.hidden
        ? replaysTitle
        : (items.get(preview.id) ?? element('#course-picker-title'))
      : element('#minimap');
    (target?.isConnected && !target.closest('[hidden]') && !(target as HTMLButtonElement).disabled
      ? target
      : fallback
    ).focus();
  });
  downloadAction.addEventListener('click', async () => {
    if (changing || downloading) return;
    const course = preview;
    courseActions.open = false;
    previewError('');
    downloading = true;
    syncBusy();
    try {
      const definition = await loadCourseDefinition(course);
      download(
        new Blob([JSON.stringify(definition)], { type: 'application/json' }),
        `${definition.id}.json`,
      );
    } catch (error) {
      console.error(`Unable to download course "${course.name}":`, error);
      previewError(`Unable to download ${course.name}: ${errorText(error)}`);
    } finally {
      downloading = false;
      syncBusy();
    }
  });
  deleteAction.addEventListener('click', () =>
    editSavedCourse('delete', preview, courseActionsSummary),
  );
  courseActions.addEventListener('toggle', () => {
    if (changing) courseActions.open = false;
  });
  savePreview.addEventListener('click', () => editSavedCourse('save', preview, savePreview));
  replaysBack.addEventListener('click', () => {
    showOverview();
    records.querySelector<HTMLButtonElement>('button')?.focus();
  });
  loadButton.addEventListener('click', async () => {
    if (changing || creating) return;
    try {
      if (draftSelected) {
        const saved = await exclusive(async () => {
          await savePreviewCourse(draft?.name ?? '');
        });
        if (!saved) return;
      }
      void selectCourse(preview.id, isUnsavedCourse(preview) ? preview.generation : undefined);
    } catch (error) {
      pickerError(`Unable to save course: ${errorText(error)}`);
    }
  });
  picker.addEventListener('dialog-open', async () => {
    pickerError('');
    direction = store.getState().courseReverse;
    directions.forEach((input) => {
      input.checked = (input.value === 'reverse') === direction;
    });
    draft = undefined;
    draftSelected = false;
    creating = false;
    draftName.value = '';
    draftName.setCustomValidity('');
    renderList();
    previewCourse(selected);
    await exclusive(async () => {
      try {
        const refreshed = await refreshPickerCourses();
        if (!picker.open) return;
        courses.splice(0, courses.length, ...refreshed);
        renderList();
        previewCourse(courses.find(({ id }) => id === selected.id) ?? selected);
      } catch (error) {
        pickerError(`Unable to load saved tracks: ${errorText(error)}`);
      }
    });
  });
  picker.addEventListener('close', () => {
    stopPickerSpinner?.();
    stopPickerSpinner = undefined;
    pickerLoading.hidden = true;
    stopPreview();
  });

  syncCourseName();
  store.subscribe(
    ({ ghostMode, courseReverse }) => {
      syncGhostOptions('#ghost-mode', selected, courseReverse, ghostMode);
      syncGhostOptions('#course-ghost-mode', preview, direction, ghostMode);
    },
    ['ghostMode', 'courseReverse'],
  );
  syncBusy();
}

function bindCourseWeights(
  getWeights: () => CourseGenerationWeights,
  setWeights: (weights: CourseGenerationWeights) => void,
) {
  const fieldset = element<HTMLFieldSetElement>('#custom-course-sliders');
  let weights = getWeights();
  const refresh: (() => void)[] = [];
  const refreshWeights = () => {
    weights = getWeights();
    refresh.forEach((sync) => sync());
  };
  for (const { key, label: text, description, min, max, step } of courseGenerationFields) {
    const label = document.createElement('label');
    label.className = 'parameter-field';
    const title = document.createElement('span');
    const output = document.createElement('output');
    const input = document.createElement('input');
    const hint = document.createElement('small');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.id = `course-${key}`;
    label.htmlFor = output.htmlFor = input.id;
    title.id = `${input.id}-title`;
    title.textContent = text;
    hint.id = `${input.id}-hint`;
    hint.textContent = description;
    hint.className = 'help-text';
    input.setAttribute('aria-labelledby', title.id);
    input.setAttribute('aria-describedby', hint.id);
    const sync = () => {
      input.value = String(weights[key]);
      output.value =
        key === 'length'
          ? `${(weights[key] / 1000).toFixed(1)} km`
          : `${Math.round(weights[key] * 100)}%`;
      input.setAttribute('aria-valuetext', output.value);
    };
    input.addEventListener('input', () => {
      const next = { ...getWeights(), [key]: input.valueAsNumber };
      validateCourseWeights(next);
      setWeights(next);
      refreshWeights();
    });
    refresh.push(sync);
    label.append(title, output, input, hint);
    fieldset.append(label);
  }
  return refreshWeights;
}

export function bindStatusUI(store: Store<GameState>) {
  const status = element('#status');
  const statusText = bindText('#status-message');
  const close = element<HTMLButtonElement>('#status-close');
  const progress = element('#status-progress');
  const footer = element('footer');
  let initiallyLoaded = false;
  const dismissError = () => {
    const current = store.getState().status;
    if (!current.visible || !current.error || current.fatal) return false;
    if (document.activeElement === close) close.blur();
    store.update({ status: { visible: false, error: false, message: '' } });
    return true;
  };
  close.addEventListener('click', dismissError);
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || !dismissError()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true,
  );
  store.subscribe(
    (state) => {
      const current = state.status;
      if (status.hidden === current.visible) status.hidden = !current.visible;
      if (status.classList.contains('error') !== current.error)
        status.classList.toggle('error', current.error);
      const role = current.error ? 'alert' : 'status';
      if (status.getAttribute('role') !== role) status.setAttribute('role', role);
      close.hidden = !current.visible || !current.error || Boolean(current.fatal);
      if (!initiallyLoaded && !current.visible && !current.error) {
        initiallyLoaded = true;
        footer.classList.toggle('loaded', true);
      }
      statusText(current.message);
      const percent =
        current.progress === undefined || current.error ? null : Math.round(current.progress * 100);
      progress.hidden = percent === null;
      if (percent !== null && progress.getAttribute('aria-valuenow') !== String(percent)) {
        progress.setAttribute('aria-valuenow', String(percent));
        progress.style.setProperty('--progress', String(percent / 100));
      }
    },
    ['status'],
  );
  return dismissError;
}

export function bindGameUI(
  configuration: Store<ConfigurationState>,
  game: Store<GameState>,
  reportError: (error: unknown) => void,
) {
  let applyBotSettings: (
    bots: RaceBotOptions[],
    botsOnly: boolean,
  ) => void | Promise<void> = () => {
    throw new Error('Bot settings are not ready yet');
  };
  const dismissError = bindStatusUI(game);
  const hudVisibility = createHudVisibilityCycle();
  bindCourseHud();
  const speed = bindText('#speed');
  const gear = bindText('#gear');
  const displayGear = bindSegmentedReadout('#gear-led', 1);
  const tachometer = bindTachometer();
  const speedUnitLabel = bindText('#speed-unit-label');
  const driveModeLabel = bindText('#tach-drive-mode');
  const tuningProfileLabel = bindText('#tach-tuning-profile');
  const tuningProfile = element('#tach-tuning-profile');
  function updateDriverProfile() {
    const state = configuration.getState();
    const observed = game.getState().observedDriver;
    driveModeLabel((observed?.driveMode ?? state.driveMode) === 'grip' ? 'Grip' : 'Drift');
    const preset = state.tuningPresets.find(
      ({ id }) => id === state.selectedTuningPresets[state.driveMode],
    );
    const name = observed?.profile ?? preset?.name ?? 'Custom';
    tuningProfileLabel(name);
    tuningProfile.title = name;
  }
  configuration.subscribe(updateDriverProfile, [
    'driveMode',
    'selectedTuningPresets',
    'tuningPresets',
  ]);
  game.subscribe(updateDriverProfile, ['observedDriver']);
  function updateSpeed() {
    const t = game.getState().telemetry;
    const displayedSpeed = formatHudSpeed(t.speed, configuration.getState().speedUnit);
    speed(displayedSpeed);
    tachometer(t.rpm, displayedSpeed, t.limiter);
  }
  configuration.subscribe(
    ({ speedUnit }) => {
      speedUnitLabel(speedUnit === 'kmh' ? 'km/h' : 'MPH');
      updateSpeed();
    },
    ['speedUnit'],
  );
  const lap = bindText('#lap-number');
  const current = bindText('#lap-current');
  const currentLap = element('#lap-current');
  const best = bindText('#lap-best');
  const record = element('.minimap-best');
  let previousBest = game.getState().telemetry.best;
  let recordAnimation: Animation | undefined;
  const controller = bindText('#controller-status');
  createDrivingTuning(
    element('#drift-tuning-sliders'),
    configuration,
    writeTuningPresetQuery,
    reportError,
  );
  bindDialog('#tuning', '#drift-tuning');
  bindDialog('#settings', '#settings-dialog');
  bindSettingsLayout();
  bindControlsSettings(reportError);
  bindDialog(
    '#bots',
    '#bots-dialog',
    bindBotDialog(element('#bots-dialog'), (bots, botsOnly) => applyBotSettings(bots, botsOnly)),
  );
  let courseWeights = { ...defaultCourseWeights };
  const getCourseWeights = () => courseWeights;
  const setCourseWeights = (weights: CourseGenerationWeights) => {
    validateCourseWeights(weights);
    courseWeights = { ...weights };
  };
  const refreshCourseWeights = bindCourseWeights(getCourseWeights, setCourseWeights);
  element('#course-generator').addEventListener('refresh-weights', refreshCourseWeights);
  const openRaceSetup = bindDialog('#minimap', '#course-picker-dialog', refreshCourseWeights);
  const raceSetup = element('#race-setup');
  raceSetup.addEventListener('click', () => openRaceSetup(raceSetup));

  function select<Value extends string>(
    selector: string,
    parameter: string,
    key: keyof ConfigurationState,
    read: (state: Readonly<ConfigurationState>) => Value,
    write: (value: Value) => Partial<ConfigurationState>,
    valid: (value: string) => value is Value,
  ) {
    const input = element<HTMLSelectElement | HTMLInputElement>(selector);
    const readValue = () =>
      input instanceof HTMLInputElement && input.type === 'checkbox'
        ? input.checked
          ? 'on'
          : 'off'
        : input.value;
    input.addEventListener('change', () => {
      const value = readValue();
      if (!valid(value)) {
        reportError(new Error(`Unknown ${parameter}: ${value}`));
        return;
      }
      configuration.update(write(value));
      const url = new URL(location.href);
      url.searchParams.set(parameter, value);
      if (parameter === 'mirror-resolution') url.searchParams.delete('low-res-mirrors');
      if (parameter === 'mode' && isDriveMode(value)) {
        url.searchParams.set(
          'preset',
          configuration.getState().selectedTuningPresets[value] ?? 'custom',
        );
      }
      history.replaceState(null, '', url);
    });
    configuration.subscribe(
      (state) => {
        const value = read(state);
        if (input instanceof HTMLInputElement && input.type === 'checkbox') {
          input.checked = value === 'on';
        } else if (input.value !== value) input.value = value;
      },
      [key],
    );
  }
  const stationPicker = element<HTMLSelectElement>('#stereo-station');
  stationPicker.replaceChildren(
    new Option('Off', 'off'),
    ...stereoStations.map(({ id, name }) => new Option(name, id)),
  );
  select<ConfigurationState['stereoStation']>(
    '#stereo-station',
    'station',
    'stereoStation',
    (state) => state.stereoStation,
    (stereoStation) => ({ stereoStation }),
    isStereoStationSelection,
  );
  select<DriveMode>(
    '#drive-mode',
    'mode',
    'driveMode',
    (state) => state.driveMode,
    (driveMode) => ({ driveMode }),
    isDriveMode,
  );
  bindTuningPresets(configuration, reportError);
  select<ConfigurationState['cameraStyle']>(
    '#camera-style',
    'camera',
    'cameraStyle',
    (state) => state.cameraStyle,
    (cameraStyle) => ({ cameraStyle }),
    isCameraStyle,
  );
  select<ConfigurationState['timeOfDay']>(
    '#time-of-day',
    'time',
    'timeOfDay',
    (state) => state.timeOfDay,
    (timeOfDay) => ({ timeOfDay }),
    isTimeOfDay,
  );
  select<ConfigurationState['minimapOrientation']>(
    '#minimap-orientation',
    'minimap',
    'minimapOrientation',
    (state) => state.minimapOrientation,
    (minimapOrientation) => ({ minimapOrientation }),
    isMinimapOrientation,
  );
  select<ConfigurationState['speedUnit']>(
    '#speed-unit',
    'speed-unit',
    'speedUnit',
    (state) => state.speedUnit,
    (speedUnit) => ({ speedUnit }),
    isSpeedUnit,
  );
  const isToggle = (value: string): value is 'on' | 'off' => value === 'on' || value === 'off';
  select<ConfigurationState['mirrorResolution']>(
    '#mirror-resolution',
    'mirror-resolution',
    'mirrorResolution',
    (state) => state.mirrorResolution,
    (mirrorResolution) => ({ mirrorResolution }),
    isMirrorResolution,
  );
  select<ConfigurationState['pixelRatio']>(
    '#pixel-ratio',
    'pixel-ratio',
    'pixelRatio',
    (state) => state.pixelRatio,
    (pixelRatio) => ({ pixelRatio }),
    isPixelRatio,
  );
  select<ConfigurationState['terrainShadows']>(
    '#terrain-shadows',
    'terrain-shadows',
    'terrainShadows',
    (state) => state.terrainShadows,
    (terrainShadows) => ({ terrainShadows }),
    isTerrainShadows,
  );
  select<'on' | 'off'>(
    '#cabin-head-motion',
    'head-motion',
    'cabinHeadMotion',
    (state) => (state.cabinHeadMotion ? 'on' : 'off'),
    (value) => ({ cabinHeadMotion: value === 'on' }),
    isToggle,
  );
  select<'on' | 'off'>(
    '#show-fps',
    'fps',
    'showFps',
    (state) => (state.showFps ? 'on' : 'off'),
    (value) => ({ showFps: value === 'on' }),
    isToggle,
  );
  select<ConfigurationState['coneMode']>(
    '#show-cones',
    'cones',
    'coneMode',
    (state) => state.coneMode,
    (coneMode) => ({ coneMode }),
    (value): value is ConfigurationState['coneMode'] =>
      value === 'all' || value === 'corners' || value === 'off',
  );
  select<ConfigurationState['turnSignMode']>(
    '#show-turn-signs',
    'signs',
    'turnSignMode',
    (state) => state.turnSignMode,
    (turnSignMode) => ({ turnSignMode }),
    isTurnSignMode,
  );
  for (const selector of ['#ghost-mode', '#course-ghost-mode']) {
    select<ConfigurationState['ghostMode']>(
      selector,
      'ghost',
      'ghostMode',
      (state) => state.ghostMode,
      (ghostMode) => ({ ghostMode }),
      isGhostMode,
    );
  }
  select<'on' | 'off'>(
    '#show-grass',
    'grass',
    'showGrass',
    (state) => (state.showGrass ? 'on' : 'off'),
    (value) => ({ showGrass: value === 'on' }),
    isToggle,
  );
  select<'on' | 'off'>(
    '#show-kerbs',
    'kerbs',
    'showKerbs',
    (state) => (state.showKerbs ? 'on' : 'off'),
    (value) => ({ showKerbs: value === 'on' }),
    isToggle,
  );
  select<'on' | 'off'>(
    '#show-road-edge-dirt',
    'road-edge-dirt',
    'showRoadEdgeDirt',
    (state) => (state.showRoadEdgeDirt ? 'on' : 'off'),
    (value) => ({ showRoadEdgeDirt: value === 'on' }),
    isToggle,
  );
  select<LapGateMode>(
    '#show-lap-gates',
    'lap-gates',
    'lapGateMode',
    (state) => state.lapGateMode,
    (lapGateMode) => ({ lapGateMode }),
    isLapGateMode,
  );
  const focus = () => game.update({ focused: document.hasFocus() && !document.hidden });
  window.addEventListener('focus', focus);
  window.addEventListener('blur', focus);
  document.addEventListener('visibilitychange', focus);
  focus();
  const sound = element<HTMLInputElement>('#sound');
  const soundStatus = bindText('#sound-status');
  const telemetryPanel = element('.telemetry');
  const fpsCounter = element<HTMLOutputElement>('#fps-counter');
  configuration.subscribe(
    (state) => {
      // The cabin camera shows the car's own working gauges instead.
      setHudElementHidden(telemetryPanel, state.cameraStyle === 'cabin');
      const chaseView = state.cameraStyle !== 'cabin';
      (chaseView ? telemetryPanel : document.body).append(fpsCounter);
      if (document.body.classList.contains('chase-view') !== chaseView)
        document.body.classList.toggle('chase-view', chaseView);
    },
    ['cameraStyle'],
  );
  configuration.subscribe(
    ({ muted }) => {
      sound.checked = !muted;
    },
    ['muted'],
  );
  game.subscribe(
    ({ sound: state }) => {
      sound.disabled = state.failed;
      soundStatus(state.failed ? `Sound unavailable: ${state.error ?? 'Reload to retry.'}` : '');
    },
    ['sound'],
  );
  game.subscribe(
    (state) => {
      const t = state.telemetry;
      updateSpeed();
      const displayedGear = t.gear < 0 ? 'R' : t.gear === 0 ? 'N' : String(t.gear);
      gear(displayedGear);
      displayGear(displayedGear);
      lap(t.finished ? '🏁' : t.lap ? String(t.lap) : '--');
      current(formatLapTime(t.lap ? t.current : null));
      if (currentLap.classList.contains('is-invalid') !== t.invalid) {
        currentLap.classList.toggle('is-invalid', t.invalid);
        currentLap.setAttribute('aria-label', t.invalid ? 'Invalid lap time' : 'Current lap time');
        currentLap.title = t.invalid ? 'All four tires left the track: lap is invalid' : '';
      }
      best(formatLapTime(t.best));
      if (t.best !== previousBest) {
        recordAnimation?.cancel();
        if (
          t.best !== null &&
          (previousBest === null || t.best < previousBest) &&
          state.lapRecorder.mode !== 'replay'
        ) {
          const gold = getComputedStyle(record).getPropertyValue('--record-color');
          const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
          recordAnimation = record.animate(
            [
              { color: gold, opacity: 1 },
              { color: gold, opacity: reducedMotion ? 1 : 0.35 },
              { color: gold, opacity: 1 },
            ],
            { duration: 500, iterations: 4, easing: 'ease-in-out' },
          );
        }
        previousBest = t.best;
      }
      controller(state.controllerStatus);
    },
    ['telemetry', 'controllerStatus'],
  );
  return {
    getCourseWeights,
    setCourseWeights,
    setBotSettingsHandler(handler: typeof applyBotSettings) {
      applyBotSettings = handler;
    },
    dismissError,
    cycleHudVisibility: hudVisibility.cycle,
    setHudVisibility: hudVisibility.set,
  };
}
