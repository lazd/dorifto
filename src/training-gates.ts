import * as THREE from 'three';
import type { createTrainingGates } from './racing-line';

export function createTrainingGateGeometry(
  { gates, halfWidth }: ReturnType<typeof createTrainingGates>,
  heightAt: (x: number, z: number) => number,
) {
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const color = new THREE.Color();
  const segments = 48;
  const sides = 12;
  const tubeRadius = 0.18;
  gates.forEach(({ center, forward }, index) => {
    const start = positions.length / 3;
    const across = new THREE.Vector3(forward.z, 0, -forward.x).normalize();
    color.set(index === 0 ? 0xff4b38 : 0x38e8ff);
    for (let segment = 0; segment <= segments; segment++) {
      const angle = (segment / segments) * Math.PI;
      for (let side = 0; side <= sides; side++) {
        const around = (side / sides) * Math.PI * 2;
        const radius = halfWidth + Math.cos(around) * tubeRadius;
        const x = center.x + across.x * Math.cos(angle) * radius;
        const z = center.z + across.z * Math.cos(angle) * radius;
        positions.push(
          x + forward.x * Math.sin(around) * tubeRadius,
          heightAt(x, z) + Math.sin(angle) * radius + 0.025,
          z + forward.z * Math.sin(around) * tubeRadius,
        );
        colors.push(color.r, color.g, color.b);
        uvs.push(side / sides, segment / segments);
      }
      if (segment < segments) {
        for (let side = 0; side < sides; side++) {
          const a = start + segment * (sides + 1) + side;
          indices.push(a, a + 1, a + sides + 1, a + 1, a + sides + 2, a + sides + 1);
        }
      }
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createTrainingGateMaterial() {
  return new THREE.ShaderMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    vertexShader: `
      varying vec3 gateColor;
      varying vec3 gateNormal;
      varying vec3 viewDirection;
      void main() {
        gateColor = color;
        gateNormal = normalize(normalMatrix * normal);
        viewDirection = -(modelViewMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 gateColor;
      varying vec3 gateNormal;
      varying vec3 viewDirection;
      void main() {
        float facing = abs(dot(normalize(gateNormal), normalize(viewDirection)));
        float halo = pow(facing, 1.5);
        float core = pow(facing, 16.0);
        gl_FragColor = vec4(mix(gateColor, vec3(1.0), core * 0.8),
          halo * 0.45 + core * 0.55);
      }
    `,
  });
}
