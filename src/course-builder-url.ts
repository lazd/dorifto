import type { RoadDraft } from './course-builder-data';
import type { GPSPoint } from './track-conversion.mjs';
import { validateCompleteMapDimensions } from './complete-map';

export interface EditorDraft {
  draft: RoadDraft;
  name: string;
  width: string;
  shoulderWidth: string;
  terrainTransition: string;
  doubleYellow: boolean;
}

export function validateEditorDraft(value: unknown): asserts value is EditorDraft {
  const record = (input: unknown): input is Record<string, unknown> =>
    typeof input === 'object' && input !== null;
  const point = (input: unknown): input is GPSPoint =>
    record(input) &&
    typeof input.lat === 'number' &&
    Number.isFinite(input.lat) &&
    Math.abs(input.lat) <= 85 &&
    typeof input.lon === 'number' &&
    Number.isFinite(input.lon) &&
    Math.abs(input.lon) <= 180;
  const line = (input: unknown) => Array.isArray(input) && input.length > 0 && input.every(point);
  if (
    !record(value) ||
    !['name', 'width', 'shoulderWidth', 'terrainTransition'].every(
      (key) => typeof value[key] === 'string',
    ) ||
    typeof value.doubleYellow !== 'boolean' ||
    !record(value.draft) ||
    !Array.isArray(value.draft.sections) ||
    !value.draft.sections.every(line) ||
    (value.draft.closingSection !== undefined && !line(value.draft.closingSection)) ||
    typeof value.draft.resolution !== 'number' ||
    !Number.isFinite(value.draft.resolution) ||
    value.draft.resolution < 1 ||
    !['course', 'nearby-roads', 'complete-map'].includes(String(value.draft.definition))
  )
    throw new Error('The URL contains an invalid course draft.');
  const draft = value.draft;
  if (draft.completeMapDimensions !== undefined) {
    const dimensions = draft.completeMapDimensions;
    if (
      !record(dimensions) ||
      typeof dimensions.width !== 'number' ||
      typeof dimensions.height !== 'number'
    )
      throw new Error('The URL contains invalid map dimensions.');
    validateCompleteMapDimensions({ width: dimensions.width, height: dimensions.height });
  }
  if (
    draft.structureLines !== undefined &&
    (!Array.isArray(draft.structureLines) ||
      !draft.structureLines.every(
        (structure) =>
          record(structure) &&
          ['bridge', 'tunnel'].includes(String(structure.type)) &&
          Array.isArray(structure.coordinates) &&
          structure.coordinates.every(
            (coordinate: unknown) =>
              Array.isArray(coordinate) &&
              coordinate.length >= 2 &&
              coordinate.every(
                (number: unknown) => typeof number === 'number' && Number.isFinite(number),
              ),
          ),
      ))
  )
    throw new Error('The URL contains invalid road structures.');
}

export async function compressEditorDraft(json: string) {
  const bytes = new Uint8Array(
    await new Response(
      new Blob([json]).stream().pipeThrough(new CompressionStream('deflate')),
    ).arrayBuffer(),
  );
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `z.${btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')}`;
}

export async function readEditorDraft(encoded: string): Promise<EditorDraft> {
  let json = encoded;
  if (encoded.startsWith('z.')) {
    const binary = atob(encoded.slice(2).replaceAll('-', '+').replaceAll('_', '/'));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    json = await new Response(
      new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')),
    ).text();
  }
  const draft: unknown = JSON.parse(json);
  validateEditorDraft(draft);
  return draft;
}

export function editorDraftURL(url: URL, draft: string, editingId?: string) {
  const result = new URL(url);
  result.searchParams.set('view', editingId ? 'edit' : 'create');
  if (editingId) result.searchParams.set('edit', editingId);
  else result.searchParams.delete('edit');
  result.searchParams.set('draft', draft);
  return result;
}
