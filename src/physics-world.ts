import type AmmoFactory from 'ammojs-typed';
import { Vector3 } from 'three';
import {
  cellTriangles,
  normalAt,
  vertexHeight,
  vertexPosition,
  type HeightfieldData,
} from './terrain-query';

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

const customMaterialCallback = 8;
const terrainBodies = new Map<number, HeightfieldData>();
const meshContactNormals = new Map<number, Float32Array>();
const contactCallbacks = new WeakMap<typeof AmmoFactory, number>();

/**
 * Bodies sliding along terrain catch on internal triangle edges, whose contact normals can point
 * back against travel and stop a car dead. Like Bullet's btAdjustInternalEdgeContacts, replace
 * terrain contact normals with the smoothed surface normal. Bridge contacts use their triangle's
 * face normal, preserving real caps and corners without catching on tessellation edges.
 */
function surfaceContactCallback(Ammo: typeof AmmoFactory) {
  let callback = contactCallbacks.get(Ammo);
  if (callback === undefined) {
    // Emscripten's addFunction is present at runtime but missing from the typings.
    const { addFunction } = Ammo as unknown as {
      addFunction(callback: (...args: number[]) => number, signature: string): number;
    };
    callback = addFunction(
      (
        point: number,
        wrapA: number,
        _partA: number,
        indexA: number,
        wrapB: number,
        _partB: number,
        indexB: number,
      ) => {
        const objectOf = (wrap: number) =>
          Ammo.getPointer(
            Ammo.wrapPointer(wrap, Ammo.btCollisionObjectWrapper).getCollisionObject(),
          );
        const bodyA = objectOf(wrapA);
        const bodyB = objectOf(wrapB);
        const contact = Ammo.wrapPointer(point, Ammo.btManifoldPoint);
        const normalsB = meshContactNormals.get(bodyB);
        const normals = normalsB ?? meshContactNormals.get(bodyA);
        if (normals) {
          const index = (normalsB ? indexB : indexA) * 3;
          const x = normals[index],
            y = normals[index + 1],
            z = normals[index + 2];
          const normal = contact.get_m_normalWorldOnB();
          // Triangle meshes collide on both sides; keep the normal pointing toward A.
          const sign = x * normal.x() + y * normal.y() + z * normal.z() < 0 ? -1 : 1;
          if (x || y || z) normal.setValue(x * sign, y * sign, z * sign);
          return 0;
        }
        const terrainB = terrainBodies.get(bodyB);
        const terrain = terrainB ?? terrainBodies.get(bodyA);
        if (!terrain) return 0;
        const position = contact.getPositionWorldOnB();
        const normal = normalAt(terrain, position.x(), position.z());
        // The normal on B points toward A.
        if (!terrainB) normal.negate();
        contact.get_m_normalWorldOnB().setValue(normal.x, normal.y, normal.z);
        return 0;
      },
      'iiiiiiii',
    );
    contactCallbacks.set(Ammo, callback);
  }
  return callback;
}

