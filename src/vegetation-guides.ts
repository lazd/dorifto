import pine from './vegetation-assets/pine-preview.json';
import oak from './vegetation-assets/oak-preview.json';
import aspen from './vegetation-assets/aspen-preview.json';
import bushPine from './vegetation-assets/bush-pine-preview.json';
import bushAsh from './vegetation-assets/bush-ash-preview.json';
import bushAspen from './vegetation-assets/bush-aspen-preview.json';

export const plantGuides = { pine, oak, aspen, bushPine, bushAsh, bushAspen };
export type PresetSpecies = keyof typeof plantGuides;
