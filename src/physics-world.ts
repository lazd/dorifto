import type AmmoFactory from 'ammojs-typed';
import type { HeightfieldData } from './terrain-query';

export function createPhysicsResources(Ammo: typeof AmmoFactory) {
  const buffers: { pointer: number; capacity: number; used: boolean }[] = [];
  return {
    vehicleTuning: new Ammo.btVehicleTuning(),
    acquireHeightfield(heights: Float32Array) {
      let buffer = buffers.find((buffer) => !buffer.used && buffer.capacity >= heights.byteLength);
      if (!buffer) {
        const capacity = 2 ** Math.ceil(Math.log2(heights.byteLength));
        const pointer = Ammo._malloc(capacity);
        if (!pointer) throw new Error('Unable to allocate course heightfield');
        buffer = { pointer, capacity, used: false };
        buffers.push(buffer);
      }
      buffer.used = true;
      Ammo.HEAPF32.set(heights, buffer.pointer / 4);
      const allocated = buffer;
      return {
        pointer: buffer.pointer,
        release() {
          allocated.used = false;
        },
      };
    },
  };
}

export function createPhysicsWorld(
  Ammo: typeof AmmoFactory,
  resources: ReturnType<typeof createPhysicsResources>,
  terrain: HeightfieldData,
) {
  const configuration = new Ammo.btDefaultCollisionConfiguration();
  const dispatcher = new Ammo.btCollisionDispatcher(configuration);
  const broadphase = new Ammo.btDbvtBroadphase();
  const solver = new Ammo.btSequentialImpulseConstraintSolver();
  const world = new Ammo.btDiscreteDynamicsWorld(dispatcher, broadphase, solver, configuration);
  const vector = new Ammo.btVector3(0, -9.81, 0);
  world.setGravity(vector);
  const heightData = resources.acquireHeightfield(terrain.heights);
  const shape = new Ammo.btHeightfieldTerrainShape(
    terrain.columns,
    terrain.rows,
    heightData.pointer,
    1,
    terrain.minHeight,
    terrain.maxHeight,
    1,
    Ammo.PHY_FLOAT,
    false,
  );
  vector.setValue(terrain.spacing, 1, terrain.spacing);
  shape.setLocalScaling(vector);
  shape.setMargin(0.01);
  const transform = new Ammo.btTransform();
  transform.setIdentity();
  vector.setValue(
    terrain.minX + ((terrain.columns - 1) * terrain.spacing) / 2,
    (terrain.minHeight + terrain.maxHeight) / 2,
    terrain.minZ + ((terrain.rows - 1) * terrain.spacing) / 2,
  );
  transform.setOrigin(vector);
  const motion = new Ammo.btDefaultMotionState(transform);
  vector.setValue(0, 0, 0);
  const info = new Ammo.btRigidBodyConstructionInfo(0, motion, shape, vector);
  const ground = new Ammo.btRigidBody(info);
  world.addRigidBody(ground);
  Ammo.destroy(info);
  Ammo.destroy(transform);
  Ammo.destroy(vector);
  let disposed = false;
  return {
    world,
    dispatcher,
    step(dt: number) {
      if (disposed) throw new Error('Cannot step a disposed physics world');
      world.stepSimulation(dt, 0);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      world.removeRigidBody(ground);
      Ammo.destroy(ground);
      Ammo.destroy(motion);
      Ammo.destroy(shape);
      heightData.release();
      Ammo.destroy(world);
      Ammo.destroy(solver);
      Ammo.destroy(broadphase);
      Ammo.destroy(dispatcher);
      Ammo.destroy(configuration);
    },
  };
}
