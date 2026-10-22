import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import * as THREE from 'three';
import { createServer } from 'vite';

let server;
let courseKerbSegments;
let courseRoute;
let courses;

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  ({ courseKerbSegments, courseRoute, courses } = await server.ssrLoadModule('/src/courses.ts'));
});
after(async () => {
  await server?.close();
});

function routeWithHeading(heading) {
  return {
    getLength: () => 1000,
    getTangentAt(t) {
      const angle = heading(t * 1000);
      return new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
    },
  };
}

function courseKerbDirection(route, distance) {
  return (
    courseKerbSegments(route).find(
      (segment) => distance >= segment.distance && distance < segment.endDistance,
    )?.direction ?? 0
  );
}

test('kerbs cover ordinary bends but exclude huge sweepers and straights', () => {
  for (const radius of [40, 65, 100, 130]) {
    for (const direction of [-1, 1]) {
      const route = routeWithHeading((distance) => (direction * distance) / radius);
      route.getLength = () => 2 * Math.PI * radius;
      route.getTangentAt = (t) => {
        const angle = direction * t * 2 * Math.PI;
        return new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
      };
      assert.equal(courseKerbDirection(route, radius), direction, `radius ${radius}`);
    }
  }
  for (const radius of [150, 170, 180, 200, 300, 500, 1000, Infinity]) {
    const route = routeWithHeading(() => 0);
    if (Number.isFinite(radius)) {
      route.getLength = () => 2 * Math.PI * radius;
      route.getTangentAt = (t) =>
        new THREE.Vector3(Math.sin(t * 2 * Math.PI), 0, Math.cos(t * 2 * Math.PI));
    }
    assert.equal(courseKerbDirection(route, 500), 0);
  }
});

test('kerbs extend into entry and exit transitions without covering distant straights', () => {
  const route = routeWithHeading((distance) => Math.max(0, Math.min(100, distance - 400)) / 100);
  for (const distance of [398, 400, 450, 500, 501]) {
    assert.equal(courseKerbDirection(route, distance), 1, `covered at ${distance}`);
  }
  for (const distance of [396, 502, 380, 520])
    assert.equal(courseKerbDirection(route, distance), 0);
});

test('kerbs stay on the inside through opposite-direction bends', () => {
  const route = routeWithHeading((distance) =>
    distance < 500 ? (distance - 500) / 100 : -(distance - 500) / 100,
  );
  assert.equal(courseKerbDirection(route, 494), 1);
  assert.equal(courseKerbDirection(route, 506), -1);
});

test('Thunderhill East gains kerb coverage beyond the former tight-only threshold', () => {
  const definition = courses.find(({ id }) => id === 'thunderhill-east');
  const route = courseRoute(definition);
  const reverse = courseRoute({ ...definition, reverse: true });
  const length = route.getLength();
  let oldCoverage = 0;
  let newCoverage = 0;
  const segments = courseKerbSegments(route);
  const reversed = courseKerbSegments(reverse);
  const directionAt = (segments, distance) =>
    segments.find((segment) => distance >= segment.distance && distance < segment.endDistance)
      ?.direction ?? 0;
  for (let distance = 1; distance < length; distance += 2) {
    const before = route.getTangentAt(((distance - 4 + length) % length) / length);
    const after = route.getTangentAt(((distance + 4) % length) / length);
    const bend = Math.atan2(before.z * after.x - before.x * after.z, before.dot(after));
    if (Math.abs(bend) >= 8 / 65) oldCoverage++;
    if (directionAt(segments, distance)) newCoverage++;
    assert.equal(directionAt(reversed, length - distance), -directionAt(segments, distance) || 0);
  }
  assert.ok(newCoverage > oldCoverage * 1.5, `${newCoverage} vs ${oldCoverage} segments`);
  assert.ok(newCoverage * 2 < length * 0.95, 'straights and huge sweepers remain unkerbed');
});

test('Sonoma finish straight stays unkerbed and same-side runs have no short holes', () => {
  const route = courseRoute(courses.find(({ id }) => id === 'sonoma-raceway'));
  const length = route.getLength();
  const segments = courseKerbSegments(route);
  const coverage = segments.reduce(
    (total, segment) => total + segment.endDistance - segment.distance,
    0,
  );
  assert.ok(coverage < 1939.06 * 0.9, `trim at least 10% more Sonoma coverage: ${coverage}`);
  assert.ok(segments.length > 0);
  assert.ok(
    !segments.some(({ distance, endDistance }) => distance < 25 || endDistance > length - 15),
    'no kerbs around the start/finish spline seam',
  );
  for (let index = 0; index < segments.length; index++) {
    const previous = segments[index];
    const next = segments[(index + 1) % segments.length];
    const gap = (next.distance - previous.endDistance + length) % length;
    if (previous.direction === next.direction) {
      assert.ok(gap < 1e-6 || gap > 4, `no isolated 1–2 m holes: ${gap}`);
    }
  }
});
