declare module 'virtual:course-catalog' {
  const courses: import('./courses').CourseDefinition[];
  export const mapUrls: Record<string, string>;
  export const mapSizes: Record<string, number>;
  export default courses;
}
