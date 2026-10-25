import type { CourseDefinition } from './courses';

declare global {
  interface FileSystemDirectoryHandle {
    values(): AsyncIterableIterator<FileSystemDirectoryHandle | FileSystemFileHandle>;
  }
}

export const roadMapsDirectory = 'dorifto-road-maps';

export async function openRoadMaps() {
  if (!globalThis.isSecureContext || !navigator.storage?.getDirectory)
    throw new Error(
      'OPFS is unavailable. Use HTTPS or localhost in a supported browser, or download JSON.',
    );
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(roadMapsDirectory, { create: true });
}

export async function storeRoadMap(
  directory: FileSystemDirectoryHandle,
  course: CourseDefinition,
  json: Blob,
  existingFilename?: string,
  signal?: AbortSignal,
) {
  const slug =
    course.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'road';
  const filename = existingFilename ?? `${slug}-${course.id}.json`;
  const existed = (await listRoadMaps(directory)).some((file) => file.name === filename);
  signal?.throwIfAborted();
  const handle = await directory.getFileHandle(filename, { create: true });
  let writable: FileSystemWritableFileStream | undefined;
  try {
    writable = await handle.createWritable();
    signal?.throwIfAborted();
    await writable.write(json);
    signal?.throwIfAborted();
    await writable.close();
  } catch (error) {
    await writable?.abort().catch(console.error);
    if (!existed) await directory.removeEntry(filename);
    throw error;
  }
  return filename;
}

export async function listRoadMaps(directory: FileSystemDirectoryHandle) {
  const files: FileSystemFileHandle[] = [];
  for await (const handle of directory.values()) {
    if (handle.kind === 'file' && handle.name.endsWith('.json')) files.push(handle);
  }
  return files.sort((a, b) => a.name.localeCompare(b.name));
}
