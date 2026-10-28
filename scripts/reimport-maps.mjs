#!/usr/bin/env node
import { readFile, readdir, rename, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const tracksDirectory = fileURLToPath(new URL('../src/tracks/', import.meta.url));
const usage = `Usage: npm run reimport-maps -- [--full] [map.json ...]

Refresh bundled maps in src/tracks (or only the supplied JSON paths).
Default: replace scenery only, preserving the route, terrain, and map settings.
--full: rebuild from saved course-builder waypoints and routed sections, including terrain.
Full imports require builder data; missing data is reported before any maps are updated.
Generated circuits (closed maps without builder data) are skipped in both modes.
Maps are processed sequentially and replaced atomically only after successful import.
Geographic maps without scenery gain nearby roads by default; an explicit builder
includeNearbyRoads setting is respected. No browser-saved maps are modified.`;

async function main(args) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage);
    return;
  }
  const unknown = args.find((arg) => arg.startsWith('-') && arg !== '--full');
  if (unknown) throw new Error(`Unknown option: ${unknown}\n${usage}`);
  const full = args.includes('--full');
  const supplied = args.filter((arg) => arg !== '--full');
  const files = supplied.length
    ? supplied.map((file) => path.resolve(file))
    : (await readdir(tracksDirectory))
        .filter((file) => file.endsWith('.json'))
        .sort()
        .map((file) => path.join(tracksDirectory, file));
  const loaded = await Promise.all(
    files.map(async (file) => ({
      file,
      course: JSON.parse(await readFile(file, 'utf8')),
    })),
  );
  const maps = loaded.filter(({ file, course }) => {
    if (course.closed !== false && !course.courseBuilder) {
      console.log(`Skipping ${path.basename(file)}: generated circuit`);
      return false;
    }
    return true;
  });
  if (!maps.length) {
    console.log('Reimported 0 map(s).');
    return;
  }
  if (full) {
    const missing = maps.filter(({ course }) => course.terrain && !course.courseBuilder);
    if (missing.length)
      throw new Error(
        `Full reimport requires saved builder waypoints. Recreate these maps in the course builder:\n${missing
          .map(({ file, course }) => `  ${course.name}: ${file}`)
          .join('\n')}`,
      );
  }
  const server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  let updated = 0;
  try {
    const { reimportRoadCourse } = await server.ssrLoadModule('/src/course-build.ts');
    for (const { file, course } of maps) {
      if (!course.terrain && !supplied.length) {
        console.log(`Skipping ${path.basename(file)}: no geographic terrain`);
        continue;
      }
      console.log(`Reimporting ${course.name} (${full ? 'full map' : 'scenery'})…`);
      const result = await reimportRoadCourse(course, {
        full,
        progress: (step) => console.log(`  ${step}`),
      });
      const temporary = `${file}.${process.pid}.tmp`;
      try {
        await writeFile(temporary, `${JSON.stringify(result)}\n`, { flag: 'wx' });
        await rename(temporary, file);
      } finally {
        await rm(temporary, { force: true });
      }
      updated++;
      console.log(`Updated ${file}`);
    }
    console.log(`Reimported ${updated} map(s).`);
  } finally {
    await server.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
