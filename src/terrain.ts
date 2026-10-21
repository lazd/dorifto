import * as THREE from 'three';
import { courseRoute } from './courses';
import type { CourseDefinition } from './courses';
import { surfaceMaterial } from './surfaces';

type Point = { x: number; z: number };

export class CourseTerrain {
  readonly spacing = 1.5;
  readonly columns: number;
  readonly rows: number;
  readonly minX: number;
  readonly minZ: number;
  readonly heights: Float32Array;
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  readonly minHeight: number;
  readonly maxHeight: number;
  private readonly segments;
  private readonly buckets = new Map<string, number[]>();
  private readonly halfWidth: number;
  private readonly padRadius?: number;

  constructor(definition: CourseDefinition) {
    this.halfWidth = definition.width / 2 + 0.8;
    this.padRadius = definition.padRadius;
    const route = courseRoute(definition);
    const length = route.getLength();
    const count = Math.ceil(length);
    this.segments = Array.from({ length: count }, (_, i) => {
      const t = i / count;
      const a = route.getPointAt(t);
      const b = route.getPointAt((i + 1) / count);
      const before = route.getTangentAt(THREE.MathUtils.euclideanModulo(t - 5 / length, 1));
      const after = route.getTangentAt((t + 5 / length) % 1);
      const bend = Math.atan2(before.z * after.x - before.x * after.z, before.dot(after));
      return { a, b, bank: -THREE.MathUtils.clamp(bend / 10 * 2.5, -0.065, 0.065) };
    });
    const bounds = new THREE.Box3().setFromPoints(this.segments.map((segment) => segment.a));
    if (this.padRadius !== undefined) {
      bounds.expandByPoint(new THREE.Vector3(-this.padRadius, 0, -this.padRadius));
      bounds.expandByPoint(new THREE.Vector3(this.padRadius, 0, this.padRadius));
    }
    this.minX = Math.floor((bounds.min.x - 200) / this.spacing) * this.spacing;
    this.minZ = Math.floor((bounds.min.z - 200) / this.spacing) * this.spacing;
    this.columns = Math.ceil((bounds.max.x + 200 - this.minX) / this.spacing) + 1;
    this.rows = Math.ceil((bounds.max.z + 200 - this.minZ) / this.spacing) + 1;
    this.segments.forEach(({ a, b }, i) => {
      for (let x = Math.floor((Math.min(a.x, b.x) - 50) / 16); x <= Math.floor((Math.max(a.x, b.x) + 50) / 16); x++) {
        for (let z = Math.floor((Math.min(a.z, b.z) - 50) / 16); z <= Math.floor((Math.max(a.z, b.z) + 50) / 16); z++) {
          const key = `${x},${z}`;
          const bucket = this.buckets.get(key) ?? [];
          bucket.push(i);
          this.buckets.set(key, bucket);
        }
      }
    });
    this.heights = new Float32Array(this.columns * this.rows);
    const positions: number[] = [];
    const uvs: number[] = [];
    const colors: number[] = [];
    const vegetation: number[] = [];
    const roadDistances = new Float32Array(this.heights.length);
    const smoothingWeights = new Float32Array(this.heights.length);
    let min = Infinity;
    let max = -Infinity;
    for (let z = 0; z < this.rows; z++) {
      for (let x = 0; x < this.columns; x++) {
        const px = this.minX + x * this.spacing;
        const pz = this.minZ + z * this.spacing;
        const near = this.nearest(px, pz);
        const base = this.baseHeight(px, pz);
        const hills = 12 + 9 * Math.sin(px / 48 + 0.6) * Math.cos(pz / 61)
          + 5 * Math.sin((px - pz) / 83);
        const blendStart = Math.min(this.halfWidth + 3, 48);
        const blendEnd = Math.min(this.halfWidth + 48, 50);
        const blend = THREE.MathUtils.smoothstep(near.distance, blendStart, blendEnd);
        // Elevation follows the centerline, not the hillside's cross-slope:
        // positive turns lower the inside (+across) and raise the outside.
        const road = this.baseHeight(near.x, near.z) + near.bank * near.across;
        const height = definition.flat ? 0
          : THREE.MathUtils.lerp(road, base + hills, blend) * (definition.elevationScale ?? 1);
        const i = z * this.columns + x;
        roadDistances[i] = this.padRadius !== undefined ? Math.hypot(px, pz) - this.padRadius
          : near.distance - this.halfWidth;
        this.heights[i] = height;
        smoothingWeights[i] = THREE.MathUtils.smoothstep(near.distance, this.halfWidth + 3, this.halfWidth + 18);
        min = Math.min(min, height);
        max = Math.max(max, height);
        positions.push(px, this.heights[i], pz);
        uvs.push(px / 6, pz / 6);
        const shade = 0.92 + 0.08 * Math.sin(px / 17) * Math.cos(pz / 23);
        colors.push(shade, shade * 0.98, shade * 0.91);
      }
    }
    // Smooth infield seams without changing pavement or its immediate shoulder.
    const smoothed = new Float32Array(this.heights.length);
    for (let pass = 0; pass < 12 && !definition.flat; pass++) {
      smoothed.set(this.heights);
      for (let z = 1; z < this.rows - 1; z++) {
        for (let x = 1; x < this.columns - 1; x++) {
          const i = z * this.columns + x;
          const average = (this.heights[i] * 4
            + this.heights[i - 1] + this.heights[i + 1]
            + this.heights[i - this.columns] + this.heights[i + this.columns]) / 8;
          smoothed[i] = THREE.MathUtils.lerp(this.heights[i], average, smoothingWeights[i]);
        }
      }
      this.heights.set(smoothed);
    }
    min = Infinity;
    max = -Infinity;
    for (let i = 0; i < this.heights.length; i++) {
      positions[i * 3 + 1] = this.heights[i];
      min = Math.min(min, this.heights[i]);
      max = Math.max(max, this.heights[i]);
      const x = i % this.columns;
      const z = Math.floor(i / this.columns);
      const left = Math.max(x - 1, 0);
      const right = Math.min(x + 1, this.columns - 1);
      const back = Math.max(z - 1, 0);
      const front = Math.min(z + 1, this.rows - 1);
      const dx = (this.heights[z * this.columns + right] - this.heights[z * this.columns + left])
        / ((right - left) * this.spacing);
      const dz = (this.heights[front * this.columns + x] - this.heights[back * this.columns + x])
        / ((front - back) * this.spacing);
      const slope = Math.atan(Math.hypot(dx, dz));
      vegetation.push(roadDistances[i], slope);
    }
    // Bullet needs a nonzero vertical range even for an entirely flat heightfield.
    this.minHeight = min === max ? min - 0.01 : min;
    this.maxHeight = min === max ? max + 0.01 : max;
    const indices: number[] = [];
    for (let z = 0; z < this.rows - 1; z++) {
      for (let x = 0; x < this.columns - 1; x++) {
        const i = z * this.columns + x;
        indices.push(i, i + this.columns, i + 1, i + 1, i + this.columns, i + this.columns + 1);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('vegetation', new THREE.Float32BufferAttribute(vegetation, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = surfaceMaterial('gravel');
    const grassMaterial = surfaceMaterial('grass');
    const grassMap = grassMaterial.map;
    const grassNormalMap = grassMaterial.normalMap;
    grassMaterial.dispose();
    material.onBeforeCompile = (shader) => {
      shader.uniforms.grassMap = { value: grassMap };
      shader.uniforms.grassNormalMap = { value: grassNormalMap };
      shader.vertexShader = shader.vertexShader.replace('#include <common>',
        '#include <common>\nattribute vec2 vegetation;\nvarying vec2 vVegetation;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvVegetation = vegetation;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>',
        `#include <common>
        uniform sampler2D grassMap;
        uniform sampler2D grassNormalMap;
        varying vec2 vVegetation;
        float terrainNoise(vec2 p) {
          vec2 cell = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          vec4 h = fract(sin(vec4(
            dot(cell, vec2(127.1, 311.7)),
            dot(cell + vec2(1.0, 0.0), vec2(127.1, 311.7)),
            dot(cell + vec2(0.0, 1.0), vec2(127.1, 311.7)),
            dot(cell + vec2(1.0), vec2(127.1, 311.7))
          )) * 43758.5453);
          return mix(mix(h.x, h.y, f.x), mix(h.z, h.w, f.x), f.y);
        }`)
        .replace('#include <map_fragment>', `
          #ifdef USE_MAP
            vec4 gravelColor = texture2D(map, vMapUv);
            vec4 grassColor = texture2D(grassMap, vMapUv * 2.0);
            float patches = terrainNoise(vMapUv * 0.45);
            float detail = terrainNoise(vMapUv * 6.0);
            float edge = (detail - 0.5) * 0.65 + (patches - 0.5) * 0.8;
            float shoulder = smoothstep(1.5, 3.2, vVegetation.x + edge);
            float slopeGrass = 1.0 - smoothstep(0.52, 0.87, vVegetation.y);
            float coverage = shoulder * slopeGrass;
            grassColor.rgb *= mix(vec3(0.88, 0.92, 0.82), vec3(1.08, 1.04, 0.94), patches);
            diffuseColor *= mix(gravelColor, grassColor, coverage);
          #endif
        `)
        .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replaceAll(
          'texture2D( normalMap, vNormalMapUv )',
          'mix(texture2D(normalMap, vNormalMapUv), texture2D(grassNormalMap, vNormalMapUv * 2.0), coverage)',
        ));
    };
    material.customProgramCacheKey = () => 'slope-vegetation-patches';
    material.addEventListener('dispose', () => {
      grassMap?.dispose();
      grassNormalMap?.dispose();
    });
    material.vertexColors = true;
    material.polygonOffset = true;
    material.polygonOffsetFactor = 2;
    material.polygonOffsetUnits = 2;
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.receiveShadow = true;
    const bladeGeometry = new THREE.BufferGeometry();
    bladeGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
      -0.025, 0, 0, 0.025, 0, 0, 0.035, 0.22, 0.025,
      0, 0, -0.025, 0, 0, 0.025, -0.025, 0.18, 0.03,
    ], 3));
    bladeGeometry.computeVertexNormals();
    const bladeMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 1, side: THREE.DoubleSide,
    });
    // Thin decorative blades otherwise flare under the close, powerful headlights.
    bladeMaterial.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <lights_fragment_begin>',
        THREE.ShaderChunk.lights_fragment_begin.replace(
          'getSpotLightInfo( spotLight, geometryPosition, directLight );',
          'getSpotLightInfo( spotLight, geometryPosition, directLight );\ndirectLight.color *= 0.05;',
        ),
      );
    };
    bladeMaterial.customProgramCacheKey = () => 'grass-soft-spotlights';
    let grassSeed = 18473;
    const random = () => {
      grassSeed = (grassSeed + 0x6d2b79f5) | 0;
      let value = Math.imul(grassSeed ^ grassSeed >>> 15, 1 | grassSeed);
      value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
    const placements: { x: number; z: number; blades: number }[] = [];
    for (let z = 1; z < this.rows - 1; z++) {
      for (let x = 1; x < this.columns - 1; x++) {
        const i = z * this.columns + x;
        if (roadDistances[i] > 3.4 && roadDistances[i] < 10 && vegetation[i * 2 + 1] < 0.6 && random() < 0.44) {
          const px = this.minX + (x + random() - 0.5) * this.spacing;
          const pz = this.minZ + (z + random() - 0.5) * this.spacing;
          const distance = this.padRadius !== undefined ? Math.hypot(px, pz) - this.padRadius
            : this.nearest(px, pz).distance - this.halfWidth;
          if (distance > 3.4 && distance < 10) {
            placements.push({ x: px, z: pz, blades: 3 + Math.floor(random() * 6) });
          }
        }
      }
    }
    const tufts = new THREE.InstancedMesh(
      bladeGeometry, bladeMaterial, placements.reduce((count, tuft) => count + tuft.blades, 0),
    );
    const transform = new THREE.Object3D();
    const bladeColor = new THREE.Color();
    let instance = 0;
    placements.forEach(({ x, z, blades }) => {
      const tuftHeight = 0.6 + random() * 0.9;
      for (let blade = 0; blade < blades; blade++) {
        const angle = random() * Math.PI * 2;
        const radius = Math.sqrt(random()) * 0.22;
        const px = x + Math.cos(angle) * radius;
        const pz = z + Math.sin(angle) * radius;
        transform.position.set(px, this.heightAt(px, pz) - 0.01, pz);
        transform.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.normalAt(px, pz));
        transform.rotateY(angle);
        transform.rotateX((random() - 0.5) * 0.5);
        transform.scale.set(0.65 + random() * 0.8, tuftHeight * (0.7 + random() * 0.6), 1);
        transform.updateMatrix();
        tufts.setMatrixAt(instance, transform.matrix);
        const shade = random();
        bladeColor.setRGB(0.18 + shade * 0.2, 0.23 + shade * 0.18, 0.09 + shade * 0.12);
        tufts.setColorAt(instance++, bladeColor);
      }
    });
    tufts.receiveShadow = true;
    this.mesh.add(tufts);
  }

  private baseHeight(x: number, z: number) {
    return 5 * Math.sin(x / 65) + 4 * Math.sin(z / 75) + 2 * Math.cos((x + z) / 90);
  }

  private nearest(x: number, z: number) {
    let distance = 50;
    let across = 0;
    let bank = 0;
    let centerX = x;
    let centerZ = z;
    for (const i of this.buckets.get(`${Math.floor(x / 16)},${Math.floor(z / 16)}`) ?? []) {
      const segment = this.segments[i];
      const dx = segment.b.x - segment.a.x;
      const dz = segment.b.z - segment.a.z;
      const t = THREE.MathUtils.clamp(((x - segment.a.x) * dx + (z - segment.a.z) * dz) / (dx * dx + dz * dz), 0, 1);
      const ox = x - segment.a.x - t * dx;
      const oz = z - segment.a.z - t * dz;
      const d = Math.hypot(ox, oz);
      if (d < distance) {
        distance = d;
        centerX = segment.a.x + t * dx;
        centerZ = segment.a.z + t * dz;
        across = (ox * dz - oz * dx) / Math.hypot(dx, dz);
        bank = THREE.MathUtils.lerp(segment.bank, this.segments[(i + 1) % this.segments.length].bank, t);
      }
    }
    return { distance, across, bank, x: centerX, z: centerZ };
  }

  contains(x: number, z: number) {
    return x >= this.minX && z >= this.minZ
      && x < this.minX + (this.columns - 1) * this.spacing
      && z < this.minZ + (this.rows - 1) * this.spacing;
  }

  heightAt(x: number, z: number) {
    const gx = THREE.MathUtils.clamp((x - this.minX) / this.spacing, 0, this.columns - 1.000001);
    const gz = THREE.MathUtils.clamp((z - this.minZ) / this.spacing, 0, this.rows - 1.000001);
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const u = gx - ix;
    const v = gz - iz;
    const i = iz * this.columns + ix;
    const a = this.heights[i];
    const b = this.heights[i + 1];
    const c = this.heights[i + this.columns];
    const d = this.heights[i + this.columns + 1];
    return u + v <= 1 ? a + (b - a) * u + (c - a) * v
      : d + (c - d) * (1 - u) + (b - d) * (1 - v);
  }

  normalAt(x: number, z: number) {
    const delta = 0.3;
    return new THREE.Vector3(this.heightAt(x - delta, z) - this.heightAt(x + delta, z),
      2 * delta, this.heightAt(x, z - delta) - this.heightAt(x, z + delta)).normalize();
  }

  isAsphalt(position: THREE.Vector3) {
    if (this.padRadius !== undefined) return Math.hypot(position.x, position.z) <= this.padRadius;
    return this.nearest(position.x, position.z).distance <= this.halfWidth;
  }

  // Split paint and pavement at the heightfield's triangle edges, avoiding
  // terrain poking through a ribbon that spans differently triangulated cells.
  projectGeometry(source: THREE.BufferGeometry, lift: number) {
    const positions: number[] = [];
    const uv: number[] = [];
    const attribute = source.getAttribute('position');
    const index = source.getIndex();
    function clip(polygon: Point[], a: Point, b: Point) {
      const side = (p: Point) => (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
      const result: Point[] = [];
      for (let i = 0; i < polygon.length; i++) {
        const p = polygon[i];
        const q = polygon[(i + 1) % polygon.length];
        const dp = side(p);
        const dq = side(q);
        if (dp >= 0) result.push(p);
        if ((dp < 0) !== (dq < 0)) {
          const t = dp / (dp - dq);
          result.push({ x: p.x + t * (q.x - p.x), z: p.z + t * (q.z - p.z) });
        }
      }
      return result;
    }
    for (let i = 0; i < (index?.count ?? attribute.count); i += 3) {
      const triangle = [0, 1, 2].map((j) => {
        const v = index ? index.getX(i + j) : i + j;
        return { x: attribute.getX(v), z: attribute.getZ(v) };
      });
      const minX = Math.floor((Math.min(...triangle.map((p) => p.x)) - this.minX) / this.spacing);
      const maxX = Math.floor((Math.max(...triangle.map((p) => p.x)) - this.minX) / this.spacing);
      const minZ = Math.floor((Math.min(...triangle.map((p) => p.z)) - this.minZ) / this.spacing);
      const maxZ = Math.floor((Math.max(...triangle.map((p) => p.z)) - this.minZ) / this.spacing);
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          const px = this.minX + x * this.spacing;
          const pz = this.minZ + z * this.spacing;
          const a = { x: px, z: pz };
          const b = { x: px + this.spacing, z: pz };
          const c = { x: px, z: pz + this.spacing };
          const d = { x: px + this.spacing, z: pz + this.spacing };
          for (const cell of [[a, b, c], [b, d, c]]) {
            let polygon = triangle;
            for (let edge = 0; edge < 3; edge++) polygon = clip(polygon, cell[edge], cell[(edge + 1) % 3]);
            for (let j = 1; j < polygon.length - 1; j++) {
              for (const p of [polygon[0], polygon[j], polygon[j + 1]]) {
                positions.push(p.x, this.heightAt(p.x, p.z) + lift, p.z);
                uv.push(p.x / 5, p.z / 5);
              }
            }
          }
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.computeVertexNormals();
    return geometry;
  }
}
