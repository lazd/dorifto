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
import { CourseBuilderPreview } from './course-builder-preview';
import { courseBuilderTheme } from './course-builder-map';
import { createLocationSearch } from './course-builder-search';
import { listRoadMaps, openRoadMaps, storeRoadMap } from './course-builder-storage';
import {
  readRoadMap,
  restoreRoadDraft,
  roadMapMeta,
  roadBuildSteps,
  type RoadBuildStep,
  type RoadMap,
} from './course-builder-data';
import type { GPSPoint } from './track-conversion.mjs';
import { courseShoulderWidth } from './courses';
import { coursePreviewSvg } from './course-preview';
import { defaultTerrainTransition } from './terrain';
import { startTextSpinner } from './text-spinner';
import { download } from './download';
import type { BuildRequest, BuildResponse } from './course-builder-worker';
import './course-builder.css';

const embedded =
  window.parent !== window && new URLSearchParams(location.search).get('embedded') === '1';
function notifyParent(
  message:
    | { type: 'course-builder:ready' }
    | { type: 'course-builder:controls'; canSave: boolean }
    | { type: 'course-builder:busy'; busy: boolean }
    | { type: 'course-builder:saved'; id: string }
    | { type: 'course-builder:cancel' },
) {
  if (embedded) window.parent.postMessage(message, location.origin);
}
if (embedded) document.documentElement.classList.add('embedded-builder');

function element<T extends HTMLElement>(id: string) {
  const result = document.getElementById(id);
  if (!result) throw new Error(`Missing course builder element: ${id}`);
  return result as T;
}

const status = element('status');
const buildButton = element<HTMLButtonElement>('build');
const builder = document.querySelector<HTMLElement>('.builder')!;
const buildDialog = element<HTMLDialogElement>('build-dialog');
const buildSteps = element('build-steps');
let stopBuildSpinner: (() => void) | undefined;
const nameInput = element<HTMLInputElement>('name');
const widthInput = element<HTMLInputElement>('width');
const transitionInput = element<HTMLInputElement>('terrain-transition');
const centerLineInput = element<HTMLInputElement>('center-line');
const shoulderInput = element<HTMLInputElement>('shoulder-width');
const clearButton = element<HTMLButtonElement>('clear');
const locationForm = element<HTMLFormElement>('location-form');
const locationInput = element<HTMLInputElement>('location');
let nameCopiedToSearch = false;
nameInput.addEventListener('blur', () => {
  const name = nameInput.value.trim();
  if (editingId || nameCopiedToSearch || !name || name === nameInput.defaultValue) return;
  nameCopiedToSearch = true;
  if (!locationInput.value.trim()) locationInput.value = name;
});
const locationButton = element<HTMLButtonElement>('location-submit');
locationButton.addEventListener('mousedown', (event) => event.preventDefault());
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
let editingRouteSnapshot: string | undefined;
let editingCourse: RoadMap | undefined;
let previewWorker: Worker | undefined;
let previewVersion = 0;
let stopPreviewSpinner: (() => void) | undefined;
const markers: maplibregl.Marker[] = [];
const theme = courseBuilderTheme();
const mapContainer = element('map');
const inspection = element('inspection');
let preview: CourseBuilderPreview | undefined;

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
        ? 'Loop closed! Press Save to save your course.'
        : sections.length >= 3
          ? 'Add more waypoints or click the start position to create a loop'
          : sections.length
            ? 'Click to set a finish line or add more waypoints'
            : hasLocated
              ? 'Click to set a start position'
              : 'Search for a place to start your course',
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
let hoverFrame: ReturnType<typeof setTimeout> | undefined;
let hoverAttached = false;

function snapTolerance(point: GPSPoint) {
  return Math.min(
    100,
    (12 * 156543.03 * Math.cos((point.lat * Math.PI) / 180)) / 2 ** map.getZoom(),
  );
}

function hideHover() {
  clearTimeout(hoverFrame);
  hoverFrame = undefined;
  if (hoverAttached) hoverMarker.remove();
  hoverAttached = false;
}

function updateHover() {
  clearTimeout(hoverFrame);
  hoverFrame = undefined;
  if (
    !hoverPosition ||
    !mapReady ||
    worker ||
    mapContainer.hidden ||
    map.isMoving() ||
    closingSection ||
    !map.isSourceLoaded('openmaptiles')
  ) {
    hideHover();
    return;
  }
  const snapped = visibleRoadSnap(hoverPosition);
  if (!snapped) {
    hideHover();
    return;
  }
  try {
    const points = routePoints();
    const previous = points.at(-1);
    const section = previous ? graph.connect(previous, snapped.point, 2) : [];
    const tooLong = routeLength(points) + routeLength(section) > maximumRoadLength;
    hoverNode.classList.toggle('route-hover-invalid', tooLong);
    hoverNode.title = tooLong ? 'That would exceed 8 km. Choose a closer endpoint.' : '';
  } catch (error) {
    hoverNode.classList.add('route-hover-invalid');
    hoverNode.title = error instanceof Error ? error.message : String(error);
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
  if (hoverFrame === undefined) hoverFrame = setTimeout(updateHover, 10);
});
map.on('movestart', hideHover);
map.getCanvas().addEventListener('mouseleave', () => {
  hoverPosition = undefined;
  hideHover();
});

