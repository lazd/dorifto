import * as THREE from 'three';

const terrainAssets = { rock: 'Rock030', gravel: 'Ground037', grass: 'Grass004' } as const;
type TerrainSurface = keyof typeof terrainAssets;
const terrainMaps = new Map<TerrainSurface, THREE.Texture[]>();

/** Value noise and the roadside dirt tint shared by the terrain and asphalt shaders. */
export const terrainNoiseGlsl = `
  // Sine-free hash: stays random at large world coordinates where fract(sin()) degenerates.
  vec4 terrainHash(vec2 p) {
    vec4 p4 = fract(vec4(p.xyxy) * vec4(0.1031, 0.103, 0.0973, 0.1099));
    p4 += dot(p4, p4.wzxy + 33.33);
    return fract((p4.xxyz + p4.yzzw) * p4.zywx);
  }
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
  }
  vec3 roadDirt(vec3 soil) {
    return dot(soil, vec3(0.2126, 0.7152, 0.0722)) * vec3(0.78, 0.53, 0.34);
  }
`;

export async function loadTerrainSurfaces() {
  const loader = new THREE.TextureLoader();
  const loaded = await Promise.all(
    Object.entries(terrainAssets).map(async ([surface, asset]) => {
      const maps = await Promise.all(
        ['Color', 'NormalGL', 'Roughness'].map(async (map) => {
          const texture = await loader.loadAsync(
            `${import.meta.env.BASE_URL}terrain/${asset}_${map}.jpg`,
          );
          texture.colorSpace = map === 'Color' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
          texture.anisotropy = 8;
          return texture;
        }),
      );
      return { surface: surface as TerrainSurface, maps };
    }),
  );
  for (const { surface, maps } of loaded) terrainMaps.set(surface, maps);
}

/** Per-course switch for the dirt washed onto road surfaces. */
export type RoadDirtVisibility = { value: number };

/**
 * Washes dirt inward over a road surface material from `outerEdge` (distance from the
 * centerline). Its ragged edge always reaches at least `minReach` inward (past the pavement edge)
 * and drifts up to `maxReach`, with crumbs clinging to it and pebbles scattered beyond. Geometry
 * carries a signed `lateral` distance from the road centerline and optionally a `structure`
 * weight (1 on bridges and in tunnels, which stay clean). Asphalt, paint, and kerbs share it so
 * one continuous spill crosses them all. Returns false without scanned soil (headless builds).
 */
export function addRoadDirt(
  material: THREE.MeshStandardMaterial,
  outerEdge: number,
  minReach: number,
  maxReach: number,
  visible: RoadDirtVisibility,
) {
  const soil = terrainMaps.get('gravel')?.[0];
  if (!soil) return false;
  material.defines = {
    ...material.defines,
    DIRT_EDGE: outerEdge.toFixed(3),
    DIRT_MIN: minReach.toFixed(3),
    DIRT_MAX: maxReach.toFixed(3),
    DIRT_FEATHER: '0.14',
  };
  const compile = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.onBeforeCompile = function (shader, renderer) {
    compile.call(this, shader, renderer);
    shader.uniforms.roadDirtMap = { value: soil };
    shader.uniforms.roadDirtVisible = visible;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float lateral;
        attribute float structure;
        varying float vLateral;
        varying float vStructure;
        varying vec2 vDirtWorld;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vLateral = lateral;
        vStructure = structure;
        vDirtWorld = (modelMatrix * vec4(transformed, 1.0)).xz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D roadDirtMap;
        uniform float roadDirtVisible;
        varying float vLateral;
        varying float vStructure;
        varying vec2 vDirtWorld;
        ${terrainNoiseGlsl}`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        vec2 roadWorld = vDirtWorld;
        float edgeDistance = DIRT_EDGE - abs(vLateral);
        float drift = terrainNoise(roadWorld * 0.35) * 0.8 +
          terrainNoise(roadWorld * 1.4 + vec2(4.7, 1.3)) * 0.2;
        float ragged = (terrainNoise(roadWorld * 7.0) - 0.5) * 0.06 +
          (terrainNoise(roadWorld * 23.0 + vec2(9.2, 3.4)) - 0.5) * 0.02;
        float reach = DIRT_MIN + 0.15 + drift * drift * (DIRT_MAX - DIRT_MIN - 0.15) + ragged;
        float aa = max(fwidth(edgeDistance), DIRT_FEATHER);
        float cover = 1.0 - smoothstep(reach - aa - 0.03, reach + aa, edgeDistance);
        float beyond = edgeDistance - reach;
        // Crumbs cling to the edge, thinning out within ~30 cm.
        float crumbNoise = terrainNoise(roadWorld * 30.0) * 0.6 +
          terrainNoise(roadWorld * 70.0 + vec2(2.3, 8.1)) * 0.4;
        float crumbThreshold = 0.52 + smoothstep(0.0, 0.3, beyond) * 0.48;
        float crumbWidth = fwidth(crumbNoise) + 0.01;
        float clumps = smoothstep(crumbThreshold - crumbWidth, crumbThreshold + crumbWidth,
          crumbNoise);
        // Pebbles: at most one jittered stone per 12 cm cell, scattered up to ~1 m beyond the edge.
        float scatter = 1.0 - smoothstep(-0.1, 1.0, beyond);
        vec2 pebbleCell = floor(roadWorld * 8.0);
        vec4 ph = terrainHash(pebbleCell);
        vec2 pebbleOffset = (fract(roadWorld * 8.0) - 0.5 - (ph.xy - 0.5) * 0.5) / 8.0;
        float pebbleRadius = mix(0.008, 0.032, ph.z * ph.z) *
          (0.75 + 0.5 * terrainNoise(roadWorld * 160.0));
        float pebbleWidth = fwidth(roadWorld.x) * 0.7;
        float pebble = step(ph.w, 0.5 * scatter * scatter) *
          (1.0 - smoothstep(pebbleRadius - pebbleWidth, pebbleRadius + pebbleWidth,
            length(pebbleOffset)));
        clumps *= 0.35 * (1.0 - smoothstep(0.0, 0.3, beyond));
        float dirtCover = max(cover, max(pebble, clumps));
        // Fade out past the edge into the terrain's own dirt verge, and as roadside walls curve
        // up from the pavement, where a horizontal fade reads as a line.
        #ifdef FLAT_SHADED
          vec3 dirtNormal = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
        #else
          vec3 dirtNormal = normalize(vNormal);
        #endif
        float flatness = abs(dot(dirtNormal, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz)));
        dirtCover *= (1.0 - smoothstep(0.0, 0.6, -edgeDistance)) *
          smoothstep(0.8, 0.97, flatness + (drift - 0.5) * 0.1) *
          (1.0 - vStructure) * roadDirtVisible;
        // road dirt mask
        vec3 dirt = roadDirt(texture2D(roadDirtMap, roadWorld / 3.0).rgb);
        vec3 stone = mix(vec3(0.2, 0.17, 0.14), vec3(0.42, 0.36, 0.29), ph.w * 2.0) *
          (0.8 + 0.4 * terrainNoise(roadWorld * 90.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, mix(dirt, stone, pebble * 0.85), dirtCover);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 1.0, dirtCover);`,
      );
  };
  material.customProgramCacheKey = () => `${key}-road-dirt`;
  return true;
}

