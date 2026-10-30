/** Progress reported by a long-running task: a status message and its completed fraction (0 to 1). */
export interface LoadStep {
  message: string;
  fraction: number;
}

/** A synchronous task that yields at safe points, so callers can run it in slices or all at once. */
export type LoadTask<T> = Generator<LoadStep, T, undefined>;

export function runSync<T>(task: LoadTask<T>): T {
  let step = task.next();
  while (!step.done) step = task.next();
  return step.value;
}

/** Lets the browser paint and handle input; unlike a timer, it is not throttled in background tabs. */
function yieldToBrowser() {
  return new Promise<void>((resolve) => {
    const { port1, port2 } = new MessageChannel();
    port1.onmessage = () => {
      port1.close();
      resolve();
    };
    port2.postMessage(null);
  });
}

/** Runs a task in slices of `sliceMs`, letting the browser paint and respond between them. */
export async function runAsync<T>(
  task: LoadTask<T>,
  onStep: (step: LoadStep) => void,
  sliceMs = 40,
): Promise<T> {
  let sliceStart = performance.now();
  while (true) {
    const step = task.next();
    if (step.done) return step.value;
    if (performance.now() - sliceStart < sliceMs) continue;
    onStep(step.value);
    await yieldToBrowser();
    sliceStart = performance.now();
  }
}

/** Maps a task's progress onto the `from` to `to` range of a larger task. */
export function* scaleTask<T>(task: LoadTask<T>, from: number, to: number): LoadTask<T> {
  while (true) {
    const step = task.next();
    if (step.done) return step.value;
    yield { message: step.value.message, fraction: from + (to - from) * step.value.fraction };
  }
}

/** Relative weight of each stage of a load; weights sum to 1. */
export type StageWeights = Readonly<Record<string, number>>;

/** Overall progress for `fraction` of the way through `stage`, counting the stages before it. */
export function stageProgress(weights: StageWeights, stage: string, fraction = 0) {
  let done = 0;
  for (const [name, weight] of Object.entries(weights)) {
    if (name === stage) return done + weight * Math.min(1, Math.max(0, fraction));
    done += weight;
  }
  throw new Error(`Unknown load stage: ${stage}`);
}

/** Records when each load stage starts, so `finish` can log where the time went for comparison. */
export function createLoadTimer(label: string) {
  const started = performance.now();
  const stages: [string, number][] = [];
  return {
    stage(name: string) {
      if (stages.at(-1)?.[0] !== name) stages.push([name, performance.now()]);
    },
    finish() {
      const end = performance.now();
      const seconds = (ms: number) => (ms / 1000).toFixed(1);
      const parts = stages.map(
        ([name, start], i) => `${name} ${seconds((stages[i + 1]?.[1] ?? end) - start)}s`,
      );
      console.info(`[Load] ${label}: ${seconds(end - started)}s total (${parts.join(', ')})`);
    },
  };
}
