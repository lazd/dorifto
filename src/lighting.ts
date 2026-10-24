import * as THREE from 'three';
import { CSM } from 'three/addons/csm/CSM.js';
import { Sky } from 'three/addons/objects/Sky.js';
import type { ConfigurationState } from './configuration-state';
import { createCloudLayer } from './clouds';

export const daylight = {
  noon: {
    sky: '#367ccc',
    horizon: '#c1d7e5',
    haze: '#a9bdc9',
    ground: '#9b8b72',
    cloudLight: '#fffdf6',
    cloudShade: '#9aaec4',
    ambient: '#fff3df',
    ambientIntensity: 0.55,
    environmentIntensity: 0.35,
    sun: '#fff7e8',
    sunIntensity: 3,
    sunOffset: [-35, 60, -20],
    exposure: 0.95,
  },
  sunset: {
    sky: '#182b45',
    horizon: '#f5a04c',
    haze: '#a79589',
    ground: '#493b38',
    cloudLight: '#fa603d',
    cloudShade: '#29394f',
    cloudSun: '#ffb640',
    ambient: '#bdc4dc',
    ambientIntensity: 0.42,
    environmentIntensity: 0.24,
    sun: '#ff963e',
    sunIntensity: 3,
    sunOffset: [-42, 5, -20],
    exposure: 0.95,
  },
  night: {
    sky: '#030914',
    horizon: '#101d35',
    haze: '#151c29',
    ground: '#080b13',
    cloudLight: '#33415c',
    cloudShade: '#111b30',
    ambient: '#a8bde3',
    ambientIntensity: 0.35,
    environmentIntensity: 0.08,
    sun: '#9fbfff',
    sunIntensity: 0.22,
    sunOffset: [-20, 35, -12],
    exposure: 0.85,
  },
} satisfies Record<
  string,
  {
    sky: string;
    horizon: string;
    haze: string;
    ground: string;
    ambient: string;
    cloudLight: string;
    cloudShade: string;
    cloudSun?: string;
    ambientIntensity: number;
    environmentIntensity: number;
    sun: string;
    sunIntensity: number;
    sunOffset: [number, number, number];
    exposure: number;
  }
>;

