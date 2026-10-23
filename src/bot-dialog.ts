import {
  defaultRaceBotOptions,
  maxRaceBots,
  raceBotPresets,
  readBotsOnly,
  readRaceBots,
  type RaceBotOptions,
  type RaceBotPreset,
} from './race-bot';
import { botColor } from './bot-car';
import { defaultTuningPresets } from './configuration-state';

const presetNames = new Map(defaultTuningPresets().map((preset) => [preset.id, preset.name]));

function control<T extends HTMLElement>(parent: HTMLElement, tag: string, text: string) {
  const label = document.createElement('label');
  const title = document.createElement('span');
  const input = document.createElement(tag) as T;
  title.textContent = text;
  label.append(title, input);
  parent.append(label);
  return { label, input };
}

export function bindBotDialog(
  root: HTMLElement,
  applySettings: (bots: RaceBotOptions[], botsOnly: boolean) => void | Promise<void>,
) {
  const list = root.querySelector<HTMLElement>('.bot-list')!;
  const add = root.querySelector<HTMLButtonElement>('.bot-add')!;
  const botsOnly = root.querySelector<HTMLInputElement>('.bots-only')!;
  const error = root.querySelector<HTMLElement>('[role="alert"]')!;
  let bots: RaceBotOptions[] = [];

  const render = () => {
    list.replaceChildren(
      ...bots.map((bot, index) => {
        const well = document.createElement('section');
        const header = document.createElement('div');
        const title = document.createElement('h3');
        well.className = 'well';
        header.className = 'well-header';
        title.id = `bot-${index}-title`;
        const avatar = document.createElement('span');
        avatar.className = 'avatar';
        avatar.textContent = '🤖';
        avatar.style.setProperty('--avatar-color', botColor(index));
        title.append(avatar, `Bot ${index + 1}`);
        well.setAttribute('aria-labelledby', title.id);

        const style = document.createElement('select');
        style.ariaLabel = 'Driving style';
        style.disabled = true;
        style.add(new Option('Grip', 'grip', true, true));
        style.add(new Option('Drift', 'drift'));

        const preset = document.createElement('select');
        preset.ariaLabel = 'Profile';
        for (const id of raceBotPresets) preset.add(new Option(presetNames.get(id) ?? id, id));
        preset.value = bot.preset ?? defaultRaceBotOptions.preset!;
        preset.addEventListener('change', () => {
          bot.preset = preset.value as RaceBotPreset;
        });
        header.append(title, style, preset);
        well.append(header);

        for (const [key, text] of [
          ['skill', 'Skill'],
          ['aggression', 'Aggression'],
        ] as const) {
          const { label, input } = control<HTMLInputElement>(well, 'input', text);
          const output = document.createElement('output');
          label.className = 'slider-control';
          label.insertBefore(output, input);
          input.type = 'range';
          input.min = '0';
          input.max = '1';
          input.step = '0.05';
          input.value = String(bot[key]);
          const sync = () => (output.value = bot[key].toFixed(2));
          input.addEventListener('input', () => {
            bot[key] = input.valueAsNumber;
            sync();
          });
          sync();
        }

        const footer = document.createElement('div');
        const remove = document.createElement('button');
        footer.className = 'well-footer';
        remove.type = 'button';
        remove.className = 'keycap';
        remove.textContent = 'Remove';
        remove.addEventListener('click', () => {
          bots.splice(index, 1);
          render();
        });
        const learning = control<HTMLInputElement>(footer, 'input', 'Learns between laps');
        learning.label.className = 'checkbox-control';
        learning.label.prepend(learning.input);
        learning.input.type = 'checkbox';
        learning.input.checked = bot.learning;
        learning.input.addEventListener('change', () => {
          bot.learning = learning.input.checked;
        });
        footer.append(remove);
        well.append(footer);
        return well;
      }),
    );
    add.disabled = bots.length >= maxRaceBots;
    botsOnly.disabled = !bots.length;
    if (!bots.length) botsOnly.checked = false;
  };

  add.addEventListener('click', () => {
    bots.push({ ...defaultRaceBotOptions });
    render();
  });
  const apply = root.querySelector<HTMLButtonElement>('.bots-apply')!;
  apply.addEventListener('click', async () => {
    apply.disabled = true;
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
      apply.disabled = false;
    }
  });

  return () => {
    error.textContent = '';
    const parameters = new URL(location.href).searchParams;
    try {
      bots = readRaceBots(parameters);
      botsOnly.checked = readBotsOnly(parameters);
    } catch (problem) {
      bots = [];
      error.textContent = `Ignoring invalid bot parameters: ${(problem as Error).message}`;
    }
    render();
  };
}
