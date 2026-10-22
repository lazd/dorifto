import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import type { loadCar } from './car';

type Car = Awaited<ReturnType<typeof loadCar>>;

// Exterior shell only; the cabin and engine bay would just add see-through clutter.
const bodyParts = /^((Body2|Front|Hood|rbumper|Wing|Mirrors)_Paint|Windows_Windows|BlackTrim|Mustache|HLblack|hlglass|glasstails|glassmiddle|Glasstop|334_T_001_001_LightsGlass|Rubber_001_001_Black|Cornerglass|72_T_Cornerglass)/;
const trimParts = /^(BlackTrim|Mustache|Rubber_|Cube_Black|68_T_003_001_Plastico|Fenderlight1_Plastico|glasstails|glassmiddle|Glasstop|334_T_001_001_LightsGlass)/;
const frontParts = /^(FogGlass_|Projectorglass_|Chin_003_001_Paint|Badge_(Insideglass|003_001_Chrome|001_001_Badgecolor))/;
const wheelParts = /^(tyr_|llantaoem)/;
const ghostOpacity = 0.38;
const glowOpacity = 0.24;
const lightIntensity = 0.45;
const groundLightIntensity = 4;

function mergeParts(meshes: { mesh: THREE.Mesh; matrix: THREE.Matrix4 }[]) {
  const geometries = meshes.map(({ mesh, matrix }) => {
    const source = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', source.getAttribute('position'));
    const colors = new Float32Array(source.getAttribute('position').count * 3);
    colors.fill(trimParts.test(mesh.name) ? 0.6 : 1);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    if (source.getAttribute('normal')) geometry.setAttribute('normal', source.getAttribute('normal'));
    else geometry.computeVertexNormals();
    return geometry.applyMatrix4(matrix);
  });
  const merged = mergeGeometries(geometries);
  if (!merged) throw new Error('Unable to build ghost car geometry');
  geometries.forEach((geometry) => geometry.dispose());
  return merged;
}

/**
 * A translucent, non-colliding copy of the car. A depth-only prepass makes only the
 * nearest surface visible, so overlapping panels don't stack into a muddy blob.
 */
