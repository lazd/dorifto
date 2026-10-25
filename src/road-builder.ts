import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource } from 'maplibre-gl';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import {
  RoadGraph,
  maximumRoadLength,
  minimumRoadLength,
  roadClasses,
  routeLength,
  removeRouteWaypoint,
  validateImportRoute,
  closeRoadLoop,
  cleanRoadRoute,
} from './road-selection';
import { RoadBuilderPreview } from './road-builder-preview';
import { roadBuilderTheme } from './road-builder-map';
import { createLocationSearch } from './road-builder-search';
import { listRoadMaps, openRoadMaps, storeRoadMap } from './road-builder-storage';
import {
  readRoadMap,
  restoreRoadDraft,
  roadMapMeta,
  roadMapThumbnail,
  type RoadMap,
} from './road-builder-data';
import type { GPSPoint } from './track-conversion.mjs';
import { courseShoulderWidth } from './courses';
import { defaultTerrainTransition } from './terrain';
import type { BuildRequest, BuildResponse } from './road-builder-worker';
import './road-builder.css';

function element<T extends HTMLElement>(id: string) {
  const result = document.getElementById(id);
  if (!result) throw new Error(`Missing road builder element: ${id}`);
  return result as T;
}

const status = element('status');
const buildButton = element<HTMLButtonElement>('build');
const builder = document.querySelector<HTMLElement>('.builder')!;
const buildDialog = element<HTMLDialogElement>('build-dialog');
const buildSteps = element('build-steps');
const nameInput = element<HTMLInputElement>('name');
const widthInput = element<HTMLInputElement>('width');
const transitionInput = element<HTMLInputElement>('terrain-transition');
const centerLineInput = element<HTMLInputElement>('center-line');
const shoulderInput = element<HTMLInputElement>('shoulder-width');
const clearButton = element<HTMLButtonElement>('clear');
const locationForm = element<HTMLFormElement>('location-form');
const locationInput = element<HTMLInputElement>('location');
const locationButton = element<HTMLButtonElement>('location-submit');
let searching = false;
let searchVersion = 0;
let mapReady = false;
let hasLocated = false;
let guidanceTimer: ReturnType<typeof setTimeout> | undefined;
let graph = new RoadGraph();
let sections: GPSPoint[][] = [];
let closingSection: GPSPoint[] | undefined;
let course: RoadMap | undefined;
let courseJSON: Blob | undefined;
let worker: Worker | undefined;
let saveController: AbortController | undefined;
let directory: FileSystemDirectoryHandle | undefined;
let courseSaved = false;
type View = 'library' | 'editor' | 'generating' | 'preview';
let view: View = 'library';
let savedMaps: { course: RoadMap; handle: FileSystemFileHandle }[] = [];
let selectedId: string | undefined;
let editingId: string | undefined;
let editingFilename: string | undefined;
let editingSnapshot: string | undefined;
let previewWorker: Worker | undefined;
let previewVersion = 0;
const markers: maplibregl.Marker[] = [];
const theme = roadBuilderTheme();
const mapContainer = element('map');
const inspection = element('inspection');
let preview: RoadBuilderPreview | undefined;

function notify(message: string, error = false) {
  clearTimeout(guidanceTimer);
  status.textContent = message;
  status.dataset.error = String(error);
  status.hidden = view === 'generating' || (view === 'library' && !error);
}

function guide() {
  if (worker || searching || view === 'library') return;
  notify(
    !inspection.hidden && course
      ? courseSaved
        ? 'Looks good! Your map is saved. Press Play to download it and go race!'
        : 'Your map could not be saved on this device. Press Play to download it.'
      : closingSection
        ? 'Loop closed! Press Save to save your track.'
        : sections.length >= 3
          ? 'Add more waypoints or click the start position to create a loop'
          : sections.length
            ? 'Click to set a finish line or add more waypoints'
            : map.getZoom() >= 14
              ? 'Click to set a start position'
              : hasLocated
                ? 'Zoom in and click to set a start position'
                : 'Search for a place to start your track',
  );
}

function confirmAction(message: string) {
  notify(message);
  guidanceTimer = setTimeout(guide, 4500);
}

