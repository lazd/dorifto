import type { CourseDefinition } from './courses';
import { courseGenerationFields, defaultCourseWeights } from './course-generation';
import { listRoadMaps, storeRoadMap } from './road-builder-storage';
import { readRoadMap } from './road-builder-data';

export const savedCoursesStorageKey = 'dorifto:courses';

function isGeneration(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const generation = value as Record<string, unknown>;
  if (
    typeof generation.seed !== 'number' ||
    !Number.isInteger(generation.seed) ||
    generation.seed < 0 ||
    generation.seed > 0xffffffff
  )
    return false;
  if (generation.type === 'random') return true;
  if (
    generation.type !== 'custom' ||
    typeof generation.weights !== 'object' ||
    generation.weights === null
  )
    return false;
  const weights = generation.weights as Record<string, unknown>;
  return courseGenerationFields.every(
    ({ key, min, max }) =>
      (key === 'banking' && weights[key] === undefined) ||
      (typeof weights[key] === 'number' &&
        Number.isFinite(weights[key]) &&
        weights[key] >= min &&
        weights[key] <= max),
  );
}

function isCourse(value: unknown): value is CourseDefinition {
  if (typeof value !== 'object' || value === null) return false;
  const course = value as Record<string, unknown>;
  return (
    typeof course.id === 'string' &&
    typeof course.name === 'string' &&
    course.name.trim().length > 0 &&
    typeof course.width === 'number' &&
    Number.isFinite(course.width) &&
    course.width > 0 &&
    Array.isArray(course.points) &&
    course.points.length >= 2 &&
    course.points.every(
      (point: unknown) =>
        Array.isArray(point) &&
        point.length === 2 &&
        point.every(
          (coordinate: unknown) => typeof coordinate === 'number' && Number.isFinite(coordinate),
        ),
    ) &&
    ['coneSpacing', 'padRadius'].every(
      (key) =>
        course[key] === undefined ||
        (typeof course[key] === 'number' && Number.isFinite(course[key]) && course[key] > 0),
    ) &&
    ['elevationScale', 'bankingScale'].every(
      (key) =>
        course[key] === undefined ||
        (typeof course[key] === 'number' && Number.isFinite(course[key]) && course[key] >= 0),
    ) &&
    (course.flat === undefined || typeof course.flat === 'boolean') &&
    (course.reverse === undefined || typeof course.reverse === 'boolean') &&
    (course.closed === undefined || typeof course.closed === 'boolean') &&
    (course.generation === undefined || isGeneration(course.generation)) &&
    (course.elevation === undefined ||
      (Array.isArray(course.elevation) &&
        course.elevation.length > 0 &&
        course.elevation.every(
          (height: unknown) => typeof height === 'number' && Number.isFinite(height),
        )))
  );
}

function loadLegacyCourses(storage: Pick<Storage, 'getItem'>): CourseDefinition[] {
  const text = storage.getItem(savedCoursesStorageKey);
  if (text === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error('Saved courses are not valid JSON', { cause: error });
  }
  if (!Array.isArray(parsed) || !parsed.every(isCourse))
    throw new Error('Saved courses have an invalid format');
  if (new Set(parsed.map(({ id }) => id)).size !== parsed.length)
    throw new Error('Saved courses contain duplicate IDs');
  return parsed.map((course) =>
    course.generation?.type === 'custom'
      ? {
          ...course,
          generation: {
            ...course.generation,
            weights: {
              ...course.generation.weights,
              banking: course.generation.weights.banking ?? defaultCourseWeights.banking,
            },
          },
        }
      : course,
  );
}

export async function loadSavedCourses(directory: FileSystemDirectoryHandle) {
  const courses: CourseDefinition[] = [];
  for (const handle of await listRoadMaps(directory)) {
    try {
      const course = readRoadMap(await (await handle.getFile()).text());
      if (!isCourse(course)) throw new Error('Saved track has an invalid format');
      courses.push(course);
    } catch (error) {
      throw new Error(`Unable to read saved track "${handle.name}"`, { cause: error });
    }
  }
  if (new Set(courses.map(({ id }) => id)).size !== courses.length)
    throw new Error('Saved courses contain duplicate IDs');
  return courses;
}

export async function migrateSavedCourses(
  directory: FileSystemDirectoryHandle,
  storage: Pick<Storage, 'getItem' | 'removeItem'>,
) {
  const legacy = loadLegacyCourses(storage);
  const existing = await loadSavedCourses(directory);
  for (const course of legacy) {
    if (!existing.some(({ id }) => id === course.id))
      await storeRoadMap(directory, course, new Blob([JSON.stringify(course)]));
  }
  storage.removeItem(savedCoursesStorageKey);
}

export async function saveCourse(
  directory: FileSystemDirectoryHandle,
  definition: CourseDefinition,
  name: string,
) {
  if (definition.id !== 'random' && definition.id !== 'custom')
    throw new Error('Only generated courses can be saved');
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Enter a course name');
  const saved: CourseDefinition = {
    ...definition,
    id: `saved-${crypto.randomUUID()}`,
    name: trimmed,
  };
  await storeRoadMap(directory, saved, new Blob([JSON.stringify(saved)]));
  return saved;
}

async function findSavedCourse(directory: FileSystemDirectoryHandle, id: string) {
  for (const handle of await listRoadMaps(directory)) {
    const course = readRoadMap(await (await handle.getFile()).text());
    if (course.id === id) return { handle, course };
  }
  throw new Error('Saved course not found');
}

export async function deleteSavedCourse(directory: FileSystemDirectoryHandle, id: string) {
  const { handle } = await findSavedCourse(directory, id);
  await directory.removeEntry(handle.name);
}

export async function renameSavedCourse(
  directory: FileSystemDirectoryHandle,
  id: string,
  name: string,
) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Enter a course name');
  const { handle, course } = await findSavedCourse(directory, id);
  const renamed = { ...course, name: trimmed };
  await storeRoadMap(directory, renamed, new Blob([JSON.stringify(renamed)]), handle.name);
  return renamed;
}
