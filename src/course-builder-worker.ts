import { buildRoadCourse, type BuildRequest } from './course-build';
import { createCoursePreviewModel, type CoursePreviewColors } from './course-preview-3d';
import type { CourseDefinition } from './courses';
import type { RoadBuildStep, RoadBuildState, RoadMap } from './course-builder-data';
import type { PreviewModel } from './course-builder-preview';

export type { BuildRequest } from './course-build';
export type BuildResponse =
  | { type: 'progress'; step: RoadBuildStep; detail?: string; state?: RoadBuildState }
  | { type: 'complete'; course: RoadMap; json: Blob; model?: PreviewModel }
  | { type: 'preview'; model: PreviewModel }
  | { type: 'error'; message: string };

self.onmessage = (
  event: MessageEvent<
    BuildRequest | { type: 'preview'; course: CourseDefinition; colors: CoursePreviewColors }
  >,
) => {
  const request = event.data;
  const run = async () => {
    const previewOnly = 'type' in request;
    const course = previewOnly
      ? request.course
      : await buildRoadCourse(request, {
          progress: (step, detail, state) =>
            self.postMessage({ type: 'progress', step, detail, state } satisfies BuildResponse),
        });
    const json = new Blob([JSON.stringify(course)], { type: 'application/json' });
    if (!previewOnly && request.skipPreview) {
      self.postMessage({ type: 'complete', course, json } satisfies BuildResponse);
      return;
    }
    if (!previewOnly)
      self.postMessage({ type: 'progress', step: 'preview' } satisfies BuildResponse);
    const preview = createCoursePreviewModel(course, request.colors, 512);
    try {
      if (!previewOnly)
        self.postMessage({
          type: 'progress',
          step: 'preview',
          state: 'complete',
        } satisfies BuildResponse);
      self.postMessage(
        previewOnly
          ? ({ type: 'preview', model: preview.group.toJSON() } satisfies BuildResponse)
          : ({
              type: 'complete',
              course,
              json,
              model: preview.group.toJSON(),
            } satisfies BuildResponse),
      );
    } finally {
      preview.dispose();
    }
  };
  run().catch((error: unknown) => {
    console.error('Course builder failed:', error);
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    } satisfies BuildResponse);
  });
};
