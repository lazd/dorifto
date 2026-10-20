import * as THREE from 'three';
import type { CourseDefinition } from './courses';

export function createCourse(scene: THREE.Scene, definition: CourseDefinition) {
  const route = new THREE.CatmullRomCurve3(
    definition.points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    true, 'centripetal',
  );
  const coneGeometry = new THREE.ConeGeometry(0.23, 0.7, 24);
  const orange = new THREE.MeshStandardMaterial({ color: 0xf07424, roughness: 0.65 });
  const stripeMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.22, metalness: 0,
    clearcoat: 1, clearcoatRoughness: 0.12,
  });
  // Match the cone's taper exactly; a slight radius offset avoids z-fighting.
  const stripeGeometry = new THREE.CylinderGeometry(0.078, 0.124, 0.14, 24, 1, true);
  const cones: THREE.Mesh[] = [];
  const length = route.getLength();
  const gates = Math.ceil(length / definition.coneSpacing);
  const across = new THREE.Vector3();
  for (let i = 0; i < gates; i++) {
    const t = i / gates;
    const center = route.getPointAt(t);
    const tangent = route.getTangentAt(t);
    across.set(tangent.z, 0, -tangent.x).normalize();
    for (const side of [-1, 1]) {
      const cone = new THREE.Mesh(coneGeometry, orange);
      cone.position.copy(center).addScaledVector(across, side * definition.width / 2);
      cone.position.y = 0.35;
      cone.castShadow = true;
      cone.receiveShadow = true;
      const stripe = new THREE.Mesh(stripeGeometry, stripeMaterial);
      stripe.position.y = 0.05;
      stripe.receiveShadow = true;
      cone.add(stripe);
      scene.add(cone);
      cones.push(cone);
    }
  }

  const white = new THREE.MeshBasicMaterial({ color: 0xe1e6df, side: THREE.DoubleSide });
  const dark = new THREE.MeshBasicMaterial({ color: 0x20282b, side: THREE.DoubleSide });
  const segments = Math.ceil(length / 0.5);
  for (const side of [-1, 1]) {
    const positions: number[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const center = route.getPointAt(t);
      const tangent = route.getTangentAt(t);
      across.set(tangent.z, 0, -tangent.x).normalize();
      for (const edge of [-0.08, 0.08]) {
        const point = center.clone().addScaledVector(across, side * definition.width / 2 + edge);
        positions.push(point.x, 0.016, point.z);
      }
    }
    const indices: number[] = [];
    for (let i = 0; i < segments; i++) {
      const j = i * 2;
      indices.push(j, j + 1, j + 2, j + 1, j + 3, j + 2);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    scene.add(new THREE.Mesh(geometry, white));
  }
  const columns = Math.ceil(definition.width / 0.5);
  const tileWidth = definition.width / columns;
  const start = route.getPointAt(5 / length);
  const startTangent = route.getTangentAt(5 / length);
  across.set(startTangent.z, 0, -startTangent.x).normalize();
  for (let row = 0; row < 2; row++) {
    for (let column = 0; column < columns; column++) {
      const tile = new THREE.Mesh(new THREE.PlaneGeometry(tileWidth, 0.5), (row + column) % 2 ? dark : white);
      tile.rotation.set(-Math.PI / 2, 0, Math.atan2(startTangent.x, startTangent.z));
      tile.position.copy(start)
        .addScaledVector(across, -definition.width / 2 + (column + 0.5) * tileWidth)
        .addScaledVector(startTangent, row * 0.5).setY(0.02);
      scene.add(tile);
    }
  }
  // Direction arrows keep the course legible without drawing a racing line.
  const arrowShape = new THREE.Shape();
  arrowShape.moveTo(0, 1.3);
  arrowShape.lineTo(-0.65, 0.35);
  arrowShape.lineTo(-0.25, 0.35);
  arrowShape.lineTo(-0.25, -1);
  arrowShape.lineTo(0.25, -1);
  arrowShape.lineTo(0.25, 0.35);
  arrowShape.lineTo(0.65, 0.35);
  arrowShape.closePath();
  const arrowGeometry = new THREE.ShapeGeometry(arrowShape);
  for (let distance = 12; distance < length; distance += 24) {
    const t = distance / length;
    const position = route.getPointAt(t);
    const tangent = route.getTangentAt(t);
    const arrow = new THREE.Mesh(arrowGeometry, white);
    arrow.rotation.set(-Math.PI / 2, 0, Math.atan2(-tangent.x, -tangent.z));
    arrow.position.copy(position).setY(0.02);
    scene.add(arrow);
  }
  return cones;
}
