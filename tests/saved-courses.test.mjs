import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let saved;
let generateCourse;
let generateCustomCourse;
let defaultCourseWeights;
before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  saved = await server.ssrLoadModule('/src/saved-courses.ts');
  ({ generateCourse } = await server.ssrLoadModule('/src/courses.ts'));
  ({ generateCustomCourse, defaultCourseWeights } = await server.ssrLoadModule(
    '/src/course-generation.ts',
  ));
});
after(async () => server?.close());

function directory() {
  const files = new Map();
  return {
    files,
    async *values() {
      for (const [name] of files) yield await this.getFileHandle(name);
    },
    async getFileHandle(name, options) {
      if (!files.has(name)) {
        if (!options?.create) throw Error('Missing file');
        files.set(name, '');
      }
      return {
        name,
        kind: 'file',
        async getFile() {
          return new Blob([files.get(name)]);
        },
        async createWritable() {
          let pending;
          return {
            async write(blob) {
              pending = await blob.text();
            },
            async close() {
              files.set(name, pending);
            },
            async abort() {},
          };
        },
      };
    },
    async removeEntry(name) {
      files.delete(name);
    },
  };
}

test('OPFS saves generated layouts, renames stable files, and deletes only selected tracks', async () => {
  const dir = directory();
  const random = generateCourse(42);
  const custom = generateCustomCourse(42, defaultCourseWeights);
  const first = await saved.saveCourse(dir, random, ' Random ');
  const second = await saved.saveCourse(dir, custom, 'Custom');
  assert.equal(first.name, 'Random');
  assert.deepEqual(first.points, random.points);
  assert.deepEqual(second.generation.weights, defaultCourseWeights);
  const filenames = [...dir.files.keys()];
  const renamed = await saved.renameSavedCourse(dir, first.id, 'New name');
  assert.equal(renamed.id, first.id);
  assert.deepEqual([...dir.files.keys()], filenames);
  assert.equal((await saved.loadSavedCourses(dir)).find((c) => c.id === first.id).name, 'New name');
  await saved.deleteSavedCourse(dir, first.id);
  assert.deepEqual(await saved.loadSavedCourses(dir), JSON.parse(JSON.stringify([second])));
  await assert.rejects(saved.deleteSavedCourse(dir, 'missing'), /not found/);
  await assert.rejects(saved.saveCourse(dir, random, ' '), /Enter a course name/);
  await assert.rejects(
    saved.saveCourse(dir, { ...random, id: 'hillside' }, 'Name'),
    /Only generated/,
  );
});

test('legacy localStorage tracks migrate once, preserve IDs and upgrade old custom metadata', async () => {
  const dir = directory();
  const course = generateCustomCourse(42, defaultCourseWeights);
  const { banking, ...weights } = course.generation.weights;
  const legacy = { ...course, id: 'saved-legacy', generation: { ...course.generation, weights } };
  let text = JSON.stringify([legacy]);
  const storage = {
    getItem: () => text,
    removeItem: () => {
      text = null;
    },
  };
  await saved.migrateSavedCourses(dir, storage);
  assert.equal(text, null);
  const [restored] = await saved.loadSavedCourses(dir);
  assert.equal(restored.id, legacy.id);
  assert.deepEqual(restored.points, JSON.parse(JSON.stringify(legacy.points)));
  assert.deepEqual(restored.generation.weights, defaultCourseWeights);
  text = JSON.stringify([legacy]);
  await saved.migrateSavedCourses(dir, storage);
  assert.equal(dir.files.size, 1);
});

test('failed writes preserve legacy storage and surface errors; builder JSON is accepted', async () => {
  const dir = directory();
  const course = { ...generateCourse(42), id: 'saved-legacy' };
  let removed = false;
  const storage = {
    getItem: () => JSON.stringify([course]),
    removeItem: () => {
      removed = true;
    },
  };
  dir.getFileHandle = async () => {
    throw Error('Quota exceeded');
  };
  await assert.rejects(saved.migrateSavedCourses(dir, storage), /Quota exceeded/);
  assert.equal(removed, false);
  const builderDir = directory();
  const road = {
    ...course,
    id: 'course-builder-map',
    courseBuilder: { sections: [], resolution: 5 },
  };
  builderDir.files.set('builder.json', JSON.stringify(road));
  assert.equal((await saved.loadSavedCourses(builderDir))[0].id, road.id);
  await saved.renameSavedCourse(builderDir, road.id, 'Renamed road');
  assert.deepEqual((await saved.loadSavedCourses(builderDir))[0].courseBuilder, road.courseBuilder);
  builderDir.files.set('broken.json', '{');
  await assert.rejects(saved.loadSavedCourses(builderDir), /broken.json/);
});
