import * as THREE from 'three';
import fs from 'fs';
const g = JSON.parse(fs.readFileSync('models/nissan_300zx/scene.gltf'));
const out = [];
function walk(i, parent) {
  const n = g.nodes[i];
  const m = new THREE.Matrix4();
  if (n.matrix) m.fromArray(n.matrix);
  else
    m.compose(
      new THREE.Vector3(...(n.translation || [0, 0, 0])),
      new THREE.Quaternion(...(n.rotation || [0, 0, 0, 1])),
      new THREE.Vector3(...(n.scale || [1, 1, 1])),
    );
  const world = parent.clone().multiply(m);
  if (n.mesh !== undefined) {
    const box = new THREE.Box3();
    for (const p of g.meshes[n.mesh].primitives) {
      const a = g.accessors[p.attributes.POSITION];
      const b = new THREE.Box3(new THREE.Vector3(...a.min), new THREE.Vector3(...a.max));
      box.union(b.applyMatrix4(world));
    }
    out.push({
      name: n.name,
      mesh: n.mesh,
      mat: g.meshes[n.mesh].primitives.map((p) => p.material).join(','),
      box,
    });
  }
  (n.children || []).forEach((c) => walk(c, world));
}
walk(0, new THREE.Matrix4());
const all = new THREE.Box3();
out.forEach((o) => all.union(o.box));
console.log(
  'ALL',
  all.min.toArray().map((v) => v.toFixed(3)),
  all.max.toArray().map((v) => v.toFixed(3)),
);
const all2 = all.clone();
const S = 1 / (all.max.z - all.min.z);
const c = all.getCenter(new THREE.Vector3());
const f = (v) =>
  v
    .clone()
    .sub(c)
    .multiplyScalar(S)
    .toArray()
    .map((x) => x.toFixed(3))
    .join(',');
for (const o of out)
  if (process.argv[2] ? new RegExp(process.argv[2], 'i').test(o.name) : true)
    console.log(o.name.padEnd(42), 'm' + o.mesh, 'mat' + o.mat, f(o.box.min), '|', f(o.box.max));
