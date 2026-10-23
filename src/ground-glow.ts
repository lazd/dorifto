import * as THREE from 'three';

// Unlit additive ground glow; unlike real lights, it never changes the scene's shader programs.
const groundGlowMaterial = new THREE.ShaderMaterial({
  uniforms: THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    { color: { value: new THREE.Color() }, strength: { value: 1 } },
  ]),
  vertexShader: `
    #include <fog_pars_vertex>
    varying vec2 vUv;
    void main() {
      vUv = uv;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }
  `,
  fragmentShader: `
    #include <fog_pars_fragment>
    uniform vec3 color;
    uniform float strength;
    varying vec2 vUv;
    void main() {
      float glow = pow(max(0.0, 1.0 - length((vUv - 0.5) * 2.0)), 2.0) * strength;
      #ifdef USE_FOG
        glow *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
      #endif
      gl_FragColor = vec4(color * glow, 1.0);
    }
  `,
  fog: true,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  toneMapped: false,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
});
const groundLift = 0.05;

export type GroundHeight = (x: number, z: number) => number;

/** A world-space grid draped over the terrain around a car-relative rectangle. */
export function createGroundGlow(
  name: string,
  color: THREE.ColorRepresentation,
  strength: number,
  center: { x: number; z: number },
  size: { width: number; length: number },
) {
  const geometry = new THREE.PlaneGeometry(
    size.width,
    size.length,
    Math.ceil(size.width / 1.5),
    Math.ceil(size.length / 1.5),
  )
    .rotateX(-Math.PI / 2)
    .translate(center.x, 0, center.z);
  const local = geometry.getAttribute('position').array.slice();
  const material = groundGlowMaterial.clone();
  material.uniforms.color.value.set(color);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.matrixAutoUpdate = false;
  // Vertices move every frame, so the bounds would be stale.
  mesh.frustumCulled = false;
  mesh.visible = false;
  return {
    mesh,
    /** Follow the car's heading on the ground; fade out while it is on its side or roof. */
    update(matrix: THREE.Matrix4, heightAt: GroundHeight) {
      const e = matrix.elements;
      const heading = Math.hypot(e[8], e[10]) || 1;
      const fx = e[8] / heading;
      const fz = e[10] / heading;
      const positions = geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        const x = local[i * 3];
        const z = local[i * 3 + 2];
        const wx = e[12] + fz * x + fx * z;
        const wz = e[14] - fx * x + fz * z;
        positions.setXYZ(i, wx, heightAt(wx, wz) + groundLift, wz);
      }
      positions.needsUpdate = true;
      material.uniforms.strength.value = strength * THREE.MathUtils.smoothstep(e[5], 0.5, 0.8);
    },
    setColor(next: THREE.ColorRepresentation) {
      material.uniforms.color.value.set(next);
    },
    dispose() {
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}

/** Shared by the player and bots so both cars' underglow matches. */
export function createUnderglow(name: string, color: THREE.ColorRepresentation) {
  return createGroundGlow(name, color, 0.8, { x: 0, z: 0.2 }, { width: 3, length: 6 });
}
