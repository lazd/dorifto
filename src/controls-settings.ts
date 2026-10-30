import { Tabs } from './tabs';
import { isT300 } from './controls';
import { browserStorage as persistentStorage } from './browser-storage';
import {
  axisOptions,
  controllerActions,
  defaultInputBindings,
  formatControllerButton,
  formatKeyboardCode,
  inputBindings,
  isKeyboardCode,
  keyboardActions,
  type AxisAction,
  type ControllerAction,
  type InputBindings,
  type KeyboardAction,
  type StorageLike,
  validateInputBindings,
} from './input-bindings';
import './controls-settings.css';

const controllerDiagramLabels: Partial<Record<ControllerAction, string>> = {
  accelerate: 'Accelerate',
  brake: 'Brake',
  handbrake: 'Handbrake',
  clutch: 'Clutch kick',
  highBeams: 'High beams',
  headlights: 'Headlights',
  driveMode: 'Grip / Drift',
  map: 'Map',
  reset: 'Reset',
  camera: 'Camera',
  lookBehind: 'Look behind',
};

export function bindControlsSettings(reportError: (error: Error) => void): () => void {
  const host = document.getElementById('controls-settings');
  if (!host) return () => {};

  const storage = browserStorage(reportError);
  const controlsStatus = host.querySelector<HTMLElement>('.controls-settings__status');
  if (!controlsStatus) throw new Error('Missing controls settings status');
  const container = host;
  const status = controlsStatus;

  const keyboardBindings = container.querySelector<HTMLElement>('[data-keyboard-group="driving"]')!;
  const shortcutBindings = container.querySelector<HTMLElement>(
    '[data-keyboard-group="shortcuts"]',
  )!;
  for (const action of keyboardActions) {
    const list = action.group === 'driving' ? keyboardBindings : shortcutBindings;
    list.append(createBindingRow(action.label, `keyboard:${action.id}`, 'keyboard'));
  }
  const controllerList = container.querySelector<HTMLElement>('[data-controller-bindings]')!;
  for (const action of controllerActions)
    controllerList.append(createBindingRow(action.label, `controller:${action.id}`, 'controller'));

  const axesRoot = container.querySelector<HTMLElement>('[data-map-axes]')!;
  const axisRows: [AxisAction, string][] = [
    ['mapZoom', 'Zoom in / out'],
    ['mapPanX', 'Pan left / right'],
    ['mapPanY', 'Pan up / down'],
  ];
  for (const [action, label] of axisRows) axesRoot.append(createAxisRow(action, label));
  container
    .querySelector<HTMLElement>('[data-map-return]')!
    .append(createBindingRow('Return to driving', 'controller:map', 'controller'));

  const keyboardDiagram = container.querySelector<HTMLElement>('.keyboard-diagram')!;
  const gamepadDiagram = container.querySelector<SVGSVGElement>('.gamepad-diagram')!;
  const mapPanel = container.querySelector<HTMLElement>('#controls-controller-map-panel')!;
  renderKeyboardDiagram(keyboardDiagram);

  const controllerStatus = container.querySelector<HTMLElement>('#controller-status');
  if (!controllerStatus) throw new Error('Missing controller status');
  const deviceStatus = controllerStatus;
  const deviceTabs = new Tabs(container);
  const keyboardTabs = new Tabs(container.querySelector<HTMLElement>('#controls-keyboard-panel')!);
  const controllerTabs = new Tabs(
    container.querySelector<HTMLElement>('#controls-controller-panel')!,
  );
  const controllerContextTabs = container.querySelector<HTMLElement>(
    '[aria-label="Controller binding context"]',
  )!;
  for (const type of ['click', 'keydown'])
    controllerContextTabs.addEventListener(type, () => renderGamepadLabel());
  let capture:
    | {
        device: 'keyboard';
        action: KeyboardAction;
        button: HTMLButtonElement;
        keydown: (event: KeyboardEvent) => void;
      }
    | {
        device: 'controller';
        action: ControllerAction;
        button: HTMLButtonElement;
        interval: number;
        armed: boolean;
        keydown: (event: KeyboardEvent) => void;
      }
    | null = null;

  function notify(error: Error) {
    status.textContent = error.message;
    reportError(error);
  }

  function stopCapture(message: string) {
    if (!capture) return;
    if (capture.device === 'keyboard') {
      window.removeEventListener('keydown', capture.keydown, true);
    } else {
      window.clearInterval(capture.interval);
      window.removeEventListener('keydown', capture.keydown, true);
    }
    capture.button.classList.remove('listening');
    capture.button.removeAttribute('aria-label');
    inputBindings.setCaptureActive(false);
    capture = null;
    status.textContent = message;
    render();
  }

  function commit(next: InputBindings, message: string): boolean {
    try {
      const validated = validateInputBindings(next);
      if (
        !inputBindings.save(validated, storage, (error) => {
          status.textContent = error.message;
          reportError(error);
        })
      )
        return false;
      status.textContent = message;
      render();
      return true;
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : String(error);
      return false;
    }
  }

  function startKeyboardCapture(action: KeyboardAction, button: HTMLButtonElement) {
    stopCapture('Capture cancelled.');
    inputBindings.setCaptureActive(true);
    button.classList.add('listening');
    button.textContent = 'Press key…';
    button.setAttribute(
      'aria-label',
      `Press a key for ${keyboardActions.find((entry) => entry.id === action)!.label}, or Escape to cancel`,
    );
    const keydown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat) return;
      if (event.code === 'Escape') {
        stopCapture('Capture cancelled.');
        return;
      }
      if (!isKeyboardCode(event.code)) {
        status.textContent = 'That key cannot be assigned. Press another key or Escape to cancel.';
        return;
      }
      const duplicate = keyboardActions.find(
        (entry) => entry.id !== action && inputBindings.get().keyboard[entry.id] === event.code,
      );
      if (duplicate) {
        status.textContent = `${formatKeyboardCode(event.code)} is already assigned to ${duplicate.label}. Choose another key.`;
        return;
      }
      const next = structuredClone(inputBindings.get());
      next.keyboard[action] = event.code;
      if (
        commit(
          next,
          `${keyboardActions.find((entry) => entry.id === action)!.label} set to ${formatKeyboardCode(event.code)}.`,
        )
      )
        stopCapture(status.textContent);
    };
    capture = { device: 'keyboard', action, button, keydown };
    status.textContent = 'Press a key to assign it. Escape cancels.';
    window.addEventListener('keydown', keydown, true);
  }

  function startControllerCapture(action: ControllerAction, button: HTMLButtonElement) {
    stopCapture('Capture cancelled.');
    inputBindings.setCaptureActive(true);
    button.classList.add('listening');
    button.textContent = 'Press button…';
    button.setAttribute('aria-label', 'Press a controller button, or Escape to cancel');
    let armed = false;
    const keydown = (event: KeyboardEvent) => {
      if (event.code !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      stopCapture('Capture cancelled.');
    };
    const interval = window.setInterval(() => {
      const pad = standardGamepad();
      deviceStatus!.textContent = pad
        ? '✅ Connected'
        : '⏳ Waiting for an Xbox-compatible controller';
      if (!pad) return;
      const buttons = pad.buttons.map((entry) => Boolean(entry.pressed));
      if (!armed) {
        if (!buttons.some(Boolean)) armed = true;
        return;
      }
      const pressedButton = buttons.findIndex(Boolean);
      if (pressedButton < 0) return;
      const duplicate = controllerActions.find(
        (entry) =>
          entry.id !== action && inputBindings.get().controller.buttons[entry.id] === pressedButton,
      );
      if (duplicate) {
        status.textContent = `${formatControllerButton(pressedButton)} is already assigned to ${duplicate.label}. Choose another button.`;
        armed = false;
        return;
      }
      const next = structuredClone(inputBindings.get());
      next.controller.buttons[action] = pressedButton;
      if (
        commit(
          next,
          `${controllerActions.find((entry) => entry.id === action)!.label} set to ${formatControllerButton(pressedButton)}.`,
        )
      )
        stopCapture(status.textContent);
    }, 40);
    capture = { device: 'controller', action, button, interval, armed, keydown };
    status.textContent =
      'Release all controller buttons, then press the button to assign. Escape cancels.';
    window.addEventListener('keydown', keydown, true);
  }

  function render() {
    for (const action of keyboardActions) {
      const button = container.querySelector<HTMLButtonElement>(
        `[data-binding="keyboard:${action.id}"]`,
      );
      if (button) {
        const label = formatKeyboardCode(inputBindings.get().keyboard[action.id]);
        button.textContent = label;
        button.setAttribute('aria-label', `${action.label}: ${label}. Activate to remap.`);
      }
    }
    for (const action of controllerActions) {
      const label = formatControllerButton(inputBindings.get().controller.buttons[action.id]);
      for (const button of container.querySelectorAll<HTMLButtonElement>(
        `[data-binding="controller:${action.id}"]`,
      )) {
        button.textContent = label;
        const actionLabel = button
          .closest('.binding-item')
          ?.querySelector('.binding-label')?.textContent;
        button.setAttribute(
          'aria-label',
          `${actionLabel ?? action.label}: ${label}. Activate to remap.`,
        );
      }
    }
    for (const action of [...axisRows.map(([action]) => action), 'cameraY' as const]) {
      const binding = inputBindings.get().controller.axes[action];
      const select = container.querySelector<HTMLSelectElement>(`[data-axis="${action}"]`);
      const invert = container.querySelector<HTMLInputElement>(`[data-invert="${action}"]`);
      if (select) select.value = String(binding.index);
      if (invert) invert.checked = binding.inverted;
    }
    for (const callout of container.querySelectorAll<SVGTextElement>('[data-action-callout]')) {
      const action = callout.dataset.actionCallout as ControllerAction;
      callout.textContent = `${controllerDiagramLabels[action] ?? action}: ${formatControllerButton(inputBindings.get().controller.buttons[action])}`;
    }
    const aCallout = gamepadDiagram.querySelector<SVGTextElement>('[data-button-callout="0"]')!;
    const aAction = controllerActions.find(
      ({ id }) => inputBindings.get().controller.buttons[id] === 0,
    );
    aCallout.textContent = `A: ${aAction?.label ?? 'Unbound'}`;
    renderKeyboardDiagram(keyboardDiagram);
    pressedKeys.reapply();
    renderGamepadLabel();
  }

  function renderGamepadConnectors() {
    const { buttons } = inputBindings.get().controller;
    const connectors = gamepadDiagram.querySelector('.gamepad-diagram__connectors')!;
    connectors.replaceChildren();
    for (const callout of gamepadDiagram.querySelectorAll<SVGTextElement>(
      '.gamepad-diagram__callouts:not([hidden]) [data-action-callout]',
    )) {
      const button = buttons[callout.dataset.actionCallout as ControllerAction];
      const target = gamepadDiagram.querySelector<SVGElement>(`[data-pad="${button}"]`);
      if (!target) continue;
      const x = Number(target.getAttribute('cx') ?? target.getAttribute('x'));
      const y = Number(target.getAttribute('cy') ?? target.getAttribute('y'));
      const labelX = Number(callout.getAttribute('x'));
      const labelY = Number(callout.getAttribute('y'));
      const center = callout.classList.contains('is-center');
      const top = callout.classList.contains('is-top');
      const bottom = callout.classList.contains('is-bottom');
      const left = callout.classList.contains('is-left');
      const startX = labelX + (center ? 0 : left ? 8 : -8);
      const startY = labelY - (center ? 12 : 4);
      const elbowX = left ? 192 : 568;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute(
        'd',
        top
          ? `M${labelX} ${labelY + 8} V0 H${x} V${y - 7}`
          : bottom
            ? `M${startX} ${startY} L${x} ${y + 64} V${y + 14}`
            : center
              ? `M${startX} ${startY} V${y + 36} L${x} ${y}`
              : `M${startX} ${startY} H${elbowX} L${x} ${y}`,
      );
      connectors.append(path);
    }
    if (mapPanel.hidden) {
      const steering = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      steering.setAttribute('d', 'M162 99 H202 L294 72');
      connectors.append(steering);
    }
  }

  function renderGamepadLabel() {
    const { buttons, axes } = inputBindings.get().controller;
    const stick = (action: AxisAction) =>
      axisOptions.find((option) => option.index === axes[action].index)!.label;
    gamepadDiagram
      .querySelector('[data-driving-callouts]')!
      .toggleAttribute('hidden', !mapPanel.hidden);
    gamepadDiagram.querySelector('[data-map-callouts]')!.toggleAttribute('hidden', mapPanel.hidden);
    for (const slot of gamepadDiagram.querySelectorAll<SVGGElement>('[data-map-axis]')) {
      const index = Number(slot.dataset.mapAxis);
      const labels = axisRows
        .filter(([action]) => axes[action].index === index)
        .map(([action, label]) => `${label}${axes[action].inverted ? ' (inverted)' : ''}`);
      slot.toggleAttribute('hidden', labels.length === 0);
      slot.querySelector('text')!.textContent =
        `${index % 2 === 0 ? 'Horizontal' : 'Vertical'}: ${labels.join(' / ')}`;
    }
    gamepadDiagram.querySelector<SVGTextElement>(
      '[data-map-callouts] [data-action-callout="map"]',
    )!.textContent = `Return to driving: ${formatControllerButton(buttons.map)}`;
    renderGamepadConnectors();
    const summary = mapPanel.hidden
      ? [
          `Steer: ${stick('steering')}`,
          ...controllerActions.map(
            ({ id, label }) => `${label}: ${formatControllerButton(buttons[id])}`,
          ),
        ]
      : [
          ...axisRows.map(
            ([action, label]) =>
              `${label}: ${stick(action)}${axes[action].inverted ? ' (inverted)' : ''}`,
          ),
          `Return to driving: ${formatControllerButton(buttons.map)}`,
        ];
    gamepadDiagram.setAttribute(
      'aria-label',
      `Xbox-style controller diagram, ${mapPanel.hidden ? 'driving' : 'map view'} controls. ${summary.join('; ')}`,
    );
  }

  function cancelForTabChange() {
    if (capture) stopCapture('Capture cancelled when changing tabs.');
  }
  container
    .querySelectorAll<HTMLButtonElement>('[role="tab"]')
    .forEach((tab) => tab.addEventListener('click', cancelForTabChange, { capture: true }));

  container.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    const binding = target.dataset.binding;
    if (!binding) return;
    const [device, action] = binding.split(':');
    if (device === 'keyboard') startKeyboardCapture(action as KeyboardAction, target);
    else if (device === 'controller') startControllerCapture(action as ControllerAction, target);
  });

  container.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement || target instanceof HTMLInputElement)) return;
    const action = (target.dataset.axis ?? target.dataset.invert) as AxisAction | undefined;
    if (!action) return;
    const next = structuredClone(inputBindings.get());
    if (target instanceof HTMLSelectElement)
      next.controller.axes[action].index = Number(target.value);
    else next.controller.axes[action].inverted = target.checked;
    commit(next, action === 'cameraY' ? 'Driving controls saved.' : 'Map controls saved.');
  });

  const reset = () => {
    stopCapture('Capture cancelled.');
    if (commit(defaultInputBindings(), 'Default controls restored.')) {
      keyboardTabs.select('controls-driving-panel');
      controllerTabs.select('controls-controller-driving-panel');
      renderGamepadLabel();
      deviceTabs.select('controls-keyboard-panel');
    }
  };
  container.querySelector<HTMLButtonElement>('[data-reset]')!.addEventListener('click', reset);

  window.addEventListener('gamepadconnected', () => {
    deviceStatus.textContent = '✅ Controller connected';
  });
  window.addEventListener('gamepaddisconnected', () => {
    deviceStatus.textContent = '⏳ Waiting for an Xbox-compatible controller';
  });

  const pressedKeys = new PressedIndicator(keyboardDiagram, 'code');
  const pressedPad = new PressedIndicator(gamepadDiagram, 'pad');
  const keyboardPanel = container.querySelector<HTMLElement>('#controls-keyboard-panel')!;
  const controllerPanel = container.querySelector<HTMLElement>('#controls-controller-panel')!;
  const settingsDialog = host.closest('dialog');
  const isShown = (panel: HTMLElement) =>
    (settingsDialog?.open ?? true) &&
    document.visibilityState === 'visible' &&
    !panel.closest('[hidden]');
  const onKey = (event: KeyboardEvent) => pressedKeys.press(event.code, event.type === 'keydown');
  const clearKeys = () => pressedKeys.clear();
  let keysLive = false;
  let padFrame = 0;
  const pollPad = () => {
    const pad = standardGamepad();
    pressedPad.set(pad ? pressedGamepadControls(pad) : new Set());
    padFrame = requestAnimationFrame(pollPad);
  };
  const updateLivePreview = () => {
    const keysShown = isShown(keyboardPanel);
    if (keysShown !== keysLive) {
      keysLive = keysShown;
      if (keysShown) {
        window.addEventListener('keydown', onKey, true);
        window.addEventListener('keyup', onKey, true);
        window.addEventListener('blur', clearKeys);
      } else {
        window.removeEventListener('keydown', onKey, true);
        window.removeEventListener('keyup', onKey, true);
        window.removeEventListener('blur', clearKeys);
        clearKeys();
      }
    }
    const padShown = isShown(controllerPanel);
    if (padShown && !padFrame) padFrame = requestAnimationFrame(pollPad);
    else if (!padShown && padFrame) {
      cancelAnimationFrame(padFrame);
      padFrame = 0;
      pressedPad.clear();
    }
  };
  new MutationObserver(updateLivePreview).observe(settingsDialog ?? container, {
    attributes: true,
    attributeFilter: ['open', 'hidden'],
    subtree: true,
  });
  document.addEventListener('visibilitychange', updateLivePreview);

  inputBindings.load(storage, (error) => {
    if (storage) notify(error);
  });
  render();
  updateControllerStatus(deviceStatus);
  updateLivePreview();
  return reset;
}