export function createPhysicsWorld(
  Ammo: typeof AmmoFactory,
  resources: ReturnType<typeof createPhysicsResources>,
  terrain: HeightfieldData,
) {
  const groundTerrain = terrain.groundSurface ? { ...terrain, ...terrain.groundSurface } : terrain;
  const configuration = new Ammo.btDefaultCollisionConfiguration();
  const dispatcher = new Ammo.btCollisionDispatcher(configuration);
  const broadphase = new Ammo.btDbvtBroadphase();
  const solver = new Ammo.btSequentialImpulseConstraintSolver();
  const world = new Ammo.btDiscreteDynamicsWorld(dispatcher, broadphase, solver, configuration);
  const vector = new Ammo.btVector3(0, -9.81, 0);
  world.setGravity(vector);
  const contours =
    (terrain.flippedCells || terrain.warpedCells) && contourCollider(Ammo, groundTerrain);
  const structures = terrain.collisionMesh && triangleCollider(Ammo, terrain.collisionMesh);
  const bridges =
    terrain.bridgeMesh &&
    triangleCollider(
      Ammo,
      {
        positions: terrain.bridgeMesh.positions,
        indices: terrain.bridgeMesh.collisionIndices ?? terrain.bridgeMesh.indices,
      },
      true,
    );
  const buildings = terrain.buildingMesh && triangleCollider(Ammo, terrain.buildingMesh);
  let buildingsEnabled = true;
  const heightData = resources.acquireHeightfield(contours?.heights ?? groundTerrain.heights);
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
  if (structures) world.addRigidBody(structures.body);
  if (bridges) world.addRigidBody(bridges.body);
  if (buildings) world.addRigidBody(buildings.body);
  world.setContactAddedCallback(surfaceContactCallback(Ammo));
  const terrainBodyList = contours ? [ground, contours.body] : [ground];
  for (const body of terrainBodyList) {
    body.setCollisionFlags(body.getCollisionFlags() | customMaterialCallback);
    terrainBodies.set(Ammo.getPointer(body), groundTerrain);
  }
  Ammo.destroy(transform);
  Ammo.destroy(vector);
  let disposed = false;
  return {
    world,
    dispatcher,
    setBuildingsEnabled(enabled: boolean) {
      if (!buildings || enabled === buildingsEnabled) return;
      if (enabled) world.addRigidBody(buildings.body);
      else world.removeRigidBody(buildings.body);
      buildingsEnabled = enabled;
    },
    step(dt: number) {
      if (disposed) throw new Error('Cannot step a disposed physics world');
      world.stepSimulation(dt, 0);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const body of terrainBodyList) terrainBodies.delete(Ammo.getPointer(body));
      world.removeRigidBody(ground);
      Ammo.destroy(ground);
      Ammo.destroy(motion);
      Ammo.destroy(shape);
      heightData.release();
      if (contours) {
        world.removeRigidBody(contours.body);
        contours.dispose();
      }
      if (structures) {
        world.removeRigidBody(structures.body);
        structures.dispose();
      }
      if (bridges) {
        world.removeRigidBody(bridges.body);
        bridges.dispose();
      }
      if (buildings) {
        if (buildingsEnabled) world.removeRigidBody(buildings.body);
        buildings.dispose();
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
 * Bullet's heightfield always splits cells along one diagonal at grid positions. Cells
 * split the other way or with warped corners are sunk out of reach in the heightfield and
 * covered by a triangle mesh with the rendered triangulation, so collision matches the
 * visible terrain exactly.
 */
function contourCollider(Ammo: typeof AmmoFactory, terrain: HeightfieldData) {
  const { columns, rows, flippedCells, warpedCells } = terrain;
  const minHeight = terrain.minHeight - 10;
  const heights = terrain.heights.slice();
  const sunk = new Uint8Array(heights.length);
  for (let z = 0; z < rows - 1; z++)
    for (let x = 0; x < columns - 1; x++) {
      const cell = z * (columns - 1) + x;
      if (!flippedCells?.[cell] && !warpedCells?.[cell]) continue;
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
      const { x, z } = vertexPosition(terrain, i);
      vector.setValue(x, vertexHeight(terrain, i), z);
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
      const corners = cellTriangles(terrain, x, z);
      for (const corner of corners) mesh.addIndex(vertex(corner));
      triangles += corners.length / 3;
    }
  Ammo.destroy(vector);
  // ammo.js lacks addTriangleIndices, and addIndex alone does not count triangles.
  const indexed = mesh.getIndexedMeshArray().at(0);
  indexed.set_m_numTriangles(triangles);
  return { ...meshCollider(Ammo, mesh), heights, minHeight };
}

function triangleCollider(
  Ammo: typeof AmmoFactory,
  data: NonNullable<HeightfieldData['collisionMesh']>,
  correctEdgeContacts = false,
) {
  const mesh = new Ammo.btTriangleMesh(true);
  const vector = new Ammo.btVector3();
  for (let i = 0; i < data.positions.length; i += 3) {
    vector.setValue(data.positions[i], data.positions[i + 1], data.positions[i + 2]);
    mesh.findOrAddVertex(vector, false);
  }
  for (const index of data.indices) mesh.addIndex(index);
  mesh
    .getIndexedMeshArray()
    .at(0)
    .set_m_numTriangles(data.indices.length / 3);
  Ammo.destroy(vector);
  const collider = meshCollider(Ammo, mesh);
  if (correctEdgeContacts) {
    const normals = new Float32Array(data.indices.length);
    const a = new Vector3(),
      b = new Vector3(),
      c = new Vector3();
    for (let i = 0; i < data.indices.length; i += 3) {
      a.fromArray(data.positions, data.indices[i] * 3);
      b.fromArray(data.positions, data.indices[i + 1] * 3).sub(a);
      c.fromArray(data.positions, data.indices[i + 2] * 3).sub(a);
      b.cross(c).normalize().toArray(normals, i);
    }
    collider.body.setCollisionFlags(collider.body.getCollisionFlags() | customMaterialCallback);
    meshContactNormals.set(Ammo.getPointer(collider.body), normals);
  }
  return collider;
}

function meshCollider(Ammo: typeof AmmoFactory, mesh: AmmoFactory.btTriangleMesh) {
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
    body,
    dispose() {
      meshContactNormals.delete(Ammo.getPointer(body));
      Ammo.destroy(body);
      Ammo.destroy(motion);
      Ammo.destroy(shape);
      Ammo.destroy(mesh);
    },
  };
}
