import * as THREE from 'three';
import { vegetationTexture } from './vegetation-models';
import pine from './vegetation-assets/pine-preview.json';
import oak from './vegetation-assets/oak-preview.json';
import aspen from './vegetation-assets/aspen-preview.json';
import bushPine from './vegetation-assets/bush-pine-preview.json';
import bushAsh from './vegetation-assets/bush-ash-preview.json';
import bushAspen from './vegetation-assets/bush-aspen-preview.json';
import pineUrl from './vegetation-assets/pine.png';
import oakUrl from './vegetation-assets/oak.png';
import aspenUrl from './vegetation-assets/aspen.png';
import ashUrl from './vegetation-assets/ash.png';
import barkUrl from './vegetation-assets/bark.jpg';
import aspenBarkUrl from './vegetation-assets/aspen-bark.jpg';

const guides = { pine, oak, aspen, bushPine, bushAsh, bushAspen };
type Species = keyof typeof guides;
type Mode = 'performance' | 'quality';
type Parts = { branches: THREE.BufferGeometry; leaves: THREE.BufferGeometry };
const speciesList = Object.keys(guides) as Species[];
const heights = { pine: 15, oak: 10, aspen: 14, bushPine: 1.5, bushAsh: 1.5, bushAspen: 1.5 };
const radii = { pine: 3.2, oak: 3.8, aspen: 2.8, bushPine: 1.2, bushAsh: 1.2, bushAspen: 1.2 };
const leafUrls = {
  pine: pineUrl,
  oak: oakUrl,
  aspen: aspenUrl,
  bushPine: pineUrl,
  bushAsh: ashUrl,
  bushAspen: aspenUrl,
};

function isTreeLOD(object: THREE.Object3D): object is THREE.LOD {
  return (
    'isLOD' in object &&
    object.isLOD === true &&
    (object.userData.vegetationKind === 'trees' || object.userData.vegetationKind === 'bush')
  );
}

function isInstancedMesh(object: THREE.Object3D): object is THREE.InstancedMesh {
  return 'isInstancedMesh' in object && object.isInstancedMesh === true;
}

export async function generatePreviewTrees(mode: Mode, foliageSize: number) {
  const { Tree } = await import('@dgreenheck/ez-tree');
  const models = {} as Record<Species, Parts>;
  for (const species of speciesList) {
    const tree = new Tree();
    Object.assign(tree.options, structuredClone(guides[species]));
    tree.options.bark.textured = false;
    const { branch, leaves } = tree.options;
    if (mode === 'performance') {
      branch.sections[0] = 5;
      branch.segments[0] = 6;
      for (const level of [1, 2, 3] as const) {
        branch.sections[level] = Math.min(4, branch.sections[level]);
        branch.segments[level] = 3;
      }
      if (species === 'pine') {
        branch.children[0] = 40;
        leaves.count = 12;
        leaves.size *= 1.4;
      } else if (species === 'oak') {
        branch.children[0] = 4;
        branch.children[1] = 3;
        branch.children[2] = 2;
        leaves.count = 10;
        leaves.size *= 1.3;
      } else if (species === 'aspen') {
        branch.children[0] = 10;
        branch.children[1] = 3;
        leaves.count = 8;
        leaves.size *= 1.3;
      } else {
        branch.children[0] = Math.min(5, branch.children[0]);
        branch.children[1] = Math.min(3, branch.children[1]);
        branch.children[2] = Math.min(2, branch.children[2]);
        leaves.count = Math.min(6, leaves.count);
        leaves.size *= 1.3;
      }
    }
    leaves.size *= foliageSize;
    tree.generate();
    const parts = {
      branches: tree.branchesMesh.geometry,
      leaves: tree.leavesMesh.geometry,
    };
    const box = new THREE.Box3();
    for (const geometry of Object.values(parts)) {
      geometry.computeBoundingBox();
      box.union(geometry.boundingBox!);
    }
    const vertical = heights[species] / (box.max.y - box.min.y);
    const radius = Math.max(
      Math.abs(box.min.x),
      Math.abs(box.max.x),
      Math.abs(box.min.z),
      Math.abs(box.max.z),
    );
    const horizontal = Math.min(vertical, radii[species] / radius);
    for (const geometry of Object.values(parts)) {
      geometry.translate(0, -box.min.y, 0).scale(horizontal, vertical, horizontal);
    }
    for (const mesh of [tree.branchesMesh, tree.leavesMesh]) {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material) => material.dispose());
    }
    models[species] = parts;
  }
  return models;
}