export function createGhostCar(scene: THREE.Scene, car: Car) {
  const prepass = new THREE.MeshBasicMaterial({
    colorWrite: false, transparent: true, side: THREE.DoubleSide, forceSinglePass: true,
  });
  const material = new THREE.MeshStandardMaterial({
    color: 0x9ee8ff, emissive: 0x3a9fd0, emissiveIntensity: 0.7, roughness: 0.35, metalness: 0,
    transparent: true, opacity: ghostOpacity, depthWrite: false,
    side: THREE.DoubleSide, forceSinglePass: true,
    vertexColors: true,
  });
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n totalEmissiveRadiance *= vColor.rgb;',
    );
  };
  const maskTarget = new THREE.WebGLRenderTarget(1, 1);
  const blurTarget = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
  const size = new THREE.Vector2();
  const viewPosition = new THREE.Vector3();
  const maskMaterial = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      sceneDepth: { value: null as THREE.DepthTexture | null },
      resolution: { value: size },
    },
    vertexShader: `
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D sceneDepth;
      uniform vec2 resolution;
      void main() {
        float depth = texture2D(sceneDepth, gl_FragCoord.xy / resolution).x;
        if (gl_FragCoord.z > depth + 0.00001) discard;
        gl_FragColor = vec4(1.0);
      }
    `,
  });
  const blurMaterial = new THREE.ShaderMaterial({
    uniforms: {
      source: { value: maskTarget.texture },
      direction: { value: new THREE.Vector2() },
      color: { value: new THREE.Color(1, 1, 1) },
      opacity: { value: 1 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D source;
      uniform vec2 direction;
      uniform vec3 color;
      uniform float opacity;
      varying vec2 vUv;
      void main() {
        float glow = 0.0;
        float totalWeight = 0.0;
        for (int i = -16; i <= 16; i++) {
          float offset = float(i) * 0.25;
          float weight = exp(-0.5 * offset * offset);
          glow += texture2D(source, vUv + direction * offset).r * weight;
          totalWeight += weight;
        }
        gl_FragColor = vec4(color * glow / totalWeight, opacity);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const quad = new FullScreenQuad(blurMaterial);
  const meshesFor = (geometry: THREE.BufferGeometry) => {
    const depth = new THREE.Mesh(geometry, prepass);
    const color = new THREE.Mesh(geometry, material);
    depth.renderOrder = 10;
    color.renderOrder = 11;
    return [depth, color];
  };

  car.chassis.updateMatrixWorld(true);
  const toChassis = car.chassis.matrixWorld.clone().invert();
  const body: { mesh: THREE.Mesh; matrix: THREE.Matrix4 }[] = [];
  car.chassis.traverse((object) => {
    if (object instanceof THREE.Mesh
      && (bodyParts.test(object.name) || trimParts.test(object.name) || frontParts.test(object.name)))
      body.push({ mesh: object, matrix: toChassis.clone().multiply(object.matrixWorld) });
  });
  if (!body.length) throw new Error('Missing car body geometry for the ghost car');
  const chassis = new THREE.Group();
  chassis.add(...meshesFor(mergeParts(body)));
  const wheels = car.wheels.map((wheel) => {
    wheel.updateMatrixWorld(true);
    const parts = wheel.children
      .filter((child): child is THREE.Mesh => child instanceof THREE.Mesh && wheelParts.test(child.name))
      .map((mesh) => ({ mesh, matrix: mesh.matrix.clone() }));
    const group = new THREE.Group();
    if (parts.length) group.add(...meshesFor(mergeParts(parts)));
    return group;
  });
  const root = new THREE.Group();
  root.name = 'ghost-car';
  root.visible = false;
  root.add(chassis, ...wheels);
  // Keep the light count stable so ghost visibility never recompiles the scene's shaders.
  const lightRoot = new THREE.Group();
  lightRoot.name = 'ghost-car-lights';
  lightRoot.matrixAutoUpdate = false;
  const lights = [-1.2, 0, 1.2].map((z) => {
    const light = new THREE.PointLight(0x9ee8ff, 0, 8, 2);
    light.position.set(0, 0.65, z);
    lightRoot.add(light);
    return light;
  });
  const groundLights = [-1, 1].map((z) => {
    const light = new THREE.SpotLight(0x9ee8ff, 0, 7, Math.PI * 0.4, 1, 2);
    light.position.set(0, 0.65, z);
    light.target.position.set(0, -1, z);
    lightRoot.add(light, light.target);
    return light;
  });
  scene.add(root, lightRoot);
  function updateLights() {
    chassis.updateWorldMatrix(true, false);
    lightRoot.matrix.copy(chassis.matrixWorld);
    lightRoot.matrixWorldNeedsUpdate = true;
    const fade = root.visible ? material.opacity / ghostOpacity : 0;
    for (const light of lights) light.intensity = lightIntensity * fade;
    for (const light of groundLights) light.intensity = groundLightIntensity * fade;
  }
  const maskScene = new THREE.Scene();
  maskScene.background = new THREE.Color(0);
  const maskGroups = [chassis, ...wheels].map((group) => {
    const mask = new THREE.Group();
    const surface = group.children[0];
    if (surface instanceof THREE.Mesh) mask.add(new THREE.Mesh(surface.geometry, maskMaterial));
    maskScene.add(mask);
    return mask;
  });

  return {
    chassis,
    wheels,
    get visible() { return root.visible; },
    set visible(visible: boolean) {
      root.visible = visible;
      updateLights();
    },
    /** Fade overlapping ghosts slightly in chase view and fully in cabin view. */
    fadeNear(position: THREE.Vector3, cabinView: boolean) {
      const distance = chassis.position.distanceTo(position);
      const fade = THREE.MathUtils.smoothstep(distance, 2.5, 7);
      material.opacity = ghostOpacity * THREE.MathUtils.lerp(cabinView ? 0 : 0.7, 1, fade);
      updateLights();
    },
    renderGlow(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, depth: THREE.DepthTexture | null) {
      if (!root.visible || material.opacity === 0) return;
      if (!depth) throw new Error('Ghost glow requires a scene depth texture');
      renderer.getDrawingBufferSize(size);
      size.multiplyScalar(0.5).floor();
      if (maskTarget.width !== size.x || maskTarget.height !== size.y) {
        maskTarget.setSize(size.x, size.y);
        blurTarget.setSize(size.x, size.y);
      }
      maskMaterial.uniforms.sceneDepth.value = depth;
      [chassis, ...wheels].forEach((group, i) => {
        group.updateWorldMatrix(true, false);
        maskGroups[i].matrixAutoUpdate = false;
        maskGroups[i].matrix.copy(group.matrixWorld);
      });
      viewPosition.setFromMatrixPosition(chassis.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
      const radius = 0.09 * camera.projectionMatrix.elements[5] / Math.max(1, -viewPosition.z);
      const target = renderer.getRenderTarget();
      const autoClear = renderer.autoClear;
      try {
        renderer.autoClear = true;
        renderer.setRenderTarget(maskTarget);
        renderer.render(maskScene, camera);
        // Blur the solid silhouette, not individual panels, so every edge has the same soft falloff.
        blurMaterial.blending = THREE.NoBlending;
        blurMaterial.uniforms.source.value = maskTarget.texture;
        blurMaterial.uniforms.direction.value.set(radius / camera.aspect, 0);
        blurMaterial.uniforms.color.value.setRGB(1, 1, 1);
        blurMaterial.uniforms.opacity.value = 1;
        renderer.setRenderTarget(blurTarget);
        quad.render(renderer);
        blurMaterial.blending = THREE.AdditiveBlending;
        blurMaterial.uniforms.source.value = blurTarget.texture;
        blurMaterial.uniforms.direction.value.set(0, radius);
        blurMaterial.uniforms.color.value.set(0x9ee8ff);
        blurMaterial.uniforms.opacity.value = glowOpacity * material.opacity / ghostOpacity;
        renderer.setRenderTarget(target);
        renderer.autoClear = false;
        quad.render(renderer);
      } finally {
        renderer.setRenderTarget(target);
        renderer.autoClear = autoClear;
      }
    },
  };
}
