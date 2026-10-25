import type { StyleSpecification } from 'maplibre-gl';
import type { CoursePreviewColors } from './course-preview-3d';
import { roadClasses } from './road-selection';

export function roadBuilderTheme() {
  const style = getComputedStyle(document.documentElement);
  const color = (token: string) => {
    const value = style.getPropertyValue(`--color-${token}`).trim();
    if (!value) throw new Error(`Missing design token: --color-${token}`);
    return value;
  };
  const palette = {
    background: color('sunken'),
    surface: color('surface'),
    border: color('border'),
    text: color('text'),
    muted: color('muted'),
    accent: color('accent'),
    selected: color('selected'),
  };
  const preview: CoursePreviewColors & { background: string } = {
    background: palette.background,
    ground: palette.selected,
    road: palette.muted,
    start: palette.accent,
    light: palette.text,
    shade: palette.background,
  };
  const map: StyleSpecification = {
    version: 8,
    sources: {
      openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
    },
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': palette.background } },
      {
        id: 'landcover',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landcover',
        paint: { 'fill-color': palette.surface, 'fill-opacity': 0.8 },
      },
      {
        id: 'park',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'park',
        paint: { 'fill-color': palette.selected, 'fill-opacity': 0.5 },
      },
      {
        id: 'water',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'water',
        paint: { 'fill-color': palette.border, 'fill-opacity': 0.6 },
      },
      {
        id: 'buildings',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'building',
        minzoom: 14,
        paint: { 'fill-color': palette.border, 'fill-opacity': 0.5 },
      },
      {
        id: 'road-casing',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', roadClasses]],
        paint: {
          'line-color': palette.background,
          'line-width': ['interpolate', ['linear'], ['zoom'], 6, 1, 14, 6, 18, 18],
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      },
      {
        id: 'roads',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', roadClasses]],
        paint: {
          'line-color': [
            'match',
            ['get', 'class'],
            ['motorway', 'trunk', 'primary'],
            palette.text,
            ['secondary', 'tertiary'],
            palette.muted,
            palette.border,
          ],
          'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.5, 14, 2.5, 18, 12],
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      },
      {
        id: 'road-names',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'transportation_name',
        minzoom: 12,
        layout: {
          'symbol-placement': 'line',
          'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']],
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
        },
        paint: {
          'text-color': palette.text,
          'text-halo-color': palette.background,
          'text-halo-width': 2,
        },
      },
      {
        id: 'places',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'place',
        layout: {
          'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 4, 11, 14, 15],
        },
        paint: {
          'text-color': palette.muted,
          'text-halo-color': palette.background,
          'text-halo-width': 2,
        },
      },
    ],
  };
  return { palette, map, preview };
}
