import { createServer } from 'vite';
import { loadTrainingCarGeometry } from './bot-assets.mjs';
const [course, from, to] = process.argv.slice(2);
const server = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  appType: 'custom',
  logLevel: 'error',
});
const { courses } = await server.ssrLoadModule('/src/courses.ts');
const { CourseTerrain } = await server.ssrLoadModule('/src/terrain.ts');
const { createDrivingMap } = await server.ssrLoadModule('/src/race-bot.ts');
const { vehicleDimensions } = await server.ssrLoadModule('/src/car-geometry.ts');
const geometry = await loadTrainingCarGeometry(server);
const definition = { ...courses.find(({ id }) => id === course), reverse: false };
const map = createDrivingMap(
  definition,
  new CourseTerrain(definition, false),
  vehicleDimensions(geometry).halfWidth,
);
const spacing = map.length / map.samples.length;
console.log(
  'length',
  map.length.toFixed(0),
  'spacing',
  spacing.toFixed(2),
  'width',
  definition.width,
);
for (let i = 0; i < map.samples.length; i++) {
  const d = i * spacing;
  if (d < from || d > to) continue;
  if (i % 4) continue;
  const s = map.samples[i];
  console.log(
    d.toFixed(0).padStart(5),
    'R',
    (1 / Math.abs(s.curvature)).toFixed(0).padStart(6),
    'grade',
    s.grade.toFixed(3),
    'bank',
    (s.bank ?? 0).toFixed(3),
    'y',
    (s.y ?? 0).toFixed?.(1),
  );
}
await server.close();