function report(error: unknown) {
  console.error(error);
  const message = error instanceof Error ? error.message : String(error);
  notify(message.trim() || 'An unexpected error occurred. Please try again.', true);
}

function routePoints() {
  return cleanRoadRoute(
    [...sections, ...(closingSection ? [closingSection] : [])].flatMap((points, i) =>
      i === 0 ? points : points.slice(1),
    ),
  );
}

maplibregl.setWorkerUrl(mapWorkerUrl);
const map = new maplibregl.Map({
  container: 'map',
  style: theme.map,
  center: [-120.894, 38.788],
  zoom: 14,
  maxZoom: 18,
  attributionControl: {
    compact: true,
    customAttribution: 'Search: <a href="https://nominatim.openstreetmap.org/">Nominatim</a>',
  },
});
map.addControl(new maplibregl.NavigationControl({ showCompass: false }));
map.on('error', (event) => report(event.error));

const hoverNode = document.createElement('div');
hoverNode.className = 'route-hover';
hoverNode.setAttribute('aria-hidden', 'true');
const hoverMarker = new maplibregl.Marker({ element: hoverNode });
let hoverPosition: maplibregl.Point | undefined;
let hoverFrame = 0;
let hoverAttached = false;

function snapTolerance(point: GPSPoint) {
  return Math.min(
    100,
    (12 * 156543.03 * Math.cos((point.lat * Math.PI) / 180)) / 2 ** map.getZoom(),
  );
}

function hideHover() {
  cancelAnimationFrame(hoverFrame);
  hoverFrame = 0;
  if (hoverAttached) hoverMarker.remove();
  hoverAttached = false;
}

function updateHover() {
  hoverFrame = 0;
  if (
    !hoverPosition ||
    !mapReady ||
    worker ||
    mapContainer.hidden ||
    map.isMoving() ||
    map.getZoom() < 14 ||
    !map.isSourceLoaded('openmaptiles')
  ) {
    hideHover();
    return;
  }
  const location = map.unproject(hoverPosition);
  const point = { lat: location.lat, lon: location.lng };
  const snapped = graph.findSnap(point, snapTolerance(point));
  if (!snapped) {
    hideHover();
    return;
  }
  const previous = hoverMarker.getLngLat();
  if (!previous || previous.lng !== snapped.point.lon || previous.lat !== snapped.point.lat)
    hoverMarker.setLngLat([snapped.point.lon, snapped.point.lat]);
  if (!hoverAttached) {
    hoverMarker.addTo(map);
    hoverAttached = true;
  }
}

map.on('mousemove', (event) => {
  hoverPosition = event.point;
  if (!hoverFrame) hoverFrame = requestAnimationFrame(updateHover);
});
map.on('movestart', hideHover);
map.getCanvas().addEventListener('mouseleave', () => {
  hoverPosition = undefined;
  hideHover();
});

function editorSnapshot() {
  return JSON.stringify({
    sections,
    closingSection,
    name: nameInput.value,
    width: Number(widthInput.value),
    shoulderWidth: Number(shoulderInput.value),
    terrainTransition: Number(transitionInput.value),
    doubleYellow: centerLineInput.checked,
  });
}

function updateControls() {
  const points = routePoints();
  const length = routeLength(points);
  element('distance').textContent =
    `${(length / 1000).toFixed(2)} km${closingSection ? ' · Closed loop' : ''}`;
  clearButton.disabled = !!worker || !sections.length;
  buildButton.disabled =
    !!worker ||
    length < minimumRoadLength ||
    length > maximumRoadLength ||
    (editingSnapshot !== undefined && editingSnapshot === editorSnapshot());
  for (const input of [nameInput, widthInput, shoulderInput, transitionInput, centerLineInput])
    input.disabled = !!worker;
}

function invalidateCourse() {
  showMap();
  preview?.dispose();
  preview = undefined;
  course = undefined;
  courseJSON = undefined;
  courseSaved = false;
}

function showMap() {
  setView('editor');
  map.resize();
}

function showPreview() {
  hideHover();
  setView('preview');
  updatePreviewInfo();
}

