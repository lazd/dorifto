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
    sky: '#182b45', horizon: '#f5a04c', ground: '#493b38',
    cloudLight: '#fa603d', cloudShade: '#29394f', cloudSun: '#ffb640',
    ambient: '#bdc4dc', ambientIntensity: 0.42, environmentIntensity: 0.24,
    sun: '#ff963e', sunIntensity: 3, sunOffset: [-42, 5, -20],
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
  cloudSun?: string;
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
  const noonEnvironment = pmrem.fromScene(environment, 0.04).texture;
  environment.dispose();
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

  const paintClouds = createCloudLayer(1024, 512);
  const createSky = (time: GameState['timeOfDay']) => {
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
    const preset = daylight[time];
    const gradient = skyContext.createLinearGradient(0, 0, 0, skyCanvas.height);
    gradient.addColorStop(0, preset.sky);
    if (time === 'sunset') {
      gradient.addColorStop(0.26, '#31435f');
      gradient.addColorStop(0.37, '#76516b');
      gradient.addColorStop(0.44, '#d65349');
      gradient.addColorStop(0.48, '#ff8938');
    }
    gradient.addColorStop(0.5, preset.horizon);
    gradient.addColorStop(1, preset.ground);
    skyContext.fillStyle = gradient;
    skyContext.fillRect(0, 0, skyCanvas.width, skyCanvas.height);
    if (time === 'sunset') {
      const direction = new THREE.Vector3().fromArray(preset.sunOffset).normalize();
      const sunX = (Math.atan2(direction.z, direction.x) / (Math.PI * 2) + 0.5) * skyCanvas.width;
      const sunY = (0.5 - Math.asin(direction.y) / Math.PI) * skyCanvas.height;
      const radius = skyCanvas.width * 0.14;
      for (const wrap of [-skyCanvas.width, 0, skyCanvas.width]) {
        skyContext.save();
        skyContext.translate(sunX + wrap, sunY);
        skyContext.scale(1, 0.55);
        const glow = skyContext.createRadialGradient(0, 0, 0, 0, 0, radius);
        glow.addColorStop(0, 'rgba(255, 233, 145, 0.95)');
        glow.addColorStop(0.12, 'rgba(255, 184, 61, 0.8)');
        glow.addColorStop(0.45, 'rgba(255, 109, 32, 0.3)');
        glow.addColorStop(1, 'rgba(255, 109, 32, 0)');
        skyContext.fillStyle = glow;
        skyContext.fillRect(-radius, -radius, radius * 2, radius * 2);
        skyContext.restore();
        skyContext.beginPath();
        skyContext.arc(sunX + wrap, sunY, 3, 0, Math.PI * 2);
        skyContext.fillStyle = '#fff3ba';
        skyContext.fill();
      }
    }
    cloudContext.putImageData(new ImageData(paintClouds(preset), cloudCanvas.width, cloudCanvas.height), 0, 0);
    skyContext.drawImage(cloudCanvas, 0, 0, skyCanvas.width, skyCanvas.height);
    const sky = new THREE.CanvasTexture(skyCanvas);
    sky.colorSpace = THREE.SRGBColorSpace;
    sky.mapping = THREE.EquirectangularReflectionMapping;
    return {
      sky,
      environment: time === 'noon' ? noonEnvironment : pmrem.fromEquirectangular(sky).texture,
    };
  };
  const skies = {
    noon: createSky('noon'),
    sunset: createSky('sunset'),
    night: createSky('night'),
  };
  pmrem.dispose();
  const applyTimeOfDay = (time: GameState['timeOfDay']) => {
    const preset = daylight[time];
    scene.background = skies[time].sky;
    scene.environment = skies[time].environment;
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
