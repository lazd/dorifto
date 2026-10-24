import type AmmoFactory from 'ammojs-typed';
import { cellTriangles, type HeightfieldData } from './terrain-query';

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
  const contours = terrain.flippedCells && contourCollider(Ammo, terrain);
  const heightData = resources.acquireHeightfield(contours?.heights ?? terrain.heights);
  const minHeight = contours?.minHeight ?? terrain.minHeight;
  const shape = new Ammo.btHeightfieldTerrainShape(
    terrain.columns,
    terrain.rows,
    heightData.pointer,
    1,
    minHeight,
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
    (minHeight + terrain.maxHeight) / 2,
    terrain.minZ + ((terrain.rows - 1) * terrain.spacing) / 2,
  );
  transform.setOrigin(vector);
  const motion = new Ammo.btDefaultMotionState(transform);
  vector.setValue(0, 0, 0);
  const info = new Ammo.btRigidBodyConstructionInfo(0, motion, shape, vector);
  const ground = new Ammo.btRigidBody(info);
  world.addRigidBody(ground);
  Ammo.destroy(info);
  if (contours) world.addRigidBody(contours.body);
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
      if (contours) {
        world.removeRigidBody(contours.body);
        contours.dispose();
      }
      Ammo.destroy(world);
      Ammo.destroy(solver);
      Ammo.destroy(broadphase);
      Ammo.destroy(dispatcher);
      Ammo.destroy(configuration);
    },
  };
}

/**
 * Bullet's heightfield always splits cells along one diagonal. Cells split the other way
 * are sunk out of reach in the heightfield and covered by a triangle mesh with the
 * rendered triangulation, so collision matches the visible terrain exactly.
 */
function contourCollider(Ammo: typeof AmmoFactory, terrain: HeightfieldData) {
  const { columns, rows, spacing, minX, minZ, flippedCells } = terrain;
  const minHeight = terrain.minHeight - 10;
  const heights = terrain.heights.slice();
  const sunk = new Uint8Array(heights.length);
  for (let z = 0; z < rows - 1; z++)
    for (let x = 0; x < columns - 1; x++) {
      if (!flippedCells?.[z * (columns - 1) + x]) continue;
      const i = z * columns + x;
      for (const corner of [i, i + 1, i + columns, i + columns + 1]) {
        sunk[corner] = 1;
        heights[corner] = minHeight;
      }
    }
  const mesh = new Ammo.btTriangleMesh(true);
  const vertices = new Map<number, number>();
  const vector = new Ammo.btVector3();
  let triangles = 0;
  const vertex = (i: number) => {
    let index = vertices.get(i);
    if (index === undefined) {
      vector.setValue(
        minX + (i % columns) * spacing,
        terrain.heights[i],
        minZ + Math.floor(i / columns) * spacing,
      );
      index = mesh.findOrAddVertex(vector, false);
      vertices.set(i, index);
    }
    return index;
  };
  // Every cell touching a sunken vertex needs mesh coverage; unflipped ones keep the default split.
  for (let z = 0; z < rows - 1; z++)
    for (let x = 0; x < columns - 1; x++) {
      const i = z * columns + x;
      if (!(sunk[i] || sunk[i + 1] || sunk[i + columns] || sunk[i + columns + 1])) continue;
      for (const corner of cellTriangles(terrain, x, z)) mesh.addIndex(vertex(corner));
      triangles += 2;
    }
  Ammo.destroy(vector);
  // ammo.js lacks addTriangleIndices, and addIndex alone does not count triangles.
  const indexed = mesh.getIndexedMeshArray().at(0);
  indexed.set_m_numTriangles(triangles);
  const shape = new Ammo.btBvhTriangleMeshShape(mesh, true, true);
  shape.setMargin(0.01);
  const transform = new Ammo.btTransform();
  transform.setIdentity();
  const motion = new Ammo.btDefaultMotionState(transform);
  const inertia = new Ammo.btVector3(0, 0, 0);
  const info = new Ammo.btRigidBodyConstructionInfo(0, motion, shape, inertia);
  const body = new Ammo.btRigidBody(info);
  Ammo.destroy(info);
  Ammo.destroy(inertia);
  Ammo.destroy(transform);
  return {
    heights,
    minHeight,
    body,
    dispose() {
      Ammo.destroy(body);
      Ammo.destroy(motion);
      Ammo.destroy(shape);
      Ammo.destroy(mesh);
    },
  };
}