element<HTMLButtonElement>('edit-route').onclick = () => {
  if (view === 'library') editSavedCourse();
  else {
    showMap();
    guide();
  }
};

function setView(next: View) {
  if (next !== 'editor') searchVersion++;
  view = next;
  builder.dataset.view = next;
  element('library-panel').hidden = next !== 'library';
  element('editor-panel').hidden = next !== 'editor';
  element('editor-actions').hidden = next !== 'editor';
  mapContainer.hidden = next !== 'editor' && next !== 'generating';
  locationForm.hidden = next !== 'editor';
  inspection.hidden = next !== 'library' && next !== 'preview';
  element('empty-library').hidden = next !== 'library' || savedMaps.length > 0;
  if (next === 'library' && !savedMaps.length) inspection.hidden = true;
  status.hidden = next !== 'editor';
}

function updatePreviewInfo() {
  element('preview-name').textContent = course?.name ?? '';
  element('preview-meta').textContent = course ? roadMapMeta(course) : '';
  element('edit-route').textContent = view === 'library' ? 'Edit' : 'Go back';
  element<HTMLButtonElement>('play').disabled = !courseJSON;
}

function deleteWaypoint(index: number) {
  if (worker || view !== 'editor') return;
  try {
    sections = removeRouteWaypoint(sections, index, graph);
    closingSection = undefined;
    updateRoute();
  } catch (error) {
    report(error);
  }
}