function routeSnapshot() {
  return JSON.stringify({ sections, closingSection });
}

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
    `${(length / 1000).toFixed(1)}km / ${maximumRoadLength / 1000}km (max)${closingSection ? ' · Closed loop' : ''}`;
  clearButton.disabled = !!worker || !sections.length;
  buildButton.disabled =
    !!worker ||
    length < minimumRoadLength ||
    length > maximumRoadLength ||
    (editingSnapshot !== undefined && editingSnapshot === editorSnapshot());
  notifyParent({ type: 'course-builder:controls', canSave: !buildButton.disabled });
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
    const locate = document.createElement('button');
    locate.type = 'button';
    locate.className = 'waypoint-locate';
    locate.setAttribute('aria-label', `Show ${label.toLowerCase()} on map`);
    locate.append(icon, text);
    locate.onclick = () => {
      const point = index === undefined ? sections[0][0] : sections[index].at(-1)!;
      map.easeTo({
        center: [point.lon, point.lat],
        zoom: Math.max(map.getZoom(), 16),
      });
    };
    item.append(locate);
    if (index !== undefined) {
      const remove = document.createElement('button');
      remove.type = 'button';
      const closeIcon = document.createElement('span');
      closeIcon.className = 'close-icon';
      closeIcon.setAttribute('aria-hidden', 'true');
      remove.append(closeIcon);
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
    const closeIcon = document.createElement('span');
    closeIcon.className = 'close-icon';
    closeIcon.setAttribute('aria-hidden', 'true');
    reopen.append(closeIcon);
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

function visibleRoadSnap(position: maplibregl.Point) {
  const features = map.queryRenderedFeatures([
    [position.x - 12, position.y - 12],
    [position.x + 12, position.y + 12],
  ]);
  const roads = features.filter(
    (feature) =>
      feature.source === 'openmaptiles' &&
      feature.sourceLayer === 'transportation' &&
      feature.layer.type === 'line' &&
      roadClasses.includes(feature.properties.class),
  );
  const lines = roads.flatMap(({ geometry }) =>
    geometry.type === 'LineString'
      ? [{ coordinates: geometry.coordinates }]
      : geometry.type === 'MultiLineString'
        ? geometry.coordinates.map((coordinates: number[][]) => ({ coordinates }))
        : [],
  );
  const visible = new RoadGraph();
  visible.add(lines);
  graph.add(lines);
  const location = map.unproject(position);
  const point = { lat: location.lat, lon: location.lng };
  return visible.findSnap(point, snapTolerance(point));
}

function collectRoads() {
  if (!mapReady || !map.isSourceLoaded('openmaptiles')) return;
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
    if (!mapReady || !map.isSourceLoaded('openmaptiles'))
      throw new Error('Road tiles are still loading. Wait a moment before selecting.');
    collectRoads();
    const snapped = visibleRoadSnap(event.point);
    if (!snapped) throw new Error('Click closer to a visible road.');
    const point = snapped.point;
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
  const stopSpinner = startTextSpinner(locationButton);
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
    stopSpinner();
    locationForm.removeAttribute('aria-busy');
  }
};

