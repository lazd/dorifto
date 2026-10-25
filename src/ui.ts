import { isDriveMode, type DriveMode } from './drive-modes';
import { bindBotDialog } from './bot-dialog';
import { createDrivingTuning } from './drift-tuning';
import { redlineRpm } from './drivetrain';
import {
  courseRoute,
  generateCourse,
  loadCourseDefinition,
  racetracks,
  roads,
  type CourseDefinition,
} from './courses';
import { coursePreviewSvg } from './course-preview';
import { CoursePreviewRenderer } from './course-preview-3d';
import {
  courseDirectionRecords,
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
  isGhostMode,
  isLapGateMode,
  isMinimapOrientation,
  isMirrorResolution,
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
    [element('.telemetry')],
    [element('#minimap')],
    [element('#race-panel')],
    [element('.course-hud'), element('.lap-recorder'), element('header'), element('footer')],
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
    for (const disclosure of dialog.querySelectorAll<HTMLDetailsElement>(
      'details.action-disclosure[open]',
    )) {
      if (event.target instanceof Node && !disclosure.contains(event.target)) {
        disclosure.open = false;
      }
    }
    if (pressedOutside && outside(event)) close();
    pressedOutside = false;
  });
  return open;
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

  const led = document.querySelector<SVGSVGElement>('#speed-led')!;
  const shapes = [
    '7,2 29,2 33,6 29,10 7,10 3,6',
    '30,11 34,7 34,27 30,31 26,27 26,15',
    '30,33 34,37 34,57 30,61 26,57 26,37',
    '7,54 29,54 33,58 29,62 7,62 3,58',
    '2,37 6,33 10,37 10,57 6,61 2,57',
    '2,7 6,11 10,15 10,27 6,31 2,27',
    '7,28 29,28 33,32 29,36 7,36 3,32',
  ];
  const digits = [
    'abcdef',
    'bc',
    'abdeg',
    'abcdg',
    'bcfg',
    'acdfg',
    'acdefg',
    'abc',
    'abcdefg',
    'abcdfg',
  ];
  led.innerHTML = Array.from(
    { length: 3 },
    (_, index) =>
      `<g transform="translate(${index * 44} 0)">${shapes.map((points) => `<polygon points="${points}"/>`).join('')}</g>`,
  ).join('');
  const ledDigits = [...led.querySelectorAll('g')].map((group) => [...group.children]);
  let previousSpeed = '';
  let previousRpm = -1;
  let previousSegments = -1;
  let previousLimiter = false;
  return (rpm: number, mph: string, limiter: boolean) => {
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
    if (mph !== previousSpeed) {
      const display = mph.padStart(3, ' ').slice(-3);
      ledDigits.forEach((segments, index) => {
        const active = display[index] === ' ' ? '' : digits[Number(display[index])];
        segments.forEach((segment, part) =>
          segment.classList.toggle('lit', active.includes('abcdefg'[part])),
        );
      });
      previousSpeed = mph;
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
  const tuningLabel = bindText('#tuning-label');
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
        persistTuningPresets(localStorage, tuningPresets);
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
      persistTuningPresets(localStorage, tuningPresets);
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
      persistTuningPresets(localStorage, tuningPresets);
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
      tuningLabel(`${modeName} · ${selectedPreset?.name ?? 'Custom'}`);
      element('#tuning').setAttribute(
        'aria-label',
        `Tuning: ${modeName} · ${selectedPreset?.name ?? 'Custom'}`,
      );
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
  ) => Promise<CourseDefinition>;
  changeDirection: (reverse: boolean) => Promise<void>;
  saveCourse: (name: string, definition?: CourseDefinition) => Promise<CourseDefinition>;
  renameCourse: (id: string, name: string) => Promise<CourseDefinition>;
  /** Deleting the active course loads a fallback; returns the active course afterwards. */
  deleteCourse: (id: string) => Promise<CourseDefinition>;
  /** Plays a saved run of the active course and direction, resetting the race. */
  playRun: (runId: string) => Promise<void>;
  deleteReplay: (course: CourseDefinition, reverse: boolean, runId: string) => void;
  reportError: (error: unknown) => void;
  getCourseWeights: () => CourseGenerationWeights;
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
  const pickerStatus = bindText('#course-picker-status');
  const list = element('#course-list');
  const overview = element('#course-overview');
  const previewContainer = element('#course-preview-visual');
  const previewError = bindText('#course-preview-error');
  const previewName = bindText('#course-preview-name');
  const previewGroup = bindText('#course-preview-group');
  const previewDistance = bindText('#course-preview-distance');
  const courseActions = element<HTMLDetailsElement>('#course-actions');
  const courseActionsSummary = courseActions.querySelector('summary')!;
  const renameAction = element<HTMLButtonElement>('#course-rename');
  const deleteAction = element<HTMLButtonElement>('#course-delete');
  const records = element('#course-records');
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
  const savedHelp = bindText('#saved-course-help');
  const savedNameField = element('#saved-course-name-field');
  const savedNameInput = element<HTMLInputElement>('#saved-course-name');
  const savedError = bindText('#saved-course-error');
  const savedCancel = element<HTMLButtonElement>('#saved-course-cancel');
  const savedConfirm = element<HTMLButtonElement>('#saved-course-confirm');
  const courseName = bindText('#course-name');
  const generator = element('#course-generator');
  const generatorForm = element<HTMLFormElement>('#course-generator-form');
  const draftName = element<HTMLInputElement>('#course-draft-name');
  const createButton = element<HTMLButtonElement>('#course-create');
  const savePreview = element<HTMLButtonElement>('#course-save-preview');
  const editDraft = element<HTMLButtonElement>('#course-edit-draft');
  const directions = [...picker.querySelectorAll<HTMLInputElement>('[name="course-direction"]')];
  const generationTypes = [...picker.querySelectorAll<HTMLInputElement>('[name="generation"]')];
  const generationFields = element<HTMLFieldSetElement>('#custom-course-sliders');
  const resetGeneration = element<HTMLButtonElement>('#custom-course-reset');
  const enable3dPreview = false;
  const preview3d = new CoursePreviewRenderer(previewContainer);
  const items = new Map<string, HTMLButtonElement>();
  let preview = selected;
  let previewToken = 0;
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
    let summaries;
    try {
      summaries = (draftSelected ? [] : courseDirectionRecords(course)).filter(
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
      text.append(
        textElement('div', 'help-text', 'Local record'),
        textElement('div', 'record-time', 'No recorded lap yet'),
      );
      row.append(text);
      records.replaceChildren(row);
      return;
    }
    records.replaceChildren(
      ...summaries.map(({ reverse, record, runs }) => {
        const row = textElement('li', 'record-row', '');
        const text = document.createElement('div');
        text.append(
          textElement('div', 'help-text', `Local record · ${directionLabel(reverse)}`),
          textElement(
            'div',
            'record-time',
            record === null ? 'No full lap yet' : formatLapTime(record),
          ),
        );
        row.append(text);
        if (runs.length) {
          const view = textElement(
            'button',
            'button button-quiet',
            `View replays (${runs.length}) →`,
          ) as HTMLButtonElement;
          view.type = 'button';
          view.addEventListener('click', () => showReplays(course, reverse, record, runs));
          row.append(view);
        }
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
        const best = run.laps.length ? Math.min(...run.laps) : null;
        const { date, laps } = describeRun(run);
        const driver = run.driver?.startsWith('bot') ? ' · Bot' : '';
        const row = textElement('li', 'record-row', '');
        row.title = 'Right-click to copy run JSON';
        row.addEventListener('contextmenu', async (event) => {
          event.preventDefault();
          pickerError('');
          pickerStatus('');
          try {
            const key = replayStorageKey({ ...course, reverse: direction });
            await navigator.clipboard.writeText(exportRun(key, run.id));
            pickerStatus('Run JSON copied to clipboard.');
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
        time.append(
          textElement(
            'span',
            'help-text',
            best === null ? 'Partial lap' : best === record ? 'Best lap · Record' : 'Best lap',
          ),
        );
        const text = document.createElement('div');
        text.append(time, textElement('div', 'help-text', `${date} · ${laps}${driver}`));
        const watch = textElement(
          'button',
          'button button-secondary',
          'Watch',
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
    generator.hidden = true;
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

  function render3d(course: CourseDefinition) {
    if (!enable3dPreview) {
      previewContainer.innerHTML = coursePreviewSvg(course, {
        size: 400,
        padding: 24,
        title: course.name,
      });
      return;
    }
    const token = ++previewToken;
    previewContainer.setAttribute('aria-busy', 'true');
    // Let the status paint first: building a racetrack heightfield takes a moment.
    requestAnimationFrame(() =>
      setTimeout(async () => {
        if (token !== previewToken || !picker.open) return;
        try {
          const definition = await loadCourseDefinition(course);
          if (token !== previewToken || !picker.open) return;
          preview3d.render(definition, previewColors(), `3-D terrain preview of ${course.name}`);
        } catch (error) {
          console.error('Unable to show 3-D course preview:', error);
          if (token !== previewToken || !picker.open) return;
          preview3d.dispose();
          previewError(`Unable to show 3-D preview: ${errorText(error)}`);
        } finally {
          if (token === previewToken) previewContainer.removeAttribute('aria-busy');
        }
      }, 0),
    );
  }

  function previewCourse(course: CourseDefinition, isDraft = false) {
    draftSelected = isDraft;
    preview = course;
    syncListSelection();
    showOverview();
    previewError('');
    previewName(course.name);
    previewGroup(groupForCourse(course).badge);
    element('#course-preview-group').hidden = groupForCourse(course).id === 'stored';
    previewDistance(
      `${courseDistance(course)}${course.closed === false ? '' : ' per lap'} · ${routeLabel(course)}`,
    );
    courseActions.open = false;
    courseActions.hidden = groupForCourse(course).id !== 'stored';
    savePreview.hidden = !isUnsavedCourse(course);
    editDraft.hidden = !isDraft;
    renderRecords(course);
    render3d(course);
    syncBusy();
  }

  function syncCourseName() {
    courseName(selected.name);
  }

  function syncBusy() {
    picker.setAttribute('aria-busy', String(changing));
    for (const control of picker.querySelectorAll<HTMLButtonElement | HTMLInputElement>(
      'button, .master-detail input',
    ))
      control.disabled = changing;
    courseActionsSummary.toggleAttribute('aria-disabled', changing);
    savedConfirm.disabled = savedCancel.disabled = savedNameInput.disabled = changing;
    pickerButton.disabled = generationFields.disabled = changing;
    loadButton.disabled = changing || creating;
    loadButton.textContent = draftSelected && !creating ? 'Save & load course' : 'Load course';
  }

  /** Runs one course operation at a time; returns false if another is already running. */
  async function exclusive(status: string, operation: () => Promise<void>) {
    if (changing) return false;
    changing = true;
    pickerStatus(status);
    syncBusy();
    try {
      await operation();
    } finally {
      changing = false;
      pickerStatus('Loading a course resets the race.');
      syncBusy();
    }
    return true;
  }

  /** Loads a course; `generation` rebuilds a previewed unsaved layout instead of a new one. */
  async function selectCourse(id: string, generation?: CourseDefinition['generation']) {
    pickerError('');
    await exclusive('Loading course…', async () => {
      try {
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
    if (!draft) {
      const names = new Set(courses.map(({ name }) => name));
      let name = 'New course';
      for (let number = 2; names.has(name); number++) name = `New course ${number}`;
      draft = { name };
    }
    draftSelected = creating = true;
    ++previewToken;
    preview3d.dispose();
    overview.hidden = replays.hidden = true;
    generator.hidden = false;
    draftName.value = draft.name;
    pickerError('');
    renderList();
    items.get('new-course')?.scrollIntoView({ block: 'nearest' });
    draftName.select();
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
    draftName.setCustomValidity('');
    if (!draft) return;
    draft.name = draftName.value;
    const title = items.get('new-course')?.querySelector('.selection-item-title');
    if (title) title.textContent = draft.name.trim() || 'New course';
  });
  function invalidateDraftPreview() {
    if (!draft) return;
    draft.course = undefined;
    const meta = items.get('new-course')?.querySelector('.selection-item-meta');
    if (meta) meta.textContent = 'Unsaved';
  }
  generatorForm.addEventListener('input', invalidateDraftPreview);
  resetGeneration.addEventListener('click', invalidateDraftPreview);
  generationTypes.forEach((input) =>
    input.addEventListener('change', () => {
      const custom = input.value === 'custom';
      generationFields.hidden = resetGeneration.hidden = !custom;
      element('#course-random-help').hidden = custom;
    }),
  );
  generatorForm.addEventListener('submit', (event) => {
    event.preventDefault();
    draftName.setCustomValidity(draftName.value.trim() ? '' : 'Enter a course name');
    if (!generatorForm.reportValidity() || !draft) return;
    draft.name = draftName.value.trim();
    void exclusive('Generating preview…', async () => {
      try {
        await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
        const seed = crypto.getRandomValues(new Uint32Array(1))[0];
        const custom = generationTypes.find((input) => input.checked)?.value === 'custom';
        const course = custom
          ? generateCustomCourse(seed, actions.getCourseWeights())
          : generateCourse(seed);
        const named = { ...course, name: draftName.value.trim() };
        draft = { name: named.name, course: named };
        renderList();
        previewCourse(named, true);
      } catch (error) {
        console.error('Unable to generate course preview:', error);
        pickerError(`Unable to generate preview: ${errorText(error)}`);
      }
    }).then(() => {
      if (!creating && picker.open) editDraft.focus();
    });
  });
  directions.forEach((input) =>
    input.addEventListener('change', () => {
      direction = input.value === 'reverse';
      renderRecords(preview);
    }),
  );

  async function watchRun(course: CourseDefinition, direction: boolean, runId: string) {
    pickerError('');
    await exclusive('Loading replay…', async () => {
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
    kind: 'rename' | 'delete' | 'save' | 'delete-replay';
    course: CourseDefinition;
    returnFocus: HTMLElement;
    replay?: { id: string; direction: boolean; date: string; laps: string };
  } | null = null;
  function editSavedCourse(
    kind: 'rename' | 'delete' | 'save' | 'delete-replay',
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
      deletingReplay
        ? 'Delete replay?'
        : deleting
          ? 'Delete saved course?'
          : kind === 'save'
            ? 'Save course'
            : 'Rename course',
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
      savedDescription.textContent =
        kind === 'save'
          ? 'Name this layout to add it to your saved courses.'
          : 'Choose a name for this saved course.';
    }
    savedHelp(
      deletingReplay
        ? 'The course and local record are kept.'
        : deleting
          ? 'Recorded laps and replays are deleted.'
          : 'Records and replays stay with the course.',
    );
    savedNameField.hidden = deleting;
    savedNameInput.value = course.name;
    savedError('');
    savedConfirm.textContent = deletingReplay
      ? 'Delete replay'
      : deleting
        ? 'Delete course'
        : kind === 'save'
          ? 'Save course'
          : 'Save name';
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
        actions.deleteReplay(course, replay.direction, replay.id);
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
      await exclusive('Saving course…', async () => {
        try {
          await savePreviewCourse(savedNameInput.value);
          savedDialog.close();
        } catch (error) {
          savedError(errorText(error));
        }
      });
      return;
    }
    if (kind === 'rename') {
      await exclusive('Renaming course…', async () => {
        try {
          const renamed = await actions.renameCourse(course.id, savedNameInput.value);
          courses[courses.indexOf(course)] = renamed;
          if (selected.id === renamed.id) {
            selected = renamed;
            syncCourseName();
          }
          renderList();
          if (preview === course) previewCourse(renamed);
          savedDialog.close();
        } catch (error) {
          savedError(errorText(error));
        }
      });
      return;
    }
    const busy = await exclusive('Deleting course…', async () => {
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
  renameAction.addEventListener('click', () =>
    editSavedCourse('rename', preview, courseActionsSummary),
  );
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
        const saved = await exclusive('Saving course…', async () => {
          await savePreviewCourse(draft?.name ?? '');
        });
        if (!saved) return;
      }
      void selectCourse(preview.id, isUnsavedCourse(preview) ? preview.generation : undefined);
    } catch (error) {
      pickerError(`Unable to save course: ${errorText(error)}`);
    }
  });
  element('#course-picker-cancel').addEventListener('click', () => picker.close());
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
    await exclusive('Loading saved tracks…', async () => {
      try {
        const refreshed = await actions.refreshCourses();
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
    ++previewToken;
    preview3d.dispose();
  });

  syncCourseName();
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
  element('#custom-course-reset').addEventListener('click', () => {
    setWeights({ ...defaultCourseWeights });
    refreshWeights();
  });
  return refreshWeights;
}

export function bindStatusUI(store: Store<GameState>) {
  const status = element('#status');
  const statusText = bindText('#status-message');
  const close = element<HTMLButtonElement>('#status-close');
  const progress = element('#status-progress');
  const footer = element('footer');
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
      const loaded = !current.visible && !current.error;
      if (footer.classList.contains('loaded') !== loaded) footer.classList.toggle('loaded', loaded);
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
  const tachometer = bindTachometer();
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
  bindDialog('#minimap', '#course-picker-dialog', refreshCourseWeights);

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
  const isToggle = (value: string): value is 'on' | 'off' => value === 'on' || value === 'off';
  select<ConfigurationState['mirrorResolution']>(
    '#mirror-resolution',
    'mirror-resolution',
    'mirrorResolution',
    (state) => state.mirrorResolution,
    (mirrorResolution) => ({ mirrorResolution }),
    isMirrorResolution,
  );
  select<'on' | 'off'>(
    '#cabin-head-motion',
    'head-motion',
    'cabinHeadMotion',
    (state) => (state.cabinHeadMotion ? 'on' : 'off'),
    (value) => ({ cabinHeadMotion: value === 'on' }),
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
  select<ConfigurationState['ghostMode']>(
    '#ghost-mode',
    'ghost',
    'ghostMode',
    (state) => state.ghostMode,
    (ghostMode) => ({ ghostMode }),
    isGhostMode,
  );
  select<'on' | 'off'>(
    '#show-grass',
    'grass',
    'showGrass',
    (state) => (state.showGrass ? 'on' : 'off'),
    (value) => ({ showGrass: value === 'on' }),
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
  configuration.subscribe(
    (state) => {
      // The cabin camera shows the car's own working gauges instead.
      setHudElementHidden(telemetryPanel, state.cameraStyle === 'cabin');
      const chaseView = state.cameraStyle !== 'cabin';
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
      const mph = String(Math.round(Math.abs(t.speed) / 0.44704));
      speed(mph);
      tachometer(t.rpm, mph, t.limiter);
      gear(t.gear < 0 ? 'R' : t.gear === 0 ? 'N' : String(t.gear));
      lap(t.finished ? 'Finished' : t.lap ? String(t.lap) : '--');
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
