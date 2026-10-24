import './bot-tuning.css';
import {
  defaultRaceBotOptions,
  maxRaceBots,
  raceBotPresets,
  readBotsOnly,
  readRaceBots,
  type RaceBotOptions,
  type RaceBotPreset,
} from './race-bot';
import { botColor, botName } from './bot-car';
import { defaultTuningPresets } from './configuration-state';

const presetNames = new Map(defaultTuningPresets().map((preset) => [preset.id, preset.name]));

function makeElement<T extends HTMLElement>(tag: string, className?: string, text?: string) {
  const element = document.createElement(tag) as T;
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function makeSlider(
  key: 'skill' | 'aggression',
  labelText: string,
  start: string,
  end: string,
  bot: RaceBotOptions,
  onChange: () => void,
) {
  const label = makeElement<HTMLLabelElement>('label', 'bot-slider field');
  const heading = makeElement<HTMLSpanElement>('span', 'bot-slider-heading');
  const title = makeElement<HTMLSpanElement>('span', undefined, labelText);
  const output = makeElement<HTMLOutputElement>('output');
  const input = makeElement<HTMLInputElement>('input');
  const endpoints = makeElement<HTMLSpanElement>('span', 'bot-slider-endpoints');
  const id = `bot-${key}`;

  input.id = id;
  input.type = 'range';
  input.min = '0';
  input.max = '1';
  input.step = '0.05';
  input.value = String(bot[key]);
  title.id = `${id}-title`;
  input.setAttribute('aria-labelledby', title.id);
  output.htmlFor = id;
  endpoints.append(makeElement('span', undefined, start), makeElement('span', undefined, end));
  const sync = () => {
    output.value = `${Math.round(bot[key] * 100)}%`;
    const percentage = bot[key] * 100;
    input.style.setProperty('--value', `${percentage}%`);
    input.setAttribute('aria-valuetext', output.value);
  };
  input.addEventListener('input', () => {
    bot[key] = input.valueAsNumber;
    sync();
    onChange();
  });
  heading.append(title, output);
  label.append(heading, input, endpoints);
  sync();
  return label;
}

export function bindBotDialog(
  root: HTMLElement,
  applySettings: (bots: RaceBotOptions[], botsOnly: boolean) => void | Promise<void>,
) {
  const list = root.querySelector<HTMLElement>('.selection-list')!;
  const add = root.querySelector<HTMLButtonElement>('.bot-add')!;
  const botsOnly = root.querySelector<HTMLInputElement>('.bots-only')!;
  const raceWithBots = root.querySelector<HTMLInputElement>('.race-with-bots')!;
  const error = root.querySelector<HTMLElement>('[role="alert"]')!;
  const editor = root.querySelector<HTMLElement>('#bot-editor')!;
  const count = root.querySelector<HTMLElement>('.bot-count')!;
  const apply = root.querySelector<HTMLButtonElement>('.bots-apply')!;
  const closeButton = root.querySelector<HTMLButtonElement>('#bots-dialog-close button')!;
  const cancelButton = root.querySelector<HTMLButtonElement>('.dialog-actions .button-secondary')!;
  const masterDetail = root.querySelector<HTMLElement>('.master-detail')!;
  const raceMode = root.querySelector<HTMLElement>('.race-mode')!;
  let bots: RaceBotOptions[] = [];
  let selectedBotIndex = 0;
  let applying = false;

  const focusSelected = () => {
    const selected = list.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
    (selected ?? add).focus();
  };
  const refreshSummary = (index: number) => {
    const summary = list.querySelectorAll<HTMLElement>('.bot-summary')[index];
    const bot = bots[index];
    if (summary && bot)
      summary.textContent = `Skill ${Math.round(bot.skill * 100)}% · Agg. ${Math.round(bot.aggression * 100)}%`;
  };

  const render = (focus = false) => {
    count.textContent = `${bots.length} / ${maxRaceBots} bots`;
    list.replaceChildren(
      ...bots.map((bot, index) => {
        const item = makeElement<HTMLDivElement>('div', 'selection-item');
        item.setAttribute('role', 'listitem');
        const main = makeElement<HTMLButtonElement>('button', 'selection-item-main');
        const avatar = makeElement<HTMLSpanElement>('span', 'selection-avatar', '🤖');
        const text = makeElement<HTMLSpanElement>('span');
        const title = makeElement<HTMLSpanElement>('span', 'selection-item-title');
        const profile = makeElement<HTMLSpanElement>('span', 'selection-item-subtitle');
        const summary = makeElement<HTMLSpanElement>('span', 'selection-item-meta bot-summary');
        const remove = makeElement<HTMLButtonElement>(
          'button',
          'button button-quiet selection-item-remove',
          '×',
        );
        const preset = bot.preset ?? defaultRaceBotOptions.preset!;

        main.type = 'button';
        main.setAttribute('aria-pressed', String(index === selectedBotIndex));
        main.setAttribute('aria-label', `Edit ${botName(index)}`);
        avatar.setAttribute('aria-hidden', 'true');
        avatar.style.setProperty('--avatar-color', botColor(index));
        title.textContent = botName(index);
        profile.textContent = `Grip · ${presetNames.get(preset) ?? preset}`;
        summary.textContent = `Skill ${Math.round(bot.skill * 100)}% · Agg. ${Math.round(bot.aggression * 100)}%`;
        main.append(avatar, text);
        text.append(title, profile, summary);
        main.addEventListener('click', () => {
          selectedBotIndex = index;
          render(true);
        });
        remove.type = 'button';
        remove.setAttribute('aria-label', `Remove ${botName(index)}`);
        remove.title = `Remove ${botName(index)}`;
        remove.addEventListener('click', () => {
          bots.splice(index, 1);
          if (index < selectedBotIndex) selectedBotIndex -= 1;
          else if (index === selectedBotIndex) selectedBotIndex = Math.min(index, bots.length - 1);
          if (!bots.length) selectedBotIndex = 0;
          render(true);
        });
        item.append(main, remove);
        return item;
      }),
    );
    add.disabled = bots.length >= maxRaceBots;
    botsOnly.disabled = !bots.length;
    if (!bots.length) {
      botsOnly.checked = false;
      raceWithBots.checked = true;
    }

    if (!bots.length) {
      const empty = makeElement<HTMLDivElement>('div', 'bot-empty');
      empty.append(
        makeElement('strong', undefined, 'No bots in the grid'),
        makeElement('p', undefined, 'Add a bot to build your starting grid.'),
      );
      editor.replaceChildren(empty);
    } else {
      const bot = bots[selectedBotIndex];
      const panel = makeElement<HTMLElement>('section', 'bot-detail');
      const heading = makeElement<HTMLDivElement>('div', 'bot-editor-heading');
      const avatar = makeElement<HTMLSpanElement>('span', 'selection-avatar', '🤖');
      const title = makeElement<HTMLHeadingElement>('h3', undefined, botName(selectedBotIndex));
      const fields = makeElement<HTMLDivElement>('div', 'bot-fields');
      const modeLabel = makeElement<HTMLLabelElement>('label', 'field');
      const modeTitle = makeElement<HTMLSpanElement>('span', undefined, 'Drive mode');
      const mode = makeElement<HTMLSelectElement>('select');
      const profileLabel = makeElement<HTMLLabelElement>('label', 'field');
      const profileTitle = makeElement<HTMLSpanElement>('span', undefined, 'Tuning profile');
      const profile = makeElement<HTMLSelectElement>('select');
      const modeHelp = makeElement<HTMLParagraphElement>(
        'p',
        'dialog-help',
        'Bots currently use Grip handling; Drift mode is not available.',
      );
      const sliders = makeElement<HTMLDivElement>('div', 'bot-sliders');
      const options = makeElement<HTMLDivElement>('div', 'bot-options');

      avatar.setAttribute('aria-hidden', 'true');
      avatar.style.setProperty('--avatar-color', botColor(selectedBotIndex));
      title.id = 'selected-bot-title';
      mode.disabled = true;
      mode.setAttribute('aria-describedby', 'bot-drive-mode-help');
      mode.add(new Option('Grip', 'grip', true, true));
      modeHelp.id = 'bot-drive-mode-help';
      modeLabel.append(modeTitle, mode);
      profile.setAttribute('aria-label', 'Tuning profile');
      for (const id of raceBotPresets) profile.add(new Option(presetNames.get(id) ?? id, id));
      profile.value = bot.preset ?? defaultRaceBotOptions.preset!;
      profile.addEventListener('change', () => {
        bot.preset = profile.value as RaceBotPreset;
        render();
        editor.querySelector<HTMLSelectElement>('[aria-label="Tuning profile"]')?.focus();
      });
      profileLabel.append(profileTitle, profile);
      fields.append(modeLabel, profileLabel);
      heading.append(avatar, title);
      sliders.append(
        makeSlider('skill', 'Skill', 'Beginner', 'Expert', bot, () =>
          refreshSummary(selectedBotIndex),
        ),
        makeSlider('aggression', 'Aggression', 'Cautious', 'Bold', bot, () =>
          refreshSummary(selectedBotIndex),
        ),
      );

      const makeOption = (
        key: 'learning' | 'attackThrottleBoost',
        label: string,
        description: string,
      ) => {
        const row = makeElement<HTMLLabelElement>('label', 'bot-option');
        const input = makeElement<HTMLInputElement>('input', 'switch');
        const copy = makeElement<HTMLSpanElement>('span', 'bot-option-copy');
        const name = makeElement<HTMLSpanElement>('span', undefined, label);
        const help = makeElement<HTMLSpanElement>('span', 'help-text', description);
        input.type = 'checkbox';
        input.setAttribute('role', 'switch');
        input.checked = key === 'learning' ? bot.learning : bot.attackThrottleBoost !== false;
        input.addEventListener('change', () => {
          bot[key] = input.checked;
        });
        copy.append(name, help);
        row.append(input, copy);
        return row;
      };

      options.append(
        makeOption('learning', 'Learn between laps', 'Adapt driving using previous laps.'),
        makeOption(
          'attackThrottleBoost',
          'Attack throttle boost',
          'Allow extra throttle when attacking.',
        ),
      );
      panel.setAttribute('aria-labelledby', title.id);
      panel.append(heading, fields, modeHelp, sliders, options);
      editor.replaceChildren(panel);
    }
    if (focus) focusSelected();
  };

  add.addEventListener('click', () => {
    if (bots.length >= maxRaceBots || applying) return;
    bots.push({ ...defaultRaceBotOptions });
    selectedBotIndex = bots.length - 1;
    render(true);
  });
  apply.addEventListener('click', async () => {
    if (applying) return;
    applying = true;
    apply.disabled = true;
    closeButton.disabled = true;
    cancelButton.disabled = true;
    masterDetail.inert = true;
    raceMode.inert = true;
    root.setAttribute('aria-busy', 'true');
    error.textContent = '';
    try {
      await applySettings(
        bots.map((bot) => ({ ...bot })),
        botsOnly.checked,
      );
      root.closest('dialog')?.close();
    } catch (problem) {
      error.textContent = `Unable to apply bot settings: ${
        problem instanceof Error ? problem.message : String(problem)
      }`;
    } finally {
      applying = false;
      apply.disabled = false;
      closeButton.disabled = false;
      cancelButton.disabled = false;
      masterDetail.inert = false;
      raceMode.inert = false;
      root.removeAttribute('aria-busy');
    }
  });

  return () => {
    error.textContent = '';
    const parameters = new URL(location.href).searchParams;
    try {
      bots = readRaceBots(parameters);
      botsOnly.checked = readBotsOnly(parameters);
      raceWithBots.checked = !botsOnly.checked;
    } catch (problem) {
      bots = [];
      botsOnly.checked = false;
      raceWithBots.checked = true;
      error.textContent = `Ignoring invalid bot parameters: ${
        problem instanceof Error ? problem.message : String(problem)
      }`;
    }
    selectedBotIndex = Math.min(selectedBotIndex, bots.length - 1);
    if (!bots.length) selectedBotIndex = 0;
    render();
  };
}