function mixSpecies(scene: THREE.Scene) {
  const sources: { lod: THREE.LOD; variants: Species[] }[] = [];
  let hasAspens = false,
    hasBushes = false;
  scene.traverse((object) => {
    if (!isTreeLOD(object)) return;
    if (object.userData.treeSpecies === 'oak')
      sources.push({ lod: object, variants: ['oak', 'aspen'] });
    if (object.userData.vegetationKind === 'bush')
      sources.push({ lod: object, variants: ['bushPine', 'bushAsh', 'bushAspen'] });
    if (object.userData.treeSpecies === 'aspen') hasAspens = true;
    if (object.userData.treeSpecies === 'bushPine') hasBushes = true;
  });
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  let bushOffset = 0;
  for (const { lod: source, variants: species } of sources) {
    if (source.userData.vegetationKind === 'trees' ? hasAspens : hasBushes) continue;
    const variants =
      source.userData.vegetationKind === 'bush'
        ? species.map((_, index) => species[(index + bushOffset) % species.length])
        : species;
    if (source.userData.vegetationKind === 'bush') bushOffset = (bushOffset + 1) % species.length;
    const copies = variants.slice(1).map((species) => {
      const lod = new THREE.LOD();
      lod.name = source.name;
      lod.position.copy(source.position);
      lod.userData = { ...source.userData, treeSpecies: species };
      return lod;
    });
    for (const level of source.levels) {
      const groups = copies.map(() => new THREE.Group());
      for (const mesh of level.object.children) {
        if (!isInstancedMesh(mesh)) continue;
        const total = mesh.count;
        const copyInstances = (target: THREE.InstancedMesh, offset: number) => {
          let count = 0;
          for (let i = offset; i < total; i += variants.length) {
            mesh.getMatrixAt(i, matrix);
            target.setMatrixAt(count, matrix);
            if (mesh.instanceColor) {
              mesh.getColorAt(i, color);
              target.setColorAt(count, color);
            }
            count++;
          }
          target.count = count;
          target.instanceMatrix.needsUpdate = true;
          if (target.instanceColor) target.instanceColor.needsUpdate = true;
          target.computeBoundingSphere();
        };
        for (const [index, group] of groups.entries()) {
          const count = Math.max(0, Math.ceil((total - index - 1) / variants.length));
          if (!count) continue;
          const clone = new THREE.InstancedMesh(mesh.geometry, mesh.material, count);
          clone.name = mesh.name;
          clone.position.copy(mesh.position);
          clone.castShadow = mesh.castShadow;
          clone.receiveShadow = mesh.receiveShadow;
          copyInstances(clone, index + 1);
          group.add(clone);
        }
        copyInstances(mesh, 0);
      }
      copies.forEach((lod, index) => lod.addLevel(groups[index], level.distance, level.hysteresis));
    }
    source.userData.treeSpecies = variants[0];
    copies.forEach((lod) => source.parent!.add(lod));
  }
}

