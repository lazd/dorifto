import * as THREE from 'three';
import { courseProfileHeight, courseRoute, courseShoulderWidth } from './courses';
import type { CourseDefinition } from './courses';
import { surfaceMaterial, terrainNoiseGlsl } from './surfaces';
import { terrainBaseHeight, terrainRasterSampler } from './terrain-profile';
import {
  TerrainSurface,
  cellTriangles,
  heightAt,
  normalAt,
  triangleHeight,
  vertexPosition,
  type TerrainQueryData,
} from './terrain-query';

type Point = { x: number; z: number };

export class CourseTerrain {
  readonly spacing = 1.5;
  readonly columns: number;
  readonly rows: number;
  readonly minX: number;
  readonly minZ: number;
  readonly heights: Float32Array;
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  readonly grass: THREE.InstancedMesh;
  readonly minHeight: number;
  readonly maxHeight: number;
  readonly flippedCells?: Uint8Array;
  readonly warpedCells?: Uint8Array;
  readonly warpedVertices?: Map<number, Point>;
  private readonly segments;
  private readonly surface: TerrainSurface;
  private readonly halfWidth: number;
  private readonly padRadius?: number;

  constructor(definition: CourseDefinition, buildVisuals = true) {
    this.halfWidth = definition.width / 2 + (definition.shoulderWidth ?? courseShoulderWidth);
    this.padRadius = definition.padRadius;
    // Driving direction must not change the heightfield or its banking.
    const route = courseRoute({ ...definition, reverse: false });
    const length = route.getLength();
    const count = Math.ceil(length);
    const fraction = (t: number) =>
      definition.closed === false
        ? THREE.MathUtils.clamp(t, 0, 1)
        : THREE.MathUtils.euclideanModulo(t, 1);
    this.segments = Array.from({ length: count }, (_, i) => {
      const t = i / count;
      const a = route.getPointAt(t);
      const b = route.getPointAt((i + 1) / count);
      const before = route.getTangentAt(fraction(t - 5 / length));
      const after = route.getTangentAt(
        definition.closed === false ? fraction(t + 5 / length) : (t + 5 / length) % 1,
      );
      const bend = Math.atan2(before.z * after.x - before.x * after.z, before.dot(after));
      return { a, b, bank: -THREE.MathUtils.clamp((bend / 10) * 2.5, -0.065, 0.065) };
    });
    if (definition.elevation || definition.bankingScale !== undefined) {
      // Generated corners need gradual roll-in/out, especially at high banking.
      // Keep the existing 50 m GPS filter for imported elevation profiles.
      const generatedBanking = !definition.elevation && definition.bankingScale !== undefined;
      const bankRadius = Math.max(1, Math.round((generatedBanking ? 75 : 25) / (length / count)));
      const weights = Array.from({ length: bankRadius * 2 + 1 }, (_, i) =>
        generatedBanking
          ? (1 - ((i - bankRadius) / bankRadius) ** 2) ** 3
          : bankRadius + 1 - Math.abs(i - bankRadius),
      );
      const banks = this.segments.map(({ bank }) => bank);
      this.segments.forEach((segment, i) => {
        let weightedBank = 0;
        let totalWeight = 0;
        for (let offset = -bankRadius; offset <= bankRadius; offset++) {
          const weight = weights[offset + bankRadius];
          const index =
            definition.closed === false
              ? THREE.MathUtils.clamp(i + offset, 0, count - 1)
              : THREE.MathUtils.euclideanModulo(i + offset, count);
          weightedBank += banks[index] * weight;
          totalWeight += weight;
        }
        segment.bank = weightedBank / totalWeight;
      });
    }
    const bounds = new THREE.Box3().setFromPoints(this.segments.map((segment) => segment.a));
    const profile = definition.elevation;
    const rasterHeight = definition.terrain ? terrainRasterSampler(definition.terrain) : undefined;
    const surroundings =
      !rasterHeight &&
      profile &&
      profileSurroundings(
        this.segments.map(({ a }, i) => ({
          x: a.x,
          z: a.z,
          height: courseProfileHeight(profile, i / count, definition.closed !== false),
        })),
      );
    if (this.padRadius !== undefined) {
      bounds.expandByPoint(new THREE.Vector3(-this.padRadius, 0, -this.padRadius));
      bounds.expandByPoint(new THREE.Vector3(this.padRadius, 0, this.padRadius));
    }
    this.minX = Math.floor((bounds.min.x - 200) / this.spacing) * this.spacing;
    this.minZ = Math.floor((bounds.min.z - 200) / this.spacing) * this.spacing;
    this.columns = Math.ceil((bounds.max.x + 200 - this.minX) / this.spacing) + 1;
    this.rows = Math.ceil((bounds.max.z + 200 - this.minZ) / this.spacing) + 1;
    this.surface = new TerrainSurface(this.segments, this.halfWidth, this.padRadius);
    this.heights = new Float32Array(this.columns * this.rows);
    const positions = new Float32Array(this.heights.length * 3);
    const elevationScale = definition.elevationScale ?? 1;
    const bankingScale = definition.bankingScale ?? elevationScale;
    const uvs = new Float32Array(this.heights.length * 2);
    const vegetation: number[] = [];
    const roadDistances = new Float32Array(this.heights.length);
    const smoothingWeights = new Float32Array(this.heights.length);
    // Every triangle touching pavement must have all its vertices on the road profile. Snapped
    // vertices sit on lines parallel to the pavement edge, so they rise right from it; other
    // raster vertices stay on the profile for a cell diagonal so no triangle lifts pavement.
    const supportWidth = rasterHeight ? this.spacing * Math.SQRT2 : 0;
    const blendStart = rasterHeight
      ? this.halfWidth + supportWidth
      : Math.min(this.halfWidth + 3, 48);
    const snapStart = this.halfWidth;
    const blendEnd = Math.min(this.halfWidth + 48, 50);
    const transition = definition.terrainTransition ?? defaultTerrainTransition;
    const vertex = (
      i: number,
      px: number,
      pz: number,
      near = this.nearest(px, pz),
      start = blendStart,
    ) => {
      const base = terrainBaseHeight(px, pz);
      const hills =
        12 + 9 * Math.sin(px / 48 + 0.6) * Math.cos(pz / 61) + 5 * Math.sin((px - pz) / 83);
      // Elevation follows the centerline, not the hillside's cross-slope:
      // positive turns lower the inside (+across) and raise the outside.
      const road =
        (profile
          ? courseProfileHeight(profile, near.fraction, definition.closed !== false)
          : terrainBaseHeight(near.x, near.z)) *
          elevationScale +
        near.bank * near.across * bankingScale;
      // Imported tracks settle into ground interpolated from nearby course heights.
      const ground = rasterHeight
        ? rasterHeight(px, pz, near.distance)
        : surroundings
          ? surroundings(px, pz) + 0.35 * (hills - 12)
          : base + hills;
      roadDistances[i] =
        this.padRadius !== undefined
          ? Math.hypot(px, pz) - this.padRadius
          : near.distance - this.halfWidth;
      const rise = ground * elevationScale - road;
      const end = rasterHeight
        ? start + Math.min(transition, Math.max(Math.abs(rise), minTerrainTransition))
        : blendEnd;
      this.heights[i] = definition.flat
        ? 0
        : road + rise * THREE.MathUtils.smoothstep(near.distance, start, end);
      smoothingWeights[i] = THREE.MathUtils.smoothstep(
        near.distance,
        this.halfWidth + 3,
        this.halfWidth + 18,
      );
      positions.set([px, this.heights[i], pz], i * 3);
      uvs.set([px / 6, pz / 6], i * 2);
    };
    const gridVertex = (i: number) =>
      vertex(
        i,
        this.minX + (i % this.columns) * this.spacing,
        this.minZ + Math.floor(i / this.columns) * this.spacing,
      );
    // Snap vertices across the roadside wall onto lines parallel to the road, one grid step
    // apart, so the wall's crest, face and foot follow the road instead of stair-stepping
    // along grid rows. Raster heights are sampled exactly there, so they aren't smoothed.
    const warp =
      rasterHeight && !definition.flat && this.padRadius === undefined
        ? new Map<number, Point>()
        : undefined;
    const snapLines = Math.ceil(transition / this.spacing);
    for (let i = 0; i < this.heights.length; i++) {
      const px = this.minX + (i % this.columns) * this.spacing;
      const pz = this.minZ + Math.floor(i / this.columns) * this.spacing;
      const near = this.nearest(px, pz);
      const line = Math.round((near.distance - snapStart) / this.spacing);
      if (!warp || line < 0 || line > snapLines) {
        vertex(i, px, pz, near);
        continue;
      }
      const scale = (snapStart + line * this.spacing) / near.distance;
      const snapped = { x: near.x + (px - near.x) * scale, z: near.z + (pz - near.z) * scale };
      warp.set(i, snapped);
      vertex(i, snapped.x, snapped.z, undefined, snapStart);
    }
    // Snap lines converge inside tight bends; release the corners of any cell that can no
    // longer be split into two upright triangles without lifting the pavement.
    for (let released = true; warp && released;) {
      released = false;
      for (const i of warp.keys()) {
        const x = i % this.columns;
        const z = Math.floor(i / this.columns);
        for (let cz = Math.max(z - 1, 0); cz <= Math.min(z, this.rows - 2); cz++)
          for (let cx = Math.max(x - 1, 0); cx <= Math.min(x, this.columns - 2); cx++) {
            const a = cz * this.columns + cx;
            const corners = [a, a + 1, a + this.columns, a + this.columns + 1] as const;
            const splits = cellSplits(positions, ...corners);
            const lifts = cellLifts(roadDistances, ...corners);
            if (splits.some((upright, split) => upright && !lifts[split])) continue;
            for (const corner of corners)
              if (warp.delete(corner)) {
                gridVertex(corner);
                released = true;
              }
          }
      }
    }
    // Generated terrain is smoothed beyond the road; raster terrain is already filtered.
    const smoothed = new Float32Array(this.heights.length);
    for (let pass = 0; pass < 12 && !rasterHeight && !definition.flat; pass++) {
      smoothed.set(this.heights);
      for (let z = 1; z < this.rows - 1; z++) {
        for (let x = 1; x < this.columns - 1; x++) {
          const i = z * this.columns + x;
          const neighbors =
            this.heights[i - 1] +
            this.heights[i + 1] +
            this.heights[i - this.columns] +
            this.heights[i + this.columns];
          smoothed[i] = THREE.MathUtils.lerp(
            this.heights[i],
            (this.heights[i] * 4 + neighbors) / 8,
            smoothingWeights[i],
          );
        }
      }
      this.heights.set(smoothed);
    }
    // Vegetation uses the steepest adjacent edges so vertices at the foot or crest of a wall
    // don't average to gentle and spread grass across the wall's triangles. Snapped vertices
    // sit closer than one grid step, so measure true horizontal distances.
    const grade = (i: number, x: number, z: number, dx: number, dz: number) => {
      let steepest = 0;
      for (let sign = -1; sign <= 1; sign += 2) {
        const nx = x + sign * dx;
        const nz = z + sign * dz;
        if (nx < 0 || nz < 0 || nx >= this.columns || nz >= this.rows) continue;
        const n = nz * this.columns + nx;
        const run = Math.hypot(
          positions[n * 3] - positions[i * 3],
          positions[n * 3 + 2] - positions[i * 3 + 2],
        );
        steepest = Math.max(steepest, Math.abs(this.heights[n] - this.heights[i]) / run);
      }
      return steepest;
    };
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < this.heights.length; i++) {
      positions[i * 3 + 1] = this.heights[i];
      min = Math.min(min, this.heights[i]);
      max = Math.max(max, this.heights[i]);
      const x = i % this.columns;
      const z = Math.floor(i / this.columns);
      const slope = Math.atan(
        Math.max(
          Math.hypot(grade(i, x, z, 1, 0), grade(i, x, z, 0, 1)),
          Math.hypot(grade(i, x, z, 1, 1), grade(i, x, z, 1, -1)),
        ),
      );
      vegetation.push(roadDistances[i], slope);
    }
    if (warp?.size) {
      this.warpedVertices = warp;
      this.warpedCells = new Uint8Array((this.columns - 1) * (this.rows - 1));
      for (const i of warp.keys()) {
        const x = i % this.columns;
        const z = Math.floor(i / this.columns);
        for (let cz = Math.max(z - 1, 0); cz <= Math.min(z, this.rows - 2); cz++)
          for (let cx = Math.max(x - 1, 0); cx <= Math.min(x, this.columns - 2); cx++)
            this.warpedCells[cz * (this.columns - 1) + cx] = 1;
      }
    }
    if (rasterHeight && !definition.flat)
      this.flippedCells = flipCellsAlongContours(
        this.heights,
        roadDistances,
        this.columns,
        this.rows,
        positions,
      );
    // Bullet needs a nonzero vertical range even for an entirely flat heightfield.
    this.minHeight = min === max ? min - 0.01 : min;
    this.maxHeight = min === max ? max + 0.01 : max;
    if (!buildVisuals) {
      this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial());
      this.grass = new THREE.InstancedMesh(
        new THREE.BufferGeometry(),
        new THREE.MeshStandardMaterial(),
        0,
      );
      return;
    }
    const indices = new Uint32Array((this.columns - 1) * (this.rows - 1) * 6);
    for (let z = 0; z < this.rows - 1; z++) {
      for (let x = 0; x < this.columns - 1; x++)
        indices.set(cellTriangles(this, x, z), (z * (this.columns - 1) + x) * 6);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(new Float32Array(positions.length).fill(1), 3),
    );
    geometry.setAttribute('vegetation', new THREE.Float32BufferAttribute(vegetation, 2));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeVertexNormals();
    const material = surfaceMaterial('rock');
    const soilMaterial = surfaceMaterial('gravel');
    const soilMap = soilMaterial.map;
    const soilNormalMap = soilMaterial.normalMap;
    const soilRoughnessMap = soilMaterial.roughnessMap;
    soilMaterial.dispose();
    const grassMaterial = surfaceMaterial('grass');
    const grassMap = grassMaterial.map;
    const grassNormalMap = grassMaterial.normalMap;
    const grassRoughnessMap = grassMaterial.roughnessMap;
    grassMaterial.dispose();
    material.onBeforeCompile = (shader) => {
      shader.uniforms.grassMap = { value: grassMap };
      shader.uniforms.grassNormalMap = { value: grassNormalMap };
      shader.uniforms.grassRoughnessMap = { value: grassRoughnessMap ?? grassMap };
      shader.uniforms.soilMap = { value: soilMap };
      shader.uniforms.soilNormalMap = { value: soilNormalMap };
      shader.uniforms.soilRoughnessMap = { value: soilRoughnessMap ?? soilMap };
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute vec2 vegetation;\nvarying vec2 vVegetation;\nvarying vec3 vTerrainPosition;\nvarying vec3 vTerrainNormal;',
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vVegetation = vegetation;
          vTerrainPosition = (modelMatrix * vec4(position, 1.0)).xyz;
          vTerrainNormal = normalize(mat3(modelMatrix) * objectNormal);`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
        uniform sampler2D grassMap;
        uniform sampler2D grassNormalMap;
        uniform sampler2D grassRoughnessMap;
        uniform sampler2D soilMap;
        uniform sampler2D soilNormalMap;
        uniform sampler2D soilRoughnessMap;
        varying vec2 vVegetation;
        varying vec3 vTerrainPosition;
        varying vec3 vTerrainNormal;
        ${terrainNoiseGlsl}
        vec4 terrainSample(sampler2D tex, vec2 uv) {
          float blend = smoothstep(0.2, 0.8, terrainNoise(uv * 0.23));
          return mix(texture2D(tex, uv), texture2D(tex, uv + vec2(0.37, 0.61)), blend);
        }
        // Distant ground mixes in a rotated, non-integer-scale copy so 3 m tiles don't line up
        // into stripes across hillsides.
        float terrainFar() {
          return smoothstep(12.0, 70.0, length(vViewPosition));
        }
        vec4 groundSample(sampler2D tex, vec2 uv) {
          vec2 macro = mat2(0.8, -0.6, 0.6, 0.8) * uv * 0.29 + vec2(0.13, 0.71);
          return mix(terrainSample(tex, uv), terrainSample(tex, macro), terrainFar() * 0.6);
        }
        vec4 triplanarSample(sampler2D tex, vec3 position, vec3 weights) {
          return terrainSample(tex, position.zy) * weights.x +
            terrainSample(tex, position.xz) * weights.y +
            terrainSample(tex, position.xy) * weights.z;
        }`,
        )
        .replace(
          '#include <normalmap_pars_fragment>',
          `#include <normalmap_pars_fragment>
          #ifdef USE_NORMALMAP_TANGENTSPACE
            vec3 triplanarNormal(sampler2D tex, vec3 position, vec3 weights, vec3 surface) {
              vec3 nx = terrainSample(tex, position.zy).xyz * 2.0 - 1.0;
              vec3 ny = terrainSample(tex, position.xz).xyz * 2.0 - 1.0;
              vec3 nz = terrainSample(tex, position.xy).xyz * 2.0 - 1.0;
              nx.xy *= normalScale;
              ny.xy *= normalScale;
              nz.xy *= normalScale;
              return (getTangentFrame(-vViewPosition, surface, position.zy) * nx) * weights.x +
                (getTangentFrame(-vViewPosition, surface, position.xz) * ny) * weights.y +
                (getTangentFrame(-vViewPosition, surface, position.xy) * nz) * weights.z;
            }
          #endif`,
        )
        .replace(
          '#include <map_fragment>',
          `
          #ifdef USE_MAP
            vec3 rockWeights = pow(abs(normalize(vTerrainNormal)), vec3(4.0));
            rockWeights /= max(dot(rockWeights, vec3(1.0)), 0.0001);
            vec3 rockPosition = vTerrainPosition / 3.0;
            // Top-down UVs stretch into vertical streaks on cut walls; project soil there too.
            float wall = 1.0 - smoothstep(0.9, 0.99, rockWeights.y);
            vec4 gravelColor = triplanarSample(map, rockPosition, rockWeights);
            vec4 grassColor = groundSample(grassMap, vMapUv * 2.0);
            vec4 soilColor = groundSample(soilMap, vMapUv * 2.0);
            if (wall > 0.0)
              soilColor = mix(soilColor, triplanarSample(soilMap, rockPosition, rockWeights), wall);
            float patches = terrainNoise(vMapUv * 0.45);
            // Recolor the gray scan as weathered tan cut-bank material, keeping its detail.
            float rockLuma = dot(gravelColor.rgb, vec3(0.2126, 0.7152, 0.0722));
            gravelColor.rgb = vec3(0.62, 0.5, 0.37) * rockLuma * 2.4;
            float rockCoverage = smoothstep(0.55, 0.95, vVegetation.y + (patches - 0.5) * 0.35) * 0.75;
            gravelColor = mix(soilColor, gravelColor, rockCoverage);
            float detail = terrainNoise(vMapUv * 6.0);
            vec2 landscapeUV = vTerrainPosition.xz * 0.012;
            float landscape = terrainNoise(landscapeUV) * 0.65 +
              terrainNoise(landscapeUV * 2.7 + vec2(17.3, 9.1)) * 0.35;
            float dryness = smoothstep(0.45, 0.8, landscape + (patches - 0.5) * 0.15);
            float edge = (detail - 0.5) * 0.65 + (patches - 0.5) * 0.8;
            // Packed brown dirt verge along the road, with a ragged edge into grass/rock.
            float verge = 1.0 - smoothstep(2.5, 5.0, vVegetation.x + edge * 1.5);
            gravelColor.rgb = mix(gravelColor.rgb, roadDirt(soilColor.rgb), verge);
            float bankNoise = terrainNoise(vTerrainPosition.xz * 0.09) * 0.6 +
              terrainNoise(vTerrainPosition.xz * 0.31 + vec2(5.2, 1.7)) * 0.4;
            float slopeGrass = 1.0 - smoothstep(0.62, 1.05, vVegetation.y + (bankNoise - 0.5) * 0.45);
            float exposed = smoothstep(0.55, 0.72, landscape + (patches - 0.5) * 0.4);
            float coverage = (1.0 - verge) * slopeGrass * (1.0 - exposed * 0.25);
            float grassLuma = dot(grassColor.rgb, vec3(0.2126, 0.7152, 0.0722));
            grassColor.rgb = mix(vec3(grassLuma), grassColor.rgb, 0.65);
            grassColor.rgb *= mix(vec3(0.78, 0.9, 0.88), vec3(1.0, 0.92, 0.8), dryness);
            gravelColor.rgb *= mix(0.84, 1.04, landscape);
            diffuseColor *= mix(gravelColor, grassColor, coverage);
          #endif
        `,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `float roughnessFactor = roughness;
          #ifdef USE_ROUGHNESSMAP
            float rockRoughness = triplanarSample(roughnessMap, rockPosition, rockWeights).g;
            float groundRoughness = mix(terrainSample(soilRoughnessMap, vMapUv * 2.0).g,
              rockRoughness, rockCoverage);
            roughnessFactor *= mix(groundRoughness,
              terrainSample(grassRoughnessMap, vMapUv * 2.0).g, coverage);
          #endif`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#ifdef USE_NORMALMAP_TANGENTSPACE
            vec3 rockNormal = triplanarNormal(normalMap, rockPosition, rockWeights, normal);
            vec3 grassN = terrainSample(grassNormalMap, vNormalMapUv * 2.0).xyz * 2.0 - 1.0;
            vec3 soilN = terrainSample(soilNormalMap, vNormalMapUv * 2.0).xyz * 2.0 - 1.0;
            float detailFade = 1.0 - terrainFar() * 0.85;
            grassN.xy *= normalScale * detailFade;
            soilN.xy *= normalScale * detailFade;
            vec3 soilNormal = tbn * soilN;
            if (wall > 0.0)
              soilNormal = mix(soilNormal,
                triplanarNormal(soilNormalMap, rockPosition, rockWeights, normal), wall);
            vec3 groundNormal = mix(soilNormal, rockNormal, rockCoverage);
            normal = normalize(mix(groundNormal, tbn * grassN, coverage));
          #endif`,
        );
    };
    material.customProgramCacheKey = () => 'scanned-terrain-triplanar';
    material.addEventListener('dispose', () => {
      grassMap?.dispose();
      grassNormalMap?.dispose();
      grassRoughnessMap?.dispose();
      soilMap?.dispose();
      soilNormalMap?.dispose();
      soilRoughnessMap?.dispose();
    });
    material.vertexColors = true;
    material.polygonOffset = true;
    material.polygonOffsetFactor = 2;
    material.polygonOffsetUnits = 2;
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    const bladeGeometry = new THREE.BufferGeometry();
    bladeGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [
          -0.025, 0, 0, 0.025, 0, 0, 0.035, 0.22, 0.025, 0, 0, -0.025, 0, 0, 0.025, -0.025, 0.18,
          0.03,
        ],
        3,
      ),
    );
    bladeGeometry.computeVertexNormals();
    const bladeMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 1,
      side: THREE.DoubleSide,
    });
    // Keep upright blades from flaring under headlights or grazing sunset light.
    bladeMaterial.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <lights_fragment_begin>',
        THREE.ShaderChunk.lights_fragment_begin
          .replace(
            'getSpotLightInfo( spotLight, geometryPosition, directLight );',
            'getSpotLightInfo( spotLight, geometryPosition, directLight );\ndirectLight.color *= 0.05;',
          )
          .replace(
            'getDirectionalLightInfo( directionalLight, directLight );',
            `getDirectionalLightInfo( directionalLight, directLight );
          directLight.color *= mix(0.12, 1.0, smoothstep(0.12, 0.5,
            dot(directionalLight.direction, normalize(mat3(viewMatrix) * vec3(0.0, 1.0, 0.0)))));`,
          ),
      );
    };
    bladeMaterial.customProgramCacheKey = () => 'grass-soft-low-angle-lights';
    let grassSeed = 18473;
    const random = () => {
      grassSeed = (grassSeed + 0x6d2b79f5) | 0;
      let value = Math.imul(grassSeed ^ (grassSeed >>> 15), 1 | grassSeed);
      value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
    const placements: { x: number; z: number; blades: number }[] = [];
    for (let z = 1; z < this.rows - 1; z++) {
      for (let x = 1; x < this.columns - 1; x++) {
        const i = z * this.columns + x;
        if (
          roadDistances[i] > 3.4 &&
          roadDistances[i] < 10 &&
          vegetation[i * 2 + 1] < 0.6 &&
          random() < 0.44
        ) {
          const px = this.minX + (x + random() - 0.5) * this.spacing;
          const pz = this.minZ + (z + random() - 0.5) * this.spacing;
          const distance =
            this.padRadius !== undefined
              ? Math.hypot(px, pz) - this.padRadius
              : this.nearest(px, pz).distance - this.halfWidth;
          if (distance > 3.4 && distance < 10) {
            placements.push({ x: px, z: pz, blades: 3 + Math.floor(random() * 6) });
          }
        }
      }
    }
    const tufts = new THREE.InstancedMesh(
      bladeGeometry,
      bladeMaterial,
      placements.reduce((count, tuft) => count + tuft.blades, 0),
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
    this.grass = tufts;
  }

  private nearest(x: number, z: number) {
    return this.surface.nearest(x, z);
  }

  contains(x: number, z: number) {
    return (
      x >= this.minX &&
      z >= this.minZ &&
      x < this.minX + (this.columns - 1) * this.spacing &&
      z < this.minZ + (this.rows - 1) * this.spacing
    );
  }

  heightAt(x: number, z: number) {
    return heightAt(this, x, z);
  }

  normalAt(x: number, z: number) {
    return normalAt(this, x, z);
  }

  isAsphalt(position: THREE.Vector3) {
    return this.surface.isAsphalt(position);
  }

  physicsData(): TerrainQueryData {
    const {
      spacing,
      columns,
      rows,
      minX,
      minZ,
      heights,
      minHeight,
      maxHeight,
      flippedCells,
      warpedCells,
      warpedVertices,
      segments,
      halfWidth,
      padRadius,
    } = this;
    return {
      spacing,
      columns,
      rows,
      minX,
      minZ,
      heights,
      minHeight,
      maxHeight,
      flippedCells,
      warpedCells,
      warpedVertices,
      segments,
      halfWidth,
      padRadius,
    };
  }

  // Split paint and pavement at the heightfield's triangle edges, avoiding
  // terrain poking through a ribbon that spans differently triangulated cells.
  projectGeometry(source: THREE.BufferGeometry, lift: number) {
    const positions: number[] = [];
    const uv: number[] = [];
    const attribute = source.getAttribute('position');
    const index = source.getIndex();
    // Optional per-vertex scalar (e.g. distance across a road ribbon), interpolated onto clipped pieces.
    const sourceLateral = source.getAttribute('lateral');
    const lateral: number[] = [];
    function clip(polygon: Point[], a: Point, b: Point) {
      const side = (p: Point) => (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
      const result: Point[] = [];
      for (let i = 0; i < polygon.length; i++) {
        const p = polygon[i];
        const q = polygon[(i + 1) % polygon.length];
        const dp = side(p);
        const dq = side(q);
        if (dp >= 0) result.push(p);
        if (dp < 0 !== dq < 0) {
          const t = dp / (dp - dq);
          result.push({ x: p.x + t * (q.x - p.x), z: p.z + t * (q.z - p.z) });
        }
      }
      return result;
    }
    for (let i = 0; i < (index?.count ?? attribute.count); i += 3) {
      const vertices = [0, 1, 2].map((j) => (index ? index.getX(i + j) : i + j));
      const triangle = vertices.map((v) => ({ x: attribute.getX(v), z: attribute.getZ(v) }));
      const [a, b, c] = triangle;
      const area = (b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z);
      const lateralAt = (p: Point) => {
        if (!sourceLateral || !area) return 0;
        const wb = ((p.x - a.x) * (c.z - a.z) - (c.x - a.x) * (p.z - a.z)) / area;
        const wc = ((b.x - a.x) * (p.z - a.z) - (p.x - a.x) * (b.z - a.z)) / area;
        const [la, lb, lc] = vertices.map((v) => sourceLateral.getX(v));
        return la + (lb - la) * wb + (lc - la) * wc;
      };
      const minX = Math.floor((Math.min(...triangle.map((p) => p.x)) - this.minX) / this.spacing);
      const maxX = Math.floor((Math.max(...triangle.map((p) => p.x)) - this.minX) / this.spacing);
      const minZ = Math.floor((Math.min(...triangle.map((p) => p.z)) - this.minZ) / this.spacing);
      const maxZ = Math.floor((Math.max(...triangle.map((p) => p.z)) - this.minZ) / this.spacing);
      // Warped cells can reach into the neighbors of the triangle's bounding cells.
      const pad = this.warpedCells ? 1 : 0;
      for (let z = Math.max(minZ - pad, 0); z <= Math.min(maxZ + pad, this.rows - 2); z++) {
        for (let x = Math.max(minX - pad, 0); x <= Math.min(maxX + pad, this.columns - 2); x++) {
          const corners = cellTriangles(this, x, z);
          for (const cell of [
            [corners[0], corners[2], corners[1]],
            [corners[3], corners[5], corners[4]],
          ]) {
            const points = cell.map((i) => vertexPosition(this, i));
            let polygon = triangle;
            for (let edge = 0; edge < 3 && polygon.length; edge++)
              polygon = clip(polygon, points[edge], points[(edge + 1) % 3]);
            for (let j = 1; j < polygon.length - 1; j++) {
              for (const p of [polygon[0], polygon[j], polygon[j + 1]]) {
                positions.push(p.x, triangleHeight(this, cell, p.x, p.z)! + lift, p.z);
                uv.push(p.x / 5, p.z / 5);
                if (sourceLateral) lateral.push(lateralAt(p));
              }
            }
          }
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    if (sourceLateral)
      geometry.setAttribute('lateral', new THREE.Float32BufferAttribute(lateral, 1));
    geometry.computeVertexNormals();
    return geometry;
  }
}

/**
 * Smooth inverse-distance interpolation of course heights on a coarse grid, so
 * terrain away from an imported track follows its real elevation trend.
 */
function profileSurroundings(samples: { x: number; z: number; height: number }[]) {
  const stride = Math.max(1, Math.round(samples.length / 400));
  const sparse = samples.filter((_, i) => i % stride === 0);
  const cell = 12;
  const bounds = new THREE.Box2();
  sparse.forEach(({ x, z }) => bounds.expandByPoint(new THREE.Vector2(x, z)));
  bounds.expandByScalar(300);
  const columns = Math.ceil((bounds.max.x - bounds.min.x) / cell) + 1;
  const rows = Math.ceil((bounds.max.y - bounds.min.y) / cell) + 1;
  const grid = new Float32Array(columns * rows);
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const x = bounds.min.x + column * cell;
      const z = bounds.min.y + row * cell;
      let total = 0;
      let weights = 0;
      for (const sample of sparse) {
        const weight = 1 / ((x - sample.x) ** 2 + (z - sample.z) ** 2 + 40 ** 2);
        total += sample.height * weight;
        weights += weight;
      }
      grid[row * columns + column] = total / weights;
    }
  }
  return (x: number, z: number) => {
    const gx = THREE.MathUtils.clamp((x - bounds.min.x) / cell, 0, columns - 1.000001);
    const gz = THREE.MathUtils.clamp((z - bounds.min.y) / cell, 0, rows - 1.000001);
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const i = iz * columns + ix;
    const top = THREE.MathUtils.lerp(grid[i], grid[i + 1], gx - ix);
    const bottom = THREE.MathUtils.lerp(grid[i + columns], grid[i + columns + 1], gx - ix);
    return THREE.MathUtils.lerp(top, bottom, gz - iz);
  };
}

const contourCorridor = 20;
// Raster walls beside the road need a transition about as wide as they are tall, or the
// climb squeezes into a crease at their foot, so the transition grows with the wall up to
// the course's `terrainTransition`. Much wider blends could reach past the midpoint between
// switchback legs, where the nearest road and its height change.
export const defaultTerrainTransition = 8;
export const minTerrainTransition = 3;

/** Whether each of a cell's diagonals (unflipped, flipped) yields two upright triangles. */
function cellSplits(positions: Float32Array, a: number, b: number, c: number, d: number) {
  const upright = (p: number, q: number, r: number) =>
    (positions[q * 3] - positions[p * 3]) * (positions[r * 3 + 2] - positions[p * 3 + 2]) -
      (positions[r * 3] - positions[p * 3]) * (positions[q * 3 + 2] - positions[p * 3 + 2]) <
    -0.01;
  return [upright(a, c, b) && upright(b, c, d), upright(a, c, d) && upright(a, d, b)];
}

/** Whether each split of `cellSplits` joins a pavement vertex to one beyond its edge. */
function cellLifts(roadDistances: Float32Array, a: number, b: number, c: number, d: number) {
  const lifts = (...corners: number[]) =>
    corners.some((i) => roadDistances[i] < -1e-3) && corners.some((i) => roadDistances[i] > 1e-3);
  return [lifts(a, b, c) || lifts(b, c, d), lifts(a, c, d) || lifts(a, d, b)];
}

/**
 * A fixed diagonal turns roadside walls crossing it into sawtooth facets. Near the road,
 * split each cell along the diagonal whose corners differ least, following the wall's
 * contours. Snapped cells whose other diagonal would fold or collapse a triangle keep the
 * upright one. Otherwise no triangle may join a vertex on the pavement to one beyond its
 * edge, which would lift the pavement, and diagonals along a snap line are preferred so the
 * wall's profile stays consistent along the road.
 */
function flipCellsAlongContours(
  heights: Float32Array,
  roadDistances: Float32Array,
  columns: number,
  rows: number,
  positions: Float32Array,
) {
  const flipped = new Uint8Array((columns - 1) * (rows - 1));
  for (let z = 0; z < rows - 1; z++) {
    for (let x = 0; x < columns - 1; x++) {
      const a = z * columns + x;
      const b = a + 1;
      const c = a + columns;
      const d = c + 1;
      const near = Math.min(roadDistances[a], roadDistances[b], roadDistances[c], roadDistances[d]);
      const far = Math.max(roadDistances[a], roadDistances[b], roadDistances[c], roadDistances[d]);
      const [keep, flip] = cellSplits(positions, a, b, c, d);
      const [liftKeep, liftFlip] = cellLifts(roadDistances, a, b, c, d);
      const alongKeep = Math.abs(roadDistances[b] - roadDistances[c]) < 1e-3;
      const alongFlip = Math.abs(roadDistances[a] - roadDistances[d]) < 1e-3;
      if (flip !== keep) flipped[z * (columns - 1) + x] = Number(flip);
      else if (far > 1e-3 && near <= contourCorridor)
        flipped[z * (columns - 1) + x] = Number(
          liftKeep !== liftFlip
            ? liftKeep
            : alongKeep !== alongFlip
              ? alongFlip
              : Math.abs(heights[b] - heights[c]) > Math.abs(heights[a] - heights[d]),
        );
    }
  }
  return flipped;
}
