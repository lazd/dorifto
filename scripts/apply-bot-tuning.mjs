// Copies optimizer output (`training-results/race-tuning-<preset>-tune.json`) into
// `src/race-bot-tunings.json`, which the game bundles at build time.
// Usage: npm run apply:bot [-- <preset> ...]   (defaults to grip-default)
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export async function applyBotTuning(preset, tuning) {
  const target = new URL('../src/race-bot-tunings.json', import.meta.url);
  const tunings = JSON.parse(await readFile(target, 'utf8'));
  if (!Object.hasOwn(tunings, preset)) throw new Error(`Unknown race bot preset: ${preset}`);
  tunings[preset] = { ...tunings[preset], ...tuning };
  await writeFile(target, `${JSON.stringify(tunings, null, 2)}\n`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const presets = process.argv.length > 2 ? process.argv.slice(2) : ['grip-default'];
  for (const preset of presets) {
    const source = new URL(`../training-results/race-tuning-${preset}-tune.json`, import.meta.url);
    await applyBotTuning(preset, JSON.parse(await readFile(source, 'utf8')));
    console.log(`Applied ${preset} from ${source.pathname}`);
  }
}
