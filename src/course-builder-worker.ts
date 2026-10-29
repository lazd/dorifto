import { buildRoadCourse, type BuildRequest } from './course-build';
import { createCoursePreviewModel, type CoursePreviewColors } from './course-preview-3d';
import type { CourseDefinition } from './courses';
import type { RoadBuildStep, RoadMap } from './course-builder-data';
import type { PreviewModel } from './course-builder-preview';

export type { BuildRequest } from './course-build';
export type BuildResponse =
  | { type: 'progress'; step: RoadBuildStep; detail?: string }
  | { type: 'complete'; course: RoadMap; json: Blob }
  | { type: 'preview'; model: PreviewModel }
  | { type: 'error'; message: string };

self.onmessage = (
  event: MessageEvent<
    BuildRequest | { type: 'preview'; course: CourseDefinition; colors: CoursePreviewColors }
  >,
) => {
  const request = event.data;
  const run = async () => {
    if ('type' in request) {
      const preview = createCoursePreviewModel(request.course, request.colors, 512);
      try {
        self.postMessage({
          type: 'preview',
          model: preview.group.toJSON(),
        } satisfies BuildResponse);
      } finally {
        preview.dispose();
      }
      return;
    }
    const course = await buildRoadCourse(request, {
      progress: (step, detail) =>
        self.postMessage({ type: 'progress', step, detail } satisfies BuildResponse),
    });
    const json = new Blob([JSON.stringify(course)], { type: 'application/json' });
    self.postMessage({ type: 'complete', course, json } satisfies BuildResponse);
  };
  run().catch((error: unknown) => {
    console.error('Course builder failed:', error);
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    } satisfies BuildResponse);
  });
};
