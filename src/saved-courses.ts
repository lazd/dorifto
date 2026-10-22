import type { CourseDefinition } from './courses';
import { courseGenerationFields, defaultCourseWeights } from './course-generation';

export const savedCoursesStorageKey = 'dorifto:courses';

function isGeneration(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const generation = value as Record<string, unknown>;
  if (typeof generation.seed !== 'number' || !Number.isInteger(generation.seed)
    || generation.seed < 0 || generation.seed > 0xffffffff) return false;
  if (generation.type === 'random') return true;
  if (generation.type !== 'custom' || typeof generation.weights !== 'object' || generation.weights === null)
    return false;
  const weights = generation.weights as Record<string, unknown>;
  return courseGenerationFields.every(({ key, min, max }) =>
    key === 'banking' && weights[key] === undefined
    || typeof weights[key] === 'number' && Number.isFinite(weights[key]) && weights[key] >= min && weights[key] <= max);
}

function isCourse(value: unknown): value is CourseDefinition {
  if (typeof value !== 'object' || value === null) return false;
  const course = value as Record<string, unknown>;
  return typeof course.id === 'string' && course.id.startsWith('saved-')
    && typeof course.name === 'string' && course.name.trim().length > 0
    && typeof course.width === 'number' && Number.isFinite(course.width) && course.width > 0
    && Array.isArray(course.points) && course.points.length >= 3
    && course.points.every((point: unknown) => Array.isArray(point) && point.length === 2
      && point.every((coordinate: unknown) => typeof coordinate === 'number' && Number.isFinite(coordinate)))
    && ['coneSpacing', 'padRadius'].every((key) =>
      course[key] === undefined || typeof course[key] === 'number' && Number.isFinite(course[key]) && course[key] > 0)
    && ['elevationScale', 'bankingScale'].every((key) =>
      course[key] === undefined || typeof course[key] === 'number' && Number.isFinite(course[key]) && course[key] >= 0)
    && (course.flat === undefined || typeof course.flat === 'boolean')
    && (course.reverse === undefined || typeof course.reverse === 'boolean')
    && (course.generation === undefined || isGeneration(course.generation))
    && (course.elevation === undefined || Array.isArray(course.elevation) && course.elevation.length > 0
      && course.elevation.every((height: unknown) => typeof height === 'number' && Number.isFinite(height)));
}

export function loadSavedCourses(storage: Pick<Storage, 'getItem'>): CourseDefinition[] {
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
  return parsed.map((course) => course.generation?.type === 'custom' ? {
    ...course,
    generation: {
      ...course.generation,
      weights: { ...course.generation.weights, banking: course.generation.weights.banking ?? defaultCourseWeights.banking },
    },
  } : course);
}

export function saveCourse(
  storage: Pick<Storage, 'getItem' | 'setItem'>, definition: CourseDefinition, name: string,
) {
  if (definition.id !== 'random' && definition.id !== 'custom')
    throw new Error('Only generated courses can be saved');
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Enter a course name');
  const courses = loadSavedCourses(storage);
  const saved: CourseDefinition = { ...definition, id: `saved-${crypto.randomUUID()}`, name: trimmed };
  storage.setItem(savedCoursesStorageKey, JSON.stringify([...courses, saved]));
  return saved;
}

export function deleteSavedCourse(storage: Pick<Storage, 'getItem' | 'setItem'>, id: string) {
  const courses = loadSavedCourses(storage);
  if (!courses.some((course) => course.id === id)) throw new Error('Saved course not found');
  storage.setItem(savedCoursesStorageKey, JSON.stringify(courses.filter((course) => course.id !== id)));
}
