import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadCar } from './car';
import { defaultCabinEye as cabinEye } from './camera';
import './car-meshes-demo.css';

const container = document.querySelector<HTMLElement>('#car-view')!;
const list = document.querySelector<HTMLUListElement>('#mesh-list')!;
const filter = document.querySelector<HTMLInputElement>('#mesh-filter')!;
const hiddenOutput = document.querySelector<HTMLTextAreaElement>('#mesh-hidden')!;
const triangleCount = document.querySelector<HTMLOutputElement>('#triangle-count')!;
const pickedOutput = document.querySelector<HTMLTextAreaElement>('#mesh-picked')!;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
container.append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc3d6);
scene.add(new THREE.HemisphereLight(0xffffff, 0x445544, 2));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(3, 6, 4);
scene.add(sun);

const camera = new THREE.PerspectiveCamera(70, 1, 0.01, 100);
camera.layers.enableAll();
// No falloff, so close-up interior parts and the outside are lit alike.
const cameraLight = new THREE.PointLight(0xffffff, 3, 0, 0);
camera.add(cameraLight);
scene.add(camera);
const cameraLightToggle = document.querySelector<HTMLInputElement>('#camera-light')!;
cameraLightToggle.addEventListener('change', () => {
  cameraLight.visible = cameraLightToggle.checked;
  render();
});
const controls = new OrbitControls(camera, renderer.domElement);
controls.addEventListener('change', render);

function render() {
  renderer.render(scene, camera);
  triangleCount.value = `${renderer.info.render.triangles.toLocaleString()} triangles drawn`;
}

function resize() {
  const { clientWidth: width, clientHeight: height } = container;
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  render();
}

function view(position: THREE.Vector3, target: THREE.Vector3) {
  camera.position.copy(position);
  controls.target.copy(target);
  controls.update();
  render();
}

const viewCabin = () => view(cabinEye, cabinEye.clone().add(new THREE.Vector3(0, 0, 0.05)));
const viewOutside = () => view(new THREE.Vector3(3, 2, 4), new THREE.Vector3(0, 0.5, 0));

const car = await loadCar();
scene.add(car.chassis);

const meshes: THREE.Mesh[] = [];
car.chassis.traverse((object) => {
  if (object instanceof THREE.Mesh && object.name) meshes.push(object);
});
meshes.sort((a, b) => a.name.localeCompare(b.name));

const rows = meshes.map((mesh) => {
  const item = document.createElement('li');
  const label = document.createElement('label');
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = mesh.visible;
  checkbox.addEventListener('change', () => setVisible(mesh, checkbox, checkbox.checked));
  label.append(checkbox, mesh.name);
  item.addEventListener('click', () => select(row));
  item.append(label);
  const row = { mesh, item, checkbox };
  return row;
});
list.append(...rows.map(({ item }) => item));

function setVisible(mesh: THREE.Mesh, checkbox: HTMLInputElement, visible: boolean) {
  mesh.visible = checkbox.checked = visible;
  hiddenOutput.value = rows
    .filter(({ mesh }) => !mesh.visible)
    .map(({ mesh }) => mesh.name)
    .join('\n');
  render();
}

function setFiltered(visible: boolean) {
  for (const { mesh, item, checkbox } of rows)
    if (!item.hidden) setVisible(mesh, checkbox, visible);
}

function applyFilter() {
  const query = filter.value.toLowerCase();
  for (const { mesh, item } of rows) item.hidden = !mesh.name.toLowerCase().includes(query);
}
filter.addEventListener('input', applyFilter);

const selection = new THREE.BoxHelper(new THREE.Object3D(), 0xffd400);
selection.visible = false;
scene.add(selection);
let selectedRow: (typeof rows)[number] | undefined;

function select(row: (typeof rows)[number]) {
  selectedRow?.item.classList.remove('selected');
  selectedRow = row;
  row.item.classList.add('selected');
  if (row.item.hidden) {
    filter.value = '';
    applyFilter();
  }
  row.item.scrollIntoView({ block: 'nearest' });
  selection.setFromObject(row.mesh);
  selection.visible = true;
  render();
}

function shown(object: THREE.Object3D | null): boolean {
  return !object || (object.visible && shown(object.parent));
}

const raycaster = new THREE.Raycaster();
raycaster.layers.enableAll();
const pointer = new THREE.Vector2();
const pressed = new THREE.Vector2();
const lastClick = new THREE.Vector2(Infinity, Infinity);
renderer.domElement.addEventListener('pointerdown', (event) =>
  pressed.set(event.clientX, event.clientY),
);
renderer.domElement.addEventListener('pointerup', (event) => {
  // Ignore drags so orbiting doesn't change the selection.
  if (pressed.distanceTo(pointer.set(event.clientX, event.clientY)) > 4) return;
  const repeated = lastClick.distanceTo(pointer) <= 4;
  lastClick.copy(pointer);
  const bounds = renderer.domElement.getBoundingClientRect();
  pointer.set(
    ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
    -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
  );
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(meshes, false).filter(({ object }) => shown(object));
  const stack = [...new Set(hits.map(({ object }) => object))];
  if (!stack.length) return;
  // Clicking the same spot again steps to the next mesh behind the current one.
  const current = repeated ? stack.findIndex((mesh) => mesh === selectedRow?.mesh) : -1;
  const next = stack[(current + 1) % stack.length];
  select(rows.find(({ mesh }) => mesh === next)!);
  // Geometry-space coordinates, matching the positions `splitSurface` tests in car.ts.
  const hit = hits.find(({ object }) => object === next)!;
  const local = next.worldToLocal(hit.point.clone());
  pickedOutput.value = `${next.name} (${local
    .toArray()
    .map((value) => value.toFixed(3))
    .join(', ')}) face ${hit.faceIndex}`;
});
document.querySelector('#mesh-all')!.addEventListener('click', () => setFiltered(true));
document.querySelector('#mesh-none')!.addEventListener('click', () => setFiltered(false));
document.querySelector('#view-cabin')!.addEventListener('click', viewCabin);
document.querySelector('#view-outside')!.addEventListener('click', viewOutside);
window.addEventListener('resize', resize);

resize();
viewCabin();
