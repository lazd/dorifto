import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import type { CourseDefinition } from './src/courses.ts';

function courseCatalog(): Plugin {
  const id = '\0virtual:course-catalog';
  const directory = new URL('./src/tracks/', import.meta.url);
  const realDataDirectory = new URL('./src/real-data/', import.meta.url);
  const watched = [directory, realDataDirectory].map((url) => fileURLToPath(url));
  let building = false;
  return {
    name: 'course-catalog',
    configResolved(config) {
      building = config.command === 'build';
    },
    resolveId(source) {
      if (source === 'virtual:course-catalog') return id;
    },
    async load(source, options) {
      if (source !== id) return;
      const files = (await readdir(directory)).filter((file) => file.endsWith('.json')).sort();
      const entries = await Promise.all(
        files.map(async (file, index) => {
          const path = new URL(file, directory);
          this.addWatchFile(fileURLToPath(path));
          const content = await readFile(path, 'utf8');
          const course: CourseDefinition = JSON.parse(content);
          const version = createHash('sha256').update(content).digest('hex').slice(0, 16);
          // Headless training and tests already have the full map on disk.
          if (!options?.ssr) delete course.terrain;
          // Real driver recordings share their track's file name; see scripts/import-real-data.mjs.
          const realDataPath = new URL(file, realDataDirectory);
          const realData = await readFile(realDataPath, 'utf8').catch((error) => {
            if (error.code === 'ENOENT') return null;
            throw error;
          });
          if (realData !== null) this.addWatchFile(fileURLToPath(realDataPath));
          return {
            course,
            size: `${JSON.stringify(course.id)}: ${Buffer.byteLength(content)}`,
            asset: `import url${index} from ${JSON.stringify(`/src/tracks/${file}?url&no-inline`)};`,
            url: `${JSON.stringify(course.id)}: url${index}${building ? '' : ` + "?v=${version}"`}`,
            realDriver:
              realData &&
              `import realDriverUrl${index} from ${JSON.stringify(`/src/real-data/${file}?url&no-inline`)};
realDrivers[${JSON.stringify(course.id)}] = { url: realDriverUrl${index}, reverse: ${JSON.parse(realData).reverse === true} };`,
          };
        }),
      );
      return [
        ...entries.map(({ asset }) => asset),
        `export const mapUrls = {${entries.map(({ url }) => url).join(',')}};`,
        `export const mapSizes = {${entries.map(({ size }) => size).join(',')}};`,
        `export const realDrivers = {};`,
        ...entries.flatMap(({ realDriver }) => (realDriver ? [realDriver] : [])),
        `export default ${JSON.stringify(entries.map(({ course }) => course))};`,
      ].join('\n');
    },
    handleHotUpdate({ file, server }) {
      if (!watched.some((path) => file.startsWith(path)) || !file.endsWith('.json')) return;
      const module = server.moduleGraph.getModuleById(id);
      if (module) server.moduleGraph.invalidateModule(module);
      server.ws.send({ type: 'full-reload' });
    },
  };
}

export default defineConfig({
  plugins: [courseCatalog()],
  worker: { plugins: () => [courseCatalog()] },
  base: './',
  build: {
    rollupOptions: {
      input: {
        game: fileURLToPath(new URL('./index.html', import.meta.url)),
        courseBuilder: fileURLToPath(new URL('./course-builder.html', import.meta.url)),
      },
    },
  },
  // Keep the supplied glTF, its relative textures, binary, and license together.
  publicDir: 'models',
  // Ammo is imported by the physics worker, outside the initial page dependency scan.
  optimizeDeps: { include: ['ammojs-typed', 'geotiff'] },
});