const stickDeadzone = 0.5;

/** Physical controls currently held, keyed by standard-mapping button index; deflected sticks count as their click buttons. */
export function pressedGamepadControls(pad: Pick<Gamepad, 'axes' | 'buttons'>): Set<string> {
  const pressed = new Set<string>();
  pad.buttons.forEach((button, index) => {
    if (button.pressed) pressed.add(String(index));
  });
  if (Math.hypot(pad.axes[0] ?? 0, pad.axes[1] ?? 0) > stickDeadzone) pressed.add('10');
  if (Math.hypot(pad.axes[2] ?? 0, pad.axes[3] ?? 0) > stickDeadzone) pressed.add('11');
  return pressed;
}

class PressedIndicator {
  private pressed = new Set<string>();

  constructor(
    private readonly root: Element,
    private readonly attribute: string,
  ) {}

  press(id: string, on: boolean) {
    if (this.pressed.has(id) === on) return;
    if (on) this.pressed.add(id);
    else this.pressed.delete(id);
    this.toggle(id, on);
  }

  set(next: Set<string>) {
    for (const id of this.pressed) if (!next.has(id)) this.press(id, false);
    for (const id of next) this.press(id, true);
  }

  clear() {
    this.set(new Set());
  }

  reapply() {
    for (const id of this.pressed) this.toggle(id, true);
  }

