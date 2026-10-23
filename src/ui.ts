import { isDriveMode, type DriveMode } from './drive-modes';
import { bindBotDialog } from './bot-dialog';
import { createDrivingTuning } from './drift-tuning';
import { redlineRpm } from './drivetrain';
import { courseRoute, racetracks, type CourseDefinition } from './courses';
import { coursePreviewSvg } from './course-preview';
import { Tabs } from './tabs';
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
import {
  courseGenerationFields,
  defaultCourseWeights,
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

function setCourseMenuOpen(open: boolean) {
  const menu = element('#course-menu');
  if (menu.hidden === !open) return;
  const map = element<HTMLButtonElement>('#minimap');
  if (!open && menu.contains(document.activeElement)) map.focus();
  menu.hidden = !open;
  map.setAttribute('aria-expanded', String(open));
  notifyUIVisibility();
}

function bindCourseDisclosure() {
  const hud = element('.course-hud');
  const map = element<HTMLButtonElement>('#minimap');
  const menu = element('#course-menu');
  map.addEventListener('click', () => setCourseMenuOpen(menu.hidden));
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape' && !menu.hidden && !document.querySelector('dialog[open]')) {
        event.preventDefault();
        setCourseMenuOpen(false);
        map.focus();
      }
    },
    true,
  );
  hud.addEventListener('keydown', (event) => event.stopPropagation());
  hud.addEventListener('keyup', (event) => event.stopPropagation());
  document.addEventListener('pointerdown', (event) => {
    if (event.target instanceof Node && !hud.contains(event.target)) setCourseMenuOpen(false);
  });
}