/**
 * Dirt for scenery roads, whose `lateral` is the signed distance to the nearest pavement edge
 * (negative on the pavement) and `mainRoad` the distance outside the course's own pavement.
 */
export function addNearbyRoadDirt(
  material: THREE.MeshStandardMaterial,
  visible: RoadDirtVisibility,
  shoulderWidth = 0.6,
) {
  if (!addRoadDirt(material, 1.8, 1.9, 2.4, visible)) return false;
  material.defines = {
    ...material.defines,
    DIRT_HANDOFF: Math.max(0.01, Math.min(0.6, shoulderWidth)).toFixed(3),
  };
  const compile = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.onBeforeCompile = function (shader, renderer) {
    compile.call(this, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float mainRoad;\nvarying float vMainRoad;',
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMainRoad = mainRoad;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vMainRoad;')
      .replace(
        'float edgeDistance = DIRT_EDGE - abs(vLateral);',
        `float pavementDistance = vLateral;
        float edgeDistance = DIRT_EDGE - pavementDistance;`,
      )
      .replace(
        'float aa = max(fwidth(edgeDistance), DIRT_FEATHER);',
        `float turningSoil = 1.0 - smoothstep(0.0, 6.0, vMainRoad);
reach += turningSoil * 0.45;
float aa = max(fwidth(edgeDistance), DIRT_FEATHER);`,
      )
      .replace(
        '// road dirt mask',
        `dirtCover *= smoothstep(-1.0 - turningSoil * 0.45, -0.65, pavementDistance) *
          smoothstep(-DIRT_HANDOFF, 0.0, vMainRoad);`,
      );
  };
  material.customProgramCacheKey = () => `${key}-nearby`;
  return true;
}

export function surfaceMaterial(surface: 'asphalt' | TerrainSurface, repeats = 1) {
  const scanned = surface === 'asphalt' ? undefined : terrainMaps.get(surface);
  if (scanned) {
    const [map, normalMap, roughnessMap] = scanned.map((texture) => {
      const copy = texture.clone();
      copy.repeat.setScalar(repeats);
      return copy;
    });
    return new THREE.MeshStandardMaterial({
      map,
      normalMap,
      roughnessMap,
      roughness: 1,
      normalScale: new THREE.Vector2(0.75, 0.75),
    });
  }
  // Headless training builds terrain without loading browser-only image assets.
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to create terrain texture');
  const image = context.createImageData(256, 256);
  let seed = 12345;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const patches = Array.from({ length: 64 }, random);
  const patchAt = (x: number, y: number) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const u = THREE.MathUtils.smoothstep(x - ix, 0, 1);
    const v = THREE.MathUtils.smoothstep(y - iy, 0, 1);
    const at = (dx: number, dy: number) => patches[((iy + dy) % 8) * 8 + ((ix + dx) % 8)];
    return THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(at(0, 0), at(1, 0), u),
      THREE.MathUtils.lerp(at(0, 1), at(1, 1), u),
      v,
    );
  };
  const roughness = surface === 'asphalt' ? new Uint8Array(256 * 256 * 4) : undefined;
  for (let i = 0; i < image.data.length; i += 4) {
    const x = (i / 4) % 256;
    const y = Math.floor(i / 4 / 256);
    const patch = patchAt(x / 32, y / 32);
    const grain = random();
    const shade =
      surface === 'asphalt' ? 56 + patch * 5 + grain * 8 : 115 + patch * 22 + grain * 18;
    image.data[i] = shade * (surface === 'grass' ? 0.68 : 1);
    image.data[i + 1] = shade * (surface === 'grass' ? 0.7 : surface === 'asphalt' ? 1.02 : 0.87);
    image.data[i + 2] = shade * (surface === 'grass' ? 0.45 : surface === 'asphalt' ? 1.04 : 0.68);
    image.data[i + 3] = 255;
    if (roughness) {
      const value = Math.round((0.88 + patch * 0.08) * 255);
      roughness[i] = roughness[i + 1] = roughness[i + 2] = value;
      roughness[i + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  if (surface === 'gravel') {
    for (let i = 0; i < 2400; i++) {
      const shade = Math.floor(113 + random() * 30);
      context.fillStyle = `rgb(${shade}, ${Math.floor(shade * 0.9)}, ${Math.floor(shade * 0.74)})`;
      context.beginPath();
      context.ellipse(
        random() * 256,
        random() * 256,
        0.5 + random() * 1.7,
        0.5 + random(),
        random() * Math.PI,
        0,
        Math.PI * 2,
      );
      context.fill();
    }
  }
  if (surface === 'grass') {
    for (let i = 0; i < 9000; i++) {
      const x = random() * 256;
      const y = random() * 256;
      const shade = 80 + random() * 25;
      const dry = random() < 0.45;
      context.strokeStyle = dry
        ? `rgb(${Math.floor(shade)}, ${Math.floor(shade * 0.88)}, ${Math.floor(shade * 0.58)})`
        : `rgb(${Math.floor(shade * 0.7)}, ${Math.floor(shade * 0.85)}, ${Math.floor(shade * 0.48)})`;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + (random() - 0.5) * 3, y - 1 - random() * 4);
      context.stroke();
    }
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.setScalar(repeats);
  map.anisotropy = 8;
  if (roughness) {
    const roughnessMap = new THREE.DataTexture(roughness, 256, 256);
    roughnessMap.flipY = true;
    roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
    roughnessMap.repeat.setScalar(repeats);
    roughnessMap.magFilter = THREE.LinearFilter;
    roughnessMap.minFilter = THREE.LinearMipmapLinearFilter;
    roughnessMap.generateMipmaps = true;
    roughnessMap.anisotropy = 8;
    roughnessMap.needsUpdate = true;
    const material = new THREE.MeshStandardMaterial({
      map,
      bumpMap: map,
      bumpScale: 0.012,
      roughnessMap,
      roughness: 1,
    });
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        #ifdef USE_MAP
          vec3 weathering = texture2D(map, vMapUv * 0.073).rgb;
          float wear = smoothstep(0.035, 0.065, dot(weathering, vec3(0.333333)));
          diffuseColor.rgb *= mix(0.92, 1.08, wear);
        #endif`,
      );
    };
    material.customProgramCacheKey = () => 'asphalt-weathering';
    return material;
  }
  const pixels = context.getImageData(0, 0, 256, 256).data;
  const normals = new Uint8Array(256 * 256 * 4);
  const heightAt = (x: number, y: number) => {
    const i = (((y + 256) % 256) * 256 + ((x + 256) % 256)) * 4;
    return (pixels[i] + pixels[i + 1] + pixels[i + 2]) / (3 * 255);
  };
  const normal = new THREE.Vector3();
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      normal
        .set(
          (heightAt(x - 1, y) - heightAt(x + 1, y)) * 2,
          (heightAt(x, y - 1) - heightAt(x, y + 1)) * 2,
          1,
        )
        .normalize();
      const i = (y * 256 + x) * 4;
      normals[i] = Math.round((normal.x * 0.5 + 0.5) * 255);
      normals[i + 1] = Math.round((normal.y * 0.5 + 0.5) * 255);
      normals[i + 2] = Math.round((normal.z * 0.5 + 0.5) * 255);
      normals[i + 3] = 255;
    }
  }
  const normalMap = new THREE.DataTexture(normals, 256, 256);
  normalMap.flipY = true;
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.repeat.setScalar(repeats);
  normalMap.magFilter = THREE.LinearFilter;
  normalMap.minFilter = THREE.LinearMipmapLinearFilter;
  normalMap.generateMipmaps = true;
  normalMap.anisotropy = 8;
  normalMap.needsUpdate = true;
  return new THREE.MeshStandardMaterial({
    map,
    normalMap,
    normalScale: new THREE.Vector2(0.45, 0.45),
    roughness: 0.96,
  });
}
