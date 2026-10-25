import AmmoFactory from 'ammojs-typed';
import { createPhysicsSimulation } from './physics-simulation';
import type { PhysicsRequest, PhysicsResponse } from './physics-messages';

function respond(message: PhysicsResponse, transfer: Transferable[] = []) {
  self.postMessage(message, { transfer });
}
let simulation: ReturnType<typeof createPhysicsSimulation> | undefined;
let queue = Promise.resolve();
let failed = false;

self.onmessage = ({ data }: MessageEvent<PhysicsRequest>) => {
  queue = queue.then(async () => {
    if (failed) return;
    try {
      if (data.type === 'init') {
        // The upstream Emscripten factory writes to its receiver.
        const Ammo = await AmmoFactory.call({});
        simulation = createPhysicsSimulation(Ammo, data.data);
      }
      if (!simulation) throw new Error('Physics worker has not been initialized');
      const snapshot = simulation.handle(data);
      const transfers: Transferable[] = [snapshot.buffer];
      for (const record of snapshot.records) {
        if (record.sample) transfers.push(record.sample.buffer);
        for (const entrant of record.field ?? [])
          if (entrant.sample) transfers.push(entrant.sample.buffer);
      }
      respond(snapshot, transfers);
    } catch (error) {
      failed = true;
      respond({
        type: 'error',
        revision: data.revision,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  });
};