  private toggle(id: string, on: boolean) {
    for (const element of this.root.querySelectorAll(
      `[data-${this.attribute}="${CSS.escape(id)}"]`,
    ))
      element.classList.toggle('is-pressed', on);
  }
}

function standardGamepad(): Gamepad | undefined {
  if (typeof navigator.getGamepads !== 'function') return undefined;
  return Array.from(navigator.getGamepads()).find((entry): entry is Gamepad =>
    Boolean(entry?.connected && entry.mapping === 'standard'),
  );
}

function browserStorage(reportError: (error: Error) => void): StorageLike | null {
  try {
    return persistentStorage;
  } catch (error) {
    reportError(
      new Error(
        `Unable to access saved controls: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
    return null;
  }
}

function createBindingRow(
  label: string,
  binding: string,
  device: 'keyboard' | 'controller',
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'binding-item';
  const name = document.createElement('span');
  name.className = 'binding-label';
  name.textContent = label;
  const button = document.createElement('button');
  button.className = 'button button-secondary binding-button';
  button.type = 'button';
  button.dataset.binding = binding;
  button.textContent = '…';
  button.setAttribute('aria-label', `${label} binding; activate to remap`);
  button.dataset.device = device;
  row.append(name, button);
  return row;
}

function createAxisRow(action: AxisAction, label: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'controls-settings__axis-row';
  const select = document.createElement('select');
  select.dataset.axis = action;
  select.setAttribute('aria-label', label);
  axisOptions.forEach(({ index, label: optionLabel }) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = optionLabel;
    select.append(option);
  });
  const invertLabel = document.createElement('label');
  invertLabel.className = 'controls-settings__invert';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.dataset.invert = action;
  input.setAttribute('aria-label', `Invert ${label.toLowerCase()}`);
  const text = document.createElement('span');
  text.textContent = 'Invert';
  invertLabel.append(input, text);
  const field = document.createElement('label');
  field.className = 'controls-settings__axis-field';
  const caption = document.createElement('span');
  caption.textContent = label;
  field.append(caption, select);
  row.append(field, invertLabel);
  return row;
}

function renderKeyboardDiagram(root: HTMLElement): void {
  const rows: { keys: [string, string, number?][] }[] = [
    {
      keys: [
        ['Backquote', '`'],
        ['Digit1', '1'],
        ['Digit2', '2'],
        ['Digit3', '3'],
        ['Digit4', '4'],
        ['Digit5', '5'],
        ['Digit6', '6'],
        ['Digit7', '7'],
        ['Digit8', '8'],
        ['Digit9', '9'],
        ['Digit0', '0'],
        ['Minus', '-'],
        ['Equal', '='],
        ['Backspace', 'Back', 2],
      ],
    },
    {
      keys: [
        ['Tab', 'Tab', 1.5],
        ['KeyQ', 'Q'],
        ['KeyW', 'W'],
        ['KeyE', 'E'],
        ['KeyR', 'R'],
        ['KeyT', 'T'],
        ['KeyY', 'Y'],
        ['KeyU', 'U'],
        ['KeyI', 'I'],
        ['KeyO', 'O'],
        ['KeyP', 'P'],
        ['BracketLeft', '['],
        ['BracketRight', ']'],
        ['Backslash', '\\', 1.5],
      ],
    },
    {
      keys: [
        ['CapsLock', 'Caps', 1.75],
        ['KeyA', 'A'],
        ['KeyS', 'S'],
        ['KeyD', 'D'],
        ['KeyF', 'F'],
        ['KeyG', 'G'],
        ['KeyH', 'H'],
        ['KeyJ', 'J'],
        ['KeyK', 'K'],
        ['KeyL', 'L'],
        ['Semicolon', ';'],
        ['Quote', "'"],
        ['Enter', 'Enter', 2.25],
      ],
    },
    {
      keys: [
        ['ShiftLeft', 'Shift', 2.25],
        ['KeyZ', 'Z'],
        ['KeyX', 'X'],
        ['KeyC', 'C'],
        ['KeyV', 'V'],
        ['KeyB', 'B'],
        ['KeyN', 'N'],
        ['KeyM', 'M'],
        ['Comma', ','],
        ['Period', '.'],
        ['Slash', '/'],
        ['ShiftRight', 'Shift', 2.75],
      ],
    },
    {
      keys: [
        ['ControlLeft', 'Ctrl', 1.25],
        ['MetaLeft', 'Win', 1.25],
        ['AltLeft', 'Alt', 1.25],
        ['Space', 'Space', 6.25],
        ['AltRight', 'Alt', 1.25],
        ['MetaRight', 'Win', 1.25],
        ['ContextMenu', 'Fn', 1.25],
        ['ControlRight', 'Ctrl', 1.25],
      ],
    },
  ];
  const mappedCodes = new Map(
    keyboardActions.map(({ id, group }) => [inputBindings.get().keyboard[id], group]),
  );
  const createKey = (code: string, label: string) => {
    const key = document.createElement('span');
    key.className = 'keyboard-diagram__key';
    key.dataset.code = code;
    key.textContent = label;
    const group = mappedCodes.get(code);
    if (group) key.classList.add(group === 'driving' ? 'is-primary' : 'is-mapped');
    return key;
  };
  root.replaceChildren();
  const alpha = document.createElement('div');
  alpha.className = 'keyboard-diagram__alpha';
  for (const row of rows) {
    const keyRow = document.createElement('div');
    keyRow.className = 'keyboard-diagram__row';
    for (const [code, label, width = 1] of row.keys) {
      const key = createKey(code, label);
      if (width > 1) key.style.setProperty('--key-width', String(width));
      keyRow.append(key);
    }
    alpha.append(keyRow);
  }
  const arrows = document.createElement('div');
  arrows.className = 'keyboard-diagram__arrows';
  for (const [code, label, direction] of [
    ['ArrowUp', '↑', 'up'],
    ['ArrowLeft', '←', 'left'],
    ['ArrowDown', '↓', 'down'],
    ['ArrowRight', '→', 'right'],
  ]) {
    const key = createKey(code, label);
    key.classList.add(direction);
    arrows.append(key);
  }
  const drawnCodes = new Set(rows.flatMap((row) => row.keys.map(([code]) => code)));
  for (const code of ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']) drawnCodes.add(code);
  const extras = document.createElement('div');
  extras.className = 'keyboard-diagram__extras';
  for (const code of mappedCodes.keys()) {
    if (!drawnCodes.has(code)) extras.append(createKey(code, formatKeyboardCode(code)));
  }
  root.append(alpha, arrows, ...(extras.childElementCount ? [extras] : []));
  const summary = keyboardActions
    .map(({ id, label }) => `${label}: ${formatKeyboardCode(inputBindings.get().keyboard[id])}`)
    .join('; ');
  root.setAttribute('aria-label', `ANSI QWERTY keyboard and arrow-key diagram. ${summary}`);
}

function updateControllerStatus(element: HTMLElement): void {
  const available = typeof navigator.getGamepads === 'function';
  const wheel =
    available && Array.from(navigator.getGamepads()).find((pad) => pad?.connected && isT300(pad));
  const pad = wheel || standardGamepad();
  element.textContent = pad
    ? wheel
      ? '✅ Connected: Thrustmaster T300RS GT'
      : '✅ Connected'
    : available && Array.from(navigator.getGamepads()).some((entry) => entry?.connected)
      ? '🛑 Controller unsupported'
      : available
        ? '⏳ Waiting for controller'
        : '🛑 Gamepad API unavailable';
}
