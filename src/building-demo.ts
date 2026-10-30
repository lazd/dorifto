import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createScenery } from './scenery';
import { CourseTerrain } from './terrain';
import { buildingAppearance } from './building-appearance';
import type { CourseDefinition } from './courses';
import type { SceneryPolygon } from './scenery-data';
import './building-demo.css';

function rectangle(x: number, z: number, width: number, depth: number): SceneryPolygon {
  return [
    [
      [x, z],
      [x + width, z],
      [x + width, z + depth],
      [x, z + depth],
    ],
  ];
}

function joined(x: number, z: number): SceneryPolygon {
  return [
    [
      [x, z],
      [x + 17, z],
      [x + 17, z + 7],
      [x + 8, z + 7],
      [x + 8, z + 17],
      [x, z + 17],
    ],
  ];
}

function start() {
  const examples = [
    {
      name: 'Gable',
      detail: 'The neighborhood regular',
      x: -30,
      z: -24,
      width: 14,
      depth: 10,
      roofShape: 'gabled',
    },
    {
      name: 'A-frame',
      detail: 'Compact, steep & cozy',
      x: -5,
      z: -24,
      width: 9,
      depth: 9,
      roofShape: 'a-frame',
    },
    {
      name: 'Shed',
      detail: 'A single modern slope',
      x: 18,
      z: -24,
      width: 18,
      depth: 9,
      roofShape: 'skillion',
    },
    {
      name: 'Hip',
      detail: 'Slopes on all four sides',
      x: -30,
      z: 8,
      width: 14,
      depth: 10,
      roofShape: 'hipped',
    },
    {
      name: 'Cross-hip',
      detail: 'An irregular footprint',
      x: -5,
      z: 8,
      width: 16,
      depth: 16,
      roofShape: 'hipped',
      rings: [
        [
          [-5, 8],
          [11, 8],
          [11, 15],
          [2, 15],
          [2, 24],
          [-5, 24],
        ],
      ] satisfies SceneryPolygon,
    },
    {
      name: 'Office',
      detail: 'Flat roof & larger glazing',
      x: 22,
      z: 8,
      width: 14,
      depth: 12,
      roofShape: 'flat',
      buildingType: 'office',
    },
    {
      name: 'Joined gable',
      detail: 'Gabled wings & overhanging eaves',
      x: -30,
      z: 40,
      width: 17,
      depth: 17,
      roofShape: 'gabled',
      rings: joined(-30, 40),
    },
    {
      name: 'Joined A-frame',
      detail: 'A separate steep ridge on each wing',
      x: -5,
      z: 40,
      width: 17,
      depth: 17,
      roofShape: 'a-frame',
      rings: joined(-5, 40),
    },
    {
      name: 'Joined shed',
      detail: 'Single slope over an L-shaped home',
      x: 22,
      z: 40,
      width: 17,
      depth: 17,
      roofShape: 'skillion',
      rings: joined(22, 40),
    },
  ];
  const definition: CourseDefinition = {
    id: 'building-demo',
    name: 'Building styles',
    width: 6,
    flat: true,
    closed: false,
    points: [
      [-90, -60],
      [-90, 60],
    ],
    scenery: {
      version: 1,
      bounds: { minX: -100, minZ: -70, maxX: 100, maxZ: 70 },
      buildings: examples.map((example) => ({
        rings: example.rings ?? rectangle(example.x, example.z, example.width, example.depth),
        height: example.buildingType === 'office' ? 10 : 5,
        buildingType: example.buildingType ?? 'house',
        roofShape: example.roofShape,
      })),
      roads: [],
      water: [],
      waterways: [],
      vegetation: [],
    },
  };
  const terrain = new CourseTerrain(definition, false);
  const scenery = createScenery(definition, terrain);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xd7e2e4);
  scene.add(scenery.group, new THREE.HemisphereLight(0xe7efff, 0x7d8267, 2));
  const sun = new THREE.DirectionalLight(0xffe6c6, 3);
  sun.position.set(-35, 65, -45);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -65, right: 65, top: 65, bottom: -65, far: 180 });
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.normalBias = 0.1;
  scene.add(sun);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(2000, 2000),
    new THREE.MeshStandardMaterial({ color: 0x9dab87, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.17;
  ground.receiveShadow = true;
  scene.add(ground);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const container = document.querySelector<HTMLElement>('#building-view')!;
  container.append(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 3000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.maxPolarAngle = Math.PI / 2 - 0.04;
  controls.minDistance = 15;
  controls.maxDistance = 200;
  examples.forEach((example, index) => {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'building-label';
    const title = document.createElement('strong');
    title.textContent = example.name;
    const detail = document.createElement('span');
    const appearance = buildingAppearance(definition.scenery!.buildings[index]);
    const finish =
      appearance.facade === 'wood'
        ? 'T1-11 wood siding'
        : appearance.facade === 'siding'
          ? 'Painted lap siding'
          : appearance.facade === 'brick'
            ? 'Brick'
            : 'Office glazing';
    detail.textContent = `${example.detail} · ${finish}`;
    element.append(title, detail);
    document.querySelector('#building-labels')!.append(element);
    element.addEventListener('click', () => {
      controls.target.set(example.x + example.width / 2, 3, example.z + example.depth / 2);
      camera.position.copy(controls.target).add(new THREE.Vector3(22, 20, 30));
      controls.update();
      render();
    });
  });
  function render() {
    renderer.render(scene, camera);
  }
  function reset() {
    camera.position.set(78, 95, 137);
    controls.target.set(2, 2, 15);
    controls.update();
    render();
  }
  function resize() {
    renderer.setSize(container.clientWidth, container.clientHeight);
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    render();
  }
  controls.addEventListener('change', render);
  document.querySelector('#reset-view')!.addEventListener('click', reset);
  new ResizeObserver(resize).observe(container);
  reset();
  resize();
}

try {
  start();
} catch (error) {
  console.error('Unable to render building demo.', error);
  const message = document.querySelector<HTMLElement>('#demo-error')!;
  message.textContent = `Unable to render building demo: ${error instanceof Error ? error.message : String(error)}`;
  message.hidden = false;
}