function bindDialog(trigger: string, selector: string, onOpen?: () => void) {
  const dialog = element<HTMLDialogElement>(selector);
  const opener = element(trigger);
  const close = () => {
    dialog.close();
    notifyUIVisibility();
  };
  opener.addEventListener('click', () => {
    if (dialog.open) return;
    onOpen?.();
    dialog.dispatchEvent(new Event('dialog-open'));
    setCourseMenuOpen(false);
    dialog.showModal();
    dialog.scrollTop = 0;
    notifyUIVisibility();
  });
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    close();
  });
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    notifyUIVisibility();
    (opener.closest('[hidden]') ? element('#minimap') : opener).focus();
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
    if (pressedOutside && outside(event)) close();
    pressedOutside = false;
  });
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
  const syncUIOpen = () =>
    actions.setUIOpen(
      document.querySelector('dialog[open]') !== null || !element('#course-menu').hidden,
    );
  document.addEventListener('driving-ui-change', syncUIOpen);
  syncUIOpen();
  const sound = element<HTMLSelectElement>('#sound');
  sound.addEventListener('change', () => {
    const muted = sound.value === 'off';
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
    select: (id: string) => void;
    remove: (id: string) => void;
    seek: (time: number) => void;
  },
) {
  const container = element('.lap-recorder');
  const button = element<HTMLButtonElement>('#lap-recorder-button');
  const label = bindText('#lap-recorder-label');
  const picker = element('.editable-picker');
  const runs = element<HTMLSelectElement>('#lap-replay-run');
  const remove = element<HTMLButtonElement>('#lap-replay-delete');
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
  runs.addEventListener('change', () => {
    actions.select(runs.value);
    runs.blur();
  });
  remove.addEventListener('click', () => {
    if (runs.value) actions.remove(runs.value);
    remove.blur();
  });
  const text = {
    off: ['', ''],
    ready: ['REPLAY', 'Play saved laps'],
    recording: ['REC', 'Stop recording, save laps and replay them'],
    replay: ['REPLAY', 'Stop replay'],
  } as const;
  let shownRuns: GameState['lapRecorder']['runs'] | null = null;
  store.subscribe(
    ({ lapRecorder }) => {
      const { mode } = lapRecorder;
      const lap = lapRecorder.replayLap;
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
      if (container.hidden !== (mode === 'off')) container.hidden = mode === 'off';
      if (button.dataset.mode !== mode) button.dataset.mode = mode;
      label(text[mode][0]);
      if (button.title !== text[mode][1]) {
        button.title = text[mode][1];
        button.setAttribute('aria-label', text[mode][1]);
      }
      const picking = mode === 'ready';
      if (picker.hidden !== !picking) picker.hidden = !picking;
      if (shownRuns !== lapRecorder.runs) {
        shownRuns = lapRecorder.runs;
        runs.replaceChildren(...lapRecorder.runs.map((run) => new Option(run.label, run.id)));
      }
      const selected = lapRecorder.selectedRun ?? '';
      if (runs.value !== selected) runs.value = selected;
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
  const presetsSelect = element<HTMLSelectElement>('#tuning-preset');
  const editInput = element<HTMLInputElement>('#tuning-preset-edit-name');
  const edit = element<HTMLButtonElement>('#tuning-preset-edit');
  const remove = element<HTMLButtonElement>('#tuning-preset-delete');
  let renderedMode: ConfigurationState['driveMode'] | null = null;
  let renderedPresets: ConfigurationState['tuningPresets'] | null = null;
  let editingPresetId: string | null = null;

  const showNameEditor = (preset: TuningPreset) => {
    editingPresetId = preset.id;
    editInput.value = preset.name;
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
        reportError(error);
      }
      return;
    }
    const preset = state.tuningPresets.find(
      ({ id, mode }) => id === presetId && mode === state.driveMode,
    );
    if (!preset) return;
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
    const duplicate = state.tuningPresets.some(
      (entry) =>
        entry.mode === preset.mode &&
        entry.id !== preset.id &&
        entry.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
    );
    if (!name || duplicate) return;
    if (name === preset.name) return;
    const tuningPresets = state.tuningPresets.map((entry) =>
      entry.id === preset.id ? { ...entry, name } : entry,
    );
    try {
      persistTuningPresets(localStorage, tuningPresets);
      store.update({ tuningPresets });
    } catch (error) {
      reportError(error);
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
      reportError(new Error(`Missing Default tuning preset for ${state.driveMode} mode`));
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
    } catch (error) {
      reportError(error);
    }
    remove.blur();
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
      title(`${modeName} tuning presets`);
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

export function bindCoursePicker(
  options: readonly CourseDefinition[],
  selected: { id: string; name: string },
  changeCourse: (
    id: string,
    seed?: number,
    weights?: CourseGenerationWeights,
  ) => Promise<{ id: string; name: string }>,
  changeDirection: (reverse: boolean) => Promise<void>,
  reportError: (error: unknown) => void,
  store: Store<ConfigurationState>,
  saveCourse: (name: string) => CourseDefinition,
  deleteCourse: (id: string) => Promise<{ id: string; name: string }>,
  getCourseWeights: () => CourseGenerationWeights,
) {
  const pickerButton = element<HTMLButtonElement>('#course');
  const picker = element<HTMLDialogElement>('#course-picker-dialog');
  const customDialog = element<HTMLDialogElement>('#custom-course-dialog');
  const tabs = new Tabs(element('#course-picker-tabs'));
  const pickerError = bindText('#course-picker-error');
  const savedEmpty = element('#courses-saved-empty');
  const cards = new Map<string, HTMLButtonElement>();
  const coursePanel = (id: string) =>
    id.startsWith('saved-')
      ? 'courses-saved'
      : racetracks.some((course) => course.id === id)
        ? 'courses-racetracks'
        : 'courses-built-in';
  function addCourse(course: CourseDefinition) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'course-card';
    card.title = course.name;
    card.dataset.courseId = course.id;
    const length = courseRoute(course).getLength();
    const distance = length < 1000 ? `${Math.round(length)} m` : `${(length / 1000).toFixed(2)} km`;
    card.setAttribute('aria-label', `${course.name}, ${distance}`);
    card.innerHTML = coursePreviewSvg(course);
    const label = document.createElement('span');
    label.textContent = course.name;
    const lengthLabel = document.createElement('small');
    lengthLabel.className = 'course-card-length';
    lengthLabel.textContent = distance;
    card.append(label, lengthLabel);
    card.addEventListener('click', () => void selectCourse(course.id));
    element(`#${coursePanel(course.id)} .course-grid`).append(card);
    cards.set(course.id, card);
  }
  const button = element<HTMLButtonElement>('#random-course');
  const reverse = element<HTMLInputElement>('#reverse-course');
  const customButton = element<HTMLButtonElement>('#custom-course');
  const generateButton = element<HTMLButtonElement>('#custom-course-generate');
  const resetButton = element<HTMLButtonElement>('#custom-course-reset');
  const fieldset = element<HTMLFieldSetElement>('#custom-course-sliders');
  const customStatus = bindText('#custom-course-status');
  const customError = bindText('#custom-course-error');
  const courseName = bindText('#course-name');
  const saveForm = element<HTMLFormElement>('#save-course-form');
  const saveName = element<HTMLInputElement>('#save-course-name');
  const saveButton = element<HTMLButtonElement>('#save-course');
  const saveStatus = bindText('#save-course-status');
  const deleteButton = element<HTMLButtonElement>('#delete-course');
  function syncCourseSelection() {
    for (const [id, card] of cards) {
      if (id === selected.id) card.setAttribute('aria-current', 'true');
      else card.removeAttribute('aria-current');
    }
    savedEmpty.hidden = [...cards.keys()].some((id) => id.startsWith('saved-'));
  }
  picker.addEventListener('dialog-open', () => {
    tabs.select(coursePanel(selected.id));
    pickerError('');
  });
  function syncSaveCourse() {
    saveForm.hidden = selected.id !== 'random' && selected.id !== 'custom';
    saveName.value = selected.name;
    saveStatus('');
    deleteButton.disabled = !selected.id.startsWith('saved-');
  }
  syncSaveCourse();
  saveForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (changing) return;
    try {
      const saved = saveCourse(saveName.value);
      addCourse(saved);
      selected = saved;
      syncCourseSelection();
      courseName(saved.name);
      syncSaveCourse();
      saveButton.blur();
    } catch (error) {
      saveStatus(error instanceof Error ? error.message : String(error));
      reportError(error);
    }
  });
  courseName(selected.name);
  for (const course of options) addCourse(course);
  syncCourseSelection();
  const setBusy = (busy: boolean) => {
    deleteButton.disabled = busy || !selected.id.startsWith('saved-');
    picker.setAttribute('aria-busy', String(busy));
    for (const card of cards.values()) card.disabled = busy;
    pickerButton.disabled =
      button.disabled =
      reverse.disabled =
      customButton.disabled =
      generateButton.disabled =
      resetButton.disabled =
      fieldset.disabled =
      saveButton.disabled =
      saveName.disabled =
        busy;
  };
  setBusy(false);
  reverse.checked = store.getState().courseReverse;
  let changing = false;
  deleteButton.addEventListener('click', async () => {
    if (changing || !selected.id.startsWith('saved-')) return;
    changing = true;
    setBusy(true);
    const id = selected.id;
    try {
      selected = await deleteCourse(id);
      cards.get(id)?.remove();
      cards.delete(id);
      syncCourseSelection();
      courseName(selected.name);
      syncSaveCourse();
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
      changing = false;
      deleteButton.blur();
    }
  });
  async function selectCourse(id: string) {
    if (changing) return;
    if (id === selected.id && cards.has(id)) {
      picker.close();
      return;
    }
    changing = true;
    setCourseMenuOpen(false);
    setBusy(true);
    customError('');
    pickerError('');
    let closeCustom = false;
    try {
      const generated = id === 'random' || id === 'custom';
      const weights = id === 'custom' ? getCourseWeights() : undefined;
      if (weights) validateCourseWeights(weights);
      if (id === 'custom') customStatus('Generating course…');
      selected = await changeCourse(
        id,
        generated ? crypto.getRandomValues(new Uint32Array(1))[0] : undefined,
        weights,
      );
      courseName(selected.name);
      syncSaveCourse();
      picker.close();
      closeCustom = id === 'custom';
    } catch (error) {
      reportError(error);
      pickerError(error instanceof Error ? error.message : String(error));
      if (customDialog.open) {
        customError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      syncCourseSelection();
      setBusy(false);
      customStatus('');
      changing = false;
      if (closeCustom) customDialog.close();
    }
  }
  button.addEventListener('click', () => {
    void selectCourse('random');
  });
  generateButton.addEventListener('click', () => {
    void selectCourse('custom');
  });
  async function reverseCourse() {
    if (changing) {
      reverse.checked = store.getState().courseReverse;
      return;
    }
    changing = true;
    setCourseMenuOpen(false);
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
  reverse.addEventListener('change', () => {
    void reverseCourse();
  });
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
    label.className = 'slider-control';
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
    input.setAttribute('aria-labelledby', title.id);
    input.setAttribute('aria-describedby', hint.id);
    const sync = () => {
      input.value = String(weights[key]);
      output.value =
        key === 'length' ? `${(weights[key] / 1000).toFixed(1)} km` : weights[key].toFixed(2);
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
  const dismissError = bindStatusUI(game);
  bindCourseDisclosure();
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
  bindDialog('#bots', '#bots-dialog', bindBotDialog(element('#bots-dialog')));
  bindDialog('#help', '#help-dialog');
  let courseWeights = { ...defaultCourseWeights };
  const getCourseWeights = () => courseWeights;
  const setCourseWeights = (weights: CourseGenerationWeights) => {
    validateCourseWeights(weights);
    courseWeights = { ...weights };
  };
  let refreshCourseWeights: (() => void) | undefined;
  bindDialog('#custom-course', '#custom-course-dialog', () => {
    refreshCourseWeights ??= bindCourseWeights(getCourseWeights, setCourseWeights);
    refreshCourseWeights();
  });
  bindDialog('#course', '#course-picker-dialog');

  function select<Value extends string>(
    selector: string,
    parameter: string,
    key: keyof ConfigurationState,
    read: (state: Readonly<ConfigurationState>) => Value,
    write: (value: Value) => Partial<ConfigurationState>,
    valid: (value: string) => value is Value,
  ) {
    const input = element<HTMLSelectElement>(selector);
    input.addEventListener('change', () => {
      const value = input.value;
      if (!valid(value)) {
        reportError(new Error(`Unknown ${parameter}: ${value}`));
        return;
      }
      configuration.update(write(value));
      const url = new URL(location.href);
      url.searchParams.set(parameter, input.value);
      if (parameter === 'mirror-resolution') url.searchParams.delete('low-res-mirrors');
      if (parameter === 'mode' && isDriveMode(value)) {
        url.searchParams.set(
          'preset',
          configuration.getState().selectedTuningPresets[value] ?? 'custom',
        );
      }
      history.replaceState(null, '', url);
      input.blur();
    });
    configuration.subscribe(
      (state) => {
        const value = read(state);
        if (input.value !== value) input.value = value;
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
  const sound = element<HTMLSelectElement>('#sound');
  const soundStatus = bindText('#sound-status');
  const telemetryPanel = element('.telemetry');
  configuration.subscribe(
    (state) => {
      // The cabin camera shows the car's own working gauges instead.
      telemetryPanel.hidden = state.cameraStyle === 'cabin';
      const chaseView = state.cameraStyle !== 'cabin';
      if (document.body.classList.contains('chase-view') !== chaseView)
        document.body.classList.toggle('chase-view', chaseView);
    },
    ['cameraStyle'],
  );
  configuration.subscribe(
    ({ muted }) => {
      const soundValue = muted ? 'off' : 'on';
      if (sound.value !== soundValue) sound.value = soundValue;
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
      gear(t.gear < 0 ? 'R' : String(t.gear));
      lap(t.lap ? String(t.lap) : '--');
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
  return { getCourseWeights, setCourseWeights, dismissError };
}
