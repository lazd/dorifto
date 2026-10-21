import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { GameState } from './game-state';
import { createCloudLayer } from './clouds';

const daylight = {
  noon: {
    sky: '#78b5ec', horizon: '#b6d7ee', ground: '#656052',
    cloudLight: '#fffaf0', cloudShade: '#849bb8',
    ambient: '#d9edff', ambientIntensity: 0.65, environmentIntensity: 0.65,
    sun: '#ffefd4', sunIntensity: 2.4, sunOffset: [-20, 35, -12],
    exposure: 0.95,
  },
  sunset: {
    sky: '#647ca6', horizon: '#f3b074', ground: '#654035',
    cloudLight: '#ffd0a3', cloudShade: '#776f91',
    ambient: '#ffd3ab', ambientIntensity: 0.45, environmentIntensity: 0.28,
    sun: '#ffb45e', sunIntensity: 3.2, sunOffset: [-42, 12, -20],
    exposure: 0.95,
  },
  night: {
    sky: '#030914', horizon: '#101d35', ground: '#080b13',
    cloudLight: '#33415c', cloudShade: '#111b30',
    ambient: '#a8bde3', ambientIntensity: 0.35, environmentIntensity: 0.08,
    sun: '#9fbfff', sunIntensity: 0.22, sunOffset: [-20, 35, -12],
    exposure: 0.85,
  },
} satisfies Record<string, {
  sky: string; horizon: string; ground: string; ambient: string;
  cloudLight: string; cloudShade: string;
  ambientIntensity: number; environmentIntensity: number;
  sun: string; sunIntensity: number; sunOffset: [number, number, number]; exposure: number;
}>;


export function createLighting(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
  const fogNear = 220;
  const fogFar = 650;
  const fog = new THREE.Fog(0x78b5ec, fogNear, fogFar);
  scene.fog = fog;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = new RoomEnvironment();
  scene.environment = pmrem.fromScene(environment, 0.04).texture;
  environment.dispose();
  pmrem.dispose();
  const ambient = new THREE.HemisphereLight();
  scene.add(ambient);
  const sun = new THREE.DirectionalLight();
  const shadowOffset = new THREE.Vector3();
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -24;
  sun.shadow.camera.right = sun.shadow.camera.top = 24;
  sun.shadow.camera.far = 100;
  sun.shadow.normalBias = 0.035;
  scene.add(sun, sun.target);

  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 2048;
  skyCanvas.height = 1024;
  const skyContext = skyCanvas.getContext('2d');
  if (!skyContext) throw new Error('Unable to create sky texture');
  const cloudCanvas = document.createElement('canvas');
  cloudCanvas.width = 1024;
  cloudCanvas.height = 512;
  const cloudContext = cloudCanvas.getContext('2d');
  if (!cloudContext) throw new Error('Unable to create cloud texture');
  const paintClouds = createCloudLayer(cloudCanvas.width, cloudCanvas.height);
  let sky: THREE.CanvasTexture | undefined;
  const applyTimeOfDay = (time: GameState['timeOfDay']) => {
    const preset = daylight[time];
    const gradient = skyContext.createLinearGradient(0, 0, 0, skyCanvas.height);
    gradient.addColorStop(0, preset.sky);
    gradient.addColorStop(0.5, preset.horizon);
    gradient.addColorStop(1, preset.ground);
    skyContext.fillStyle = gradient;
    skyContext.fillRect(0, 0, skyCanvas.width, skyCanvas.height);
    cloudContext.putImageData(new ImageData(paintClouds(preset), cloudCanvas.width, cloudCanvas.height), 0, 0);
    skyContext.drawImage(cloudCanvas, 0, 0, skyCanvas.width, skyCanvas.height);
    // Replacing the texture invalidates Three's cached equirectangular conversion.
    const previousSky = sky;
    sky = new THREE.CanvasTexture(skyCanvas);
    sky.colorSpace = THREE.SRGBColorSpace;
    sky.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = sky;
    previousSky?.dispose();
    fog.color.set(preset.horizon);
    ambient.color.set(preset.ambient);
    ambient.groundColor.set(preset.ground);
    ambient.intensity = preset.ambientIntensity;
    scene.environmentIntensity = preset.environmentIntensity;
    sun.color.set(preset.sun);
    sun.intensity = preset.sunIntensity;
    shadowOffset.fromArray(preset.sunOffset);
    sun.position.copy(sun.target.position).add(shadowOffset);
    renderer.toneMappingExposure = preset.exposure;
  };

  return {
    apply: applyTimeOfDay,
    /** `clearDistance` pushes fog beyond that range, e.g. so the map view sees the whole course. */
    update(position: THREE.Vector3, clearDistance?: number) {
      fog.near = clearDistance ?? fogNear;
      fog.far = clearDistance === undefined ? fogFar : clearDistance * 2;
      sun.position.copy(position).add(shadowOffset);
      sun.target.position.copy(position);
    },
  };
}