function finishBuild() {
  stopBuildSpinner?.();
  stopBuildSpinner = undefined;
  worker?.terminate();
  worker = undefined;
  buildDialog.close();
  status.hidden = false;
  updateControls();
  notifyParent({ type: 'course-builder:busy', busy: false });
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

function buildProgress(active: RoadBuildStep | 'complete') {
  stopBuildSpinner?.();
  stopBuildSpinner = undefined;
  let pending = false;
  for (const item of buildSteps.querySelectorAll<HTMLLIElement>('li')) {
    const current = item.dataset.step === active;
    if (current) pending = true;
    item.dataset.state = current ? 'active' : pending ? 'pending' : 'complete';
    if (current) item.setAttribute('aria-current', 'step');
    else item.removeAttribute('aria-current');
    item.setAttribute(
      'aria-label',
      `${item.lastChild?.textContent}: ${item.dataset.state === 'complete' ? 'completed' : item.dataset.state === 'active' ? 'in progress' : 'pending'}`,
    );
    const indicator = item.querySelector<HTMLElement>('.build-step-indicator')!;
    indicator.textContent = item.dataset.state === 'complete' ? '\u2713' : '';
    if (current) stopBuildSpinner = startTextSpinner(indicator);
  }
}

element<HTMLFormElement>('build-form').onsubmit = (event) => {
  event.preventDefault();
  if (worker) {
    cancelBuild();
    return;
  }
  if (buildButton.disabled) return;
  const existingCourse =
    editingCourse && editingRouteSnapshot === routeSnapshot() ? editingCourse : undefined;
  try {
    validateImportRoute(routePoints(), !!closingSection);
  } catch (error) {
    report(error);
    return;
  }
  invalidateCourse();
  hideHover();
  try {
    worker = new Worker(new URL('./course-builder-worker.ts', import.meta.url), { type: 'module' });
  } catch (error) {
    report(error);
    return;
  }
  const activeWorker = worker;
  worker.onmessage = async (message: MessageEvent<BuildResponse>) => {
    if (worker !== activeWorker) return;
    const response = message.data;
    if (response.type === 'progress') buildProgress(response.step);
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
          buildProgress('saving');
          const saveError = await saveCourse(response.course, response.json, saveController.signal);
          if (worker !== activeWorker) return;
          courseSaved = !saveError;
          if (courseSaved) buildProgress('complete');
          if (courseSaved) {
            editingId = response.course.id;
            selectedId = response.course.id;
            editingFilename = savedMaps.find((item) => item.course.id === editingId)?.handle.name;
          }
          finishBuild();
          if (courseSaved && embedded) {
            notifyParent({ type: 'course-builder:saved', id: response.course.id });
            return;
          }
          if (courseSaved) {
            setView('library');
            updatePreviewInfo();
            for (const item of element('saved').querySelectorAll<HTMLButtonElement>(
              '.selection-item',
            )) {
              const active = item.dataset.id === selectedId;
              item.setAttribute('aria-selected', String(active));
              item.tabIndex = active ? 0 : -1;
            }
          } else showPreview();
          if (response.model)
            preview = new CourseBuilderPreview(
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
  notifyParent({ type: 'course-builder:busy', busy: true });
  buildSteps.replaceChildren();
  for (const [key, label] of Object.entries(roadBuildSteps)) {
    if (embedded && key === 'preview') continue;
    if (existingCourse && (key === 'terrain' || key === 'corridor')) continue;
    const item = document.createElement('li');
    item.dataset.step = key;
    item.textContent = existingCourse && key === 'course' ? 'Updating course settings' : label;
    const indicator = document.createElement('span');
    indicator.className = 'build-step-indicator';
    indicator.setAttribute('aria-hidden', 'true');
    item.prepend(indicator);
    buildSteps.append(item);
  }
  buildProgress('starting');
  map.resize();
  buildDialog.showModal();
  worker.postMessage({
    points: routePoints(),
    name: nameInput.value,
    width: Number(widthInput.value),
    shoulderWidth: Number(shoulderInput.value),
    id: editingId,
    existingCourse,
    draft: structuredClone({
      sections,
      closingSection,
      resolution:
        existingCourse?.courseBuilder?.resolution ?? existingCourse?.terrain?.resolution ?? 5,
    }),
    terrainTransition: Number(transitionInput.value),
    doubleYellow: centerLineInput.checked,
    colors: theme.preview,
    closed: !!closingSection,
    skipPreview: embedded,
  } satisfies BuildRequest);
  updateControls();
};

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
      item.textContent = `Unreadable course: ${handle.name}`;
      list.append(item);
      report(error);
    }
  }
  savedMaps = loaded;
  savedMaps.forEach(({ course: saved }, i) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'selection-item';
    item.setAttribute('role', 'option');
    item.dataset.id = saved.id;
    const main = document.createElement('span');
    main.className = 'selection-item-main';
    const avatar = document.createElement('span');
    avatar.className = 'selection-avatar course-thumbnail';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.innerHTML = coursePreviewSvg(saved, { size: 64, padding: 4 });
    const copy = document.createElement('span');
    const title = document.createElement('span');
    title.className = 'selection-item-title';
    title.textContent = saved.name;
    const meta = document.createElement('span');
    meta.className = 'selection-item-meta';
    meta.textContent = roadMapMeta(saved);
    copy.append(title, meta);
    main.append(avatar, copy);
    item.append(main);
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
      element('saved').querySelectorAll<HTMLButtonElement>('.selection-item')[index].focus();
    };
    item.title = `${saved.name}. Press Delete to remove this course.`;
    list.append(item);
  });
  element('library-message').textContent = items.length
    ? ''
    : 'No courses yet. Create your first course.';
}