function updateWaypoints() {
  const list = element('waypoints');
  list.replaceChildren();
  if (!sections.length) {
    const item = document.createElement('li');
    item.textContent = 'Select a start point';
    item.className = 'waypoint-empty';
    list.append(item);
  }
  const add = (label: string, badge: string, index?: number) => {
    const item = document.createElement('li');
    const icon = document.createElement('span');
    icon.className = 'waypoint-badge';
    icon.textContent = badge;
    const text = document.createElement('span');
    text.textContent = label;
    item.append(icon, text);
    if (index !== undefined) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Delete ${label.toLowerCase()}`);
      remove.onclick = () => deleteWaypoint(index);
      item.append(remove);
    }
    list.append(item);
  };
  sections.forEach((_, i) =>
    add(
      i === 0
        ? closingSection
          ? 'Start/Finish'
          : 'Start'
        : !closingSection && i === sections.length - 1
          ? 'Finish'
          : `Waypoint ${i}`,
      i === 0 ? 'S' : !closingSection && i === sections.length - 1 ? 'F' : String(i),
      i,
    ),
  );
  if (closingSection) {
    add('Start/Finish', 'S');
    const reopen = document.createElement('button');
    reopen.type = 'button';
    reopen.textContent = '×';
    reopen.setAttribute('aria-label', 'Reopen loop');
    reopen.onclick = () => {
      closingSection = undefined;
      updateRoute();
    };
    list.lastElementChild!.append(reopen);
  }
}

function updateRouteGeometry() {
  const points = routePoints();
  const source = map.getSource('selected-route') as GeoJSONSource | undefined;
  source?.setData({
    type: 'FeatureCollection',
    features:
      points.length < 2
        ? []
        : [
            {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates: points.map(({ lon, lat }) => [lon, lat]),
              },
            },
          ],
  });
}

function updateRoute() {
  invalidateCourse();
  updateRouteGeometry();
  markers.splice(0).forEach((marker) => marker.remove());
  sections.forEach((section, i) => {
    const point = section.at(-1)!;
    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'route-marker';
    const label = i === 0 ? 'S' : !closingSection && i === sections.length - 1 ? 'F' : String(i);
    node.textContent = label;
    node.title =
      i === 0 && sections.length >= 3
        ? closingSection
          ? 'Reopen loop at start'
          : 'Close loop at start'
        : `Remove waypoint ${i + 1} (${label})`;
    node.setAttribute('aria-label', node.title);
    node.onclick = (event) => {
      event.stopPropagation();
      if (worker || view !== 'editor') return;
      try {
        if (i === 0 && sections.length >= 3) {
          if (closingSection) {
            closingSection = undefined;
            updateRoute();
            confirmAction('Loop reopened.');
          } else {
            closingSection = closeRoadLoop(routePoints(), graph);
            updateRoute();
          }
          return;
        }
        deleteWaypoint(i);
      } catch (error) {
        report(error);
      }
    };
    markers.push(
      new maplibregl.Marker({ element: node }).setLngLat([point.lon, point.lat]).addTo(map),
    );
  });
  updateControls();
  updateWaypoints();
  guide();
}

function collectRoads() {
  if (!mapReady || map.getZoom() < 14 || !map.isSourceLoaded('openmaptiles')) return;
  const features = map.querySourceFeatures('openmaptiles', { sourceLayer: 'transportation' });
  const roads = features.filter((feature) => roadClasses.includes(feature.properties.class));
  graph.add(
    roads.flatMap(({ geometry }) =>
      geometry.type === 'LineString'
        ? [{ coordinates: geometry.coordinates }]
        : geometry.type === 'MultiLineString'
          ? geometry.coordinates.map((coordinates: number[][]) => ({ coordinates }))
          : [],
    ),
  );
}

map.on('load', () => {
  mapReady = true;
  map.addSource('selected-route', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });
  map.addLayer({
    id: 'selected-route-outline',
    type: 'line',
    source: 'selected-route',
    paint: { 'line-color': theme.palette.background, 'line-width': 9 },
    layout: { 'line-join': 'round', 'line-cap': 'round' },
  });
  map.addLayer({
    id: 'selected-route',
    type: 'line',
    source: 'selected-route',
    paint: { 'line-color': theme.palette.accent, 'line-width': 5 },
    layout: { 'line-join': 'round', 'line-cap': 'round' },
  });
  updateRouteGeometry();
  if (status.dataset.error !== 'true') guide();
});
for (const event of ['dragend', 'zoomend'] as const) {
  map.on(event, () => {
    hasLocated = true;
    if (!mapContainer.hidden && status.dataset.error !== 'true') guide();
  });
}
map.on('idle', () => {
  try {
    collectRoads();
    updateHover();
  } catch (error) {
    report(error);
  }
});
map.on('click', (event) => {
  if (worker || view !== 'editor') return;
  try {
    if (closingSection)
      throw new Error(
        'This loop is closed. Click the start or remove the final Start/Finish in the list to reopen it.',
      );
    if (map.getZoom() < 14)
      throw new Error('Zoom in to level 14 or higher to select detailed road geometry.');
    if (!mapReady || !map.isSourceLoaded('openmaptiles'))
      throw new Error('Road tiles are still loading. Wait a moment before selecting.');
    collectRoads();
    const clicked = { lat: event.lngLat.lat, lon: event.lngLat.lng };
    const point = graph.snap(clicked, snapTolerance(clicked)).point;
    const previous = routePoints().at(-1);
    const section = previous ? graph.connect(previous, point, 2) : [point];
    if (previous && routeLength(section) < 1)
      throw new Error('Choose a point farther along the road.');
    const next = [...routePoints(), ...section.slice(previous ? 1 : 0)];
    if (routeLength(next) > maximumRoadLength)
      throw new Error('That would exceed 8 km. Choose a closer endpoint or delete a waypoint.');
    sections.push(section);
    hasLocated = true;
    updateRoute();
  } catch (error) {
    report(error);
  }
});

clearButton.onclick = () => {
  sections = [];
  closingSection = undefined;
  graph = new RoadGraph();
  updateRoute();
  collectRoads();
};

const searchLocation = createLocationSearch();
locationForm.onsubmit = async (event) => {
  event.preventDefault();
  if (searching) return;
  searching = true;
  const version = searchVersion;
  locationButton.disabled = true;
  locationButton.textContent = 'Searching...';
  locationForm.setAttribute('aria-busy', 'true');
  notify('Searching for location...');
  try {
    const result = await searchLocation(locationInput.value);
    if (version !== searchVersion || view !== 'editor') return;
    hasLocated = true;
    showMap();
    if (result.bounds) {
      map.fitBounds(result.bounds, { padding: 40, maxZoom: 16, duration: 0 });
    } else {
      map.jumpTo({ center: result.center, zoom: 14 });
    }
    searching = false;
    guide();
  } catch (error) {
    if (version === searchVersion && view === 'editor') report(error);
  } finally {
    searching = false;
    locationButton.disabled = false;
    locationButton.textContent = 'Go';
    locationForm.removeAttribute('aria-busy');
  }
};

function finishBuild() {
  worker?.terminate();
  worker = undefined;
  buildDialog.close();
  status.hidden = false;
  updateControls();
}

function cancelBuild() {
  if (!worker) return;
  saveController?.abort();
  finishBuild();
  course = undefined;
  courseJSON = undefined;
  showMap();
  confirmAction('Build cancelled. Your route is unchanged.');
}

element<HTMLButtonElement>('cancel-build').onclick = cancelBuild;
buildDialog.oncancel = (event) => {
  event.preventDefault();
  cancelBuild();
};

function buildProgress(message: string) {
  const step = document.createElement('li');
  step.textContent = message;
  buildSteps.append(step);
}

element<HTMLFormElement>('build-form').onsubmit = (event) => {
  event.preventDefault();
  if (worker) {
    cancelBuild();
    return;
  }
  if (buildButton.disabled) return;
  try {
    validateImportRoute(routePoints(), !!closingSection);
  } catch (error) {
    report(error);
    return;
  }
  invalidateCourse();
  hideHover();
  try {
    worker = new Worker(new URL('./road-builder-worker.ts', import.meta.url), { type: 'module' });
  } catch (error) {
    report(error);
    return;
  }
  const activeWorker = worker;
  worker.onmessage = async (message: MessageEvent<BuildResponse>) => {
    if (worker !== activeWorker) return;
    const response = message.data;
    if (response.type === 'progress') buildProgress(response.message);
    else {
      if (response.type === 'error') {
        finishBuild();
        showMap();
        report(new Error(response.message));
      } else if (response.type === 'complete') {
        try {
          course = response.course;
          courseJSON = response.json;
          saveController = new AbortController();
          buildProgress(`Saving ${response.course.name} on this device...`);
          const saveError = await saveCourse(response.course, response.json, saveController.signal);
          if (worker !== activeWorker) return;
          courseSaved = !saveError;
          if (courseSaved) {
            editingId = response.course.id;
            selectedId = response.course.id;
            editingFilename = savedMaps.find((item) => item.course.id === editingId)?.handle.name;
          }
          finishBuild();
          if (courseSaved) {
            setView('library');
            updatePreviewInfo();
            for (const item of element('saved').querySelectorAll<HTMLButtonElement>(
              '.track-option',
            )) {
              const active = item.dataset.id === selectedId;
              item.setAttribute('aria-selected', String(active));
              item.tabIndex = active ? 0 : -1;
            }
          } else showPreview();
          preview = new RoadBuilderPreview(
            element('preview'),
            response.model,
            { ...theme.preview, background: theme.palette.surface },
            `Interactive 3D terrain preview of ${response.course.name}`,
          );
          guide();
          if (saveError)
            notify(
              `Could not save your map on this device: ${saveError} Press Play to download and keep it.`,
              true,
            );
        } catch (error) {
          finishBuild();
          showMap();
          report(error);
        }
      }
    }
  };
  worker.onerror = (error) => {
    error.preventDefault();
    finishBuild();
    showMap();
    report(
      new Error(
        error.message?.trim() ||
          'The course builder worker could not load or stopped unexpectedly. The app may have been updated or its static host may be unavailable. Reload the page and select your route again, then retry.',
      ),
    );
  };
  worker.onmessageerror = () => {
    finishBuild();
    showMap();
    report(
      new Error('The course builder returned unreadable data. Try building the course again.'),
    );
  };
  setView('generating');
  buildSteps.replaceChildren();
  buildProgress('Starting the course builder...');
  map.resize();
  buildDialog.showModal();
  worker.postMessage({
    points: routePoints(),
    name: nameInput.value,
    width: Number(widthInput.value),
    shoulderWidth: Number(shoulderInput.value),
    id: editingId,
    draft: structuredClone({ sections, closingSection, resolution: 5 }),
    terrainTransition: Number(transitionInput.value),
    doubleYellow: centerLineInput.checked,
    colors: theme.preview,
    closed: !!closingSection,
  } satisfies BuildRequest);
  updateControls();
};

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

element<HTMLButtonElement>('play').onclick = () => {
  if (course && courseJSON) download(courseJSON, `${course.id}.json`);
};

async function refreshSaved() {
  if (!directory) return;
  const list = element('saved');
  const items = await listRoadMaps(directory);
  const loaded: typeof savedMaps = [];
  list.replaceChildren();
  for (const handle of items) {
    try {
      loaded.push({ course: readRoadMap(await (await handle.getFile()).text()), handle });
    } catch (error) {
      const item = document.createElement('p');
      item.textContent = `Unreadable track: ${handle.name}`;
      list.append(item);
      report(error);
    }
  }
  savedMaps = loaded;
  savedMaps.forEach(({ course: saved }, i) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'track-option selection-item';
    item.setAttribute('role', 'option');
    item.dataset.id = saved.id;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 66 58');
    svg.setAttribute('aria-hidden', 'true');
    const line = document.createElementNS(svg.namespaceURI, 'polyline');
    line.setAttribute('points', roadMapThumbnail(saved));
    svg.append(line);
    const copy = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = saved.name;
    const meta = document.createElement('small');
    meta.textContent = roadMapMeta(saved);
    copy.append(title, meta);
    item.append(svg, copy);
    item.onclick = () => {
      if (item.getAttribute('aria-selected') === 'true') return;
      void selectMap(saved.id);
    };
    item.onkeydown = (event) => {
      if (event.key === 'Delete') {
        event.preventDefault();
        if (!window.confirm(`Delete ${saved.name} from this browser?`)) return;
        directory!.removeEntry(savedMaps[i].handle.name).then(showLibrary).catch(report);
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const index =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? savedMaps.length - 1
            : (i + (event.key === 'ArrowDown' ? 1 : -1) + savedMaps.length) % savedMaps.length;
      const next = savedMaps[index];
      if (index === i) return;
      void selectMap(next.course.id);
      element('saved').querySelectorAll<HTMLButtonElement>('.track-option')[index].focus();
    };
    item.title = `${saved.name}. Press Delete to remove this track.`;
    list.append(item);
  });
  element('library-message').textContent = items.length
    ? ''
    : 'No tracks yet. Create your first track.';
}

function stopLibraryPreview() {
  previewVersion++;
  previewWorker?.terminate();
  previewWorker = undefined;
  preview?.dispose();
  preview = undefined;
  element('preview-status').hidden = true;
}

async function selectMap(id: string) {
  const selected = savedMaps.find((item) => item.course.id === id);
  if (!selected) return;
  stopLibraryPreview();
  const version = previewVersion;
  selectedId = id;
  course = selected.course;
  courseJSON = undefined;
  courseSaved = true;
  setView('library');
  updatePreviewInfo();
  for (const item of element('saved').querySelectorAll<HTMLButtonElement>('.track-option')) {
    const active = item.dataset.id === id;
    item.setAttribute('aria-selected', String(active));
    item.tabIndex = active ? 0 : -1;
  }
  const previewStatus = element('preview-status');
  previewStatus.textContent = 'Loading preview...';
  previewStatus.hidden = false;
  try {
    const json = await selected.handle.getFile();
    if (version !== previewVersion || view !== 'library') return;
    courseJSON = json;
    const active = new Worker(new URL('./road-builder-worker.ts', import.meta.url), {
      type: 'module',
    });
    previewWorker = active;
    const fail = (error: unknown) => {
      if (version !== previewVersion) return;
      active.terminate();
      previewWorker = undefined;
      previewStatus.textContent = 'Preview unavailable. You can still edit or download this track.';
      report(error);
    };
    active.onmessage = (event: MessageEvent<BuildResponse>) => {
      if (version !== previewVersion || view !== 'library') return;
      if (event.data.type === 'error') {
        fail(new Error(event.data.message));
        return;
      }
      if (event.data.type !== 'preview') return;
      active.terminate();
      previewWorker = undefined;
      try {
        preview = new RoadBuilderPreview(
          element('preview'),
          event.data.model,
          { ...theme.preview, background: theme.palette.surface },
          `Interactive preview of ${selected.course.name}`,
        );
        previewStatus.hidden = true;
      } catch (error) {
        fail(error);
      }
    };
    active.onerror = (event) => {
      event.preventDefault();
      fail(new Error(event.message || 'The preview worker could not load. Reload and try again.'));
    };
    active.onmessageerror = () => fail(new Error('The preview worker returned unreadable data.'));
    active.postMessage({ type: 'preview', course, colors: theme.preview });
    updatePreviewInfo();
  } catch (error) {
    if (version !== previewVersion || view !== 'library') return;
    previewStatus.textContent = 'Preview unavailable. Reload the page and try again.';
    report(error);
  }
}

async function showLibrary() {
  stopLibraryPreview();
  setView('library');
  try {
    directory ??= await openRoadMaps();
    await refreshSaved();
    if (view !== 'library') return;
    const selected = savedMaps.find((item) => item.course.id === selectedId) ?? savedMaps[0];
    if (selected) await selectMap(selected.course.id);
    else {
      course = undefined;
      courseJSON = undefined;
      setView('library');
    }
  } catch (error) {
    element('library-message').textContent = error instanceof Error ? error.message : String(error);
    report(error);
  }
}

function seedDraftGraph() {
  graph = new RoadGraph();
  for (const part of [...sections, ...(closingSection ? [closingSection] : [])])
    graph.add([{ coordinates: part.map(({ lon, lat }) => [lon, lat]) }]);
}

function editSavedCourse() {
  if (!course) return;
  try {
    const draft = restoreRoadDraft(course);
    const saved = course;
    editingId = saved.id;
    editingFilename = savedMaps.find((item) => item.course.id === saved.id)?.handle.name;
    stopLibraryPreview();
    sections = draft.sections;
    closingSection = draft.closingSection;
    nameInput.value = saved.name;
    widthInput.value = String(saved.width);
    shoulderInput.value = String(saved.shoulderWidth ?? courseShoulderWidth);
    centerLineInput.checked = !!saved.doubleYellow;
    transitionInput.value = String(saved.terrainTransition ?? defaultTerrainTransition);
    editingSnapshot = editorSnapshot();
    seedDraftGraph();
    updateRoute();
    const bounds = new maplibregl.LngLatBounds();
    routePoints().forEach(({ lon, lat }) => bounds.extend([lon, lat]));
    map.fitBounds(bounds, { padding: 70, maxZoom: 16, duration: 0 });
  } catch (error) {
    report(error);
  }
}

element<HTMLButtonElement>('new-track').onclick = () => {
  stopLibraryPreview();
  editingId = undefined;
  editingFilename = undefined;
  editingSnapshot = undefined;
  sections = [];
  closingSection = undefined;
  nameInput.value = 'New track';
  widthInput.value = widthInput.defaultValue;
  shoulderInput.value = shoulderInput.defaultValue;
  centerLineInput.checked = true;
  transitionInput.value = transitionInput.defaultValue;
  seedDraftGraph();
  updateRoute();
  collectRoads();
  nameInput.focus();
};
element<HTMLButtonElement>('cancel-edit').onclick = () => {
  void showLibrary();
};

async function saveCourse(builtCourse: RoadMap, json: Blob, signal: AbortSignal) {
  try {
    directory ??= await openRoadMaps();
    await storeRoadMap(directory, builtCourse, json, editingFilename, signal);
    await refreshSaved();
    return undefined;
  } catch (error) {
    console.error(error);
    return error instanceof Error ? error.message : String(error);
  }
}

void showLibrary();

window.addEventListener('pagehide', () => {
  clearTimeout(guidanceTimer);
  worker?.terminate();
  saveController?.abort();
  preview?.dispose();
  previewWorker?.terminate();
});

for (const input of [nameInput, widthInput, shoulderInput, transitionInput, centerLineInput]) {
  input.addEventListener('input', () => {
    if (course) {
      invalidateCourse();
      confirmAction('Settings changed. Save again to update the track.');
    }
    updateControls();
  });
}