export function installTreeStylePreview(scene: THREE.Scene, reportError: (error: unknown) => void) {
  // A repeated install must retain the current resource ownership and event handlers.
  const previous = document.querySelector<HTMLElement>('#tree-style-preview');
  if (previous) {
    previous.dispatchEvent(new Event('coursechange'));
    return previous;
  }
  const detailSection = document.querySelector('#vegetation-detail')?.closest('section');
  if (!detailSection) throw new Error('Vegetation settings are not available');
  const field = document.createElement('div');
  field.className = 'field';
  field.id = 'tree-style-preview';
  field.innerHTML = `
    <label for="tree-style">Developer vegetation</label>
    <p id="tree-style-description">Your pine, oak, aspen and three bush guides.
      Shared meshes, no baking. Preview trees draw to 250 m and bushes to 125 m;
      old distant images are disabled.</p>
    <select id="tree-style" aria-describedby="tree-style-description">
      <option value="performance">Performance</option>
      <option value="quality">Quality</option>
    </select>
    <label for="tree-foliage-size">Foliage cluster size</label>
    <input id="tree-foliage-size" type="range" min="0.8" max="1.6" step="0.1" value="1" />
    <output id="tree-style-budget" role="status"></output>`;
  const section = document.createElement('section');
  section.className = 'illustrated-setting';
  section.append(field);
  detailSection.after(section);
  const select = field.querySelector<HTMLSelectElement>('#tree-style')!;
  const size = field.querySelector<HTMLInputElement>('#tree-foliage-size')!;
  const budget = field.querySelector<HTMLOutputElement>('#tree-style-budget')!;
  let generated: Record<Species, Parts> | undefined;
  let distant: Record<Species, Parts> | undefined;
  const materials: Partial<Record<Species, { branches: THREE.Material; leaves: THREE.Material }>> =
    {};
  let resources: THREE.Group | undefined;

  async function change() {
    if (select.disabled) return;
    select.disabled = size.disabled = true;
    budget.textContent = 'Generating shared tree models…';
    let next: Record<Species, Parts> | undefined;
    let nextDistant: Record<Species, Parts> | undefined;
    try {
      const mode = select.value;
      if (mode !== 'performance' && mode !== 'quality')
        throw new Error(`Unknown tree mode: ${mode}`);
      const parent = scene.getObjectByName('vegetation-resources');
      if (!parent) throw new Error('This course has no detailed vegetation to preview');
      if (resources?.parent !== parent) {
        resources = undefined;
        generated = undefined;
      }
      next = await generatePreviewTrees(mode, Number(size.value));
      nextDistant =
        mode === 'performance'
          ? next
          : await generatePreviewTrees('performance', Number(size.value));
      mixSpecies(scene);
      if (!resources) {
        resources = new THREE.Group();
        resources.visible = false;
        resources.name = 'tree-preview-resources';
        parent.add(resources);
        const bark = vegetationTexture(barkUrl);
        const aspenBark = vegetationTexture(aspenBarkUrl);
        for (const texture of [bark, aspenBark])
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        const textures = new Map<string, THREE.Texture>();
        for (const species of speciesList) {
          const url = leafUrls[species];
          if (!textures.has(url)) textures.set(url, vegetationTexture(url));
          materials[species] = {
            branches: new THREE.MeshStandardMaterial({
              map: species === 'aspen' ? aspenBark : bark,
              color: species.startsWith('bush') ? 13552830 : 0xffffff,
              roughness: 1,
            }),
            leaves: new THREE.MeshStandardMaterial({
              map: textures.get(url),
              color: guides[species].leaves.tint,
              alphaTest: guides[species].leaves.alphaTest,
              side: THREE.DoubleSide,
              forceSinglePass: true,
              roughness: 1,
            }),
          };
        }
      }
      scene.traverse((object) => {
        if (!isTreeLOD(object)) return;
        const species =
          object.userData.treeSpecies === 'fir'
            ? 'pine'
            : speciesList.find((s) => s === object.userData.treeSpecies);
        object.userData.previewMeshes = true;
        object.levels[2].distance = Math.min(
          object.levels[2].distance,
          object.userData.vegetationKind === 'trees' ? 250 : 125,
        );
        const far = object.levels[1].object;
        if (!far.userData.previewMeshes) {
          far.clear();
          for (const mesh of object.levels[0].object.children) far.add(mesh.clone());
          far.userData.previewMeshes = true;
        }
        far.traverse((mesh) => {
          if (!isInstancedMesh(mesh)) return;
          mesh.castShadow = false;
          if (species) {
            const part = mesh.name === 'tree-trunks' ? 'branches' : 'leaves';
            mesh.geometry = nextDistant![species][part];
            mesh.material = materials[species]![part];
            mesh.computeBoundingSphere();
          }
        });
        if (!species) return;
        object.levels[0].object.traverse((mesh) => {
          if (!isInstancedMesh(mesh)) return;
          const part = mesh.name === 'tree-trunks' ? 'branches' : 'leaves';
          mesh.geometry = next![species][part];
          mesh.material = materials[species]![part];
          mesh.computeBoundingSphere();
        });
      });
      resources.clear();
      for (const species of speciesList) {
        for (const part of ['branches', 'leaves'] as const) {
          resources.add(new THREE.Mesh(next[species][part], materials[species]![part]));
          resources.add(new THREE.Mesh(nextDistant[species][part], materials[species]![part]));
        }
      }
      if (generated)
        for (const parts of Object.values(generated)) {
          Object.values(parts).forEach((geometry) => geometry.dispose());
        }
      if (distant && distant !== generated) {
        for (const parts of Object.values(distant))
          Object.values(parts).forEach((geometry) => geometry.dispose());
      }
      generated = next;
      distant = nextDistant;
      budget.textContent = Object.entries(next)
        .map(([species, parts]) => {
          const count = Object.values(parts).reduce(
            (sum, geometry) => sum + geometry.index!.count / 3,
            0,
          );
          return `${species}: ${count.toLocaleString()} triangles`;
        })
        .join(' · ');
    } catch (error) {
      if (next && next !== generated) {
        for (const parts of Object.values(next))
          Object.values(parts).forEach((geometry) => geometry.dispose());
      }
      if (nextDistant && nextDistant !== next && nextDistant !== distant) {
        for (const parts of Object.values(nextDistant))
          Object.values(parts).forEach((geometry) => geometry.dispose());
      }
      budget.textContent = 'Tree preview failed. See the error notification.';
      reportError(error);
    } finally {
      select.disabled = size.disabled = false;
    }
  }
  select.addEventListener('change', change);
  size.addEventListener('change', change);
  function applyToCourse() {
    if (scene.getObjectByName('vegetation-resources')) void change();
    else budget.textContent = 'Load a mapped course to preview vegetation.';
  }
  field.addEventListener('coursechange', applyToCourse);
  applyToCourse();
  return field;
}
