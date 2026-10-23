import * as THREE from 'three';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';

export function normalizeCarModel(model: THREE.Object3D) {
  let bounds = new THREE.Box3().setFromObject(model);
  model.scale.setScalar(4.31 / bounds.getSize(new THREE.Vector3()).z);
  bounds = new THREE.Box3().setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  model.position.set(-center.x, -bounds.min.y - 0.55, -center.z);
  model.updateMatrixWorld(true);
}

export function carCorner(box: THREE.Box3) {
  const middle = box.getCenter(new THREE.Vector3());
  return (middle.z > 0 ? 0 : 2) + (middle.x > 0 ? 1 : 0);
}

export function carPhysicsGeometry(model: THREE.Object3D) {
  model.updateMatrixWorld(true);
  const tireBounds = Array.from({ length: 4 }, () => new THREE.Box3());
  const points: THREE.Vector3[] = [];
  for (const x of [-0.86, 0.86]) {
    for (const y of [-0.23, 0.23]) {
      for (const z of [-2.02, 2.02]) points.push(new THREE.Vector3(x, y, z));
    }
  }
  model.traverse((mesh) => {
    if (!(mesh instanceof THREE.Mesh)) return;
    if (mesh.name.startsWith('tyr_')) {
      const box = new THREE.Box3().setFromObject(mesh);
      tireBounds[carCorner(box)].union(box);
    }
    if (/^(Body2|Front|Hood|rbumper|Wing)_Paint_0$/.test(mesh.name)) {
      const positions = mesh.geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        const point = new THREE.Vector3()
          .fromBufferAttribute(positions, i)
          .applyMatrix4(mesh.matrixWorld);
        if (point.y >= 0) points.push(point);
      }
    }
  });
  const centers = tireBounds.map((box) => {
    if (box.isEmpty()) throw new Error('The car model is missing expected wheel geometry.');
    return box.getCenter(new THREE.Vector3());
  });
  if (points.length === 8) throw new Error('Missing car body geometry for collision hull.');
  const hull = new ConvexHull().setFromPoints(points);
  const vertices = new Set<THREE.Vector3>();
  for (const face of hull.faces) {
    let edge = face.edge;
    do {
      vertices.add(edge.head().point);
      edge = edge.next;
    } while (edge !== face.edge);
  }
  return {
    centers,
    radii: tireBounds.map((box) => box.getSize(new THREE.Vector3()).y / 2),
    widths: tireBounds.map((box) => box.getSize(new THREE.Vector3()).x),
    width: new THREE.Box3()
      .setFromPoints([...vertices, ...tireBounds.flatMap((box) => [box.min, box.max])])
      .getSize(new THREE.Vector3()).x,
    collisionVertices: [...vertices],
  };
}

export function vehicleDimensions(
  geometry: Pick<ReturnType<typeof carPhysicsGeometry>, 'centers' | 'radii' | 'collisionVertices'>,
) {
  const bounds = new THREE.Box3().setFromPoints(geometry.collisionVertices);
  return {
    wheelbase: Math.abs(
      (geometry.centers[0].z +
        geometry.centers[1].z -
        geometry.centers[2].z -
        geometry.centers[3].z) /
        2,
    ),
    halfWidth: Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)),
    halfLength: Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z)),
    wheelRadius: geometry.radii.reduce((sum, radius) => sum + radius, 0) / geometry.radii.length,
  };
}
