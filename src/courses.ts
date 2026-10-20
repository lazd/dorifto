export interface CourseDefinition {
  id: string;
  name: string;
  width: number;
  coneSpacing: number;
  /** Ground-plane coordinates [x, z], ordered in the driving direction. */
  points: readonly (readonly [number, number])[];
  spawn: { position: readonly [number, number]; heading: number };
}

export const courses: readonly CourseDefinition[] = [
  {
    id: 'autocross',
    name: 'Autocross Playground',
    width: 12,
    coneSpacing: 5,
    points: [
      [0, 0], [0, 21], [-6, 40.5], [6, 60], [-6, 79.5],
      [0, 99], [24, 120], [54, 111], [63, 82.5], [42, 63],
      [34.5, 42], [51, 33], [69, 43.5], [81, 27],
      [66, -7.5], [33, -21], [7.5, -15],
    ],
    spawn: { position: [0, 0], heading: 0 },
  },
  {
    id: 'sweeper',
    name: 'Sweeper Circuit',
    width: 14,
    coneSpacing: 6,
    points: [
      [0, 0], [0, 30], [-8, 60], [0, 90], [30, 115],
      [65, 110], [90, 80], [85, 45], [60, 25],
      [65, -10], [40, -35], [10, -25],
    ],
    spawn: { position: [0, 0], heading: 0 },
  },
];