export function createLighting(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera,
) {
  const fogNear = 800;
  const fogFar = 3000;
  const fog = new THREE.Fog(daylight.noon.haze, fogNear, fogFar);
  scene.fog = fog;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const ambient = new THREE.HemisphereLight();
  scene.add(ambient);
  const csm = new CSM({
    camera,
    parent: scene,
    cascades: 3,
    maxFar: 1500,
    shadowMapSize: 2048,
    mode: 'custom',
    customSplitsCallback: (_cascades, _near, far, breaks) => {
      breaks.push(Math.min(30 / far, 1 / 3), Math.min(180 / far, 2 / 3), 1);
    },
    lightNear: 0.1,
    lightFar: 4000,
    lightMargin: 1000,
  });
  csm.fade = true;
  csm.updateFrustums();
  // Normal bias must grow with each cascade's texel size or distant hills self-shadow in stripes.
  const normalBiases = [0.08, 0.35, 1.6];
  csm.lights.forEach((light, i) => {
    light.shadow.normalBias = normalBiases[i];
    light.shadow.bias = -0.0001;
  });
  const shadowView = { value: new THREE.Matrix4() };
  const projection = new THREE.Matrix4();
  const materials = new WeakSet<THREE.Material>();

  function setupMaterials() {
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (
          !(
            material instanceof THREE.MeshStandardMaterial ||
            material instanceof THREE.MeshLambertMaterial ||
            material instanceof THREE.MeshPhongMaterial ||
            material instanceof THREE.MeshToonMaterial
          ) ||
          materials.has(material)
        )
          continue;
        materials.add(material);
        const compile = material.onBeforeCompile;
        const cacheKey = material.customProgramCacheKey();
        csm.setupMaterial(material);
        const compileCSM = material.onBeforeCompile;
        material.onBeforeCompile = function (shader, renderer) {
          compile.call(this, shader, renderer);
          compileCSM.call(this, shader, renderer);
          shader.uniforms.csmShadowView = shadowView;
          // Mirrors reuse the main view's shadow maps, so select cascades in that view too.
          shader.vertexShader =
            `uniform mat4 csmShadowView;\nvarying float vCSMDepth;\n${shader.vertexShader}`.replace(
              '#include <project_vertex>',
              `
              #include <project_vertex>
              vec4 csmPosition = vec4(transformed, 1.0);
              #ifdef USE_BATCHING
                csmPosition = batchingMatrix * csmPosition;
              #endif
              #ifdef USE_INSTANCING
                csmPosition = instanceMatrix * csmPosition;
              #endif
              vCSMDepth = -(csmShadowView * modelMatrix * csmPosition).z;
            `,
            );
          shader.fragmentShader = `varying float vCSMDepth;\n${shader.fragmentShader}`.replace(
            '#include <lights_fragment_begin>',
            THREE.ShaderChunk.lights_fragment_begin.replace('(vViewPosition.z)', 'vCSMDepth'),
          );
        };
        material.customProgramCacheKey = () => `${cacheKey}-csm-main-view`;
        material.needsUpdate = true;
        material.addEventListener('dispose', () => {
          csm.shaders.delete(material);
        });
      }
    });
  }

  scene.onBeforeRender = (renderer, _scene, renderCamera) => {
    // Depth captures and Reflector passes must not move the shared shadow maps.
    if (
      !renderer.shadowMap.enabled ||
      !renderer.shadowMap.autoUpdate ||
      !(renderCamera instanceof THREE.PerspectiveCamera)
    )
      return;
    if (csm.camera !== renderCamera || !projection.equals(renderCamera.projectionMatrix)) {
      csm.camera = renderCamera;
      csm.updateFrustums();
      projection.copy(renderCamera.projectionMatrix);
    }
    shadowView.value.copy(renderCamera.matrixWorldInverse);
    csm.update();
    for (const light of csm.lights) {
      light.updateMatrixWorld();
      light.target.updateMatrixWorld();
    }
  };

  const paintClouds = createCloudLayer(1024, 512);
  const createDaySky = () => {
    const skyScene = new THREE.Scene();
    const sky = new Sky();
    sky.scale.setScalar(1000);
    const uniforms = sky.material.uniforms;
    uniforms.sunPosition.value.fromArray(daylight.noon.sunOffset);
    uniforms.turbidity.value = 2;
    uniforms.rayleigh.value = 1.5;
    uniforms.mieCoefficient.value = 0.003;
    uniforms.mieDirectionalG.value = 0.8;
    uniforms.cloudCoverage.value = 0.35;
    uniforms.cloudDensity.value = 0.45;
    uniforms.cloudScale.value = 0.001;
    uniforms.cloudSpeed.value = 0;
    sky.material.uniforms.groundColor = { value: new THREE.Color(daylight.noon.ground) };
    sky.material.fragmentShader = sky.material.fragmentShader
      .replace('uniform float time;', 'uniform float time;\nuniform vec3 groundColor;')
      .replace(
        'gl_FragColor = vec4( texColor, 1.0 );',
        `texColor *= 0.18;
        texColor = mix(groundColor * 0.5, texColor, smoothstep(-0.08, 0.02, direction.y));
        gl_FragColor = vec4( texColor, 1.0 );`,
      );
    skyScene.add(sky);
    const target = new THREE.WebGLCubeRenderTarget(512, { type: THREE.HalfFloatType });
    const cubeCamera = new THREE.CubeCamera(0.1, 2000, target);
    const previousTarget = renderer.getRenderTarget();
    try {
      // The directional light supplies the sun; omit its tiny disc from filtered reflections.
      uniforms.showSunDisc.value = 0;
      const environment = pmrem.fromScene(skyScene).texture;
      uniforms.showSunDisc.value = 1;
      cubeCamera.update(renderer, skyScene);
      return { sky: target.texture, environment };
    } finally {
      renderer.setRenderTarget(previousTarget);
      sky.geometry.dispose();
      sky.material.dispose();
    }
  };
  const createSky = (time: ConfigurationState['timeOfDay']) => {
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
    if (time === 'noon') {
      gradient.addColorStop(0.3, '#5799d8');
      gradient.addColorStop(0.44, '#9ec2df');
    }
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
    cloudContext.putImageData(
      new ImageData(paintClouds(preset), cloudCanvas.width, cloudCanvas.height),
      0,
      0,
    );
    skyContext.drawImage(cloudCanvas, 0, 0, skyCanvas.width, skyCanvas.height);
    const sky = new THREE.CanvasTexture(skyCanvas);
    sky.colorSpace = THREE.SRGBColorSpace;
    sky.mapping = THREE.EquirectangularReflectionMapping;
    return {
      sky,
      environment: pmrem.fromEquirectangular(sky).texture,
    };
  };
  const skies = {
    noon: createDaySky(),
    sunset: createSky('sunset'),
    night: createSky('night'),
  };
  pmrem.dispose();
  const applyTimeOfDay = (time: ConfigurationState['timeOfDay']) => {
    const preset = daylight[time];
    scene.background = skies[time].sky;
    scene.environment = skies[time].environment;
    fog.color.set(preset.haze);
    ambient.color.set(preset.ambient);
    ambient.groundColor.set(preset.ground);
    ambient.intensity = preset.ambientIntensity;
    scene.environmentIntensity = preset.environmentIntensity;
    csm.lightDirection.fromArray(preset.sunOffset).normalize().negate();
    for (const light of csm.lights) {
      light.color.set(preset.sun);
      light.intensity = preset.sunIntensity;
    }
    renderer.toneMappingExposure = preset.exposure;
  };

  return {
    apply: applyTimeOfDay,
    setupMaterials,
    /** `clearDistance` pushes fog beyond that range, e.g. so the map view sees the whole course. */
    update(clearDistance?: number) {
      fog.near = clearDistance ?? fogNear;
      fog.far = clearDistance === undefined ? fogFar : clearDistance * 2;
    },
  };
}