function stopLibraryPreview() {
  stopPreviewSpinner?.();
  stopPreviewSpinner = undefined;
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
  for (const item of element('saved').querySelectorAll<HTMLButtonElement>('.selection-item')) {
    const active = item.dataset.id === id;
    item.setAttribute('aria-selected', String(active));
    item.tabIndex = active ? 0 : -1;
  }
  const previewStatus = element('preview-status');
  previewStatus.textContent = 'Loading preview...';
  previewStatus.hidden = false;
  stopPreviewSpinner = startTextSpinner(previewStatus);
  try {
    const json = await selected.handle.getFile();
    if (version !== previewVersion || view !== 'library') return;
    courseJSON = json;
    const active = new Worker(new URL('./course-builder-worker.ts', import.meta.url), {
      type: 'module',
    });
    previewWorker = active;
    const fail = (error: unknown) => {
      if (version !== previewVersion) return;
      active.terminate();
      previewWorker = undefined;
      stopPreviewSpinner?.();
      stopPreviewSpinner = undefined;
      previewStatus.textContent =
        'Preview unavailable. You can still edit or download this course.';
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
        preview = new CourseBuilderPreview(
          element('preview'),
          event.data.model,
          { ...theme.preview, background: theme.palette.surface },
          `Interactive preview of ${selected.course.name}`,
        );
        stopPreviewSpinner?.();
        stopPreviewSpinner = undefined;
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
    stopPreviewSpinner?.();
    stopPreviewSpinner = undefined;
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
    editingRouteSnapshot = routeSnapshot();
    editingCourse = saved;
    seedDraftGraph();
    updateRoute();
    const bounds = new maplibregl.LngLatBounds();
    routePoints().forEach(({ lon, lat }) => bounds.extend([lon, lat]));
    map.fitBounds(bounds, { padding: 70, maxZoom: 16, duration: 0 });
  } catch (error) {
    report(error);
  }
}

element<HTMLButtonElement>('new-course').onclick = () => {
  stopLibraryPreview();
  nameCopiedToSearch = false;
  editingId = undefined;
  editingFilename = undefined;
  editingSnapshot = undefined;
  editingRouteSnapshot = undefined;
  editingCourse = undefined;
  sections = [];
  closingSection = undefined;
  nameInput.value = 'New course';
  widthInput.value = widthInput.defaultValue;
  shoulderInput.value = shoulderInput.defaultValue;
  centerLineInput.checked = true;
  transitionInput.value = transitionInput.defaultValue;
  seedDraftGraph();
  updateRoute();
  collectRoads();
  nameInput.focus();
  nameInput.select();
};
element<HTMLButtonElement>('cancel-edit').onclick = () => {
  if (embedded) notifyParent({ type: 'course-builder:cancel' });
  else void showLibrary();
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

const embeddedResize = embedded
  ? new ResizeObserver(() => {
      if (mapContainer.clientWidth && mapContainer.clientHeight) map.resize();
    })
  : undefined;
embeddedResize?.observe(mapContainer);

async function openEmbeddedEditor() {
  const id = new URLSearchParams(location.search).get('edit');
  if (!id) {
    element<HTMLButtonElement>('new-course').click();
    return;
  }
  try {
    directory = await openRoadMaps();
    await refreshSaved();
    const saved = savedMaps.find((item) => item.course.id === id);
    if (!saved) throw new Error('Saved course not found');
    course = saved.course;
    editSavedCourse();
  } catch (error) {
    setView('editor');
    report(error);
  }
}

if (embedded) {
  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (
      event.origin !== location.origin ||
      event.source !== window.parent ||
      typeof event.data !== 'object' ||
      event.data === null ||
      !('type' in event.data)
    )
      return;
    if (event.data.type === 'course-builder:save' && !worker && !buildButton.disabled)
      element<HTMLFormElement>('build-form').requestSubmit(buildButton);
  });
  const mapLoaded = mapReady
    ? Promise.resolve()
    : new Promise<void>((resolve) => map.once('load', () => resolve()));
  void Promise.all([openEmbeddedEditor(), mapLoaded]).then(() => {
    requestAnimationFrame(() => {
      notifyParent({ type: 'course-builder:ready' });
      updateControls();
    });
  });
} else void showLibrary();

window.addEventListener('pagehide', () => {
  hideHover();
  stopBuildSpinner?.();
  stopPreviewSpinner?.();
  stopPreviewSpinner = undefined;
  embeddedResize?.disconnect();
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
      confirmAction('Settings changed. Save again to update the course.');
    }
    updateControls();
  });
}
