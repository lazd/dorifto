import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let loadSavedCourses;
let saveCourse;
let deleteSavedCourse;
let savedCoursesStorageKey;
let generateCourse;
let generateCustomCourse;
let defaultCourseWeights;

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  ({ loadSavedCourses, saveCourse, deleteSavedCourse, savedCoursesStorageKey } = await server.ssrLoadModule('/src/saved-courses.ts'));
  ({ generateCourse } = await server.ssrLoadModule('/src/courses.ts'));
  ({ generateCustomCourse, defaultCourseWeights } = await server.ssrLoadModule('/src/course-generation.ts'));
});

after(async () => { await server?.close(); });

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
  };
}

test('saves named random and custom layouts and restores exact geometry and options', () => {
  const storage = memoryStorage();
  assert.deepEqual(loadSavedCourses(storage), []);
  const random = generateCourse(42);
  const custom = generateCustomCourse(42, defaultCourseWeights);
  const savedRandom = saveCourse(storage, random, '  My random track  ');
  const savedCustom = saveCourse(storage, custom, 'My custom track');
  assert.equal(savedRandom.name, 'My random track');
  assert.match(savedRandom.id, /^saved-/);
  assert.notEqual(savedRandom.id, savedCustom.id);
  assert.deepEqual(loadSavedCourses(storage), JSON.parse(JSON.stringify([savedRandom, savedCustom])));
  assert.deepEqual(savedRandom.points, random.points);
  assert.deepEqual(savedCustom.points, custom.points);
  assert.deepEqual({ ...savedRandom, id: random.id, name: random.name }, random);
  assert.deepEqual({ ...savedCustom, id: custom.id, name: custom.name }, custom);
  assert.equal(random.id, 'random', 'saving does not modify the active definition');
});

test('rejects empty names, non-generated courses, corrupt storage and duplicate IDs', () => {
  const storage = memoryStorage();
  const course = { id: 'random', name: 'Random', width: 10, points: [[0, 0], [100, 0], [0, 100]] };
  assert.throws(() => saveCourse(storage, course, '  '), /Enter a course name/);
  assert.throws(() => saveCourse(storage, { ...course, id: 'autocross' }, 'Name'), /Only generated/);
  storage.setItem(savedCoursesStorageKey, '{');
  assert.throws(() => loadSavedCourses(storage), /not valid JSON/);
  storage.setItem(savedCoursesStorageKey, JSON.stringify([{ ...course, id: 'saved-test', points: [[null, 0]] }]));
  assert.throws(() => loadSavedCourses(storage), /invalid format/);
  const saved = { ...course, id: 'saved-test' };
  storage.setItem(savedCoursesStorageKey, JSON.stringify([saved, saved]));
  assert.throws(() => loadSavedCourses(storage), /duplicate IDs/);
});

test('storage failures are surfaced rather than reporting a successful save', () => {
  const storage = memoryStorage();
  storage.setItem = () => { throw new Error('Storage full'); };
  assert.throws(() => saveCourse(storage, {
    id: 'custom', name: 'Custom', width: 10, points: [[0, 0], [100, 0], [0, 100]],
  }, 'Name'), /Storage full/);
  assert.deepEqual(loadSavedCourses(storage), []);
});

test('deletes only the requested saved course and rejects built-in or missing courses', () => {
  const storage = memoryStorage();
  const course = { id: 'random', name: 'Random', width: 10, points: [[0, 0], [100, 0], [0, 100]] };
  const first = saveCourse(storage, course, 'First');
  const second = saveCourse(storage, course, 'Second');
  assert.throws(() => deleteSavedCourse(storage, 'autocross'), /Saved course not found/);
  deleteSavedCourse(storage, first.id);
  assert.deepEqual(loadSavedCourses(storage), [second]);
  assert.throws(() => deleteSavedCourse(storage, first.id), /Saved course not found/);
  storage.setItem = () => { throw new Error('Storage blocked'); };
  assert.throws(() => deleteSavedCourse(storage, second.id), /Storage blocked/);
  assert.deepEqual(loadSavedCourses(storage), [second]);
});
