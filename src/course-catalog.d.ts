declare module 'virtual:course-catalog' {
  const courses: import('./courses').CourseDefinition[];
  export const mapUrls: Record<string, string>;
  export const mapSizes: Record<string, number>;
  /** Recorded real-world drives by course id, in the direction they were driven. */
  export const realDrivers: Record<string, { url: string; reverse: boolean }>;
  export default courses;
}
