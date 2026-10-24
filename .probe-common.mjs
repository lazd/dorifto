import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
export async function load(name) {
  const course = JSON.parse(await readFile(`src/tracks/${name}.json`, 'utf8'));
  const server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
    logLevel: 'silent',
  });
  const { CourseTerrain } = await server.ssrLoadModule('/src/terrain.ts');
  const q = await server.ssrLoadModule('/src/terrain-query.ts');
  const t = new CourseTerrain(course, false);
  return {
    course,
    t,
    q,
    server,
    hw: course.width / 2 + (course.shoulderWidth ?? 1.6),
    support: 1.5 * Math.SQRT2,
  };
}
